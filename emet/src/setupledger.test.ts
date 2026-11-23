import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  RECOMMENDED_CLAUDE_SETTINGS,
  applyClaudeSettings,
  type ClaudeSettingsUndo,
} from "./settingsapply";
import {
  appendLedgerEntry,
  ledgerPath,
  readLedger,
  readUserMcpEntry,
  removeLedgerEntry,
  replaceLedgerEntry,
  restoreUndo,
  type LedgerEntry,
  type RestoreDeps,
  isRestorableId,
  type RestorableId,
} from "./setupledger";

let directory = "";
let ledgerFile = "";

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "emet-ledger-"));
  ledgerFile = path.join(directory, "state", "setup-ledger.json");
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function fakeDeps(exitCodes: Record<string, number> = {}): {
  deps: RestoreDeps;
  calls: string[][];
  lines: string[];
} {
  const calls: string[][] = [];
  const lines: string[] = [];
  const deps: RestoreDeps = {
    run: (argv) => {
      calls.push([...argv]);
      return Promise.resolve(exitCodes[argv.slice(0, 3).join(" ")] ?? 0);
    },
    now: () => new Date("2026-11-20T01:02:03.004Z"),
    log: (line) => {
      lines.push(line);
    },
  };
  return { deps, calls, lines };
}

async function rejectionOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a rejection");
}

const pluginEntry: LedgerEntry = {
  id: "mascot",
  at: "2026-11-20T00:00:00.000Z",
  undo: [{ kind: "plugin", pluginId: "emet-mascot@emet-marketplace" }],
};

describe("isRestorableId", () => {
  test("accepts only claude-settings and firecrawl-local", () => {
    const accepted: RestorableId[] = ["claude-settings", "firecrawl-local"];
    expect(accepted.every((id) => isRestorableId(id))).toBe(true);
    expect(isRestorableId("context7")).toBe(false);
  });
});

describe("ledgerPath", () => {
  test("honours EMET_STATE_DIR, then XDG_STATE_HOME", () => {
    expect(ledgerPath({ EMET_STATE_DIR: "/s" })).toBe("/s/setup-ledger.json");
    expect(ledgerPath({ XDG_STATE_HOME: "/x" })).toBe("/x/emet/setup-ledger.json");
  });
});

