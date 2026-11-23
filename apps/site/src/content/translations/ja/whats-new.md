---
title: 新機能
description: emet のリリースノート。各バージョンでの変更点をまとめています。
seoTitle: "emet の新機能: リリースノート"
sourceHash: 52353f60ae0e5795
---

## 0.21.0

2026-11-23

### 追加

- `emet setup --dry-run`（`--with`、`--yes`、`--json` と併用可）は、選択した各項目の計画ステップ、または `already-present` を表示し、何も変更しません。コマンドの実行も、ファイルや台帳エントリの書き込みもありません。
- `emet setup` は、結果が `installed` になったすべての項目を、状態ディレクトリの `setup-ledger.json` であるセットアップ台帳に、元に戻すために必要な取り消し記録とともに記録します。台帳の書き込みはアトミックで、形式が不正な台帳はそのパスを示すエラーになります。
- `emet setup --restore <id>` は `claude-settings`（以前の `model` と、emet が追加した deny ルール。タイムスタンプ付きバックアップを取った後）または `firecrawl-local`（以前のユーザースコープの MCP エントリ）を元に戻します。それ以外の id は終了コード 2 で終了し、台帳にエントリがない id は終了コード 1 で終了します。
- `emet uninstall [--dry-run] [--yes] [--purge] [--json]` は `install.sh` によるインストールを削除します。対象は、ハッシュがまだ一致するマニフェストのファイル、shim、`~/.claude/settings.json` 内のすべての `emet guard` フック（タイムスタンプ付きバックアップの後）、およびセットアップ台帳に記録された追加項目です。編集されたファイルは残され、一覧表示されます。brew、bun、cargo のグローバルインストールについては、削除コマンドを表示するだけで、実行はしません。
- `./install.sh --uninstall [flags]` は `emet uninstall` を実行します。
- `docs/reference/cli.md` と `README.md` に、セットアップ台帳、`--dry-run`、`--restore`、`emet uninstall` を 9 つのロケールすべてで記載しました。

## 0.20.0

2026-11-22

### 追加

- `emet guard` は、emet が所有するセッションの状態が `working`、`idle`、`needs-decision`、`ended` の間で変わったときに、`session.attention` ジャーナルイベント `{sessionId, state, from, trigger}` を記録します。イベントが追記されるのは、状態がそのセッションで最後に記録された状態と異なる場合だけです。ジャーナルには通知テキスト、プロンプト、ツール入力を保存せず、記録が guard の判定、stdout、終了コードを変えることはありません。
- `hooks/hooks.json` と `install.sh` は、フックイベント `Notification`、`PermissionRequest`、`SessionEnd`、`UserPromptSubmit` を `emet guard --event <Event>` に接続します。`install.sh` は冪等のままです。`codex/hooks.json` は変更されません。
- `emet status` の JSON に `sessions: [{sessionId, state, blocked, since, runId}]` が加わりました。リポジトリの過去 24 時間のセッションごとの最新状態で、`ended` は除外されます。ブロックされたセッションがあると全体の状態が `needs-decision` になり、サマリー行と `--brief` にその名前が表示されます。
- `emet fleet status [--json]` は、グローバルジャーナルからリポジトリごとの最新のセッション状態を、ブロックされたリポジトリを先頭にして出力します。
- `needs-decision` への遷移時に、emet はアラートを 1 回だけ発します。Orca に接続できる場合はリポジトリの Orca ワークツリーに未読マークとコメントを付け、できない場合は PATH に `notify-send` があればそれを使います。`attention.alert`(ブール値、デフォルトは `true`)が設定スキーマに追加され、これでアラートをオフにできます。
- `docs/reference/cli.md`、`docs/reference/configuration.md`、`docs/guide/fleet.md` にセッションのアテンション機能を記載しました(9 ロケールすべて)。

## 0.19.0

2026-11-22

### 追加

- `emet memory search --json <query> [--limit <n>]` と `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <outcome>` は Engram の Lessons を読み書きします。`search` はトピックキーが `emet/<repo>/lessons/` で始まるノートを残して全文を出力し、`save` は stdin から 1 〜 5 個の箇条書きを受け取って、spec または quick run のノートに run ごとに 1 セクションを追記します。どちらも JSON オブジェクトを 1 つ出力し、Engram の問題では常に exit 0、使い方の誤りの場合のみ exit 2 で終了します。
- `memory.enabled`（`auto` または `off`、既定は `auto`）が設定スキーマに追加されます。`off` の場合は `engram` を一切起動しません。
- Phase 1 は最初のインタビューラウンドの前にメモリから過去の Lessons を検索し、関連するものをプランファイルの `## Prior lessons` に書き込みます。wave と quick のハンドオフは、最終レポートの前にその run の Lessons を保存します。`--draft` は何も保存しません。
- `docs/reference/cli.md` と `docs/reference/configuration.md` に `emet memory` と `memory.enabled` を記載しました（全 9 言語）。

### 変更

- Codex ビルドは生成された reference に `mcp__engram` が含まれていると拒否するため、Engram のツール名が Codex プラグインに届くことはありません。
- `/emet:run` のプロンプトに上記のメモリ手順が追加されます。PATH に `engram` がない場合や `memory.enabled: "off"` の場合、各手順は 1 行のメモになり、run は 0.18.0 と同様に進みます。

