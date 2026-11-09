---
title: 依存関係
description: emet がマシン上で必要とするものと、各項目を確認するコマンドを説明します。
seoTitle: emet の依存関係
sourceHash: 50444429c7883bd3
---

emet がマシン上で必要とするものと、各項目を確認するコマンドです。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。[README](../../README.md) に戻る。

## 必須

- **[bun](https://bun.sh)**: ソースからのインストールの場合のみ必要です。スタンドアロンバイナリにはランタイムは不要です。
- **`rsync`** と **`sha256sum` または `shasum`**: `install.sh` が必要とします。
- **`git`**: 実行時に必須です。ほぼすべてのサブコマンドが git を呼び出します。
- **認証済みの `gh` CLI**: トラッカーが `github` の場合、またはランディングが `pr` の場合に必須です。PR では常に使用されます。`tracker.kind: "local"` かつ `landing.mode: "merge"` の場合、`gh` は不要です。
- **`mattpocock-skills` プラグイン**（`claude-plugins-official` マーケットプレイス）: `/emet` のインタビュー、スペック、チケットの各フェーズは、そこにあるスキルを呼び出します。

  ```bash
  claude plugin marketplace add anthropics/claude-plugins-official
  claude plugin install mattpocock-skills@claude-plugins-official
  ```

- **`~/.claude/agents/` にある `emet-worker` と `emet-reviewer` エージェント**: `install.sh` がインストールします。フェーズ 6 とフェーズ 8 は `subagent_type` でディスパッチするため、どちらかが欠けるとディスパッチが機能しません。[モデルとエフォート](../../README.md#models--effort)を参照してください。
- **`.mcp.json`（またはユーザースコープ）で宣言された Linear MCP サーバー**: リポジトリが `linear` トラッカーを使う場合のみ必要です。emet は宣言があることを確認します。接続が認証済みかどうかは Claude Code 自身の認証情報ストアにあり、ここから確認することはできません。実行中にチケットの読み取りに失敗した場合は、Claude Code を再起動して接続を承認してください。

上記のいずれも、ユーザーに代わってインストールやログインが行われることはありません。違いは、誰がどの程度厳密に確認するかです。

## Codex ホスト

`agentHost` が `"codex"` のときだけ必要です。[Codex ガイド](../guide/codex.md)を参照してください。`emet-worker` と `emet-reviewer` エージェントはそこでは使いません。

- **`codex` CLI**。ログイン済みで、`codex.minVersion`（既定 `0.167.0`）以降のバージョン。`emet doctor` は古いバージョンを報告し、`codex exec --help` に `--json` と `--output-schema` が載っているか確認します。
- Codex の **`mattpocock-skills` プラグイン**。`codex plugin list` で確認します。

  ```bash
  codex plugin marketplace add mattpocock/skills
  codex plugin add mattpocock-skills@mattpocock
  ```

- **Codex 用の emet プラグイン** (`.codex-plugin/plugin.json`)。`$emet:run`、`$emet:init`、`$emet:doctor` スキルと承認フックを含みます。

emet があなたの `~/.codex` に書き込むことはありません。ワーカーは、認証と設定へのリンクを持つ実行ごとの `CODEX_HOME` で動きます。

## 何が何を確認するか

|                                                       | `emet init`                | `emet doctor`                   | `emet preflight`                                                                           |
| ----------------------------------------------------- | -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| プラグインがない、または無効                          | インストールコマンドを表示 | 報告する（フリート全体で 1 回） | **ディスパッチをブロックする**                                                             |
| `emet-worker`/`emet-reviewer` エージェントがない      | —                          | 報告する（フリート全体で 1 回） | **ディスパッチをブロックする**                                                             |
| `gh` がない、または未認証（トラッカー: `github`）     | 実行すべきコマンドを表示   | 報告する                        | **ディスパッチをブロックする**                                                             |
| Linear サーバーが未宣言（トラッカー: `linear`）       | 注意書きを表示             | 報告する                        | **ディスパッチをブロックする**                                                             |
| `claude` が PATH にない、またはプローブがタイムアウト | 注意書きを表示             | 報告する                        | **警告するがブロックしない**: 「確認できなかった」であり、「壊れていると確認した」ではない |
| emet が依存するフラグが `--help` にない               | —                          | 報告する                        | —                                                                                          |

### フラグのチェック

`emet doctor` は、バイナリが存在するかどうかだけでなく、フラグそのものを確認します。`gh issue view` と `gh repo view`（`--json`）、`gh issue edit`（`--add-label`、`--remove-label`）、`claude`（`--bg`）、`claude agents`（`--json`）の `--help` を読み取り、新しい、または古い CLI が文書化しなくなったフラグを報告します。フラグ名が変わっていると、ウェーブが途中で失敗するおそれがあるためです。

### タイムアウトとブロックの回避

すべてのプローブは 5 秒に制限されているので、停止した `gh auth status`（ネットワークなし）がウェーブをハングさせることはありません。`preflight` のブロックがお使いの環境では誤りである場合は、`EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` を使うと、その 1 回の実行に限って警告に格下げできます。自分のシェルで設定し、`/emet` コーディネーターが無人で実行するものには設定しないでください。[環境変数](cli.md#環境変数)を参照してください。

### リポジトリ側で管理するバイナリ

リポジトリの `preflight.requiredCommands`（`emet.config.json` 内）は、`emet preflight` と `emet doctor` が PATH 上に必須とするバイナリの、リポジトリ側で管理する別のリストです。ワーカーのプロンプトがファイルを丸ごと読む代わりのより高速な手段として勧める `rg` と `sg` に便利です。`gh` はここに記載する必要はありません。上記のチェックですでにカバーされています。[`preflight`](configuration.md#preflight) を参照してください。

失敗とその対処については、[トラブルシューティング](../troubleshooting.md#依存関係のチェックが失敗する)を参照してください。
