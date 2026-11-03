import { readFileSync } from "node:fs";
import { DEFAULT_FORGE_CONFIG } from "./config";
import { analyzeTicketGraph } from "./dependencies";
import { findSurfaceOverlaps } from "./surfaces";
import { isObject } from "./narrow";

const USAGE = `usage: forge validate --file <plan.json | -> | --spec <id> --tickets <tickets.json | ->

plan.json: { "spec": "<markdown with S# items>", "sizing"?: { "inlineMaxLines": n },
             "tickets": [{ "id", "covers": ["S1"], "surfaces": ["glob"], "wave"?: n,
                           "blockedBy"?: ["id"], "newSurfaceLines"?: n, "estimatedPeakTokens"?: n, "folded"?: bool }] }`;

export type PlanTicket = {
  readonly id: string;
  readonly covers: readonly string[];
  readonly surfaces: readonly string[];
  readonly wave: number;
  readonly blockedBy: readonly string[];
  readonly newSurfaceLines?: number;
  readonly estimatedPeakTokens?: number;
  readonly folded: boolean;
};

type ValidationFinding = {
  readonly severity: "error" | "warn";
  readonly code:
    | "uncovered-spec-item"
    | "ticket-covers-nothing"
    | "unknown-spec-item"
    | "missing-scenario"
    | "surface-overlap"
    | "dependency-cycle"
    | "unknown-blocker"
    | "undersized-ticket";
  readonly message: string;
};

export type ValidationResult = { readonly ok: boolean; readonly findings: ValidationFinding[] };

const SPEC_ITEM_START = /^\s*[-*]\s+\*\*(S\d+)\*\*/;
const SCENARIO_MARKER = /\bscenario\b|\bwhen\b[\s\S]*\bthen\b/i;

/** Maps each S# to the text of its item, up to the next S# item or heading. */
export function parseSpecItems(specMarkdown: string): Map<string, string> {
  const items = new Map<string, string>();
  let currentId: string | null = null;
  for (const line of specMarkdown.split("\n")) {
    const start = SPEC_ITEM_START.exec(line);
    if (start) {
      currentId = start[1]!;
      items.set(currentId, line);
    } else if (/^#{1,6}\s/.test(line)) {
      currentId = null;
    } else if (currentId !== null) {
      items.set(currentId, `${items.get(currentId)}\n${line}`);
    }
  }
  return items;
}

export function validatePlan(input: {
  readonly specMarkdown: string;
  readonly tickets: readonly PlanTicket[];
  readonly inlineMaxLines?: number;
}): ValidationResult {
  const findings: ValidationFinding[] = [];
  const add = (
    severity: ValidationFinding["severity"],
    code: ValidationFinding["code"],
    message: string,
  ) => findings.push({ severity, code, message });
  const inlineMaxLines = input.inlineMaxLines ?? DEFAULT_FORGE_CONFIG.sizing.inlineMaxLines;
  const specItems = parseSpecItems(input.specMarkdown);

  const covered = new Set(input.tickets.flatMap((ticket) => ticket.covers));
  for (const [id, text] of specItems) {
    if (!covered.has(id)) add("error", "uncovered-spec-item", `${id} is not covered by any ticket`);
    if (!SCENARIO_MARKER.test(text))
      add("error", "missing-scenario", `${id} has no acceptance scenario`);
  }
  for (const ticket of input.tickets) {
    if (ticket.covers.length === 0)
      add("error", "ticket-covers-nothing", `${ticket.id} covers no S#`);
    for (const id of ticket.covers) {
      if (!specItems.has(id))
        add("error", "unknown-spec-item", `${ticket.id} covers ${id}, which is not in the spec`);
    }
    if (
      !ticket.folded &&
      ticket.newSurfaceLines !== undefined &&
      ticket.newSurfaceLines <= inlineMaxLines
    ) {
      add(
        "warn",
        "undersized-ticket",
        `${ticket.id} adds ~${ticket.newSurfaceLines} lines (<= ${inlineMaxLines}) and is not folded into a sibling`,
      );
    }
  }

  const waves = new Map<number, PlanTicket[]>();
  for (const ticket of input.tickets)
    waves.set(ticket.wave, [...(waves.get(ticket.wave) ?? []), ticket]);
  for (const [wave, members] of waves) {
    for (const o of findSurfaceOverlaps(
      members.map((t) => ({ ticket: t.id, surfaces: t.surfaces })),
    )) {
      add(
        "error",
        "surface-overlap",
        `wave ${wave}: ${o.ticketA} (${o.globA}) overlaps ${o.ticketB} (${o.globB})`,
      );
    }
  }

  const ids = new Set(input.tickets.map((ticket) => ticket.id));
  for (const ticket of input.tickets) {
    for (const blocker of ticket.blockedBy) {
      if (!ids.has(blocker))
        add("error", "unknown-blocker", `${ticket.id} is blocked by unknown ticket ${blocker}`);
    }
  }
  const graph = analyzeTicketGraph(
    input.tickets.map((ticket) => ({
      id: ticket.id,
      status: "todo" as const,
      priority: 0,
      createdAt: "",
      blockedBy: ticket.blockedBy,
    })),
  );
  if (graph.cycle !== null)
    add("error", "dependency-cycle", `dependency cycle: ${graph.cycle.join(" -> ")}`);

  return { ok: findings.every((finding) => finding.severity !== "error"), findings };
}

