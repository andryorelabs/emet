import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { present } from "./present";
import { BROWSER_AXIS_PROMPT } from "./review-run";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const AGENTS_DIRECTORY = join(REPO_ROOT, "agents");

/**
 * Byte ceilings, measured on trunk after wave 4 plus ~4% headroom. Raising one
 * is a reviewed decision: edit the number here, in the same PR as the growth.
 */
const BYTE_CEILINGS: Readonly<Record<string, number>> = {
  "commands/doctor.md": 570,
  "commands/init.md": 570,
  "commands/run.md": 9600,
  "commands/setup.md": 1150,
  "emet/reference/incidents.md": 12950,
  "emet/reference/phases-1-5.md": 12590,
  "emet/reference/phases-quick.md": 2050,
  "emet/reference/phases-6-7-dispatch.md": 16900,
  "emet/reference/phases-8-landing.md": 9000,
  "emet/reference/phases-8-spec-landing.md": 3850,
  "emet/reference/living-specs.md": 1330,
  "emet/reference/phases-8-review.md": 9950,
  "emet/reference/phases-9-handoff.md": 7770,
  "emet/reference/reviewer-prompt.md": 4150,
  "emet/reference/tracker-github.md": 3930,
  "emet/reference/tracker-linear.md": 5400,
  "emet/reference/tracker-local.md": 1870,
  "emet/reference/worker-prompt.md": 7680,
  "agents/emet-reviewer.md": 2180,
  "agents/emet-worker.md": 1230,
};

/**
 * Hard cap for every reference file, independent of its ceiling: a prompt over
 * this size is split, not given a bigger ceiling (compaction safety).
 */
const REFERENCE_HARD_CAP_BYTES = 20_000;

const PINNED_DIRECTORIES = ["emet/reference", "agents"] as const;

const BANNED_PHRASES: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  {
    label: "inline `bun -e` snippet invoking claims/slots",
    pattern: /^\s*(?:\$\s*)?bun -e\b|\bbun -e\s+["'`]/m,
  },
  { label: "{{spec_summary_15_lines}} placeholder", pattern: /\{\{spec_summary_15_lines\}\}/ },
];

function listMarkdown(directory: string): string[] {
  return readdirSync(join(REPO_ROOT, directory))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `${directory}/${name}`);
}

const PINNED_FILES = [
  ...listMarkdown("commands"),
  ...PINNED_DIRECTORIES.flatMap(listMarkdown),
].toSorted();

describe("prompt byte budget", () => {
  test("every prompt file has a pinned ceiling and every ceiling has a file", () => {
    expect(Object.keys(BYTE_CEILINGS).toSorted()).toEqual(PINNED_FILES);
  });

  for (const relativePath of PINNED_FILES) {
    test(`${relativePath} stays within its ceiling`, () => {
      const size = readFileSync(join(REPO_ROOT, relativePath)).byteLength;
      const ceiling = BYTE_CEILINGS[relativePath];
      expect(ceiling).toBeDefined();
      expect(size).toBeLessThanOrEqual(present(ceiling));
    });
  }
});

describe("reference hard cap", () => {
  for (const relativePath of listMarkdown("emet/reference")) {
    test(`${relativePath} is at most ${REFERENCE_HARD_CAP_BYTES} bytes`, () => {
      const size = readFileSync(join(REPO_ROOT, relativePath)).byteLength;
      expect(size).toBeLessThanOrEqual(REFERENCE_HARD_CAP_BYTES);
    });
  }

  test("no ceiling for a reference file exceeds the hard cap", () => {
    for (const [relativePath, ceiling] of Object.entries(BYTE_CEILINGS)) {
      if (relativePath.startsWith("emet/reference/")) {
        expect(ceiling).toBeLessThanOrEqual(REFERENCE_HARD_CAP_BYTES);
      }
    }
  });
});

function readReference(name: string): string {
  return readFileSync(join(REPO_ROOT, "emet/reference", name), "utf8");
}

describe("living specs prompts", () => {
  test("living-specs.md states every delta rule and the exact commit message", () => {
    const content = readReference("living-specs.md");
    for (const required of [
      "emet spec-merge --spec <id> --deltas-dir",
      "## ADDED Requirements",
      "## MODIFIED Requirements",
      "## REMOVED Requirements",
      "### Requirement: <descriptive name>",
      "#### Scenario: <name>",
      "Source: #<spec> S<n>",
      "keeps every existing scenario name",
      "docs: 📝 update living specs for spec #<id>",
      "fix the deltas once and rerun",
    ]) {
      expect(content).toContain(required);
    }
  });

  test("phases-8-review.md sends the last wave to living-specs.md", () => {
    expect(readReference("phases-8-review.md")).toContain("living-specs.md");
  });

  for (const name of ["phases-8-landing.md", "phases-8-spec-landing.md"]) {
    test(`${name} does not run spec-merge after a merge`, () => {
      expect(readReference(name)).not.toContain("spec-merge");
    });
  }
});

