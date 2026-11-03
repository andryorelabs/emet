import { expect, test } from "bun:test";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

/** Runs commitlint against a message piped on stdin and returns the exit code. */
function lintMessage(message: string): number {
  const result = Bun.spawnSync(
    ["bun", "x", "--no-install", "commitlint", "--config", "commitlint.config.ts"],
    { cwd: repoRoot, stdin: new TextEncoder().encode(message), stdout: "pipe", stderr: "pipe" },
  );
  return result.exitCode;
}

test("accepts gitmoji conventional headers", () => {
  expect(lintMessage("feat: ✨ add user authentication")).toBe(0);
  expect(lintMessage("fix: 🐛 resolve selfCheck package scripts from --cwd/--prefix/--dir")).toBe(
    0,
  );
});

test("rejects a non-conventional header", () => {
  expect(lintMessage("added stuff")).not.toBe(0);
});
