const USAGE = `usage: forge results --run <id> [--ticket <ticket>]`

export async function run(_argv: string[]): Promise<void> {
  console.error(`forge results: not implemented yet\n\n${USAGE}`)
  process.exitCode = 2
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
