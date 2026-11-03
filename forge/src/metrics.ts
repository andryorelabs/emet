const USAGE = `usage: forge metrics [--run <id>]`

export async function run(_argv: string[]): Promise<void> {
  console.error(`forge metrics: not implemented yet\n\n${USAGE}`)
  process.exitCode = 2
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
