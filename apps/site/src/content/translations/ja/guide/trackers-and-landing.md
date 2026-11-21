---
title: トラッカーとランディング
description: チケットの置き場所、ウェーブがプルリクエストまたはローカルマージとしてランディングする仕組み、ウェーブの連鎖を説明します。
seoTitle: emet のトラッカーとランディング
sourceHash: da19ec4cf50e7084
---

チケットの置き場所、ウェーブがランディングする仕組み、ウェーブの連鎖について説明します。ここで挙げるキーはすべて[設定リファレンス](../reference/configuration.md)に、サブコマンドはすべて [CLI リファレンス](../reference/cli.md)にあります。

<img src="../brand/mascot/mascot-work.svg" alt="emet のマスコット、作業中" width="96" align="right">

## トラッカー

emet は Linear、GitHub Issues、ローカルファイルに対応しており、`tracker.kind` で設定します。`github` トラッカーには `gh` が必要です。`linear` トラッカーには、Linear MCP サーバーを `.mcp.json`（またはユーザースコープ）で宣言しておく必要があります。[依存関係リファレンス](../reference/dependencies.md)を参照してください。

### ローカルトラッカー

`tracker.kind: "local"` の場合、スペックとチケットはメインワークツリーの `.scratch/` 配下（バージョン管理されません）にある Markdown ファイルです。`.scratch/<slug>/spec.md` と `.scratch/<slug>/issues/<NN>-<slug>.md` で、それぞれ `Status:` 行と `Blocked by:` 行を持ち、コメントは `## Comments` の下に置きます。コーディネーターは `emet tracker`（`create-spec`、`create-ticket`、`read`、`frontier`、`set-state`、`comment`、`close`）を通じてこれらを読み書きします。`emet init --tracker local` でこの構成を設定できます。[ADR-0011](../adr/0011-local-tracker-scratch-convention.md) を参照してください。

## ランディング

`landing.mode` は `"pr"`（既定）または `"merge"` で、トラッカーとは独立しています。`merge` モードでは、ウェーブは `emet land` によるトランクへの 1 回のローカルマージとしてランディングし、CI の代わりに `commands.selfCheck` を使い、プッシュは行いません。`gh` が必要なのは、トラッカーが `github` の場合か、ランディングが `pr` の場合だけです。[ADR-0010](../adr/0010-local-merge-landing.md) を参照してください。

`landing.unit` は、何を 1 つのまとまりとしてランディングするかを選びます。`"spec"`（既定）はスペック全体を一度にランディングし、`"wave"` は各ウェーブを単独でランディングする従来のルールを維持します。[ADR-0037](../adr/0037-landing-per-spec.md) を参照してください。これは [ADR-0004](../adr/0004-one-wave-one-dependency-layer-one-pr.md) を置き換えます。

### スペックブランチ

`landing.unit: "spec"` では、コーディネーターが `emet spec-branch ensure --spec <id>` でトランクから `spec/<id>` を作成します。ウェーブがレビューと `commands.selfCheck` を通過すると、`emet spec-branch integrate` が `--no-ff` でウェーブのブランチを `spec/<id>` にマージし、`Emet-Wave` と `Emet-Tickets` のトレーラーを付けたコミットを作ります。ブランチが `spec/<id>` に入っているチケットは **Landed** ではなく **Integrated** です。次のウェーブのフロンティアではクローズ済みのブロッカーとして数えられますが、トラッカーでは最終ランディングまで開いたままです。後続のウェーブは `spec/<id>` の先端から分岐するため、PR の CI を待つウェーブはありません。

