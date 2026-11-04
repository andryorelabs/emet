---
name: git-commit
description: 'Create git commits as reviewable work units with Conventional Commits messages and a recommended gitmoji. Use when the user asks to commit, mentions "/commit", or wants a messy working tree split into several commits. Not for pushing, rebasing, or opening PRs.'
license: MIT
allowed-tools: Bash
---

# Git Commit

Turn the working tree into small, logical commits. Each commit does one thing, and its message explains why.

Gitmoji is the recommended default in this repo, not a requirement: commitlint accepts both `type: <gitmoji> subject` and plain `type: subject`. Use the gitmoji form unless the user asks otherwise.

## Message Format

```
<type>[optional scope]: <gitmoji> <description>

- Bullet explaining what changed and why
- Another bullet

[optional footer: Refs: #123 / Closes #123 / BREAKING CHANGE: ...]
```

Example: `feat: ✨ add user authentication` (plain `feat: add user authentication` also passes commitlint)

- Imperative mood, present tense ("add", not "added"), under 72 characters, no trailing period
- Body is bullet points; explain the why, not what the diff already shows
- Always English

| Type       | Gitmoji | Purpose                        |
| ---------- | ------- | ------------------------------ |
| `feat`     | ✨      | New feature                    |
| `fix`      | 🐛      | Bug fix                        |
| `docs`     | 📝      | Documentation only             |
| `style`    | 🎨      | Formatting (no logic)          |
| `refactor` | ♻️      | Neither feature nor fix        |
| `perf`     | ⚡️      | Performance                    |
| `test`     | ✅      | Add/update tests               |
| `build`    | 📦️      | Build system, dependencies     |
| `ci`       | 👷      | CI configuration               |
| `chore`    | 🔧      | Maintenance                    |
| `revert`   | ⏪️      | Revert a commit                |

Breaking change: add `!` after the type (`feat!: 💥 remove legacy endpoint`) and a `BREAKING CHANGE:` footer.

## Work Units (deciding the cut)

- One logical change per commit
- Never mix refactor with feature, or formatting with behavior
- Tests and docs travel in the same commit as the code they cover
- Size guide: ~100 lines easy to review, ~300 acceptable, over ~1000 split it
- Commit each working slice; do not accumulate a giant uncommitted tree

## Workflow

### 1. Inspect

```bash
git status --porcelain
git diff --staged   # if nothing staged: git diff
```

### 2. Plan the cut

If the tree mixes concerns, group files (or hunks) into work units and say the plan in one line before committing. Stage per unit with explicit paths:

```bash
git add path/to/file1 path/to/file2
```

Never use interactive staging (`git add -p`, `-i`): it is not supported here.

### 3. Pre-commit checks

```bash
git diff --staged -i -G'password|secret|api_key|token' --name-only
```

Any output means review those files before committing. Never commit `.env`, credentials, or private keys.

Run the project's `check` / `lint` / `test` scripts from package.json with the detected package manager (bun.lock → bun, pnpm-lock.yaml → pnpm, package-lock.json → npm). Do not run `build` unless asked.

### 4. Commit

```bash
git commit -m "$(cat <<'EOF'
feat: ✨ add user authentication

- Added OAuth2 flow
- Created user session management
EOF
)"
```

Repeat for each work unit.

## Large Changes

If one branch grows past ~1000 lines, suggest splitting it into chained PRs (each branching from the previous, each independently reviewable) instead of one giant PR. Always work on feature branches, never push directly to main/master.

## Git Safety Protocol

- NEVER update git config
- NEVER run destructive commands (`--force`, `reset --hard`) without an explicit request
- NEVER skip hooks (`--no-verify`) unless asked
- NEVER force push to main/master
- If a commit fails due to hooks, fix the issue and create a NEW commit (do not amend)
