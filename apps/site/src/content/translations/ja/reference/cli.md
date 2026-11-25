---
title: CLI リファレンス
description: すべての emet サブコマンド、ゲートと記録の表、終了コード、環境変数を説明します。
seoTitle: emet CLI リファレンス
sourceHash: cde063f67e8e54d7
---

すべての `emet` サブコマンド、ゲートと記録、終了コード、環境変数です。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。[README](../../README.md) に戻る。すべてのコマンドは `--help` で使い方を表示します。

## サブコマンド

Claude Code 内では、3 つのスラッシュコマンドが CLI をラップしています。`/emet:run`（パイプライン）、`/emet:init`（`emet init`）、`/emet:doctor`（`emet doctor .`）です。Codex では、これらは `$emet:run`、`$emet:init`、`$emet:doctor` のスキルです。通常のターミナルで `emet` を使うには `emet self install` が必要です。そうでない場合は、セッション内で `! emet <subcommand>` を実行してください。

`emet <command> [...args]`。`emet --version` はバージョンを表示します。

任意の git リポジトリで次を実行します。

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

`emet init` は、自力で推測できないもの（共有テストデータベースのロック、スキーマの所有者など）について、生成した `docs/agents/*.md` ファイルに `TODO(emet):` マーカーを残します。これらを埋めてください。マーカーが残っている間、`emet preflight` はディスパッチを拒否します。

その後、Claude Code 内で次を実行します（Codex では同じ引数で `$emet:run` を使います）。

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## セットアップと監査

### `emet migrate`

旧形式のリポジトリを emet の名前に変更します。

- `--dry-run`

### `emet init`

