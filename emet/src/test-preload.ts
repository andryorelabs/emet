import { afterAll } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const stateDirectory = mkdtempSync(join(tmpdir(), "emet-test-state-"));

/** Points every test run at a fresh state dir so no test writes the real journal. */
process.env.EMET_STATE_DIR = stateDirectory;

afterAll(() => {
  rmSync(stateDirectory, { recursive: true, force: true });
});

const KEPT_BINARIES = ["bun", "git"];

/**
 * Points `PATH` at a directory holding only `bun` and `git`, so a test that
 * reaches the real `claude`, `gh` or `codex` finds none of them and stays
 * independent of what the host has installed. Returns the function that
 * restores the previous `PATH` and removes the directory.
 */
export function useBarePath(): () => void {
  const previous = process.env.PATH;
  const directory = mkdtempSync(join(tmpdir(), "emet-bare-path-"));
  for (const name of KEPT_BINARIES) {
    const resolved = Bun.which(name);
    if (resolved !== null) symlinkSync(resolved, join(directory, name));
  }
  process.env.PATH = directory;
  return () => {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  };
}
