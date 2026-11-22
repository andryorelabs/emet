import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { DEFAULT_FORGE_CONFIG, type ForgeConfig } from "./config";
import type { EngramClient, EngramUnavailable } from "./engram-client";
import { exitCodes } from "./exit-codes";
import { mergeNote, run, type MemoryDeps } from "./memory";

interface Note {
  id: number;
  title: string;
  topicKey: string | null;
  content: string;
}

interface FakeClient extends EngramClient {
  readonly saved: { title: string; content: string; type: string; topicKey: string }[];
  closed: boolean;
}

function fakeClient(notes: Note[], options: { saveError?: string } = {}): FakeClient {
  const saved: FakeClient["saved"] = [];
  const client: FakeClient = {
    saved,
    closed: false,
    search: () =>
      Promise.resolve(
        notes.map((note) => ({
          id: note.id,
          title: note.title,
          topicKey: note.topicKey,
          preview: "",
        })),
      ),
    get: (id) => {
      const note = notes.find((candidate) => candidate.id === id);
      if (note === undefined) return Promise.reject(new Error("no such note"));
      return Promise.resolve({ ...note });
    },
    save: (input) => {
      if (options.saveError !== undefined) return Promise.reject(new Error(options.saveError));
      saved.push(input);
      return Promise.resolve();
    },
    close: () => {
      client.closed = true;
    },
  };
  return client;
}

const fixedDate = new Date("2026-11-22T10:00:00.000Z");

function depsFor(
  opened: EngramClient | EngramUnavailable,
  extra: Partial<MemoryDeps> = {},
): Partial<MemoryDeps> {
  return {
    resolveRepoRoot: () => Promise.resolve("/repo"),
    loadConfig: () => Promise.resolve(DEFAULT_FORGE_CONFIG),
    openClient: () => Promise.resolve(opened),
    readStdin: () => Promise.resolve(""),
    repoName: () => Promise.resolve("emet"),
    now: () => fixedDate,
    ...extra,
  };
}

let lines: string[];
let errors: string[];
let originalExitCode: typeof process.exitCode;
let logSpy: { mockRestore: () => void };
let errorSpy: { mockRestore: () => void };

beforeEach(() => {
  lines = [];
  errors = [];
  originalExitCode = process.exitCode;
  process.exitCode = 0;
  logSpy = spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    lines.push(parts.join(" "));
  });
  errorSpy = spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    errors.push(parts.join(" "));
  });
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  process.exitCode = originalExitCode;
});

function printed(): unknown {
  return JSON.parse(lines.join("\n"));
}

