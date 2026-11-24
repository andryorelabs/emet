---
title: トラッカーとランディング
description: チケットの置き場所、スペックのランディング方法、ウェーブを連鎖させるかどうかを選びます。
seoTitle: emet のトラッカーとランディング
sourceHash: c79d8a04687b4620
---

チケットの置き場所、スペックのランディング方法、ウェーブを連鎖させるかどうかを選びます。ここで挙げるすべてのキーは[設定リファレンス](../reference/configuration.md)に、すべてのサブコマンドは [CLI リファレンス](../reference/cli.md)にあります。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。

<img src="../brand/mascot/mascot-work.svg" alt="emet mascot, working" width="96" align="right">

## 前提条件

- emet がインストール済みで、`emet.config.json` があるリポジトリ。ない場合は `emet init` を実行します。
- `github` トラッカーまたは `pr` ランディングの場合: `PATH` 上の `gh` が認証済みであること。
- `linear` トラッカーの場合: `.mcp.json`（またはユーザースコープ）で宣言された Linear MCP サーバー。[依存関係リファレンス](../reference/dependencies.md)を参照してください。
- これらの設定が何を変えるのかを理解するには、[ランディング](../concepts/landing.md)と[実行、ウェーブ、スペック](../concepts/runs-waves-specs.md)を読んでください。

## トラッカーを選ぶ

:::steps

1. `emet.config.json` の `tracker.kind` を `"linear"`、`"github"`、`"local"` のいずれかに設定します。
2. ローカルトラッカーの場合は、`emet init --tracker local` を実行します。スペックとチケットは、メインのワークツリーの `.scratch/`（バージョン管理されません）にある Markdown ファイルになります。`.scratch/<slug>/spec.md` と `.scratch/<slug>/issues/<NN>-<slug>.md` で、それぞれ `Status:` と `Blocked by:` の行を持ち、コメントは `## Comments` の下に置かれます。コーディネーターは `emet tracker` を通じてこれらを読み書きします。[ADR-0011](../adr/0011-local-tracker-scratch-convention.md) を参照してください。
3. ほかの種類の場合は、上の対応する前提条件を確認します。

:::

## スペックのランディング方法を選ぶ

:::steps

1. `landing.mode` を `"pr"`（既定）または `"merge"` に設定します。`merge` モードでは、スペックはトランクへの 1 回のローカルマージとしてランディングします（`emet spec-branch land`、または `landing.unit: "wave"` ではウェーブごとに `emet land`）。`commands.selfCheck` が CI の代わりになり、何もプッシュされません。[ADR-0010](../adr/0010-local-merge-landing.md) を参照してください。
2. `landing.unit` を `"spec"`（既定、スペック全体が 1 つとしてランディング）または `"wave"`（各ウェーブが単独でランディング）に設定します。[ADR-0037](../adr/0037-landing-per-spec.md) を参照してください。
3. `landing.unit: "spec"` の場合は、Claude Code の設定で `worktree.baseRef: "head"` を設定し、ワーカーのワークツリーが `spec/<id>` ブランチから始まるようにします。`emet preflight` と `emet doctor` がこれを確認します。
4. `pr` モードでは、`landing.specMergeMethod`（既定はマージコミット）を、リポジトリの設定とトランクのルールセットが許可する方法に設定します。許可されない場合、`emet doctor` が警告します。
5. マージを制御するには、`pr.autoMerge`（既定は `true`）と `pr.maxCiFixAttempts` を設定します。`pr.mergeMethod` は `landing.unit: "wave"` の場合にのみ設定してください。スペックのプルリクエストは手順 4 の `landing.specMergeMethod` を使い、これを無視します。何かがフラグされたウェーブは、自動マージされません。

:::

スペックブランチのコマンド（`emet spec-branch ensure`、`integrate`、`sync`、`land`、`abandon`）はコーディネーターが実行します。そのフラグは [CLI リファレンス](../reference/cli.md)にあります。

## ウェーブを連鎖させる

後続のウェーブは独自のセッションで実行されます。連鎖は既定でオフです。

:::steps

1. `emet.config.json` の `handoff` セクションを設定します。

   ```json
   {
     "handoff": {
       "autoChain": true,
       "launcher": "auto",
       "permissionMode": "bypassPermissions"
     }
   }
   ```

2. Claude Code では、`claude` が `--bg` に対応した状態で `PATH` 上にあること、ワークスペースが信頼されていること（リポジトリで `claude` を対話的に一度開いて承認します）、そしてバイパスの警告が対話セッションで一度承認されていること（`skipDangerousModePermissionPrompt`）を確認します。
3. Codex では、`codex` が `codex.minVersion` 以上で `PATH` 上にあり、`codex exec` に `--json` と `--output-schema` があることを確認します。次のウェーブは切り離された `codex exec` として開始されます。[Codex で emet を実行する](use-codex.md)を参照してください。
4. `handoff.launcher`（Claude Code のみ）を `auto`、`orca`、`bg` のいずれかに設定して、ウェーブが Orca のタブも開くかどうかを選びます。`permissionMode` は Claude Code のみです。Codex では、連鎖したセッションは `codex.sandbox` を使います。
5. 別のセッションで手動でウェーブを開始するには、素の `claude --bg` ではなく `emet launch <spec-id> --wave <n>` を実行します。`{ name, id, attach, orcaTab: { opened, reason } }` を出力します。

:::

連鎖は、PR がマージされ、何もフラグされていない場合にのみ起動し、`emet-<spec-id>-*` セッションがすでに稼働している場合はスキップし、起動に失敗した場合は `/emet:run --dispatch <spec-id>` を出力する方法にフォールバックします。連鎖したウェーブは `claude agents` または `claude attach emet-<spec-id>-w<n>` で確認できます。

## 予算と任意の機能を設定する

:::steps

1. 既定値が合わない場合は、`budgets` セクションを設定します。

   ```json
   { "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
   ```

   `workerAttempts` は、チケットが `verify` に失敗してから先送りされるまでの回数、`reviewRounds` は、チケットが 1 回のエスカレーションまでに受けるレビューのラウンド数（修正ラウンドには独自の `budgets.fixRounds` があり、既定は 2）、`stallNudgeCap` は、停止したワーカーを促す回数です。[レビューとゲート](../concepts/review-and-gates.md)を参照してください。

2. [生きたスペック](../concepts/living-specs.md)を `docs/specs/`（`specs.dir`）に保持するには、`specs.enabled` を設定します。
3. `emet map` を実行して、コードベースのマップを `docs/agents/codebase.md`（`map.path`）に書き込みます。HEAD がスタンプより先に進むと、`emet map --stale` は終了コード 1 で終了します。
4. 実行の後で `emet metrics --run <id>` を実行すると、チケット、ウェーブ、実行ごとのトークン、コスト、実時間が分かります。

:::

小さな単一チケットの変更には、フルのパイプラインの代わりに `/emet:run --quick <request>` を開始します。これは常にウェーブごとにランディングし、リスクの高い差分では停止します。

## 確認

:::steps

1. `emet preflight` を実行します。`tracker`、`landing`、`pr`、`handoff`、`budgets` の各セクションを検証し、設定が不正な場合は終了コード 2 で終了します。
2. `emet doctor .` を実行し、トラッカー、`gh`、Linear MCP サーバー、ランディング設定を挙げる失敗がないことを確認します。
3. ローカルトラッカーの場合は、`emet tracker frontier --spec <slug>` を実行し、想定どおりのチケットが一覧されることを確認します。

:::
