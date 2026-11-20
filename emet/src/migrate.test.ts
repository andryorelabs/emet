import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { MigrationConflictError, planMigration, run, runMigration } from "./migrate.ts";

let root: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function write(relativePath: string, content: string): void {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(root, relativePath));
}

function seedLegacyRepo(): void {
  write(
    "forge.config.json",
    '{"$schema":"~/.claude/forge/schema/forge.config.schema.json","note":"TODO(forge): set"}\n',
  );
  write("docs/agents/forge.md", "# agents\nTODO(forge): fill\n");
  write("AGENTS.md", "intro\n<!-- forge:begin -->\nbody\n<!-- forge:end -->\n");
  write(".gitignore", "node_modules\n# forge local tracker\n.forge/*\n!.forge/tickets/\n");
  write(".forge/tickets/a.md", "ticket\n");
  write(".forge/state.json", "{}\n");
  git("add", "forge.config.json", "docs", "AGENTS.md", ".gitignore");
  git("add", "-f", ".forge/tickets/a.md");
  git("commit", "-q", "-m", "seed");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "emet-migrate-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("planMigration", () => {
  it("is empty for a repo with no legacy names", () => {
    write("emet.config.json", "{}\n");
    expect(planMigration(root)).toEqual([]);
  });

  it("lists renames before rewrites for a legacy repo", () => {
    seedLegacyRepo();
    const steps = planMigration(root);
    expect(steps.filter((step) => step.kind === "rename").map((step) => step.kind)).toHaveLength(3);
    expect(steps.findIndex((step) => step.kind === "rewrite")).toBeGreaterThanOrEqual(3);
  });
});

describe("runMigration", () => {
  it("renames everything with git mv and rewrites contents", () => {
    seedLegacyRepo();
    const result = runMigration(root, { dryRun: false });
    expect(result.applied).toBe(true);
    expect(exists("forge.config.json")).toBe(false);
    expect(exists("docs/agents/forge.md")).toBe(false);
    expect(exists(".forge")).toBe(false);
    expect(exists(".emet/state.json")).toBe(true);
    expect(read("emet.config.json")).toContain("~/.claude/emet/schema/emet.config.schema.json");
    expect(read("emet.config.json")).toContain("TODO(emet): set");
    expect(read("docs/agents/emet.md")).toContain("TODO(emet): fill");
    expect(read("AGENTS.md")).toContain("<!-- emet:begin -->");
    expect(read("AGENTS.md")).toContain("<!-- emet:end -->");
    expect(read(".gitignore")).toBe(
      "node_modules\n# emet local tracker\n.emet/*\n!.emet/tickets/\n",
    );
    expect(git("status", "--porcelain")).toMatch(/^R. forge\.config\.json -> emet\.config\.json$/m);
  });

  it("is idempotent", () => {
    seedLegacyRepo();
    runMigration(root, { dryRun: false });
    const second = runMigration(root, { dryRun: false });
    expect(second.steps).toEqual([]);
    expect(second.applied).toBe(false);
  });

  it("changes nothing under dryRun", () => {
    seedLegacyRepo();
    const result = runMigration(root, { dryRun: true });
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.applied).toBe(false);
    expect(exists("forge.config.json")).toBe(true);
    expect(exists("emet.config.json")).toBe(false);
    expect(git("status", "--porcelain")).toBe("");
  });

  it("renames untracked files without git", () => {
    write("forge.config.json", "{}\n");
    runMigration(root, { dryRun: false });
    expect(exists("emet.config.json")).toBe(true);
    expect(exists("forge.config.json")).toBe(false);
  });

  it("works on a dirty tree without losing edits", () => {
    seedLegacyRepo();
    write("forge.config.json", '{"edited":true}\n');
    runMigration(root, { dryRun: false });
    expect(read("emet.config.json")).toBe('{"edited":true}\n');
  });

  it("stops with an error naming both files when the target differs", () => {
    write("forge.config.json", '{"a":1}\n');
    write("emet.config.json", '{"a":2}\n');
    expect(() => runMigration(root, { dryRun: false })).toThrow(MigrationConflictError);
    expect(() => planMigration(root)).toThrow(/forge\.config\.json.*emet\.config\.json/);
    expect(read("forge.config.json")).toBe('{"a":1}\n');
    expect(read("emet.config.json")).toBe('{"a":2}\n');
  });

  it("drops a legacy file whose target has identical content", () => {
    write("forge.config.json", "{}\n");
    write("emet.config.json", "{}\n");
    runMigration(root, { dryRun: false });
    expect(exists("forge.config.json")).toBe(false);
    expect(read("emet.config.json")).toBe("{}\n");
  });

  it("merges a legacy run dir into an existing one and errors on differing files", () => {
    write(".forge/a.txt", "a\n");
    write(".forge/sub/b.txt", "b\n");
    write(".emet/a.txt", "a\n");
    runMigration(root, { dryRun: false });
    expect(exists(".forge")).toBe(false);
    expect(read(".emet/sub/b.txt")).toBe("b\n");

    write(".forge/a.txt", "different\n");
    expect(planMigration(root)).toContainEqual({
      kind: "remove",
      path: ".forge/a.txt",
      tracked: false,
      duplicateOf: ".emet/a.txt",
      reason: "stale-run-file",
    });
    expect(read(".emet/a.txt")).toBe("a\n");
  });
});

