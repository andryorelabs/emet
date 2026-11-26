import type { MissingCapture } from "./plan";

/** The measured difference of one section at one progress under one variant. */
export interface MeasuredPair {
  readonly variant: string;
  readonly section: string;
  readonly progress: number;
  readonly ratio: number;
}

/** The summary of all measured pairs and of the captures missing on one side. */
export interface Report {
  readonly pairs: readonly MeasuredPair[];
  readonly missing: readonly MissingCapture[];
  readonly mean: number;
  readonly worst: MeasuredPair | undefined;
  readonly flagged: readonly MeasuredPair[];
}

/** Ratio above which a pair is flagged as a visible mismatch. */
export const FLAG_THRESHOLD = 0.05;

/** Summarizes measured pairs: the mean ratio, the worst pair and the pairs above the flag threshold, worst first, plus the captures missing on one side. */
export function buildReport(
  pairs: readonly MeasuredPair[],
  missing: readonly MissingCapture[] = [],
): Report {
  const total = pairs.reduce((sum, pair) => sum + pair.ratio, 0);
  const sorted = pairs.toSorted((left, right) => right.ratio - left.ratio);
  return {
    pairs,
    missing,
    mean: pairs.length === 0 ? 0 : total / pairs.length,
    worst: sorted[0],
    flagged: sorted.filter((pair) => pair.ratio > FLAG_THRESHOLD),
  };
}

/** One summary line of a report. */
export function summaryLine(report: Report): string {
  const worst =
    report.worst === undefined
      ? "none"
      : `${report.worst.variant}/${report.worst.section}@${Math.round(report.worst.progress * 100)} ${(report.worst.ratio * 100).toFixed(1)}%`;
  return `parity: ${report.pairs.length} pairs, ${report.missing.length} missing, mean ${(report.mean * 100).toFixed(1)}%, ${report.flagged.length} flagged, worst ${worst}`;
}
