---
title: 設定リファレンス
description: emet.config.json のすべてのキーについて、既定値と意味を説明します。
seoTitle: emet の設定リファレンス
sourceHash: e234cb9ad3468e98
---

`emet.config.json` のすべてのキーを、既定値と意味とともに示します。信頼できる情報源は [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json) です。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。[README](../../README.md) に戻る。

`emet init` がこのファイルを書き出し、`emet preflight` と `emet doctor` が検証します。prose-only と記載されたキーは、CLI ではなく `/emet` のプロンプトが読み取ります。deprecated と記載されたキーは、引き続き受け付けられます。スキーマでは、メモ用の自由記述の `"//"` キー（どのツールも読み取りません）と、常に `1` である `"version"` も許可されています。

## pr

ウェーブの PR をどのようにマージするかを定めます。

```json
{ "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 } }
```

- `autoMerge`（既定は `true`）: PR のチェックを待ってマージします。チェックがなければ即座にマージします。失敗したチェックは修正してプッシュされ、最大 `maxCiFixAttempts` 回まで繰り返し、それでもだめなら PR は人間のために開いたままになります。フラグが立っているものがあるウェーブは、自動マージされません。
- `mergeMethod`（既定は `squash`）: `squash`、`merge`、`rebase` のいずれかで、`gh pr merge` に渡されます。
- `maxCiFixAttempts`（既定は `2`、最小は `0`）: PR を人間のために開いたままにする前に、コーディネーターが失敗したチェックの修正を試みてよい回数です。

## handoff

ウェーブが完了した後に何が起きるか、およびワーカーのハンドオフノートのサイズ上限を定めます。`emet preflight` が検証します。

```json
{
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `maxLines`（既定は `60`）: `.emet/handoff-<ticket>.md` ノートが `emet handoff --check` で不合格になるまでに持てる最大行数です。
- `maxChars`（既定は `8000`、約 2k トークン）: ハンドオフノートが持てる最大文字数です。
- `autoChain`（既定は `false`）: クリーンでマージ済みのウェーブの後にまだウェーブが残っている場合、`/emet:run --dispatch <spec-id>` を表示する代わりに、`claude --bg` で次のウェーブを起動します。`claude agents` または `claude attach emet-<spec-id>-w<n>` で確認できます。要件:
  1. `claude` が PATH にあり、`--bg` に対応していること。
  2. 信頼されたワークスペースであること。`--bg` は非対話で実行されるため、信頼ダイアログは表示されません。リポジトリで一度 `claude` を対話的に開き、承認してください。
  3. 対話セッションでバイパスの警告を一度承認していること（`skipDangerousModePermissionPrompt`）。次のウェーブは、起動元のセッションのモードではなく、`handoff.permissionMode` で動作するためです。

  起動するのは、PR がマージされ、フラグが立っているものがない場合だけで、`emet-<spec-id>-*` セッションがすでに動作中（`claude agents --json`）であればスキップします。起動に失敗した場合は、`/emet:run --dispatch <spec-id>` を表示する動作にフォールバックします。

- `launcher`（既定は `auto`、`auto`、`orca`、`bg` のいずれか）: `claude attach` を実行する Orca タブでもウェーブを開きます。`auto` は Orca ランタイム（`orca status`）に問い合わせるため、`TERM_PROGRAM` のない `claude --bg` セッションからも動作します。`orca` は常に試行し、`bg` は一切試行しません。どちらの場合もウェーブはバックグラウンドで動作し、タブを開けなくてもチェーンが止まることはありません。`emet launch <spec-id> --wave <n>` が起動の全体を行います。[`emet launch`](cli.md#実行ワーカースロット) を参照してください。
- `permissionMode`（既定は `bypassPermissions`、`bypassPermissions`、`auto`、`acceptEdits` のいずれか）: チェーンされたセッションの権限モードです。起動元のセッションからは継承されません。`auto` モードの分類器が `gh pr merge` のようなステップを拒否し、ウェーブが中途半端な状態で終わるおそれがあるためです。`permissions.deny` のルールは引き続き適用されますが、バイパスの警告を対話的に一度承認しておく必要があります（`skipDangerousModePermissionPrompt`）。

## budgets

すべて任意です。

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts`（既定は `2`、最小は `1`）: チケットが `verify` に失敗できる回数で、これを超えるとゲートは `defer` と答えます。チケットには保留ラベルが付き、ウェーブの残りは続行されます。テストコマンドが 126/127 で終了する、プロバイダー障害が起きるといった環境上の障害は、試行回数を消費せずに実行を一時停止します。
- `reviewRounds`（既定は `2`、最小は `1`）: 次のモデルティアへ 1 回エスカレーションするまでに、チケットが受けられるレビューと修正のラウンド数です。それでも未解決のものには裁定が下されます。
- `stallNudgeCap`（既定は `6`、最小は `1`）: 停滞したワーカーを促す回数です。カウントはリセットされません。

