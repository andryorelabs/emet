import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW_DIRECTORY = join(import.meta.dir, "..", ".github", "workflows");
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;
const USES_LINE_PATTERN = /^\s*-?\s*uses:\s*(\S+?)(?:\s+#\s*(.*))?$/;

interface WorkflowStep {
  readonly uses?: string;
  readonly with?: Record<string, unknown>;
}

interface WorkflowJob {
  readonly uses?: string;
  readonly "timeout-minutes"?: number;
  readonly needs?: string | readonly string[];
  readonly if?: string;
  readonly steps?: readonly WorkflowStep[];
}

interface Workflow {
  readonly permissions?: unknown;
  readonly concurrency?: { readonly group?: string; readonly "cancel-in-progress"?: unknown };
  readonly jobs: Record<string, WorkflowJob>;
}

interface WorkflowFile {
  readonly fileName: string;
  readonly raw: string;
  readonly workflow: Workflow;
}

/**
 * Whether `value` is a parsed workflow document with a `jobs` mapping.
 */
function isWorkflow(value: unknown): value is Workflow {
  return (
    typeof value === "object" &&
    value !== null &&
    "jobs" in value &&
    typeof value.jobs === "object" &&
    value.jobs !== null
  );
}

/**
 * Parses one workflow file, failing when it has no `jobs` mapping.
 */
function parseWorkflow(raw: string): Workflow {
  const parsed: unknown = Bun.YAML.parse(raw);
  if (!isWorkflow(parsed)) {
    throw new Error("workflow has no jobs mapping");
  }
  return parsed;
}

/**
 * Parses every `.github/workflows/*.yml` file with `Bun.YAML.parse`.
 */
function readWorkflows(): WorkflowFile[] {
  return readdirSync(WORKFLOW_DIRECTORY)
    .filter((fileName) => fileName.endsWith(".yml"))
    .toSorted()
    .map((fileName) => {
      const raw = readFileSync(join(WORKFLOW_DIRECTORY, fileName), "utf8");
      return { fileName, raw, workflow: parseWorkflow(raw) };
    });
}

/**
 * Lists every external `uses:` reference of a workflow, local `./` actions excluded.
 */
function externalUses(raw: string): { reference: string; comment: string | undefined }[] {
  return raw
    .split("\n")
    .map((line) => USES_LINE_PATTERN.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ reference: match[1] ?? "", comment: match[2] }))
    .filter(({ reference }) => !reference.startsWith("./"));
}

/**
 * Normalizes a job's `needs` field to a sorted list of job names.
 */
function neededJobs(job: WorkflowJob | undefined): string[] {
  const needs = job?.needs;
  if (needs === undefined) {
    return [];
  }
  return (typeof needs === "string" ? [needs] : needs).toSorted();
}

const workflows = readWorkflows();

test("there is at least one workflow", () => {
  expect(workflows.length).toBeGreaterThan(0);
});

describe.each(workflows)("$fileName", ({ raw, workflow }) => {
  test("declares top-level permissions", () => {
    expect(workflow.permissions).toBeDefined();
  });

  test("every job has timeout-minutes unless it calls a reusable workflow", () => {
    const missing = Object.entries(workflow.jobs)
      .filter(([, job]) => job.uses === undefined && typeof job["timeout-minutes"] !== "number")
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  test("every external action is pinned to a full SHA with a version comment", () => {
    const violations = externalUses(raw)
      .filter(({ reference, comment }) => {
        const ref = reference.split("@")[1] ?? "";
        return !FULL_SHA_PATTERN.test(ref) || !/^v\d/.test(comment ?? "");
      })
      .map(({ reference }) => reference);
    expect(violations).toEqual([]);
  });

  test("every actions/checkout step sets persist-credentials: false", () => {
    const offenders = Object.values(workflow.jobs)
      .flatMap((job) => job.steps ?? [])
      .filter((step) => step.uses?.startsWith("actions/checkout@") === true)
      .filter((step) => step.with?.["persist-credentials"] !== false);
    expect(offenders).toEqual([]);
  });
});

describe("ci.yml", () => {
  const ci = workflows.find(({ fileName }) => fileName === "ci.yml")?.workflow;

  test("has read-only contents permissions", () => {
    expect(ci?.permissions).toEqual({ contents: "read" });
  });

  test("groups concurrency by workflow and ref and spares main", () => {
    expect(ci?.concurrency?.group).toContain("github.workflow");
    expect(ci?.concurrency?.group).toContain("github.ref");
    expect(String(ci?.concurrency?.["cancel-in-progress"])).toContain("refs/heads/main");
  });

  test("has separate check and test jobs", () => {
    expect(Object.keys(ci?.jobs ?? {})).toEqual(expect.arrayContaining(["check", "test"]));
  });

  test("ci-passed needs every other job and always runs", () => {
    const jobs = ci?.jobs ?? {};
    const others = Object.keys(jobs)
      .filter((name) => name !== "ci-passed")
      .toSorted();
    expect(neededJobs(jobs["ci-passed"])).toEqual(others);
    expect(jobs["ci-passed"]?.if).toContain("always()");
  });
});

describe("ci.yml macOS job", () => {
  const ci = workflows.find(({ fileName }) => fileName === "ci.yml")?.workflow;

  test("exists and is gated by ci-passed", () => {
    expect(Object.keys(ci?.jobs ?? {})).toContain("test-macos");
    expect(neededJobs(ci?.jobs["ci-passed"])).toContain("test-macos");
  });
});

describe("release.yml", () => {
  const release = workflows.find(({ fileName }) => fileName === "release.yml");

  test("checks the tag against plugin.json before building", () => {
    const raw = release?.raw ?? "";
    expect(raw).toContain(".claude-plugin/plugin.json");
    expect(raw.indexOf("plugin.json")).toBeLessThan(raw.indexOf("build-binaries.ts"));
  });

  test("uploads the four binaries and SHA256SUMS", () => {
    const raw = release?.raw ?? "";
    for (const asset of [
      "forge-linux-x64",
      "forge-linux-arm64",
      "forge-darwin-x64",
      "forge-darwin-arm64",
      "SHA256SUMS",
    ]) {
      expect(raw).toContain(asset);
    }
  });
});
