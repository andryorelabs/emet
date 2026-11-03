const USAGE = `usage: forge spec-merge --spec <id>`

export async function run(_argv: string[]): Promise<void> {
  console.error(`forge spec-merge: not implemented yet\n\n${USAGE}`)
  process.exitCode = 2
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