## 0.18.0

2026-11-22

### 追加

- `emet review --ticket <t> --coverage <file|-> [--expect S1,S3]` は Coverage verdicts をレッジャーに保存します。テストが存在しない、または作業ツリーで見つからない `met` の判定と、判定のない期待 S# は、それぞれ `VG-S<n>` の finding を開きます。
- `emet review --base <ref>` は最初のラウンドでレビューのベースを保存し、wave が触れていない行の finding を `preexisting` としてマークします。`emet gate` は既存の finding をブロッキングとして数えません。
- finding は任意のフィールド `s`、`userOption`、`agreement` を受け付けます。`userOption` を持つ未解決の finding はすべての tier と severity でブロックし、gate は `hold` と `next: "fix-findings"` を返します。Phase 2 は、ユーザーが選んだオプション由来の S# を `(user option)` と書きます。
- `emet review --merge <a.json> <b.json>` は 2 つの finding 配列を 1 つに統合します。`s` が同じ、または `file` が同じで行が 3 行以内の finding はペアになり、`agreement: "both"` か `"single"` が付きます。
- `emet assess` は `dualReview: {run, reason}` を出力し、`review.dual`（`auto` または `off`、既定は `auto`）が設定スキーマに追加されます。`codex` が PATH にある Claude ホストでは、`high` の wave は Dual review を実行します。`emet:emet-reviewer` と `emet review-run --tier high --coverage-out <file>` を並行実行し、その後 `emet review --merge` を行います。
- `emet review-run --coverage-out <file>` は Codex レビュアーの Coverage verdicts を書き出し、出力スキーマは null 許容の `s` と `userOption` を受け付けます。
- `docs/reference/cli.md` と `docs/reference/configuration.md` にレビューの変更を記載しました（全 9 言語）。

### 変更

- レビュアーのプロンプトと `agents/emet-reviewer.md` は、散文の `S<n>: met | partial | unmet` 行の代わりに、Coverage verdicts ファイル `.emet/coverage-<run>.json` を求めます。Phase 8 は `emet review --coverage` で判定を記録し、既存の finding は修正せず wave レポートに列挙します。
- `--base`、`--coverage`、`--merge`、Dual review のいずれも使わない場合、すべてのコマンドは 0.17.0 と同じ動作をします。

## 0.17.0

2026-11-22

### 追加

- `/emet:run --quick <変更>` は、1 つのチケットに収まる変更に対して Quick run を実行します。インタビュー 1 回、folded チケット 1 つの spec、承認 1 回、worker 1 つ、レビュー、そしてその 1 つの Wave の Landing を pull request（またはローカル merge）として行い、`emet chain` は使いません。変更が画面に関わる場合や 1 つのチケットに収まらない場合は、承認の前に停止し、`--quick` なしの `/emet:run` を勧めます。`--draft` や `--dispatch` との併用は拒否されます。`--no-promote` は使えます。手順は新しい `emet/reference/phases-quick.md` にあります。ADR-0039 を参照してください。
- `emet assess --quick` は通常の JSON に加えて `"quickRejected"` を出力し、レベルが `high` のときは終了コード `1` で終了します。Quick run はこれを Gate の Stop として扱い、auto-merge は行わず、pull request は開いたままになり、最終レポートに高リスクの理由が記載されます。`--quick` なしでは、出力と終了コードは変わりません。
- `emet approve --quick` は `approval.json` に `"mode": "quick"` を書き込みます。この変更より前に書かれたレコードも、引き続き `--check` を通ります。
- `resolveLandingUnit(config, runId, root)` は、`--quick` で承認された実行では `wave` を、それ以外では `config.landing.unit` を返します。`emet landed`、`emet status`、`emet preflight` はこれを通して landing 単位を読むため、Quick run が spec ブランチを期待することはありません。
- プランにチケットがない場合、`emet validate` は `no-tickets` エラーを報告し、folded チケットを 1 つ書くよう案内します。
- `docs/reference/cli.md` と `docs/guide/trackers-and-landing.md` に Quick run を記載しました。9 言語すべてが対象です。

### 変更

- `phases-1-5.md` の高速パスの文は、しきい値未満のリクエストでは、チケットを書かずに済ませるのではなく、`folded` と印を付けたチケットを 1 つ書くよう改められました。
- `--run` がない場合、`emet preflight --approval <run>` はその実行の承認レコードから landing 単位を決定します。

## 0.16.0

2026-11-21

### 追加

