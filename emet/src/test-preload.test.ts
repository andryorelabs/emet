import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PRELOAD = path.join(import.meta.dir, "test-preload.ts");

describe("test preload", () => {
  it("removes its emet-test-state-* dir once the test run ends", () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "emet-preload-probe-"));
    try {
      const probe = path.join(scratch, "probe.test.ts");
      fs.writeFileSync(probe, 'import { it } from "bun:test";\nit("runs", () => {});\n');
      const result = Bun.spawnSync(["bun", "test", "--preload", PRELOAD, probe], {
        cwd: scratch,
        env: { ...process.env, TMPDIR: scratch },
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.exitCode).toBe(0);
      const leftovers = fs
        .readdirSync(scratch)
        .filter((entry) => entry.startsWith("emet-test-state-"));
      expect(leftovers).toEqual([]);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });
});
