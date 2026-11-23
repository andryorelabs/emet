---
title: 設定リファレンス
description: emet.config.json のすべてのキーについて、既定値と意味を説明します。
seoTitle: emet の設定リファレンス
sourceHash: e6fb30702c28d97e
---

`emet.config.json` のすべてのキーを、既定値と意味とともに示します。信頼できる情報源は [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json) です。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。[README](../../README.md) に戻る。

`emet init` がこのファイルを書き出します。`$schema` には公開 URL `https://emet.andryore.dev/schema/emet.config.schema.json` が設定され、ウェブサイトは信頼できる情報源とバイト単位で同一のファイルを配信するため、エディタはどこでも補完を利用できます。`emet preflight` と `emet doctor` が検証します。prose-only と記載されたキーは、CLI ではなく `/emet` のプロンプト（Codex では `$emet:*` スキル）が読み取ります。deprecated と記載されたキーは、引き続き受け付けられます。スキーマでは、メモ用の自由記述の `"//"` キー（どのツールも読み取りません）と、常に `1` である `"version"` も許可されています。

## language

- `conversation` (デフォルト `"en"`): エージェントがユーザーに返答する言語の BCP 47 タグ。
- `artifacts` (デフォルト `"en"`): コード、コメント、コミットメッセージ、PR の文面、チケット、ドキュメントの言語の BCP 47 タグ。

どちらも空でない文字列である必要があります。`language` セクションのない設定は、両方とも `"en"` として読み込まれ、`emet init` は両方を書き込みます。インストールされたプロンプトがこれらを読み取ります。

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
- `autoChain`（既定は `false`）: クリーンでマージ済みのウェーブの後にまだウェーブが残っている場合、`/emet:run --dispatch <spec-id>`（Codex では `$emet:run --dispatch <spec-id>`）を表示する代わりに、次のウェーブを起動します。Claude Code では `claude --bg` で起動し、Codex ホストでは切り離された `codex exec` で起動します。後者には `codex.minVersion` 以上の `codex` が必要です。以下の要件は Claude Code のものです。`claude agents` または `claude attach emet-<spec-id>-w<n>` で確認できます。要件:
  1. `claude` が PATH にあり、`--bg` に対応していること。
  2. 信頼されたワークスペースであること。`--bg` は非対話で実行されるため、信頼ダイアログは表示されません。リポジトリで一度 `claude` を対話的に開き、承認してください。
  3. 対話セッションでバイパスの警告を一度承認していること（`skipDangerousModePermissionPrompt`）。次のウェーブは、起動元のセッションのモードではなく、`handoff.permissionMode` で動作するためです。

  起動するのは、PR がマージされ、フラグが立っているものがない場合だけで、`emet-<spec-id>-*` セッションがすでに動作中（`claude agents --json`）であればスキップします。起動に失敗した場合は、`/emet:run --dispatch <spec-id>` を表示する動作にフォールバックします。

