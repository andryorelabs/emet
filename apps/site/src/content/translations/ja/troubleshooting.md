---
title: トラブルシューティング
description: emet doctor と emet preflight の失敗を、見える症状ごとに分類し、それぞれの原因と対処を説明します。
seoTitle: emet doctor と preflight のトラブルシューティング
sourceHash: 459018815038cdc0
---

`emet doctor` と `emet preflight` の失敗を、見える症状ごとに分類し、それぞれの原因と対処を示します。用語は [GLOSSARY.md](../GLOSSARY.md) に従います。各チェックがどう組み合わさっているかは、[アーキテクチャ](concepts/architecture.md)を参照してください。

<img src="brand/mascot/mascot-error.svg" alt="" width="96">

`forge.config.json`、`.forge/`、`FORGE_*` 変数しか持たないリポジトリも引き続き動作します。`emet` は旧来の名前を読み取り、それぞれの旧ファイルを挙げた stderr 行を 1 行出力し、`emet migrate` がそれらをリネームします。

- [前提条件](#前提条件)
- [no emet.config.json](#no-emetconfigjson)
- [emet.config.json is malformed](#emetconfigjson-is-malformed)
- [docs/agents still has TODO(emet) markers](#docsagents-still-has-todoemet-markers)
- [依存関係のチェックが失敗する](#依存関係のチェックが失敗する)
- [no longer documents a flag in --help](#no-longer-documents-a-flag-in---help)
- [インストール済みのファイルがない、またはインストール後に編集された](#インストール済みのファイルがないまたはインストール後に編集された)
- [Stop hook error: forge: No such file or directory](#stop-hook-error-forge-no-such-file-or-directory)
- [空きワーカースロットがない](#空きワーカースロットがない)
- [ロックされたワークツリーが期待より少ない](#ロックされたワークツリーが期待より少ない)
- [チケットが複数のワークツリーまたはブランチでクレームされている](#チケットが複数のワークツリーまたはブランチでクレームされている)
- [requiredCommands not on PATH](#requiredcommands-not-on-path)
- [Codex ホスト](#codex-ホスト)
- [確認](#確認)
- [関連項目](#関連項目)

## 前提条件

- `emet` が `PATH` にあること。[インストール](start/install.md)を参照してください。
- 問題のあるリポジトリのルートにあるシェル。
- `emet doctor .` または `emet preflight` が出力した正確なメッセージ。上の一覧から探してください。

## no emet.config.json

**症状:** `emet doctor` が `no emet.config.json — run "emet init" here` と出力する。

**原因:** リポジトリにまだ `/emet` の設定がありません。

**対処:**

1. リポジトリのルートで `emet init` を実行します。
2. 生成された設定を確認し、`docs/agents/` のファイルを埋めます。

## emet.config.json is malformed

**症状:** `emet.config.json is malformed: <reason>`。`emet preflight` が終了コード 2 で終了する。

**原因:** 設定は厳密な JSON で、`emet/schema/emet.config.schema.json` に対して検証されます。コメントと末尾のカンマは拒否されます。

**対処:**

1. 理由に挙げられたフィールドを修正します。
2. または `emet init --force` で設定を再生成します。

## docs/agents still has TODO(emet) markers

**症状:** `docs/agents/ still has N TODO(emet): marker(s)`。`emet doctor` は `docs/agents/<file>` がないことも報告する。

**原因:** `emet init` は、値を検出できない箇所にマーカーを残します。

**対処:**

1. マーカーのある各行を埋めるか、解消してから `emet init --force` を実行します。
2. `emet preflight` を実行します。マーカーが 1 つでも残っている間、ディスパッチを拒否します。

## 依存関係のチェックが失敗する

**症状:** `emet doctor` に `dependency: ...` の行が表示される、または `emet preflight` で依存関係の失敗によりブロックされる（たとえば `gh` がない、または未認証、あるいは mattpocock-skills プラグインがない、または未検証のバージョン）。

**原因:** `/emet` には `git`、`gh`、mattpocock-skills プラグインが必要です。`emet/src/dependencies.ts` と `emet/src/skills.ts` を参照してください。

**対処:**

1. ツールをインストールまたは認証するか、`setup-matt-pocock-skills` スキルを実行します（Claude Code では `/setup-matt-pocock-skills`、Codex では Codex の `$` 構文で同じスキル）。
2. お使いの環境でチェックが誤っている場合は、`EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` を実行して警告に格下げします。

## no longer documents a flag in --help

**症状:** `<tool> no longer documents <flags> in --help — emet relies on it`、または `could not be run — cannot verify <flags>`。

**原因:** `emet doctor` は、バイナリが存在するかどうかだけでなく、`emet` が依存するフラグを確認します。インストールされているバージョンでそのフラグが削除または名前変更されています。

**対処:** そのフラグを引き続き文書化しているバージョンのツールをインストールしてください。

## インストール済みのファイルがない、またはインストール後に編集された

**症状:** `~/<path> is missing — re-run emet self install` または `~/<path> was edited since install`。

**原因:** インストール済みのコピーが、インストールマニフェストと一致しなくなっています。

**対処:**

1. `emet self install` を再実行します（ソースのチェックアウトからは `emet self install --from .`）。
2. 編集されたファイルの隣に保留中の `.new` ファイルがある場合は、マージするか削除します。

## Stop hook error: forge: No such file or directory

**症状:** Claude Code が、毎ターンの終わりに `Stop hook error: … forge: No such file or directory`（または `emet` について同様のもの）を出力する。

**原因:** `~/.claude/settings.json` に、バイナリが移動または削除された `forge guard` または `emet guard` のフックがまだ残っています。

**対処:**

1. `emet doctor .` を実行します。無効なガードフックを、そのイベントとともにそれぞれ一覧表示します。
2. 出力される `cp … && jq …` コマンドを 1 つ実行します。`settings.json` をバックアップし、それらのフックだけを削除します。doctor がファイル自体を編集することはありません。

## 空きワーカースロットがない

**症状:** `No free worker slots at all: 0 free out of N`、または `only K/N worker slot(s) free`。

**原因:** `~/.local/state/emet/slots` のすべてのスロットが、稼働中またはアイドル状態の実行に保持されているため、ウェーブを完全にはディスパッチできません。

**対処:**

1. `emet status` を実行して、誰が各スロットを保持しているかを確認します。
2. 実行がスロットを解放するのを待つか、完了していると分かっている実行に対して `emet cleanup --run <runId>` を実行します。

## ロックされたワークツリーが期待より少ない

<img src="brand/mascot/mascot-sleep.svg" alt="" width="64">

**症状:** `Expected N locked worktree(s) for run <id>, found M`。

**原因:** ワーカーがロック理由を付けて自分のワークツリーをクレームしなかったか、`isolation: "worktree"` によって別の場所に配置されました。[`incidents.md`](../emet/reference/incidents.md) を参照してください。

**対処:**

1. `git worktree list --porcelain` を実行し、ロックされたエントリーを確認します。
2. `emet lock-reason` を実行して期待される理由の形式を確認し、その形式でワーカーのワークツリーを再ロックします。

## チケットが複数のワークツリーまたはブランチでクレームされている

**症状:** `<ticket> is claimed by N worktrees`、`has N branches`、または `is checked out on branch ..., but its own lock names ticket ...`。

**原因:** 再試行や誤ったシェルのルーティングによって、重複が残りました。

**対処:**

1. 正規のワークツリーまたはブランチを残します。
2. 残りを削除または再ロックします。
3. `emet preflight` を再実行します。

## requiredCommands not on PATH

**症状:** `preflight.requiredCommands not on PATH: <names>`。

**原因:** `emet.config.json` の `preflight.requiredCommands` に、リポジトリが必要とするバイナリが記載されています。

**対処:**

1. 指定されたバイナリをインストールします。
2. または、不要になった場合は `preflight.requiredCommands` から削除します。

## Codex ホスト

以下は `agentHost` が `"codex"` のときに当てはまります。[Codex で emet を実行する](how-to/use-codex.md)を参照してください。

**`codex.minVersion` より古い `codex`。** `emet doctor .` が報告します。`codex.minVersion`（既定は `0.167.0`）以上のバージョンの `codex` CLI をインストールしてから、もう一度 `emet doctor .` を実行してください。

**`--json` または `--output-schema` フラグがない。** `emet doctor .` は、どちらかのフラグを文書化していない `codex exec` を報告します。emet はワーカーとレビュアーの起動にその両方を使います。両方を文書化している `codex` のバージョンをインストールしてください。

**設定したモデルが一覧にない。** emet はモデルを、実行ホーム内の `models_cache.json`、なければ実際の Codex ホーム内の `models_cache.json`（読み取り専用）に対して解決します。一覧にないスラッグは置き換えられ、その置き換えが記録されます。何も解決できない場合、`emet review-run` はモデル呼び出しの前に、ロールと一覧にあるスラッグを示して失敗します。`codex.models` には一覧にあるスラッグを設定してください。[設定リファレンス](reference/configuration.md#codex)を参照してください。

## 確認

1. `emet doctor .` を実行し、修正した問題について失敗が報告されないことを確認します。
2. `emet preflight` を実行し、終了コード 0 で終わることを確認します。

## 関連項目

- [ドキュメント索引](README.md)
- [README](../README.md)
- [はじめに](start/install.md)
- [設定リファレンス](reference/configuration.md)
- [依存関係リファレンス](reference/dependencies.md)