describe("memory search", () => {
  test("keeps only this repo's lessons and prints their full content", async () => {
    const client = fakeClient([
      { id: 1, title: "other", topicKey: "emet/other/lessons/spec-1", content: "no" },
      { id: 2, title: "mine", topicKey: "emet/emet/lessons/spec-841", content: "full body" },
      { id: 3, title: "loose", topicKey: null, content: "no" },
    ]);
    await run(["search", "feature", "title"], depsFor(client));
    expect(printed()).toEqual({
      available: true,
      results: [
        { id: 2, topicKey: "emet/emet/lessons/spec-841", title: "mine", content: "full body" },
      ],
    });
    expect(client.closed).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  test("truncates content to 2000 characters", async () => {
    const client = fakeClient([
      { id: 2, title: "t", topicKey: "emet/emet/lessons/spec-1", content: "x".repeat(5000) },
    ]);
    await run(["search", "q"], depsFor(client));
    expect(JSON.stringify(printed())).toContain(`"content":"${"x".repeat(2000)}"`);
    expect(JSON.stringify(printed())).not.toContain("x".repeat(2001));
  });

  test("an unavailable engram prints available false and exits 0", async () => {
    await run(["search", "x"], depsFor({ kind: "unavailable", reason: "engram is not on PATH" }));
    expect(printed()).toEqual({ available: false, reason: "engram is not on PATH" });
    expect(process.exitCode).toBe(0);
  });

  test("a failure after the handshake prints empty results and the reason", async () => {
    const client = fakeClient([]);
    client.search = () => Promise.reject(new Error("boom"));
    await run(["search", "x"], depsFor(client));
    expect(printed()).toEqual({ available: true, results: [], reason: "boom" });
    expect(process.exitCode).toBe(0);
  });

  test("memory.enabled off never opens a client", async () => {
    const config: ForgeConfig = { ...DEFAULT_FORGE_CONFIG, memory: { enabled: "off" } };
    let opened = false;
    await run(
      ["search", "x"],
      depsFor(fakeClient([]), {
        loadConfig: () => Promise.resolve(config),
        openClient: () => {
          opened = true;
          return Promise.resolve(fakeClient([]));
        },
      }),
    );
    expect(opened).toBe(false);
    expect(printed()).toEqual({ available: false, reason: "memory.enabled is off" });
  });

  test.each([
    [[]],
    [["search"]],
    [["search", "x", "--limit", "21"]],
    [["search", "x", "--limit", "abc"]],
    [["nope"]],
  ])("usage error %j exits 2", async (argv) => {
    await run(argv, depsFor(fakeClient([])));
    expect(process.exitCode).toBe(exitCodes.usage);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("memory save", () => {
  const flags = ["save", "--key", "spec-12", "--run", "r2", "--outcome", "landed"];

  test("appends a section to an existing note under the same topic key", async () => {
    const existing = "# emet lessons: emet spec-12\n\n## r1 — hold (2026-11-01)\n- first";
    const client = fakeClient([
      { id: 9, title: "t", topicKey: "emet/emet/lessons/spec-12", content: existing },
      { id: 10, title: "t", topicKey: "emet/emet/lessons/spec-13", content: "other" },
    ]);
    await run(flags, depsFor(client, { readStdin: () => Promise.resolve("- a\n- b\n") }));
    expect(printed()).toEqual({
      available: true,
      saved: true,
      topicKey: "emet/emet/lessons/spec-12",
    });
    const [saved] = client.saved;
    expect(saved?.type).toBe("learning");
    expect(saved?.title).toBe("emet lessons: emet spec-12");
    expect(saved?.topicKey).toBe("emet/emet/lessons/spec-12");
    expect(saved?.content).toBe(`${existing}\n\n## r2 — landed (2026-11-22)\n- a\n- b`);
  });

  test("starts a new note when none exists", async () => {
    const client = fakeClient([]);
    await run(flags, depsFor(client, { readStdin: () => Promise.resolve("- only") }));
    expect(client.saved[0]?.content).toBe(
      "# emet lessons: emet spec-12\n\n## r2 — landed (2026-11-22)\n- only",
    );
  });

  test("an MCP error prints saved false with the reason and exits 0", async () => {
    const client = fakeClient([], { saveError: "disk full" });
    await run(flags, depsFor(client, { readStdin: () => Promise.resolve("- x") }));
    expect(printed()).toEqual({ available: true, saved: false, reason: "disk full" });
    expect(process.exitCode).toBe(0);
  });

  test("an unavailable engram prints available false", async () => {
    await run(
      flags,
      depsFor(
        { kind: "unavailable", reason: "engram is not on PATH" },
        { readStdin: () => Promise.resolve("- x") },
      ),
    );
    expect(printed()).toEqual({ available: false, reason: "engram is not on PATH" });
  });

  test("memory.enabled off saves nothing and exits 0", async () => {
    const config: ForgeConfig = { ...DEFAULT_FORGE_CONFIG, memory: { enabled: "off" } };
    let opened = false;
    await run(
      flags,
      depsFor(fakeClient([]), {
        readStdin: () => Promise.resolve("- x"),
        loadConfig: () => Promise.resolve(config),
        openClient: () => {
          opened = true;
          return Promise.resolve(fakeClient([]));
        },
      }),
    );
    expect(opened).toBe(false);
    expect(printed()).toEqual({ available: false, reason: "memory.enabled is off" });
    expect(process.exitCode).toBe(0);
  });

  const tooMany = Array.from({ length: 6 }, (_, index) => `- b${index}`).join("\n");
  test.each([
    ["no bullets", flags, ""],
    ["a non-bullet line", flags, "not a bullet"],
    ["too many bullets", flags, tooMany],
    ["a long bullet", flags, `- ${"x".repeat(301)}`],
    ["an unknown outcome", ["save", "--key", "spec-12", "--run", "r2", "--outcome", "won"], "- x"],
    ["a bad key", ["save", "--key", "bad key", "--run", "r2", "--outcome", "hold"], "- x"],
    ["no run", ["save", "--key", "spec-12", "--outcome", "hold"], "- x"],
  ])("bad usage (%s) exits 2 and never opens a client", async (_name, argv, stdin) => {
    let opened = false;
    await run(
      argv,
      depsFor(fakeClient([]), {
        readStdin: () => Promise.resolve(stdin),
        openClient: () => {
          opened = true;
          return Promise.resolve(fakeClient([]));
        },
      }),
    );
    expect(process.exitCode).toBe(exitCodes.usage);
    expect(opened).toBe(false);
  });
});

const old = (name: string): string => `## ${name}\n${"x".repeat(11_000)}`;

describe("mergeNote", () => {
  test("drops the oldest sections past 20000 characters", () => {
    const merged = mergeNote(`# head\n\n${old("r1")}\n\n${old("r2")}`, `## r3\n- new`, "# unused");
    expect(merged.length).toBeLessThanOrEqual(20_000);
    expect(merged).not.toContain("## r1");
    expect(merged).toContain("## r2");
    expect(merged.endsWith("## r3\n- new")).toBe(true);
    expect(merged.startsWith("# head")).toBe(true);
  });
});
