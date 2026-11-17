import type { CommandSpec } from "./commands";

/** The flags every command accepts: handled by the dispatcher, not by the command. */
const GLOBAL_FLAGS: ReadonlySet<string> = new Set([
  "--json",
  "--no-color",
  "--verbose",
  "--help",
  "-h",
]);

/** The global flags found in an argv. */
export interface GlobalFlags {
  readonly json: boolean;
  readonly noColor: boolean;
  readonly verbose: boolean;
  readonly help: boolean;
}

function isFlagToken(token: string): boolean {
  return token.length > 1 && token.startsWith("-");
}

/**
 * Reads the global flags from `argv`. `--no-color` and `--verbose` never reach
 * a command; `--json` and `--help` stay in the returned argv because some
 * commands read them themselves.
 */
export function parseGlobalFlags(argv: readonly string[]): {
  readonly flags: GlobalFlags;
  readonly rest: readonly string[];
} {
  return {
    flags: {
      json: argv.includes("--json"),
      noColor: argv.includes("--no-color"),
      verbose: argv.includes("--verbose"),
      help: argv.includes("--help") || argv.includes("-h"),
    },
    rest: argv.filter((token) => token !== "--no-color" && token !== "--verbose"),
  };
}

/**
 * The flags in `argv` that neither `spec` nor the global set declares. A value
 * flag consumes the token after it, and `--` ends flag scanning.
 */
export function unknownFlags(spec: CommandSpec, argv: readonly string[]): readonly string[] {
  const known = new Map(spec.flags.map((flag) => [flag.name, flag.value]));
  const unknown: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "--") break;
    if (!isFlagToken(token)) continue;
    const takesValue = known.get(token);
    if (takesValue === undefined) {
      if (!GLOBAL_FLAGS.has(token)) unknown.push(token);
    } else if (takesValue) {
      index += 1;
    }
  }
  return unknown;
}
