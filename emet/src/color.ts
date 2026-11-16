import { readEnv, type Env } from "./env";

/** What decides whether output may carry ANSI color. */
export interface ColorInput {
  env: Env;
  isTTY: boolean;
  noColorFlag: boolean;
}

/**
 * Whether to emit color. Precedence: `--no-color`, then `NO_COLOR`, then
 * `FORCE_COLOR` (any value but empty or `0`), then `TERM=dumb`, then the TTY.
 */
export function isColorEnabled(input: ColorInput): boolean {
  if (input.noColorFlag) return false;
  if (readEnv("NO_COLOR", input.env)) return false;
  const forced = readEnv("FORCE_COLOR", input.env);
  if (forced !== undefined && forced !== "0") return true;
  if (readEnv("TERM", input.env) === "dumb") return false;
  return input.isTTY;
}
