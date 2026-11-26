/** Which build a capture was taken from. */
export type Side = "prototype" | "site";

/** One screenshot to take: a section of one side at a scroll progress. */
export interface Capture {
  readonly side: Side;
  readonly section: string;
  readonly selector: string;
  readonly progress: number;
  readonly file: string;
}

/** The sections compared, with the selector of each on both sides. */
export const SECTIONS: readonly {
  readonly name: string;
  readonly prototype: string;
  readonly site: string;
}[] = [
  { name: "hero", prototype: "#hero", site: ".hero" },
  { name: "how", prototype: "#how", site: "#how" },
  { name: "showcase", prototype: "#show", site: "#showcase" },
  { name: "features", prototype: "#guards", site: ".features" },
  { name: "stats", prototype: "#stats", site: ".stats" },
  { name: "about", prototype: "#about", site: ".about" },
  { name: "faq", prototype: "#faq", site: "[data-faq]" },
  { name: "closing", prototype: "#close", site: ".closing" },
];

/** The scroll progress through each section at which both sides are captured. */
export const PROGRESS_STEPS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

/** Milliseconds to wait after a scroll so smooth scrolling and effects settle. */
export const SETTLE_MS = 1600;

/** The file name of a capture, without a directory. */
export function captureFile(side: Side, section: string, progress: number): string {
  return `${side}-${section}-${Math.round(progress * 100)}.png`;
}

/** Every capture of both sides: each section at each progress step. */
export function captureTargets(): Capture[] {
  const sides: readonly Side[] = ["prototype", "site"];
  return sides.flatMap((side) =>
    SECTIONS.flatMap((entry) =>
      PROGRESS_STEPS.map((progress) => ({
        side,
        section: entry.name,
        selector: entry[side],
        progress,
        file: captureFile(side, entry.name, progress),
      })),
    ),
  );
}

/** The scroll offset that puts a section at `progress` of its scrollable range; a section no taller than the viewport stays at its top. */
export function scrollTarget(
  sectionTop: number,
  sectionHeight: number,
  viewportHeight: number,
  progress: number,
): number {
  return sectionTop + Math.max(0, sectionHeight - viewportHeight) * progress;
}

/** A prototype capture and the site capture of the same section and progress. */
export interface CapturePair {
  readonly section: string;
  readonly progress: number;
  readonly prototype: string;
  readonly site: string;
}

/** Pairs prototype and site captures by section and progress; an unmatched capture is dropped. */
export function pairCaptures(captures: readonly Capture[]): CapturePair[] {
  const sites = new Map(
    captures
      .filter((capture) => capture.side === "site")
      .map((capture) => [`${capture.section}@${capture.progress}`, capture.file]),
  );
  return captures.flatMap((capture) => {
    const site = sites.get(`${capture.section}@${capture.progress}`);
    if (capture.side !== "prototype" || site === undefined) return [];
    return [
      { section: capture.section, progress: capture.progress, prototype: capture.file, site },
    ];
  });
}
