import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";

import {
  findSurfaceOverlaps,
  globsOverlap,
  parseTicketSurfaces,
  type TicketSurfaces,
} from "../emet/src/surfaces";

/** A literal path segment: no glob metacharacters, never empty, never `.`. */
const literalSegment = fc.stringMatching(/^[a-c][a-c0-9_-]{0,3}$/);

/** A literal relative path of one to four segments, as its segment list. */
const literalSegments = fc.array(literalSegment, { minLength: 1, maxLength: 4 });

const literalPath = literalSegments.map((segments) => segments.join("/"));

/** A glob segment mixing literal characters with `*` and `?`, or a whole `**`. */
const globSegment = fc.oneof(
  { weight: 4, arbitrary: fc.stringMatching(/^[ab*?]{1,4}$/) },
  { weight: 1, arbitrary: fc.constant("**") },
);

/** A glob of one to four segments, optionally with one brace alternation. */
const glob = fc
  .tuple(
    fc.array(globSegment, { minLength: 1, maxLength: 4 }),
    fc.option(fc.array(fc.stringMatching(/^[ab*]{1,2}$/), { minLength: 1, maxLength: 3 }), {
      nil: undefined,
    }),
  )
  .map(([segments, braceOptions]) => {
    const base = segments.join("/");
    return braceOptions === undefined ? base : `${base}/{${braceOptions.join(",")}}`;
  });

const ticketId = fc.nat({ max: 999 }).map((n) => `CLA-${n}`);

const ticketSurfacesList = fc.uniqueArray(
  fc.record({ ticket: ticketId, surfaces: fc.array(glob, { maxLength: 3 }) }),
  { maxLength: 5, selector: (entry) => entry.ticket },
);

describe("globsOverlap properties", () => {
  test("is symmetric", () => {
    fc.assert(
      fc.property(glob, glob, (left, right) => {
        expect(globsOverlap(left, right)).toBe(globsOverlap(right, left));
      }),
    );
  });

  test("every glob overlaps itself", () => {
    fc.assert(
      fc.property(glob, (value) => {
        expect(globsOverlap(value, value)).toBe(true);
      }),
    );
  });

  test("a bare ** overlaps every glob", () => {
    fc.assert(
      fc.property(glob, (value) => {
        expect(globsOverlap("**", value)).toBe(true);
      }),
    );
  });

  test("a leading ./ does not change the answer", () => {
    fc.assert(
      fc.property(glob, glob, (left, right) => {
        expect(globsOverlap(`./${left}`, right)).toBe(globsOverlap(left, right));
      }),
    );
  });

  test("distinct literal paths never overlap", () => {
    fc.assert(
      fc.property(literalPath, literalPath, (left, right) => {
        fc.pre(left !== right);
        expect(globsOverlap(left, right)).toBe(false);
      }),
    );
  });

  test("a directory ** glob overlaps every literal path below it", () => {
    fc.assert(
      fc.property(literalSegments, literalSegments, (directory, below) => {
        const directoryGlob = `${directory.join("/")}/**`;
        expect(globsOverlap(directoryGlob, [...directory, ...below].join("/"))).toBe(true);
      }),
    );
  });

  test("a brace alternation overlaps exactly when one of its options does", () => {
    fc.assert(
      fc.property(
        fc.array(literalSegment, { minLength: 1, maxLength: 3 }),
        glob,
        (options, other) => {
          const expected = options.some((option) => globsOverlap(option, other));
          expect(globsOverlap(`{${options.join(",")}}`, other)).toBe(expected);
        },
      ),
    );
  });
});

/** Every cross-ticket glob pair that overlaps, computed independently of the implementation order. */
function bruteForceOverlapCount(tickets: readonly TicketSurfaces[]): number {
  let count = 0;
  tickets.forEach((first, firstIndex) => {
    tickets.slice(firstIndex + 1).forEach((second) => {
      for (const globA of first.surfaces) {
        for (const globB of second.surfaces) {
          if (globsOverlap(globA, globB)) count++;
        }
      }
    });
  });
  return count;
}

describe("findSurfaceOverlaps properties", () => {
  test("reports exactly the overlapping cross-ticket glob pairs", () => {
    fc.assert(
      fc.property(ticketSurfacesList, (tickets) => {
        const overlaps = findSurfaceOverlaps(tickets);
        expect(overlaps.length).toBe(bruteForceOverlapCount(tickets));
        for (const overlap of overlaps) {
          expect(overlap.ticketA).not.toBe(overlap.ticketB);
          expect(globsOverlap(overlap.globA, overlap.globB)).toBe(true);
        }
      }),
    );
  });

  test("orders each pair by ticket position", () => {
    fc.assert(
      fc.property(ticketSurfacesList, (tickets) => {
        const position = new Map(tickets.map((entry, index) => [entry.ticket, index]));
        for (const overlap of findSurfaceOverlaps(tickets)) {
          expect(position.get(overlap.ticketA)!).toBeLessThan(position.get(overlap.ticketB)!);
        }
      }),
    );
  });

  test("tickets with distinct literal surfaces never overlap", () => {
    fc.assert(
      fc.property(fc.uniqueArray(literalPath, { minLength: 1, maxLength: 8 }), (paths) => {
        const tickets = paths.map((path, index) => ({ ticket: `CLA-${index}`, surfaces: [path] }));
        expect(findSurfaceOverlaps(tickets)).toEqual([]);
      }),
    );
  });

  test("a single ticket never overlaps itself", () => {
    fc.assert(
      fc.property(ticketId, fc.array(glob, { maxLength: 4 }), (ticket, surfaces) => {
        expect(findSurfaceOverlaps([{ ticket, surfaces }])).toEqual([]);
      }),
    );
  });
});

describe("parseTicketSurfaces properties", () => {
  test("round-trips the array form", () => {
    fc.assert(
      fc.property(ticketSurfacesList, (tickets) => {
        expect(parseTicketSurfaces(tickets)).toEqual(tickets);
      }),
    );
  });

  test("accepts the record form as the same list in key order", () => {
    fc.assert(
      fc.property(ticketSurfacesList, (tickets) => {
        const record = Object.fromEntries(tickets.map((entry) => [entry.ticket, entry.surfaces]));
        expect(parseTicketSurfaces(record)).toEqual(
          Object.entries(record).map(([ticket, surfaces]) => ({ ticket, surfaces })),
        );
      }),
    );
  });

  test("rejects anything that is not an object or array", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.double(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
        (raw) => {
          expect(() => parseTicketSurfaces(raw)).toThrow("emet:surfaces");
        },
      ),
    );
  });

  test("rejects array entries without a string ticket and string[] surfaces", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({ ticket: fc.integer(), surfaces: fc.array(fc.string()) }),
          fc.record({ ticket: fc.string(), surfaces: fc.array(fc.integer(), { minLength: 1 }) }),
          fc.record({ ticket: fc.string(), surfaces: fc.string() }),
          fc.constant(null),
        ),
        (entry) => {
          expect(() => parseTicketSurfaces([entry])).toThrow(
            "needs { ticket, surfaces: string[] }",
          );
        },
      ),
    );
  });

  test("rejects record values that are not string[]", () => {
    fc.assert(
      fc.property(
        ticketId,
        fc.oneof(fc.string(), fc.integer(), fc.array(fc.integer(), { minLength: 1 })),
        (ticket, surfaces) => {
          expect(() => parseTicketSurfaces({ [ticket]: surfaces })).toThrow("needs string[] globs");
        },
      ),
    );
  });
});
