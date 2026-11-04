import { isObject } from "./narrow";
import { readFileSync } from "node:fs";

export type TicketSurfaces = { readonly ticket: string; readonly surfaces: readonly string[] };
export type SurfaceOverlap = {
  readonly ticketA: string;
  readonly globA: string;
  readonly ticketB: string;
  readonly globB: string;
};

function expandBraces(glob: string): string[] {
  const match = /\{([^{}]*)\}/.exec(glob);
  if (!match) return [glob];
  const before = glob.slice(0, match.index);
  const after = glob.slice(match.index + match[0].length);
  return match[1]!.split(",").flatMap((option) => expandBraces(before + option + after));
}

function segmentsOverlap(left: string, right: string): boolean {
  const visit = (i: number, j: number): boolean => {
    if (i === left.length && j === right.length) return true;
    if (left[i] === "*" && (visit(i + 1, j) || (j < right.length && visit(i, j + 1)))) return true;
    if (right[j] === "*" && (visit(i, j + 1) || (i < left.length && visit(i + 1, j)))) return true;
    if (i === left.length || j === right.length) return false;
    if (left[i] === "*" || right[j] === "*") return false;
    if (left[i] === "?" || right[j] === "?" || left[i] === right[j]) return visit(i + 1, j + 1);
    return false;
  };
  return visit(0, 0);
}

function pathsOverlap(left: readonly string[], right: readonly string[]): boolean {
  const visit = (i: number, j: number): boolean => {
    if (i === left.length && j === right.length) return true;
    if (left[i] === "**" && (visit(i + 1, j) || (j < right.length && visit(i, j + 1)))) return true;
    if (right[j] === "**" && (visit(i, j + 1) || (i < left.length && visit(i + 1, j)))) return true;
    if (i === left.length || j === right.length) return false;
    if (left[i] === "**" || right[j] === "**") return false;
    return segmentsOverlap(left[i]!, right[j]!) && visit(i + 1, j + 1);
  };
  return visit(0, 0);
}

function toSegments(glob: string): string[] {
  return glob.replace(/^\.\//, "").split("/").filter(Boolean);
}

/** Whether some path can match both globs. */
export function globsOverlap(globA: string, globB: string): boolean {
  for (const a of expandBraces(globA)) {
    for (const b of expandBraces(globB)) {
      if (pathsOverlap(toSegments(a), toSegments(b))) return true;
    }
  }
  return false;
}

export function findSurfaceOverlaps(tickets: readonly TicketSurfaces[]): SurfaceOverlap[] {
  const overlaps: SurfaceOverlap[] = [];
  for (let first = 0; first < tickets.length; first++) {
    for (let second = first + 1; second < tickets.length; second++) {
      const a = tickets[first]!;
      const b = tickets[second]!;
      for (const globA of a.surfaces) {
        for (const globB of b.surfaces) {
          if (globsOverlap(globA, globB)) {
            overlaps.push({ ticketA: a.ticket, globA, ticketB: b.ticket, globB });
          }
        }
      }
    }
  }
  return overlaps;
}

function isGlobList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Accepts `{ "CLA-1": ["a/**"] }` or `[{ ticket, surfaces }]`. */
export function parseTicketSurfaces(raw: unknown): TicketSurfaces[] {
  if (Array.isArray(raw)) {
    return raw.map((entry, index) => {
      const candidate: Record<string, unknown> = isObject(entry) ? entry : {};
      if (typeof candidate.ticket !== "string" || !isGlobList(candidate.surfaces)) {
        throw new Error(`forge:surfaces — entry ${index} needs { ticket, surfaces: string[] }`);
      }
      return { ticket: candidate.ticket, surfaces: candidate.surfaces };
    });
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw).map(([ticket, surfaces]) => {
      if (!isGlobList(surfaces)) throw new Error(`forge:surfaces — ${ticket} needs string[] globs`);
      return { ticket, surfaces };
    });
  }
  throw new Error("forge:surfaces — expected an object or array of ticket surfaces");
}

export async function run(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const checkIndex = argv.indexOf("--check");
  const source = checkIndex === -1 ? undefined : argv[checkIndex + 1];
  if (!source) {
    console.error("usage: forge surfaces --check <file.json | ->");
    process.exitCode = 2;
    return;
  }
  try {
    const text = source === "-" ? await Bun.stdin.text() : readFileSync(source, "utf8");
    const overlaps = findSurfaceOverlaps(parseTicketSurfaces(JSON.parse(text)));
    if (overlaps.length === 0) {
      console.log(JSON.stringify({ ok: true, overlaps: [] }));
      return;
    }
    for (const o of overlaps) {
      console.error(`overlap: ${o.ticketA} (${o.globA}) <-> ${o.ticketB} (${o.globB})`);
    }
    console.log(JSON.stringify({ ok: false, overlaps }));
    process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

if (import.meta.main) {
  await run();
}
