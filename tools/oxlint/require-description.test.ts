import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repositoryRoot = join(import.meta.dir, "..", "..");
const oxlintBin = join(repositoryRoot, "node_modules", ".bin", "oxlint");
const localPluginPath = join(import.meta.dir, "local-plugin.ts");
const ruleName = "local/require-description";

let scratchDirectory = "";
let fixtureCounter = 0;

beforeAll(async () => {
  scratchDirectory = await mkdtemp(join(tmpdir(), "emet-require-description-"));
  await Bun.write(
    join(scratchDirectory, ".oxlintrc.json"),
    JSON.stringify({
      categories: { correctness: "off" },
      jsPlugins: [localPluginPath],
      rules: { [ruleName]: "error" },
    }),
  );
});

afterAll(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

interface OxlintDiagnostic {
  code: string;
  message: string;
}

/**
 * Narrows one entry of Oxlint's JSON `diagnostics` array.
 */
function isOxlintDiagnostic(candidate: unknown): candidate is OxlintDiagnostic {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "code" in candidate &&
    typeof candidate.code === "string" &&
    "message" in candidate &&
    typeof candidate.message === "string"
  );
}

/**
 * Parses Oxlint's `--format json` output, surfacing stdout and stderr when it
 * is not a report so plugin load failures are visible in the test failure.
 */
function parseOxlintDiagnostics(standardOutput: string, standardError: string): OxlintDiagnostic[] {
  const notAReport = new Error(
    `oxlint did not print a JSON report.\nstdout: ${standardOutput}\nstderr: ${standardError}`,
  );
  let report: unknown;
  try {
    report = JSON.parse(standardOutput);
  } catch (parseError) {
    throw new Error(notAReport.message, { cause: parseError });
  }
  if (
    typeof report !== "object" ||
    report === null ||
    !("diagnostics" in report) ||
    !Array.isArray(report.diagnostics)
  ) {
    throw notAReport;
  }
  const diagnostics: unknown[] = report.diagnostics;
  if (!diagnostics.every(isOxlintDiagnostic)) {
    throw notAReport;
  }
  return diagnostics;
}

/**
 * Lints one source text with only `local/require-description` enabled and
 * returns the messages the rule reported.
 */
async function lintWithLocalRule(sourceText: string): Promise<string[]> {
  fixtureCounter += 1;
  const fixturePath = join(scratchDirectory, `fixture-${fixtureCounter}.ts`);
  await Bun.write(fixturePath, sourceText);
  const lintProcess = Bun.spawn(
    [
      oxlintBin,
      "--config",
      join(scratchDirectory, ".oxlintrc.json"),
      "--format",
      "json",
      fixturePath,
    ],
    { cwd: scratchDirectory, stdout: "pipe", stderr: "pipe" },
  );
  const [standardOutput, standardError] = await Promise.all([
    new Response(lintProcess.stdout).text(),
    new Response(lintProcess.stderr).text(),
  ]);
  await lintProcess.exited;
  return parseOxlintDiagnostics(standardOutput, standardError)
    .filter((diagnostic) => diagnostic.code.includes("require-description"))
    .map((diagnostic) => diagnostic.message);
}

describe(ruleName, () => {
  test.each([
    "// oxlint-disable-next-line no-console",
    "// eslint-disable-next-line no-console",
    "/* eslint-disable no-console */",
    "// oxlint-disable-line no-console --",
    "// oxlint-disable-next-line no-console --   ",
  ])("rejects the directive without a reason %s", async (directive) => {
    const messages = await lintWithLocalRule(`${directive}\nexport const answer: number = 42;\n`);
    expect(messages).toHaveLength(1);
  });

  test.each([
    "// oxlint-disable-next-line no-console -- logging is the output",
    "// eslint-disable-next-line no-console -- logging is the output",
    "/* oxlint-disable no-console -- generated file */",
    "// oxlint-disable-line no-console -- reason",
  ])("allows the directive with a reason %s", async (directive) => {
    const messages = await lintWithLocalRule(`${directive}\nexport const answer: number = 42;\n`);
    expect(messages).toEqual([]);
  });

  test.each(["// oxlint-enable no-console", "/* eslint-enable */"])(
    "ignores the enable directive %s",
    async (directive) => {
      const messages = await lintWithLocalRule(`${directive}\nexport const answer: number = 42;\n`);
      expect(messages).toEqual([]);
    },
  );

  test("ignores ordinary comments that merely mention a directive", async () => {
    const messages = await lintWithLocalRule(
      "// see the oxlint-disable docs\nexport const answer: number = 42;\n",
    );
    expect(messages).toEqual([]);
  });
});
