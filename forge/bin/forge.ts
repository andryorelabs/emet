#!/usr/bin/env bun
/**
 * `forge` — the global CLI dispatcher for `/forge`'s repo-side machinery.
 *
 * Historically these were nine separate `scripts/forge-*.ts` files living
 * inside `andryore-dev`, invoked via `bun run forge:<name>` aliases in that
 * repo's own `package.json`. Extracted here so `/forge` can run in *any* git
 * repo, not just one with those scripts and aliases already installed — see
 * the README for the full rationale.
 *
 * Each subcommand module still reads its own arguments off `process.argv`
 * internally (unchanged from the original scripts) and now additionally
 * exports an async `run(argv: string[])` that stages `argv` onto
 * `process.argv` before delegating — see any module's own `run()` doc
 * comment (e.g. `../src/claims.ts`) for why that's safe here: this process
 * runs exactly one subcommand per invocation, so mutating the global once,
 * before any subcommand logic reads it, cannot race a sibling call.
 *
 * Exit codes are meaningful across every subcommand (a change from the
 * original per-repo scripts, which returned `1` for both "found problems"
 * and "crashed"): `0` clean, `1` findings to act on, `2` config/usage error
 * (the tool never actually ran), `3` internal error.
 */

const USAGE = `usage: forge <command> [...args]

commands:
  init      [--tracker linear|github|local] [--force]
  doctor    [--all] [<path> ...]  — read-only fleet sweep, defaults to cwd
  preflight [--run <id>] [--post-dispatch]
  claims    --reserve <ticket> --run <id> --anchor <pid> | --release <ticket> | --list | --prune [--dry-run]
  slots     --acquire --run <id> --anchor <pid> --ticket <ticket> | --release --run <id> | --release-index <index> | --list
  cleanup   [--run <id> | --all] [--dry-run] [--force]
  usage     [--session <id> | --file <path>] [--stalled [--minutes N]] [--project-dir <path>]
  handoff   --check <path> | --render <path>
  launch    <spec-id> --wave <n>  — start a wave as a \`claude --bg\` session and open its Orca tab per handoff.launcher
  lock-reason --run <id> --ticket <ticket> [--anchor <pid>]  — the \`git worktree lock\` reason a worker writes at bootstrap
  assess    --base <ref> --head <ref>  — classify a diff as passive|medium|high and pick the reviewer model
  status    [--spec <id>]  — Working / Checking / Ready / Needs-decision per wave as JSON + a summary line (\`forge status --help\` documents the JSON)
  surfaces  --check <file.json | ->  — reject overlapping allowed-surface globs between a wave's tickets
  verify    <ticket>  — post-worker enforcement check
  review-package <base> <head>  — review range package
  review    --ticket <ticket> [--round <n>]
  approve   --run <id>
  results   --run <id> [--ticket <ticket>]
  materialize-log --run <id> [--ticket <ticket> --id <tracker-id>]
  gate      <ticket> [--run <id>]  — merge|hold|chain|stop decision as JSON
  validate  --spec <id> | --file <path>
  spec-merge --spec <id>
  map       [--refresh]
  metrics   [--run <id>]
  guard     — Claude Code PreToolUse hook (reads hook JSON on stdin); see src/guard.ts
  selftest  — run this CLI's own unit tests
`

