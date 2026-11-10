---
title: はじめに
description: emet を Claude Code プラグインとしてインストールし、emet doctor で動作を確認して、初めて実行します。
seoTitle: emet をはじめよう
sourceHash: 381754ac3b3a0479
---

emet をインストールし、動作を確認して、初めて実行します。

<img src="../brand/mascot/mascot-done.svg" alt="emet のマスコット、完了" width="96" align="right">

## 要件

Claude Code または Codex CLI、`git`、`gh`（認証済み）、`mattpocock-skills` プラグインが必要で、Linux または macOS で動作します。Bun が必要なのはソースからインストールする場合だけです。ネイティブ Windows はサポートされません（WSL を使用してください）。各項目を何が確認するかを含む完全な一覧は、[依存関係リファレンス](../reference/dependencies.md)にあります。

## インストール

インストール方法は 2 つあります。

**プラグイン**（Bun は不要）。このリポジトリをマーケットプレイスとして追加し、`emet` プラグインをインストールします。これにより `/emet:run`、エージェント、ガードフック、そして初回使用時にチェックサム検証済みのスタンドアロンバイナリをダウンロードする `emet` シムが導入されます。

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

Codex では `codex plugin` でプラグインをインストールします。手順は [Codex で emet を実行する](codex.md#インストール)にあります。

**`install.sh`**（Bun の有無を問わず動作します）:

```bash
git clone git@github.com:andryorelabs/emet.git
cd emet
./install.sh
```

`bun` が PATH にある場合は、CLI のソースを `~/.claude/emet` に、`emet` ラッパーを `~/.local/bin/emet` にコピーします。`bun` がない場合は、代わりにスタンドアロンバイナリのシム（`~/.local/bin/emet`、`~/.claude/emet/bin/emet` にリンク）をインストールします。このシムは初回実行時にバイナリをダウンロードしてチェックサムを検証します（`curl` が必要です）。どちらの場合も、コマンドは `~/.claude/commands/emet/` に、エージェントは `~/.claude/agents/` に配置され、プロンプト内のプラグインのプレースホルダーは通常の `~/.claude` パスに書き換えられます。再実行しても安全で、編集したファイルはそのまま残り、新しいバージョンは `<file>.new` として隣に書き出されます。

どちらのインストールでも、3 つのスラッシュコマンド `/emet:run`、`/emet:init`、`/emet:doctor` が使えるようになります。通常のターミナルで `emet` コマンドが使えるのは `install.sh` を実行した後だけです。それ以外の場合は、スラッシュコマンドを使うか、Claude Code または Codex セッション内で `! emet <subcommand>` を使ってください。エージェント名は異なり、プラグインでは `emet:emet-worker`、スタンドアロンでは `emet-worker` です。

各リポジトリでの推奨順序は、まず `/setup-matt-pocock-skills` を実行し、次に `emet init` を実行することです。

動作の確認は、Claude Code 内で `/emet:doctor`（Codex では `$emet:doctor`）を実行するか、`install.sh` の後にターミナルで `emet doctor .` を実行します（`selftest` にはソースからのインストールが必要です）。

`doctor` または `preflight` が問題を報告した場合は、[トラブルシューティング](../troubleshooting.md)を参照してください。ユーザーに代わって何かがインストールされたりログインされたりすることはありません。誰が何を確認するか、また `EMET_SKIP_DEPENDENCY_CHECKS` については[依存関係リファレンス](../reference/dependencies.md)を参照してください。

## 初回の実行

任意の git リポジトリで:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

セッション内では、`/emet:init` が `emet init` と同じことを行います。その後、Claude Code 内で（Codex では `/emet:run` の代わりに `$emet:run` を使います）次のように実行します。

```
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

`emet init` は、自力で推測できないもの（共有テストデータベースのロック、スキーマの所有者など）について、生成した `docs/agents/*.md` ファイルに `TODO(emet):` マーカーを残します。それらを埋めてください。マーカーが残っている間、`emet preflight` はディスパッチを拒否します。

## 次のステップ

- [トラッカーとランディング](trackers-and-landing.md): GitHub、Linear、ローカルのチケットと、ウェーブがどのようにランディングするか。
- [Codex で emet を実行する](codex.md): インストール、単一の承認、Codex のエージェントホストにおける制限。
- [モデルとエフォート](models-and-effort.md): 各ロールが使うモデルとエフォート。
- [フリートチェック](fleet.md): 複数のリポジトリをまとめて監査します。
- [設定リファレンス](../reference/configuration.md)と [CLI リファレンス](../reference/cli.md): すべてのキーとサブコマンド。
