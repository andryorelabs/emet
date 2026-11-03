import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

const allowedRuntimeDevDependencies = new Set(["@types/bun", "@types/node", "typescript"]);

/** Reads and parses forge/package.json, the manifest install.sh ships to users. */
function readRuntimeManifest(): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(repoRoot, "forge/package.json"), "utf8"));
}

test("forge/package.json ships no runtime dependencies", () => {
  expect(Object.keys(readRuntimeManifest().dependencies ?? {})).toEqual([]);
});

test("forge/package.json devDependencies stay on the allowlist install.sh can afford", () => {
  const unexpected = Object.keys(readRuntimeManifest().devDependencies ?? {}).filter(
    (name) => !allowedRuntimeDevDependencies.has(name),
  );
  expect(unexpected).toEqual([]);
});

test("install.sh installs only from forge/ and leaves the repo root untouched", () => {
  const installer = readFileSync(join(repoRoot, "install.sh"), "utf8");
  expect(installer).toContain('cd "$HOME/.claude/forge" && bun install');
  expect(installer).not.toMatch(/rsync[^\n]*\$SCRIPT_DIR\/(package\.json|node_modules)/);
});
