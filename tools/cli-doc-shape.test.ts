import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COMMANDS } from "../emet/src/commands";

const CLI_REFERENCE = join(import.meta.dir, "..", "docs", "reference", "cli.md");
const MAX_WORDS = 120;

interface LongBlock {
  line: number;
  words: number;
}

/**
 * Splits markdown into prose blocks: each paragraph and each list item is one
 * block. Code fences, headings and table rows are not prose and are skipped.
 */
function proseBlocks(markdown: string): { line: number; text: string }[] {
  const blocks: { line: number; text: string }[] = [];
  let current: { line: number; text: string } | undefined;
  let inFence = false;

  const flush = (): void => {
    if (current) blocks.push(current);
    current = undefined;
  };

  markdown.split("\n").forEach((rawLine, index) => {
    const lineNumber = index + 1;
    if (/^\s*```/.test(rawLine)) {
      flush();
      inFence = !inFence;
      return;
    }
    if (inFence || rawLine.trim() === "" || /^#{1,6}\s/.test(rawLine) || /^\s*\|/.test(rawLine)) {
      flush();
      return;
    }
    if (/^\s*([-*]|\d+\.)\s/.test(rawLine)) {
      flush();
      current = { line: lineNumber, text: rawLine.trim() };
      return;
    }
    if (current) {
      current.text += ` ${rawLine.trim()}`;
    } else {
      current = { line: lineNumber, text: rawLine.trim() };
    }
  });
  flush();
  return blocks;
}

/** Lists every paragraph or list item with more than `limit` words. */
function findLongBlocks(markdown: string, limit: number): LongBlock[] {
  return proseBlocks(markdown)
    .map(({ line, text }) => ({ line, words: text.split(/\s+/).filter(Boolean).length }))
    .filter(({ words }) => words > limit);
}

/** Lists the command names that no `###` or `####` heading of the form "`emet <name> ...`" covers. */
function findCommandsWithoutHeading(markdown: string, names: readonly string[]): string[] {
  const covered = new Set<string>();
  for (const line of markdown.split("\n")) {
    const match = /^#{3,4}\s+`emet ([a-z][a-z-]*)/.exec(line);
    if (match?.[1]) covered.add(match[1]);
  }
  return names.filter((name) => !covered.has(name));
}

describe("cli reference shape", () => {
  const markdown = readFileSync(CLI_REFERENCE, "utf8");

  test("no paragraph or list item is longer than 120 words", () => {
    expect(findLongBlocks(markdown, MAX_WORDS)).toEqual([]);
  });

  test("every command has its own heading", () => {
    expect(
      findCommandsWithoutHeading(
        markdown,
        COMMANDS.map((command) => command.name),
      ),
    ).toEqual([]);
  });
});

/** Builds a paragraph of exactly `count` words. */
function repeatWord(count: number): string {
  return Array.from({ length: count }, () => "word").join(" ");
}

describe("cli reference shape checks", () => {
  test("fails on a 121-word paragraph", () => {
    expect(findLongBlocks(`# T\n\n${repeatWord(121)}\n`, MAX_WORDS)).toEqual([
      { line: 3, words: 121 },
    ]);
  });

  test("passes a 120-word paragraph", () => {
    expect(findLongBlocks(`# T\n\n${repeatWord(120)}\n`, MAX_WORDS)).toEqual([]);
  });

  test("fails on a 121-word list item and ignores fenced code", () => {
    const markdown = `- ${repeatWord(121)}\n\n\`\`\`text\n${repeatWord(300)}\n\`\`\`\n`;
    expect(findLongBlocks(markdown, MAX_WORDS)).toEqual([{ line: 1, words: 122 }]);
  });

  test("fails on a command without a heading", () => {
    const markdown = "### `emet init`\n\n#### `emet tracker close`\n";
    expect(findCommandsWithoutHeading(markdown, ["init", "tracker", "doctor"])).toEqual(["doctor"]);
  });
});