- ライビング spec(既定ではオフ)。`specs.enabled: true` のとき、spec の最後の wave でコーディネーターが spec の要件デルタ `ADDED`/`MODIFIED`/`REMOVED` を書き、その wave のレビュー前に統合ブランチで `emet spec-merge --spec <id>` を 1 回実行し、更新された `docs/specs/<area>.md` をコミットします。これにより、変更は同じ pull request でレビューされ、ランディングします。新しいリファレンス `living-specs.md` が、デルタの形式と再試行のルールを説明します。ADR-0038 を参照してください。
- 設定と 2 つのスキーマコピーに `specs.enabled`(既定は `false`)が加わります。`emet init` は `"specs": { "dir": "docs/specs", "enabled": false }` を書き込みます。
- `emet doctor` は、`specs.enabled` が `true` の場合に限り、`specs.dir` が gitignore されているか、ファイルである場合に警告します。`specs.dir` が存在しないことは警告になりません。
- `emet spec-merge --spec <id> --deltas-dir` は、共有のデルタディレクトリ `<git common dir>/.emet/runs/<id>/spec-deltas` を作成して出力し、マージせずに終了コード `0` で終了します。
- `landing.specMergeMethod` は `merge`(既定)、`squash`、`rebase` を受け付けるため、squash マージのみを許可するトランクにも spec をランディングできます。リポジトリ設定またはトランクの ruleset が設定されたメソッドを許可していない場合、`emet doctor` が警告します。ADR-0037 を参照してください。
- `bun run check:codex` は、生成された `codex/` ディレクトリ内にソースのないファイルがあると失敗します。

### 変更

- `specs.enabled` がオフのとき、`emet spec-merge` は `specs.enabled is false; nothing merged` を出力して終了コード `0` で終了します。デルタは git common dir 配下の共有 run ディレクトリから読み込み、なければチェックアウトごとの `.emet/runs/<id>/spec-deltas/` にフォールバックします。
- フェーズ 8 のプロンプトは、wave や spec のランディング後に `emet spec-merge` を実行しなくなりました。代わりに `phases-8-review.md` が最後の wave で `living-specs.md` を読み込みます。
- `emet spec-branch land` は、`emet ci` と同じポーラーで PR のチェックを待ち、まだチェックのない PR でもポーリングを続け、`landing.specMergeMethod` でマージします。

### 修正

- `emet spec-branch land` は、GitHub がチェックを 1 つも登録する前にマージしなくなりました。
- `emet setup` は Claude プラグインを最大 3 回ではなく 1 回だけ一覧表示し、サイレントなプローブはハングせずにタイムアウトします。
- `emet doctor` は、インストール済みプラグインを実行ごとに 1 回だけ一覧表示します。
- `bun run lint` と `bun run fix` は、先にサイト用の Astro の型を生成するため、新規チェックアウトでも成功します。

## 0.15.0

2026-11-21

### 変更

- `landing.unit` の既定値は `spec` です。spec の wave は `emet spec-branch` でブランチ `spec/<id>` に統合され、wave ごとに 1 つの pull request ではなく、spec 全体が 1 回だけ(1 つの pull request、または `landing.mode: merge` ではローカルマージ 1 回で)ランディングします。従来の動作を保つには `"landing": { "unit": "wave" }` を設定してください。`spec` モードには Claude Code の設定で `worktree.baseRef: "head"` が必要です。ADR-0037 を参照してください。
- ジャーナルに種別 `spec.integrate`、`spec.land`、`spec.abandon` が加わり、`emet status` に `specBranch` が加わります。

## 0.14.5

2026-11-21

### 追加

- `emet handoff --check` は、ワーカーの引き継ぎノートにある `skills:` セクション(`none`、または `loaded: a, b; missing: c`)を解析します。`state` が `done` のときは必須です。`--expect-skills a,b` は、どちらのリストにもない指定スキルごとにチェックを失敗させ、不足しているスキルを出力します。
- ディスパッチレコードにオプションの `skills` 配列が加わり、`emet verify` はそれを `--expect-skills` として `emet handoff --check` に渡します。`skills` のないレコードも引き続き解析されます。
- ADR-0036 により、チケットが段落を名指しすれば、インストールされるプロンプトの文言を変更でき、同じプルリクエストでバイト上限を引き上げます。

### 変更

- フェーズ 8 のプロンプトを `phases-8-review.md` と `phases-8-landing.md` に分割しました。`install.sh` は古い `phases-8-closeout.md` を退役させます。編集済みのコピーやマニフェスト導入前のコピーは `phases-8-closeout.md.retired` に移動し、未編集のコピーは削除します。
- ワーカーのプロンプトは、最終の引き継ぎの前に `skills:` 行を書くよう指示します。
- アーキテクチャページ、CLI リファレンス、およびその 9 言語の翻訳が、フェーズ 8 の 2 つのファイルと `--expect-skills` を説明します。

## 0.14.4

2026-11-20

### 追加

- Codex ホスト上の `emet doctor` は、emet プラグインが `$CODEX_HOME/config.toml` で有効になっているのに Codex がそのフックを一つも信頼していない場合に警告します。この場合 emet ガードは実行されません。この警告は終了コードを変更しません。

### 修正

- プラグインのバージョンに対応するリリースアセットをまだダウンロードできない場合、`bin/emet` は `emet guard` だけでなくすべてのコマンドで最新のキャッシュ済みバイナリを実行し、リリースがまだ公開中の可能性があることを示す通知を 1 件表示します。`EMET_PREFETCH=1` の場合は、通知を表示してバイナリを実行せずに `0` で終了します。チェックサムの不一致や `SHA256SUMS` の欠如では、これまでどおりフォールバックしません。また、ダウンロードの一時ディレクトリはフォールバックの前に削除されます。

