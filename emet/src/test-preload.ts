import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const stateDirectory = mkdtempSync(join(tmpdir(), "emet-test-state-"));

/** Points every test run at a fresh state dir so no test writes the real journal. */
process.env.EMET_STATE_DIR = stateDirectory;

afterAll(() => {
  rmSync(stateDirectory, { recursive: true, force: true });
});
