import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { MigrationConflictError, planMigration, runMigration } from "./migrate.ts";

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
    expect(() => planMigration(root)).toThrow(MigrationConflictError);
    expect(read(".emet/a.txt")).toBe("a\n");
  });
});