function stringsField(value: unknown, label: string, id: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`forge validate: ${id}.${label} must be string[]`);
  }
  return value;
}

function parseTickets(raw: unknown): PlanTicket[] {
  if (!Array.isArray(raw)) throw new Error('forge validate: "tickets" must be an array');
  return raw.map((entry, index) => {
    const candidate: Record<string, unknown> = isObject(entry) ? entry : {};
    if (typeof candidate.id !== "string")
      throw new Error(`forge validate: ticket ${index} needs an "id"`);
    const id = candidate.id;
    const newSurfaceLines =
      typeof candidate.newSurfaceLines === "number" ? candidate.newSurfaceLines : undefined;
    const estimatedPeakTokens =
      typeof candidate.estimatedPeakTokens === "number" ? candidate.estimatedPeakTokens : undefined;
    return {
      id,
      covers: stringsField(candidate.covers, "covers", id),
      surfaces: stringsField(candidate.surfaces, "surfaces", id),
      wave: typeof candidate.wave === "number" ? candidate.wave : 1,
      blockedBy: stringsField(candidate.blockedBy, "blockedBy", id),
      ...(newSurfaceLines === undefined ? {} : { newSurfaceLines }),
      ...(estimatedPeakTokens === undefined ? {} : { estimatedPeakTokens }),
      folded: candidate.folded === true,
    };
  });
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

async function readSource(source: string): Promise<string> {
  return source === "-" ? await Bun.stdin.text() : readFileSync(source, "utf8");
}

async function fetchSpecBody(specId: string): Promise<string> {
  const child = Bun.spawn(["gh", "issue", "view", specId, "--json", "body", "-q", ".body"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [body, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  if (code !== 0) throw new Error(`forge validate: could not read spec issue ${specId}`);
  return body;
}

export async function run(argv: string[]): Promise<void> {
  try {
    const file = flagValue(argv, "--file");
    const specId = flagValue(argv, "--spec");
    const ticketsSource = flagValue(argv, "--tickets");
    let specMarkdown: string;
    let rawTickets: unknown;
    let inlineMaxLines: number | undefined;
    if (file !== undefined) {
      const plan: {
        spec?: unknown;
        tickets?: unknown;
        sizing?: { inlineMaxLines?: unknown };
      } = JSON.parse(await readSource(file));
      if (typeof plan.spec !== "string")
        throw new Error('forge validate: plan needs a "spec" string');
      specMarkdown = plan.spec;
      rawTickets = plan.tickets;
      if (typeof plan.sizing?.inlineMaxLines === "number")
        inlineMaxLines = plan.sizing.inlineMaxLines;
    } else if (specId !== undefined && ticketsSource !== undefined) {
      specMarkdown = await fetchSpecBody(specId);
      rawTickets = JSON.parse(await readSource(ticketsSource));
    } else {
      console.error(USAGE);
      process.exitCode = 2;
      return;
    }
    const result = validatePlan({
      specMarkdown,
      tickets: parseTickets(rawTickets),
      ...(inlineMaxLines === undefined ? {} : { inlineMaxLines }),
    });
    for (const finding of result.findings) console.error(`${finding.severity}: ${finding.message}`);
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
