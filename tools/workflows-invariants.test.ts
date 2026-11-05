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
  readonly name?: string;
  readonly uses?: string;
  readonly "timeout-minutes"?: number;
  readonly needs?: string | readonly string[];
  readonly if?: string;
  readonly steps?: readonly WorkflowStep[];
  readonly permissions?: unknown;
  readonly strategy?: { readonly matrix?: Record<string, unknown> };
}

interface Workflow {
  readonly on?: unknown;
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

/**
 * Whether a top-level `permissions` value is `{}` or grants nothing beyond `contents: read`.
 */
function isReadOnlyPermissions(permissions: unknown): boolean {
  if (typeof permissions !== "object" || permissions === null) {
    return false;
  }
  return Object.entries(permissions).every(
    ([scope, level]) => level === "none" || (scope === "contents" && level === "read"),
  );
}

/**
 * Extracts the text of every `run:` block, single-line and multi-line, from raw workflow text.
 */
function runBlocks(raw: string): string[] {
  const lines = raw.split("\n");
  const blocks: string[] = [];
  for (const [index, line] of lines.entries()) {
    const match = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(line);
    if (match === null) {
      continue;
    }
    const indent = (match[1] ?? "").length;
    const inline = match[2] ?? "";
    if (!/^[|>][+-]?\d*$/.test(inline)) {
      blocks.push(inline);
      continue;
    }
    const body: string[] = [];
    for (const next of lines.slice(index + 1)) {
      const nextIndent = next.length - next.trimStart().length;
      if (next.trim() !== "" && nextIndent <= indent) {
        break;
      }
      body.push(next);
    }
    blocks.push(body.join("\n"));
  }
  return blocks;
}

/**
 * Lists the trigger names under a workflow's `on:` mapping.
 */
function triggerNames(workflow: Workflow | undefined): string[] {
  const triggers = workflow?.on;
  return typeof triggers === "object" && triggers !== null ? Object.keys(triggers) : [];
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

  test("never uses pull_request_target", () => {
    expect(JSON.stringify(workflow.on ?? {})).not.toContain("pull_request_target");
  });

  test("has no expression interpolation inside run blocks", () => {
    const offenders = runBlocks(raw).filter((block) => block.includes("${{"));
    expect(offenders).toEqual([]);
  });

  test("top-level permissions are contents: read or stricter", () => {
    expect(isReadOnlyPermissions(workflow.permissions)).toBe(true);
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
    expect(Object.keys(ci?.jobs ?? {})).toContain("check");
    expect(Object.keys(ci?.jobs ?? {})).toContain("test");
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

  test("smoke-runs the emet-darwin-arm64 binary", () => {
    const raw = workflows.find(({ fileName }) => fileName === "ci.yml")?.raw ?? "";
    expect(raw).toContain("./dist/emet-darwin-arm64 --version");
    expect(raw).not.toContain("forge-darwin-arm64");
  });
});

describe("ci.yml commitlint and manual runs", () => {
  const ci = workflows.find(({ fileName }) => fileName === "ci.yml");

  test("has a Commitlint job on pull requests that ci-passed needs", () => {
    const job = ci?.workflow.jobs["commitlint"];
    expect(job?.name).toBe("Commitlint");
    expect(job?.if).toContain("pull_request");
    expect(neededJobs(ci?.workflow.jobs["ci-passed"])).toContain("commitlint");
  });

  test("ci-passed fails only on failure or cancelled", () => {
    const raw = ci?.raw ?? "";
    expect(raw).toContain('[ "$result" = "failure" ]');
    expect(raw).toContain('[ "$result" = "cancelled" ]');
    expect(raw).not.toContain('!= "success"');
  });

  test("the Test job runs test:coverage", () => {
    expect(ci?.raw).toContain("bun run test:coverage");
  });

  test("macOS smoke writes the binary size to the job summary", () => {
    expect(ci?.raw).toContain("GITHUB_STEP_SUMMARY");
  });

  test("ci.yml and labels.yml allow workflow_dispatch", () => {
    for (const fileName of ["ci.yml", "labels.yml"]) {
      const file = workflows.find((entry) => entry.fileName === fileName);
      expect(triggerNames(file?.workflow)).toContain("workflow_dispatch");
    }
  });
});

describe("codeql.yml and scorecard.yml", () => {
  const codeql = workflows.find(({ fileName }) => fileName === "codeql.yml");
  const scorecard = workflows.find(({ fileName }) => fileName === "scorecard.yml");

  test("CodeQL job is named, private-guarded and scans both languages", () => {
    const job = codeql?.workflow.jobs["analyze"];
    expect(job?.name).toBe("CodeQL");
    expect(job?.if).toContain("!github.event.repository.private");
    expect(job?.strategy?.matrix?.["language"]).toEqual(["javascript-typescript", "actions"]);
  });

  test("Scorecard runs weekly with empty top-level permissions and a guarded job", () => {
    const job = scorecard?.workflow.jobs["analysis"];
    expect(job?.name).toBe("Scorecard");
    expect(scorecard?.workflow.permissions).toEqual({});
    expect(job?.if).toContain("!github.event.repository.private");
    expect(job?.permissions).toMatchObject({ "security-events": "write" });
    expect(triggerNames(scorecard?.workflow)).toContain("schedule");
  });
});

describe("lint-docs.yml", () => {
  test("explains the lychee flags", () => {
    const raw = workflows.find(({ fileName }) => fileName === "lint-docs.yml")?.raw ?? "";
    expect(raw).toContain("# --offline");
    expect(raw).toContain("# --include-fragments");
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
      "emet-linux-x64",
      "emet-linux-arm64",
      "emet-darwin-x64",
      "emet-darwin-arm64",
      "SHA256SUMS",
    ]) {
      expect(raw).toContain(asset);
    }
  });
});
