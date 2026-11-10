---
title: トラッカーとランディング
description: チケットの置き場所、ウェーブがプルリクエストまたはローカルマージとしてランディングする仕組み、ウェーブの連鎖を説明します。
seoTitle: emet のトラッカーとランディング
sourceHash: c9ae0940af5cfbad
---

チケットの置き場所、ウェーブがランディングする仕組み、ウェーブの連鎖について説明します。ここで挙げるキーはすべて[設定リファレンス](../reference/configuration.md)に、サブコマンドはすべて [CLI リファレンス](../reference/cli.md)にあります。

<img src="../brand/mascot/mascot-work.svg" alt="emet のマスコット、作業中" width="96" align="right">

## トラッカー

emet は Linear、GitHub Issues、ローカルファイルに対応しており、`tracker.kind` で設定します。`github` トラッカーには `gh` が必要です。`linear` トラッカーには、Linear MCP サーバーを `.mcp.json`（またはユーザースコープ）で宣言しておく必要があります。[依存関係リファレンス](../reference/dependencies.md)を参照してください。

### ローカルトラッカー

`tracker.kind: "local"` の場合、スペックとチケットはメインワークツリーの `.scratch/` 配下（バージョン管理されません）にある Markdown ファイルです。`.scratch/<slug>/spec.md` と `.scratch/<slug>/issues/<NN>-<slug>.md` で、それぞれ `Status:` 行と `Blocked by:` 行を持ち、コメントは `## Comments` の下に置きます。コーディネーターは `emet tracker`（`create-spec`、`create-ticket`、`read`、`frontier`、`set-state`、`comment`、`close`）を通じてこれらを読み書きします。`emet init --tracker local` でこの構成を設定できます。[ADR-0011](../adr/0011-local-tracker-scratch-convention.md) を参照してください。

## ランディング

`landing.mode` は `"pr"`（既定）または `"merge"` で、トラッカーとは独立しています。`merge` モードでは、ウェーブは `emet land` によるトランクへの 1 回のローカルマージとしてランディングし、CI の代わりに `commands.selfCheck` を使い、プッシュは行いません。`gh` が必要なのは、トラッカーが `github` の場合か、ランディングが `pr` の場合だけです。[ADR-0010](../adr/0010-local-merge-landing.md) を参照してください。

### PR によるランディング

1 つのウェーブは 1 つの PR です。本文には各チケットについて `Closes #N`（トラッカーのクローズ用キーワード）が入り、コーディネーターは PR を開く際にチケットをレビュー中に移します。その後、PR は `pr.autoMerge` に従ってマージされます。ウェーブにフラグが立っている場合、`autoMerge` が `false` の場合、または CI の修正回数を使い切った場合は、PR は開いたままになります（その場合、PR には人間の判断が必要であることを示すラベルが付きます）。マージ後は、`emet cleanup --run <runId>` がウェーブのブランチ、チケットのクレーム、ワーカースロットを解放します。

ウェーブのブランチがまとめてマージされた後、`commands.fullSuite` が統合ブランチで 1 回実行されます。失敗すると、PR と `autoChain` がブロックされます。ゲートはその結果を `--integration` として受け取ります。

### ウェーブの連鎖

後続のウェーブは、ウェーブ 1 を実行したセッションではなく、それぞれ独自のセッションで実行されます。次に何が起きるかは、`emet.config.json` の 2 つの任意セクションで制御します（どちらも `emet preflight` が検証します）。

