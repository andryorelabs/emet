import { resolveAnchorPid, resolveSessionSlug } from "./runs";
import { ForgeConfigError, resolveRepoRoot } from "./config";
import { resolveWorktreeOwner } from "./worktrees";
import { errorMessage, isObject } from "./narrow";

/**
 * Produces the `git worktree lock` reason a `/forge` worker writes at
 * bootstrap — the string every other command in this CLI parses back via
 * {@link resolveWorktreeOwner} to answer "which run owns this worktree, and
 * is that run still alive".
 *
 * This command exists because that string was, until now, the one piece of
 * `/forge`'s coordination machinery nothing in this repo actually produced.
 * `worktrees.ts` parsed it, `preflight --post-dispatch` hard-failed on its
 * absence (AO-321), and `cleanup` refused to delete a branch whose worktree
 * carried it — but the only instruction for *writing* it was a
 * `{{bootstrap_steps}}` placeholder in `reference/worker-prompt.md`, filled
 * from each target repo's own hand-written `docs/agents/forge.md`. Every
 * repo was expected to reinvent, by hand, a string with five positional
 * fields and an exact parser on the other side.
 *
 * That is precisely the AO-285 shape ("an untypechecked one-off snippet has
 * no argument names to get right in the first place", see
 * `reference/incidents.md`), which is why this is a CLI command rather than
 * a documented format: the coordinator asks for the reason by naming its
 * run and ticket, and never assembles the string itself.
 *
 * The `slug=` field is the specific reason this could not stay
 * documentation. It has to be the *coordinator's* `resolveSessionSlug()`,
 * not the worker's — a worker's own cwd is its worktree, whose slug finds no
 * transcript at all (see {@link resolveWorktreeOwner}'s `coordinatorSlug`
 * doc). Only a command run by the coordinator, in the coordinator's cwd, can
 * produce it, and it produces it the same way `claims.ts` does for the
 * matching reservation — a bare `resolveSessionSlug()` — so a run's
 * reservation and its worktree lock always agree on where to look.
 */

/**
 * The built-in `worktree.lockReason` template. `{iso}` is substituted last,
 * at build time, so a stored template never carries a stale timestamp.
 *
 * `slug` sits between `anchor` and `at` rather than at the end purely for
 * readability; {@link resolveWorktreeOwner} parses `key=value` pairs
 * order-independently, and treats `slug` as optional so a lock reason
 * written before this command existed still parses.
 */
export const DEFAULT_LOCK_REASON_TEMPLATE =
  "forge run={runId} ticket={ticket} anchor={anchorPid} slug={coordinatorSlug} at={iso}";

export type LockReasonFields = {
  readonly runId: string;
  readonly ticket: string;
  readonly anchorPid: number;
  readonly coordinatorSlug: string;
  readonly iso: string;
};

/**
 * Every value is interpolated into a whitespace-separated `key=value` string
 * that {@link resolveWorktreeOwner} splits on `/\s+/`, so a value containing
 * whitespace would silently truncate the field and shift every field after
 * it. Run ids, ticket ids and ISO timestamps can't contain whitespace, but a
 * session slug can: it's the coordinator's cwd with `/` replaced by `-`, and
 * a checkout under a directory with a space in its name inherits that space.
 * Fail loudly here rather than emit a lock reason that parses back as
 * something else — an unattributable worktree is the exact AO-321 failure
 * this whole mechanism exists to prevent.
 */
function assertNoWhitespace(field: string, value: string): void {
  if (/\s/.test(value)) {
    throw new ForgeConfigError(
      `forge lock-reason: ${field} contains whitespace (${JSON.stringify(value)}) — the lock reason is parsed by splitting on whitespace, so this would corrupt every field after it.${field === "slug" ? ' The slug is this repo\'s checkout path with "/" replaced by "-"; a path component containing a space cannot be represented.' : ""}`,
    );
  }
}

/**
 * Substitutes `{runId}`/`{ticket}`/`{anchorPid}`/`{coordinatorSlug}`/`{iso}`
 * into `template`, then proves the result by parsing it back with the same
 * {@link resolveWorktreeOwner} every consumer uses. A `worktree.lockReason`
 * override that drops a required field, or misspells one, fails here — at
 * the moment it's written, with the coordinator watching — instead of
 * silently producing worktrees no `preflight`/`cleanup` run can attribute.
 */
