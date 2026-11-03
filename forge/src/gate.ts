const USAGE = `usage: forge gate <ticket> [--run <id>]`

export async function run(_argv: string[]): Promise<void> {
  console.error(`forge gate: not implemented yet\n\n${USAGE}`)
  process.exitCode = 2
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
