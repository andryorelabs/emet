const USAGE = `usage: forge review-package <base> <head>`

export async function run(_argv: string[]): Promise<void> {
  console.error(`forge review-package: not implemented yet\n\n${USAGE}`)
  process.exitCode = 2
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}