describe("stale run files and collected conflicts", () => {
  it("removes an untracked differing nested run file and keeps the target", () => {
    write(".forge/runs/a/b.json", "old\n");
    write(".emet/runs/a/b.json", "new\n");
    const dry = runMigration(root, { dryRun: true });
    expect(dry.steps).toHaveLength(1);
    expect(exists(".forge/runs/a/b.json")).toBe(true);
    runMigration(root, { dryRun: false });
    expect(exists(".forge")).toBe(false);
    expect(read(".emet/runs/a/b.json")).toBe("new\n");
  });

  it("treats an untracked legacy file as stale even when the target is tracked", () => {
    write(".emet/x.log", "kept\n");
    git("add", "-f", ".emet/x.log");
    git("commit", "-q", "-m", "seed");
    write(".forge/x.log", "stale\n");
    runMigration(root, { dryRun: false });
    expect(exists(".forge/x.log")).toBe(false);
    expect(read(".emet/x.log")).toBe("kept\n");
  });

  it("never removes a differing legacy file when git cannot say whether it is tracked", () => {
    write(".forge/x.log", "legacy\n");
    write(".emet/x.log", "current\n");
    git("add", "-f", ".forge/x.log");
    git("commit", "-q", "-m", "seed");
    const previous = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(root, "no-such-git-dir");
    try {
      expect(() => runMigration(root, { dryRun: false })).toThrow(MigrationConflictError);
    } finally {
      if (previous === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previous;
    }
    expect(read(".forge/x.log")).toBe("legacy\n");
  });

  it("collects every conflict and applies nothing", () => {
    write(".forge/stale.log", "s\n");
    write(".emet/stale.log", "t\n");
    write(".forge/t1.txt", "1\n");
    write(".emet/t1.txt", "2\n");
    write("forge.config.json", '{"a":1}\n');
    write("emet.config.json", '{"a":2}\n');
    git("add", "-f", ".forge/t1.txt");
    git("commit", "-q", "-m", "seed");
    let caught: unknown;
    try {
      runMigration(root, { dryRun: false });
    } catch (error: unknown) {
      caught = error;
    }
    if (!(caught instanceof MigrationConflictError)) throw new Error("expected a conflict error");
    const error = caught;
    expect(error.conflicts).toEqual([
      { legacyPath: "forge.config.json", targetPath: "emet.config.json", tracked: false },
      { legacyPath: ".forge/t1.txt", targetPath: ".emet/t1.txt", tracked: true },
    ]);
    expect(error.message).toContain("diff .forge/t1.txt .emet/t1.txt");
    expect(error.message).toContain("git rm .forge/t1.txt");
    expect(error.message).toContain("rm forge.config.json");
    expect(exists(".forge/stale.log")).toBe(true);
    expect(exists(".forge/t1.txt")).toBe(true);
  });
});

describe("tracked duplicates", () => {
  it("removes a tracked legacy file whose target is identical with git rm", () => {
    write("forge.config.json", "{}\n");
    write("emet.config.json", "{}\n");
    git("add", "forge.config.json", "emet.config.json");
    git("commit", "-q", "-m", "seed");
    const result = runMigration(root, { dryRun: false });
    expect(result.steps).toContainEqual({
      kind: "remove",
      path: "forge.config.json",
      tracked: true,
      duplicateOf: "emet.config.json",
      reason: "duplicate",
    });
    expect(exists("forge.config.json")).toBe(false);
    expect(git("ls-files")).not.toContain("forge.config.json");
  });

  it("treats paths as untracked outside a git repo", () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "emet-migrate-plain-"));
    try {
      fs.writeFileSync(path.join(plain, "forge.config.json"), "{}\n");
      const steps = planMigration(plain);
      expect(steps[0]).toMatchObject({ kind: "rename", tracked: false });
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });

  it("rewrites anchored and negated legacy .gitignore entries", () => {
    write(".gitignore", "/.forge/cache\n!/.forge\nother\n");
    runMigration(root, { dryRun: false });
    expect(read(".gitignore")).toBe("/.emet/cache\n!/.emet\nother\n");
  });
});

