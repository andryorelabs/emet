---
title: フリートチェック
description: emet doctor で複数のリポジトリを読み取り専用でまとめて監査し、対応が必要なものを確認します。
seoTitle: emet doctor によるフリートチェック
sourceHash: 1d421e4c50bc2c59
---

すでに複数のリポジトリで emet を使っていますか。`emet doctor` なら、任意の数のリポジトリを読み取り専用でまとめて監査できます。

```bash
emet doctor ~/code/*
```

リポジトリごとに次の項目を報告します。有効な `emet.config.json`、4 つの `docs/agents/*.md` ファイルがすべてあること、`TODO(emet):` マーカーが残っていないこと、`commands.selfCheck` のコマンドが実際に解決できるかどうか、そしてそのリポジトリのトラッカー固有の依存関係の検出結果（`gh`、Linear。[依存関係リファレンス](../reference/dependencies.md)を参照）です。mattpocock-skills プラグインと外部 CLI のフラグ（`gh`、`claude --bg`、`claude agents --json`。`--help` で確認）は、リポジトリごとではなく、スイープ全体で 1 回だけ確認します。

`emet doctor` は、バイナリが存在するかどうかだけでなく、フラグそのものを確認します。`gh issue view`/`gh repo view`（`--json`）、`gh issue edit`（`--add-label`、`--remove-label`）、`claude`（`--bg`）、`claude agents`（`--json`）の `--help` を読み取り、新しい、または古い CLI が文書化しなくなったフラグを報告します。フラグ名が変わっていると、ウェーブが途中で失敗するおそれがあるためです。 Codex ホストでは、`codex` が `codex.minVersion` を満たすか、また `codex exec` に `--json` と `--output-schema` があるかも確認します。[Codex で emet を実行する](codex.md)を参照してください。

すべてのプローブは 5 秒に制限されているので、停止した `gh auth status`（ネットワークなし）がウェーブをハングさせることはありません。リポジトリの `preflight.requiredCommands` は、`emet preflight` と `emet doctor` が PATH 上に必須とするバイナリの一覧で、リポジトリ側で管理します。[CLI リファレンス](../reference/cli.md#フリートチェック)と[設定リファレンス](../reference/configuration.md#preflight)を参照してください。