describe("memory prompts", () => {
  test("phases 1, 9 and quick run the memory commands", () => {
    expect(readReference("phases-1-5.md")).toContain("emet memory search --json");
    expect(readReference("phases-9-handoff.md")).toContain("emet memory save --json");
    expect(readReference("phases-quick.md")).toContain("emet memory save --json");
  });

  test("no worker prompt mentions emet memory", () => {
    expect(readReference("worker-prompt.md")).not.toContain("emet memory");
    expect(readReference("phases-6-7-dispatch.md")).not.toContain("emet memory");
    for (const agent of readdirSync(AGENTS_DIRECTORY)) {
      expect(readFileSync(join(AGENTS_DIRECTORY, agent), "utf8")).not.toContain("emet memory");
    }
  });
});

describe("quick run prompts", () => {
  test("phases-quick.md states the quick steps", () => {
    const content = readReference("phases-quick.md");
    for (const required of [
      "emet approve --run",
      "--quick",
      "emet assess --base <trunk> --head <integration branch> --quick",
      "living-specs.md",
      "emet gate",
      "Never run `emet chain`",
      "`--draft` or `--dispatch`",
      "`--no-promote` is accepted",
    ]) {
      expect(content).toContain(required);
    }
  });

  test("run.md lists --quick and the fast path writes one folded ticket", () => {
    expect(readFileSync(join(REPO_ROOT, "commands/run.md"), "utf8")).toContain(
      "**`--quick <feature>`**",
    );
    expect(readReference("phases-1-5.md")).toContain("write one ticket marked `folded`");
  });
});

describe("retired phrases", () => {
  for (const relativePath of PINNED_FILES) {
    test(`${relativePath} has no retired phrase`, () => {
      const content = readFileSync(join(REPO_ROOT, relativePath), "utf8");
      const hits = BANNED_PHRASES.filter(({ pattern }) => pattern.test(content)).map(
        ({ label }) => label,
      );
      expect(hits).toEqual([]);
    });
  }

  test("the ban patterns still catch what they target", () => {
    const [inlineSnippet, placeholder] = BANNED_PHRASES;
    expect(
      present(inlineSnippet).pattern.test("run bun -e \"import { reserve } from './claims'\""),
    ).toBe(true);
    expect(present(inlineSnippet).pattern.test("```\nbun -e console.log(1)\n```")).toBe(true);
    expect(
      present(inlineSnippet).pattern.test("never call it through an inline `bun -e` snippet"),
    ).toBe(false);
    expect(present(placeholder).pattern.test("{{spec_summary_15_lines}}")).toBe(true);
  });
});

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

describe("browser verification prompts", () => {
  test("the reviewer prompt carries the Browser axis behind {{browser_verify}}", () => {
    const reviewer = read("emet/reference/reviewer-prompt.md");
    expect(reviewer).toContain("{{browser_verify}}");
    expect(reviewer).toContain("agent-browser skills get core");
    expect(reviewer).toContain("--session review-{{run_id}}");
    expect(reviewer).toContain("verification-gap");
  });

  test("the review-run constant equals the fenced Browser axis block", () => {
    const reviewer = read("emet/reference/reviewer-prompt.md");
    const fenced = /## Browser axis text[\s\S]*?```\n([\s\S]*?)\n```/.exec(reviewer);
    expect(fenced?.[1]).toBe(BROWSER_AXIS_PROMPT);
  });

  test("the closeout fills {{browser_verify}} only on browserVerify.run: true", () => {
    const closeout = read("emet/reference/phases-8-review.md");
    expect(closeout).toContain("{{browser_verify}}");
    expect(closeout).toContain("browserVerify.run: true");
  });

  test("the worker prompt has the optional browser line", () => {
    const worker = read("emet/reference/worker-prompt.md");
    expect(worker).toContain("Optional:");
    expect(worker).toContain("--session <ticket>");
  });

  test("no prompt pins an agent-browser version", () => {
    for (const path of listMarkdown("emet/reference")) {
      expect(read(path)).not.toMatch(/agent-browser@/);
    }
  });
});

describe("coverage and user option prompts", () => {
  test("the reviewer prompt asks for the Coverage verdicts file, not prose verdicts", () => {
    const reviewer = read("emet/reference/reviewer-prompt.md");
    expect(reviewer).toContain(".emet/coverage-{{run_id}}.json");
    expect(reviewer).not.toContain("S<n>: met | partial | unmet");
    expect(reviewer).toContain("userOption");
    expect(reviewer).toContain('"s"');
  });

  test("the reviewer agent names the Coverage verdicts file", () => {
    const agent = read("agents/emet-reviewer.md");
    expect(agent).toContain(".emet/coverage-<runId>.json");
    expect(agent).toContain("userOption");
  });

  test("Phase 8 records findings with --base and coverage with --expect", () => {
    const review = read("emet/reference/phases-8-review.md");
    expect(review).toContain("--findings <f> --base <trunk>");
    expect(review).toContain("--coverage <f> --expect");
    expect(review).toContain("pre-existing");
  });

  test("Phase 2 marks user option requirements", () => {
    expect(read("emet/reference/phases-1-5.md")).toContain("(user option)");
  });
});

describe("dual review dispatch", () => {
  test("phases-8-review.md runs both reviewers on dualReview.run and merges", () => {
    const review = readReference("phases-8-review.md");
    for (const required of [
      "dualReview.run: true",
      "emet review-run --tier high",
      "emet review --merge <claude.json> <codex.json>",
      'agreement: "single"',
      "emet review --rule",
      "Only the Claude reviewer's coverage",
    ]) {
      expect(review).toContain(required);
    }
  });
});
