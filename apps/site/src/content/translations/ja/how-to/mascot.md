---
title: emet マスコットを使う（Claude Code のモッドと Orca のペット）
description: モッドで Claude Code に、ペットで Orca に emet のマスコットを表示します。
seoTitle: Claude Code と Orca での emet マスコット
sourceHash: a6d2945308d1d44b
---

Claude Code と Orca で emet の **Mascot** を表示します。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。

独立した 2 つの要素があります。Claude Code にマスコットを描画する任意の `emet-mascot` プラグインと、Orca に同じキャラクターを表示するための Orca ペットのバンドルです。emet はどちらも必要としません。

## 前提条件

- プラグインには Claude Code が必要です。
- emet がインストール済みで、実行がマスコットの参照するフェーズファイルを書き込むこと。[インストール](../start/install.md)を参照してください。
- ペットには Orca が必要です。インポートには、Orca アプリが動作するマシン上に `docs/brand/pet/emet/` フォルダーが必要です。

## マスコットプラグインをインストールする

:::steps

1. マーケットプレイスを追加してプラグインをインストールします。

   ```bash
   claude plugin marketplace add andryorelabs/emet
   claude plugin install emet-mascot@emet-marketplace
   ```

2. Claude Code を再起動します。マスコットはセッションに合わせて動きます（スリープ、作業中、待機中、完了、エラー）。**Run** がアクティブな間は、フェーズファイルも読み取り、`emet · wave 2 · review` のような薄いラベルを表示します。
3. 必要に応じて、プラグインのオプションを設定します。
   - `position`: `pane`（既定）、`band`、`status`。`pane` はマスコットをトランスクリプトの横にドックします。自分で一度ペインを開くまでは、フルスクリーンレイアウトと幅 144 桁以上のターミナルが必要です（その後は約 110 桁）。ドックできない場合は、プロンプトの上に表示されます。`band` は常にプロンプトの上に描画します。`status` はテキストのラベルだけをステータスラインとして表示します。
   - `size`: `small`（16 x 8 セル、既定）または `medium`（24 x 12 セル）。
   - `showLabel`: ラベルの表示と非表示を切り替えます（既定はオン）。

:::

## マスコットプラグインを更新する

Anthropic 以外のマーケットプレイスは自動更新が既定でオフなので、手動で更新するか、一度だけオンにします。

:::steps

1. マーケットプレイスとプラグインを更新します。

   ```bash
   claude plugin marketplace update emet-marketplace
   claude plugin update emet-mascot@emet-marketplace
   ```

2. Claude Code を再起動します。
3. 自動で更新するには、`/plugin` を実行して **Marketplaces** タブを開き、`emet-marketplace` を選んで **Enable auto-update** を選択します。各ユーザーが自分のマシンで一度だけ行います。メインのプラグインについては [emet を更新する](update-emet.md)を参照してください。

:::

## Orca でペットを使う

:::steps

1. Orca が動作するマシン上に `docs/brand/pet/emet/`（`pet.json` と `spritesheet.webp`）があることを確認します。Orca がこのリポジトリとは別の場所で動作している場合は、そこへフォルダーをコピーします。
2. Orca の設定で "Import .codex-pet bundle…" を選び、そのフォルダーを指定します。
3. マスコットの SVG を変更した後は、`bun run brand:export` でバンドルを再生成し、その結果をコミットします。

:::

## 確認

:::steps

1. `claude plugin list` を実行して `emet-mascot` が有効であることを確認します。マスコットが表示されない場合は、Claude Code を再起動します。
2. 実行中に、`.emet/phase.json` が存在し、直近数秒以内に更新されていることを確認します。マスコットは約 2 秒ごとにこれをポーリングし、鮮度の期限より古いファイルは無視するため、クラッシュした実行が古いラベルを残すことはありません。ファイルには `phase`（`planning`、`dispatch`、`working`、`review`、`checking`、`landing`、`done`、`failed` のいずれか）、`wave`、`spec`、`runId`、`updatedAt`、そして任意の `outcome` が入っています。
3. Orca で、emet のペットがペットの一覧に表示されることを確認します。

:::
