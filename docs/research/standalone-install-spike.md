# Standalone install spike

The four checks that spec #899 (S13) requires before the standalone install is built, run on 2026-11-23 for ticket #900. Terms follow [GLOSSARY.md](../../GLOSSARY.md); the decision they serve is [ADR-0044](../adr/0044-standalone-install-without-plugins.md).

Each check ran on throwaway directories under a session scratchpad, never in the checkout and never in the real `$HOME`, `~/.claude` or `~/.codex`. Each temporary home received a symlink to the account's credentials file (`auth.json` inside the temporary `CODEX_HOME`, as `buildRunHome` does, and `.credentials.json` inside the temporary `~/.claude` for the Claude Code probe). No secret was copied or printed. The probe code stayed outside the repo; only this report is committed.

| Check | Question                                                                          | Result  | Read by   |
| ----- | --------------------------------------------------------------------------------- | ------- | --------- |
| C1    | A compiled binary embeds and reads the install tree byte-identically              | PASS    | #902 (T3) |
| C2    | Codex invocation names for skills in `~/.agents/skills`                           | PASS    | #910 (T9) |
| C3    | Claude Code expands a literal `$HOME` in a prompt path                            | PARTIAL | #904 (T5) |
| C4    | Appended Codex user hooks fire under `codex exec`, and are skipped when untrusted | PASS    | #910 (T9) |

## Environment

| Tool        | Version                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| Host        | Linux x86_64                                                                 |
| Bun         | 1.4.5 on the host; 1.4.4 (the `packageManager` pin) through `bunx bun@1.4.4` |
| Codex CLI   | `codex-cli 0.171.0`                                                          |
| Claude Code | `2.1.330`, model `claude-opus-5-5`                                           |

`<scratch>` below stands for the scratchpad directory of the session.

## C1: the compiled binary embeds the install tree

Result: PASS

The install tree is the 42 files S1 names: `commands/*.md` (4), `agents/*.md` (2), `emet/reference/*.md` (14), `hooks/hooks.json`, `codex/hooks.json`, `codex/skills/**` (18), `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json`.

Evidence:

- A generator wrote two entry points that import every file by absolute path, one with `with { type: "text" }` (the attribute `emet/src/assets.ts` already uses for templates) and one with `with { type: "file" }`. Each prints the sha256 of every file it reads: the text one hashes `Buffer.from(value, "utf8")`, the file one hashes `Bun.file(path).arrayBuffer()`.
- Compiled with `bun build --compile probe-text.ts --outfile probe-text` (and `probe-file`), with Bun 1.4.5 and again with `bunx bun@1.4.4 build --compile` (`strings` on the output shows `Bun v1.4.4`). Each bundle reported `43 modules`.
- Each binary was copied to a fresh `mktemp -d` and run there with `env -i HOME=<tmp> PATH=/usr/bin:/bin`. Its output was diffed against `sha256sum` of the 42 source files:

  ```text
  TEXT_IDENTICAL      (Bun 1.4.5)
  FILE_IDENTICAL      (Bun 1.4.5)
  TEXT144_IDENTICAL   (Bun 1.4.4)
  FILE144_IDENTICAL   (Bun 1.4.4)
  ```

- At run time `Bun.main` was `/$bunfs/root/probe-file`, and a `type: "file"` import resolved to `/$bunfs/root/plugin-fy4vcbnx.json`: the bytes come from the binary's embedded filesystem, not from the checkout. Files that share a basename (`plugin.json` twice, `emet/reference/*.md` and `codex/skills/run/references/*.md`) get distinct hashed names and all matched.
- Production build, host target only: `bun tools/build-binaries.ts --target bun-linux-x64 --outdir <scratch>/dist` wrote `emet-linux-x64` (110,094,512 bytes). Run from an empty temporary directory with `env -i HOME=<tmp>`, `emet-linux-x64 --version` printed `0.21.0` and created nothing in that `HOME`. The probe binary with the whole tree inlined was 109,615,280 bytes, so the tree costs well under 1 MB.

Decision: #902 (T3) embeds the tree with `with { type: "text" }` imports in a generated module, the same mechanism as `emet/src/assets.ts`. The generator writes one module, for example `emet/src/install-tree.generated.ts`, that imports each of the 42 files by its path relative to the module and exports a `Readonly<Record<string, string>>` keyed by the repo-relative path; a reader writes each value with `writeFileSync(path, value)` (UTF-8). Every file in the tree is UTF-8 text, so the text form is byte-identical and needs no `Bun.file` read. The drift check regenerates the module in memory and compares it with the committed one, naming the stale file. `with { type: "file" }` is the fallback if a non-UTF-8 file ever joins the tree: it also passed, but it needs an `await Bun.file(...).arrayBuffer()` per read and its paths only exist inside the binary.

## C2: Codex skill names under `~/.agents/skills`

Result: PASS

Evidence:

