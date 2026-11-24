---
title: emet を更新する
description: スタンドアロンの emet を新しいリリースに更新し、自動更新を設定し、プラグインを更新します。
seoTitle: emet を更新する
sourceHash: 380b07ed5a10474f
---

インストール済みの emet を新しいリリースに移行する方法です。用語は [GLOSSARY.md](../../GLOSSARY.md) に従います。

## スタンドアロンインストールを更新する

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

リリースがダウンロードされ、`SHA256SUMS`（`gh` がある場合はアテステーションも）で検証されてステージングされます。シンボリックリンクとインストール済みファイルの切り替えは、ワーカースロットが 1 つも保持されていない場合にのみ行われ、保持されている場合は更新が保留され、次のセッション開始時に適用されます。失敗しても現在のバージョンには手が加えられず、ジャーナルに記録されます。以前のバージョンはロールバック用に保持され、それより古いものは削除されます。更新が保留中の場合、`emet doctor` が警告します。

## 自動で更新する

`SessionStart` フックが `emet self update --auto` を 1 日に最大 1 回、バックグラウンドで実行し、オフラインのときは何も表示しません。無効にするには、`EMET_AUTO_UPDATE=0` を設定するか、次を実行します。

```bash
emet self update --auto off
```

`emet self update --auto on` で再び有効になります。自動更新はプラグインのインストールには何も行いません。

## 任意: プラグイン

emet と任意の `emet-mascot` プラグインは、同じマーケットプレイス `emet-marketplace` から提供されます。Claude Code は既定ではサードパーティのマーケットプレイスを自動では更新せず、マーケットプレイス側からその既定値をユーザーに対して変更することもできません。

### Claude Code

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

マスコットをインストールしていない場合は、最後の行を省略してください。その後、Claude Code を再起動するか、`/reload-plugins` を実行します。`claude plugin list` でインストール済みのバージョンを確認でき、最新のバージョンは [CHANGELOG.md](../../CHANGELOG.md) にあります。

自動で更新するには、Claude Code で `/plugin` を実行し、**Marketplaces** タブを開いて `emet-marketplace` を選び、**Enable auto-update** を選択します。すると Claude Code は、セッションの開始時にマーケットプレイスを更新して両方のプラグインを更新します。この設定は、ユーザーが各自のマシンで行います。

### Codex

マーケットプレイスのスナップショットを更新してから、プラグインをもう一度追加してください。`codex plugin marketplace add` をもう一度実行しても更新されません。

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` で、`emet@emet-marketplace` がインストールされ有効になっているかを確認できます。自動更新は Claude Code の機能です。Codex では手動でアップグレードしてください。