パッケージマネージャー、トランクブランチ、トラッカーの種類、after-spec モード（[`handoff.afterSpec`](configuration.md#handoff) を参照）を自動検出します。Prisma スキーマ（`prisma/schema.prisma` または `prisma/schema/` フォルダー）や Drizzle のマイグレーションフォルダー（`drizzle.config.*` の隣にある `drizzle/`）を見つけた場合は [`schema.ownedPaths`](configuration.md#schema) を設定し、`emet.config.json` と `docs/agents/*.md` ファイルを書き出します。

- `--tracker linear|github|local`: `--tracker local` はローカルトラッカーを設定します。
- `--after-spec release|promote|none`
- `--force`

### `emet doctor`

任意の数のリポジトリを一度に読み取り専用で監査します。既定はカレントディレクトリです。

- `--all`
- `<path> ...`: 監査するリポジトリ。

[`verify.browser`](configuration.md#verify) を設定しているリポジトリでは、任意の `agent-browser` に関する指摘も報告します。バイナリがない場合は `indeterminate`（インストール方法を示す `optional:` 行）になり、バイナリがあるのに `agent-browser doctor` が失敗する場合は警告として表示されます。どちらもエラーにはならず、終了コードも変わりません。`verify.browser` がないリポジトリには何も表示されません。

#### フリートチェック

`emet doctor` は複数のリポジトリを一度に、読み取り専用で監査します。

```bash
emet doctor ~/code/*
```

リポジトリごとに次を報告します。有効な `emet.config.json`、4 つの `docs/agents/*.md` ファイルがすべて存在すること、残っている `TODO(emet):` マーカーがゼロであること、`commands.selfCheck` のコマンドが実際に解決できるか、そしてそのリポジトリのトラッカー固有の依存関係の指摘（`gh`、Linear。[依存関係](dependencies.md#何が何を確認するか)を参照）です。

mattpocock-skills プラグインと外部 CLI のフラグは、リポジトリごとではなく、スイープ全体で 1 回だけ確認されます。対象は `gh` と、エージェントホストのものです。Claude Code では `claude --bg` と `claude agents --json`、Codex では `codex exec --json` と `--output-schema` で、`--help` で確認します。

### `emet setup`

任意のインストールを readline のプロンプトで提示します。

- `--yes`
- `--with <ids>`
- `--list`
- `--json`
- `--dry-run`: `--with`、`--yes`、`--json` と組み合わせられます。選ばれた各項目の予定ステップ、または `already-present` を表示し、何も変更しません。コマンドを実行せず、ファイルも台帳エントリも書かず、終了コードは 0 です。
- `--restore <id>`: 復元できる 2 つの項目のうち 1 つを元に戻します。[セットアップ台帳と復元](#セットアップ台帳と復元)を参照してください。

TTY がない場合、または `--yes` か `--with` を指定した場合は、何も尋ねず、指定された項目だけをインストールします。TTY がなく `--with` もない場合は、何もインストールせず `--list` のカタログを表示します。各ステップは `installed`、`already-present`、`skipped`、`failed` のいずれかを報告します。1 つ失敗しても他は止まらず、失敗が 1 つでもあれば終了コードは 1 です。`/emet:setup` はプラグインの入口で、同じ選択肢を `AskUserQuestion` で尋ねます。`installed` になった項目はすべて Setup ledger（セットアップ台帳）に記録されます。

項目は次のとおりです。

- `mattpocock-skills`（既定でオン）、`engram`、`mascot`、`orca-pet`、`gh-auth`。
- `agent-browser`（既定でオフ）: `bun add -g agent-browser@latest` を実行してから `agent-browser install` を実行し、`~/.agent-browser/config.json` が存在しない場合に限り、`contentBoundaries: true` と `maxOutput: 50000` を書き込みます。その後 `agent-browser doctor` を実行し、失敗した場合は警告を表示します。バージョンを固定せず、`--with-deps` も渡さないため、システムライブラリが不足している場合は、実行すべきコマンドを表示します。
- `context7`（既定でオフ）: `bun add -g ctx7@latest` を実行し、続いて `ctx7 setup --cli --claude --yes` を、`codex` が PATH にある場合に限り `ctx7 setup --cli --codex --yes` も実行します。インストールするのは `ctx7` CLI とその `find-docs` スキルで、MCP サーバーではありません。バージョンは固定せず、`ctx7 setup` のステップが失敗した場合は、手動で実行するコマンドを表示します。`CTX7_TELEMETRY_DISABLED=1` を設定しない限り、`ctx7` は匿名の利用イベントを送信します。環境に `CONTEXT7_API_KEY` がある場合は、`ctx7 login` で保存されたアカウントより優先されます。
- `firecrawl-local`（既定でオフ）: `cargo` が必要で、バイナリがない場合は `cargo install firecrawl-local` を実行します。その後、`FIRECRAWL_CLOUD=search` と `--public-only` を付けてユーザースコープの Claude Code MCP サーバーを登録し、設定の異なる以前の登録は置き換えます。スクレイプ、クロール、マップはマシン上で実行され、Web 検索だけが Firecrawl Cloud に送られ、プライベートアドレスはブロックされます。
  - `agent-browser` がダウンロードした最新の Chrome を `FIRECRAWL_CHROME_PATH` として渡します。
  - AppArmor が特権のないユーザー名前空間を制限している Linux では、AppArmor プロファイルと、それを読み込むための `sudo` コマンドを表示します。Firecrawl Local は、サンドボックスなしで Chrome を実行することがないためです。
  - 使用可能な Chrome がない場合、JavaScript でレンダリングされるページは空で返ります。
- `claude-settings`: 推奨される Claude Code の設定です。選択した場合にのみ、`settings.json` のタイムスタンプ付きバックアップを取ったうえで適用されます。

#### セットアップ台帳と復元

`emet setup` は、`installed` で終わったすべての項目を、状態ディレクトリ内の `setup-ledger.json` に `{ id, at, undo }` として記録します。`already-present` の項目は何も記録せず、同じ id が再度 `installed` になっても、最初のエントリの変更前の状態が保持されます。台帳の書き込みはアトミックで、不正な形式の台帳は、空として読まれることなく、そのパスを示すエラーになります。

undo レコードには、元に戻すために必要なものが入っています。

- `claude-settings`: 以前の `model`（またはなし）、実際に追加した deny ルール、バックアップのパス。
- `firecrawl-local`: 以前のユーザースコープの MCP エントリ（`claude mcp remove` を実行する前に `~/.claude.json` から読み取ったもの）と、emet が `cargo install` を実行したかどうか。
- プラグイン: プラグインの id。
- `orca-pet`: 書き込まれたファイル。
- `agent-browser`: bun のグローバルパッケージ（および emet が作成した場合は設定ファイル）。
- `context7`: bun のグローバルパッケージ。
- `engram`: brew の formula とプラグイン。

`emet setup --restore <id>` が受け付けるのは `claude-settings` と `firecrawl-local` だけで、それ以外の id は終了コード 2 で終了します。

- `claude-settings` は、以前の `model` を復元し（なかった場合はキーを削除し）、emet が追加した deny ルールだけを削除します。その前にタイムスタンプ付きバックアップを取ります。現在の `model` がセットアップで設定されたものでない場合は、それを保持して警告を表示します。
- `firecrawl-local` は `claude mcp remove firecrawl-local -s user` を実行し、エントリが記録されていた場合は続けて `claude mcp add-json firecrawl-local '<previous json>' -s user` を実行します。

復元に成功すると台帳のエントリが削除されます。エントリのない id は `nothing to restore for <id>` を表示して終了コード 1 で終了します。

`emet uninstall` は、台帳のすべてのエントリを同じ方法で元に戻します。`claude-settings` と `firecrawl-local` は `--restore` と同様に、プラグインは `claude plugin uninstall <id>` で、`orca-pet` のファイルと emet が作成した agent-browser の設定は削除によって戻します。brew、bun、cargo のグローバルパッケージについては、削除コマンド（たとえば `bun remove -g ctx7`）を表示するだけで、実行はせず、`gh auth` にも触れません。元に戻したエントリは台帳から削除され、1 つの追加項目が失敗しても他は止まりません。

### `emet self install`

スタンドアロンのインストールです: `emet self install [latest|X.Y.Z]`。

- `--dry-run`: すべての書き込みを一覧表示し、何も書き込みません。
- `--force`: emet プラグインがインストールされていても続行します。指定しない場合、プラグインがインストールされている間はコマンドが拒否されます。
- `--from <checkout>`: Bun のソースインストールを再現します。CLI のソースが `~/.claude/emet` にコピーされ、`~/.local/bin/emet` はそれに対して `bun` を実行するラッパーになるため、`emet selftest` が動作します。`bun` がない場合は失敗します。コントリビューターは `emet self install --from .` を使います。

バイナリを `~/.local/share/emet/versions/<v>/emet` に配置してシンボリックリンク `~/.local/bin/emet` を張り、リファレンスプロンプトと `.install-manifest.json` を `~/.claude/emet/` に、コマンドを `~/.claude/commands/emet/` に、エージェントを `~/.claude/agents/` に書き込みます。

emet のフックを `~/.claude/settings.json` にマージします（バックアップを取り、他のフックには触れません）。Codex がある場合は、スキルを `~/.agents/skills` に書き込み、フックを `$CODEX_HOME/hooks.json`（既定は `~/.codex`）に追記します。`config.toml` は書き込まれないため、`/hooks` でフックを一度承認してください。

2 回目の実行では何も変わりません。編集されたファイルは保持され、新しいバージョンは `<file>.new` として隣に置かれます。[インストール](../start/install.md)の 1 行のインストールスクリプトは、リリースバイナリをダウンロードし、`SHA256SUMS` を検証して、このコマンドを実行します。

### `emet self update`

`emet self update [latest|X.Y.Z]` は、リリースをダウンロードし、`SHA256SUMS`（`gh` がある場合は attestation も）を検証して、ステージングします。シンボリックリンクとインストール済みファイルの入れ替えは、ワーカースロットが保持されていないときにのみ行われ、そうでない場合は次のセッション開始まで保留されます。失敗しても現在のバージョンには触れず、ジャーナルに記録されます。以前のバージョンはロールバック用に保持され、それより古いものは削除されます。プラグインでのインストールでは何もしません。

- `--auto [off|on]`: `SessionStart` フックが実行するものです。1 日に最大 1 回、デタッチされて実行され、オフラインのときは何も出力しません。`off` または `on` で切り替えます。`EMET_AUTO_UPDATE=0` でも無効になります。

### `emet uninstall`

`emet self install` によるインストールと、`emet setup` が追加したものを削除します。最初にプラン全体を作成してから実行します。

- `--dry-run`: プランを表示し、何も変更しません。
- `--yes`: 確認を省略します。TTY があり `--yes` がない場合は一度だけ尋ね、TTY も `--yes` もない場合は、プランを表示し、何も変更せず、終了コード 0 で終了します。
- `--purge`: 状態ディレクトリ（`EMET_STATE_DIR`、なければ `XDG_STATE_HOME/emet`）と `~/.emet` も削除します。指定しない場合、どちらも残ります。
- `--json`: 結果を JSON で表示します。

削除されるもの:

- インストールマニフェスト内の、ハッシュが記録されたものと一致するすべてのファイルと、その `.new` ファイル。編集されたファイルは残り、一覧表示されます。
- シム `~/.local/bin/emet`。ただし、インストールのラッパー、または `~/.claude/emet` か `~/.local/share/emet/versions` へのシンボリックリンクである場合に限ります。続いてマニフェストと、空になったディレクトリ。
- `~/.claude/settings.json` と `$CODEX_HOME/hooks.json`（既定は `~/.codex`）から、あらゆるイベント内のすべての emet フックコマンド（`emet guard`、`emet setup --notice`、`emet whats-new --hook`、`emet self update --auto`）。他のフックはすべて保持し、空になったグループとイベントは削除します。
- `~/.agents/skills/emet/` 配下の、この emet と一致する Codex スキル（編集されたものは残り、一覧表示されます）、バージョンディレクトリ `~/.local/share/emet/versions`、インストール状態 `~/.local/share/emet/install.json`。
- Setup ledger の追加項目（[セットアップ台帳と復元](#セットアップ台帳と復元)を参照）。

インストールのバックアップ（`.pre-emet-guard-backup.`）が残っているものとまったく同じ内容を保持している場合は、そのバイト列が復元されます。何も残っていない場合はファイルが削除されます。それ以外の場合は、先にタイムスタンプ付きバックアップが書き込まれます。

マニフェストもインストール状態もない場合（プラグインでのインストール）は、ファイルの処理を省略し、`claude plugin uninstall emet@emet-marketplace` を表示します。`codex` が PATH にある場合は、Codex プラグインの削除方法も表示します。いずれかのステップが失敗した場合、または読み取る必要のあるファイル（マニフェスト、設定、台帳）が読めない場合は、そのパスを示して終了コード 1 で終了します。

### `emet whats-new`

emet の更新後に、一度だけお知らせを表示します。

- `--hook`: `SessionStart` フックが実行する形式。

### `emet fleet`

`--root`（既定は `~/code`）の 1 階層下にある、`emet.config.json` を持つ git リポジトリ全体を対象に動作します。[フリートガイド](../how-to/check-a-fleet.md)を参照してください。

- `emet fleet list [--root <dir>] [--json]`: リポジトリを `tracker.kind`、`handoff.autoChain`、`models.worker` とともに一覧表示します。
- `emet fleet set <key> <value> [--root <dir>] [--dry-run]`: 一覧にあるすべてのリポジトリで、設定キーを 1 つ変更します。最初に設定ローダーで検証します（無効な値は何も変更せず、終了コード 1 で終了します）。
- `emet fleet launch --feature <text> [--root <dir>] [--repos <a,b>] [--dry-run]`: `emet chain` の準備チェックを行ったうえで、各リポジトリで `/emet:run --draft <text>` のセッションを開きます。`--dry-run` はセッションを開始せずに、予定された起動を表示します。
- `emet fleet status [--json]`: グローバルジャーナルを読み、過去 24 時間以内の各セッションの最新の状態をリポジトリごとに表示します（`ended` は除く）。

`fleet status` は、リポジトリごとに `<repo>: <b> blocked, <w> working, <i> idle` の 1 行を、ブロックされたリポジトリを先頭にして表示します。`--json` は `{repos: [{repo, sessions: [{sessionId, state, blocked, since, runId}]}], blocked: <count>}` を表示します。セッションがない場合も終了コードは 0 です。

### `emet preflight`

リポジトリがディスパッチ可能であることを確認します。

- `--run <id>`
- `--post-dispatch`

### `emet skill-path`

`emet skill-path <name>` は、mattpocock-skills のスキルの `SKILL.md` の絶対パスを表示します。スキルが見つからない場合は終了コード 1 で終了します。

### `emet selftest`

CLI 自身のユニットテストを実行します。ソースからのインストールのみで、コンパイル済みバイナリは終了コード 1 で終了し、`emet doctor` を実行するよう案内します。

## 実行、ワーカー、スロット

### `emet claims`

実行のためにチケットを予約します: `emet claims --reserve <ticket> --run <id> --anchor <pid>`。

- `--release <ticket>`: 予約を解放します。
- `--list`: 予約を一覧表示します。
- `--prune [--dry-run]`: 古い予約を削除します。

### `emet slots`

`~/.local/state/emet/slots` にあるホスト全体のプールから、ワーカースロットを取得します: `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`。

- `--release --run <id>`: その実行のスロットを解放します。
- `--release-index <index>`: スロットを 1 つ解放します。
- `--list`: スロットを一覧表示します。

### `emet cleanup`

`emet cleanup [--run <id> | --all] [--dry-run] [--force]`。引数なしの場合は、作業がランディング済みの、クローズされた、または終了した実行を回収します。マージ後に `emet cleanup --run <runId>` を実行すると、そのウェーブのブランチ、チケットの予約、ワーカースロットが解放されます。

- `--run <id>`: この実行をクリーンアップします。
- `--all`: リポジトリ全体のブランチを一掃します。
- `--dry-run`
- `--force`

どのモードでも、PR がブランチの先端コミットでマージされたローカルブランチを、それを保持するクリーンでロックされていないエージェントのワークツリーとともに削除します。

### `emet lock-reason`

`emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]` は、ワーカーがブートストラップ時に書き込む `git worktree lock` の理由を表示します。

### `emet launch`

`emet launch <spec-id> --wave <n>`: Claude Code では、ウェーブを `claude --bg` セッションとして開始し、`handoff.launcher` に従って Orca タブを開きます（Codex については [Codex ホスト](#codex-ホスト)を参照）。起動の全体（重複セッションのチェック、`claude --bg`、タブ）を行い、`{ name, id, attach, orcaTab: { opened, reason } }` を表示します。別のセッションで手動でウェーブを起動したいときは、素の `claude --bg` ではなく、これを使ってください。

### `emet chain`

`emet chain --ticket <id> --spec <id> --wave <n> [gate flags]` は、渡されたゲートフラグで `emet gate` を実行し、判定が `chain` の場合にのみ次のウェーブを開始します。

起動する前に、準備状況（ホストのメモリの余裕、リポジトリと `/tmp` の空きディスクと inode、`orca` CLI）を確認し、起動後は子セッションが一覧にあることを確認します。それ以外の判定、準備に関するブロッキングの問題（`low-memory`、`low-disk`、`low-inodes`、`orca-unavailable`）、または同じスペックとウェーブの既存セッションがある場合は、理由を表示して何も起動せず、終了コード 1 で終了します。

### `emet status`

`emet status [--spec <id>] [--brief]` は、ウェーブごとの Working / Checking / Ready / Needs-decision を JSON とサマリー行で表示します。`emet status --help` に JSON の説明があります。

- `--spec <id>`
- `--brief`: 代わりに最大 3 行を表示します。全体の状態、人を待っているもの（あれば）、次のアクションです。

JSON には `sessions: [{sessionId, state, blocked, since, runId}]` も含まれます。これは、このリポジトリの emet が所有する各セッションの、過去 24 時間以内の最新のアテンション状態で、`ended` のセッションは除かれます。`blocked` は `state` が `needs-decision` のとき true で、`since` はその状態になった時刻です。ブロックされたセッションが 1 つでもあれば、アクティブなウェーブがない場合でも、全体の `state` は `needs-decision` になります。サマリー行にはブロックされたセッションの数が示され、`--brief` は人を待っているものの行にそれらを一覧表示します。

### `emet run`

`emet run current [--json]` は、`.emet/phase.json` から読み取った、リポジトリのアクティブな実行（実行 id、スペック、ウェーブ、フェーズ、最終更新）を表示します。アクティブな実行がない場合は `no active run` を表示し、終了コード 0 で終了します。

### `emet memory`

[Engram](https://github.com/Gentleman-Programming/engram) でレッスンを検索し、保存します。

- `emet memory search --json <query> [--limit <n>]`: 以前の実行からのレッスンを検索します。`match_mode: "any"` で検索し（`--limit` の既定は 5、最大 20）、トピックキーが `emet/<repo>/lessons/` で始まるノートだけを残して、`{available: true, results: [{id, topicKey, title, content}]}` を表示します。`content` は 2000 文字に切り詰められます。`<repo>` は、`git remote get-url <repo.remote>` の最後のパスセグメントから `.git` を除いたもので、なければメインワークツリーのベース名です。
- `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <landed|chained|hold|stop|blocked>`: 標準入力から 1 〜 5 個のレッスンの箇条書き（それぞれ最大 300 文字の `- ` 行）を読み取り、トピックキー `emet/<repo>/lessons/<key>` のノートに `## <runId> — <outcome> (<date>)` セクションとして追記します。ノートがなければ新規作成します。20000 文字を超えたノートは、最も古いセクションから削除されます。`{available: true, saved: true, topicKey}` を表示します。

どちらのサブコマンドも、リポジトリのルートで `engram mcp --tools=agent` を起動して Engram と通信します。Engram プラグインは不要です。Engram に `project` を渡すことはありません。

終了コード: `2` は使い方の誤りです（サブコマンドがない、クエリがない、箇条書きがない、箇条書きが 5 個を超える、300 文字を超える箇条書きがある、不明な outcome、不正なキー）。Engram に関する問題（PATH にない、ハンドシェイクの失敗、ツールエラー、タイムアウト、不正な JSON）は、すべて `0` で終了します。

- ハンドシェイクに成功する前の出力は `{available: false, reason}` です。
- 成功した後は、`search` では `{available: true, results: [], reason}`、`save` では `{available: true, saved: false, reason}` です。
- `memory.enabled: "off"` は `{available: false, reason: "memory.enabled is off"}` を表示し、何も起動しません。[`memory`](configuration.md#memory) を参照してください。

### `emet insights`

[イベントジャーナル](../concepts/attention-and-journal.md)を読み、実行を起点（人か自動か）別に、ゲートの判定を判定と理由別に、実行ごとの人間の介入、起動の結果、クローズされたチケットを報告します。読めない行はスキップされ、数えられます。ジャーナルが空、またはない場合は、ゼロのレポートを表示して終了コード 0 で終了します。

- `--since <iso|7d|30d>`
- `--repo <path>`
- `--all`
- `--json`
- `--mark-baseline`: ベースラインを追記します。`--all` を指定しない限り、以降のレポートはそれより後のイベントだけを対象にします。

### `emet usage`

セッションの使用量を報告します。

- `--session <id>` または `--file <path>`
- `--stalled [--minutes N]`: 停止したワーカーを一覧表示します。
- `--project-dir <path>`

### `emet handoff`

`emet handoff --check <path> [--expect-skills a,b] | --render <path>` は、ワーカーの `.emet/handoff-<ticket>.md` ノートを検証または描画します。

- `--check <path>`: ノートを検証します。チェックに通り、`missing` リストが空でない場合は `missing skills: …` を表示します。
- `--expect-skills a,b`（check のみ）: `loaded` リストにも `missing` リストにもない、指定したスキルごとにチェックを失敗させます。
- `--render <path>`: ノートを描画します。

ノートには `skills:` セクションを含めることができ、`skills: none` または `skills: loaded: a, b; missing: c` と書きます。必須なのは `state` が `done` のときだけで、それ以外の値はチェックに失敗します。

### `emet metrics`

`emet metrics [--run <id>]` は、セッションのトランスクリプトを読んで、チケット別、ウェーブ別、実行別のトークン、API 換算コスト、経過時間を報告します。また、チケットごとに見積もったコンテキスト予算と、各ワーカーが実際に使った量を比較します。そのサマリーは、実行の最終レポートの末尾に入ります。

### `emet ask`

ワーカーのメールボックスです。コーディネーターに質問するか、返信を待ちます。

- `--run <id>`
- `--ticket <ticket>`
- `--body <text>`: 質問を送信します。
- `--wait <n>`: 返信を待ちます。
- `--slice <seconds>`

`--wait` の場合、終了コード `0` は返信あり、`3` はスライスのタイムアウト、`4` は期限切れです。

### `emet inbox`

`emet inbox --run <id>` は、未回答のワーカーの質問を JSON で一覧表示します。

### `emet reply`

`emet reply --run <id> --ticket <ticket> --id <n> --body <text>` は、ワーカーの質問に回答します。

## 計画、レビュー、ランディング

### `emet promote`

`emet promote --spec <id> [--dry-run] [--no-promote] [--hold]` は、[`handoff.afterSpec`](configuration.md#handoff) に従った after-spec ステップです。

- `--dry-run`: プルリクエストを開きません。
- `--no-promote`: ステップをスキップします。
- `--hold`: マーカー `<run dir>/runs/<id>/no-promote` を書き込み、`{"held":true}` を表示します。それが存在する間は、`emet promote --spec <id>` は `skipped` のメモを付けて終了コード 0 で終了し、プルリクエストを開かないため、`--no-promote` はスペックのセッションをまたいで維持されます。

`promote` モードでは、`chore: 🔖 promote develop` というタイトルの `develop` から `main` へのプルリクエストを開き、`emet ci --pr <n> --wait` で待ち、状態が `pass` の場合にのみマージコミットでマージします。その後、`main` に `develop` にない内容がある場合に限り（`develop...main` の比較が変更ファイルを 1 つ以上挙げる場合で、マージコミットだけは数えません）、`main` から `develop` への同期プルリクエストを開き、同じ方法でチェックを待ち、状態が `pass` の場合にのみ [`pr.mergeMethod`](configuration.md#pr) でマージします。`main` にマージコミットしかない場合、同期プルリクエストは開かれず、`syncReason` がその理由を示します。状態が `fail`、`timeout`、`env-fault` の同期プルリクエスト、またはマージが拒否された同期プルリクエストは開いたままになり、promote の結果が変わることはありません。

プルリクエスト番号、`merged`、`syncPrNumber`、`syncMerged`、`syncReason`、`rule`、`reason` を含む `promote` イベントを 1 件、ジャーナルに追記します。`afterSpec` はルールのリストにできます。その場合、`develop` をプロモートしたときに含まれるパスからモードが選ばれ（[`handoff.afterSpec`](configuration.md#handoff) を参照）、`git fetch` または `git diff` が失敗すると、プルリクエストを開く前にコマンドが終了コード 1 で終了します。

表示される結果には次が含まれます。

- `rule`: 一致したルールのインデックス。文字列形式の場合や一致がない場合は `null`。
- `reason`。
- `syncPrNumber`: 同期プルリクエストが開かれなかった場合は `null`。
- `syncMerged` と `syncReason`: 同期プルリクエストが開いたままになった理由を述べる文。そうでなければ `null`。
- `deployCheck: { run, reason }`: コーディネーターが `emet deploy-check` を実行すべきかどうかを示します。

`release` モードでは何もマージせず、リリースのプルリクエストは人に任せます。`afterSpec` が `none` の場合、`--no-promote` の場合、スペックが保留中の場合、またはスペックの最後のウェーブが開いたまま、またはフラグが立ったままの場合は、`skipped` のメモを付けて終了コード 0 で終了します。クリーンな最後のウェーブの後も実行されるため、結果には `deployCheck` の判定が含まれます（トランクが `main` の場合、デプロイチェックはモードに関係なく実行されます）。CI が `pass` でない場合は何もマージせず、終了コード 1 で終了します。

### `emet deploy-check`

`deploy.check.command` を、終了コード 0 になるまで、最大 `retries` 回または `timeoutSeconds` まで、試行の間に `intervalSeconds` 待ちながら実行し、`attempts` とともに `state: ok | failed | timeout` を表示します。

- `--json`

終了コードは `0` が ok、`1` が failed、`3` が timeout です。`deploy.check` が設定されていない場合は、`skipped: "no deploy check configured"` を付けて終了コード 0 で終了します。コーディネーターは、`emet promote` の結果で `deployCheck.run` が true の場合にのみ実行します。[`deploy`](configuration.md#deploy) を参照してください。

### `emet surfaces`

`emet surfaces --check <file.json | ->` は、ウェーブ内のチケット間で、許可されたサーフェスの glob が重複している場合に拒否します。

### `emet assess`

`emet assess --base <ref> --head <ref>` は、差分を `passive`、`medium`、`high` に分類し、ティア、理由、推奨されるレビュアーのモデルとエフォートを JSON で表示します。[モデルとエフォート](../../README.md#models--effort)と [`review`](configuration.md#review) を参照してください。

- `--quick`: JSON に `"quickRejected": true|false` も含まれ、ティアが `high` の場合はコマンドが終了コード 1（**Quick run** の **Stop**: 自動マージなし、PR は開いたまま）、それ以外は 0 で終了します。`--quick` がない場合、出力と終了コードは変わりません。

JSON には 2 つの判定も含まれます。

- `browserVerify: { run, reason }`: `run` が `true` になるのは、ティアにレビュアーがいて、[`verify.browser`](configuration.md#verify) が設定されていて、`agent-browser` バイナリが PATH 上にあり、`paths` が設定されている場合は変更パスが一致するときだけです。そうでなければ、`reason` が最初に満たされなかった条件を示します。
- `dualReview: { run, reason }`: `run` が `true` になるのは、ティアが `high` で、`agentHost` が `claude` で、[`review.dual`](configuration.md#review) が `off` でなく、`codex` バイナリが PATH 上にあるときだけです。そうでなければ、`reason` が最初に満たされなかった条件を示します。

### `emet land`

`emet land --spec <s> --branch <integration> --tickets <id,...>` は、統合ブランチをローカルのトランクにマージします（`landing.mode` が `merge`）。CI の代わりに `commands.selfCheck` が使われ、何もプッシュされません。

### `emet spec-branch`

`emet spec-branch ensure|integrate|status|sync|land|abandon --spec <id>` は、`landing.unit: spec` のスペックブランチ `spec/<id>` を管理します（[`landing`](configuration.md#landing) を参照）。いずれも JSON を表示します。

- `ensure`: トランクからブランチを作成し（冪等）、`.emet/specs/<id>/branch.json` を書き込みます。別のスペックのブランチがチェックアウトされている場合は拒否します。
- `integrate --wave <n> --branch <integration> --tickets a,b`: ウェーブブランチを `--no-ff` とトレーラー `Emet-Wave` および `Emet-Tickets` 付きで `spec/<id>` にマージし、ウェーブを記録し、`spec.integrate` を追記します。`landing.pushSpecBranch` が true の場合は、PR を開かずにブランチをプッシュします。
- `status`: `branch`、`tip`、統合済みのウェーブとチケット、`behindTrunk` を表示し、ウェーブが欠けている場合はトレーラーから `branch.json` を再構築します。
- `sync`: トランクをブランチにマージします。リベースはせず、競合した場合は中止してパスを一覧表示し、ゼロ以外で終了します。
- `land [--partial]`: 同期したうえで、`pr` モードではブランチをプッシュし、チケットごとに `Closes` の行を付けた PR を 1 つ開き、そのチェックを待って、`landing.specMergeMethod`（既定はマージコミットで、`pr.mergeMethod` は無視されます）でマージします。`merge` モードでは、`--no-ff` でローカルのトランクにマージし、プッシュは行いません。`spec.land` を追記します。
- `abandon --force`: `abandoned/spec-<id>` にタグを付け、ブランチを削除し、`spec.abandon` を追記し、ローカルトラッカーの統合済みチケットを `ready-for-agent` に戻します。`--force` がない場合は拒否します。

`emet tracker frontier` は `branch.json` に載っているチケットをクローズ済みのブロッカーとして数え、`emet status` には `specBranch`（`branch`、`tip`、`integratedWaves`）が加わります。

### `emet spec-merge`

`emet spec-merge --spec <id>` は、スペックの `ADDED`/`MODIFIED`/`REMOVED` の要件デルタを `docs/specs/<area>.md`（`specs.dir`）にマージします。

- `--deltas-dir`: デルタを置くディレクトリを表示します。

`specs.enabled` がオンの場合、コーディネーターはデルタを書き込み、最後のウェーブの統合ブランチで、そのレビューの前にスペックごとに 1 回実行し、結果をコミットします。何かを書き込む前に、すべてのエリアをチェックします。競合がある場合、またはシナリオを失う要件がある場合は、終了コード 1 で終了し、すべてのファイルに手を付けません。`specs.enabled` がオフの場合は何もマージせず、終了コード 0 で終了します。

### `emet map`

`emet map [--refresh]` は、既存のコードベースの概要（スタック、構造、規約、テスト、ホットスポット）を `docs/agents/codebase.md`（`map.path`）に書き込み、作成元のコミット SHA を刻印します。同じコミットからは常に同じファイルが生成されます。

- `--refresh`
- `--stale`: HEAD が刻印より先に進んだ場合は終了コード 1 で終了し、その場合は `emet preflight` が警告します。
- `--for <globs>`: チケットの編集サーフェスに一致するセクションだけを表示します。その出力が、ワーカーへの指示に含まれるマップの唯一の部分です。

### `emet guard`

Claude Code の `PreToolUse` フックです。標準入力のフックの JSON を読みます（Codex 形式は [Codex ホスト](#codex-ホスト)の項を参照）。`emet self install` が `~/.claude/settings.json` に組み込みます。無人実行で失敗の引き金になることが知られているいくつかの操作をブロックします（`emet/src/guard.ts` を参照）。

## ローカルトラッカー

`tracker.kind: "local"` の場合、スペックとチケットは、メインワークツリーの `.scratch/`（バージョン管理されません）配下の markdown ファイルです。`.scratch/<slug>/spec.md` と `.scratch/<slug>/issues/<NN>-<slug>.md` で、それぞれに `Status:` と `Blocked by:` の行があり、コメントは `## Comments` の下に置かれます。`emet init --tracker local` で設定します。[ADR-0011](../adr/0011-local-tracker-scratch-convention.md) を参照してください。

`landing.mode` は `"pr"`（既定）または `"merge"` で、トラッカーとは独立しています。`merge` モードでは、ウェーブは `emet land` によってトランクへのローカルマージ 1 回でランディングされ、CI の代わりに `commands.selfCheck` が使われ、プッシュは行われません。`landing.unit: "spec"`（既定）では、スペック全体が `emet spec-branch land` で 1 回でランディングされます。`gh` が必要なのは、トラッカーが `github` の場合、またはランディングが `pr` の場合だけです。[ADR-0010](../adr/0010-local-merge-landing.md) と [`landing`](configuration.md#landing) を参照してください。

### `emet tracker`

`emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close` は、`.scratch/` を対象とするローカルトラッカーで、標準出力に JSON を出力します。コーディネーターはこれを通じてスペックとチケットを読み書きします。

#### `emet tracker close`

`tracker.kind: "github"` の場合、`emet tracker close <ticket>... [--pr <n>]` は、各チケット（`CLA-<n>`、`#<n>`、または数字のみ）を `gh issue close --reason completed` でクローズし、その状態を確認して、`closed` または `already-closed` を報告します。

- `--pr <n>`: コメント "Landed in #<n>" を追加します。

`closed` または `already-closed` になったチケットの親ごとに、続けて `gh issue view <spec> --json state,subIssuesSummary` を読み取ります。スペックが開いていて、`subIssuesSummary.completed` がゼロでない `total` と等しい場合は、`gh issue close --reason completed` とコメント "All <total> tickets landed." でスペックをクローズし、確認します。

出力には `specs` が加わり、親ごとに `{ spec, outcome, detail? }` が 1 つ入ります。outcome は `closed`、`open`、`already-closed`、`failed` のいずれかです。親のないチケットは何も追加せず、スペックの読み取りやクローズの失敗が、チケットの結果を変えることはありません。チケットまたはスペックが 1 つでも失敗した場合は、残りを処理した後に終了コード `1` で終了します。Linear のチケットは、コーディネーターが Linear MCP を通じて Done であることを確認します。

## PR のランディングとウェーブの連鎖

`landing.unit: "wave"` では 1 ウェーブが 1 つの PR になり、`"spec"` では 1 つの PR が統合されたすべてのウェーブをカバーします。本文にはチケットごとに `Closes #N` の行が 1 つ入り（トラッカーのクローズ用キーワード）、コーディネーターは PR を開くときにチケットを in-review に移します。その後、PR は `pr.autoMerge` に従ってマージされます。ただし、ウェーブにフラグが立っている場合、`autoMerge` が `false` の場合、または CI の修正が尽きた場合は、開いたままになります（その場合、PR には人間の判断を求めるラベルが付きます）。以降のウェーブは、ウェーブ 1 を実行したセッションではなく、それぞれ独自のセッションで実行されます。次に何が起きるかは `pr` と `handoff` のセクションで制御します。[`pr`](configuration.md#pr) と [`handoff`](configuration.md#handoff) を参照してください。

### `emet ci`

`emet ci --pr <n> --wait [--rerun-flakes] [--timeout-minutes <m>]` は、PR のチェックが終了するか、タイムアウト（既定は 30）に達するまでポーリングします。`state: pass | fail | env-fault | timeout`、失敗したチェック、`flakeReruns` を表示し、マージは行いません。

- `--rerun-flakes`: 失敗した各チェックを `gh run rerun --failed` で 1 回再実行します。再実行で通ったチェックは Flake です。
- `--timeout-minutes <m>`

チェックのない PR は `noChecks: true` の `pass` です。終了コードは `0` が pass、`1` が fail または env-fault、`3` が timeout です。`env-fault` は、`STARTUP_FAILURE` で終わった、または長時間キューに留まったチェックを意味します。コードの失敗ではなく、CI が一度も実行されなかったということです。

## Codex ホスト

これらのコマンドは、Codex のエージェントホスト（`agentHost` が `"codex"`）向けです。[Codex ガイド](../how-to/use-codex.md)を参照してください。

### `emet dispatch`

`emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: 予約とスロットを確認したうえで、`.emet/worktrees/agent-<ticket>` を作成し、実行ごとの `CODEX_HOME` オーバーレイを構築して、ワーカーをデタッチされた `codex exec` として開始します。

- `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]`: 終了するまでブロックし、記録された結果のステータスを表示します。

### `emet review-run`

`emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive> [--browser-verify true|false]` は、`emet review-package` が作成したパッケージに対して、レビュアーを読み取り専用の `codex exec` として実行し、`emet review --findings` 用の指摘 JSON を表示します。`passive` ティアではプロセスを起動しません。

- `--browser-verify true|false`: 既定は `false` です。`true` の場合、プロンプトは Browser 軸で終わり、`--session review-<run>` が `--run` から埋められるため、Codex のレビュアーも Claude のレビュアーと同じように UI を検証します（`emet assess` が `browserVerify.run: true` を表示したときに渡します。[`verify`](configuration.md#verify) を参照）。このフラグがない場合、プロンプトは変わらず、`true` か `false` 以外の値は、使い方の行を表示して終了コード 2 で終了します。
- `--coverage-out <file>`: Codex のレビュアーの Coverage の判定も、JSON 配列として `<file>` に書き込みます（標準出力には引き続き指摘だけが出ます）。レビュアーが 1 つだけ動く Codex ホストで使います。

指摘には、`emet review` の項で説明する任意の `s` と `userOption` フィールドを含めることができます。

### Codex での `emet launch`

`emet launch <spec-id> --wave <n>` は、`$emet:run --dispatch <spec>` を実行する、デタッチされた `codex exec` を開始し、そのスレッド id を記録します。Orca タブは開かれず、`codex exec resume <id>` でセッションを続行できます。

### Codex での `emet guard`

`EMET_AGENT_HOST=codex` の場合、`emet guard` は Codex のフック入力を読み、`apply_patch` のパスを `.emet/surface.json` と照合し、プロンプトの行 `approve <id>` が来るまで承認ゲートを閉じたままにします。

## ゲートと記録

フェーズは、チケットがいつ完了したか、マージ可能か、再試行する価値があるかを、自分では判断しません。ディスク上の記録を読んで判定を表示する CLI コマンドを呼び出します。実行の記録は `.emet/runs/<run-id>/` に、レビュー台帳は `.emet/review/` にあり、ワーカーのワークツリーではなく、メインのチェックアウトにあります。以下のコマンドは、パイプラインの順に並べています。

### `emet validate`

承認の前に: `emet validate --spec <id> | --file <plan.json>` がプランの検証を実行します。

- すべての `S#` が少なくとも 1 つのチケットでカバーされ、受け入れシナリオがあること。
- すべてのチケットが少なくとも 1 つの `S#` をカバーしていること。
- 編集サーフェスがウェーブ内で互いに素であること。
- 依存関係の循環がないこと。
- [`validate.coupledSurfaces`](configuration.md#validate) がある場合、ペアの `source` に触れるチケットが、その `dependents` に触れるチケットより前のウェーブにあると、`coupled-surface-split` エラー（終了コード 1）。
- 空のチケットリストは、`S#` の項目の有無にかかわらず `no-tickets` エラー（終了コード 1、"plan has no tickets; write one folded ticket"）です。すべての `S#` をカバーする、`folded: true` のチケットが 1 つのプランは通過します。

`emet preflight` は、承認済みのプランに対してこれを再度実行します。

### `emet approve`

承認: `emet approve --run <id> --spec <file>` は、スペックとチケットリストのハッシュを含む `approval.json` を書き込みます。その後どちらかが変更された場合、ディスパッチは拒否されます（`--check`）。

- `--quick`: `"mode": "quick"` も書き込み、その実行のランディング単位が `wave` になります。指定しない場合、このフィールドはなく、古い記録でも `--check` は通ります。

### `emet materialize-log`

チケットの作成: `emet materialize-log --run <id> --record/--lookup` は、作成された各チケットの ID を、作成された直後に保存するため、中断された実行が重複を作ることはありません。

### `emet results`

ワーカーの完了: `emet results --run <id> --write/--read <ticket>`。ワーカーはローカルの結果ファイル（`DONE`、`DONE_WITH_CONCERNS`、`BLOCKED`、`NEEDS_CONTEXT` のいずれかと、`Risk:` の行）を書きます。トラッカーに書き込むのはコーディネーターだけです。

### `emet verify`

各ワーカーの後に: `emet verify <ticket> --run <id>` は、ディスパッチ時のベースラインより先にコミットがあること、変更されたすべてのパスがチケットの編集サーフェスの内側にあること、ハンドオフノートが `handoff --check` に通ること、`commands.workerScopedSuite` が通ることを確認します。レビューとマージは、通過の記録がないチケットを拒否します。

### `emet review-package`

レビューの入力: `emet review-package <base> <head> --out <file>` は、レビュアー向けに差分をまとめます。レビュアーはそれをファイルパスとして受け取ります。範囲が空、または base の子孫でない場合は、終了コード 3 で終了します。

### `emet review`

レビュー: `emet review --ticket <t> --findings <file>` は、指摘の台帳を保持し、トリアージの順序（`intent_gap` → `bad_plan` → `patch` → `defer`）とラウンドの上限を強制します。

- `--base <ref>`: 最初のラウンドで `<ref>` を sha に解決して保存します。以降のラウンドはそれを再利用し、異なる sha を渡すと、保存されているものを示して終了コード 2 で終了します。差分 `<base>..HEAD` が追加も変更もしていない行への指摘は `preexisting: true` で保存され、`emet gate` はそれをブロッキングとして数えません。
- `--findings <file>`: 指摘には、任意の `s: "S<n>"`（関係する要件）、`userOption: "S<n>"`、`agreement: "both"` または `"single"` を指定できます。`userOption` の指摘は `(user option)` の要件と矛盾するもので、既存の指摘であっても常にブロッキングであり、`gate.onHold: fix-and-continue` の下では `next: fix-findings` で保留になります。文字列でない `userOption` は終了コード 2 で終了します。
- `--coverage <file or -> [--expect S1,S3]`: Coverage の判定 `{s, verdict, test:{file,name}}`（`verdict` は `met`、`partial`、`unmet`）の JSON 配列を、それまでのものを置き換える形で台帳の `coverage` として保存し、レビューラウンドは消費しません。`test` がない、ファイルが存在しない、またはファイルに `test.name` が含まれていない `met` ごと、および判定のない `--expect` の S# ごとに、`VG-S<n>` の指摘（major、`patch`）を開きます。`VG-` の指摘がクローズされるのは、後の `--coverage` でそれが生成されなくなったとき、または recheck の判定で解決されたときだけで、`--findings` のラウンドに現れなかったことでクローズされることはありません。`{coverage, open}` を表示し、指摘が 1 つでも開いている間は終了コード 1 で終了します。テストは実行しません。
- `--merge <a.json> <b.json>`（`--ticket` なし）: `--findings -` 用に、マージした指摘の配列を 1 つ表示します。2 つの指摘は、`s` を共有するか、行が最大 3 行以内の同じ `file` を共有するとペアになり、ペアは最初のファイルの `id`、より高い重大度、`agreement: "both"` を保持します。ペアにならない指摘は `agreement: "single"` になり、2 つ目のファイルの id が衝突する場合は `X-` を前置します。`userOption` の指摘が捨てられることはありません。
- `--recheck --verdicts <file>`: 修正ラウンドを終了します。開始時に開いていた指摘だけが評価され、指摘が `resolved` になるのは判定を通じてのみで、recheck は `budgets.fixRounds` に数えられます（使い切った場合は、上限を示して終了コード 1）。
- `--escalate`: 次のモデルティアに移ります。
- `--rule` と `--rulings`: レポートと PR 本文のための「Rulings I made」を記録し、一覧表示します。

### `emet gate`

マージまたはチェーン: `emet gate <ticket> --tier … --ci … --integration …` は、`merge`、`hold`、`chain`、`stop`、`defer` のいずれかを、理由とともに JSON で表示します。verify の記録、未解決の指摘、リスクティア、CI、統合スイート、予算を読みます。`hold` には `next` が付きます: `fix-findings`、`rerun-failed-specs`、`rerun-ci`、`report-infrastructure` のいずれかです。[`gate`](configuration.md#gate) を参照してください。

- `--no-record`: 判定をジャーナルに残しません。

ウェーブのブランチが一緒にマージされた後、`commands.fullSuite` が統合ブランチで 1 回実行されます。赤になると、PR と `autoChain` がブロックされます。ゲートはその結果を `--integration` として受け取ります。ゲートが読む予算については、[`budgets`](configuration.md#budgets) を参照してください。

## 終了コード

終了コードは、すべてのサブコマンドを通じて同じ意味を持ちます。

| コード | 意味                                                                                     |
| ------ | ---------------------------------------------------------------------------------------- |
| `0`    | クリーン。                                                                               |
| `1`    | 対処すべき指摘。                                                                         |
| `2`    | 設定または使い方のエラー。ツールは実際には実行されていません。不明なコマンドも含みます。 |
| `3`    | 内部エラー。                                                                             |

不明なフラグも終了コード `2` で終了し、そのフラグ名を示します。Ctrl-C は `130` で終了します。

## グローバルフラグ

すべてのコマンドがこれらを受け付けます。各コマンド固有のフラグは `emet <command> --help` で一覧できます。

| フラグ       | 効果                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `--json`     | `{ok, data, error: {code, message, fix}}` のエンベロープを標準出力に 1 つ表示します。`--help` と `--version` でも同様です。 |
| `--no-color` | ANSI カラーを無効にします。カラーは `NO_COLOR`、`FORCE_COLOR`、`TERM=dumb`、出力が TTY かどうかにも従います。               |
| `--verbose`  | 想定外のエラーのスタックを表示します。指定しない場合、最上位の catch は 1 行のエラーを表示します。                          |
| `--help`     | コマンドの使い方を表示します。                                                                                              |

`emet --version` はバージョンを表示し、`emet --version --json` は `{"ok": true, "data": {"version": ...}, "error": null}` を表示します。`--json` の下で失敗したコマンドは、通常の終了コードで終了し、`ok: false` と、`findings`、`usage`、`internal`、`slice-timeout`、`expired`、`bad-range`、`exit-<n>` のいずれかのエラー `code` を表示します。コマンドが標準出力に出したものは、エンベロープの `data` になります。

TTY では、より新しいリリースが分かっている場合、`emet` は stderr に 1 行のお知らせを表示します。確認は 1 日に最大 1 回で、答えをキャッシュし、ネットワークを待つことはなく、`--json` の下や TTY がない場合は何も表示しません。

## 環境変数

ユーザー向けの変数です。変数が設定されている場合は、対応する設定値を上書きします。

| 変数                          | 効果                                                                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` は、その 1 回の実行に限って、依存関係のブロックを警告に格下げします。自分のシェルで設定し、コーディネーターが無人で実行するものには設定しないでください。 |
| `EMET_MAX_LIVE_WORKERS`       | [`concurrency.maxLiveWorkers`](configuration.md#concurrency) を上書きします。正の整数または `auto` を受け付けます。                                                                                      |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | [`concurrency.runIdleThresholdMs`](configuration.md#concurrency) をミリ秒で上書きします。                                                                                                                |
| `EMET_STATE_DIR`              | ホスト全体の状態ディレクトリで、ワーカースロットのプールを保持します。解決順序は `$EMET_STATE_DIR`、次に `$XDG_STATE_HOME/emet`、次に `~/.local/state/emet` です。                                       |
| `EMET_MEM_RESERVE_GIB`        | 空けておく必要があるメモリの余裕（GiB）。利用可能なメモリがこれを下回ると、取得は拒否されます。既定は 8 です。`auto` のワーカー上限にも使われます。                                                      |
| `EMET_MEM_PER_WORKER_GIB`     | `maxLiveWorkers` が `auto` のときに、ワーカーごとに想定するメモリ（GiB）。既定は 2 です。ワークツリーごとにブラウザ駆動の E2E スイートを動かすような、重いワーカー構成では引き上げてください。           |
| `EMET_CPU_OVERSUBSCRIBE`      | `auto` のワーカー上限に使う CPU の倍率。既定は 1 です。                                                                                                                                                  |
| `EMET_AUTO_UPDATE`            | `EMET_AUTO_UPDATE=0` は `emet self update --auto` を無効にします。ネットワーク呼び出しなしで終了コード 0 で終了します。`emet self update --auto off` と同じです。                                        |
| `EMET_AGENT_HOST`             | `codex` にすると、`emet guard` が Codex のフック入力を読みます。Codex のフックが設定するもので、Claude Code では未設定のままにしてください。                                                             |

`auto` の上限は `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)` です。従来の `FORGE_*` の名前も引き続き読み込まれ、両方が設定されている場合は `EMET_*` が優先されます。
