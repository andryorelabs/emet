import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { present } from "./present";
import { type PlanTicket, parseSpecItems, validatePlan } from "./validate";

const SPEC = `## Specs
- **S1**: first thing.
  Scenario: WHEN x THEN y
- **S2**: second thing, when a then b.
`;

const ticket = (overrides: Partial<PlanTicket> & { id: string }): PlanTicket => ({
  covers: [],
  surfaces: [`src/${overrides.id}.ts`],
  wave: 1,
  blockedBy: [],
  folded: false,
  ...overrides,
});

const codes = (result: ReturnType<typeof validatePlan>) => result.findings.map((f) => f.code);

describe("validatePlan", () => {
  test("parses multi-line spec items", () => {
    expect([...parseSpecItems(SPEC).keys()]).toEqual(["S1", "S2"]);
  });

  test("passes a fully covered, disjoint plan", () => {
    const result = validatePlan({
      specMarkdown: SPEC,
      tickets: [ticket({ id: "A", covers: ["S1"] }), ticket({ id: "B", covers: ["S2"] })],
    });
    expect(result).toEqual({ ok: true, findings: [] });
  });

  test("flags uncovered S#, empty tickets, unknown S#", () => {
    const result = validatePlan({
      specMarkdown: SPEC,
      tickets: [ticket({ id: "A", covers: ["S1", "S9"] }), ticket({ id: "B" })],
    });
    expect(result.ok).toBe(false);
    const found = codes(result);
    const expected: typeof found = [
      "uncovered-spec-item",
      "ticket-covers-nothing",
      "unknown-spec-item",
    ];
    for (const code of expected) {
      expect(found).toContain(code);
    }
  });

  test("flags S# without a scenario", () => {
    const result = validatePlan({
      specMarkdown: "- **S1**: plain statement.\n",
      tickets: [ticket({ id: "A", covers: ["S1"] })],
    });
    expect(codes(result)).toEqual(["missing-scenario"]);
  });

  test("flags overlapping surfaces only within the same wave", () => {
    const tickets = [
      ticket({ id: "A", covers: ["S1"], surfaces: ["src/**"] }),
      ticket({ id: "B", covers: ["S2"], surfaces: ["src/x.ts"] }),
    ];
    expect(codes(validatePlan({ specMarkdown: SPEC, tickets }))).toEqual(["surface-overlap"]);
    const split = [present(tickets[0]), { ...present(tickets[1]), wave: 2 }];
    expect(validatePlan({ specMarkdown: SPEC, tickets: split }).ok).toBe(true);
  });

  test("rejects cycles and unknown blockers", () => {
    const cyclic = validatePlan({
      specMarkdown: SPEC,
      tickets: [
        ticket({ id: "A", covers: ["S1"], blockedBy: ["B"] }),
        ticket({ id: "B", covers: ["S2"], blockedBy: ["A"] }),
      ],
    });
    expect(codes(cyclic)).toContain("dependency-cycle");
    const unknown = validatePlan({
      specMarkdown: SPEC,
      tickets: [ticket({ id: "A", covers: ["S1", "S2"], blockedBy: ["Z"] })],
    });
    expect(codes(unknown)).toContain("unknown-blocker");
  });

  test("warns (without failing) on small unfolded tickets", () => {
    const small = validatePlan({
      specMarkdown: SPEC,
      inlineMaxLines: 100,
      tickets: [ticket({ id: "A", covers: ["S1", "S2"], newSurfaceLines: 100 })],
    });
    expect(small.ok).toBe(true);
    expect(codes(small)).toEqual(["undersized-ticket"]);
    const folded = validatePlan({
      specMarkdown: SPEC,
      tickets: [ticket({ id: "A", covers: ["S1", "S2"], newSurfaceLines: 50, folded: true })],
    });
    expect(folded.findings).toEqual([]);
    const big = validatePlan({
      specMarkdown: SPEC,
      tickets: [ticket({ id: "A", covers: ["S1", "S2"], newSurfaceLines: 101 })],
    });
    expect(big.findings).toEqual([]);
  });
});

describe("local tracker spec source", () => {
  test("reads .scratch/<id>/spec.md without gh on PATH", async () => {
    const repo = realpathSync(mkdtempSync(path.join(tmpdir(), "validate-local-")));
    try {
      await Bun.$`git -C ${repo} init -q -b main`.quiet();
      writeFileSync(path.join(repo, "emet.config.json"), '{"tracker":{"kind":"local"}}');
      mkdirSync(path.join(repo, ".scratch/feat"), { recursive: true });
      writeFileSync(path.join(repo, ".scratch/feat/spec.md"), SPEC);
      const tickets = path.join(repo, "tickets.json");
      writeFileSync(
        tickets,
        JSON.stringify([
          { id: "A", covers: ["S1", "S2"], surfaces: ["src/a.ts"], wave: 1, blockedBy: [] },
        ]),
      );
      const binDirectory = path.join(repo, "bin");
      mkdirSync(binDirectory);
      symlinkSync(Bun.which("git") ?? "git", path.join(binDirectory, "git"));
      const entry = path.join(import.meta.dir, "validate.ts");
      const child = Bun.spawn([process.execPath, entry, "--spec", "feat", "--tickets", tickets], {
        cwd: repo,
        env: { PATH: binDirectory },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(stderr).toBe("");
      expect(code).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({ ok: true });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

const docs = (wave: number) =>
  ticket({ id: "DOC", covers: ["S1"], surfaces: ["docs/guide/cli.md"], wave });
const translations = (wave: number) =>
  ticket({ id: "TR", covers: ["S2"], surfaces: ["site/translations/es/cli.md"], wave });

describe("validatePlan coupled surfaces", () => {
  const pairs = [{ source: "docs/**/*.md", dependents: "site/translations/**" }];
  const plan = (tickets: PlanTicket[], coupledSurfaces?: typeof pairs) =>
    validatePlan(
      { specMarkdown: SPEC, tickets },
      coupledSurfaces === undefined ? {} : { coupledSurfaces },
    );

  test("a dependents ticket in a later wave is an error", () => {
    const result = plan([docs(1), translations(2)], pairs);
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(["coupled-surface-split"]);
    expect(result.findings[0]?.message).toContain("DOC");
    expect(result.findings[0]?.message).toContain("TR");
  });

  test("the same wave passes", () => {
    expect(plan([docs(1), translations(1)], pairs)).toEqual({ ok: true, findings: [] });
  });

  test("a dependents ticket in an earlier wave passes", () => {
    expect(plan([docs(2), translations(1)], pairs).ok).toBe(true);
  });

  test("no dependents ticket passes", () => {
    expect(codes(plan([docs(1)], pairs))).not.toContain("coupled-surface-split");
  });

  test("no config is a no-op", () => {
    expect(plan([docs(1), translations(2)]).ok).toBe(true);
    expect(plan([docs(1), translations(2)], []).ok).toBe(true);
  });

  test("brace globs on either side are expanded", () => {
    const braces = [
      { source: "docs/{guide,reference}/**", dependents: "site/{a,translations}/**" },
    ];
    expect(codes(plan([docs(1), translations(2)], braces))).toEqual(["coupled-surface-split"]);
  });
});
