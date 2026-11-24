---
title: インストール
description: emet をインストールし、最新に保ち、削除します。
seoTitle: emet のインストール
sourceHash: e67d7c2c6b22d556
---

emet をインストールし、最新に保ち、削除します。その後、[初めて実行します](first-run.md)。

<img src="../brand/mascot/mascot-done.svg" alt="emet のマスコット、完了" width="96" align="right">

## 要件

Claude Code または Codex CLI、`git`、`gh`（認証済み）、`mattpocock-skills` プラグインが必要で、Linux または macOS で動作します。Bun が必要なのは `emet self install --from` を使う場合だけです。ネイティブ Windows はサポートされません（WSL を使用してください）。各項目を何が確認するかを含む完全な一覧は、[依存関係リファレンス](../reference/dependencies.md)にあります。

## インストール

ターミナルでブートストラップスクリプトを実行します。Bun、クローン、sudo は不要です。

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh
```

このスクリプトは sudo 下での実行を拒否し、お使いのプラットフォーム向けのスタンドアロンバイナリと `SHA256SUMS` を一時ディレクトリにダウンロードし、チェックサム（`gh` がある場合はアテステーションも）を検証してから、`emet self install` に処理を引き渡します。いずれかの検証が失敗した場合、何も書き込まれません。シェルのプロファイルは編集しないため、`~/.local/bin` が `PATH` にない場合は追加してください。

`emet self install` は、バイナリを `~/.local/share/emet/versions/<version>/emet` に配置し、`~/.local/bin/emet` からリンクします。続いて Claude Code 用のファイルを書き込みます。参照プロンプトは `~/.claude/emet/`、コマンドは `~/.claude/commands/emet/`、エージェントは `~/.claude/agents/` に置かれ、プラグインのプレースホルダーは通常の `~/.claude` パスに書き換えられます。バックアップを取ったうえで emet のフックを `~/.claude/settings.json` にマージし、他のフックには手を加えません。Codex がある場合は、emet のスキルを `~/.agents/skills/emet/` に書き込み、emet のフックを `$CODEX_HOME/hooks.json`（既定は `~/.codex`）に追記します。`config.toml` は書き込みません。再実行しても安全で、編集したファイルはそのまま残り、新しいバージョンは `<file>.new` として隣に書き出されます。

書き込みを一切行わずにすべての書き込み内容をプレビューするには、`--dry-run` を渡します。`sh -s --` の後の引数は `emet self install` に渡されます。

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh -s -- --dry-run
```

`sh -s -- 1.2.3` のようにバージョンを固定することもできます。既定は `latest` です。代わりにチェックアウトからインストールするには `emet self install --from <checkout>` を実行します。これには `bun` が必要で、`emet selftest` も引き続き使えます。

### Codex

Codex がある場合、`emet self install` は 1 回限りの手順を表示します。Codex で `/hooks` を開き、イベントページで `t` を押して emet のフックを信頼します（または起動時の "Hooks need review" プロンプトを承認します）。それまでは emet のガードは実行されません。[Codex で emet を実行する](../how-to/use-codex.md#インストール)を参照してください。

### 更新

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

リリースがダウンロードされ、`SHA256SUMS`（`gh` がある場合はアテステーションも）で検証され、ステージングされます。シンボリックリンクとインストール済みファイルの切り替えは、ワーカースロットが 1 つも保持されていない場合にのみ行われます。保持されている場合、更新は保留され、次のセッション開始時に適用されます。失敗しても現在のバージョンには手が加えられず、ジャーナルに記録されます。以前のバージョンはロールバック用に保持され、それより古いものは削除されます。更新が保留中の場合、`emet doctor` が警告します。

### 自動更新

`SessionStart` フックが `emet self update --auto` を 1 日に最大 1 回、バックグラウンドで実行し、オフラインのときは何も表示しません。チェックサムを検証し、新しいバージョンをステージングして、ワーカースロットが 1 つも保持されていない場合にのみシンボリックリンクを切り替えます。保持されている場合、更新は次のセッション開始まで保留されます。以前のバージョンはロールバック用に保持されます。無効にするには、`EMET_AUTO_UPDATE=0` を設定するか `emet self update --auto off` を実行します。`emet self update --auto on` で再び有効になります。自動更新はプラグインのインストールには何もしません。

### アンインストール

```bash
emet uninstall --dry-run     # list what would be removed
emet uninstall
```

バージョンディレクトリ、`~/.local/bin/emet` のシンボリックリンク、インストール状態ファイル、Codex のスキル、両方のフックファイル内のすべての emet フックを削除し、`emet setup` が記録した追加機能も元に戻します。編集したコマンドファイルと他のフックは残ります。[CLI リファレンス](../reference/cli.md#setup-ledger-and-restore)を参照してください。

### 任意: プラグイン

スタンドアロンインストールの代わりに、あるいは任意の `emet-mascot` のために、emet をプラグインとしてインストールすることもできます。emet プラグインがインストールされている間、`emet self install` は拒否して削除方法を説明します。`--force` を付ければそのまま続行でき、両方が共存している場合は `emet doctor` が警告します。プラグインに何が含まれるかはエージェントホストによって異なります。Claude Code では `/emet:run`、エージェント、ガードフック、そして初回使用時にチェックサム検証済みのスタンドアロンバイナリをダウンロードする `emet` シムが導入されます。Codex プラグインには `$emet:run`、`$emet:init`、`$emet:doctor` スキルとフックが含まれますが、エージェントと `emet` シムは含まれません。

:::install-tabs

```bash tab="Claude Code"
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

```bash tab="Codex"
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

:::

どのインストールでも、同じ 3 つのエントリポイントが使えます。Claude Code ではスラッシュコマンド `/emet:run`、`/emet:init`、`/emet:doctor`、Codex では `$emet:run`、`$emet:init`、`$emet:doctor` スキルです。スタンドアロンインストールでは `emet` が `PATH` にも置かれるため、通常のターミナルで `emet init` や `emet doctor .` が使えます。プラグインだけの場合は、スラッシュコマンドを使うか、Claude Code または Codex セッション内で `! emet <subcommand>` を使ってください。Claude Code ではエージェント名は異なり、プラグインでは `emet:emet-worker`、スタンドアロンでは `emet-worker` です。Codex には emet のエージェントはありません。各ワーカーが独立した `codex exec` プロセスだからです。

プラグインのインストールを更新するには、[emet を更新する](../how-to/update-emet.md)を参照してください。

## 次のステップ

[初回の実行](first-run.md): インストールを確認し、リポジトリで emet を実行します。