## 0.14.3

2026-11-20

### 追加

- `emet fleet launch --dry-run` は準備チェックを実行し、セッションを開始せずに各リポジトリについて `would launch <name>` を表示します。

### 修正

- `emet migrate` は、`.emet/` のコピーと内容が異なる、追跡されていない旧 `.forge/` の実行ファイルを削除して `.emet/` 側を残すため、ログが残っているリポジトリでも完了します。解決できない競合はすべて手動の手順とともに一覧表示され、リポジトリ内での git の失敗はファイルを削除せず競合として扱われます。
- テストのプリロードは実行終了時に自身の `emet-test-state-*` ディレクトリを削除するため、`bun test` は実行ごとに一時ディレクトリを残さなくなりました。

## 0.14.2

2026-11-20

### 修正

- `emet promote` は同期プルリクエストを即座にマージする代わりに、そのチェックを待ち、成功した場合にのみマージします。失敗、タイムアウト、または拒否された同期プルリクエストは、promote を失敗させずに開いたまま残り、結果とジャーナルイベントに `syncMerged` と `syncReason` が含まれます。

## 0.14.1

2026-11-20

### 追加

- `emet tracker close` は、GitHub チケットの最後のサブイシューがクローズされると、その親のスペックイシューをクローズし、各スペックを新しい `specs` フィールドで報告します。スペックの読み取りまたはクローズに失敗すると `1` で終了します。
- GitHub のサブイシューのサマリーがまだ追いついていない場合でも、スペックはクローズされます。同じ呼び出しでクローズされたチケットを含め、スペックのサブイシューを 1 件ずつ数えます。

## 0.14.0

2026-11-20

### 追加

- `emet init` は、Prisma スキーマ（`prisma/schema.prisma` または `prisma/schema/`）または Drizzle のマイグレーションフォルダーを見つけると `schema.ownedPaths` を設定し、スキーマ所有権の `TODO(emet):` マーカーを削除します。
- `agent-browser` セットアップ項目は、`~/.agent-browser/config.json`（`contentBoundaries` と `maxOutput`）が存在しない場合に書き込み、インストール後に `agent-browser doctor` を実行します。ADR-0035 を参照してください。
- ホストが非特権ユーザー名前空間を制限している場合、`emet setup` は `agent-browser` がダウンロードした Chrome 用の AppArmor プロファイルと、それを読み込む `sudo` コマンドを出力します。`sudo` を自分で実行することはありません。

### 変更

- `firecrawl-local` セットアップ項目は、MCP サーバーを `off` ではなく `FIRECRAWL_CLOUD=search` で登録し、以前の登録を置き換え、最新の `agent-browser` の Chrome を `FIRECRAWL_CHROME_PATH` として渡します。ADR-0035 を参照してください。

### 修正

- `emet setup` は `firecrawl-local` MCP サーバーをサーバー名を先頭にして登録するため、登録が正しく解析されます。
- `emet --help` はレジストリ内のすべてのコマンド（setup、fleet、insights、chain、promote、whats-new、deploy-check、ci、run）を一覧表示します。
- テストが `~/.local/state/emet` 配下の実際のジャーナルに書き込まなくなりました。

## 0.13.0

2026-11-20

### 追加

- `emet setup` が `context7` と `firecrawl-local` の項目を提供します(どちらも既定ではオフ)。`context7` は `ctx7` CLI とその `find-docs` スキルをインストールします。`firecrawl-local` は `cargo` で Firecrawl Local をビルドし、ローカル専用の MCP サーバー(`FIRECRAWL_CLOUD=off`、`--public-only`)として登録します。ADR-0034 を参照してください。
- `emet review-run --browser-verify true|false` が、ブラウザ軸を Codex レビュアーに渡します。
- `emet.config.json` の `validate.coupledSurfaces` と `emet validate` の `coupled-surface-split` エラーにより、ページとその翻訳が同じウェーブに収まります。ADR-0033 を参照してください。

## 0.12.0

2026-11-20

### 追加

- `emet.config.json` の `verify.browser`(`startCommand`、`url`、省略可能な `paths`)を設定すると、そのリポジトリでは `agent-browser` による UI 変更のブラウザー検証が有効になります。設定スキーマとそのパーサーはすべてのフィールドを検証します。
- `emet assess` は `browserVerify: { run, reason }` を出力します。ブラウザー軸が実行されるのは、ウェーブにレビュアーがいて、`verify.browser` が設定されており、`agent-browser` が PATH 上にあり、変更されたパスが `paths` に一致する場合だけです。
- `emet setup` に `agent-browser` 項目(既定ではオフ)が加わり、最新リリースとそのブラウザーをインストールします。
- `verify.browser` を設定しているリポジトリでは、`emet doctor` が agent-browser に関する任意の検出結果を報告します。バイナリーが見つからない場合や `agent-browser doctor` が失敗した場合は、注記または警告であり、終了コードは変わりません。
- レビュアー用プロンプトにブラウザー軸が加わります。これは `browserVerify.run` が true のときだけ埋められます。ワーカー用プロンプトにも、ブラウザー確認用の任意の 1 行が加わります。ADR-0032 を参照してください。

