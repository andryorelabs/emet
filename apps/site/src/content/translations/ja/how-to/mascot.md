---
title: emet マスコットを使う（Claude Code のモッドと Orca のペット）
description: モッドで Claude Code に、ペットで Orca に emet のマスコットを表示します。
seoTitle: Claude Code と Orca での emet マスコット
sourceHash: caca9eb66e693e32
---

Claude Code と Orca で emet の **Mascot** を表示する方法です。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。

独立した 2 つの要素があります。Claude Code にマスコットを描画する任意の `emet-mascot` プラグインと、Orca に同じキャラクターを表示するための Orca ペットのバンドルです。

## マスコットプラグインをインストールする

このプラグインは emet と同じマーケットプレイスで提供されており、任意です。emet はこれを必要としません。

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet-mascot@emet-marketplace
```

マスコットはセッションの状態（眠っている、作業中、待機中、完了、エラー）に合わせて変化します。**Run** がアクティブな間は、**Phase file** も読み取り、`emet · wave 2 · review` のような薄いラベルを表示します。

プラグインのオプション:

- `position`: `pane`（既定）、`band`、`status` のいずれか。`pane` はマスコットをトランスクリプトの横にドッキングします。これにはフルスクリーンレイアウトが必要で、自分でペインを一度開くまでは、ターミナルの幅が 144 列以上必要です（その後は約 110 列）。ドッキングできない場合や、後でターミナルが狭くなった場合は、代わりにプロンプトの上にマスコットが表示されます。`band` は常にプロンプトの上に描画します。`status` は、マスコットの絵なしで、テキストラベルだけをプラグインのステータスラインとして表示します。
- `size`: `small`（16 x 8 セル、既定）または `medium`（24 x 12 セル）。
- `showLabel`: マスコットの横のラベルを表示するか非表示にするか（既定は表示）。

## マスコットプラグインを更新する

Anthropic 以外のマーケットプレイスは、既定では自動更新がオフで、マーケットプレイス側からユーザーに対してオンにすることはできません。手動で更新してください。

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

その後、Claude Code を再起動してください。自動で更新するには、`/plugin` を実行し、**Marketplaces** タブを開いて `emet-marketplace` を選び、**Enable auto-update** を選択します。これは各ユーザーが自分のマシンで一度だけ行います。メインのプラグインについても、[emet を更新する](update-emet.md)を参照してください。

## フェーズファイル

emet CLI は、実行が進むにつれてリポジトリ内の `.emet/phase.json` を書き込み、マスコットは約 2 秒ごとにそれをポーリングします。新鮮さの期限より古いファイルは無視されるため、クラッシュした実行が古いラベルを残すことはありません。

このファイルには、`phase`（`planning`、`dispatch`、`working`、`review`、`checking`、`landing`、`done`、`failed` のいずれか）、`wave`、`spec`、`runId`、`updatedAt`、および任意の `outcome` が含まれます。書き込みに失敗しても、フェーズを報告したサブコマンドが失敗することはありません。

## Orca でペットを使う

ペットのバンドルは `docs/brand/pet/emet/` にあり、`pet.json` と `spritesheet.webp` で構成されます。Orca の設定で「Import .codex-pet bundle…」を選び、そのフォルダーを指定してください。インポートには、Orca アプリが動作するマシンに `docs/brand/pet/emet/` が必要なため、Orca がこのリポジトリとは別の場所で動作している場合は、そこへフォルダーをコピーしてください。マスコットの SVG を変更した後は `bun run brand:export` で再生成し、その結果をコミットします。

## トラブルシューティング

- マスコットが表示されない: `claude plugin list` を実行し、`emet-mascot` が有効になっていることを確認してから、Claude Code を再起動してください。
- ラベルが表示されない: `.emet/phase.json` が存在し、最近更新されていることを確認してください。
