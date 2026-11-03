const USAGE = `usage: forge validate --spec <id> | --file <path>`

export async function run(_argv: string[]): Promise<void> {
  console.error(`forge validate: not implemented yet\n\n${USAGE}`)
  process.exitCode = 2
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