## models

ロールごとのモデルとエフォートです。すべてのキーは任意で、このセクションを省略すると、ワーカーは `sonnet`/`medium`、レビュアーは `opus`/`medium` のままになります。エフォートは `low`、`medium`、`high`、`xhigh`、`max` のいずれかです。

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  }
}
```

- `worker.model`（既定は `sonnet`）、`worker.effort`（既定は `medium`）: ワーカーです。チケットの `Model:` 行は、そのワーカーに限って `worker` を上書きします。
- `reviewer.medium` と `reviewer.high`（既定はそれぞれ `opus`、`medium`）: `emet assess` が返すリスクティアごとのレビュアーです。リスクの高いウェーブをより厳しく精査したい場合は、`reviewer.high.effort` を（たとえば `high` に）引き上げてください。
- `triage`（既定は `haiku`）: CI ログのトリアージと passive ティアのレビューに使う低コストのモデルです。失敗したチェックはこのモデルのエージェントに渡され、`file:line` ポインターを添えて、最大でおよそ 2k トークンを返します。
- `escalation`（既定は `{ "sonnet": "opus" }`）: チケットが修正回数の上限に達したときに使う、モデル名ごとの次のモデルティアです。

## agentHost

`agentHost` (既定 `"claude"`): 実行が動作するエージェントホスト。`"claude"` または `"codex"`。[Codex ガイド](../guide/codex.md)を参照してください。

## codex

`agentHost` が `"codex"` のときだけ読まれます。すべてのキーは任意です。エフォートは `low`、`medium`、`high`、`xhigh`、`max` のいずれかで、`ultra` は受け付けません。

- `models.worker`, `models.workerOverride`, `models.reviewer.medium`, `models.reviewer.high`, `models.triage`: それぞれ `{ "model", "effort", "fallback" }` の形です。`fallback` は、`model` が Codex のモデルキャッシュにないときに順に試すスラッグの一覧です。既定値は[モデルとエフォート](../guide/models-and-effort.md)にあります。
- `models.session`: `$emet:run` を実行するセッション用の `{ "model", "effort", "planEffort", "fallback" }`。`planEffort` は最初の承認まで適用されます。
- `effort`: 設定すると、すべてのロールのエフォートを置き換えます。
- `minVersion` (既定 `0.167.0`): `emet doctor` が受け入れる `codex` CLI の最も古いバージョン。
- `sandbox` (既定 `danger-full-access`): `emet dispatch`、`emet review-run`、および Codex の `emet launch` が `-s` として渡すサンドボックスモード。`workspace-write` も指定できますが、`.git` が読み取り専用になるため、ワーカーはコミットできません。値にかかわらず、`emet guard` は Codex で `git push` を拒否し、生成されるオーバーレイの `config.toml` には、emet のマーケットプレイスとプラグイン、その実行自身のディレクトリに対する trusted テーブル、解決済みのモデルとエフォートだけが入ります（あなた自身のテーブルは入りません）。[Codex ガイド](../guide/codex.md)と [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) を参照してください。

## review

```json
{ "review": { "highRiskPaths": [] } }
```

- `highRiskPaths`（既定は `[]`）: 組み込みのセット（認証、セキュリティ、決済、Webhook、CI、インストーラー、ロックファイル、マイグレーション、生の SQL やパイプでシェルに渡す処理などの危険なシンク）に加えて、`emet assess` で `high` のレビューティアを強制する、大文字小文字を区別しない追加のパス部分文字列です。

## landing

- `mode`（既定は `pr`）: `pr` はプルリクエストを開きます（`gh` が必要です）。`merge` は `emet land` で統合ブランチをローカルのトランクにマージし、プッシュは行いません。CI の代わりに `commands.selfCheck` を使います。トラッカーとは独立しています。[ADR-0010](../adr/0010-local-merge-landing.md) を参照してください。

## tracker

`/emet` がどの課題トラッカーと連携するかを定めます。CLI は `kind` を読んで適用する依存関係チェックを決めます。それ以外は、`/emet` コマンドが従うアダプターの記述です（[`docs/agents/issue-tracker.md`](../agents/issue-tracker.md) を参照）。

- `kind`（必須）: `linear`、`github`、`local` のいずれかです。`local` については、[ローカルトラッカー](cli.md#ローカルトラッカー)と [ADR-0011](../adr/0011-local-tracker-scratch-convention.md) を参照してください。
- `transitions.onStart`、`transitions.onPrOpen`、`transitions.onPrMerge`: チケットの状態遷移をそれぞれ誰が書き込むかを `worker`、`coordinator`、`automatic` のいずれかで指定します。`automatic` は、トラッカーの連携機能が行うことを意味します（たとえば PR のオープン時やマージ時の Linear の GitHub 連携）。コーディネーターは、`automatic` と指定された遷移を書き込むことはありません。
- `github.priorityLabels`: 優先度（`"1"` = P0 が最高から `"4"` = P3 まで）を GitHub のラベル名に対応付けます。たとえば `{"1":"P0","2":"P1"}` です。何も宣言しない場合、チケットは `createdAt` の昇順に並び、`emet doctor` がその旨を伝えます。
- `github.stateLabels`: ワークフローの状態（`todo`、`in-progress`、`in-review`）を GitHub のラベル名に対応付けます。たとえば `{"todo":"status:todo"}` です。`done` と `canceled` は、Issue のクローズ状態と `state_reason` から推定されます。
- `linear`: Linear 固有の設定（チームキー、ワークフロー状態の名前）です。`docs/agents/issue-tracker.md` に従うモデルだけが読み取り、CLI は読み取りません。
- `local.idPrefix`（deprecated）: ローカルのチケット ID は、現在は `<feature-slug>-<NN>` になっています。
- `readyLabel`、`triageLabels`、`prReference`（deprecated）: ラベルと PR 参照のテンプレートです。たとえば `Closes #{number}`（github）や `Refs: {id}`（linear）です。

