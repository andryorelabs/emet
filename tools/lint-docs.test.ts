import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildLycheeCacheRelativePath,
  buildLycheeDownloadUrl,
  EXPECTED_LYCHEE_ACTION_VERSION,
  LYCHEE_ARGS,
  LYCHEE_VERSION,
  LYCHEE_SHA256,
  matchesLycheeChecksum,
  resolveLycheeArch,
} from "./lint-docs.ts";

const workflowPath = path.join(import.meta.dir, "..", ".github/workflows/lint-docs.yml");

interface WorkflowStep {
  uses?: string;
  with?: { args?: string };
}

interface Workflow {
  jobs: Record<string, { steps: WorkflowStep[] }>;
}

/** Whether `value` is a parsed workflow document with a `jobs` mapping. */
function isWorkflow(value: unknown): value is Workflow {
  return (
    typeof value === "object" &&
    value !== null &&
    "jobs" in value &&
    typeof value.jobs === "object" &&
    value.jobs !== null
  );
}

/** Parses the lint-docs workflow and returns its steps. */
function readWorkflowSteps(): WorkflowStep[] {
  const workflow: unknown = Bun.YAML.parse(readFileSync(workflowPath, "utf8"));
  if (!isWorkflow(workflow)) {
    throw new Error("lint-docs workflow has no jobs mapping");
  }
  return Object.values(workflow.jobs).flatMap((job) => job.steps);
}

/** Splits a shell-like argument string, treating single-quoted runs as one token. */
function tokenize(input: string): string[] {
  return [...input.matchAll(/'([^']*)'|(\S+)/g)].map((match) => match[1] ?? match[2] ?? "");
}

describe("workflow parity", () => {
  test("the script args match the workflow args byte for byte", () => {
    const lycheeStep = readWorkflowSteps().find((step) =>
      step.uses?.startsWith("lycheeverse/lychee-action@"),
    );
    expect(lycheeStep?.with?.args).toBeDefined();
    expect(tokenize(lycheeStep?.with?.args ?? "")).toEqual([...LYCHEE_ARGS]);
  });

  test("the workflow pins the lychee-action version the script assumes", () => {
    const source = readFileSync(workflowPath, "utf8");
    const match = /uses:\s*lycheeverse\/lychee-action@\S+\s*#\s*(v[\d.]+)/.exec(source);
    expect(match?.[1]).toBe(EXPECTED_LYCHEE_ACTION_VERSION);
  });
});

describe("resolveLycheeArch", () => {
  test("maps x64 and arm64 on linux", () => {
    expect(resolveLycheeArch("x64", "linux")).toBe("x86_64");
    expect(resolveLycheeArch("arm64", "linux")).toBe("aarch64");
  });

  test("rejects unknown architectures and non-linux platforms", () => {
    expect(() => resolveLycheeArch("ia32", "linux")).toThrow(/unsupported architecture/);
    expect(() => resolveLycheeArch("x64", "darwin")).toThrow(/unsupported platform/);
  });
});

describe("lychee paths", () => {
  test("builds the release asset URL", () => {
    expect(buildLycheeDownloadUrl(LYCHEE_VERSION, "x86_64")).toBe(
      `https://github.com/lycheeverse/lychee/releases/download/lychee-${LYCHEE_VERSION}/lychee-x86_64-unknown-linux-gnu.tar.gz`,
    );
  });

  test("nests the cached binary under lychee/<version>/lychee", () => {
    expect(buildLycheeCacheRelativePath("v0.24.2")).toBe(path.join("lychee", "v0.24.2", "lychee"));
  });
});

describe("lychee checksum pin", () => {
  test("pins a 64-hex digest for each supported architecture", () => {
    for (const digest of Object.values(LYCHEE_SHA256)) {
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("rejects bytes that do not hash to the pin", () => {
    expect(matchesLycheeChecksum(new TextEncoder().encode("tampered"), "x86_64")).toBe(false);
  });
});
