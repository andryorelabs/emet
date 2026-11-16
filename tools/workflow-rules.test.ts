import { describe, expect, test } from "bun:test";

import {
  HARDEN_RUNNER_ACTION,
  LITERAL_JOBS,
  MATRIX_RUNS_ON,
  PENDING_RULES,
  ROUTED_JOBS,
  ROUTED_RUNS_ON,
  workflowViolations,
} from "./workflow-rules.ts";

const HARDEN_STEP = {
  uses: `${HARDEN_RUNNER_ACTION}@0000000000000000000000000000000000000000`,
  with: { "egress-policy": "audit" },
};
const CONCURRENCY = { group: "${{ github.workflow }}-${{ github.ref }}" };

/**
 * Builds a workflow whose one job, `check`, is routed in `ci.yml` and passes every rule.
 */
function routedWorkflow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    concurrency: CONCURRENCY,
    jobs: {
      check: {
        "runs-on": ROUTED_RUNS_ON,
        steps: [HARDEN_STEP, { run: "bun run check" }],
        ...overrides,
      },
    },
  };
}

describe("job tables", () => {
  const routedKeys = ROUTED_JOBS.map(({ key }) => key);
  const literalKeys = LITERAL_JOBS.map(({ key }) => key);

  test("every routed and literal job gives a reason", () => {
    const empty = [...ROUTED_JOBS, ...LITERAL_JOBS].filter(({ reason }) => reason.trim() === "");
    expect(empty).toEqual([]);
  });

  test("keys are file:job, unique and never in both tables", () => {
    const keys = [...routedKeys, ...literalKeys];
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((key) => !/^[\w-]+\.yml:[\w-]+$/.test(key))).toEqual([]);
  });

  test("CodeQL and the Bun canary are routed", () => {
    expect(routedKeys).toContain("codeql.yml:analyze");
    expect(routedKeys).toContain("ci.yml:bun-canary");
  });

  test("release, Scorecard, deploy and macOS stay literal on GitHub-hosted runners", () => {
    const expected = [
      "release.yml:verify",
      "release.yml:release",
      "release.yml:binary",
      "release.yml:publish",
      "scorecard.yml:analysis",
      "deploy-site.yml:deploy",
      "ci.yml:test-macos",
    ];
    expect(expected.filter((key) => !literalKeys.includes(key))).toEqual([]);
    const runners = LITERAL_JOBS.flatMap(({ runner }) => runner);
    expect(runners.filter((runner) => !/^(ubuntu|macos)-/.test(runner))).toEqual([]);
  });

  test("the release binary matrix covers the four native targets", () => {
    const binary = LITERAL_JOBS.find(({ key }) => key === "release.yml:binary");
    expect(binary?.runner).toEqual([
      "ubuntu-latest",
      "ubuntu-24.04-arm",
      "macos-latest",
      "macos-15-intel",
    ]);
  });

  test("every pending rule names a job or workflow and a reason", () => {
    expect(PENDING_RULES.filter(({ reason }) => reason.trim() === "")).toEqual([]);
  });
});

