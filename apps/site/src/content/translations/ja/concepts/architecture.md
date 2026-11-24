---
title: アーキテクチャ
description: emet/src のコードマップと、/emet のプロンプトがそれをどのように動かすかを説明します。
seoTitle: emet のアーキテクチャ
sourceHash: ac65f41cf78af13e
---

`emet/src` のコードマップと、`/emet` のプロンプトがそれをどのように動かすかを説明します。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。この構成の背景にある決定は [docs/adr](../adr/README.md) にあります。問題が起きた場合は、[トラブルシューティング](../troubleshooting.md)を参照してください。

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

| フェーズ                                     | プロンプト                                                                                    | CLI 呼び出し                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1-5 インタビュー、スペック、チケット、承認   | `phases-1-5.md`                                                                               | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                                         |
| 6-7 ディスパッチとワーカー                   | `phases-6-7-dispatch.md`, `worker-prompt.md`                                                  | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results`                          |
| 8 レビュー、ゲート、ランディング、締めくくり | `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `spec-branch`, `spec-merge`, `cleanup` |
| 9 ハンドオフとチェーン                       | `phases-9-handoff.md`                                                                         | `status`, `metrics`, `usage`                                                                           |

コーディネーターは唯一のトラッカー書き込み担当です（ADR-0005）。ワーカーはハンドオフノートと `emet results` を通じて報告し、コーディネーターがそれを投稿します。`emet guard` は `PreToolUse` フックとして動作し、無人実行で失敗の引き金になることが知られている操作をブロックします。

## モジュールマップ

各モジュールの隣には `*.test.ts` があります。`tools/architecture-map.test.ts` は、`emet/src` のテストではないモジュールがこの一覧に欠けていると失敗します。

**セットアップ、インストール、監査**

- `init.ts` は設定とドキュメントの骨組みを書き出します。`config.ts` は `emet.config.json` を読み取ります（旧形式の `forge.config.json` も引き続き読み取ります）。`names.ts` は名前を現在の綴りまたは旧来の綴りに解決します。
- `doctor.ts` はフリートのスイープです。`preflight.ts` はディスパッチの衛生状態をチェックします。`dependencies.ts` と `skills.ts`（mattpocock-skills の契約）は実行に必要なものをチェックします。`map.ts` はコードベースの概要を書き出します。`plugin-detect.ts` はインストールされているプラグインを報告します。
- `setup.ts` は任意のエクストラをインストールし、`setupledger.ts` は各変更を元に戻せるよう記録し、`settingsapply.ts` は推奨される Claude Code の設定を保持します。
- `self.ts`、`self-install.ts`、`self-source.ts`、`self-types.ts`、`self-update.ts`、`self-host-claude.ts`、`self-host-codex.ts` は `emet self` を実装します。インストール、ソースからのインストール、更新、ホストごとのファイルです。`hooks-merge.ts` は emet のフックをホストの設定にマージし、`uninstall.ts` は台帳をもとにインストールを元に戻し、`migrate.ts` は旧来の名前を移行し、`update-notice.ts` と `whats-new.ts` は新しいリリースを利用者に知らせ、`embedded-tree.generated.ts` はコンパイル済みバイナリに埋め込まれたファイルを保持します。
- `assets.ts` はそれらの埋め込みファイルを読み取ります。

**実行状態**

- `claims.ts` はチケットの予約、`slots.ts` はワーカースロットのプール、`resources.ts` はホストの情報、`runs.ts` は生存確認、`runcurrent.ts` はチェックアウトの現在の実行を担います。
- `locks.ts`、`lockreason.ts`、`proctree.ts`、`worktrees.ts`、`cleanup.ts`、`mergedpr.ts`、`landed.ts` は、ワークツリー、ロック、およびランディング済みブランチのクリーンアップを管理します。
- `status.ts` はウェーブとセッションを報告し、`launch.ts` と `chain.ts` は実行と次のウェーブを無人で開始し、`fleet.ts` はリポジトリをまたいで動作し、`phase.ts` は現在のフェーズを記録します。
- `signals.ts` は割り込み時にクリーンアップします。

**トラッカーとスペック**

- `tracker.ts` と `tracker-files.ts`（ローカルの `.scratch/` トラッカー）はチケットを読み書きし、`ticketclose.ts` はチケットを閉じ、`validate.ts` はスペックのカバレッジをチェックし、`approve.ts` は承認を記録し、`surfaces.ts` は編集サーフェスの重複を見つけます。
- `specmerge.ts` はスペックの差分をリビングスペックに取り込みます。`specbranch.ts`、`speclanding.ts`、`specabandon.ts` は `spec/<id>` ブランチを管理します。`landing-unit.ts` は実行がスペック単位とウェーブ単位のどちらでランディングするかを決定し、`afterspec.ts` と `promote.ts` はスペック後のステップを実行します。

**ワーカーのハンドオフ**

