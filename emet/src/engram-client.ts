import { spawn as nodeSpawn } from "node:child_process";

import { resolveBinaryOnPath } from "./dependencies";
import { errorMessage, isObject } from "./narrow";

const DEFAULT_TIMEOUT_MS = 10_000;
const PROTOCOL_VERSION = "2024-11-05";
const CLIENT_INFO = { name: "emet", version: "0" };

export interface EngramUnavailable {
  readonly kind: "unavailable";
  readonly reason: string;
}

interface EngramCompactResult {
  id: number;
  title: string;
  topicKey: string | null;
  preview: string;
}

export interface EngramClient {
  search(query: string, limit: number): Promise<EngramCompactResult[]>;
  get(id: number): Promise<{ id: number; title: string; content: string; topicKey: string | null }>;
  save(input: {
    title: string;
    content: string;
    type: "learning";
    topicKey: string;
  }): Promise<void>;
  close(): void;
}

/** The slice of a child process the client drives; a Node `ChildProcess` satisfies it. */
export interface EngramChildProcess {
  readonly stdin: { write(chunk: string): unknown; end(): unknown } | null;
  readonly stdout: {
    on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  } | null;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit" | "close", listener: (code: number | null) => void): unknown;
  kill(): unknown;
}

export type SpawnLike = (
  command: string,
  args: readonly string[],
  options: { readonly cwd: string },
) => EngramChildProcess;

export interface OpenEngramClientOptions {
  readonly timeoutMs?: number;
  readonly spawn?: SpawnLike;
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

const defaultSpawn: SpawnLike = (command, args, options) =>
  nodeSpawn(command, [...args], { cwd: options.cwd, stdio: ["pipe", "pipe", "ignore"] });

/** The text of the first `text` content block of an MCP tool result. */
function toolText(result: unknown): string {
  if (!isObject(result)) {
    throw new Error("engram returned a malformed tool result");
  }
  const blocks = Array.isArray(result.content) ? result.content : [];
  const texts: string[] = [];
  for (const block of blocks) {
    if (isObject(block) && typeof block.text === "string") {
      texts.push(block.text);
    }
  }
  const text = texts.join("\n");
  if (result.isError === true) {
    throw new Error(text === "" ? "engram tool call failed" : errorReason(text));
  }
  return text;
}

/** Engram reports tool errors as JSON with a `message`; fall back to the raw text. */
function errorReason(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (isObject(parsed) && typeof parsed.message === "string" && parsed.message !== "") {
      return parsed.message;
    }
  } catch {
    return text;
  }
  return text;
}

function parseJsonObject(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("engram returned malformed JSON");
  }
  if (!isObject(parsed)) {
    throw new Error("engram returned malformed JSON");
  }
  return parsed;
}

function toCompactResult(value: unknown): EngramCompactResult {
  if (!isObject(value) || typeof value.id !== "number") {
    throw new Error("engram returned a malformed search result");
  }
  return {
    id: value.id,
    title: typeof value.title === "string" ? value.title : "",
    topicKey:
      typeof value.topic_key === "string" && value.topic_key !== "" ? value.topic_key : null,
    preview: typeof value.preview === "string" ? value.preview : "",
  };
}

const OBSERVATION_FOOTER = "\nSession: ";

/**
 * `mem_get_observation` answers with a text block: a `#<id> [<type>] <title>`
 * header line, the full content, then `Session:`/`Project:`/`Scope:`/`Topic:`
 * metadata lines. The footer is found from the end so a `Session:` line inside
 * the content survives.
 */