## preflight

- `requiredFiles`（既定はなし）: ウェーブをディスパッチする前に、`emet preflight` がリポジトリのルートに必須とするファイルです。それぞれ `{ "path", "why" }` の形式で、`why` は失敗メッセージに表示されます。空の場合、このチェックは実行されません。
- `requiredCommands`（既定はなし）: ディスパッチの前に PATH で解決できなければならないバイナリです。解決できないものがあると、`emet preflight` はそれを名指しして終了コード 1 で失敗し、`emet doctor` も報告します。これはリポジトリ独自のリストで、トラッカーに基づく[依存関係チェック](dependencies.md#何が何を確認するか)とは別です。`gh` にはすでに専用のチェックがあるため、記載は任意です。よく追加されるのは `rg` と `sg` です。

## specs

- `dir`（既定は `docs/specs`）: `emet spec-merge` が書き込む生きたスペックの、リポジトリからの相対ディレクトリです。

## map

- `path`（既定は `docs/agents/codebase.md`）: `emet map` が生成するマップの、リポジトリからの相対パスです。

## concurrency

- `waveSize`（既定は `4`、最小は `1`）: 1 つのウェーブで同時にディスパッチする Agent 呼び出しの最大数です。
- `maxLiveWorkers`（既定は `auto`）: このホスト上で動作するすべての `/emet` コーディネーターが、すべてのリポジトリをまたいで共有するグローバルな上限です。スロットのプールは `~/.local/state/emet/slots` にあり、特定のリポジトリの中にはありません。`auto` はホストの CPU 数と RAM から上限を導き、正の整数を指定すると固定されます。これとは別に、メモリの余裕チェック（`EMET_MEM_RESERVE_GIB`、既定は 8 GiB）があり、この上限にかかわらず、利用可能なメモリが少なすぎる場合は取得を拒否します。環境変数 `EMET_MAX_LIVE_WORKERS` はこのフィールドを上書きし、`auto` も受け付けます。
- `runIdleThresholdMs`（既定は `5400000`、90 分）: 稼働中のアンカーを持たない実行を、終了ではなくアイドルと分類する期間で、トランスクリプトの新しさだけに基づきます。環境変数 `EMET_RUN_IDLE_THRESHOLD_MS` がこれを上書きします。

[環境変数](cli.md#環境変数)を参照してください。

## ticket

- `idPattern`: チケット ID が一致しなければならない、アンカー付き正規表現のソースです。たとえば `^PROJ-\d+$` です。無効なパターンは致命的な設定エラーになります。
- `branchPrefix`: ワーカーのローカルブランチの小文字のプレフィックス（`^[a-z0-9-]+$`）です。ブランチ名は `<branchPrefix>-<number>-<slug>` で、`cleanup` はグロブ `<branchPrefix>-*` を整理します。
- `idExample`（deprecated、prose-only）: `idPattern` に一致する ID の例です。
- `branchPattern`（deprecated、prose-only）: ブランチ名の完全なテンプレートです。

## commands

すべて prose-only です。

- `selfCheck`: ワーカーが変更を完了と見なす前に実行するコマンドです。たとえば `["npm run check"]` です。`landing.mode` が `merge` の場合は、CI の代わりになります。
- `workerScopedSuite`: ワーカーが、触れた範囲だけをテストするために実行するコマンドです。`emet verify` はこれが成功することを要求します。
- `fullSuite.run`: リポジトリ全体のスイートを実行するコマンドで、ウェーブのブランチがマージされた後、統合ブランチで 1 回実行されます。失敗すると、PR と `autoChain` がブロックされます。
- `fullSuite.singleton`: 同時にスイートを実行できるワークツリーが 1 つだけの場合は `true` です。
- `fullSuite.runInBackground`、`fullSuite.reset`（deprecated）: バックグラウンド実行のフラグと、状態をリセットするコマンドです。

## worktree

- `lockReason`: ワーカーがブートストラップ時に書き込む `git worktree lock` の理由のテンプレートで、`emet lock-reason` が埋め込みます。既定値は `emet run={runId} ticket={ticket} anchor={anchorPid} slug={coordinatorSlug} at={iso}` です。フィールドを追加する場合にのみ上書きしてください。`emet lock-reason` は、リテラルの `emet` トークン、または `run=`、`ticket=`、`anchor=`、`at=`、`slug=` のいずれかを欠いたテンプレートを拒否します。
- `copyFromMain`（prose-only）: ブートストラップの前に、トランクのチェックアウトから新しいワークツリーへコピーするパスです。たとえば、追跡されていない env ファイルです。
- `bootstrap`（prose-only）: ワーカーが開始する前に、新しいワークツリーで 1 回実行するシェルコマンドです。たとえば `["npm ci"]` です。`/emet` のフェーズ 6 が実行するもので、CLI は実行しません。
- `stateDir`（deprecated、prose-only）: 実行ローカルのログ用ディレクトリです。たとえば `.emet` です。

## usage

- `oversizedReadLines`（既定は `400`、最小は `1`）: オフセットも上限も指定せずに、この行数を超えるファイルに対して行った Read は、`emet usage` で過大と数えられます。
- `stalledMinutes`（既定は `10`、最小は `1`）: `emet usage --stalled` の既定の `--minutes` のしきい値です。

## sizing

- `inlineMaxLines`（既定は `100`、最小は `1`）: ワーカーのプロンプトにインラインで含めるチケット本文の最大行数です。

## schema

prose-only です。このリポジトリのデータスキーマの所有者を示し、フェーズ 3 でチケットを分割する際の競合回避ルールに使われます。空または省略した場合、このルールはスキップされます。

- `ownedPaths`: 共有スキーマを定義するパスです。たとえば `["prisma/schema.prisma"]` です。1 つのウェーブでこれらに触れてよいワーカーは最大 1 つです。
- `sharedDatabase`（deprecated）: ワーカーが 1 つの物理データベースを共有する場合は `true` です。

## commit

prose-only です。

- `trailer`: チケットを参照するコミットにワーカーが付加する git トレーラーのキーです。たとえば `Refs` です。
- `trailerPosition`: `body` または `footer` です。

## repo

- `trunk`: すべてのワーカーの変更がマージされる先のブランチで、すべてのクリーンアップと preflight の git 比較の基準にもなります。たとえば `main` です。
- `remote`（既定は `origin`）: `trunk` が存在する git リモートです。
- `integrationBranch`（deprecated、prose-only）: ウェーブがトランクの前に統合する、長く存続する任意のブランチです。
- `commitTypes`（deprecated、prose-only）: ワーカーのコミットで許可される Conventional Commit の種類です。

## design

任意かつ prose-only です。`null` または省略した場合、デザインや UI のレビューのステップはスキップされます。

- `canvasIndex`（deprecated）: ワーカーが UI の変更の前に確認する、デザインキャンバスファイルへのパスです。