describe("ledger read and write", () => {
  test("an absent ledger reads as empty", () => {
    expect(readLedger(ledgerFile)).toEqual([]);
  });

  test("appends entries atomically and keeps the first entry of an id", () => {
    appendLedgerEntry(ledgerFile, pluginEntry);
    appendLedgerEntry(ledgerFile, { ...pluginEntry, at: "later", undo: [] });
    appendLedgerEntry(ledgerFile, {
      id: "context7",
      at: "2026-11-20T00:00:01.000Z",
      undo: [{ kind: "global-package", manager: "bun", name: "ctx7" }],
    });
    expect(readLedger(ledgerFile).map((entry) => [entry.id, entry.at])).toEqual([
      ["mascot", pluginEntry.at],
      ["context7", "2026-11-20T00:00:01.000Z"],
    ]);
    expect(readdirSync(path.dirname(ledgerFile))).toEqual(["setup-ledger.json"]);
  });

  test("removes an entry by id and ignores an unknown id", () => {
    appendLedgerEntry(ledgerFile, pluginEntry);
    const before = readFileSync(ledgerFile, "utf8");
    removeLedgerEntry(ledgerFile, "nope");
    expect(readFileSync(ledgerFile, "utf8")).toBe(before);
    removeLedgerEntry(ledgerFile, "mascot");
    expect(readLedger(ledgerFile)).toEqual([]);
    removeLedgerEntry(path.join(directory, "absent.json"), "mascot");
    expect(existsSync(path.join(directory, "absent.json"))).toBe(false);
  });

  test("replaces an entry in place with one write and ignores an unknown id", () => {
    appendLedgerEntry(ledgerFile, pluginEntry);
    appendLedgerEntry(ledgerFile, { ...pluginEntry, id: "context7" });
    const replacement: LedgerEntry = { ...pluginEntry, undo: [] };
    replaceLedgerEntry(ledgerFile, replacement);
    expect(readLedger(ledgerFile).map((entry) => [entry.id, entry.undo.length])).toEqual([
      ["mascot", 0],
      ["context7", pluginEntry.undo.length],
    ]);
    const before = readFileSync(ledgerFile, "utf8");
    replaceLedgerEntry(ledgerFile, { ...pluginEntry, id: "nope" });
    expect(readFileSync(ledgerFile, "utf8")).toBe(before);
  });

  test("a failed replace write keeps the entry and its records in the ledger", () => {
    appendLedgerEntry(ledgerFile, pluginEntry);
    const before = readFileSync(ledgerFile, "utf8");
    const stateDirectory = path.dirname(ledgerFile);
    chmodSync(stateDirectory, 0o500);
    try {
      expect(() => {
        replaceLedgerEntry(ledgerFile, { ...pluginEntry, undo: [] });
      }).toThrow();
    } finally {
      chmodSync(stateDirectory, 0o700);
    }
    expect(readFileSync(ledgerFile, "utf8")).toBe(before);
  });

  test("a malformed ledger is an error naming its path and is left alone", () => {
    appendLedgerEntry(ledgerFile, pluginEntry);
    for (const body of [
      "{nope",
      "[]",
      JSON.stringify({ version: 1, entries: [{ id: "x", at: "y", undo: [{ kind: "bad" }] }] }),
      JSON.stringify({ version: 2, entries: [] }),
    ]) {
      writeFileSync(ledgerFile, body);
      expect(() => readLedger(ledgerFile)).toThrow(ledgerFile);
      expect(() => {
        appendLedgerEntry(ledgerFile, pluginEntry);
      }).toThrow(ledgerFile);
      expect(() => {
        removeLedgerEntry(ledgerFile, "x");
      }).toThrow(ledgerFile);
      expect(readFileSync(ledgerFile, "utf8")).toBe(body);
    }
  });

  test("round-trips every undo record kind", () => {
    const entry: LedgerEntry = {
      id: "all",
      at: "now",
      undo: [
        {
          kind: "claude-settings",
          settingsPath: "/s.json",
          previousModel: null,
          addedDeny: ["Read(./.env)"],
          setModel: "opusplan",
          backupPath: "",
        },
        { kind: "mcp-entry", name: "firecrawl-local", previousEntry: { command: "x" } },
        { kind: "mcp-entry", name: "firecrawl-local", previousEntry: null },
        { kind: "plugin", pluginId: "p@m" },
        { kind: "files", paths: ["/a", "/b"] },
        { kind: "global-package", manager: "brew", name: "engram" },
        { kind: "global-package", manager: "cargo", name: "firecrawl-local" },
      ],
    };
    appendLedgerEntry(ledgerFile, entry);
    expect(readLedger(ledgerFile)).toEqual([entry]);
  });
});

describe("readUserMcpEntry", () => {
  test("reads the user-scope entry, or null when absent", () => {
    const body = JSON.stringify({ mcpServers: { "firecrawl-local": { command: "fc", args: [] } } });
    expect(readUserMcpEntry(body, "firecrawl-local")).toEqual({ command: "fc", args: [] });
    expect(readUserMcpEntry(body, "other")).toBeNull();
    expect(readUserMcpEntry(undefined, "firecrawl-local")).toBeNull();
    expect(readUserMcpEntry("{}", "firecrawl-local")).toBeNull();
    expect(() => readUserMcpEntry("{nope", "firecrawl-local")).toThrow(".claude.json");
  });
});

