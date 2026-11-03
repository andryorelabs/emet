const USAGE = `usage: forge approve --run <id>`

export async function run(_argv: string[]): Promise<void> {
  console.error(`forge approve: not implemented yet\n\n${USAGE}`)
  process.exitCode = 2
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