- `afterSpec`（既定は `"none"`、`release`、`promote`、`none` のいずれか）: スペックの最後のウェーブが問題なくマージされたあとに `/emet:run` が行うことです。`promote` は `emet promote` を実行します。CI が `pass` になったら `develop` から `main` へのプルリクエストをマージコミットでマージし、`develop` が `main` より遅れている場合に限って、逆方向の同期プルリクエストを作成します。`release` は `cut-release` スキルの手順でリリースのプルリクエストを開き、人の判断を待って停止します。`none` は何もしません。`emet init` が値を検出し（`v*` タグがあり、名前に `release` を含むワークフローファイルがあれば `release`、`develop` ブランチがあってそのようなタグがなければ `promote`、それ以外は `none`）、`emet init --after-spec <mode>` で強制できます。この設定がない config は `none` として読み込まれます。`/emet:run` または `emet promote` に `--no-promote` を渡すと、その実行に限りこのステップは `none` になります。

  `afterSpec` は、空でない順序付きのルールのリスト `{ "paths"?: string[], "mode": "release|promote|none" }` も受け付けます。これにより、1 つのリポジトリで CLI はリリースし、Web サイトはプロモートできます。モードは、`develop` をプロモートすると `main` に取り込まれるパスから選ばれます。変更されたすべてのパスに `paths` が一致する最初のルールが採用され、なければ `paths` のないルール（省略できるのは最後のルールだけ）が適用され、それもなければ `none` です。変更パスがない場合もこのフォールバックのルールになります。glob は編集ガードのマッチャーを使うため、`[locale]` や `(group)` のセグメントはそのままの文字列として扱われます。変更パスは `git fetch origin main develop` と `git diff --name-only --no-renames -z origin/main...origin/develop` から得るので、リネームは旧パスと新パスの両方として数えられます。これらを読み取るのは、`afterSpec` がルールのリストであるか `deploy.check.paths` が設定されていて、かつ `repo.trunk` が `develop` の場合だけで、それ以外では空のリストになります。git が失敗すると、`emet promote` は何も開かずに終了コード 1 で終了します。文字列形式はパスを一切見ません。

  ```json
  {
    "handoff": {
      "afterSpec": [
        { "paths": ["apps/site/**", "docs/**"], "mode": "promote" },
        { "mode": "release" }
      ]
    }
  }
  ```

  この例では、Web サイトまたはドキュメントだけに触れる spec はプロモートされ、CLI に触れる spec はリリースのプルリクエストで止まります。

