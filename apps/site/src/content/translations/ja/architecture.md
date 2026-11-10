---
title: アーキテクチャ
description: emet/src のコードマップと、/emet のプロンプトがそれをどのように動かすかを説明します。
seoTitle: emet のアーキテクチャ
sourceHash: ff28425abc92b5c9
---

`emet/src` のコードマップと、`/emet` のプロンプトがそれをどのように動かすかを説明します。用語は [GLOSSARY.md](../GLOSSARY.md) に従います。この構成の背景にある決定は [docs/adr](adr/README.md) にあります。問題が起きた場合は、[トラブルシューティング](troubleshooting.md)を参照してください。

- [構成](#構成)
- [プロンプトが CLI を動かす仕組み](#プロンプトが-cli-を動かす仕組み)
- [モジュールマップ](#モジュールマップ)
- [プロンプトの配置](#プロンプトの配置)
- [配布](#配布)
- [関連項目](#関連項目)

## 構成

構成は 2 つの部分からなります。プロンプト（`commands/run.md`、`agents/*.md`、`emet/reference/*.md`、および Codex 向けに生成される `codex/skills/**` と `codex/hooks.json`）は、各フェーズでエージェントが何をすべきかを伝えます。`emet` CLI（`emet/bin/emet.ts` と `emet/src/`）は、決定的でなければならないすべてのこと、つまりチェック、クレーム、スロット、ゲート、トラッカーへの書き込み、ランディングを担います。プロンプトが、CLI がすでに行っているチェックを再実装することはありません。

`emet/bin/emet.ts` は薄いディスパッチャーです。最初の引数を読み取り、1 つのサブコマンドモジュールに処理を渡し、そのモジュールが残りの `process.argv` を自分で読み取ります。終了コードは、サブコマンド全体で意味が共通です。

## プロンプトが CLI を動かす仕組み

`commands/run.md` は短いルーターです。`emet/reference/` のフェーズファイルを一度に 1 つずつ読み込むため、コンパクションが起きても現在のフェーズのルールが失われることはありません。

| フェーズ                                     | プロンプト                                   | CLI 呼び出し                                                                  |
| -------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| 1-5 インタビュー、スペック、チケット、承認   | `phases-1-5.md`                              | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                |
| 6-7 ディスパッチとワーカー                   | `phases-6-7-dispatch.md`, `worker-prompt.md` | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results` |
| 8 レビュー、ゲート、ランディング、締めくくり | `phases-8-closeout.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `cleanup`     |
| 9 ハンドオフとチェーン                       | `phases-9-handoff.md`                        | `status`, `metrics`, `usage`, `spec-merge`                                    |

コーディネーターは唯一のトラッカー書き込み担当です（ADR-0005）。ワーカーはハンドオフノートと `emet results` を通じて報告し、コーディネーターがそれを投稿します。`emet guard` は `PreToolUse` フックとして動作し、無人実行で失敗の引き金になることが知られている操作をブロックします。

## モジュールマップ

各モジュールの隣には `*.test.ts` があります。

| 領域                   | モジュール                                                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| セットアップと監査     | `init.ts`（設定とドキュメントの骨組み）、`config.ts`（`emet.config.json`。旧形式の `forge.config.json` も引き続き読み取る）、`doctor.ts`（フリートのスイープ）、`preflight.ts`（ディスパッチの衛生管理）、`dependencies.ts`、`skills.ts`（mattpocock-skills の契約）、`map.ts`（コードベースの概要） |
| 実行状態               | `claims.ts`（チケットの予約）、`slots.ts`（ワーカースロットのプール）、`resources.ts`（ホストの情報）、`runs.ts`（生存確認）、`locks.ts`、`lockreason.ts`、`proctree.ts`、`worktrees.ts`、`cleanup.ts`、`status.ts`、`launch.ts`                                                                     |
| トラッカー             | `tracker.ts`、`tracker-files.ts`（ローカルの `.scratch/` トラッカー）、`validate.ts`（スペックのカバレッジ）、`specmerge.ts`、`approve.ts`、`surfaces.ts`（編集サーフェスの重複）                                                                                                                    |
| ワーカーのハンドオフ   | `handoff.ts`、`results.ts`、`materializelog.ts`                                                                                                                                                                                                                                                      |
| レビューとランディング | `verify.ts`、`reviewpackage.ts`、`review.ts`（指摘の台帳）、`assess.ts`（リスク分類器）、`gate.ts`、`land.ts`                                                                                                                                                                                        |
| レポート               | `metrics.ts`、`usage.ts`                                                                                                                                                                                                                                                                             |
| 安全性                 | `guard.ts`、`guard-destructive.ts`                                                                                                                                                                                                                                                                   |
| 共有ヘルパー           | `narrow.ts`、`optional.ts`、`assets.ts`（コンパイル済みバイナリに埋め込まれたファイル）                                                                                                                                                                                                              |

ホスト固有の値は `agenthost.ts` の `AgentHost` インターフェースの背後にあります。`agenthost-claude.ts` が Claude Code 用、`agenthost-codex.ts` が Codex 用のアダプターで、設定の `agentHost` で選ばれます。Codex 側は `codex-models.ts`（モデル解決）、`codex-home.ts`（実行ごとの `CODEX_HOME` オーバーレイ）、`codex-process.ts` と `codex-session.ts`（プロセス実行と引き継ぎ）、`codex-usage.ts`（`exec --json` からの使用量）、`guard-codex.ts`（フック入力と承認ゲート）、`dispatch.ts`、`review-run.ts` を追加します。[Codex ガイド](guide/codex.md)を参照してください。

## プロンプトの配置

`commands/run.md`（約 130 行）が Claude Code での `/emet` のルーターで、Codex ではその役割を生成された `codex/skills/**` と `codex/hooks.json` が担います。`emet/reference/` の各ファイルは 1 つのフェーズグループ（`phases-1-5.md`、`phases-6-7-dispatch.md`、`phases-8-closeout.md`、`phases-9-handoff.md`）で、現在の実行のモードが必要とするときにだけ読み込まれます。いずれかが 20,000 バイトを超えるとテストが失敗するため、1 つのファイルがコンパクション後のコンテキストを占有することはありません。フェーズは、修正やレビューの各ラウンドの前に、該当するセクションを読み直すようコーディネーターに指示します。`install.sh` は、古い単一の `phases-6-9.md` を、編集されている場合やインストールマニフェストより前のものである場合は `phases-6-9.md.retired` として脇に移し、そうでなければ削除します。また `install.sh` は、`emet guard` を `PreToolUse` フックとして `~/.claude/settings.json` に組み込みます。

## 配布

`install.sh` は `emet/` を `~/.claude/emet` にコピーし、プロンプトを書き換えます。Codex プラグインは `.codex-plugin/plugin.json` で記述され、`codex/skills/**` および `codex/hooks.json` とともに `bun run build:codex` で生成されます。Claude Code のプラグインの経路では、`tools/build-binaries.ts` がビルドしたチェックサム検証済みのスタンドアロンバイナリをダウンロードするシムが提供されます。[ADR-0008](adr/0008-standalone-binaries-and-plugin-distribution.md) を参照してください。

## 関連項目

- [はじめに](guide/getting-started.md)と[トラッカーとランディング](guide/trackers-and-landing.md)
- [設定リファレンス](reference/configuration.md)、[CLI リファレンス](reference/cli.md)、[依存関係](reference/dependencies.md)
- [AGENTS.md](../AGENTS.md) と [emet/AGENTS.md](../emet/AGENTS.md)
- [ドキュメント索引](README.md)
