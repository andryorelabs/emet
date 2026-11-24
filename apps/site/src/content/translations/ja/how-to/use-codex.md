---
title: Codex で emet を実行する
description: Codex CLI 側のインストール、エージェントホストの選択、単一の承認、更新後の手順を説明します。
seoTitle: Codex で emet を実行する
sourceHash: 71c6c7d0686a6725
---

Claude Code の代わりに Codex CLI で emet のパイプラインを実行します。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。実行が動作する製品を**エージェントホスト**と呼びます。[ドキュメント索引](../README.md)に戻ります。

Codex でのウェーブの実行の流れ、ガード、サンドボックスのトレードオフは、[セキュリティ](../concepts/security.md)と[実行、ウェーブ、スペック](../concepts/runs-waves-specs.md)で説明しています。

## 前提条件

- `codex.minVersion`（既定は `0.167.0`）以上のバージョンの `codex` CLI。ログイン済みであること。
- `PATH` 上の `git` と `gh`。[依存関係リファレンス](../reference/dependencies.md)を参照してください。
- `emet.config.json` があるリポジトリ（ない場合は `emet init` を実行します）。

## インストール

:::steps

1. Codex に `mattpocock-skills` プラグインをインストールします。

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

2. [インストール](../start/install.md)のスタンドアロンインストールで emet をインストールします。emet のスキルを `~/.agents/skills/emet/` に書き込み、emet のフックを `$CODEX_HOME/hooks.json`（既定は `~/.codex`）に追記します。`config.toml` は書き込みません。ターミナル用の `emet` と、`~/.claude` 配下の Claude Code のコマンドおよびエージェントもインストールされますが、Codex では無害です。

3. フックを信頼します。Codex は、信頼するまでフックを実行しません。`/hooks` を開いてイベントページで `t` を押すか、起動時の "Hooks need review" プロンプトを承認してください。

:::

### 任意: Codex プラグイン

スタンドアロンインストールの代わりに、emet プラグインをインストールできます。

```bash
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

プラグインには `emet` シムが含まれないため、ターミナルの `emet` にはやはりスタンドアロンインストールが必要です。プラグインがインストールされている間、`--force` を渡さない限り `emet self install` は拒否し、両方が共存している場合は `emet doctor` が警告します。

## エージェントホストを選ぶ

:::steps

1. `emet.config.json` に `agentHost` を設定します（既定値は `"claude"`）。

   ```json
   { "agentHost": "codex" }
   ```

2. 既定値が合わない場合は、`codex` セクションでモデル、エフォート、最小バージョン、サンドボックスを設定します。[設定リファレンス](../reference/configuration.md#codex)と[モデルとエフォート](choose-models.md)を参照してください。
3. Codex から `$emet:run` で実行を開始します。ターミナルからウェーブを開始するには、`emet launch <spec> --wave <n>` を実行します。切り離された `codex exec` を開始してそのスレッド ID を記録するため、`codex exec resume <id>` で続行できます。Orca のタブは開きません。

:::

## 計画を承認する

emet が求める承認は、計画の後の 1 回だけです。Codex ではフックです。

:::steps

1. `$emet:run` が仕様を具体化するまで待ちます。`.emet/runs/spec<id>/approval.json` が存在するまで、`emet guard` はすべての変更を、理由 `not approved: send approve <id>` で拒否します。
2. ちょうど `approve <id>` という行のプロンプトを送ります。`UserPromptSubmit` フックが承認ファイルを書き込みます。ツールの出力やモデルのテキストに同じ言葉があっても何も起こりません。
3. 代替手段として、`/plan $emet:run` で開始し、Codex 自身のプランモードで計画を承認します。

:::

## emet の更新後

スタンドアロンインストールでは、フックは `hooks.json` 内の通常のエントリなので、信頼されたままです。プラグインの場合、Codex は、更新のたびにプラグインのフックを再び信頼するよう求めます。

:::steps

1. `/hooks` を開いてイベントページで `t` を押すか、起動時の "Hooks need review" プロンプトを承認します。それまでは emet guard と単一の承認は動作しません。
2. shim が `release v<version> has no downloadable asset yet` と表示した場合、キャッシュ済みのバージョンを実行しています。数分後にもう一度試してください。

:::

## 確認

:::steps

1. `emet doctor .` を実行します。Codex ホストでは、`codex.minVersion` より古い `codex`、`codex exec` の `--json` または `--output-schema` フラグの欠落、信頼されていないフック、`mattpocock-skills` の欠落を報告します。
2. [トラブルシューティング](../troubleshooting.md#codex-host)の該当する項目に従って報告された問題を修正し、失敗が報告されなくなるまで再実行します。

:::

既知の制限: エフォート `ultra` は送信されず、設定では拒否されます。`codex.sandbox` の既定は `danger-full-access` で、ワーカーがコミットできるようにするためです。サンドボックスを維持するには `"workspace-write"` に設定してください。その場合、ワーカーはコミットできません。[ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) と[プローブレポート](../research/codex-probe-report.md)を参照してください。
