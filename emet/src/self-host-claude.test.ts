import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { embeddedTree, type TreeSource } from "./assets";
import { checkoutTree, installClaudeHost, rewritePrompt } from "./self-host-claude";
import type { HostContext } from "./self-types";

const repoRoot = path.join(import.meta.dir, "..", "..");
const snapshotPath = path.join(repoRoot, "tools", "fixtures", "claude-install-snapshot.json");
const manifestRelativePath = ".claude/emet/.install-manifest.json";
const pluginRoot = "${CLAUDE_PLUGIN_ROOT}";

/** Parses a JSON object of string values, failing the test on any other shape. */
function parseStringRecord(text: string): Record<string, string> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) throw new Error("expected a JSON object");
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") throw new Error(`expected a string at ${key}`);
    record[key] = value;
  }
  return record;
}

let home = "";
let logged: string[] = [];

function context(overrides: Partial<HostContext> = {}): HostContext {
  return {
    home,
    emetBin: path.join(home, ".local/bin/emet"),
    tree: embeddedTree(),
    dryRun: false,
    force: false,
    now: () => new Date("2026-11-23T00:00:00Z"),
    log: (line) => logged.push(line),
    ...overrides,
  };
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function listHome(directory: string = home): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listHome(entryPath) : [path.relative(home, entryPath)];
    })
    .toSorted();
}

function snapshotOfHome(): Record<string, string> {
  return Object.fromEntries(
    listHome().map((relativePath) => [relativePath, sha256(path.join(home, relativePath))]),
  );
}

function readManifest(): Record<string, string> {
  return parseStringRecord(readFileSync(path.join(home, manifestRelativePath), "utf8"));
}

function writeHomeFile(relativePath: string, content: string): void {
  mkdirSync(path.dirname(path.join(home, relativePath)), { recursive: true });
  writeFileSync(path.join(home, relativePath), content);
}

/** A tree holding only the given files. */
function fakeTree(files: Record<string, string>): TreeSource {
  return {
    list: () => Object.keys(files).toSorted(),
    read: (relativePath) => {
      const content = files[relativePath];
      if (content === undefined) throw new Error(`unknown ${relativePath}`);
      return content;
    },
  };
}

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), "emet-self-host-claude-"));
  logged = [];
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("rewritePrompt", () => {
  test("points plugin paths at $HOME/.claude and drops the plugin prefix from agent names", () => {
    const source =
      `Read ${pluginRoot}/emet/reference/a.md and ${pluginRoot}/b.md.\n` +
      'Dispatch subagent_type "emet:emet-worker", then "emet:emet-reviewer".\n';
    expect(rewritePrompt(source)).toBe(
      "Read $HOME/.claude/emet/reference/a.md and $HOME/.claude/b.md.\n" +
        'Dispatch subagent_type "emet-worker", then "emet-reviewer".\n',
    );
  });
});

