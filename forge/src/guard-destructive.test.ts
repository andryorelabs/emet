import { describe, expect, test } from 'bun:test'

import {
  checkDestructiveCommand,
  checkEditSurface,
  findDestructiveOperation,
} from './guard-destructive'

const DENIED = [
  'git reset --hard HEAD~1',
  'git -C /x reset --hard',
  'git clean -fd',
  'git clean --force -d',
  'git push --force origin main',
  'git push -f',
  'git push origin +main',
  'git branch -D feature',
  'rm -rf node_modules',
  'rm -r dir',
  'rm --recursive dir',
  'env FOO=1 git reset --hard',
  'sudo rm -rf /tmp/x',
  'timeout 10 git push --force',
  'echo a | xargs rm -r',
  `sh -c "git clean -fdx"`,
  `bash -c 'cd x && git branch -D y'`,
  `cat <<EOF | sh\nls\nrm -rf build\nEOF`,
  'psql -c "DROP TABLE users"',
  'psql -c "drop table users"',
  'echo ok; TRUNCATE TABLE logs',
]
const ALLOWED = [
  'git reset --soft HEAD~1',
  'git reset HEAD file',
  'git clean -n',
  'git push origin feature',
  'git push --force-with-lease',
  'git branch -d merged',
  'git branch -a',
  'rm file.txt',
  'rm -f file.txt',
  'truncate -s 0 file.log',
  'echo "git reset --hard is dangerous"',
  'git commit -m "docs: explain rm -r and DROP TABLE"',
  'grep -rn "git push --force" docs',
  'ls -la && bun test',
  'rg DROP src',
]

describe('destructive commands', () => {
  for (const command of DENIED) {
    test(`denies ${JSON.stringify(command)}`, () => {
      expect(findDestructiveOperation(command)).not.toBeNull()
      expect(
        checkDestructiveCommand({ tool_name: 'Bash', tool_input: { command } }).decision,
      ).toBe('deny')
    })
  }
  for (const command of ALLOWED) {
    test(`allows ${JSON.stringify(command)}`, () => {
      expect(findDestructiveOperation(command)).toBeNull()
    })
  }
  test('ignores non-Bash tools', () => {
    expect(
      checkDestructiveCommand({ tool_name: 'Read', tool_input: { command: 'rm -rf /' } }).decision,
    ).toBe('allow')
  })
})

describe('edit surfaces', () => {
  const surface = { root: '/repo', globs: ['forge/src/guard*.ts', 'forge/bin/forge.ts'] }
  const load = () => surface
  const edit = (
    file_path: string,
    loader: (cwd: string) => { root: string; globs: string[] } | null = load,
  ) =>
    checkEditSurface({ tool_name: 'Edit', cwd: '/repo', tool_input: { file_path } }, loader)
      .decision

  test('allows inside, denies outside', () => {
    expect(edit('/repo/forge/src/guard.ts')).toBe('allow')
    expect(edit('forge/bin/forge.ts')).toBe('allow')
    expect(edit('/repo/forge/src/claims.ts')).toBe('deny')
    expect(edit('/etc/passwd')).toBe('deny')
    expect(edit('/repo/../other/x.ts')).toBe('deny')
  })
  test('always allows .forge notes', () => {
    expect(edit('/repo/.forge/handoff-CLA-30.md')).toBe('allow')
  })
  test('no surface file means no restriction', () => {
    expect(edit('/repo/anything.ts', () => null)).toBe('allow')
  })
})

describe('review regressions', () => {
  const bash = (command: string) =>
    checkDestructiveCommand({ tool_name: 'Bash', tool_input: { command } }).decision

  test('allows commit and PR bodies that mention destructive commands', () => {
    expect(
      bash("git commit -m \"$(cat <<'EOF'\nfeat: x\n\n- Deny git reset --hard, DROP TABLE\nEOF\n)\""),
    ).toBe('allow')
    expect(
      bash("gh pr create --body \"$(cat <<'EOF'\ndenies git push --force\nEOF\n)\""),
    ).toBe('allow')
  })
  test('still denies destructive heredoc bodies fed to a shell', () => {
    expect(bash('sh <<EOF\ngit reset --hard\nEOF')).toBe('deny')
  })
  test('denies path-qualified, escaped and substituted rm', () => {
    expect(bash('/bin/rm -rf x')).toBe('deny')
    expect(bash('\\rm -rf x')).toBe('deny')
    expect(bash('echo $(rm -rf x)')).toBe('deny')
    expect(bash('echo "rm -rf x" | sh')).toBe('deny')
  })
})
