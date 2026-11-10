---
title: Codex で emet を実行する
description: Codex CLI 側のインストール、エージェントホストの選択、単一の承認、既知の制限を説明します。
seoTitle: Codex で emet を実行する
sourceHash: fedf7f4694193076
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

4. [はじめに](getting-started.md)の手順で `emet` CLI をインストールし、`emet doctor .` を実行します。`install.sh` は `~/.claude` 配下に Claude Code のコマンドとエージェントもインストールしますが、Codex では無害であり、`emet doctor` は Codex プラグインと `install.sh` の併用について警告しません。Codex ホストでは、`codex.minVersion` より古い `codex`、`codex exec` の `--json` または `--output-schema` フラグの欠落、`mattpocock-skills` の欠落（上記の 2 つのコマンドを案内）を報告します。

手順 3 の 2 つのプラグインコマンドは、実際の `codex`（0.167.0）に対して実行されました。新しい `CODEX_HOME` では終了コード 0 で終わり、`codex plugin list` に `emet@emet-marketplace installed, enabled` と表示されます。ローカルパス形式の `codex plugin marketplace add <repo>` でも同じ結果になります。

## エージェントホストを選ぶ

`emet.config.json` に `agentHost` を設定します。

```json
{ "agentHost": "codex" }
```

既定値は `"claude"` です。`codex` セクションでは、モデル、エフォート、最小バージョン、サンドボックスを設定します。[設定リファレンス](../reference/configuration.md#codex)と[モデルとエフォート](models-and-effort.md)を参照してください。Codex から `$emet:run` で実行を開始します。`emet launch <spec> --wave <n>` は、切り離された `codex exec` でウェーブを開始してそのスレッド ID を記録するため、`codex exec resume <id>` で続行できます。Orca のタブは開きません。

## 単一の承認

emet が求める承認は、計画の後の 1 回だけです。Claude Code ではプロンプトです。Codex ではフックです。

- `.emet/runs/spec<id>/approval.json` が存在するまで、`emet guard` は `.emet/runs/**/draft/**` 配下への書き込みを除くすべての変更（`apply_patch`、`Bash`）を、理由 `not approved: send approve <id>` で拒否します。このゲートは、`.emet/runs/spec<id>/` ディレクトリが `approval.json` なしで存在する時点から適用されます。これは、`$emet:run` がフェーズ 4 で仕様を具体化した後に残す状態です。
- 承認するには、ちょうど `approve <id>` という行のプロンプトを送ります。すると `UserPromptSubmit` フックが、`emet approve` と同じハッシュ方式で承認ファイルを書き込みます。ツールの出力やモデルのテキストに同じ言葉があっても何も起こりません。
- 代替手段は `/plan $emet:run` です。フックの代わりに、Codex 自身のプランモードで計画を承認します。

そのディレクトリが存在すると、ゲートはフェイルクローズになります。承認ファイルが存在しない、または読み取れない場合、変更は拒否されたままです。ガードは、`apply_patch` のすべてのパスも、チケットの `.emet/surface.json` と照合します。

## ウェーブの実行の流れ

- `emet dispatch --role worker` は、クレームとスロットを確認し、`.emet/worktrees/agent-<ticket>` を作成し、`.emet/runs/<run>/codex-home/` の下に実行ごとの `CODEX_HOME` オーバーレイを構築します。続いて、解決済みのモデルとエフォート、`codex.sandbox` モード（既定は `danger-full-access`）、`--json`、`--output-schema` を付けて `codex exec` を起動します。イベントは `.emet/runs/<run>/codex/<ticket>.jsonl` に記録されます。ワーカーは `thread.started` イベントの `threadId` とその JSONL パスで識別され、プロセス ID は補助的なフィールドにすぎません。
- オーバーレイはリンクではなく生成されます。`auth.json` はシンボリックリンクされ（コピーされることはありません）、emet プラグインのキャッシュは存在すれば Codex ホームからリンクされ、オーバーレイは独自の最小限の `config.toml` を書き出します。内容は、ローカルマーケットプレイスと `[plugins."emet@emet-marketplace"] enabled = true`、その実行自身のディレクトリに対してのみの `trusted` な `[projects."<dir>"]` テーブル、解決済みの `model` と `model_reasoning_effort` です。あなたの `[projects]` テーブルやその他の設定はコピーされず、`~/.codex` に書き込まれることもありません。
- オーバーレイの `rules/default.rules` は、`git add`、`git commit`、`git status`、`git worktree`、`git -C <dir> ...`、および `emet` のサブコマンド `dispatch`、`review-run`、`launch`、`claims`、`slots`、`results`、`handoff`、`ask` を許可し、`git push` を禁止します。既定のサンドボックスはもう書き込みを妨げないため、`emet guard` も、argv が `git push` を実行する `Bash` コマンドを、`git -C <dir> push` や `git --git-dir=<dir> push` を含めて、サンドボックスに関係なく拒否します。
- ワーカーがコーディネーターへのサイドチャネルを持つことはありません。ワーカーは実行ごとのメールボックスを通じてエスカレーションします。`emet ask --run <run> --ticket <ticket> --body <text>` は質問を記録してその id を出力し、`emet ask ... --wait <n>` は返信をポーリングします（終了コード 0 は返信を出力し、3 は待機枠が経過したこと、4 は `budgets.askWaitMinutes` を使い切ったことを意味し、その場合ワーカーは BLOCKED の結果を書いて終了します）。稼働中のワーカーに未回答の質問がある間、`emet dispatch --wait` は結果ステータスの代わりに `question <ticket> <id>` を出力し、そのワーカーを停止と分類することはありません。コーディネーターは `emet inbox --run <run>` を読み、`emet reply --run <run> --ticket <ticket> --id <n> --body <text>` で回答し、`emet dispatch --wait` を再開します。記録された結果は、未回答の質問より常に優先されます。[ADR-0023](../adr/0023-cli-owned-mailbox-for-codex-workers.md) を参照してください。
- 結果は `<git-common-dir>/.emet/runs/<run>/results/` から読み取られます。これは `emet results --write` の書き込み先と同じ場所なので、独自の worktree にいるワーカーも見つかります。
- `emet review-run` は、`emet review-package` が作るパッケージに対して、レビュアーを読み取り専用で実行します。`passive` ティアではプロセスを起動しません。
- モデルは、実行ホーム内の `models_cache.json`、なければ実際の Codex ホーム内の `models_cache.json`（読み取り専用）に対して解決されます。設定されたスラッグが一覧にない場合は置き換えられ、その置き換えが記録されます。何も解決できない場合、`emet review-run` はモデル呼び出しの前に、ロールと一覧にあるスラッグを示して失敗します。
- 使用量とストールの検出は、記録された JSONL を読みます。トークン使用量は `turn.completed` イベントから、生存確認はファイルが増え続けているかどうかから得るため、別の pid 名前空間にあるワーカーも生存していると判定されます。`emet preflight` と `emet cleanup` は、回収可能な所有者のいないワークツリー（ワーカーブランチ、チケットがランディング済み、クリーンなツリー、他者のロックなし）について同じ規則を共有しているため、preflight が `emet cleanup` の実行を促すのは、cleanup が実際に動作する場合だけです。

## 実際の Codex 実行で分かったこと

[プローブレポート](../research/codex-probe-report.md)は、これらの変更の後で `codex-cli 0.167.0`（ChatGPT 無料プラン、Linux）に対してすべてのチェックをやり直しました。以前の `failed` の行はすべて `verified` になっています。

- 2 ウェーブのフローが、Codex ワーカーによる実際のコミットをトランクにランディングしました。ウェーブ 1 は `emet dispatch` から、ウェーブ 2 は `emet launch <spec> --wave 2` で開始したセッションから行われ、そのセッションはオーバーレイのプラグインキャッシュから `$emet:run` を読み込みました。`emet review-run` はすべてのフローで実行されました。
- オプトインの e2e（`EMET_CODEX_E2E=1`）が通ります。ワーカーは `danger-full-access` の下でコミットし、`codex execpolicy check` は `git push origin develop` に `forbidden`、`git -C <dir> commit` に `allow` を返します。
- `~/.codex/config.toml` の sha256 は、プローブ、e2e、7 つのフローを通じて変わりませんでした。

## 制限と `unverified` の項目

- エフォート `ultra` は送信されず、設定では拒否されます。
- `danger-full-access` は Codex ワーカーと `emet launch` の既定の `codex.sandbox` です。`workspace-write` サンドボックスでは `.git` が読み取り専用になり、ワーカーがコミットできないためです。サンドボックスを維持するには `codex.sandbox` を `"workspace-write"` に設定してください。その場合、ワーカーはコミットできません。このトレードオフは [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) に記録されています。Claude のパスがこれを使うことはありません。サンドボックスがない状態では、`emet guard` の push 拒否とルールファイルが安全柵になります。
- `ScheduleWakeup`、`TaskStop`、`LSP` に相当するものはありません。代わりに emet は自身の CLI をポーリングします。
- `~/.codex/sessions` 配下のロールアウトファイルには安定した形式がないため、emet は自身が記録した `exec --json` の出力を読みます。
- 実際の CLI に対して検証済みで、Codex の変更が及ぶのは 1 か所だけになるよう小さな関数の裏に置かれたままのものは次のとおりです。認証をリンクした実行ごとの `CODEX_HOME`、`rules/default.rules` にあるルールファイル、`--dangerously-bypass-hook-trust`、フックコマンド内の `CLAUDE_PLUGIN_ROOT` エイリアス、`codex plugin list` の出力形式、モデルが名前でスキルを読み込むこと、ネストされたセッション内での `emet dispatch`、モデルが `approval.json` を偽造しようとすること（拒否されます）、そして `codex plugin marketplace add` の両形式です。[実現可能性の調査](../research/codex-viability.md)を参照してください。
- まだ `unverified` のもの: systemd またはコンテナ内での Codex の無人実行（検証したのは切り離されたプロセスだけです）。
- プローブレポートで挙がった既知のフォローアップ: `emet init` が `agentHost: "codex"` でも `models` に Claude のモデル名を書き込むこと、明示的な `emet dispatch --model` がキャッシュに対して解決されないこと、`emet lock-reason` が `claude` の祖先プロセスを探すこと、そしてワーカーが死んだチケットを同じワークツリーに再ディスパッチできないことです。
- Codex のモデル名と価格は変わります。実際のウェーブを実行した後で、価格表を再確認する必要があります。
