---
title: 概要
description: emet とは何か、実行で何が行われるか、次にどこへ進むか。
seoTitle: emet の概要
sourceHash: 8627801ad3b7d807
---

emet とは何か、実行で何が行われるか、次にどこへ進むか。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。

<img src="../brand/mascot/mascot-done.svg" alt="emet のマスコット、完了" width="96" align="right">

emet は、Claude Code または Codex CLI の中で、任意の git リポジトリにおいて、Linear、GitHub Issues、ローカルのチケットを使い、機能をアイデアからマージ済みの変更まで運びます。機能を一度説明し、spec とチケットを一度承認すれば、残りは無人で実行されます。

## 実行で行われること

1. `/emet:run`（Codex では `$emet:run`）がインタビューを行い、spec を書きます。
2. spec をチケットに分割し、承認を 1 回求めます。
3. 並列のワーカーが、それぞれ専用の git ワークツリーで各チケットを実装します。
4. レビューが各ウェーブを確認し、CI がグリーンである必要があります。指摘があればマージは止まります。
5. spec は既定では 1 つのプルリクエストとして、またはローカルマージとしてランディングし、次のウェーブが連鎖できます。

## 次のステップ

1. [インストール](install.md): スタンドアロンインストール、更新、自動更新、アンインストール。
2. [初回の実行](first-run.md): インストールを確認し、リポジトリで emet を実行します。
3. [実行、ウェーブ、spec](../concepts/runs-waves-specs.md): 実行の用語。
4. [トラッカーとランディング](../how-to/configure-tracker.md): GitHub、Linear、ローカルのチケットと、spec がどのようにランディングするか。