const EXIT_CONFIG_OR_USAGE_ERROR = 2
const EXIT_INTERNAL_ERROR = 3

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)

  if (!command) {
    console.error(USAGE)
    process.exitCode = EXIT_CONFIG_OR_USAGE_ERROR
    return
  }

  switch (command) {
    case 'init': {
      const { run } = await import('../src/init')
      await run(rest)
      return
    }
    case 'doctor': {
      const { run } = await import('../src/doctor')
      await run(rest)
      return
    }
    case 'preflight': {
      const { run } = await import('../src/preflight')
      await run(rest)
      return
    }
    case 'claims': {
      const { run } = await import('../src/claims')
      await run(rest)
      return
    }
    case 'slots': {
      const { run } = await import('../src/slots')
      await run(rest)
      return
    }
    case 'cleanup': {
      const { run } = await import('../src/cleanup')
      await run(rest)
      return
    }
    case 'usage': {
      const { run } = await import('../src/usage')
      await run(rest)
      return
    }
    case 'handoff': {
      const { run } = await import('../src/handoff')
      await run(rest)
      return
    }
    case 'launch': {
      const { run } = await import('../src/launch')
      await run(rest)
      return
    }
    case 'lock-reason': {
      const { run } = await import('../src/lockreason')
      await run(rest)
      return
    }
    case 'assess': {
      const { run } = await import('../src/assess')
      await run(rest)
      return
    }
    case 'status': {
      const { run } = await import('../src/status')
      await run(rest)
      return
    }
    case 'surfaces': {
      const { run } = await import('../src/surfaces')
      await run(rest)
      return
    }
    case 'verify': {
      const { run } = await import('../src/verify')
      await run(rest)
      return
    }
    case 'review-package': {
      const { run } = await import('../src/reviewpackage')
      await run(rest)
      return
    }
    case 'review': {
      const { run } = await import('../src/review')
      await run(rest)
      return
    }
    case 'approve': {
      const { run } = await import('../src/approve')
      await run(rest)
      return
    }
    case 'results': {
      const { run } = await import('../src/results')
      await run(rest)
      return
    }
    case 'materialize-log': {
      const { run } = await import('../src/materializelog')
      await run(rest)
      return
    }
    case 'gate': {
      const { run } = await import('../src/gate')
      await run(rest)
      return
    }
    case 'validate': {
      const { run } = await import('../src/validate')
      await run(rest)
      return
    }
    case 'spec-merge': {
      const { run } = await import('../src/specmerge')
      await run(rest)
      return
    }
    case 'map': {
      const { run } = await import('../src/map')
      await run(rest)
      return
    }
    case 'metrics': {
      const { run } = await import('../src/metrics')
      await run(rest)
      return
    }
    case 'guard': {
      const { run } = await import('../src/guard')
      await run()
      return
    }
    case 'selftest': {
      const cliRoot = new URL('..', import.meta.url).pathname
      const tsconfigPath = new URL('../tsconfig.json', import.meta.url).pathname
      const bunfigPath = new URL('../bunfig.toml', import.meta.url).pathname
      const testRoot = new URL('../src', import.meta.url).pathname

      /**
       * `tsc --noEmit` first — this CLI's own tsconfig sets `strict: true`,
       * and AO-285 (the incident that made claims.ts/slots.ts require going
       * through this dispatcher instead of an inline `bun -e` snippet) was
       * exactly a type error no runtime test caught. `bunx` resolves to the
       * `typescript` devDependency `bun install` puts in this tree's own
       * node_modules rather than requiring a global `tsc`.
       */
      const typecheck = Bun.spawn(
        ['bunx', 'tsc', '--noEmit', '-p', tsconfigPath],
        { cwd: cliRoot, stdio: ['inherit', 'inherit', 'inherit'] },
      )
      const typecheckExitCode = await typecheck.exited

      const test = Bun.spawn(
        ['bun', 'test', '--config', bunfigPath, testRoot],
        { stdio: ['inherit', 'inherit', 'inherit'] },
      )
      const testExitCode = await test.exited

      process.exitCode = typecheckExitCode !== 0 ? typecheckExitCode : testExitCode
      return
    }
    case '--help':
    case '-h':
    case 'help': {
      console.log(USAGE)
      return
    }
    default: {
      console.error(`forge: unknown command "${command}"\n\n${USAGE}`)
      process.exitCode = EXIT_CONFIG_OR_USAGE_ERROR
    }
  }
}

try {
  await main()
} catch (error: unknown) {
  console.error(error)
  process.exitCode = EXIT_INTERNAL_ERROR
}
