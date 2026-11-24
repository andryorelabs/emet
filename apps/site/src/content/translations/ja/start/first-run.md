---
title: 初回の実行
description: emet doctor でインストールを確認し、emet を初めて実行します。
seoTitle: emet の初回実行
sourceHash: 7daec76e45f50b8c
---

`emet doctor` でインストールを確認し、emet を初めて実行します。先に emet をインストールしてください。[インストール](install.md)を参照してください。

## 前提条件

- emet がインストールされ、`emet` が `PATH` にあること。
- `gh` が認証済みの git リポジトリ。
- Claude Code または Codex では、`mattpocock-skills` プラグイン。

## 手順

各リポジトリで、まず `setup-matt-pocock-skills` スキルを実行します（Claude Code では `/setup-matt-pocock-skills`、Codex では `mattpocock-skills` プラグインの同じスキルを Codex の `$` 構文で実行します）。その後、任意の git リポジトリで:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight     # confirms the repo is dispatch-ready
```

セッション内では、`/emet:init` が `emet init` と同じことを行います（Codex では `$emet:init`）。`emet init` は、自力で推測できないもの（共有テストデータベースのロックやスキーマの所有者など）について、生成した `docs/agents/*.md` ファイルに `TODO(emet):` マーカーを残します。それらを埋めてください。マーカーが残っている間、`emet preflight` はディスパッチを拒否します。

その後、Claude Code 内で emet を実行します（Codex では `/emet:run` の代わりに `$emet:run` を使います）。

```
/emet:run <describe the feature>              # interview, then wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## 結果を確認する

ターミナルで `emet doctor .` を実行するか、Claude Code 内で `/emet:doctor`（Codex では `$emet:doctor`）を実行します。失敗が先に報告されます。`doctor` または `preflight` が問題を報告した場合は、[トラブルシューティング](../troubleshooting.md)を参照してください。ユーザーに代わって何かがインストールされたりログインされたりすることはありません。誰が何を確認するか、また `EMET_SKIP_DEPENDENCY_CHECKS` については[依存関係リファレンス](../reference/dependencies.md)を参照してください。

## 次のステップ

- [トラッカーとランディング](../how-to/configure-tracker.md): GitHub、Linear、ローカルのチケットと、spec がどのようにランディングするか。
- [Codex で emet を実行する](../how-to/use-codex.md): 単一の承認と、Codex のエージェントホストにおける制限。
- [モデルとエフォート](../how-to/choose-models.md): 各ロールが使うモデルとエフォート。
- [フリートチェック](../how-to/check-a-fleet.md): 複数のリポジトリをまとめて監査します。
- [設定リファレンス](../reference/configuration.md)と [CLI リファレンス](../reference/cli.md): すべてのキーとサブコマンド。
