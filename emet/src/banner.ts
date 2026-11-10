/**
 * Terminal banner art. The constants are byte-identical to
 * docs/brand/terminal/banner.ansi and banner.txt; banner.test.ts enforces it.
 */
const BANNER_ANSI_LINES: readonly string[] = [
  "\u001b[32m   ▄▀▄▄\u001b[0m         ",
  "\u001b[32m     █\u001b[0m          ",
  "\u001b[37m ▄██████████▄\u001b[0m   \u001b[97memet\u001b[0m\u001b[90m  plugin for Claude Code and Codex\u001b[0m",
  "\u001b[37m ██ \u001b[0m\u001b[33m●\u001b[0m\u001b[37m    \u001b[0m\u001b[33m●\u001b[0m\u001b[37m ██\u001b[0m   \u001b[32mSpec to merge, on one approval.\u001b[0m",
  "\u001b[37m ██\u001b[0m\u001b[90m   ▬▬   \u001b[0m\u001b[37m██\u001b[0m   \u001b[90minterview, spec, tickets, one approval, merge\u001b[0m",
  "\u001b[32m ▀▀████████▀▀\u001b[0m   \u001b[90mNot affiliated with or endorsed by Anthropic\u001b[0m",
];

const BANNER_TEXT_LINES: readonly string[] = [
  "   ▄▀▄▄",
  "     █",
  " ▄██████████▄   emet  plugin for Claude Code and Codex",
  " ██ ●    ● ██   Spec to merge, on one approval.",
  " ██   ▬▬   ██   interview, spec, tickets, one approval, merge",
  " ▀▀████████▀▀   Not affiliated with or endorsed by Anthropic",
];

export const BANNER_ANSI = BANNER_ANSI_LINES.join("\n") + "\n";

export const BANNER_TEXT = BANNER_TEXT_LINES.join("\n") + "\n";

/**
 * The banner for a stream: the colored art on a TTY when NO_COLOR is unset
 * or empty, the plain art otherwise.
 */
export function renderBanner(stream: { isTTY?: boolean }, env: NodeJS.ProcessEnv): string {
  const colored = stream.isTTY === true && !env.NO_COLOR;
  return colored ? BANNER_ANSI : BANNER_TEXT;
}
