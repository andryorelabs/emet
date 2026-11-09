---
title: Codex で emet を実行する
description: Codex CLI 側のインストール、エージェントホストの選択、単一の承認、既知の制限を説明します。
seoTitle: Codex で emet を実行する
sourceHash: a64f64be24588f52
---

emet は Claude Code だけでなく Codex CLI でも実行できます。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。実行が動作する製品を**エージェントホスト**と呼びます。このページでは、Codex 側のインストール、ホストの選択、単一の承認、既知の制限を説明します。[ドキュメント索引](../README.md)に戻ります。

Codex ホストでもパイプラインは同じです。インタビュー、仕様、チケット、1 回の承認、ワークツリーでの並列ワーカー、ウェーブごとのレビュー、そしてランディングです。変わるのは内部の仕組みです。各ワーカーと各レビュアーは、`emet dispatch` と `emet review-run` が起動するそれぞれ独立した `codex exec` プロセスになり、スラッシュコマンドは `$emet:run`、`$emet:init`、`$emet:doctor` スキルになります。Claude Code のパスは変更されません。

## インストール

1. `codex.minVersion`（既定は `0.167.0`）以上のバージョンの `codex` CLI をインストールし、ログインします。
2. Codex に `mattpocock-skills` プラグインをインストールします。

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

3. emet プラグインをインストールします。リポジトリには `.codex-plugin/plugin.json` と、`codex/` 配下に生成されたスキルとフックが含まれています。

   ```bash
   codex plugin marketplace add andryorelabs/emet
   codex plugin add emet@emet-marketplace
   ```

4. [はじめに](getting-started.md)の手順で `emet` CLI をインストールし、`emet doctor .` を実行します。Codex ホストでは、`codex.minVersion` より古い `codex`、`codex exec` の `--json` または `--output-schema` フラグの欠落、`mattpocock-skills` の欠落（上記の 2 つのコマンドを案内）を報告します。

手順 3 の 2 つのプラグインコマンドは、ローカルマーケットプレイスについてスパイクで検証されたパターンに従っています。このリポジトリでの正確な綴りは、最初のリリースまで `unverified` です。

## エージェントホストを選ぶ

`emet.config.json` に `agentHost` を設定します。

```json
{ "agentHost": "codex" }
```

既定値は `"claude"` です。`codex` セクションでは、モデル、エフォート、最小バージョン、サンドボックスを設定します。[設定リファレンス](../reference/configuration.md#codex)と[モデルとエフォート](models-and-effort.md)を参照してください。Codex から `$emet:run` で実行を開始します。`emet launch <spec> --wave <n>` は、切り離された `codex exec` でウェーブを開始してそのスレッド ID を記録するため、`codex exec resume <id>` で続行できます。Orca のタブは開きません。

## 単一の承認

emet が求める承認は、計画の後の 1 回だけです。Claude Code ではプロンプトです。Codex ではフックです。

- `.emet/runs/spec<id>/approval.json` が存在するまで、`emet guard` は `.emet/runs/**/draft/**` 配下への書き込みを除くすべての変更（`apply_patch`、`Bash`）を、理由 `not approved: send approve <id>` で拒否します。このゲートは、`.emet/runs/spec<id>/` ディレクトリが `approval.json` なしで存在する時点から適用されます。これは、`/emet:run` がフェーズ 4 で仕様を具体化した後に残す状態です。
- 承認するには、ちょうど `approve <id>` という行のプロンプトを送ります。すると `UserPromptSubmit` フックが、`emet approve` と同じハッシュ方式で承認ファイルを書き込みます。ツールの出力やモデルのテキストに同じ言葉があっても何も起こりません。
- 代替手段は `/plan $emet:run` です。フックの代わりに、Codex 自身のプランモードで計画を承認します。

そのディレクトリが存在すると、ゲートはフェイルクローズになります。承認ファイルが存在しない、または読み取れない場合、変更は拒否されたままです。ガードは、`apply_patch` のすべてのパスも、チケットの `.emet/surface.json` と照合します。

## ウェーブの実行の流れ

- `emet dispatch --role worker` は、クレームとスロットを確認し、`.emet/worktrees/agent-<ticket>` を作成し、`.emet/runs/<run>/codex-home/` の下に実行ごとの `CODEX_HOME` オーバーレイを構築します。このオーバーレイは、認証と設定をコピーせずにリンクします。続いて、解決済みのモデルとエフォート、`codex.sandbox` モード（既定は `workspace-write`）、`--json`、`--output-schema` を付けて `codex exec` を起動します。イベントは `.emet/runs/<run>/codex/<ticket>.jsonl` に記録されます。
- オーバーレイのルールは `git add` と `git commit` を許可し、`git push` を禁止します。`~/.codex` に書き込まれることはありません。
- `emet review-run` は、`emet review-package` が作るパッケージに対して、レビュアーを読み取り専用で実行します。`passive` ティアではプロセスを起動しません。
- 使用量とストールの検出は、記録された JSONL を読みます。トークン使用量は `turn.completed` イベントから、生存確認は `codex` プロセスとファイルの更新時刻から得ます。

## 制限と `unverified` の項目

- エフォート `ultra` は送信されず、設定では拒否されます。
- `danger-full-access` は、`codex.sandbox` をそれに設定した場合にのみ使えます。既定で有効になるものはありません。
- `ScheduleWakeup`、`TaskStop`、`LSP` に相当するものはありません。代わりに emet は自身の CLI をポーリングします。
- `~/.codex/sessions` 配下のロールアウトファイルには安定した形式がないため、emet は自身が記録した `exec --json` の出力を読みます。
- 調査では、次の挙動が `unverified` とされています。それぞれが小さな関数の裏にあるため、Codex の変更が及ぶのは 1 か所だけです。認証をリンクした実行ごとの `CODEX_HOME`、オーバーレイ内のルールファイルの場所、`--dangerously-bypass-hook-trust`、フックコマンド内の `CLAUDE_PLUGIN_ROOT` エイリアス、`codex plugin list` の出力形式、モデルが名前でスキルを読み込むこと、ネストされたサンドボックス内での `emet dispatch` です。[実現可能性の調査](../research/codex-viability.md)を参照してください。
- モデルが `approval.json` を偽造しようとした例は確認されていません。ゲートはその試みを拒否するはずですが、これは `unverified` です。
- 起動したセッションが終了した後に、無人のスーパーバイザー（systemd、コンテナ）から Codex を実行することは `unverified` です。
- Codex のモデル名と価格は変わります。実際のウェーブを実行した後で、価格表を再確認する必要があります。