`emet spec-branch sync` はトランクを `spec/<id>` にマージし、リベースは行いません。競合した場合は中断し、ブランチを変更せずに残して、ゼロ以外の終了コードで終了します。`emet spec-branch land` は同期を実行してから、ブランチを 1 回だけランディングします。`pr` モードでは `spec/<id>` をプッシュし、統合済みの全ウェーブのチケットにつき 1 行の `Closes #N` を入れた PR を 1 つ開き、そのチェックを待って、`landing.specMergeMethod`（既定ではマージコミットで、`pr.mergeMethod` は無視）でマージします。`merge` モードでは `spec/<id>` を `--no-ff` でローカルのトランクにマージし、プッシュは行いません。`--partial` は、それまでに統合されたウェーブだけをランディングします。`emet spec-branch abandon --spec <id> --force` はブランチに `abandoned/spec-<id>` のタグを付けて削除し、ローカルトラッカーの統合済みチケットを `ready-for-agent` に戻します。

スペックモードでは、ワーカーのワークツリーがスペックブランチから始まるよう、Claude Code の設定で `worktree.baseRef: "head"` が必要です。`emet preflight` と `emet doctor` がこれを確認します。また `emet doctor` は、モードが `pr` で、リポジトリの設定またはトランクのルールセットが設定済みの `landing.specMergeMethod` を許可していない場合に警告します。

### PR によるランディング

`landing.unit: "spec"` では PR はスペックのものです。最終ウェーブの後に `emet spec-branch land` が開く、統合済みの全ウェーブをまとめた 1 つの PR です。`landing.unit: "wave"` では、1 つのウェーブは 1 つの PR です。本文には各チケットにつき 1 行の `Closes #N`（トラッカーのクローズ用キーワード）が入り、コーディネーターは PR を開く際にチケットをレビュー中に移します。その後、PR は `pr.autoMerge` に従ってマージされます。ウェーブにフラグが立っている場合、`autoMerge` が `false` の場合、または CI の修正回数を使い切った場合は、PR は開いたままになります（その場合、PR には人間の判断が必要であることを示すラベルが付きます）。マージ後は、GitHub トラッカーでは `emet tracker close` がチケットをクローズし、`emet cleanup --run <runId>` がウェーブのブランチ、チケットのクレーム、ワーカースロットを解放します。また、PR がブランチの先端コミットでマージされたローカルブランチを、統合ブランチも含めて削除します。

ウェーブのブランチがまとめてマージされた後、`commands.fullSuite` が統合ブランチで 1 回実行されます。失敗すると、PR と `autoChain` がブロックされます。ゲートはその結果を `--integration` として受け取ります。スペックランディングの最終ではないウェーブでは、コーディネーターは `commands.selfCheck` の結果を `--ci` として渡し、`emet ci --wait` で CI を待つのは最終のランディングだけです。その場合、ウェーブが残っている間、ゲートは `chain` と答えます。

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
- `handoff.autoChain`（既定は `false`）: クリーンでマージ済みのウェーブの後にまだウェーブが残っている場合、`/emet:run --dispatch <spec-id>` を表示する代わりに、`claude --bg` で次のウェーブを起動します。`claude agents` / `claude attach emet-<spec-id>-w<n>` で確認できます。Claude Code での要件:
  1. `claude` が PATH にあり、`--bg` に対応していること。
  2. 信頼されたワークスペースであること。`--bg` は非対話で実行されるため、信頼ダイアログは表示されません。リポジトリで一度 `claude` を対話的に開き、承認してください。
  3. 対話セッションでバイパスの警告を一度承認していること（`skipDangerousModePermissionPrompt`）。次のウェーブは、起動元のセッションのモードではなく、`handoff.permissionMode`（後述）で動作するためです。

  Codex ホストでは、次のウェーブは代わりに切り離された `codex exec` として起動します（後述の `handoff.launcher` を参照）。そのため要件は、`codex` が PATH にあり、`codex.minVersion` 以上であること、そして `codex exec` に `--json` と `--output-schema` があることです。`emet doctor` が確認するのはフラグであり、バージョン番号ではありません。Claude の信頼ダイアログとバイパスの警告は適用されません。切り離された実行に Codex が信頼されたワークスペースを必要とするかどうかは、このリポジトリのドキュメントでは未検証です。

  起動するのは、PR がマージされ、フラグが立っているものがない場合だけで、`emet-<spec-id>-*` セッションがすでに動作中（`claude agents --json`）であればスキップします。起動に失敗した場合は、`/emet:run --dispatch <spec-id>` を表示する動作にフォールバックします。