- The temporary `HOME` held these entries under `.agents/skills`:

  | Entry                                                                                                                                          | Frontmatter `name` | Manifest `name` |
  | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------- |
  | `emet-colon-run/SKILL.md`                                                                                                                      | `emet:colon-run`   | none            |
  | `emet-plain-run/SKILL.md`                                                                                                                      | `emet-plain-run`   | none            |
  | `nested/nested-run/SKILL.md`                                                                                                                   | `nested-run`       | none            |
  | `linkname-differs` → symlink to a directory with `.codex-plugin/plugin.json` (`"skills": "./codex/skills"`) and `codex/skills/symrun/SKILL.md` | `symrun`           | `emetns`        |
  | `emetroot` → symlink, manifest `"skills": "./"`, skill at `rootrun/SKILL.md`                                                                   | `rootrun`          | `emetroot`      |
  | `noskills-link` → symlink, manifest without a `skills` field, skill at `skills/noskillsrun/SKILL.md`                                           | `noskillsrun`      | `noskillsns`    |
  | `realdir-plugin/` (a real directory, no symlink), manifest `"skills": "./skills"`                                                              | `realrun`          | `realns`        |

- `codex debug prompt-input 'hi'` (no model call), run with `HOME` and `CODEX_HOME` set to the temporary directories, listed:

  ```text
  - emet-plain-run: Probe skill emet-plain-run. ... (file: r0/emet-plain-run/SKILL.md)
  - emet:colon-run: Probe skill emet:colon-run. ... (file: r0/emet-colon-run/SKILL.md)
  - emetns:symrun: Probe skill symrun. ... (file: r0/linkname-differs/codex/skills/symrun/SKILL.md)
  - emetroot:rootrun: Probe skill rootrun. ... (file: r0/emetroot/rootrun/SKILL.md)
  - nested-run: Probe skill nested-run. ... (file: r0/nested/nested-run/SKILL.md)
  - noskillsns:noskillsrun: Probe noskillsrun. (file: r0/noskills-link/skills/noskillsrun/SKILL.md)
  - realns:realrun: Probe realrun. (file: r0/realdir-plugin/skills/realrun/SKILL.md)
  ```

  with `r0` = `<scratch>/c2/env/home/.agents/skills`. The namespace is the manifest's `name`, not the directory or link name (`linkname-differs` became `emetns:`), and a real directory namespaces exactly like a symlink.

- `codex exec --json -s read-only 'Use the skills $emet:colon-run and $emetns:symrun. ...' < /dev/null` answered, with no shell command item (the skill text was injected for the mention):

  ```text
  emet:colon-run => NONCE-A-COLON
  emetns:symrun => NONCE-B-SYMLINK
  ```

- A `"hooks": "./hooks.json"` field added to the `emetns` manifest, pointing at a `PreToolUse` hook that appends to a log, did not run: `codex exec --dangerously-bypass-hook-trust` ran `echo hi` and the log was never created. Codex reads only skills, not hooks, from a manifest under `~/.agents/skills`.

Decision: #910 (T9) installs the Codex skills as `~/.agents/skills/emet/`, a real directory holding `.codex-plugin/plugin.json` and `codex/skills/**` written from the embedded tree, so the skills are invoked as `$emet:run`, `$emet:init`, `$emet:doctor` and `$emet:setup` exactly as with the plugin. A real directory is used rather than a symlink into `~/.local/share/emet/versions/<v>/`, because the binary has no tree on disk to link to and a symlink into a versioned path would dangle after pruning. The manifest's `hooks` field is harmless (it is not loaded from there), so the embedded `plugin.json` is written unchanged and the drift check stays byte-for-byte. The fallback, if a later Codex drops the manifest namespace, is a frontmatter `name: emet:run` in `~/.agents/skills/emet-run/SKILL.md` (and likewise for the other three), which C2 shows Codex 0.171.0 also accepts as `$emet:run`; the `$emet-run` names of S4 are not needed.

## C3: a literal `$HOME` in a Claude Code prompt path

Result: PARTIAL

Today `install.sh` rewrites `${CLAUDE_PLUGIN_ROOT}` to the literal text `$HOME/.claude` in the installed commands and agents, so the question is who expands it.

Evidence:

- The temporary `HOME` held `~/.claude/commands/c3probe.md` saying "Read this file and follow it: `$HOME/.claude/emet/reference/probe-nonce.md`. Reply with the file's single line", and the nonce file at that path. The account's real home has no such file.
- Run 1, `claude -p '/c3probe' --output-format stream-json --verbose --no-session-persistence --allowedTools Read 'Bash(echo:*)'`: the model first called Bash with `cat "$HOME/.claude/emet/reference/probe-nonce.md"`; Claude Code's permission layer expanded `$HOME` itself and refused with `cat in '<scratch>/c3/env/home/.claude/emet/reference/probe-nonce.md' was blocked ...`; the model then called Read on that absolute path and answered `C3-NONCE-LITERAL-HOME-91D2`.
- Run 2, `--tools Read` without allowing it, showed the model's own resolution: Read on `<scratch>/c3/env/home/.claude/emet/reference/probe-nonce.md`, then on `<account home>/.claude/emet/reference/probe-nonce.md` (both stopped for permission).
- Run 3, `--tools Read --allowedTools Read`, with the temporary home at an unrelated path containing a space (`<scratch>/c3/zz q/u7q`) and the working directory at `<scratch>/c3/w9/repo`: the first Read went to `<account home>/.claude/emet/reference/probe-nonce.md` and failed with `File does not exist`; the second went to `<scratch>/c3/zz q/u7q/.claude/emet/reference/probe-nonce.md` and answered the nonce.
- In every run the model quoted the path back as `$HOME/.claude/...`: Claude Code does not substitute `$HOME` in command or prompt text. The model resolves it; a shell (Bash) or the Bash permission layer expands it.