## 0.11.1

2026-11-19

### 修正

- ネイティブ Windows(Git Bash)と、サポート対象外の OS やアーキテクチャでは、`bin/emet` が失敗せず終了コード 0 で終了するようになり、PreToolUse ガードがすべてのツール呼び出しをブロックすることはなくなりました。通知を 1 回表示するのは、セッション開始時のプリフェッチだけです。
- `install.sh` は、何かを書き込む前に `MINGW*`、`MSYS*`、`CYGWIN*` での実行を拒否します。
- Codex のフックに `commandWindows` のオーバーライドが追加され、Windows(PowerShell)上の Codex がイベントのたびにエラーになることはなくなりました。

## 0.11.0

2026-11-19

### 追加

- `emet whats-new` は、更新後に emet を初めて実行したときにリリースノートへのリンクを含む 1 行の通知を表示し、実行中のバージョンを記録します。`--hook` を付けると、セッションフック向けに `systemMessage` JSON オブジェクトとしてその行を出力します。

## 0.10.0

2026-11-19

### 追加

- `handoff.afterSpec` が `{ paths?, mode }` ルールの順序付きリストを受け付けるようになり、CLI とウェブサイトを持つリポジトリで CLI をリリースし、ウェブサイトをプロモートできます。モードは、`develop` のプロモートで `main` に取り込まれるパスから選ばれます。
- `deploy.check.paths` により、デプロイチェックを、指定した glob に触れたプロモートに限定できます。
- `emet promote` が `rule` と `reason` を出力してジャーナルに記録し、`deployCheck: { run, reason }` を出力します。

### 変更

- デプロイチェックは `afterSpec` に依存しなくなりました。トランクが `main` の場合は最終 wave がクリーンに終わった後、`develop` の場合はプロモートがマージされた後に実行されます。コーディネーターは、`afterSpec` が `none` の場合も含め、すべての spec の後に `emet promote` を実行します。

## 0.9.1

2026-11-19

### 修正

- `emet setup` が `--data-dir` を受け付けるようになり、プラグインの SessionStart フックが `unknown flag --data-dir` で失敗しなくなりました。

## 0.9.0

2026-11-19

### 追加

- `emet gate` が修正して継続するポリシーを適用します。保留された wave は、指摘が解消するか `budgets.fixRounds`（既定は 2）を使い切るまで修正ラウンドを実行し、その後停止します。`gate.onHold` で `fix-and-continue`（既定）か `stop` を選びます。`emet review --recheck` は、レビュアーの判定によってのみ指摘を解消します。
- `emet ci --wait` はプルリクエストのチェックをポーリングし、不安定なジョブを再実行して、`pass`、`fail`、`env-fault`、`timeout` のいずれかを報告します。`emet tracker close` は GitHub のチケットを冪等にクローズし、`emet chain` は gate、readiness、launch、verify を 1 ステップで実行します。
- イベントジャーナルが、gate の判断、介入、起動、チケットのクローズ、クリーンアップを記録し、サイズに応じてローテーションします。`emet insights` がそれを要約し（`--mark-baseline` でベースラインをリセット）、`emet run current` が現在の spec と wave を表示し、`emet status --brief` が状態を 1 行で出力します。
- 設定キー `language.conversation` と `language.artifacts`。
- 設定キー `handoff.afterSpec`（`release`、`promote`、`none`。`emet init` が検出するか、`emet init --after-spec` で設定）、`deploy.check`、`interview.research`。
- `emet promote` は、最後の wave がアイドルになると `develop` から `main` へのプルリクエストを開き、チェックが通ればマージし、`develop` が遅れていれば `main` を同期し直します。`--no-promote` は spec をそのすべてのセッションで保留します。
- `emet deploy-check` はデプロイ確認コマンドを再試行し、ハングしたコマンドを終了させます。
- `emet fleet list | set | launch` は複数のリポジトリにまたがって spec を実行します。
- `emet setup` と `/emet:setup` は、Claude の設定をバックアップしたうえで、カタログからオプションのコンパニオンをインストールします。SessionStart フックが通知を一度だけ表示し、`install.sh` は TTY で setup を実行します。
- `emet doctor` と `emet init` は Engram を推奨しますが、未充足の依存関係として数えることはありません。

### 変更

- インストールされるプロンプトとドキュメントが、gate ポリシー、`emet ci`、`emet chain`、ジャーナル、spec 後のステップ、fleet、setup を説明するようになりました。フェーズ 8 に wave の要約とプッシュ通知が加わり、`emet insights` が `/retro` への案内に置き換わります。

### 修正

- `--no-promote` は git 共通ディレクトリ配下のマーカーとして保持されるため、最後の wave に対する連鎖した `/emet:run --dispatch` セッションが `develop` を `main` に昇格させることはなくなりました。

## 0.8.6

2026-11-17

### 修正

- リリースのワークフローは、CI のテストジョブと同じように、タグでチェックを再実行する前に Chromium をインストールします。これにより検証が `tools/` のカバレッジ下限で止まらなくなりました。このため v0.8.5 はタグ付けされたものの公開されませんでした。その変更はこのバージョンで公開されます。

