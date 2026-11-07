---
title: emet を更新する
description: インストール済みの emet を新しいリリースに更新し、プラグインのマーケットプレイス自動更新を有効にします。
seoTitle: emet を更新する
sourceHash: 22d272d767c29646
---

インストール済みの emet を新しいリリースに移行する方法です。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。

emet と任意の `emet-mascot` プラグインは、同じマーケットプレイス `emet-marketplace` から提供されます。Claude Code は既定ではサードパーティのマーケットプレイスを自動では更新せず、マーケットプレイス側からその既定値をユーザーに対して変更することもできません。

## 手動で更新する

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

マスコットをインストールしていない場合は、最後の行を省略してください。その後、Claude Code を再起動するか、`/reload-plugins` を実行します。`claude plugin list` でインストール済みのバージョンを確認でき、最新のバージョンは [CHANGELOG.md](../../CHANGELOG.md) にあります。

## 自動で更新する

Claude Code で `/plugin` を実行し、**Marketplaces** タブを開いて `emet-marketplace` を選び、**Enable auto-update** を選択します。すると Claude Code は、セッションの開始時にマーケットプレイスを更新して両方のプラグインを更新し、次のセッションで新しいバージョンが読み込まれます。この設定は、ユーザーが各自のマシンで行います。

## install.sh でインストールした場合

クローンで最新の `main` をプルし、`./install.sh` をもう一度実行してください。