Decision: #904 (T5) keeps the literal `$HOME/.claude` rewrite that `install.sh` applies today, so the installed prompt hashes stay equal to the ones pinned in `tools/claude-install-invariant.test.ts`, as S2 requires; an absolute path would make every hash depend on the user's home and break that pin. This is safe in a real install: the only wrong first guess seen was the account's own home, which is `$HOME` whenever the user is not running under a substituted `HOME`, and the model recovered from it in every run. Paths with spaces resolved correctly. What T5 must not do is rely on Claude Code to expand `$HOME` anywhere it is read without a model in between: hook commands in `~/.claude/settings.json` are run by a shell, so S3's `$HOME/.local/bin/emet` there is expanded by that shell and is fine, but any value emet itself reads back must be expanded by emet.

## C4: appended Codex user hooks under `codex exec`

Result: PASS

Evidence:

- The temporary `HOME` was `<scratch>/c4/sp ace/home` (a path with a space), with `~/.local/bin/emet` a symlink to the `emet-linux-x64` binary from C1. The temporary `CODEX_HOME` held only the `auth.json` symlink and this `hooks.json`, emet's entry appended after a foreign one:

  ```json
  {
    "hooks": {
      "PreToolUse": [
        {
          "matcher": "Bash",
          "hooks": [
            {
              "type": "command",
              "command": "echo foreign-pretooluse >> \"<scratch>/c4/sp ace/foreign.log\""
            }
          ]
        },
        {
          "matcher": "Bash|apply_patch",
          "hooks": [
            {
              "type": "command",
              "command": "EMET_AGENT_HOST=codex \"<scratch>/c4/sp ace/home/.local/bin/emet\" guard"
            }
          ]
        }
      ]
    }
  }
  ```

- The project was a fresh `git init` with one empty commit and no remote. The prompt, passed on stdin with `-`, asked Codex to run `git push origin HEAD .` and report its output or block reason.
- With the bypass flag, `codex exec --json -s workspace-write --dangerously-bypass-hook-trust -`: two `error` items carried Codex's notice ``--dangerously-bypass-hook-trust` is enabled. Enabled hooks may run without review for this invocation.``, no `command_execution` item appeared, and the agent replied `Command blocked by PreToolUse hook: git push is not allowed. Command: git push origin HEAD .`. stderr logged `ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: git push is not allowed.` and `foreign.log` held `foreign-pretooluse`. Both hooks ran, the foreign one first, and the absolute `emet guard` denied the push.
- Without the flag, `codex exec --json -s workspace-write -`: a `command_execution` item ran `/bin/bash -lc 'git push origin HEAD .'` and returned `fatal: invalid refspec '.'`, `foreign.log` was never created, and neither stderr nor the JSONL mentioned a hook. Untrusted user hooks are skipped silently. Codex wrote no `config.toml` into the temporary `CODEX_HOME`.

Decision: #910 (T9) appends the embedded Codex hooks after existing entries in `$CODEX_HOME/hooks.json`, each command in the form `EMET_AGENT_HOST=codex "<absolute $HOME>/.local/bin/emet" <args>` with the path double-quoted, and never writes `config.toml`. Because an untrusted hook is skipped with no message, the install must print the one-time `/hooks` trust step itself, and `emet doctor` (S10) is the only later signal that trust is missing. Worker runs are unaffected: `emet dispatch` and `emet launch` already pass `--dangerously-bypass-hook-trust` with their own overlay `hooks.json`.

## Method for later tickets

- Run probes with `HOME` and `CODEX_HOME` pointing at temporary directories, set through a small wrapper script that exports both and `exec`s the command; link (never copy) `auth.json` or `.credentials.json` into them.
- Close stdin for `codex exec` (`< /dev/null`, or pass the prompt as `-` on stdin): otherwise it blocks on `Reading additional input from stdin...`.
- `codex debug prompt-input` shows the skill list without a model call, but it does not expand a `$skill` mention; confirming an invocation needs `codex exec`.
- Read results from `codex exec --json` items (`command_execution`, `agent_message`, `error`) and from `claude -p --output-format stream-json --verbose` (`tool_use` inputs and `tool_result` text).
- Codex prints `WARNING: proceeding, even though we could not create PATH aliases` when `CODEX_HOME` is under `/tmp`; it is harmless for these probes.