## 0.8.5

2026-11-17

### 変更

- カバレッジゲートは、`emet/`、`apps/site`、`tools/` に対してファイルごとに行 97 %、関数 98 % の下限を課し、理由付きの例外は `tools/coverage-exceptions.ts` に置きます。カバレッジマニフェストは `emet/src` を再帰的にたどり、`tools/` もゲートの対象になり、`tools/coverage-floors.json` の合計は測定値まで引き上げられます。
- PreToolUse ガードはフェイルクローズになりました。`bin/emet` が emet バイナリを解決できないとき、フックは終了コード 2 で終了してツール呼び出しをブロックし、復旧方法を示すメッセージを出します。Stop と SubagentStop のフックは引き続き終了コード 1 です。
- プラグインのマニフェストに、作者のメールアドレス、ライセンス、ホームページ、リポジトリ、バグ報告の URL が入り、Codex スキルの説明には各スキルをいつ使うかが書かれます。

### 修正

- `emet doctor` は、予期しないエラーが漏れたとき、0 ではなく終了コード 3 で終了します。先に設定された 0 以外の終了コードは保持されます。
- `emet cleanup --all --force` は、終了した実行のワーカーのワークツリーとブランチを回収します。`.claude/worktrees/` 以下のワークツリーも含みます。生きている、またはアイドル状態のオーナーと、実行を指していないロックは保護されたままです。
- 編集ガードは、`src/app/[locale]/page.tsx` のように文字どおり書かれたサーフェスに一致します。サーフェス内の `[` と `]` は文字クラスではなくなりました。
- `emet preflight --post-dispatch` は、予約またはスロットをまだ持つチケットがワーカーのワークツリーを失っているときに失敗し、再開ではなく再ディスパッチするようコーディネーターに伝えます。
- コンパイル済みの `emet` バイナリは、カレントディレクトリの `.env` ファイルを読み込まなくなりました。
- ウェブサイトは、ホームページのインラインスタイル属性をなくし、ライトモードでのホームのラベルに AA コントラストを与え、検索ボタンに最初の描画から見えるテキストで名前を付けます。ドキュメントの画像は `raw.githubusercontent.com` ではなくサイト自身のオリジンの `repo-assets` から配信され、`astro dev` でも配信されます。

## 0.8.4

2026-11-15

### 変更

- ホームページのヘッダーを、左端にワードマークと Docs、右端に検索・GitHub のスター数・テーマ・言語を置く 2 つのグループに変更しました。コントロールとリリースのピルは空に重なる半透明のガラス調になり、ホームのヘッダーとメニューから重複していた「更新情報」リンクを削除しました。

## 0.8.3

2026-11-15

### 修正

- `/docs/` と各ロケールの `/docs/` は、スタイルのないページが一瞬表示される meta-refresh のスタブではなく、はじめにページへの 301 で応答するようになりました。

## 0.8.2

2026-11-11

### 修正

- `emet cleanup` は、ワークツリー `<name>` がまだ存在する間は `worktree-<name>` のスキャフォールドブランチを残します。そこで別のブランチで作業しているセッションは、ホストが想定するブランチを保持できます。

## 0.8.1

2026-11-11

### 追加

- `emet cleanup` は、Agent host が残す `worktree-<name>` のスキャフォールドブランチを、どこにもチェックアウトされておらず、トランクがその先端をすでに含んでいる場合に削除します。

### 修正

- ガードは、大文字のフラグだけでなく、削除フラグと強制フラグを組み合わせたあらゆる書き方のブランチ強制削除を拒否します。

## 0.8.0

2026-11-11

### 追加

- `emet cleanup` は、すべてのモードで、プルリクエストがブランチの先端コミットでマージされたローカルブランチを、それを保持するクリーンでロックされていないエージェントのワークツリーとともに削除します。統合ブランチ、リリースブランチ、修正ブランチを手動で削除する必要はなくなりました。
- `bun run translations:status` は、ソースより遅れている Website の翻訳を一覧表示します。

### 変更

- ガードがブランチの強制削除を拒否するときのメッセージが `emet cleanup` を案内します。
- リリースのランブックが `whats-new` の翻訳を扱うようになりました。

## 0.7.0

2026-11-11

### 追加

- Website が設定スキーマを `https://emet.andryore.dev/schema/emet.config.schema.json` で配信するようになりました。
- `docs/development.md` と `docs/security.md`。
- workspace ごとのカバレッジ下限。`bun run test` がこれを強制します。

### 変更

- `emet init` は、ローカルパスではなく公開された `$schema` の URL を `emet.config.json` に書き込みます。
- リリースタグは署名され、タグに対応する CHANGELOG のセクションが存在しないか空の場合、Release ワークフローは失敗します。
- リポジトリは andryorelabs 標準 v1 に従います。コードとしての ruleset、コミュニティファイル、README の構成、標準のスクリプト名（`format:write`、`lint:commits`）です。

## 0.6.1

2026-11-10

### 修正