export function buildLockReason(
  fields: LockReasonFields,
  template: string = DEFAULT_LOCK_REASON_TEMPLATE,
): string {
  assertNoWhitespace("run", fields.runId);
  assertNoWhitespace("ticket", fields.ticket);
  assertNoWhitespace("slug", fields.coordinatorSlug);
  assertNoWhitespace("at", fields.iso);

  if (!Number.isInteger(fields.anchorPid) || fields.anchorPid <= 0) {
    throw new ForgeConfigError(
      `forge lock-reason: --anchor must be a positive integer pid, got ${JSON.stringify(fields.anchorPid)}`,
    );
  }

  const reason = template
    .replaceAll("{runId}", fields.runId)
    .replaceAll("{ticket}", fields.ticket)
    .replaceAll("{anchorPid}", String(fields.anchorPid))
    .replaceAll("{coordinatorSlug}", fields.coordinatorSlug)
    .replaceAll("{iso}", fields.iso);

  const parsed = resolveWorktreeOwner({
    directory: "<validation>",
    branch: null,
    lockedReason: reason,
  });
  if (
    !parsed ||
    parsed.runId !== fields.runId ||
    parsed.ticket !== fields.ticket ||
    parsed.anchorPid !== fields.anchorPid ||
    parsed.at !== fields.iso
  ) {
    throw new ForgeConfigError(
      `forge lock-reason: the configured worktree.lockReason template does not round-trip through this CLI's own parser.\n  template: ${template}\n  produced: ${reason}\nKeep the literal "forge" token and the run=/ticket=/anchor=/at= fields (see schema/forge.config.schema.json).`,
    );
  }
  if (parsed.coordinatorSlug !== fields.coordinatorSlug) {
    throw new ForgeConfigError(
      `forge lock-reason: the configured worktree.lockReason template drops the slug={coordinatorSlug} field.\n  template: ${template}\nWithout it, forge preflight and forge cleanup cannot find this run's transcript and will classify it as dead the moment its anchor process exits.`,
    );
  }
  return reason;
}

/**
 * Reads `worktree.lockReason` straight off the repo's `forge.config.json`.
 * `config.ts` deliberately validates only the subset this CLI acts on, and
 * the `worktree` block is documented in the schema as read by the `/forge`
 * *command* rather than by the CLI — so this reads the raw JSON instead of
 * widening `ForgeConfig` for one optional string. A missing file or a
 * missing key is not an error: the built-in template is the answer.
 * Malformed JSON *is* an error — the same "a typo is never mistaken for
 * absent" rule `loadForgeConfigWithDefaults` enforces.
 */
export async function readLockReasonTemplate(repoRoot: string): Promise<string> {
  const file = Bun.file(`${repoRoot}/forge.config.json`);
  if (!(await file.exists())) return DEFAULT_LOCK_REASON_TEMPLATE;

  let raw: unknown;
  try {
    raw = await file.json();
  } catch (error: unknown) {
    throw new ForgeConfigError(
      `forge lock-reason: forge.config.json is not valid JSON — ${errorMessage(error)}`,
    );
  }

  const worktree = isObject(raw) ? raw.worktree : undefined;
  const template = isObject(worktree) ? worktree.lockReason : undefined;
  if (template === undefined) return DEFAULT_LOCK_REASON_TEMPLATE;
  if (typeof template !== "string" || template.trim().length === 0) {
    throw new ForgeConfigError(
      'forge lock-reason: "worktree.lockReason" must be a non-empty string template',
    );
  }
  return template;
}

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function requireFlagValue(argv: readonly string[], flag: string): string {
  const value = readFlagValue(argv, flag);
  if (!value || value.startsWith("--")) {
    throw new ForgeConfigError(`forge lock-reason: ${flag} requires a value`);
  }
  return value;
}

const USAGE = "usage: forge lock-reason --run <runId> --ticket <ticket> [--anchor <pid>]";

/**
 * Prints the lock reason on stdout with no decoration, so the coordinator
 * can paste it straight into a worker's dispatch prompt (or a shell can
 * capture it with `$(...)`). Everything explanatory goes to stderr.
 *
 * `--anchor` defaults to this process's own {@link resolveAnchorPid} — the
 * coordinator running this command *is* the anchor, so the default is the
 * correct value, and passing it explicitly only matters when reproducing a
 * specific run's reason after the fact.
 */
export async function run(argv: string[]): Promise<void> {
  try {
    if (argv.length === 0 || argv.includes("--help")) {
      console.error(USAGE);
      process.exitCode = 2;
      return;
    }

    const repoRoot = await resolveRepoRoot();
    if (!repoRoot) {
      throw new ForgeConfigError("forge lock-reason: not inside a git repository");
    }

    const runId = requireFlagValue(argv, "--run");
    const ticket = requireFlagValue(argv, "--ticket");
    const anchorRaw = readFlagValue(argv, "--anchor");
    const anchorPid = anchorRaw === undefined ? resolveAnchorPid() : Number(anchorRaw);

    const reason = buildLockReason(
      {
        runId,
        ticket,
        anchorPid,
        coordinatorSlug: resolveSessionSlug(),
        iso: new Date().toISOString(),
      },
      await readLockReasonTemplate(repoRoot),
    );

    console.log(reason);
  } catch (error: unknown) {
    if (error instanceof ForgeConfigError) {
      console.error(error.message);
      process.exitCode = 2;
      return;
    }
    console.error(error);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
