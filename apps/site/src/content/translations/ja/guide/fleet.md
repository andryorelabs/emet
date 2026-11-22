---
title: フリートチェック
description: emet doctor で複数のリポジトリを読み取り専用でまとめて監査し、対応が必要なものを確認します。
seoTitle: emet doctor によるフリートチェック
sourceHash: 7b3c5a56abfffcc1
---

すでに複数のリポジトリで emet を使っていますか。`emet doctor` なら、任意の数のリポジトリを読み取り専用でまとめて監査できます。

```bash
emet doctor ~/code/*
```

リポジトリごとに次の項目を報告します。有効な `emet.config.json`、4 つの `docs/agents/*.md` ファイルがすべてあること、`TODO(emet):` マーカーが残っていないこと、`commands.selfCheck` のコマンドが実際に解決できるかどうか、そしてそのリポジトリのトラッカー固有の依存関係の検出結果（`gh`、Linear。[依存関係リファレンス](../reference/dependencies.md)を参照）です。mattpocock-skills プラグインと外部 CLI のフラグ（`gh`、およびエージェントホスト自身の CLI フラグ。Claude Code では `claude --bg` と `claude agents --json`、Codex では `codex exec --json` と `--output-schema`。いずれも `--help` で確認）は、リポジトリごとではなく、スイープ全体で 1 回だけ確認します。

`emet doctor` は、バイナリが存在するかどうかだけでなく、フラグそのものを確認します。`gh issue view`/`gh repo view`（`--json`）、`gh issue edit`（`--add-label`、`--remove-label`）、そして Claude Code では `claude`（`--bg`）と `claude agents`（`--json`）の `--help` を読み取り、新しい、または古い CLI が文書化しなくなったフラグを報告します。フラグ名が変わっていると、ウェーブが途中で失敗するおそれがあるためです。`claude` と `claude agents` のチェックは Claude Code ホストのものです。Codex ホストでは、ホストのフラグチェックがこれらに追加されるのではなく置き換わります。`emet doctor` は `codex exec` に `--json` と `--output-schema` があるかを確認します（`emet/src/doctor.ts` の `hostCliFlagRequirements`）。`codex` のバージョンを `codex.minVersion` と比較することはありません。[Codex で emet を実行する](codex.md)を参照してください。

## 複数リポジトリの変更と起動

`emet fleet` は、ルート（デフォルトは `~/code`）の 1 階層下にある `emet.config.json` を持つリポジトリを対象に動作します。

```bash
emet fleet list --root ~/code
emet fleet set handoff.autoChain false --dry-run
emet fleet launch --feature "add dark mode" --repos app,site
```

- `list` は各リポジトリのパス、`tracker.kind`、`handoff.autoChain`、`models.worker` を表示します。`--json` を付けるとデータとして出力します。
- `set <key> <value>` は、一覧にあるすべてのリポジトリで設定キーを 1 つ変更します。各値は書き込む前に設定ローダーで検証され、無効な値の場合はどのリポジトリも変更されず、終了コード 1 で終了します。`--dry-run` は何も書き込まず、各リポジトリの変更前と変更後の値を表示します。
- `launch --feature <text>` は、`emet chain` と同じ準備チェックを行ったうえで、各リポジトリで `/emet:run --draft <text>` セッションを開きます。`--repos` でカンマ区切りのリストに絞り込めます。

すべてのプローブは 5 秒に制限されているので、停止した `gh auth status`（ネットワークなし）がウェーブをハングさせることはありません。リポジトリの `preflight.requiredCommands` は、`emet preflight` と `emet doctor` が PATH 上に必須とするバイナリの一覧で、リポジトリ側で管理します。[CLI リファレンス](../reference/cli.md#フリートチェック)と[設定リファレンス](../reference/configuration.md#preflight)を参照してください。

## ブロックされたセッションを確認する

セッションが決定待ちになったら、`emet fleet status` でどのリポジトリにブロックされたセッションがあるかを、ブロックされたものを先頭にして確認できます。

```bash
emet fleet status
emet fleet status --json
```

グローバルジャーナルを読むため、ルートの指定やリポジトリごとのチェックは不要です。リポジトリごとに `<repo>: <b> blocked, <w> working, <i> idle` を表示し、直近 24 時間以内のセッション（`ended` を除く）を対象にします。リポジトリ内では `emet status` が `sessions[]` にセッションを一覧します。遷移時の通知を無効にするには、[`attention.alert`](../reference/configuration.md#attention) を `false` に設定します。