- 同じ古いロックを同時に回収する 2 つのプロセスが、両方とも臨界区間に入ることはなくなりました。claim、Mailbox、tracker、`acquireLock` は保護された 1 つの回収処理を共有します。
- `emet tracker create-ticket` を同時に呼び出しても、断続的に失敗することはなくなりました。

## 0.6.0

2026-11-10

### 追加

- Codex worker 向けの Mailbox: `emet ask` が質問を記録し(`--wait` で返信をポーリング)、`emet inbox` が未解決の質問を一覧し、`emet reply` が質問に回答します。これにより worker は引き継ぎメモ経由でエスカレーションする必要がなくなります。
- `emet dispatch --wait` は、稼働中の worker に未解決の質問がある間 `question <ticket> <id>` を出力し、その worker を停止状態と判定することはありません。
- `emet claims --reserve` はチケットの編集対象を保存し、他の実行の編集対象と重なる予約を拒否します。

### 修正

- `emet dispatch --wait` は、`emet results --write` が結果を書き込む git-common-dir の実行ディレクトリから結果を読み取ります。

## 0.5.2

2026-11-10

### 変更

- 非提携の注記に、Anthropic に加えて OpenAI も明記しました。
- トップページのインストールタブを Claude Code と表記し、実行コマンドに `$emet:run` の Codex タブを追加しました。
- ガイドで、各手順が Claude Code と Codex のどちらの Agent host 向けかを明示しました。

### 修正

- Codex ホストで、`emet doctor`、`emet init`、`emet dependencies`、`emet preflight` が Claude Code 専用の案内を出さなくなりました。
- `emet init --force` が、既存の設定の `agentHost` と `codex` セクションを保持します。

## 0.5.1

2026-11-10

### 変更

- README、ランディング、バナー、ガイド、共有画像で、Claude Code と並んで Codex を明記しました。

## 0.5.0

2026-11-10

### 追加

- Website のホームページ: 描き下ろしのヒーロー、仕組み、機能、概要、締めのパネル、
  ヘッダー、フッター。英語の文字列は `apps/site/src/i18n/ui/en.ts` にあります。
- `/docs/` の Website ドキュメント: リポジトリのドキュメントの許可リストとこの
  変更履歴から作られる Starlight ページ。Pagefind 検索、サイトページまたは GitHub への
  リンク書き換え、翻訳がない、または古い場合の英語フォールバック通知を備えます。
- `docs/how-to/update-emet.md`: プラグインの更新方法と、マーケットプレイスの
  自動更新を有効にする方法。
- Agent ホストとしての Codex: `emet.config.json` の `agentHost`。`emet dispatch` と
  `emet review-run` は各ワーカーとレビュアーを `codex exec` プロセスとして起動します。
  `$emet:run`、`$emet:init`、`$emet:doctor` スキル、Codex プラグインのマニフェスト、
  オプトインのエンドツーエンドテスト（`EMET_CODEX_E2E=1`）も加わりました。
- `docs/guide/codex.md`: Website で公開される Codex ガイド。

### 変更

- Codex の `codex.sandbox` の既定値は `danger-full-access` です（`workspace-write` も
  引き続き指定できます）。`emet dispatch`、`emet review-run`、Codex の `emet launch` が
  これを渡し、Codex 上の `emet guard` はすべての push 形式を拒否します。
- 実行ごとの Codex オーバーレイは、あなたの `config.toml` をリンクする代わりに、
  独自の最小限の `config.toml` を書き出します。そのルールは `-C` 形式と調整用の
  サブコマンドを許可し、push は引き続き禁止です。
- Codex ワーカーは pid ではなく `threadId` と JSONL パスで識別されます。
- Codex ガイドに実際の Codex での結果を記載しました。以前の `failed` 行はすべて
  `verified` になり、`unverified` の一覧は無人での監督のみに縮小され、プローブレポートに
  残りのフォローアップが載っています。

### 修正

- `emet cleanup` が、マージ済みで所有者のいない worktree を回収するようになりました。
- Codex の Agent ホストが既定で解決されるようになり、`emet preflight`、`doctor`、
  `cleanup`、`status`、`usage` が `agentHost: "codex"` を受け付けます。
- Codex のモデル解決は、実行ホームまたは実際の Codex ホームから `models_cache.json` を
  読み込みます。

## 0.4.0

2026-11-06

### 追加

- `emet-mascot` の `position` オプション（`pane`、`band`、`status`）。`pane` が
  既定で、ドッキングできない場合はバンドにフォールバックします。
- README に「Mascot (optional)」セクションを追加。

### 変更

- `emet-mascot` のフレームは、リサイズでぼかされる代わりに 6 つのマスコットカラーに
  スナップされるため、ターミナル上でピクセルアートが鮮明に表示されます。
- `emet-mascot` 0.2.0: 既定の `size` が `small` になりました。
- `docs/how-to/orca-pet.md` は `docs/how-to/mascot.md` になり、モッドと Orca の
  ペットの両方を扱います。

## 0.3.0

2026-11-05

### 追加

- プラグインコマンド `/emet:init` と `/emet:doctor` は、Claude Code 内で `emet init` と
  `emet doctor .` を実行し、結果を要約します。