describe("installClaudeHost", () => {
  test("installs every prompt with the hash pinned by the install.sh snapshot", () => {
    const snapshot: unknown = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const pinned = parseStringRecord(JSON.stringify(Reflect.get(Object(snapshot), "promptSha256")));
    const result = installClaudeHost(context());
    const installedPrompts = listHome().filter((relativePath) => relativePath.endsWith(".md"));
    expect(installedPrompts).toEqual(Object.keys(pinned).toSorted());
    for (const relativePath of installedPrompts) {
      expect({ relativePath, hash: sha256(path.join(home, relativePath)) }).toEqual({
        relativePath,
        hash: pinned[relativePath] ?? "",
      });
    }
    expect(result.host).toBe("claude");
    expect(result.status).toBe("installed");
    expect(result.writes.toSorted()).toEqual(
      listHome().map((relativePath) => path.join(home, relativePath)),
    );
  });

  test("records the manifest in install.sh's format: byte-sorted, two-space indent", () => {
    installClaudeHost(context());
    const text = readFileSync(path.join(home, manifestRelativePath), "utf8");
    const lines = text.split("\n");
    expect(lines[0]).toBe("{");
    expect(lines.at(-2)).toBe("}");
    expect(lines.at(-1)).toBe("");
    expect(lines[1]).toMatch(/^ {2}"\.claude\/agents\/emet-reviewer\.md": "[0-9a-f]{64}",$/);
    expect(lines.at(-3)).toMatch(/^ {2}"[^"]+": "[0-9a-f]{64}"$/);
    const manifest = readManifest();
    expect(Object.keys(manifest)).toEqual(Object.keys(manifest).toSorted());
    for (const [relativePath, hash] of Object.entries(manifest)) {
      expect(sha256(path.join(home, relativePath))).toBe(hash);
    }
  });

  test("a second run changes nothing", () => {
    installClaudeHost(context());
    const before = snapshotOfHome();
    const result = installClaudeHost(context());
    expect(result.status).toBe("unchanged");
    expect(result.writes).toEqual([]);
    expect(snapshotOfHome()).toEqual(before);
  });

  test("an edited file is kept and the new version is written beside it as <file>.new", () => {
    installClaudeHost(context());
    const runPath = path.join(home, ".claude/commands/emet/run.md");
    const shipped = readFileSync(runPath, "utf8");
    const recordedHash = readManifest()[".claude/commands/emet/run.md"];
    writeFileSync(runPath, "my edits\n");

    const result = installClaudeHost(context());
    expect(readFileSync(runPath, "utf8")).toBe("my edits\n");
    expect(readFileSync(`${runPath}.new`, "utf8")).toBe(shipped);
    expect(readManifest()[".claude/commands/emet/run.md"]).toBe(recordedHash);
    expect(result.writes).toEqual([`${runPath}.new`]);
    expect(result.notes).toEqual([
      "~/.claude/commands/emet/run.md was edited since the last install, so your version was kept (new version at ~/.claude/commands/emet/run.md.new)",
    ]);
    expect(logged).toEqual([`note: ${result.notes[0] ?? ""}`]);

    const settled = snapshotOfHome();
    expect(installClaudeHost(context()).writes).toEqual([]);
    expect(snapshotOfHome()).toEqual(settled);
  });

  test("an unedited file from an older release is replaced and a stale <file>.new removed", () => {
    installClaudeHost(context({ tree: fakeTree({ "commands/run.md": "old run\n" }) }));
    writeHomeFile(".claude/commands/emet/run.md.new", "stale\n");
    const result = installClaudeHost(
      context({ tree: fakeTree({ "commands/run.md": "new run\n" }) }),
    );
    const runPath = path.join(home, ".claude/commands/emet/run.md");
    expect(readFileSync(runPath, "utf8")).toBe("new run\n");
    expect(existsSync(`${runPath}.new`)).toBe(false);
    expect(result.writes).toEqual([
      runPath,
      `${runPath}.new`,
      path.join(home, manifestRelativePath),
    ]);
  });

  test("--dry-run lists every write and writes nothing", () => {
    const result = installClaudeHost(context({ dryRun: true }));
    expect(listHome()).toEqual([]);
    installClaudeHost(context());
    expect(result.writes.toSorted()).toEqual(
      listHome().map((relativePath) => path.join(home, relativePath)),
    );
    expect(result.status).toBe("installed");
  });

  test("an unshipped prompt is removed when unedited and kept when edited; foreign entries carry over", () => {
    installClaudeHost(
      context({
        tree: fakeTree({ "agents/emet-old.md": "old\n", "emet/reference/gone.md": "gone\n" }),
      }),
    );
    writeHomeFile(".claude/emet/reference/gone.md", "edited gone\n");
    const manifestPath = path.join(home, manifestRelativePath);
    const manifest = readManifest();
    manifest[".claude/emet/src/cli.ts"] = "a".repeat(64);
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const result = installClaudeHost(context({ tree: fakeTree({ "commands/run.md": "run\n" }) }));
    expect(existsSync(path.join(home, ".claude/agents/emet-old.md"))).toBe(false);
    expect(readFileSync(path.join(home, ".claude/emet/reference/gone.md"), "utf8")).toBe(
      "edited gone\n",
    );
    expect(Object.keys(readManifest())).toEqual([
      ".claude/commands/emet/run.md",
      ".claude/emet/src/cli.ts",
    ]);
    expect(result.notes).toEqual([
      "~/.claude/emet/reference/gone.md is no longer shipped but was edited since the last install, so it was kept",
    ]);
  });

  test("a retired reference file is moved aside even when untracked", () => {
    writeHomeFile(".claude/emet/reference/phases-8-closeout.md", "closeout\n");
    writeHomeFile(".claude/emet/reference/phases-8-closeout.md.new", "pending\n");
    const result = installClaudeHost(context({ tree: fakeTree({}) }));
    const retired = path.join(home, ".claude/emet/reference/phases-8-closeout.md");
    expect(existsSync(retired)).toBe(false);
    expect(existsSync(`${retired}.new`)).toBe(false);
    expect(readFileSync(`${retired}.retired`, "utf8")).toBe("closeout\n");
    expect(result.notes).toEqual([
      "~/.claude/emet/reference/phases-8-closeout.md is no longer shipped and was moved to ~/.claude/emet/reference/phases-8-closeout.md.retired",
    ]);
  });

  test("an invalid manifest throws naming the file and writes nothing", () => {
    writeHomeFile(manifestRelativePath, "{ nope");
    expect(() => installClaudeHost(context())).toThrow(path.join(home, manifestRelativePath));
    expect(listHome()).toEqual([manifestRelativePath]);
  });
});

describe("checkoutTree", () => {
  test("reads the checkout with the same paths and bytes as the embedded tree", () => {
    const fromCheckout = checkoutTree(repoRoot);
    const embedded = embeddedTree();
    expect(fromCheckout.list()).toEqual(embedded.list());
    for (const file of embedded.list()) expect(fromCheckout.read(file)).toBe(embedded.read(file));
  });

  test("rejects a path outside the tree", () => {
    expect(() => checkoutTree(repoRoot).read("install.sh")).toThrow(
      'unknown tree file "install.sh"',
    );
  });

  test("an empty directory is an empty tree", () => {
    expect(checkoutTree(home).list()).toEqual([]);
    expect(statSync(home).isDirectory()).toBe(true);
  });
});
