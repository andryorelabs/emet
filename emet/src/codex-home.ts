import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * The execpolicy rules of a worker run (`unverified` location, see
 * {@link RULES_RELATIVE_PATH}): committing is allowed, pushing is forbidden.
 */
export const COMMIT_RULES = `prefix_rule(pattern = ["git", "add"], decision = "allow")
prefix_rule(pattern = ["git", "commit"], decision = "allow")
prefix_rule(pattern = ["git", "push"], decision = "forbidden")
`;

/** Where the rules file lives inside the overlay (`unverified`). */
const RULES_RELATIVE_PATH = path.join("rules", "default.rules");
/** Files linked, never copied, from the user's Codex home. */
const LINKED_FILES = ["auth.json", "config.toml"] as const;
const GUARD_COMMAND = "EMET_AGENT_HOST=codex emet guard";

/** The hooks file text that routes Codex hook events to `emet guard`. */
export function hooksFileText(): string {
  const guard = [{ type: "command", command: GUARD_COMMAND }];
  return `${JSON.stringify(
    {
      hooks: {
        PreToolUse: [{ matcher: "*", hooks: guard }],
        UserPromptSubmit: [{ hooks: guard }],
      },
    },
    null,
    2,
  )}\n`;
}

function sourceCodexHome(sourceHome: string | undefined): string {
  if (sourceHome !== undefined) return sourceHome;
  const fromEnv = process.env["CODEX_HOME"];
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : path.join(homedir(), ".codex");
}

function replaceWithSymlink(target: string, linkPath: string): void {
  try {
    lstatSync(linkPath);
    rmSync(linkPath);
  } catch {
    mkdirSync(path.dirname(linkPath), { recursive: true });
  }
  symlinkSync(target, linkPath);
}

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Builds the per-run `CODEX_HOME` overlay at `<repoRoot>/.emet/runs/<run>/codex-home/`.
 * The user's `auth.json` and `config.toml` are symlinked in (never copied, so
 * no secret lands in the run directory); the rules file and the hooks file are
 * written fresh. Nothing is ever written under the source home.
 */
export function buildRunHome(opts: { run: string; repoRoot: string; sourceHome?: string }): {
  codexHome: string;
} {
  if (!RUN_ID_PATTERN.test(opts.run)) {
    throw new Error(`invalid run id for a Codex home overlay: ${JSON.stringify(opts.run)}`);
  }
  const codexHome = path.join(opts.repoRoot, ".emet", "runs", opts.run, "codex-home");
  const source = path.resolve(sourceCodexHome(opts.sourceHome));
  const relative = path.relative(source, path.resolve(codexHome));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error(`refusing to build a run home inside the source Codex home: ${source}`);
  }
  mkdirSync(codexHome, { recursive: true });
  for (const name of LINKED_FILES) {
    const original = path.join(source, name);
    if (existsSync(original)) replaceWithSymlink(original, path.join(codexHome, name));
  }
  const rulesPath = path.join(codexHome, RULES_RELATIVE_PATH);
  mkdirSync(path.dirname(rulesPath), { recursive: true });
  writeFileSync(rulesPath, COMMIT_RULES);
  writeFileSync(path.join(codexHome, "hooks.json"), hooksFileText());
  return { codexHome };
}
