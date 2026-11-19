/** Resolves `handoff.afterSpec` (a mode or an ordered rule list) and the changed paths into one mode. */

import type { AfterSpecMode, AfterSpecSetting } from "./config";
import { matchesSurface } from "./guard-destructive";

/** The mode a setting resolved to, the matched rule index (`null` for the string form or no rule), and a one-sentence reason. */
export interface AfterSpecResolution {
  readonly mode: AfterSpecMode;
  readonly ruleIndex: number | null;
  readonly reason: string;
}

/** Whether `relative` matches at least one glob, using the edit guard's matcher. */
export function matchesAnyGlob(globs: readonly string[], relative: string): boolean {
  return globs.some((glob) => matchesSurface(glob, relative));
}

/**
 * The first rule whose `paths` match every changed path wins; otherwise the
 * rule without `paths` applies; otherwise `none`. No changed paths falls to the
 * fallback rule. A string setting ignores the paths.
 */
export function resolveAfterSpec(
  setting: AfterSpecSetting,
  changedPaths: readonly string[],
): AfterSpecResolution {
  if (typeof setting === "string") {
    return { mode: setting, ruleIndex: null, reason: `afterSpec is "${setting}"` };
  }
  if (changedPaths.length > 0) {
    const matchedIndex = setting.findIndex(
      (rule) =>
        rule.paths !== undefined &&
        changedPaths.every((changed) => matchesAnyGlob(rule.paths ?? [], changed)),
    );
    const matched = setting[matchedIndex];
    if (matched?.paths !== undefined) {
      return {
        mode: matched.mode,
        ruleIndex: matchedIndex,
        reason: `every changed path matches rule ${matchedIndex} (${matched.paths.join(", ")})`,
      };
    }
  }
  const fallbackIndex = setting.findIndex((rule) => rule.paths === undefined);
  const fallback = setting[fallbackIndex];
  if (fallback === undefined) {
    return {
      mode: "none",
      ruleIndex: null,
      reason: "no rule matches and there is no fallback rule",
    };
  }
  const why = changedPaths.length === 0 ? "no changed paths" : "no rule matches every changed path";
  return {
    mode: fallback.mode,
    ruleIndex: fallbackIndex,
    reason: `${why}, so the fallback rule ${fallbackIndex} applies`,
  };
}
