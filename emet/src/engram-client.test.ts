import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import {
  type EngramChildProcess,
  type EngramClient,
  type EngramUnavailable,
  openEngramClient,
  type SpawnLike,
} from "./engram-client";
import { isObject } from "./narrow";

type Handler = (message: Record<string, unknown>, reply: (body: unknown) => void) => void;

interface FakeEngram {
  readonly spawn: SpawnLike;
  readonly calls: { command: string; args: readonly string[]; cwd: string }[];
  readonly state: { killed: boolean; stdinEnded: boolean };
  readonly requests: Record<string, unknown>[];
  emitRaw(text: string): void;
}

function toolResult(payload: unknown, isError = false): unknown {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function fakeEngram(onTool: Handler, options: { silent?: boolean } = {}): FakeEngram {
  const calls: FakeEngram["calls"] = [];
  const requests: Record<string, unknown>[] = [];
  const state = { killed: false, stdinEnded: false };
  const stdout = new EventEmitter();
  const emitRaw = (text: string): void => {
    stdout.emit("data", Buffer.from(text));
  };
  const respond = (id: unknown, result: unknown): void => {
    emitRaw(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  };
  const fakeChild: EngramChildProcess = {
    stdin: {
      write(chunk: string) {
        if (options.silent === true) return;
        for (const line of chunk.split("\n").filter((part) => part !== "")) {
          const parsed: unknown = JSON.parse(line);
          if (!isObject(parsed)) continue;
          const message = parsed;
          requests.push(message);
          if (message.method === "initialize") {
            emitRaw('{"jsonrpc":"2.0","method":"notifications/tools/list_changed"}\n');
            respond(message.id, { protocolVersion: "2024-11-05" });
          } else if (message.method === "tools/call") {
            onTool(message, (body) => {
              respond(message.id, body);
            });
          }
        }
      },
      end() {
        state.stdinEnded = true;
      },
    },
    stdout: { on: (_event, listener) => stdout.on("data", listener) },
    on: () => undefined,
    kill() {
      state.killed = true;
    },
  };
  const spawn: SpawnLike = (command, args, spawnOptions) => {
    calls.push({ command, args, cwd: spawnOptions.cwd });
    return fakeChild;
  };
  return { spawn, calls, state, requests, emitRaw };
}

async function rejectionOf(promise: Promise<unknown>): Promise<string> {
  const failure = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  return failure instanceof Error ? failure.message : "did not reject";
}

function expectClient(value: EngramClient | EngramUnavailable): EngramClient {
  if ("kind" in value) throw new Error(`unavailable: ${value.reason}`);
  return value;
}

function expectUnavailable(value: EngramClient | EngramUnavailable): EngramUnavailable {
  if (!("kind" in value)) throw new Error("expected unavailable");
  return value;
}

const OBSERVATION = {
  result:
    "#7 [learning] emet lessons: emet spec-12\n- first\nSession: inside content\n- second\nSession: abc\nProject: emet\nScope: project\nTopic: emet/emet/lessons/spec-12\nCreated: now",
};

describe("openEngramClient", () => {
  test("spawns engram mcp in the repo root and parses compact search results", async () => {
    const fake = fakeEngram((_message, reply) => {
      reply(
        toolResult({
          results: [
            { id: 1, title: "a", topic_key: "emet/emet/lessons/x", preview: "p1" },
            { id: 2, title: "b", preview: "p2" },
          ],
        }),
      );
    });
    const client = expectClient(await openEngramClient("/repo", { spawn: fake.spawn }));
    const results = await client.search("hello", 5);
    expect(results).toEqual([
      { id: 1, title: "a", topicKey: "emet/emet/lessons/x", preview: "p1" },
      { id: 2, title: "b", topicKey: null, preview: "p2" },
    ]);
    expect(fake.calls).toEqual([
      { command: "engram", args: ["mcp", "--tools=agent"], cwd: "/repo" },
    ]);
    const searchCall = fake.requests.find((request) => request.method === "tools/call");
    expect(searchCall?.params).toEqual({
      name: "mem_search",
      arguments: { query: "hello", limit: 5, response_format: "compact", match_mode: "any" },
    });
    expect(JSON.stringify(fake.requests)).not.toContain("project");
    client.close();
    expect(fake.state.stdinEnded).toBe(true);
    expect(fake.state.killed).toBe(true);
  });

  test("resolves unavailable and kills the child when the handshake never answers", async () => {
    const fake = fakeEngram(() => undefined, { silent: true });
    const result = expectUnavailable(
      await openEngramClient("/repo", { spawn: fake.spawn, timeoutMs: 30 }),
    );
    expect(result.reason).toContain("did not answer");
    expect(fake.state.killed).toBe(true);
  });

  test("resolves unavailable when spawn throws", async () => {
    const result = expectUnavailable(
      await openEngramClient("/repo", {
        spawn: () => {
          throw new Error("ENOENT");
        },
      }),
    );
    expect(result.reason).toContain("ENOENT");
  });

  test("a call that never answers rejects and kills the child", async () => {
    const fake = fakeEngram(() => undefined);
    const client = expectClient(
      await openEngramClient("/repo", { spawn: fake.spawn, timeoutMs: 30 }),
    );
    expect(await rejectionOf(client.search("x", 1))).toContain("did not answer");
    expect(fake.state.killed).toBe(true);
  });

  test("get splits the header, content and metadata footer", async () => {
    const fake = fakeEngram((_message, reply) => {
      reply(toolResult(OBSERVATION));
    });
    const client = expectClient(await openEngramClient("/repo", { spawn: fake.spawn }));
    expect(await client.get(7)).toEqual({
      id: 7,
      title: "emet lessons: emet spec-12",
      content: "- first\nSession: inside content\n- second",
      topicKey: "emet/emet/lessons/spec-12",
    });
    client.close();
  });

  test("save sends topic_key and type without a project", async () => {
    const fake = fakeEngram((_message, reply) => {
      reply(toolResult({ result: "saved" }));
    });
    const client = expectClient(await openEngramClient("/repo", { spawn: fake.spawn }));
    await client.save({ title: "t", content: "c", type: "learning", topicKey: "k" });
    const call = fake.requests.find((request) => request.method === "tools/call");
    expect(call?.params).toEqual({
      name: "mem_save",
      arguments: { title: "t", content: "c", type: "learning", topic_key: "k" },
    });
    client.close();
  });

  test("an isError tool result rejects with the engram message", async () => {
    const fake = fakeEngram((_message, reply) => {
      reply(toolResult({ message: "ambiguous project" }, true));
    });
    const client = expectClient(await openEngramClient("/repo", { spawn: fake.spawn }));
    expect(await rejectionOf(client.search("x", 1))).toContain("ambiguous project");
    client.close();
  });

  test("results: null is a failure, not a crash", async () => {
    const fake = fakeEngram((_message, reply) => {
      reply(toolResult({ results: null }));
    });
    const client = expectClient(await openEngramClient("/repo", { spawn: fake.spawn }));
    expect(await rejectionOf(client.search("x", 1))).toContain("no results");
    client.close();
  });

  test("malformed JSON in a tool result rejects", async () => {
    const fake = fakeEngram((_message, reply) => {
      reply(toolResult("not json"));
    });
    const client = expectClient(await openEngramClient("/repo", { spawn: fake.spawn }));
    expect(await rejectionOf(client.search("x", 1))).toContain("malformed JSON");
    client.close();
  });

  test("notifications and non-JSON lines before the response are ignored", async () => {
    const fake = fakeEngram((_message, reply) => {
      fake.emitRaw("warning: noisy line\n");
      fake.emitRaw('{"jsonrpc":"2.0","method":"notifications/message","params":{}}\n');
      reply(toolResult({ results: [] }));
    });
    const client = expectClient(await openEngramClient("/repo", { spawn: fake.spawn }));
    expect(await client.search("x", 1)).toEqual([]);
    client.close();
  });
});

describe("openEngramClient PATH resolution", () => {
  test("reports engram is not on PATH when the binary is missing", async () => {
    const original = process.env.PATH;
    process.env.PATH = "/nonexistent-emet-test-dir";
    try {
      const result = expectUnavailable(await openEngramClient("/repo"));
      expect(result.reason).toBe("engram is not on PATH");
    } finally {
      process.env.PATH = original;
    }
  });
});
