import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.join(import.meta.dir, "..");

function containsJournal(dir: string): boolean {
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name === "events.jsonl") return true;
  }
  return false;
}

describe("test state isolation", () => {
  test("root and emet bunfig.toml preload the state-dir module", () => {
    for (const file of ["bunfig.toml", "emet/bunfig.toml"]) {
      const text = readFileSync(path.join(repoRoot, file), "utf8");
      expect(text).toMatch(/preload\s*=\s*\[[^\]]*test-preload\.ts/);
    }
    expect(existsSync(path.join(repoRoot, "emet/src/test-preload.ts"))).toBe(true);
  });

  test("a journal-writing test file leaves no journal under HOME or XDG_STATE_HOME", () => {
    const home = mkdtempSync(path.join(tmpdir(), "emet-journal-iso-"));
    try {
      const { EMET_STATE_DIR: _removed, ...inherited } = process.env;
      const result = Bun.spawnSync(["bun", "test", "emet/src/gate.test.ts"], {
        cwd: repoRoot,
        env: { ...inherited, HOME: home, XDG_STATE_HOME: home },
      });
      expect(result.exitCode).toBe(0);
      expect(containsJournal(home)).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }, 120_000);
});
