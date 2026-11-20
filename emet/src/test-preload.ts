import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Points every test run at a fresh state dir so no test writes the real journal. */
process.env.EMET_STATE_DIR = mkdtempSync(join(tmpdir(), "emet-test-state-"));