describe("workflowViolations", () => {
  test("accepts a workflow that follows every rule", () => {
    expect(workflowViolations("ci.yml", routedWorkflow())).toEqual([]);
  });

  test("rejects a document without a jobs mapping", () => {
    expect(workflowViolations("ci.yml", "jobs: none")).toEqual(["ci.yml: has no jobs mapping"]);
  });

  test("flags a workflow without concurrency", () => {
    const { concurrency: _dropped, ...workflow } = routedWorkflow();
    expect(workflowViolations("ci.yml", workflow)).toEqual(["ci.yml: declares no concurrency"]);
  });

  test("flags a routed job that uses another runner expression", () => {
    const workflow = routedWorkflow({
      "runs-on": "${{ vars.BLACKSMITH_RUNNER || 'ubuntu-latest' }}",
    });
    expect(workflowViolations("ci.yml", workflow)).toEqual([
      "ci.yml:check: routed job must run on the BLACKSMITH_RUNNER expression",
    ]);
  });

  test("flags a literal job on the wrong runner", () => {
    const workflow = {
      concurrency: CONCURRENCY,
      jobs: { "test-macos": { "runs-on": "self-hosted", steps: [HARDEN_STEP] } },
    };
    expect(workflowViolations("ci.yml", workflow)).toEqual([
      "ci.yml:test-macos: literal job must run on macos-latest",
    ]);
  });

  test("flags a job listed in neither table", () => {
    const workflow = {
      concurrency: CONCURRENCY,
      jobs: { extra: { "runs-on": "ubuntu-latest", steps: [HARDEN_STEP] } },
    };
    expect(workflowViolations("ci.yml", workflow)).toEqual([
      "ci.yml:extra: job is in neither ROUTED_JOBS nor LITERAL_JOBS",
    ]);
  });

  test("flags a job whose first step is not harden-runner", () => {
    const workflow = routedWorkflow({ steps: [{ run: "bun run check" }] });
    expect(workflowViolations("ci.yml", workflow)).toEqual([
      "ci.yml:check: first step must be step-security/harden-runner",
    ]);
  });

  test("flags a bun run step that names no root script", () => {
    const workflow = routedWorkflow({ steps: [HARDEN_STEP, { run: "bun run no-such-script" }] });
    expect(workflowViolations("ci.yml", workflow)).toEqual([
      'ci.yml:check: "bun run no-such-script" names no root package.json script',
    ]);
  });

  test("flags a step that calls another package manager", () => {
    const workflow = routedWorkflow({
      steps: [HARDEN_STEP, { run: "echo start\nnpx prettier ." }],
    });
    expect(workflowViolations("ci.yml", workflow)).toEqual([
      'ci.yml:check: "npx prettier ." calls a package manager other than bun',
    ]);
  });

  test("flags a deploy job that is not guarded to main", () => {
    const workflow = {
      concurrency: CONCURRENCY,
      jobs: { ship: { "runs-on": "ubuntu-latest", steps: [HARDEN_STEP] } },
    };
    expect(workflowViolations("deploy-other.yml", workflow)).toContain(
      "deploy-other.yml:ship: deploy job must be guarded with if: github.ref == 'refs/heads/main'",
    );
  });

  test("skips the runner check for a job that calls a reusable workflow", () => {
    const workflow = {
      concurrency: CONCURRENCY,
      jobs: { check: { uses: "./.github/workflows/other.yml" } },
    };
    expect(workflowViolations("ci.yml", workflow)).toEqual([]);
  });

  test("release.yml has no pending rule left", () => {
    expect(PENDING_RULES.filter(({ target }) => target.startsWith("release.yml"))).toEqual([]);
  });

  test("accepts a matrix job on the matrix runner with exactly its listed runners", () => {
    expect(workflowViolations("release.yml", binaryWorkflow())).toEqual([]);
  });

  test("flags a matrix job that does not run on the matrix runner", () => {
    expect(
      workflowViolations("release.yml", binaryWorkflow({ "runs-on": "ubuntu-latest" })),
    ).toEqual([`release.yml:binary: matrix job must run on ${MATRIX_RUNS_ON}`]);
  });

  test("flags a matrix job whose matrix lists no include entries", () => {
    const workflow = binaryWorkflow({ strategy: { matrix: {} } });
    expect(workflowViolations("release.yml", workflow)).toEqual([
      "release.yml:binary: matrix runners must be exactly macos-15-intel, macos-latest, ubuntu-24.04-arm, ubuntu-latest",
    ]);
  });

  test("flags a matrix job that drops a native runner", () => {
    const workflow = binaryWorkflow({
      strategy: { matrix: { include: [{ runner: "ubuntu-latest" }] } },
    });
    expect(workflowViolations("release.yml", workflow)).toEqual([
      "release.yml:binary: matrix runners must be exactly macos-15-intel, macos-latest, ubuntu-24.04-arm, ubuntu-latest",
    ]);
  });
});

/**
 * Builds a release workflow whose one job, `binary`, is the native smoke matrix and passes every rule.
 */
function binaryWorkflow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const include = ["ubuntu-latest", "ubuntu-24.04-arm", "macos-latest", "macos-15-intel"].map(
    (runner) => ({ runner }),
  );
  return {
    concurrency: CONCURRENCY,
    jobs: {
      binary: {
        "runs-on": MATRIX_RUNS_ON,
        strategy: { matrix: { include } },
        steps: [HARDEN_STEP],
        ...overrides,
      },
    },
  };
}
