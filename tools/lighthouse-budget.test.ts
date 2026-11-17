import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT = path.join(import.meta.dir, "..", "apps", "site", "scripts", "lighthouse-budget.sh");
const PAGE_COUNT = 3;
const RUNS_PER_PAGE = 3;

/**
 * A stub `bun` that stands in for `bun x lighthouse`: it counts its calls and,
 * by `STUB_MODE`, fails the first call of each report with NO_NAVSTART, always
 * fails, writes a report with a runtimeError first, or writes a report that
 * breaks the performance budget.
 */
const STUB_BUN = `#!/usr/bin/env bash
for argument in "$@"; do
  case "$argument" in --output-path=*) report="\${argument#--output-path=}" ;; esac
done
echo x >> "$STUB_DIR/calls"
echo x >> "$STUB_DIR/$(basename "$report").calls"
attempts="$(wc -l < "$STUB_DIR/$(basename "$report").calls")"
write_report() {
  echo '{"categories":{"performance":{"score":'"$1"'},"accessibility":{"score":1},"best-practices":{"score":1},"seo":{"score":1}},"audits":{"largest-contentful-paint":{"numericValue":1000},"cumulative-layout-shift":{"numericValue":0},"total-blocking-time":{"numericValue":0},"total-byte-weight":{"numericValue":102400}}}' > "$report"
}
case "$STUB_MODE" in
  flaky)
    if [ "$attempts" -lt 2 ]; then echo "NO_NAVSTART" >&2; exit 1; fi
    write_report 1 ;;
  always-fail) echo "NO_NAVSTART" >&2; exit 1 ;;
  runtime-error)
    if [ "$attempts" -lt 2 ]; then echo '{"runtimeError":{"code":"NO_FCP"}}' > "$report"; exit 0; fi
    write_report 1 ;;
  breach) write_report 0.1 ;;
esac
`;

let workDir = "";

/**
 * Runs the budget script against the stub `bun` in the given mode.
 * @param mode - The `STUB_MODE` the stub follows.
 * @returns The exit status, both streams and the number of Lighthouse calls.
 */
function runScript(mode: string): { status: number | null; output: string; calls: number } {
  const stateDir = mkdtempSync(path.join(workDir, "state-"));
  const result = Bun.spawnSync(
    ["bash", SCRIPT, "http://stub.test", path.join(stateDir, "reports")],
    {
      env: {
        ...process.env,
        PATH: `${path.join(workDir, "bin")}:${process.env.PATH ?? ""}`,
        CHROME_PATH: "/stub/chrome",
        STUB_DIR: stateDir,
        STUB_MODE: mode,
      },
    },
  );
  let calls = 0;
  try {
    calls = readFileSync(path.join(stateDir, "calls"), "utf8").split("\n").filter(Boolean).length;
  } catch {
    calls = 0;
  }
  return {
    status: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`,
    calls,
  };
}

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "lighthouse-budget-"));
  mkdirSync(path.join(workDir, "bin"));
  const stubPath = path.join(workDir, "bin", "bun");
  writeFileSync(stubPath, STUB_BUN);
  chmodSync(stubPath, 0o755);
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("lighthouse-budget.sh", () => {
  test("retries a NO_NAVSTART failure and passes when the second attempt succeeds", () => {
    const { status, output, calls } = runScript("flaky");
    expect(output).toContain("retrying");
    expect(output.split("\n")).toContain("OK");
    expect(status).toBe(0);
    expect(calls).toBe(PAGE_COUNT * RUNS_PER_PAGE * 2);
  });

  test("retries a report carrying a runtimeError", () => {
    const { status, output } = runScript("runtime-error");
    expect(output).toContain("retrying");
    expect(status).toBe(0);
  });

  test("exits non-zero naming the page after three failed attempts", () => {
    const { status, output, calls } = runScript("always-fail");
    expect(status).not.toBe(0);
    expect(output).toContain("FAIL: / run 1 failed after 3 attempts");
    expect(calls).toBe(3);
  });

  test("never retries a budget breach", () => {
    const { status, output, calls } = runScript("breach");
    expect(status).toBe(1);
    expect(output).toContain("FAIL:");
    expect(output).not.toContain("retrying");
    expect(calls).toBe(PAGE_COUNT * RUNS_PER_PAGE);
  });
});
