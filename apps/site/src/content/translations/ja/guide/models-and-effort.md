---
title: モデルとエフォート
description: emet がロールごとにモデルと推論エフォートをどう選ぶか、またそれを変更する設定キーを説明します。
seoTitle: emet のモデルとエフォート
sourceHash: 482995e2b98c659b
---

`/emet` はロールごとにモデルと推論エフォートを自動で選びます。実行中に手動で切り替えるものはありません。最初のセクションは Claude Code ホストについての説明です。[Codex ホスト](#codex-ホスト)には独自の既定値があります。Claude Code のすべてのキーは[設定リファレンス](../reference/configuration.md#models)にあります。

## Claude Code ホスト

| ロール                                               | モデル                    | エフォート       | 設定元                                          |
| ---------------------------------------------------- | ------------------------- | ---------------- | ----------------------------------------------- |
| プランニング（フェーズ 1〜4）                        | Opus（`opusplan` 経由）   | セッションの設定 | ユーザー（1 回のみ）                            |
| コーディネーター（フェーズ 5 以降）                  | Sonnet（`opusplan` 経由） | セッションの設定 | ユーザー（1 回のみ）                            |
| ワーカー（フェーズ 7）                               | Sonnet                    | `medium`         | `agents/emet-worker.md`、または `models.worker` |
| レビュー、`passive` ティア（ドキュメントのみの差分） | なし                      | —                | `emet assess`                                   |
| レビュー、`medium` ティア（通常のソース変更）        | Opus                      | `medium`         | `models.reviewer.medium`                        |
| レビュー、`high` ティア（リスクの高いパスやシンク）  | Opus                      | 既定は `medium`  | `models.reviewer.high`                          |
| CI ログのトリアージ（フェーズ 8）                    | Haiku                     | —                | `models.triage`                                 |

Claude Code では、2 つのエージェント定義（`install.sh` が `~/.claude/agents/` にインストールします）は、フロントマターで自身の `model`/`effort` を固定しているため、コーディネーターのモデルやエフォートの選択がワーカーやレビュアーに影響することはありません。`emet doctor` はどちらかのファイルがなくなっても報告するだけで、ブロックはしません。`emet preflight` は、`emet-worker` または `emet-reviewer` がない場合にディスパッチをブロックします。フェーズ 6 とフェーズ 8 が `subagent_type` でディスパッチするためです。

## リスクティアによるルーティング

フェーズ 8 は `emet assess --base <trunk> --head <integration branch>` を実行します。これは差分を決定的に分類し、ティア、その理由、推奨されるレビュアーのモデルとエフォートを JSON で出力します。

- `passive`: ドキュメントのみの差分です。レビュアーはディスパッチされません。
- `medium`: レビュアーは `models.reviewer.medium` で動作します。
- `high`: 差分が認証、セキュリティ、決済、Webhook、CI、インストーラー、ロックファイル、マイグレーション、危険なシンク（生の SQL やパイプでシェルに渡す処理など）、または `review.highRiskPaths` に一致するパスに触れています。レビュアーは `models.reviewer.high` で動作し、自動マージはチェックがすべて成功し、未解決のレビュー指摘がない場合にのみ PR をランディングします。

リスクの高いパスに触れるチケットには `Model:` 行（例: `Model: opus` や `Model: opus/high`）を付けることができ、そのワーカーに限って `models.worker` を上書きします。

## Haiku によるトリアージ

Claude Code では、コーディネーターが CI ログを丸ごと読むことはありません。失敗したチェックは `models.triage`（既定は `haiku`）のエージェントに渡され、修正のための `file:line` ポインターを添えて、最大でおよそ 2k トークンを返します。

## 設定

これらは Claude Code の `models` キーです。すべてのキーは任意で、既定値は上の Claude Code の表のとおりです。

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

`review.highRiskPaths` は、大文字小文字を区別せずに `high` ティアを強制する追加のパス部分文字列のリストです。リスクの高いウェーブをより厳しく精査したい場合は、`models.reviewer.high.effort` を（たとえば `high` に）引き上げてください。

## Codex ホスト

`agentHost` を `"codex"` にすると、各ワーカーとレビュアーはそれぞれ独立した `codex exec` プロセスになり、ロールごとに `-m` と `model_reasoning_effort` が設定されます。[`codex`](../reference/configuration.md) セクションの既定値は次のとおりです。

| ロール                      | モデル        | エフォート               | フォールバック                |
| --------------------------- | ------------- | ------------------------ | ----------------------------- |
| セッション (`$emet:run`)    | `gpt-6.1-sol` | `medium` (`high` 計画中) | なし                          |
| ワーカー                    | `gpt-6.1-sol` | `medium`                 | `gpt-6.1-terra`, `gpt-6-luna` |
| `Model:` 行付きのワーカー   | `gpt-6.1-sol` | `xhigh`                  | `gpt-6-astra`                 |
| レビュアー、`medium` ティア | `gpt-6.1-sol` | `high`                   | なし                          |
| レビュアー、`high` ティア   | `gpt-6-astra` | `high`                   | `gpt-6.1-sol`                 |
| トリアージ                  | `gpt-6-luna`  | `medium`                 | `gpt-6.1-terra`               |

`emet dispatch` と `emet review-run` は、各スラッグを `models_cache.json` と照合します。このファイルは、実行のオーバーレイホームから、なければ実際の Codex ホームから（読み取り専用で）読み込まれます。キャッシュに載っていてエフォートに対応するスラッグはそのまま使い、そうでなければモデルのアップグレード先、次にフォールバックをたどり、最後は `-m` を省略し、置き換えはすべて記録します。何も解決できない場合、`emet review-run` はモデル呼び出しの前に、ロールと一覧にあるスラッグを示して失敗します。実行が生成するオーバーレイの `config.toml` にも、解決済みの `model` と `model_reasoning_effort` が入ります。エフォート `ultra` は送信されません。`passive` ティアではレビュアーを起動しません。

実際のウェーブを何度か回したあと、次の場合に調整し直してください。

- ワーカーが何度も修正ラウンドを必要とする: `codex.models.worker.effort` を上げるか、リスクの高いチケットに `Model:` 行を付ける。
- `high` ティアのウェーブのレビューが指摘を見逃す: `codex.models.reviewer.high.effort` を上げる。
- ログに置き換えが表示される: Codex がスラッグの名前を変えたか廃止したので、スラッグを更新する。

[プローブレポート](../research/codex-probe-report.md)の実際の Codex 実行では、エフォート `low` と、解決された最も安価なモデル（`gpt-6-luna`）を使い、レビュアーのモデルもキャッシュ経由で解決されました。

## レビュアーが 1 つである理由

複数の観点に分散させず、コンテキストを新規にした単一のレビュアーを使う理由は次のとおりです。両者を直接比較した公開ベンチマークはありませんが、分散型は観点ごとに差分全体を読み直すため、このリポジトリでは 1 時間以上ハングしたことがあります。また、Anthropic や第三者による Opus クラスのモデルに関する報告では、モデルのアップグレードによる効果は観点を増やした場合と同程度だと示唆されています。Claude Code で重要度の高いウェーブを扱う場合は、その後に手動で `/code-review ultra` を実行してください。`/emet` が自動でこれをディスパッチすることはありません。`/code-review ultra` は Claude Code のコマンドであり、このページには Codex 向けの同等のものは記載していません。

## ユーザーが 1 回だけ設定するもの（Claude Code）

Claude Code ホストでは、`/emet` は実行中にこれらを切り替えることができません。これらは Claude Code の `~/.claude/settings.json` にあります。Codex ホストはこのファイルを読み込まず、そのモデルは上の `codex` セクションから決まります。

- `~/.claude/settings.json` の `model: "opusplan"`: これによってフェーズ 1〜4 は Opus で、フェーズ 5 以降は Sonnet で動作し、`/model` は不要になります。未設定の場合、`emet doctor` は警告します（設定を書き換えることはありません）。
- セッションのエフォートは `xhigh` ではなく `medium` または `high` にします。ワーカーとレビュアーは、ユーザーの設定にかかわらず独自のエフォートを持っています。また、グローバルな既定値を高くしても、ディスパッチの管理、マージ、レポートといった、必要のないコーディネーター自身のターンのコストが増えるだけです。
- 無人で実行できる `permissions.defaultMode`（`auto`、`acceptEdits`、`bypassPermissions`）と、`git push * main|master` および `git push --force *` をブロックする `permissions.deny` ルールです。`emet doctor` はどちらについても警告します。権限プロンプトで止まるウェーブや、トランクブランチを強引に突破できるウェーブでは、無人実行の意味がなくなるためです。

これらは出発点であり、確定した数値ではありません。Opus 5.5 は 2026-09-22 にリリースされたばかりで、コーディングエージェント向けのエフォートとモデルの選択はまだ活発に検討されている分野です。この表を最終版として扱うのではなく、実際のウェーブをいくつか実行してから再調整してください。