describe("migrate run", () => {
  let originalCwd: string;
  let output: string[];
  let errors: string[];

  function capture(): () => void {
    output = [];
    errors = [];
    const logSpy = spyOn(console, "log").mockImplementation(
      (...args) => void output.push(args.join(" ")),
    );
    const errorSpy = spyOn(console, "error").mockImplementation(
      (...args) => void errors.push(args.join(" ")),
    );
    return () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    };
  }

  beforeEach(() => {
    originalCwd = process.cwd();
    process.exitCode = 0;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exitCode = 0;
  });

  it("rejects unknown arguments with usage and exit code 2", () => {
    const restore = capture();
    run(["--bogus"]);
    restore();
    expect(errors.join("\n")).toContain("usage:");
    expect(process.exitCode).toBe(2);
  });

  it("reports nothing to migrate for a clean repo", () => {
    write("emet.config.json", "{}\n");
    process.chdir(root);
    const restore = capture();
    run([]);
    restore();
    expect(output).toEqual(["nothing to migrate"]);
  });

  it("lists planned steps under --dry-run without touching files", () => {
    seedLegacyRepo();
    process.chdir(root);
    const restore = capture();
    run(["--dry-run"]);
    restore();
    const text = output.join("\n");
    expect(text).toContain("would migrate:");
    expect(text).toContain("git mv forge.config.json -> emet.config.json");
    expect(text).toContain("rewrite emet.config.json:");
    expect(exists("forge.config.json")).toBe(true);
  });

  it("applies the migration and describes untracked moves and duplicate removals", () => {
    write("forge.config.json", "{}\n");
    write("docs/agents/forge.md", "x\n");
    write("docs/agents/emet.md", "x\n");
    process.chdir(root);
    const restore = capture();
    run([]);
    restore();
    const text = output.join("\n");
    expect(text).toContain("migrated:");
    expect(text).toContain("mv forge.config.json -> emet.config.json");
    expect(text).toContain("remove docs/agents/forge.md (same as docs/agents/emet.md)");
    expect(exists("emet.config.json")).toBe(true);
  });

  it("exits 1 with the conflict message", () => {
    write("forge.config.json", '{"a":1}\n');
    write("emet.config.json", '{"a":2}\n');
    process.chdir(root);
    const restore = capture();
    run([]);
    restore();
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toContain("diff forge.config.json emet.config.json");
  });

  it("rethrows unexpected errors", () => {
    write("forge.config.json", "{}\n");
    fs.mkdirSync(path.join(root, "emet.config.json"));
    process.chdir(root);
    const restore = capture();
    try {
      expect(() => {
        run([]);
      }).toThrow();
    } finally {
      restore();
    }
  });

  it("falls back to the cwd outside a git repo", () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "emet-migrate-cwd-"));
    try {
      process.chdir(plain);
      const restore = capture();
      run([]);
      restore();
      expect(output).toEqual(["nothing to migrate"]);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });
});