function parseObservation(
  id: number,
  text: string,
): { id: number; title: string; content: string; topicKey: string | null } {
  const rendered = parseJsonObject(text).result;
  if (typeof rendered !== "string") {
    throw new Error("engram returned a malformed observation");
  }
  const headerEnd = rendered.indexOf("\n");
  const header = headerEnd === -1 ? rendered : rendered.slice(0, headerEnd);
  const title = header.replace(/^#\d+\s+\[[^\]]*\]\s*/, "");
  const footerStart = rendered.lastIndexOf(OBSERVATION_FOOTER);
  const body =
    headerEnd === -1
      ? ""
      : rendered.slice(headerEnd + 1, footerStart === -1 ? undefined : footerStart);
  const footer = footerStart === -1 ? "" : rendered.slice(footerStart);
  const topicMatch = /^Topic: (.+)$/m.exec(footer);
  return { id, title, content: body, topicKey: topicMatch?.[1]?.trim() ?? null };
}

class StdioEngramClient implements EngramClient {
  private nextId = 1;
  private buffer = "";
  private closed = false;
  private readonly pending = new Map<number, PendingRequest>();

  private readonly child: EngramChildProcess;
  private readonly timeoutMs: number;

  constructor(child: EngramChildProcess, timeoutMs: number) {
    this.child = child;
    this.timeoutMs = timeoutMs;
    child.stdout?.on("data", (chunk) => {
      this.buffer += chunk.toString();
      this.drainLines();
    });
    child.on("error", (error) => {
      this.failAll(new Error(`engram failed to run: ${error.message}`));
    });
    child.on("close", () => {
      this.failAll(new Error("engram exited before answering"));
    });
  }

  private drainLines(): void {
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line !== "") {
        this.handleLine(line);
      }
      newline = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!isObject(message) || typeof message.id !== "number") {
      return;
    }
    const request = this.pending.get(message.id);
    if (request === undefined) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(request.timer);
    if (isObject(message.error)) {
      const reason =
        typeof message.error.message === "string" ? message.error.message : "engram request failed";
      request.reject(new Error(reason));
      return;
    }
    request.resolve(message.result);
  }

  private failAll(error: Error): void {
    for (const [id, request] of this.pending) {
      clearTimeout(request.timer);
      this.pending.delete(id);
      request.reject(error);
    }
  }

  private write(message: Record<string, unknown>): void {
    this.child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error("engram client is closed"));
    }
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.close();
        reject(new Error(`engram did not answer within ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error: unknown) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(new Error(`engram write failed: ${errorMessage(error)}`));
      }
    });
  }

  notify(method: string): void {
    this.write({ method });
  }

  async handshake(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
    this.notify("notifications/initialized");
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    return toolText(await this.request("tools/call", { name, arguments: args }));
  }

  async search(query: string, limit: number): Promise<EngramCompactResult[]> {
    const text = await this.callTool("mem_search", {
      query,
      limit,
      response_format: "compact",
      match_mode: "any",
    });
    const results = parseJsonObject(text).results;
    if (!Array.isArray(results)) {
      throw new Error("engram returned no results");
    }
    return results.map(toCompactResult);
  }

  async get(
    id: number,
  ): Promise<{ id: number; title: string; content: string; topicKey: string | null }> {
    return parseObservation(id, await this.callTool("mem_get_observation", { id }));
  }

  async save(input: {
    title: string;
    content: string;
    type: "learning";
    topicKey: string;
  }): Promise<void> {
    await this.callTool("mem_save", {
      title: input.title,
      content: input.content,
      type: input.type,
      topic_key: input.topicKey,
    });
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.failAll(new Error("engram client is closed"));
    try {
      this.child.stdin?.end();
    } catch {
      this.child.kill();
    }
    this.child.kill();
  }
}

/**
 * Spawns `engram mcp --tools=agent` in `repoRoot` and completes the MCP
 * handshake. Never throws: a missing binary, a spawn error, a failed handshake
 * or a timeout all resolve to {@link EngramUnavailable}. No `project` is ever
 * passed to Engram, so its own project detection applies.
 */
export async function openEngramClient(
  repoRoot: string,
  options: OpenEngramClientOptions = {},
): Promise<EngramClient | EngramUnavailable> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (options.spawn === undefined && !(await resolveBinaryOnPath("engram"))) {
    return { kind: "unavailable", reason: "engram is not on PATH" };
  }
  const spawn = options.spawn ?? defaultSpawn;
  let child: EngramChildProcess;
  try {
    child = spawn("engram", ["mcp", "--tools=agent"], { cwd: repoRoot });
  } catch (error: unknown) {
    return { kind: "unavailable", reason: `engram failed to start: ${errorMessage(error)}` };
  }
  const client = new StdioEngramClient(child, timeoutMs);
  try {
    await client.handshake();
  } catch (error: unknown) {
    client.close();
    return { kind: "unavailable", reason: errorMessage(error) };
  }
  return client;
}
