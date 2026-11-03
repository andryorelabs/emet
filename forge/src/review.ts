const USAGE = `usage: forge review --ticket <ticket> [--round <n>]`

export async function run(_argv: string[]): Promise<void> {
  console.error(`forge review: not implemented yet\n\n${USAGE}`)
  process.exitCode = 2
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
