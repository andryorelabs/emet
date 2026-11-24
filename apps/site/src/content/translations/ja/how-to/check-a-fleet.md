---
title: フリートチェック
description: emet doctor で複数のリポジトリを読み取り専用でまとめて監査し、設定の変更、機能の起動、ブロックされたセッションの確認を行います。
seoTitle: emet doctor によるフリートチェック
sourceHash: 511c25889b2a8244
---

複数のリポジトリにまたがって emet を監査、変更、起動します。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。

## 前提条件

- emet がインストール済みであること。[インストール](../start/install.md)を参照してください。
- 各リポジトリに `emet.config.json` があり、1 つのルート（既定は `~/code`）の 1 階層下にあること。
- `PATH` 上の `gh` が認証済みであること。[依存関係リファレンス](../reference/dependencies.md)を参照してください。

## リポジトリを監査する

:::steps

1. 任意の数のリポジトリに対して、読み取り専用の監査を実行します。

   ```bash
   emet doctor ~/code/*
   ```

2. リポジトリごとのレポートを読みます。有効な `emet.config.json`、4 つの `docs/agents/*.md` ファイルがすべてあること、`TODO(emet):` マーカーが残っていないこと、解決できる `commands.selfCheck` のコマンド、そしてそのリポジトリのトラッカー固有の依存関係の検出結果です。
3. スイープ全体の検出結果を読みます。これは 1 回だけ表示されます。mattpocock-skills プラグインと外部 CLI のフラグを `--help` で確認したものです（`gh`、Claude Code では `claude --bg` と `claude agents --json`、Codex では `codex exec --json` と `--output-schema`）。名前が変わったフラグは、ウェーブが失敗する前にここで報告されます。

:::

## すべてのリポジトリで設定を変更する

:::steps

1. 各リポジトリの現在の値を一覧します。

   ```bash
   emet fleet list --root ~/code
   ```

   各リポジトリのパス、`tracker.kind`、`handoff.autoChain`、`models.worker` を表示します。`--json` を付けるとデータとして出力します。

2. 変更をプレビューします。

   ```bash
   emet fleet set handoff.autoChain false --dry-run
   ```

   `--dry-run` は何も書き込まず、各リポジトリの変更前と変更後の値を表示します。

3. `--dry-run` なしで同じコマンドを実行して適用します。値は先に設定ローダーで検証され、無効な値の場合はどのリポジトリも変更されず、終了コード 1 で終了します。

:::

## 複数のリポジトリで機能を起動する

```bash
emet fleet launch --feature "add dark mode" --repos app,site
```

`emet chain` と同じ準備チェックを行ったうえで、各リポジトリで `/emet:run --draft <text>` セッションを開きます。`--repos` でカンマ区切りのリストに絞り込めます。

## ブロックされたセッションを確認する

```bash
emet fleet status
```

リポジトリごとに、決定待ちでブロックされている、作業中、アイドルの emet セッションの数を、ブロックされたリポジトリを先頭にして表示します。グローバルジャーナルの直近 24 時間を読み、終了したセッションは除外します。`--json` を付けるとセッションを出力します。1 つのリポジトリ内では、`emet status` が `sessions` の下に一覧します。[注意とジャーナル](../concepts/attention-and-journal.md)と[設定リファレンス](../reference/configuration.md#attention)を参照してください。

## 確認

:::steps

1. `emet doctor ~/code/*` をもう一度実行し、失敗を報告するリポジトリがないことを確認します。
2. `emet fleet list --root ~/code` を実行し、変更したキーがすべてのリポジトリで新しい値になっていることを確認します。
3. `emet fleet status` を実行し、想定外にブロックされているリポジトリがないことを確認します。

:::

すべてのプローブは 5 秒に制限されているので、停止した `gh auth status` がウェーブをハングさせることはありません。`preflight.requiredCommands` は、`emet preflight` と `emet doctor` が必須とするバイナリの、リポジトリ側で管理する一覧です。[CLI リファレンス](../reference/cli.md#fleet-check)と[設定リファレンス](../reference/configuration.md#preflight)を参照してください。
