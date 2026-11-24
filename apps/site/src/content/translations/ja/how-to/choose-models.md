---
title: モデルとエフォート
description: emet がロールごとにモデルと推論エフォートをどう選ぶか、またそれを変更する設定キーを説明します。
seoTitle: emet のモデルとエフォート
sourceHash: 0807a288317cba93
---

`/emet` はロールごとにモデルと推論エフォートを自動で選びます。実行中に手動で切り替えるものはありません。最初のセクションは Claude Code ホストについてで、[Codex ホスト](#codex-host)には独自の既定値があります。Claude Code のすべてのキーは[設定リファレンス](../reference/configuration.md#models)にあります。

## 前提条件

- emet がインストール済みであること。[インストール](../start/install.md)を参照してください。
- `emet.config.json` があるリポジトリ（ない場合は `emet init` を実行します）。

## Claude Code ホスト

| ロール                                                  | モデル                    | エフォート       | 設定元                                          |
| ------------------------------------------------------- | ------------------------- | ---------------- | ----------------------------------------------- |
| プランニング（フェーズ 1〜4）                           | Opus（`opusplan` 経由）   | セッションの設定 | ユーザー（1 回だけ）                            |
| コーディネーター、フェーズ 5 以降                       | Sonnet（`opusplan` 経由） | セッションの設定 | ユーザー（1 回だけ）                            |
| ワーカー（フェーズ 7）                                  | Sonnet                    | `medium`         | `agents/emet-worker.md`、または `models.worker` |
| レビュー、`passive` ティア（ドキュメントのみの差分）    | なし                      | —                | `emet assess`                                   |
| レビュー、`medium` ティア（通常のソース変更）           | Opus                      | `medium`         | `models.reviewer.medium`                        |
| レビュー、`high` ティア（リスクのあるパスまたはシンク） | Opus                      | 既定は `medium`  | `models.reviewer.high`                          |
| CI ログのトリアージ（フェーズ 8）                       | Haiku                     | —                | `models.triage`                                 |

Claude Code では、2 つのエージェント定義（`emet self install` が `~/.claude/agents/` にインストール）がフロントマターで独自の `model` と `effort` を固定しているため、コーディネーター自身のモデルやエフォートの選択がワーカーやレビュアーに影響することはありません。どちらかのファイルがなくなっても、`emet doctor` は報告するだけでブロックしません。`emet preflight` は、`emet-worker` または `emet-reviewer` がないとディスパッチをブロックします。フェーズ 6 とフェーズ 8 が `subagent_type` でディスパッチするためです。

## リスクティアによるルーティング

フェーズ 8 は `emet assess --base <trunk> --head <integration branch>` を実行します。差分を決定的に分類し、ティア、その理由、推奨されるレビュアーのモデルとエフォートを JSON で出力します。

- `passive`: ドキュメントのみの差分。レビュアーはディスパッチされません。
- `medium`: レビュアーは `models.reviewer.medium` で動作します。
- `high`: 差分が認証、セキュリティ、決済、Webhook、CI、インストーラー、ロックファイル、マイグレーション、危険なシンク（生の SQL、パイプで渡すシェル実行など）、または `review.highRiskPaths` に一致するパスに触れる場合です。レビュアーは `models.reviewer.high` で動作し、自動マージは、チェックがすべて成功し、未解決のレビュー指摘がない場合にのみ PR をランディングします。

リスクの高いパスに触れるチケットは `Model:` 行（たとえば `Model: opus` や `Model: opus/high`）を持てます。これはそのワーカーに限って `models.worker` を上書きします。

## Haiku によるトリアージ

Claude Code では、コーディネーターが CI ログを丸ごと読むことはありません。失敗したチェックは `models.triage`（既定は `haiku`）のエージェントに渡され、修正のための `file:line` の位置を添えて、最大でおよそ 2k トークンを返します。

## 設定

これらは Claude Code の `models` キーです。すべてのキーは任意で、既定値は上の Claude Code の表を再現します。

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  },
  "review": { "highRiskPaths": [] }
}
```

`review.highRiskPaths` は、`high` ティアを強制する、大文字小文字を区別しないパスの部分文字列の追加リストです。リスクの高いウェーブをより厳しく見るには、`models.reviewer.high.effort` を（たとえば `high` に）上げます。

## Codex ホスト

`agentHost` を `"codex"` に設定すると、各ワーカーとレビュアーは、ロールごとに `-m` と `model_reasoning_effort` を設定した独立した `codex exec` プロセスになります。[`codex`](../reference/configuration.md) セクションの既定値は次のとおりです。

| ロール                      | モデル        | エフォート                          | フォールバック                |
| --------------------------- | ------------- | ----------------------------------- | ----------------------------- |
| セッション（`$emet:run`）   | `gpt-6.1-sol` | `medium`（プランニング中は `high`） | なし                          |
| ワーカー                    | `gpt-6.1-sol` | `medium`                            | `gpt-6.1-terra`, `gpt-6-luna` |
| `Model:` 行があるワーカー   | `gpt-6.1-sol` | `xhigh`                             | `gpt-6-astra`                 |
| レビュアー、`medium` ティア | `gpt-6.1-sol` | `high`                              | なし                          |
| レビュアー、`high` ティア   | `gpt-6-astra` | `high`                              | `gpt-6.1-sol`                 |
| トリアージ                  | `gpt-6-luna`  | `medium`                            | `gpt-6.1-terra`               |

`emet dispatch` と `emet review-run` は、各スラッグを `models_cache.json` に対して解決します。実行のオーバーレイホームから、なければ実際の Codex ホームから（読み取り専用で）読み取ります。そこに一覧されていてエフォートに対応しているスラッグはそのまま使い、そうでなければモデルのアップグレード先、次にフォールバックをたどり、それでも解決しなければ `-m` を省略し、すべての置き換えを記録します。何も解決できない場合、`emet review-run` はモデル呼び出しの前に、ロールと一覧にあるスラッグを示して失敗します。実行が生成するオーバーレイの `config.toml` にも、解決済みの `model` と `model_reasoning_effort` が含まれます。エフォート `ultra` は送信されません。`passive` ティアではレビュアーを起動しません。

実際のウェーブをいくつか実行した後で、次の場合に再調整します。

- ワーカーが修正ラウンドを繰り返し必要とする: `codex.models.worker.effort` を上げるか、リスクのあるチケットに `Model:` 行を付けます。
- `high` ティアのウェーブのレビューが指摘を見逃す: `codex.models.reviewer.high.effort` を上げます。
- ログに置き換えが表示される: Codex がスラッグの名前を変えたか廃止したので、スラッグを更新します。

[プローブレポート](../research/codex-probe-report.md)の実際の Codex 実行では、エフォート `low` と、解決された最も安価なモデル（`gpt-6-luna`）を使い、レビュアーのモデルはキャッシュを通じて解決されました。

## high ティアでレビュアーが 2 つである理由

Claude Code ホストの `high` ウェーブは、`codex` が PATH にあれば Dual review になります。Claude レビュアーと Codex レビュアーが同じパッケージを並列で読み、コーディネーターが両者の指摘をマージします。1 つのモデルは自分自身の死角を共有するため、2 回目の読みは別のモデルが担います。Medium ウェーブはレビュアー 1 つのままなのでコストは変わらず、`review.dual: off` なら常に 1 つで実行します。[レビューとゲート](../concepts/review-and-gates.md)と [ADR-0040](../adr/0040-dual-review-in-the-high-tier.md) を参照してください。さらに重要度の高い Claude Code のウェーブでは、後から手動で `/code-review ultra` を実行することもできますが、`/emet` が自分でこれをディスパッチすることはありません。`/code-review ultra` は Claude Code のコマンドで、このページには Codex の同等物は記載されていません。

## ユーザーが 1 回だけ設定するもの（Claude Code）

Claude Code ホストでは、`/emet` は実行中にこれらを切り替えられません。これらは Claude Code の `~/.claude/settings.json` にあります。Codex ホストはこのファイルを読まず、そのモデルは上の `codex` セクションから決まります。

- `~/.claude/settings.json` の `model: "opusplan"`: これにより、`/model` なしでフェーズ 1〜4 が Opus で、フェーズ 5 以降が Sonnet で動作します。未設定の場合、`emet doctor` は警告します（設定は編集しません）。
- セッションのエフォートは `xhigh` ではなく `medium` または `high`: ワーカーとレビュアーは、ユーザーの設定に関係なく独自のエフォートを持っています。グローバルな既定値を高くすると、ほとんどの場合、それを必要としないコーディネーター自身のターン（ディスパッチの管理、マージ、レポート）のコストが増えるだけです。
- 無人で実行できる `permissions.defaultMode`（`auto`、`acceptEdits`、`bypassPermissions`）と、`git push * main|master` および `git push --force *` をブロックする `permissions.deny` ルール。`emet doctor` はどちらについても警告します。権限プロンプトで止まるウェーブや、トランクブランチを強引に突破できるウェーブは、無人実行の意味を損なうためです。

これらは出発点であり、確定した数値ではありません。Opus 5.5 は 2026-09-22 にリリースされ、コーディングエージェントのエフォートとモデルの選択は今も活発な領域です。この表を最終版として扱わず、実際のウェーブをいくつか実行した後で再調整してください。

## 確認

`emet doctor` を実行します。`~/.claude/settings.json` の `model: "opusplan"`、セッションのエフォート、`permissions.defaultMode` が上の出発点と異なる場合に警告します。
