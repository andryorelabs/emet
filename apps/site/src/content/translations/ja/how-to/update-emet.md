---
title: emet を更新する
description: インストール済みの emet を新しいリリースに更新し、プラグインのマーケットプレイス自動更新を有効にします。
seoTitle: emet を更新する
sourceHash: e9018d796fe23437
---

インストール済みの emet を新しいリリースに移行する方法です。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。

emet と任意の `emet-mascot` プラグインは、同じマーケットプレイス `emet-marketplace` から提供されます。Claude Code は既定ではサードパーティのマーケットプレイスを自動では更新せず、マーケットプレイス側からその既定値をユーザーに対して変更することもできません。

## Claude Code で更新する

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

マスコットをインストールしていない場合は、最後の行を省略してください。その後、Claude Code を再起動するか、`/reload-plugins` を実行します。`claude plugin list` でインストール済みのバージョンを確認でき、最新のバージョンは [CHANGELOG.md](../../CHANGELOG.md) にあります。

## Codex で更新する

マーケットプレイスのスナップショットを更新してから、プラグインをもう一度追加してください。`codex plugin marketplace add` をもう一度実行しても更新されません。

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` で、`emet@emet-marketplace` がインストールされ有効になっているかを確認できます。

## 自動で更新する

自動更新は Claude Code の機能です。Codex では手動でアップグレードしてください。Claude Code で `/plugin` を実行し、**Marketplaces** タブを開いて `emet-marketplace` を選び、**Enable auto-update** を選択します。すると Claude Code は、セッションの開始時にマーケットプレイスを更新して両方のプラグインを更新し、次のセッションで新しいバージョンが読み込まれます。この設定は、ユーザーが各自のマシンで行います。

## install.sh でインストールした場合

クローンで最新の `main` をプルし、`./install.sh` をもう一度実行してください。
