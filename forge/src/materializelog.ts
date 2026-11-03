const USAGE = `usage: forge materialize-log --run <id> [--ticket <ticket> --id <tracker-id>]`

export async function run(_argv: string[]): Promise<void> {
  console.error(`forge materialize-log: not implemented yet\n\n${USAGE}`)
  process.exitCode = 2
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
