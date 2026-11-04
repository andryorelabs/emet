/**
 * `emet review-package <base> <head> [--out <file>]` — bundles the commit
 * list, `--stat` and a `-U10` diff for a ticket's range into one file the
 * reviewer reads by path. Exits 3 when the range is empty or `head` is not a
 * descendant of `base`, so a reviewer is never handed a package that cannot
 * be the worker's actual output.
 */

import { RUN_DIR } from "./names";
import { optionalProperty } from "./optional";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const USAGE = `usage: emet review-package <base> <head> [--out <file>]`;

const EXIT_BAD_RANGE = 3;

type RangeProblem = "unresolvable" | "not-descendant" | "empty";

export type ReviewPackage =
  | { readonly ok: true; readonly content: string; readonly commitCount: number }
  | { readonly ok: false; readonly problem: RangeProblem; readonly detail: string };

type GitResult = { readonly exitCode: number; readonly stdout: string };

async function runGit(args: readonly string[], cwd: string): Promise<GitResult> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { exitCode, stdout };
}

export async function buildReviewPackage(
  base: string,
  head: string,
  cwd: string = process.cwd(),
): Promise<ReviewPackage> {
  const range = `${base}..${head}`;
  for (const ref of [base, head]) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- git and gh calls stay sequential to keep output and side effects ordered
    const resolved = await runGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
    if (resolved.exitCode !== 0) {
      return { ok: false, problem: "unresolvable", detail: `cannot resolve "${ref}" to a commit` };
    }
  }
  const ancestry = await runGit(["merge-base", "--is-ancestor", base, head], cwd);
  if (ancestry.exitCode !== 0) {
    return {
      ok: false,
      problem: "not-descendant",
      detail: `${head} is not a descendant of ${base}`,
    };
  }
  const commits = await runGit(["log", "--reverse", "--format=%h %s", range], cwd);
  const commitLines = commits.stdout.split("\n").filter((line) => line.length > 0);
  if (commitLines.length === 0) {
    return { ok: false, problem: "empty", detail: `no commits in ${range}` };
  }
  const stat = await runGit(["diff", "--stat", range], cwd);
  const diff = await runGit(["diff", "-U10", range], cwd);
  const content = [
    `# Review package ${range}`,
    "",
    "## Commits",
    commitLines.join("\n"),
    "",
    "## Stat",
    stat.stdout.trimEnd(),
    "",
    "## Diff (-U10)",
    diff.stdout,
  ].join("\n");
  return { ok: true, content, commitCount: commitLines.length };
}

function parseArguments(argv: readonly string[]): {
  base?: string;
  head?: string;
  out?: string;
  bad: boolean;
} {
  const positional: string[] = [];
  let out: string | undefined;
  let bad = false;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--out") {
      out = argv[++index];
      if (!out) bad = true;
    } else {
      positional.push(argv[index]!);
    }
  }
  return {
    ...optionalProperty("base", positional[0]),
    ...optionalProperty("head", positional[1]),
    ...optionalProperty("out", out),
    bad,
  };
}

export async function run(argv: string[]): Promise<void> {
  const { base, head, out, bad } = parseArguments(argv);
  if (!base || !head || bad) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const result = await buildReviewPackage(base, head);
  if (!result.ok) {
    console.error(`emet review-package: ${result.problem} — ${result.detail}`);
    process.exitCode = EXIT_BAD_RANGE;
    return;
  }
  const target = path.resolve(
    out ?? `${RUN_DIR}/review-package-${head.replace(/[^\w.-]/g, "_")}.md`,
  );
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, result.content);
  console.log(target);
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