- `handoff.launcher`（既定は `auto`）: `claude attach` を実行する Orca タブでもウェーブを開きます。`auto` は Orca ランタイム（`orca status`）に問い合わせるため、`TERM_PROGRAM` のない `claude --bg` セッションからも動作します。`orca` は常に試行し、`bg` は一切試行しません。`launcher` は Claude Code ホストにのみ適用されます。Codex では `emet launch` は常に `bg` として動作します。どちらの場合もウェーブはバックグラウンドで動作し、タブを開けなくてもチェーンが止まることはありません。

  `emet launch <spec-id> --wave <n>` は起動の全体（重複セッションの確認、`claude --bg`、タブ）を行い、`{ name, id, attach, orcaTab: { opened, reason } }` を出力します。別のセッションで手動でウェーブを動かしたいときは、素の `claude --bg` ではなくこちらを使ってください。

  Codex のエージェントホストでは、`emet launch` は `$emet:run --dispatch <spec-id>` を実行する切り離された `codex exec` を起動し、そのスレッド ID を記録します。Orca タブは開かず、`codex exec resume <id>` でセッションを再開できます。[CLI リファレンス](../reference/cli.md#codex-ホスト)と [Codex で emet を実行する](codex.md)を参照してください。

- `handoff.permissionMode`（既定は `bypassPermissions`）: Claude Code のみです。チェーンされたセッションの権限モードです。Codex ホストでは無視され、チェーンされたセッションは `codex.sandbox`（既定は `danger-full-access`。[Codex で emet を実行する](codex.md)を参照）を使います。起動元のセッションからは継承されません。`auto` モードの分類器が `gh pr merge` のようなステップを拒否し、ウェーブが中途半端な状態で終わるおそれがあるためです。`permissions.deny` のルールは引き続き適用されますが、バイパスの警告を対話的に一度承認しておく必要があります（`skipDangerousModePermissionPrompt`）。

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

**生きたスペック。** `specs.enabled` でオプトインします。スペックの最後のウェーブで、そのレビューの前に、コーディネーターがスペックの要件の差分を書き、`emet spec-merge --spec <id>` を一度実行して `docs/specs/<area>.md`（`specs.dir`）にマージし、その結果をコミットします。そのためレビューを受け、同じ PR でランディングします。何かを書き込む前にすべてのエリアを確認します。競合がある場合や、シナリオが失われる要件がある場合は、終了コード 1 で終了し、どのファイルにも手を加えません。コーディネーターは一度だけ再試行し、それでもだめなら更新なしでランディングして、その旨を知らせます。

**コードベースマップ。** `emet map` は、既存のコードベースの概要（スタック、構造、規約、テスト、ホットスポット）を `docs/agents/codebase.md`（`map.path`）に書き出し、作成元のコミット SHA を刻印します。同じコミットからは常に同じファイルが生成されます。`emet map --stale` は、HEAD が刻印より先に進むと終了コード 1 で終了し、その場合 `emet preflight` は警告します。`emet map --for <globs>` は、チケットの編集対象に一致するセクションだけを出力します。その出力が、ワーカーのブリーフに含まれるマップの唯一の部分です。

**メトリクス。** `emet metrics --run <id>` は、セッションのトランスクリプトから、チケットごと、ウェーブごと、実行ごとのトークン、API 換算コスト、経過時間を報告します。また、チケットごとに見積もったコンテキスト予算と、各ワーカーが実際に使った量も比較します。その要約は、実行の最終レポートの末尾に入ります。
