---
title: CLI リファレンス
description: すべての emet サブコマンド、ゲートと記録の表、終了コード、環境変数を説明します。
seoTitle: emet CLI リファレンス
sourceHash: b89b785c057b008c
---

すべての `emet` サブコマンド、ゲートと記録の表、終了コード、環境変数です。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。[README](../../README.md) に戻る。すべてのコマンドは `--help` で使い方を表示します。

## サブコマンド

Claude Code 内では、3 つのスラッシュコマンドが CLI をラップしています。`/emet:run`（パイプライン）、`/emet:init`（`emet init`）、`/emet:doctor`（`emet doctor .`）です。Codex では、これらは `$emet:run`、`$emet:init`、`$emet:doctor` のスキルです。通常のターミナルで `emet` を使うには `install.sh` が必要です。そうでない場合は、セッション内で `! emet <subcommand>` を実行してください。

`emet <command> [...args]`。`emet --version` はバージョンを表示します。

### セットアップと監査

- `emet migrate [--dry-run]`: 旧形式のリポジトリを emet の名前に変更します。
- `emet init [--tracker linear|github|local] [--force]`: パッケージマネージャー、トランクブランチ、トラッカーの種類を自動検出し、`emet.config.json` と `docs/agents/*.md` ファイルを書き出します。`--tracker local` はローカルトラッカーを設定します。
- `emet doctor [--all] [<path> ...]`: 任意の数のリポジトリを一度に読み取り専用で監査します。既定はカレントディレクトリです。
- `emet preflight [--run <id>] [--post-dispatch]`: リポジトリがディスパッチ可能な状態かどうかを確認します。
- `emet skill-path <name>`: mattpocock-skills のスキルの `SKILL.md` の絶対パスを表示します。スキルが見つからない場合は終了コード 1 で終了します。
- `emet selftest`: CLI 自体のユニットテストを実行します。ソースからのインストールのみ対応で、コンパイル済みバイナリは終了コード 1 で終了し、`emet doctor` を実行するよう案内します。

任意の git リポジトリで:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

`emet init` は、自力で推測できないもの（共有テストデータベースのロック、スキーマの所有者など）について、生成した `docs/agents/*.md` ファイルに `TODO(emet):` マーカーを残します。それらを埋めてください。マーカーが残っている間、`emet preflight` はディスパッチを拒否します。

その後、Claude Code 内で（Codex では同じ引数で `$emet:run` を使います）:

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

#### フリートチェック

`emet doctor` は、複数のリポジトリを読み取り専用で一度に監査します。

```bash
emet doctor ~/code/*
```

