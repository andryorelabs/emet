import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const OLD_TAGLINE = new RegExp(["plugin", "for", "Claude", "Code"].join(" "), "i");
const ALLOWED = [/^docs\/adr\/0044-/, /^docs\/adr\/0047-/];

/**
 * Lists the tracked text files that may not carry the old tagline.
 * @returns Repo-relative paths from `git ls-files`.
 */
function trackedFiles(): string[] {
  const result = Bun.spawnSync(["git", "ls-files", "-z"], {
    cwd: new URL("..", import.meta.url).pathname,
  });
  return result.stdout.toString().split("\0").filter(Boolean);
}

describe("tagline guard", () => {
  test("no tracked text file calls emet a plugin for Claude Code", () => {
    const root = new URL("..", import.meta.url).pathname;
    const offenders = trackedFiles()
      .filter((file) => !ALLOWED.some((pattern) => pattern.test(file)))
      .filter((file) => !/\.(png|jpe?g|webp|gif|ico|woff2?|ttf|pdf|zip|gz|lock)$/i.test(file))
      .filter((file) => {
        try {
          return OLD_TAGLINE.test(readFileSync(`${root}${file}`, "utf8"));
        } catch {
          return false;
        }
      });
    expect(offenders).toEqual([]);
  });
});