- `emet doctor` は、`~/.claude/settings.json` 内の、バイナリがもう存在しない
  `forge guard` および `emet guard` フックを警告し、それらを削除するための
  バックアップ後に `jq` を使うコマンドを出力します。ファイル自体は編集しません。
- マスコットの基盤: フェーズファイル、ペットバンドル、モッドのステートマシン、
  残りのフェーズ書き込み処理、ラスターフレーム。
- `emet-mascot`: プロンプトの上にピクセルマスコットを表示し、セッションと `emet` 実行の
  フェーズを反映する任意のプラグインです。マーケットプレイスに掲載されており、
  Orca ペット向けのハウツーと ADR-0016 が付属します。

### 修正

- プラグインが、壊れた重複コマンド `/emet:emet` を公開しなくなりました。
  `commands/` は `run.md`、`init.md`、`doctor.md` に固定されています。
- 次のウェーブは、プラグインが登録するコマンドである `/emet:run` で起動されるように
  なりました。

### 変更

- リポジトリを GitHub の `andryorelabs` 組織に移動しました。リリースのダウンロード、
  README のバッジ、クローン URL は `andryorelabs/emet` を指すようになりました。
  旧 `AndryOre/emet` の URL は引き続きリダイレクトされます。
- スタンドアロンのインストールでは、プラグインに合わせて `/emet` が `/emet:run` に
  名前変更されます。`install.sh` は `commands/run.md`、`init.md`、`doctor.md` を
  `~/.claude/commands/emet/` にインストールするようになり、プラグインなしでも
  `/emet:run`、`/emet:init`、`/emet:doctor` が使えます。旧 `~/.claude/commands/emet.md` は
  未編集であれば削除され、編集済みのコピーは保持されてインストールの要約に
  記載されます。

## 0.2.0

2026-11-05

### 変更

- プロジェクト名を claude-forge から emet に変更しました。CLI は `emet`、
  コマンドは `/emet`、エージェントは `emet-worker` と `emet-reviewer` で、
  README も新しいブランドになっています。既存のインストールとリポジトリは
  引き続き動作します。旧名称（`forge.config.json`、`.forge/`、
  `docs/agents/forge.md`、`FORGE_*`）は通知付きで引き続き読み取られ、
  `emet migrate` がリポジトリを新しい名前に移行します。

### 追加

- `install.sh` が Bun なしで動作します。スタンドアロンバイナリのシムを
  `~/.local/bin/emet` としてインストールし、コピーするプロンプト内のプラグインの
  プレースホルダーを書き換え、`commands/run.md` を `~/.claude/commands/emet.md` として
  インストールし、`sha256sum` の代わりに `shasum -a 256` を受け付けます。
- README に実際の要件、2 つのインストール方法、そして
  `/setup-matt-pocock-skills` の後に `emet init` を実行する順序を記載しました。
- エージェントガイド（`AGENTS.md`）、ドメイン用語集（`GLOSSARY.md`）、
  `docs/adr/` 配下のアーキテクチャ決定記録。
- `.scratch/` の規約に基づくローカル Markdown トラッカー。`emet tracker` CLI
  （`create-spec`、`create-ticket`、`frontier`、`set-state`、`comment`、`close`）と、
  ローカルに対応した `emet validate`、`preflight`、`doctor` を備えます。
- `landing.mode`（`pr` または `merge`）と `emet land`。ウェーブを PR なしの
  1 回のローカルマージとしてランディングします。`merge` モードでは `emet cleanup` と
  `emet status` がローカルのトランクと比較します。
- スタンドアロンの `emet` バイナリ、`emet --version`、CI とプロセスツリー、
  メモリブレーキでの macOS 対応、`bin/emet` シムを含むプラグインマニフェスト。
- `emet skill-path` によるスキルの契約と、スキル、用語集、非推奨、二重インストールを
  対象とする拡充された `emet doctor`。
- JS、Go、Rust、Python のリポジトリに対応した、言語に依存しない `emet init` と
  `emet map`。
- ADR-0007 から ADR-0011。
- ドキュメント索引、アーキテクチャのコードマップ、症状別のトラブルシューティング、
  より充実した PR テンプレート、実行時専用のルールを記した `emet/AGENTS.md`。

### 変更

- `gh` が必要なのは、`tracker.kind` が `github` の場合、または `landing.mode` が
  `pr` の場合だけになりました。
- `emet init` は、既定ではローカルトラッカーを選択しなくなりました。
- ADR-0004 を改訂: ウェーブは 1 つの PR または 1 回のローカルマージとして
  ランディングします。

## 0.1.0

2026-11-03

### 追加

- グローバルな `/forge` コマンド: インタビュー、スペック、チケット、1 回の承認の後、
  並列のワークツリーエージェントが機能を無人で実装、テスト、マージします。
- `init`、`doctor`、`preflight`、`selftest`、クレーム、スロット、ゲート、
  ハンドオフチェック、結果、メトリクスの各サブコマンドを備えた `forge` CLI。
- `forge-worker` エージェントと `forge-reviewer` エージェント。
- Linear と GitHub Issues のトラッカー。
- `forge.config.json` によるリポジトリごとの設定。
- CLI、コマンド、エージェントをインストールする `install.sh`。