- `launcher`（既定は `auto`、`auto`、`orca`、`bg` のいずれか）: Claude Code のみです。Codex ホストでは無視され、`emet launch` は Orca タブを開きません。`claude attach` を実行する Orca タブでもウェーブを開きます。`auto` は Orca ランタイム（`orca status`）に問い合わせるため、`TERM_PROGRAM` のない `claude --bg` セッションからも動作します。`orca` は常に試行し、`bg` は一切試行しません。どちらの場合もウェーブはバックグラウンドで動作し、タブを開けなくてもチェーンが止まることはありません。`emet launch <spec-id> --wave <n>` が起動の全体を行います。[`emet launch`](cli.md#実行ワーカースロット) を参照してください。
- `permissionMode`（既定は `bypassPermissions`、`bypassPermissions`、`auto`、`acceptEdits` のいずれか）: Claude Code のみです。Codex ホストでは無視され、チェーンされたセッションは [`codex.sandbox`](#codex) を使います。チェーンされたセッションの権限モードです。起動元のセッションからは継承されません。`auto` モードの分類器が `gh pr merge` のようなステップを拒否し、ウェーブが中途半端な状態で終わるおそれがあるためです。`permissions.deny` のルールは引き続き適用されますが、バイパスの警告を対話的に一度承認しておく必要があります（`skipDangerousModePermissionPrompt`）。

## deploy

任意です。指定がなければデプロイチェックは行われません。

```json
{
  "deploy": {
    "check": {
      "command": "curl -fsS https://example.com/health",
      "retries": 10,
      "intervalSeconds": 15,
      "timeoutSeconds": 300,
      "paths": ["apps/site/**"]
    }
  }
}
```

- `check.command`: デプロイが正常なときに終了コード 0 で終了するシェルコマンドです。
- `check.retries`、`check.intervalSeconds`、`check.timeoutSeconds`: 正の整数です。それぞれ最大試行回数、試行の間隔、全体の制限時間を表します。`emet deploy-check` は `ok`、`failed`、`timeout` のいずれかを出力し、終了コード 0、1、3 で終了します。
- `check.paths`（任意）: 空でない、空文字列を含まない glob のリストです。指定すると、マージされたプロモートは変更パスが一致したときだけチェックを実行し、指定しなければマージされたすべてのプロモートが実行します。

チェックは `afterSpec` に依存しなくなりました。`emet promote` は `deployCheck: { run, reason }` を出力し、コーディネーターは `run` が true のときだけ `emet deploy-check` を実行します。`deploy.check` がない場合や、最後のウェーブがクリーンでない場合は実行しません。すべてのマージがデプロイされる `repo.trunk` が `main` の場合は、クリーンな最後のウェーブの後、モードに関係なく実行します（`--no-promote` や保留中の spec でも、`paths` を無視して実行します）。`develop` の場合は、`promote` モードで、`paths` に一致するマージ済みプロモートの後にのみ実行します。`release` モードでは、デプロイは人を待ちます。

## verify

任意です。ない場合はブラウザ検証を行わず、すべてのコマンドはこれまでどおり動作します。

```json
{
  "verify": {
    "browser": {
      "startCommand": "bun run dev",
      "url": "http://localhost:4321",
      "paths": ["apps/site/**"]
    }
  }
}
```

- `browser.startCommand`: アプリの開発サーバーを起動する、空でないシェルコマンドです。レビュアーがこれを実行し、終わったら停止します。
- `browser.url`: 実行中のアプリが応答する、空でない URL です。
- `browser.paths`（任意）: 空でない、空文字列を含まない glob のリストです。指定すると、変更パスが一致したときだけブラウザチェックを実行し、指定しなければレビューされるすべての差分が対象になります。glob は `deploy.check.paths` と同じマッチャーを使います。
- `verify` または `verify.browser` の下の未知のキーは拒否されます。

`emet assess` は `browserVerify: { run, reason }` を出力し、コーディネーターは `run` が true のときだけレビュアーの Browser 軸を埋めます。条件は、ティアにレビュアーがいる（`passive` ではない）、`verify.browser` が設定されている、任意の [`agent-browser`](cli.md#setup-and-audit) バイナリが PATH 上にある、`paths` が設定されている場合は変更パスが一致する、です。そうでなければ `reason` が最初に満たされなかった条件を示し、レビューはこれまでどおり行われます。ドキュメントのみの差分は `passive` なので、コンテンツのみの変更はブラウザ検証されません。ブラウザコマンドが 2 回失敗したレビュアーは、Chrome DevTools MCP にフォールバックするか、`verification-gap` の指摘を報告します。ウェーブをブロックすることはありません。

## validate

任意です。ない場合は結合サーフェスのチェックを行わず、すべてのコマンドはこれまでどおり動作します。

```json
{
  "validate": {
    "coupledSurfaces": [
      {
        "source": "docs/{guide,reference,how-to}/**/*.md",
        "dependents": "apps/site/src/content/translations/**"
      }
    ]
  }
}
```

- `coupledSurfaces`: 空でないペアのリストです。各ペアは `source` glob と `dependents` glob を持ち、どちらも空でない文字列です。`source` は `docs/{guide,reference}/**/*.md` のような波括弧 glob を受け付けます。
- `validate` の下やペア内の未知のキーは拒否され、不正な形式のエントリは `validate.coupledSurfaces[<n>]` を示すメッセージでロードに失敗します。

`emet validate`（`--file` と `--spec`）と `emet preflight` の実行ゲートは、ペアの `source` とサーフェスが重なるチケットが、そのペアの `dependents` とサーフェスが重なるチケットよりも前のウェーブにある場合、`coupled-surface-split` エラーを報告します。ソースページへの編集と、それに依存するもの（翻訳など）を更新するチケットは、同じウェーブでリリースする必要があります。同じウェーブである場合、または dependents のチケットがない場合は通過します。[ADR-0033](../adr/0033-coupled-surfaces-ship-in-one-wave.md) を参照してください。

## interview

- `research`（既定は `true`）: `true` の場合、`/emet:run` のフェーズ 1 では、選択肢を示す技術的な質問をする前に、エージェントがリポジトリ、ドキュメント、一次情報源から答えを調べ、その選択肢を勧める理由を説明します。回答するのはこれまでどおりユーザーです。`false` で無効になります。

## gate

`emet gate` が未解決のブロッキング指摘をどう扱うかを定めます。

```json
{ "gate": { "onHold": "fix-and-continue" } }
```

- `onHold`（デフォルト `fix-and-continue`）: `fix-and-continue` では、[`budgets.fixRounds`](#budgets) にラウンドが残っている間、未解決のブロッキング指摘に対して `hold` と `next: "fix-findings"` を返します。ゲートが `stop` を返すのは、未解決の指摘に種別 `intent_gap` がある場合、指摘が未解決のまま修正ラウンドを使い切った場合、または失敗したスペックを再実行したあとで統合スイートが 2 回目も失敗した場合だけです（最初の失敗は `hold` と `next: "rerun-failed-specs"` を返します）。`stop` は従来の動作を維持します。CI が一度も実行されなかった場合（`--ci env-fault`）は、`pr.maxCiFixAttempts` を消費せずに `hold` と `next: "rerun-ci"` を返し、2 回連続したときは `next: "report-infrastructure"` を返します。

## budgets

すべて任意です。

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "fixRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts`（既定は `2`、最小は `1`）: チケットが `verify` に失敗できる回数で、これを超えるとゲートは `defer` と答えます。チケットには保留ラベルが付き、ウェーブの残りは続行されます。テストコマンドが 126/127 で終了する、プロバイダー障害が起きるといった環境上の障害は、試行回数を消費せずに実行を一時停止します。
- `reviewRounds`（既定は `2`、最小は `1`）: 次のモデルティアへ 1 回エスカレーションするまでに、チケットが受けられるレビューと修正のラウンド数です。それでも未解決のものには裁定が下されます。
- `fixRounds`（デフォルト `2`）: [`gate.onHold`](#gate) が `fix-and-continue` のとき、ウェーブが得られる修正ラウンドの数。各ラウンドは `emet review --recheck` で終わり、ここに数えられ、`reviewRounds` には数えられません。ラウンドが残っておらずブロッキング指摘が未解決の場合、ゲートは `stop` を返します。これなしで書かれた台帳は使用済み `0` として読まれます。
- `stallNudgeCap`（既定は `6`、最小は `1`）: 停滞したワーカーを促す回数です。カウントはリセットされません。

## models

Claude Code ホストにおけるロールごとのモデルとエフォートです。Codex ホストは代わりに [`codex.models`](#codex) を読みます。すべてのキーは任意で、このセクションを省略すると、ワーカーは `sonnet`/`medium`、レビュアーは `opus`/`medium` のままになります。エフォートは `low`、`medium`、`high`、`xhigh`、`max` のいずれかです。

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
- `minVersion` (既定 `0.167.0`): emet がサポートする `codex` CLI の最も古いバージョンです。`emet doctor` は、インストールされているバージョンをこの値と比較しません。
- `sandbox` (既定 `danger-full-access`): `emet dispatch`、`emet review-run`、および Codex の `emet launch` が `-s` として渡すサンドボックスモード。`workspace-write` も指定できますが、`.git` が読み取り専用になるため、ワーカーはコミットできません。値にかかわらず、`emet guard` は Codex で `git push` を拒否し、生成されるオーバーレイの `config.toml` には、emet のマーケットプレイスとプラグイン、その実行自身のディレクトリに対する trusted テーブル、解決済みのモデルとエフォートだけが入ります（あなた自身のテーブルは入りません）。[Codex ガイド](../guide/codex.md)と [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) を参照してください。

## review

```json
{ "review": { "highRiskPaths": [] } }
```

- `highRiskPaths`（既定は `[]`）: 組み込みのセット（認証、セキュリティ、決済、Webhook、CI、インストーラー、ロックファイル、マイグレーション、生の SQL やパイプでシェルに渡す処理などの危険なシンク）に加えて、`emet assess` で `high` のレビューティアを強制する、大文字小文字を区別しない追加のパス部分文字列です。
- `dual`（既定は `"auto"`）: `"auto"` または `"off"`。下の Dual review を参照してください。

Dual review: `emet assess` が `dualReview.run: true` を出力したとき（ティアが `high`、`agentHost` が `claude`、`review.dual` が `off` ではなく、`codex` が PATH にある場合）、コーディネーターは同じパッケージに対して Claude レビュアーと Codex レビュアーを並列で実行し、`emet review --merge` で両者の指摘をマージします。`agreement: "single"` の指摘はすべてコーディネーターがトリアージし、記録されるのは Claude レビュアーの coverage だけです。`emet init` は `review.dual` を書き込みません。それ以外の場合は、従来どおりレビュアー 1 つで実行します。

## memory

```json
{ "memory": { "enabled": "auto" } }
```

- `enabled`（`"auto"` または `"off"`、既定値は `"auto"`）: [`emet memory`](cli.md#実行ワーカースロット)を制御します。`auto` では、`engram` バイナリが PATH にあり、そのハンドシェイクが成功するときに、このコマンドが Engram を使います。`off` では、`emet memory search` と `emet memory save` は `engram` を起動せずに `{available: false, reason: "memory.enabled is off"}` を出力して 0 で終了します。それ以外の値は、読み込み時に `"memory.enabled" must be one of auto|off` で失敗します。

## attention

```json
{ "attention": { "alert": true } }
```

- `alert`（真偽値、既定は `true`）: セッションが `needs-decision` に遷移したときだけ、emet が通知を 1 回行います。`orca status --json` が到達可能なランタイムを報告する場合は、`orca worktree set` でメイン worktree に未読コメントを設定します。そうでなければ PATH にある場合は `notify-send` を実行し、どちらもなければ何もしません。外部呼び出しのタイムアウトは各 3 秒で、失敗してもガードの結果は変わりません。`needs-decision` から抜けても Orca の未読マークは消されません。通知を無効にするには `false` を設定します。

## landing

- `mode`（既定は `pr`）: `pr` はプルリクエストを開きます（`gh` が必要です）。`merge` は `emet land` で統合ブランチをローカルのトランクにマージし、プッシュは行いません。CI の代わりに `commands.selfCheck` を使います。トラッカーとは独立しています。[ADR-0010](../adr/0010-local-merge-landing.md) を参照してください。
- `unit`（既定は `spec`）: `spec` は各ウェーブを `emet spec-branch integrate` でブランチ `spec/<id>` に統合し、`emet spec-branch land` でスペックを 1 回だけランディングします。`wave` は従来どおり各ウェーブを単独でランディングします。それ以外の値は `"landing.unit" must be one of spec|wave` というエラーで読み込みに失敗します。`spec` には Claude Code の設定（emet のキーではなくハーネスの設定）で `worktree.baseRef: "head"` が必要で、`emet preflight` と `emet doctor` が確認します。[ADR-0037](../adr/0037-landing-per-spec.md) を参照してください。
- `specMergeMethod`（既定は `merge`）: スペックの PR をどのようにマージするか。`merge`、`squash`、`rebase` のいずれかです。`merge` はウェーブごとに 1 つのマージコミットを残すので、ウェーブを取り消せます。`squash` と `rebase` はマージコミットを許可しないトランクに向いていますが、その取り消しができなくなります。`pr.mergeMethod` は無視されます。リポジトリの設定またはトランクのルールセットが選んだ方法を許可していない場合、`emet doctor` が警告します。
- `pushSpecBranch`（既定は `true`）: `emet spec-branch integrate` のたびに、PR を開かずに `spec/<id>` をプッシュします。最終ランディングまでブランチをローカルに置くには `false` にします。

## tracker

`/emet`（Codex では `$emet`）がどの課題トラッカーと連携するかを定めます。CLI は `kind` を読んで適用する依存関係チェックを決めます。それ以外は、`/emet` コマンドが従うアダプターの記述です（[`docs/agents/issue-tracker.md`](../agents/issue-tracker.md) を参照）。

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

- `enabled`（既定は `false`）: 生きたスペックを有効にします。スペックの最後のウェーブで、コーディネーターがスペックの S# 項目から要件の差分を書き、`emet spec-merge` を実行して、そのウェーブとともに `specs.dir` をコミットします。そのため更新はレビューを受け、ウェーブとともにランディングします。
- `dir`（既定は `docs/specs`）: `enabled` が true のとき `emet spec-merge` が書き込む生きたスペックの、リポジトリからの相対ディレクトリです。

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

## 環境変数

CLI はこれらの変数を、すべて `emet/src/env.ts` 経由で読み取ります。`FORGE_` 表記の変数は、対応する `EMET_` 名のフォールバックとして引き続き動作し、一度だけ警告を表示します。空の値は未設定として扱われます。`tools/env-docs.test.ts` が、この表とコードの整合を保ちます。

| 変数                          | 従来のフォールバック           | 意味                                                                                                                                                  |
| ----------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_MAX_LIVE_WORKERS`       | `FORGE_MAX_LIVE_WORKERS`       | 同時に稼働するワーカー数の上限: 正の数または `auto`。`concurrency.maxLiveWorkers` を上書きします。                                                    |
| `EMET_STATE_DIR`              | `FORGE_STATE_DIR`              | ホスト全体の状態ディレクトリで、ワーカースロットのプールを保持します。                                                                                |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `FORGE_SKIP_DEPENDENCY_CHECKS` | `1` に設定すると、`emet preflight` で実行をブロックする依存関係チェックが警告に格下げされます。                                                       |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | `FORGE_RUN_IDLE_THRESHOLD_MS`  | 実行のトランスクリプトが無音のままでいられる時間（ミリ秒）で、これを超えるとアイドルと見なされます。`concurrency.runIdleThresholdMs` を上書きします。 |
| `EMET_CPU_OVERSUBSCRIBE`      | `FORGE_CPU_OVERSUBSCRIBE`      | 自動ワーカー上限に使う CPU オーバーサブスクリプション係数です。                                                                                       |
| `EMET_MEM_RESERVE_GIB`        | `FORGE_MEM_RESERVE_GIB`        | ワーカースロットを付与する前に空けておくメモリの GiB 数です。                                                                                         |
| `EMET_MEM_PER_WORKER_GIB`     | `FORGE_MEM_PER_WORKER_GIB`     | 自動ワーカー上限がワーカー 1 つあたりに見込むメモリの GiB 数です。                                                                                    |
| `EMET_AGENT_HOST`             |                                | Codex エージェントホストで実行している場合は `codex` に設定します。それ以外の値は Claude を意味します。                                               |
| `EMET_AUTO_UPDATE`            |                                | スタンドアロンインストールで `emet self update --auto` を無効にするには `0` に設定します。                                                            |
| `EMET_RELEASE_BASE_URL`       |                                | `emet self update` のダウンロード元ルート。アセットは `<root>/vX.Y.Z` または `<root>/latest` から読み込まれます。                                     |
| `CODEX_HOME`                  |                                | Codex のホームディレクトリで、既定は `~/.codex` です。読み取りのみ行われます。                                                                        |
| `XDG_STATE_HOME`              |                                | `EMET_STATE_DIR` が未設定のときの、状態ディレクトリの基準です。                                                                                       |
| `NO_COLOR`                    |                                | 設定すると、バナーが色なしで出力されます。                                                                                                            |
| `FORCE_COLOR`                 |                                | 空または `0` 以外の値を設定すると、TTY がなくてもバナーを色付きで出力します。                                                                         |
| `TERM`                        |                                | `dumb` を設定すると、バナーの色が無効になります。                                                                                                     |
