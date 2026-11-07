---
title: 新機能
description: emet のリリースノート。各バージョンでの変更点をまとめています。
seoTitle: "emet の新機能: リリースノート"
sourceHash: a633f8ebdf12e2a7
---

## 0.4.0

2026-11-06

### 追加

- `emet-mascot` の `position` オプション（`pane`、`band`、`status`）。`pane` が
  既定で、ドッキングできない場合はバンドにフォールバックします。
- README に「Mascot (optional)」セクションを追加。

### 変更

- `emet-mascot` のフレームは、リサイズでぼかされる代わりに 6 つのマスコットカラーに
  スナップされるため、ターミナル上でピクセルアートが鮮明に表示されます。
- `emet-mascot` 0.2.0: 既定の `size` が `small` になりました。
- `docs/how-to/orca-pet.md` は `docs/how-to/mascot.md` になり、モッドと Orca の
  ペットの両方を扱います。

## 0.3.0

2026-11-05

### 追加

- プラグインコマンド `/emet:init` と `/emet:doctor` は、Claude Code 内で `emet init` と
  `emet doctor .` を実行し、結果を要約します。
- `emet doctor` は、`~/.claude/settings.json` 内の、バイナリがもう存在しない
  `forge guard` および `emet guard` フックを警告し、それらを削除するための
  バックアップ後に `jq` を使うコマンドを出力します。ファイル自体は編集しません。
- マスコットの基盤: フェーズファイル、ペットバンドル、モッドのステートマシン、
  残りのフェーズ書き込み処理、ラスターフレーム。
- `emet-mascot`: プロンプトの上にピクセルマスコットを表示し、セッションと `emet` 実行の
  フェーズを反映する任意のプラグインです。マーケットプレイスに掲載されており、
  Orca ペット向けのハウツーと ADR-0016 が付属します。

### 修正

- プラグインが、壊れた重複コマンド `/emet:emet` を公開しなくなりました。
  `commands/` は `run.md`、`init.md`、`doctor.md` に固定されています。
- 次のウェーブは、プラグインが登録するコマンドである `/emet:run` で起動されるように
  なりました。

### 変更

- リポジトリを GitHub の `andryorelabs` 組織に移動しました。リリースのダウンロード、
  README のバッジ、クローン URL は `andryorelabs/emet` を指すようになりました。
  旧 `AndryOre/emet` の URL は引き続きリダイレクトされます。
- スタンドアロンのインストールでは、プラグインに合わせて `/emet` が `/emet:run` に
  名前変更されます。`install.sh` は `commands/run.md`、`init.md`、`doctor.md` を
  `~/.claude/commands/emet/` にインストールするようになり、プラグインなしでも
  `/emet:run`、`/emet:init`、`/emet:doctor` が使えます。旧 `~/.claude/commands/emet.md` は
  未編集であれば削除され、編集済みのコピーは保持されてインストールの要約に
  記載されます。

## 0.2.0

2026-11-05

### 変更

- プロジェクト名を claude-forge から emet に変更しました。CLI は `emet`、
  コマンドは `/emet`、エージェントは `emet-worker` と `emet-reviewer` で、
  README も新しいブランドになっています。既存のインストールとリポジトリは
  引き続き動作します。旧名称（`forge.config.json`、`.forge/`、
  `docs/agents/forge.md`、`FORGE_*`）は通知付きで引き続き読み取られ、
  `emet migrate` がリポジトリを新しい名前に移行します。

### 追加

- `install.sh` が Bun なしで動作します。スタンドアロンバイナリのシムを
  `~/.local/bin/emet` としてインストールし、コピーするプロンプト内のプラグインの
  プレースホルダーを書き換え、`commands/run.md` を `~/.claude/commands/emet.md` として
  インストールし、`sha256sum` の代わりに `shasum -a 256` を受け付けます。
- README に実際の要件、2 つのインストール方法、そして
  `/setup-matt-pocock-skills` の後に `emet init` を実行する順序を記載しました。
- エージェントガイド（`AGENTS.md`）、ドメイン用語集（`GLOSSARY.md`）、
  `docs/adr/` 配下のアーキテクチャ決定記録。
- `.scratch/` の規約に基づくローカル Markdown トラッカー。`emet tracker` CLI
  （`create-spec`、`create-ticket`、`frontier`、`set-state`、`comment`、`close`）と、
  ローカルに対応した `emet validate`、`preflight`、`doctor` を備えます。
- `landing.mode`（`pr` または `merge`）と `emet land`。ウェーブを PR なしの
  1 回のローカルマージとしてランディングします。`merge` モードでは `emet cleanup` と
  `emet status` がローカルのトランクと比較します。
- スタンドアロンの `emet` バイナリ、`emet --version`、CI とプロセスツリー、
  メモリブレーキでの macOS 対応、`bin/emet` シムを含むプラグインマニフェスト。
- `emet skill-path` によるスキルの契約と、スキル、用語集、非推奨、二重インストールを
  対象とする拡充された `emet doctor`。
- JS、Go、Rust、Python のリポジトリに対応した、言語に依存しない `emet init` と
  `emet map`。
- ADR-0007 から ADR-0011。
- ドキュメント索引、アーキテクチャのコードマップ、症状別のトラブルシューティング、
  より充実した PR テンプレート、実行時専用のルールを記した `emet/AGENTS.md`。

### 変更

- `gh` が必要なのは、`tracker.kind` が `github` の場合、または `landing.mode` が
  `pr` の場合だけになりました。
- `emet init` は、既定ではローカルトラッカーを選択しなくなりました。
- ADR-0004 を改訂: ウェーブは 1 つの PR または 1 回のローカルマージとして
  ランディングします。

## 0.1.0

2026-11-03

### 追加

- グローバルな `/forge` コマンド: インタビュー、スペック、チケット、1 回の承認の後、
  並列のワークツリーエージェントが機能を無人で実装、テスト、マージします。
- `init`、`doctor`、`preflight`、`selftest`、クレーム、スロット、ゲート、
  ハンドオフチェック、結果、メトリクスの各サブコマンドを備えた `forge` CLI。
- `forge-worker` エージェントと `forge-reviewer` エージェント。
- Linear と GitHub Issues のトラッカー。
- `forge.config.json` によるリポジトリごとの設定。
- CLI、コマンド、エージェントをインストールする `install.sh`。
