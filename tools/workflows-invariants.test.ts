import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW_DIRECTORY = join(import.meta.dir, "..", ".github", "workflows");
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;
const USES_LINE_PATTERN = /^\s*-?\s*uses:\s*(\S+?)(?:\s+#\s*(.*))?$/;

interface WorkflowStep {
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Record<string, unknown>;
  readonly env?: Record<string, unknown>;
}

interface WorkflowJob {
  readonly name?: string;
  readonly "runs-on"?: unknown;
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

  test("test scripts keep the root suites behind turbo", () => {
    const manifest = readFileSync("package.json", "utf8");
    expect(manifest).toContain('"test": "turbo run test test:root"');
    expect(manifest).toContain('"test:coverage": "turbo run test test:coverage:root"');
    expect(manifest).toContain('&& bun test --cwd emet"');
    expect(manifest).toContain('&& bun test --cwd emet --coverage"');
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

const ROUTED_RUNS_ON =
  "${{ github.event.pull_request.head.repo.fork && 'ubuntu-latest' || vars.BLACKSMITH_RUNNER || 'ubuntu-latest' }}";
const ROUTED_JOBS = [
  "ci.yml:check",
  "ci.yml:test",
  "ci.yml:commitlint",
  "ci.yml:ci-passed",
  "labels.yml:sync",
  "lint-docs.yml:check-links",
  "lint-pr.yml:validate-title",
  "lint-workflows.yml:lint",
];
const LITERAL_RUNNERS = new Set(["ubuntu-latest", "macos-latest"]);

describe("runner routing", () => {
  const jobs = workflows.flatMap(({ fileName, workflow }) =>
    Object.entries(workflow.jobs).map(([name, job]) => ({ key: `${fileName}:${name}`, job })),
  );

  test("routed jobs use exactly the BLACKSMITH_RUNNER expression", () => {
    const wrong = ROUTED_JOBS.filter(
      (key) => jobs.find((entry) => entry.key === key)?.job["runs-on"] !== ROUTED_RUNS_ON,
    );
    expect(wrong).toEqual([]);
  });

  test("every other job runs on a literal GitHub-hosted runner", () => {
    const wrong = jobs
      .filter(({ key }) => !ROUTED_JOBS.includes(key))
      .filter(({ job }) => !LITERAL_RUNNERS.has(String(job["runs-on"])))
      .map(({ key }) => key);
    expect(wrong).toEqual([]);
  });

  test("no workflow reads BLACKSMITH_RUNNER outside the routed jobs or names a self-hosted runner", () => {
    const readers = jobs
      .filter(({ job }) => String(job["runs-on"]).includes("BLACKSMITH_RUNNER"))
      .map(({ key }) => key);
    expect(readers.toSorted()).toEqual(ROUTED_JOBS.toSorted());
    for (const { raw } of workflows) {
      expect(raw).not.toMatch(/vps-|self-hosted|CI_RUNNER/);
    }
  });
});

const DEPLOY_SCRIPT = join(import.meta.dir, "..", ".github", "scripts", "deploy-coolify.sh");
const DEPLOY_PATHS = [
  "apps/site/**",
  "docs/**",
  "CHANGELOG.md",
  ".github/scripts/deploy-coolify.sh",
  ".github/workflows/deploy-site.yml",
];

/**
 * Reads one key of a mapping, or `undefined` when the value is not a mapping.
 */
function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return Object.entries(value).find(([name]) => name === key)?.[1];
}

describe("deploy-site.yml", () => {
  const deploy = workflows.find(({ fileName }) => fileName === "deploy-site.yml");
  const jobs = Object.values(deploy?.workflow.jobs ?? {});
  const steps = jobs.flatMap((job) => job.steps ?? []);

  test("exists", () => {
    expect(deploy).toBeDefined();
    expect(jobs.length).toBeGreaterThan(0);
  });

  test("runs on push to main, path-filtered, and on workflow_dispatch", () => {
    const push = field(deploy?.workflow.on, "push");
    expect(triggerNames(deploy?.workflow).toSorted()).toEqual(["push", "workflow_dispatch"]);
    expect(field(push, "branches")).toEqual(["main"]);
    expect(field(push, "paths")).toEqual(DEPLOY_PATHS);
  });

  test("has contents: read permissions at the top and on every job", () => {
    expect(deploy?.workflow.permissions).toEqual({ contents: "read" });
    for (const job of jobs) {
      expect(job.permissions).toEqual({ contents: "read" });
    }
  });

  test("never cancels a deploy in progress", () => {
    expect(deploy?.workflow.concurrency?.["cancel-in-progress"]).toBe(false);
  });

  test("smoke-tests the image before deploying it", () => {
    const runs = steps.map((step) => step.run ?? "");
    const smoke = runs.findIndex((run) => run.includes("apps/site/docker/smoke.sh"));
    const ship = runs.findIndex((run) => run.includes(".github/scripts/deploy-coolify.sh"));
    expect(smoke).toBeGreaterThanOrEqual(0);
    expect(ship).toBeGreaterThan(smoke);
  });

  test("hands the token and app UUID only to the deploy step, through env", () => {
    const withSecret = steps.filter((step) => JSON.stringify(step).includes("secrets."));
    expect(withSecret).toHaveLength(1);
    expect(withSecret[0]?.run).toContain(".github/scripts/deploy-coolify.sh");
    expect(withSecret[0]?.env).toEqual({
      COOLIFY_API_TOKEN: "${{ secrets.COOLIFY_API_TOKEN }}",
      COOLIFY_APP_UUID: "${{ vars.SITE_COOLIFY_APP_UUID }}",
    });
  });
});

describe("deploy-coolify.sh", () => {
  const script = readFileSync(DEPLOY_SCRIPT, "utf8");
  const fakeToken = "fake-token-never-printed-7f3a";

  /**
   * Runs the deploy script with a fake token and the given app UUID; it must exit before any request.
   */
  function runScript(appUuid: string): { exitCode: number; output: string } {
    const result = Bun.spawnSync(["bash", DEPLOY_SCRIPT], {
      env: {
        PATH: process.env["PATH"] ?? "",
        COOLIFY_API_TOKEN: fakeToken,
        COOLIFY_APP_UUID: appUuid,
      },
    });
    return {
      exitCode: result.exitCode,
      output: `${result.stdout.toString()}${result.stderr.toString()}`,
    };
  }

  test("runs in strict mode and never enables xtrace", () => {
    expect(script).toContain("set -euo pipefail");
    expect(script).not.toMatch(/set -[a-z]*x|set -o xtrace|bash -x/);
  });

  test("reads the token only to write curl's auth header, never into argv or output", () => {
    const tokenLines = script
      .split("\n")
      .filter(
        (line) => line.includes("${COOLIFY_API_TOKEN") || line.includes("$COOLIFY_API_TOKEN"),
      );
    const unexpected = tokenLines.filter(
      (line) =>
        !/^\s*if \[\[ -z "\$\{COOLIFY_API_TOKEN:-\}"/.test(line) &&
        !/printf 'Authorization: Bearer %s\\n' "\$\{COOLIFY_API_TOKEN\}"/.test(line),
    );
    expect(unexpected).toEqual([]);
    expect(script).not.toMatch(/echo[^\n]*COOLIFY_API_TOKEN\}/);
  });

  test("fails without printing the token when the app UUID is missing", () => {
    const { exitCode, output } = runScript("");
    expect(exitCode).toBe(1);
    expect(output).toContain("::error::");
    expect(output).not.toContain(fakeToken);
  });

  test("rejects an app UUID that is not a plain identifier", () => {
    const { exitCode, output } = runScript("abc/../../teams");
    expect(exitCode).toBe(1);
    expect(output).toContain("::error::");
    expect(output).not.toContain(fakeToken);
  });
});