describe("restoreUndo", () => {
  test("re-adds the previous MCP entry after removing emet's", async () => {
    const { deps, calls } = fakeDeps();
    const previousEntry = { type: "stdio", command: "firecrawl-local", env: { A: "1" } };
    const result = await restoreUndo(
      { kind: "mcp-entry", name: "firecrawl-local", previousEntry },
      deps,
    );
    expect(result.warnings).toEqual([]);
    expect(calls).toEqual([
      ["claude", "mcp", "remove", "firecrawl-local", "-s", "user"],
      ["claude", "mcp", "add-json", "firecrawl-local", JSON.stringify(previousEntry), "-s", "user"],
    ]);
  });

  test("only removes emet's MCP entry when none was recorded, warning on a failed remove", async () => {
    const { deps, calls } = fakeDeps({ "claude mcp remove": 1 });
    const result = await restoreUndo(
      { kind: "mcp-entry", name: "firecrawl-local", previousEntry: null },
      deps,
    );
    expect(calls).toEqual([["claude", "mcp", "remove", "firecrawl-local", "-s", "user"]]);
    expect(result.warnings).toEqual(["claude mcp remove firecrawl-local -s user exited 1"]);
  });

  test("throws when re-adding the previous MCP entry fails", async () => {
    const { deps } = fakeDeps({ "claude mcp add-json": 3 });
    expect(
      await rejectionOf(
        restoreUndo({ kind: "mcp-entry", name: "firecrawl-local", previousEntry: {} }, deps),
      ),
    ).toContain("exited 3");
  });

  test("uninstalls a plugin and throws when that fails", async () => {
    const { deps, calls } = fakeDeps();
    await restoreUndo({ kind: "plugin", pluginId: "emet-mascot@emet-marketplace" }, deps);
    expect(calls).toEqual([["claude", "plugin", "uninstall", "emet-mascot@emet-marketplace"]]);
    const failing = fakeDeps({ "claude plugin uninstall": 1 });
    expect(
      await rejectionOf(restoreUndo({ kind: "plugin", pluginId: "x" }, failing.deps)),
    ).toContain("claude plugin uninstall x exited 1");
  });

  test("deletes recorded files and warns about ones already gone", async () => {
    const written = path.join(directory, "pet.json");
    writeFileSync(written, "{}");
    const gone = path.join(directory, "gone.webp");
    const { deps, calls } = fakeDeps();
    const result = await restoreUndo({ kind: "files", paths: [written, gone] }, deps);
    expect(existsSync(written)).toBe(false);
    expect(result.warnings).toEqual([`${gone} is already gone`]);
    expect(calls).toEqual([]);
  });

  test("prints a global package's removal command and never runs it", async () => {
    const { deps, calls, lines } = fakeDeps();
    await restoreUndo({ kind: "global-package", manager: "bun", name: "ctx7" }, deps);
    await restoreUndo({ kind: "global-package", manager: "brew", name: "engram" }, deps);
    await restoreUndo({ kind: "global-package", manager: "cargo", name: "firecrawl-local" }, deps);
    expect(calls).toEqual([]);
    expect(lines.join("\n")).toContain("bun remove -g ctx7");
    expect(lines.join("\n")).toContain("brew uninstall engram");
    expect(lines.join("\n")).toContain("cargo uninstall firecrawl-local");
  });

  test("reverts claude-settings surgically, keeping a user's later deny rule", async () => {
    const settingsPath = path.join(directory, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({ model: "sonnet", permissions: { deny: ["Bash(rm -rf:*)"] } }),
    );
    const applied = applyClaudeSettings(settingsPath, RECOMMENDED_CLAUDE_SETTINGS, {
      now: () => new Date("2026-11-19T00:00:00.000Z"),
    });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        model: RECOMMENDED_CLAUDE_SETTINGS.model,
        permissions: { deny: [...RECOMMENDED_CLAUDE_SETTINGS.deny, "Read(./secrets)"] },
      }),
    );
    const record: ClaudeSettingsUndo = {
      kind: "claude-settings",
      settingsPath,
      setModel: RECOMMENDED_CLAUDE_SETTINGS.model,
      ...applied,
    };
    const { deps } = fakeDeps();
    expect(await restoreUndo(record, deps)).toEqual({ warnings: [] });
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({
      model: "sonnet",
      permissions: { deny: ["Bash(rm -rf:*)", "Read(./secrets)"] },
    });
    expect(existsSync(`${settingsPath}.bak-2026-11-20T01-02-03-004Z`)).toBe(true);
  });
});