- `handoff.ts`、`results.ts`、`materializelog.ts` はワーカーが報告する内容をコーディネーターに伝え、`mailbox.ts` は Codex ワーカー向けの CLI 所有のメールボックスです。

**レビューとランディング**

- `verify.ts`、`reviewpackage.ts`、`review.ts`（指摘の台帳）、`review-run.ts`（Codex レビュアー）、`assess.ts`（リスク分類器）、`gate.ts`、`land.ts`、`ci.ts` は、ウェーブのチェック、レビュー、ランディングを行います。`deploycheck.ts` はデプロイ後のチェックを実行します。

**ジャーナル、アテンション、レポート**

- `journal.ts` はイベントを追記し、`insights.ts` はそれを読み取ります。`attention.ts` はセッションのアテンション状態を記録し、`attention-alert.ts` はアラートを発します。`metrics.ts` と `usage.ts` はコストと結果を報告します。
- `memory.ts` と `engram-client.ts` は Engram で教訓を検索し、保存します。

**安全性**

- `guard.ts`、`guard-destructive.ts`、`guard-codex.ts` はガードのフックです。

**コマンドの配線と共有ヘルパー**

- `commands.ts` はコマンドとそのフラグを記述し、`flags.ts` はすべてのコマンドが受け付けるフラグ、`envelope.ts` は `--json` の出力、`errors.ts` はエラーコード、`exit-codes.ts` と `exit-code.ts` は終了コード、`env.ts` は環境のビュー、`color.ts` と `banner.ts` はターミナル出力、`present.ts`、`narrow.ts`、`optional.ts` は小さな絞り込みヘルパーを担います。
- `test-preload.ts` と `expect-rejection.ts` はテストを支えます。

ホスト固有の値は `agenthost.ts` の `AgentHost` インターフェースの背後にあります。`agenthost-claude.ts` が Claude Code 用、`agenthost-codex.ts` が Codex 用のアダプターで、設定の `agentHost` で選ばれます。Codex 側は `codex-models.ts`（モデル解決）、`codex-home.ts`（実行ごとの `CODEX_HOME` オーバーレイ）、`codex-process.ts` と `codex-session.ts`（プロセス実行と引き継ぎ）、`codex-usage.ts`（`exec --json` からの使用量）、`guard-codex.ts`（フック入力と承認ゲート）、`dispatch.ts` を追加します。[Codex ガイド](../how-to/use-codex.md)を参照してください。

## プロンプトの配置

`commands/run.md`（約 130 行）が Claude Code での `/emet` のルーターで、Codex ではその役割を生成された `codex/skills/**` と `codex/hooks.json` が担います。`emet/reference/` の各ファイルは 1 つのフェーズグループ（`phases-1-5.md`、`phases-6-7-dispatch.md`、`phases-8-review.md`、`phases-8-landing.md`、`phases-8-spec-landing.md`、`phases-9-handoff.md`）で、現在の実行のモードが必要とするときにだけ読み込まれます。いずれかが 20,000 バイトを超えるとテストが失敗するため、1 つのファイルがコンパクション後のコンテキストを占有することはありません。フェーズは、修正やレビューの各ラウンドの前に、該当するセクションを読み直すようコーディネーターに指示します。`emet self install` は、インストールマニフェストと一致したままの古い `phases-8-closeout.md` を削除し、そうでなければ `phases-8-closeout.md.retired` として脇に移します。このファイルは `phases-8-review.md`（レビューとゲート）と `phases-8-landing.md`（ランディングと締めくくり）に分割されています。`phases-8-spec-landing.md` には `landing.unit: spec` のルールがまとまっています。各ウェーブを `spec/<id>` に統合し、トランクを同期し、スペックを 1 回だけランディングします。また `emet self install` は、emet のフック（その 1 つが `PreToolUse` フックの `emet guard`）を `~/.claude/settings.json` にマージします。

## 配布

`emet self install` はスタンドアロンバイナリを配置し、書き換えたプロンプトを `~/.claude/` 以下に書き込み、`--from <checkout>` を付けると `emet/` のソースを `~/.claude/emet` にコピーします。Codex プラグインは `.codex-plugin/plugin.json` で記述され、`codex/skills/**` および `codex/hooks.json` とともに `bun run build:codex` で生成されます。Claude Code のプラグインの経路では、`tools/build-binaries.ts` がビルドしたチェックサム検証済みのスタンドアロンバイナリをダウンロードするシムが提供されます。[ADR-0008](../adr/0008-standalone-binaries-and-plugin-distribution.md) を参照してください。

## 関連項目

- [はじめに](../start/install.md)と[トラッカーとランディング](../how-to/configure-tracker.md)
- [設定リファレンス](../reference/configuration.md)、[CLI リファレンス](../reference/cli.md)、[依存関係](../reference/dependencies.md)
- [AGENTS.md](../../AGENTS.md) と [emet/AGENTS.md](../../emet/AGENTS.md)
- [ドキュメント索引](../README.md)
