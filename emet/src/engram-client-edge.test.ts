import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type EngramChildProcess,
  type EngramClient,
  type EngramUnavailable,
  openEngramClient,
} from "./engram-client";
import { isObject } from "./narrow";

interface ScriptedChild {
  readonly child: EngramChildProcess;
  readonly state: { killed: boolean };
  emitError(error: Error): void;
  emitClose(): void;
  emitRaw(text: string): void;
}

interface ScriptOptions {
  readonly onCall: (reply: (body: unknown) => void, message: Record<string, unknown>) => void;
  readonly writeThrowsAfterHandshake?: boolean;
  readonly endThrows?: boolean;
  readonly ignoreInitialize?: boolean;
}

function scriptedChild(options: ScriptOptions): ScriptedChild {
  const state = { killed: false };
  const listeners: {
    data: (chunk: Buffer | string) => void;
    error: (value: never) => void;
    close: (value: never) => void;
  } = { data: () => undefined, error: () => undefined, close: () => undefined };
  let handshaken = false;
  const respond = (id: unknown, result: unknown): void => {
    listeners.data(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  };
  const child: EngramChildProcess = {
    stdin: {
      write(chunk: string) {
        if (handshaken && options.writeThrowsAfterHandshake === true) {
          throw new Error("EPIPE");
        }
        for (const line of chunk.split("\n").filter((part) => part !== "")) {
          const parsed: unknown = JSON.parse(line);
          if (!isObject(parsed)) continue;
          if (parsed.method === "initialize") {
            if (options.ignoreInitialize !== true) respond(parsed.id, {});
          } else if (parsed.method === "notifications/initialized") {
            handshaken = true;
          } else if (parsed.method === "tools/call") {
            options.onCall((body) => {
              if (isObject(body) && "rpcError" in body) {
                listeners.data(
                  `${JSON.stringify({ jsonrpc: "2.0", id: parsed.id, error: body.rpcError })}\n`,
                );
                return;
              }
              respond(parsed.id, body);
            }, parsed);
          }
        }
      },
      end() {
        if (options.endThrows === true) throw new Error("already closed");
      },
    },
    stdout: {
      on: (_event, listener) => {
        listeners.data = listener;
      },
    },
    on: (event: string, listener: (value: never) => void) => {
      if (event === "error") listeners.error = listener;
      if (event === "close") listeners.close = listener;
    },
    kill() {
      state.killed = true;
    },
  };
  return {
    child,
    state,
    emitError: (error) => {
      Reflect.apply(listeners.error, undefined, [error]);
    },
    emitClose: () => {
      Reflect.apply(listeners.close, undefined, [null]);
    },
    emitRaw: (text) => {
      listeners.data(text);
    },
  };
}

function expectClient(value: EngramClient | EngramUnavailable): EngramClient {
  if ("kind" in value) throw new Error(`unavailable: ${value.reason}`);
  return value;
}

async function rejectionOf(promise: Promise<unknown>): Promise<string> {
  const failure = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  return failure instanceof Error ? failure.message : "did not reject";
}

async function open(
  options: ScriptOptions,
): Promise<{ client: EngramClient; fake: ScriptedChild }> {
  const fake = scriptedChild(options);
  const client = expectClient(await openEngramClient("/repo", { spawn: () => fake.child }));
  return { client, fake };
}

const textResult = (text: string, isError = false): unknown => ({
  content: [{ type: "text", text }],
  ...(isError ? { isError: true } : {}),
});

describe("engram client failure modes", () => {
  test("a child error fails the pending call", async () => {
    const { client, fake } = await open({ onCall: () => undefined });
    const pending = rejectionOf(client.search("x", 1));
    fake.emitError(new Error("spawn EACCES"));
    expect(await pending).toBe("engram failed to run: spawn EACCES");
  });

  test("a child that exits fails the pending call", async () => {
    const { client, fake } = await open({ onCall: () => undefined });
    const pending = rejectionOf(client.search("x", 1));
    fake.emitClose();
    expect(await pending).toBe("engram exited before answering");
  });

  test("a JSON-RPC error carries its message", async () => {
    const { client } = await open({
      onCall: (reply) => {
        reply({ rpcError: { message: "tool exploded" } });
      },
    });
    expect(await rejectionOf(client.search("x", 1))).toBe("tool exploded");
  });

  test("a JSON-RPC error without a message gets a generic reason", async () => {
    const { client } = await open({
      onCall: (reply) => {
        reply({ rpcError: { code: -1 } });
      },
    });
    expect(await rejectionOf(client.search("x", 1))).toBe("engram request failed");
  });

  test("a malformed tool result rejects", async () => {
    const { client } = await open({
      onCall: (reply) => {
        reply(null);
      },
    });
    expect(await rejectionOf(client.search("x", 1))).toBe(
      "engram returned a malformed tool result",
    );
  });

  test("a tool error without text gets a generic reason", async () => {
    const { client } = await open({
      onCall: (reply) => {
        reply({ content: [], isError: true });
      },
    });
    expect(await rejectionOf(client.search("x", 1))).toBe("engram tool call failed");
  });

  test("a tool error with plain text keeps the text", async () => {
    const { client } = await open({
      onCall: (reply) => {
        reply(textResult("not json at all", true));
      },
    });
    expect(await rejectionOf(client.search("x", 1))).toBe("not json at all");
  });

  test("a tool error whose JSON has no message keeps the raw text", async () => {
    const { client } = await open({
      onCall: (reply) => {
        reply(textResult('{"code":1}', true));
      },
    });
    expect(await rejectionOf(client.search("x", 1))).toBe('{"code":1}');
  });

  test("a search result without an id is malformed", async () => {
    const { client } = await open({
      onCall: (reply) => {
        reply(textResult(JSON.stringify({ results: [{ title: "no id" }] })));
      },
    });
    expect(await rejectionOf(client.search("x", 1))).toBe(
      "engram returned a malformed search result",
    );
  });

  test("a search result keeps a missing title and preview empty", async () => {
    const { client } = await open({
      onCall: (reply) => {
        reply(textResult(JSON.stringify({ results: [{ id: 4 }] })));
      },
    });
    expect(await client.search("x", 1)).toEqual([
      { id: 4, title: "", topicKey: null, preview: "" },
    ]);
  });

  test("an observation whose result is not text is malformed", async () => {
    const { client } = await open({
      onCall: (reply) => {
        reply(textResult(JSON.stringify({ result: 5 })));
      },
    });
    expect(await rejectionOf(client.get(1))).toBe("engram returned a malformed observation");
  });

  test("a header-only observation has empty content and no topic key", async () => {
    const { client } = await open({
      onCall: (reply) => {
        reply(textResult(JSON.stringify({ result: "#3 [learning] just a title" })));
      },
    });
    expect(await client.get(3)).toEqual({
      id: 3,
      title: "just a title",
      content: "",
      topicKey: null,
    });
  });

  test("a non-object tool payload is malformed JSON", async () => {
    const { client } = await open({
      onCall: (reply) => {
        reply(textResult("5"));
      },
    });
    expect(await rejectionOf(client.search("x", 1))).toBe("engram returned malformed JSON");
  });

  test("a response for an unknown id is ignored", async () => {
    const { client, fake } = await open({
      onCall: (reply) => {
        reply(textResult(JSON.stringify({ results: [] })));
      },
    });
    fake.emitRaw('{"jsonrpc":"2.0","id":999,"result":{}}\n');
    expect(await client.search("x", 1)).toEqual([]);
  });

  test("a call after close is rejected", async () => {
    const { client } = await open({ onCall: () => undefined });
    client.close();
    client.close();
    expect(await rejectionOf(client.search("x", 1))).toBe("engram client is closed");
  });

  test("a failing stdin write rejects the call", async () => {
    const { client } = await open({ onCall: () => undefined, writeThrowsAfterHandshake: true });
    expect(await rejectionOf(client.search("x", 1))).toBe("engram write failed: EPIPE");
  });

  test("close kills the child even when ending stdin throws", async () => {
    const { client, fake } = await open({ onCall: () => undefined, endThrows: true });
    client.close();
    expect(fake.state.killed).toBe(true);
  });

  test("a handshake failure reports the reason", async () => {
    const fake = scriptedChild({ onCall: () => undefined, ignoreInitialize: true });
    const result = await openEngramClient("/repo", {
      spawn: () => {
        queueMicrotask(() => {
          fake.emitClose();
        });
        return fake.child;
      },
    });
    expect("kind" in result && result.reason).toBe("engram exited before answering");
  });
});

describe("engram client with a real child process", () => {
  test("talks to an engram binary found on PATH", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "engram-bin-"));
    const original = process.env.PATH;
    try {
      const script = [
        "#!/bin/sh",
        "while IFS= read -r line; do",
        '  case "$line" in',
        '    *\\"initialize\\"*) printf \'{"jsonrpc":"2.0","id":1,"result":{}}\\n\' ;;',
        '    *tools/call*) printf \'{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\\\"results\\\\":[]}"}]}}\\n\' ;;',
        "  esac",
        "done",
      ].join("\n");
      const binary = path.join(directory, "engram");
      writeFileSync(binary, `${script}\n`);
      chmodSync(binary, 0o755);
      process.env.PATH = `${directory}:${original ?? ""}`;
      const client = expectClient(await openEngramClient(directory));
      expect(await client.search("x", 1)).toEqual([]);
      client.close();
    } finally {
      process.env.PATH = original;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