リポジトリごとに次の項目を報告します。有効な `emet.config.json`、4 つの `docs/agents/*.md` ファイルがすべてあること、`TODO(emet):` マーカーが残っていないこと、`commands.selfCheck` のコマンドが実際に解決できるかどうか、そしてそのリポジトリのトラッカー固有の依存関係の検出結果（`gh`、Linear。[依存関係](dependencies.md#何が何を確認するか)を参照）です。mattpocock-skills プラグインと外部 CLI のフラグ（`gh`、およびエージェントホストのもの。Claude Code では `claude --bg` と `claude agents --json`、Codex では `codex exec --json` と `--output-schema`。`--help` で確認）は、リポジトリごとではなく、スイープ全体で 1 回だけ確認します。

### 実行、ワーカー、スロット

- `emet claims --reserve <ticket> --run <id> --anchor <pid>`: 実行のためにチケットを予約します。`--release <ticket>`、`--list`、`--prune [--dry-run]` は、それぞれクレームの解放、クレームの一覧表示、古いクレームの整理を行います。
- `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`: `~/.local/state/emet/slots` にあるホスト全体のプールからワーカースロットを取得します。`--release --run <id>`、`--release-index <index>`、`--list` は、スロットの解放や一覧表示を行います。
- `emet cleanup [--run <id> | --all] [--dry-run] [--force]`: 引数なしの場合は、作業がランディング済みの完了した実行または終了した実行を回収します。`--run` はこの実行を片付け、`--all` はリポジトリ全体のブランチ整理です。マージ後に `emet cleanup --run <runId>` を実行すると、ウェーブのブランチ、チケットのクレーム、ワーカースロットが解放されます。
- `emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]`: ワーカーがブートストラップ時に書き込む `git worktree lock` の理由を表示します。
- `emet launch <spec-id> --wave <n>`: Claude Code では、ウェーブを `claude --bg` セッションとして開始し、`handoff.launcher` に従って Orca タブを開きます（Codex については [Codex ホスト](#codex-ホスト)を参照）。起動の全体（重複セッションの確認、`claude --bg`、タブ）を行い、`{ name, id, attach, orcaTab: { opened, reason } }` を出力します。別のセッションで手動でウェーブを動かしたいときは、素の `claude --bg` ではなくこちらを使ってください。
- `emet status [--spec <id>]`: ウェーブごとの Working / Checking / Ready / Needs-decision を JSON とサマリー行で表示します。`emet status --help` に JSON の説明があります。
- `emet usage [--session <id> | --file <path>] [--stalled [--minutes N]] [--project-dir <path>]`: セッションの使用状況を報告します。`--stalled` は停滞したワーカーを一覧表示します。
- `emet handoff --check <path> | --render <path>`: ワーカーの `.emet/handoff-<ticket>.md` ノートを検証または表示します。
- `emet metrics [--run <id>]`: セッションのトランスクリプトから、チケットごと、ウェーブごと、実行ごとのトークン、API 換算コスト、経過時間を報告します。また、チケットごとに見積もったコンテキスト予算と、各ワーカーが実際に使った量も比較します。その要約は、実行の最終レポートの末尾に入ります。

### 計画、レビュー、ランディング

- `emet validate --spec <id> | --file <path>`: 計画の検証です。[ゲートと記録](#ゲートと記録)を参照してください。
- `emet surfaces --check <file.json | ->`: ウェーブ内のチケット間で、編集を許可するサーフェスのグロブが重複している場合は拒否します。
- `emet approve --run <id>`、`emet materialize-log`、`emet results`、`emet verify`、`emet review-package`、`emet review`、`emet gate`: [ゲートと記録](#ゲートと記録)を参照してください。
- `emet assess --base <ref> --head <ref>`: 差分を `passive`、`medium`、`high` に分類し、ティア、その理由、推奨されるレビュアーのモデルとエフォートを JSON で出力します。[モデルとエフォート](../../README.md#models--effort)と [`review`](configuration.md#review) を参照してください。
- `emet land --spec <s> --branch <integration> --tickets <id,...>`: 統合ブランチをローカルのトランクにマージします（`landing.mode` が `merge` の場合）。CI の代わりに `commands.selfCheck` を使い、何もプッシュしません。
- `emet spec-merge --spec <id>`: ウェーブが自動マージされた後、スペックの `ADDED`/`MODIFIED`/`REMOVED` の要件の差分を `docs/specs/<area>.md`（`specs.dir`）にマージします。何かを書き込む前にすべてのエリアを確認します。競合がある場合や、シナリオが失われる要件がある場合は、終了コード 1 で終了し、どのファイルにも手を加えません。
- `emet map [--refresh]`: 既存のコードベースの概要（スタック、構造、規約、テスト、ホットスポット）を `docs/agents/codebase.md`（`map.path`）に書き出し、作成元のコミット SHA を刻印します。同じコミットからは常に同じファイルが生成されます。`emet map --stale` は、HEAD が刻印より先に進むと終了コード 1 で終了し、その場合 `emet preflight` は警告します。`emet map --for <globs>` は、チケットの編集対象に一致するセクションだけを出力します。その出力が、ワーカーのブリーフに含まれるマップの唯一の部分です。
- `emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close`: `.scratch/` 上のローカルトラッカーで、標準出力は JSON です。[ローカルトラッカー](#ローカルトラッカー)を参照してください。
- `emet guard`: Claude Code の `PreToolUse` フックで、標準入力からフックの JSON を読み取ります（Codex の形式は [Codex ホスト](#codex-ホスト)にあります）。`install.sh` が `~/.claude/settings.json` に組み込みます。無人実行で失敗の引き金になることが知られているいくつかの操作をブロックします（`emet/src/guard.ts` を参照）。

### ローカルトラッカー

`tracker.kind: "local"` の場合、スペックとチケットはメインワークツリーの `.scratch/` 配下（バージョン管理されません）にある Markdown ファイルです。`.scratch/<slug>/spec.md` と `.scratch/<slug>/issues/<NN>-<slug>.md` で、それぞれ `Status:` 行と `Blocked by:` 行を持ち、コメントは `## Comments` の下に置きます。コーディネーターは `emet tracker`（`create-spec`、`create-ticket`、`read`、`frontier`、`set-state`、`comment`、`close`）を通じてこれらを読み書きします。`emet init --tracker local` でこの構成を設定できます。[ADR-0011](../adr/0011-local-tracker-scratch-convention.md) を参照してください。

`landing.mode` は `"pr"`（既定）または `"merge"` で、トラッカーとは独立しています。`merge` モードでは、ウェーブは `emet land` によるトランクへの 1 回のローカルマージとしてランディングし、CI の代わりに `commands.selfCheck` を使い、プッシュは行いません。`gh` が必要なのは、トラッカーが `github` の場合か、ランディングが `pr` の場合だけです。[ADR-0010](../adr/0010-local-merge-landing.md) と [`landing`](configuration.md#landing) を参照してください。

### PR のランディングとウェーブの連鎖

1 つのウェーブは 1 つの PR です。本文には各チケットについて `Closes #N`（トラッカーのクローズ用キーワード）が入り、コーディネーターは PR を開く際にチケットをレビュー中に移します。その後、PR は `pr.autoMerge` に従ってマージされます。ウェーブにフラグが立っている場合、`autoMerge` が `false` の場合、または CI の修正回数を使い切った場合は、PR は開いたままになります（その場合、PR には人間の判断が必要であることを示すラベルが付きます）。後続のウェーブは、ウェーブ 1 を実行したセッションではなく、それぞれ独自のセッションで実行されます。次に何が起きるかは `pr` セクションと `handoff` セクションで制御します。[`pr`](configuration.md#pr) と [`handoff`](configuration.md#handoff) を参照してください。

### Codex ホスト

これらのコマンドは Codex エージェントホスト (`agentHost` が `"codex"`) 用です。[Codex ガイド](../guide/codex.md)を参照してください。

- `emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: クレームとスロットを確認したあと、`.emet/worktrees/agent-<ticket>` を作り、実行ごとの `CODEX_HOME` オーバーレイを構築して、ワーカーを切り離した `codex exec` として起動します。`emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]` は終了まで待ち、記録された結果ステータスを出力します。
- `emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive>`: `emet review-package` が作ったパッケージに対して、レビュアーを読み取り専用の `codex exec` として実行し、`emet review --findings` 向けの指摘 JSON を出力します。`passive` ティアではプロセスを起動しません。
- `emet launch <spec-id> --wave <n>`: このホストでは、`$emet:run --dispatch <spec>` を実行する切り離した `codex exec` を起動し、そのスレッド ID を記録します。Orca のタブは開かず、`codex exec resume <id>` でセッションを再開できます。
- `emet guard`: `EMET_AGENT_HOST=codex` のとき Codex のフック入力を読み、`apply_patch` のパスを `.emet/surface.json` と照合し、プロンプト行 `approve <id>` が届くまで承認ゲートを閉じたままにします。

## ゲートと記録

フェーズは、チケットが完了したか、マージ可能か、再試行する価値があるかを自分では判断しません。ディスク上の記録を読み、判断を出力する CLI コマンドを呼び出します。実行記録は `.emet/runs/<run-id>/` に、レビュー台帳は `.emet/review/` にあり、どちらもワーカーのワークツリーではなくメインのチェックアウトにあります。

| ステップ             | コマンド                                             | 強制する内容                                                                                                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 承認前               | `emet validate --file <plan.json>`                   | すべての `S#` が少なくとも 1 つのチケットでカバーされ、受け入れシナリオを持つこと。すべてのチケットが少なくとも 1 つの `S#` をカバーすること。ウェーブ内で編集サーフェスが重複しないこと。依存関係に循環がないこと。`emet preflight` は承認済みの計画に対してこれを再度実行します。    |
| 承認                 | `emet approve --run <id> --spec <file>`              | スペックとチケット一覧のハッシュを含む `approval.json` を書き込みます。その後どちらかが変更された場合、ディスパッチは拒否されます（`--check`）。                                                                                                                                       |
| チケット作成         | `emet materialize-log --run <id> --record/--lookup`  | 作成された各チケットの ID を作成直後に保存するため、中断された実行が重複を作ることはありません。                                                                                                                                                                                       |
| ワーカー完了         | `emet results --run <id> --write/--read <ticket>`    | ワーカーはローカルの結果ファイル（`DONE`、`DONE_WITH_CONCERNS`、`BLOCKED`、`NEEDS_CONTEXT` と `Risk:` 行）を書きます。トラッカーに書き込めるのはコーディネーターだけです。                                                                                                             |
| 各ワーカーの後       | `emet verify <ticket> --run <id>`                    | ディスパッチ時の基準点より後にコミットがあること、変更されたすべてのパスがチケットの編集サーフェス内にあること、ハンドオフノートが `handoff --check` に合格すること、`commands.workerScopedSuite` が成功することを確認します。レビューとマージは、合格記録のないチケットを拒否します。 |
| レビューの入力       | `emet review-package <base> <head> --out <file>`     | レビュアー向けに差分をまとめます。レビュアーはファイルパスとして受け取ります。範囲が空の場合や、base の子孫でない場合は終了コード 3 で終了します。                                                                                                                                     |
| レビュー             | `emet review --ticket <t> --findings <file>`         | 指摘の台帳を管理し、トリアージの順序（`intent_gap` → `bad_plan` → `patch` → `defer`）とラウンド数の上限を強制します。`--escalate` は次のモデルティアに移ります。`--rule`/`--rulings` は、レポートと PR 本文のための「下した裁定」を記録および一覧表示します。                          |
| マージまたはチェーン | `emet gate <ticket> --tier … --ci … --integration …` | `merge`、`hold`、`chain`、`stop`、`defer` のいずれかを、理由とともに JSON で出力します。verify の記録、未解決の指摘、リスクティア、CI、統合スイート、予算を読み取ります。                                                                                                              |

ウェーブのブランチがまとめてマージされた後、`commands.fullSuite` が統合ブランチで 1 回実行されます。失敗すると、PR と `autoChain` がブロックされます。ゲートはその結果を `--integration` として受け取ります。ゲートが読み取る予算については、[`budgets`](configuration.md#budgets) を参照してください。

## 終了コード

終了コードは、すべてのサブコマンドで共通の意味を持ちます。

| コード | 意味                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| `0`    | 問題なし。                                                                                 |
| `1`    | 対応が必要な指摘があります。                                                               |
| `2`    | 設定または使い方のエラーで、ツールは実際には実行されていません。未知のコマンドも含みます。 |
| `3`    | 内部エラー。                                                                               |

## 環境変数

ユーザー向けの変数です。設定されている場合、対応する設定値よりも優先されます。

| 変数                          | 効果                                                                                                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` は、その 1 回の実行に限り、依存関係によるブロックを警告に格下げします。自分のシェルで設定し、コーディネーターが無人で実行するものには設定しないでください。        |
| `EMET_MAX_LIVE_WORKERS`       | [`concurrency.maxLiveWorkers`](configuration.md#concurrency) を上書きします。正の整数または `auto` を受け付けます。                                                                                               |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | [`concurrency.runIdleThresholdMs`](configuration.md#concurrency) をミリ秒単位で上書きします。                                                                                                                     |
| `EMET_STATE_DIR`              | ホスト全体の状態ディレクトリで、ワーカースロットのプールを保持します。解決の順序は、`$EMET_STATE_DIR`、次に `$XDG_STATE_HOME/emet`、次に `~/.local/state/emet` です。                                             |
| `EMET_MEM_RESERVE_GIB`        | 空けておく必要があるメモリの余裕（GiB）です。利用可能なメモリがこれを下回ると、取得は拒否されます。既定は 8 です。`auto` のワーカー上限の計算にも使われます。                                                     |
| `EMET_MEM_PER_WORKER_GIB`     | `maxLiveWorkers` が `auto` のときに、ワーカー 1 つあたりに想定するメモリ（GiB）です。既定は 2 です。ワークツリーごとにブラウザ駆動の E2E スイートを動かすなど、ワーカーごとの構成が重い場合は引き上げてください。 |
| `EMET_CPU_OVERSUBSCRIBE`      | `auto` のワーカー上限に使う CPU の倍率です。既定は 1 です。                                                                                                                                                       |
| `EMET_AGENT_HOST`             | `codex` にすると `emet guard` が Codex のフック入力を読みます。Codex のフックが設定します。Claude Code では未設定のままにしてください。                                                                           |

`auto` の上限は `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)` です。旧来の `FORGE_*` 名も引き続き読み取られ、両方が設定されている場合は `EMET_*` が優先されます。