```json
{
  "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 },
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `pr.autoMerge`（既定は `true`）: PR のチェックを待ってマージします。チェックがなければ即座にマージします。失敗したチェックは修正してプッシュされ、最大 `maxCiFixAttempts` 回まで繰り返し、それでもだめなら PR は人間のために開いたままになります。フラグが立っているものがあるウェーブは、自動マージされません。
- `handoff.autoChain`（既定は `false`）: クリーンでマージ済みのウェーブの後にまだウェーブが残っている場合、`/emet:run --dispatch <spec-id>` を表示する代わりに、`claude --bg` で次のウェーブを起動します。`claude agents` / `claude attach emet-<spec-id>-w<n>` で確認できます。要件:
  1. `claude` が PATH にあり、`--bg` に対応していること。
  2. 信頼されたワークスペースであること。`--bg` は非対話で実行されるため、信頼ダイアログは表示されません。リポジトリで一度 `claude` を対話的に開き、承認してください。
  3. 対話セッションでバイパスの警告を一度承認していること（`skipDangerousModePermissionPrompt`）。次のウェーブは、起動元のセッションのモードではなく、`handoff.permissionMode`（後述）で動作するためです。

  起動するのは、PR がマージされ、フラグが立っているものがない場合だけで、`emet-<spec-id>-*` セッションがすでに動作中（`claude agents --json`）であればスキップします。起動に失敗した場合は、`/emet:run --dispatch <spec-id>` を表示する動作にフォールバックします。

- `handoff.launcher`（既定は `auto`）: `claude attach` を実行する Orca タブでもウェーブを開きます。`auto` は Orca ランタイム（`orca status`）に問い合わせるため、`TERM_PROGRAM` のない `claude --bg` セッションからも動作します。`orca` は常に試行し、`bg` は一切試行しません。どちらの場合もウェーブはバックグラウンドで動作し、タブを開けなくてもチェーンが止まることはありません。

  `emet launch <spec-id> --wave <n>` は起動の全体（重複セッションの確認、`claude --bg`、タブ）を行い、`{ name, id, attach, orcaTab: { opened, reason } }` を出力します。別のセッションで手動でウェーブを動かしたいときは、素の `claude --bg` ではなくこちらを使ってください。

  Codex のエージェントホストでは、`emet launch` は `$emet:run --dispatch <spec-id>` を実行する切り離された `codex exec` を起動し、そのスレッド ID を記録します。Orca タブは開かず、`codex exec resume <id>` でセッションを再開できます。[CLI リファレンス](../reference/cli.md#codex-ホスト)と [Codex で emet を実行する](codex.md)を参照してください。

- `handoff.permissionMode`（既定は `bypassPermissions`）: チェーンされたセッションの権限モードです。起動元のセッションからは継承されません。`auto` モードの分類器が `gh pr merge` のようなステップを拒否し、ウェーブが中途半端な状態で終わるおそれがあるためです。`permissions.deny` のルールは引き続き適用されますが、バイパスの警告を対話的に一度承認しておく必要があります（`skipDangerousModePermissionPrompt`）。

## ゲート、予算、記録

フェーズは、チケットが完了したか、マージ可能か、再試行する価値があるかを自分では判断しません。ディスク上の記録を読み、判断を出力する CLI コマンドを呼び出します。実行記録は `.emet/runs/<run-id>/` に、レビュー台帳は `.emet/review/` にあり、どちらもワーカーのワークツリーではなくメインのチェックアウトにあります。すべてのコマンドは `--help` で使い方を表示します。コマンドの一覧とそれぞれが何を強制するかは、[ゲートと記録](../reference/cli.md#ゲートと記録)にあります。

**予算**（`emet.config.json`、すべて任意）:

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts`: チケットが `verify` に失敗できる回数で、これを超えるとゲートは `defer` と答えます。チケットには保留ラベルが付き、ウェーブの残りは続行されます。テストコマンドが 126/127 で終了する、プロバイダー障害が起きるといった環境上の障害は、試行回数を消費せずに実行を一時停止します。
- `reviewRounds`: 次のモデルティアへ 1 回エスカレーションするまでに、チケットが受けられるレビューと修正のラウンド数です。それでも未解決のものには裁定が下されます。
- `stallNudgeCap`: 停滞したワーカーを促す回数です。カウントはリセットされません。

## 生きたスペック、マップ、メトリクス

**生きたスペック。** ウェーブが自動マージされた後、`emet spec-merge --spec <id>` が、スペックの `ADDED`/`MODIFIED`/`REMOVED` の要件の差分を `docs/specs/<area>.md`（`specs.dir`）にマージします。何かを書き込む前にすべてのエリアを確認します。競合がある場合や、シナリオが失われる要件がある場合は、終了コード 1 で終了し、どのファイルにも手を加えません。

**コードベースマップ。** `emet map` は、既存のコードベースの概要（スタック、構造、規約、テスト、ホットスポット）を `docs/agents/codebase.md`（`map.path`）に書き出し、作成元のコミット SHA を刻印します。同じコミットからは常に同じファイルが生成されます。`emet map --stale` は、HEAD が刻印より先に進むと終了コード 1 で終了し、その場合 `emet preflight` は警告します。`emet map --for <globs>` は、チケットの編集対象に一致するセクションだけを出力します。その出力が、ワーカーのブリーフに含まれるマップの唯一の部分です。

**メトリクス。** `emet metrics --run <id>` は、セッションのトランスクリプトから、チケットごと、ウェーブごと、実行ごとのトークン、API 換算コスト、経過時間を報告します。また、チケットごとに見積もったコンテキスト予算と、各ワーカーが実際に使った量も比較します。その要約は、実行の最終レポートの末尾に入ります。
