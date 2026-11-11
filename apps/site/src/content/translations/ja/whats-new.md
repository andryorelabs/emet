---
title: 新機能
description: emet のリリースノート。各バージョンでの変更点をまとめています。
seoTitle: "emet の新機能: リリースノート"
sourceHash: cc2e3db248e1bdc0
---

## 0.8.0

2026-11-11

### 追加

- `emet cleanup` は、すべてのモードで、プルリクエストがブランチの先端コミットでマージされたローカルブランチを、それを保持するクリーンでロックされていないエージェントのワークツリーとともに削除します。統合ブランチ、リリースブランチ、修正ブランチを手動で削除する必要はなくなりました。
- `bun run translations:status` は、ソースより遅れている Website の翻訳を一覧表示します。

### 変更

- ガードがブランチの強制削除を拒否するときのメッセージが `emet cleanup` を案内します。
- リリースのランブックが `whats-new` の翻訳を扱うようになりました。

## 0.7.0

2026-11-11

### 追加

- Website が設定スキーマを `https://emet.andryore.dev/schema/emet.config.schema.json` で配信するようになりました。
- `docs/development.md` と `docs/security.md`。
- workspace ごとのカバレッジ下限。`bun run test` がこれを強制します。

### 変更

- `emet init` は、ローカルパスではなく公開された `$schema` の URL を `emet.config.json` に書き込みます。
- リリースタグは署名され、タグに対応する CHANGELOG のセクションが存在しないか空の場合、Release ワークフローは失敗します。
- リポジトリは andryorelabs 標準 v1 に従います。コードとしての ruleset、コミュニティファイル、README の構成、標準のスクリプト名（`format:write`、`lint:commits`）です。

## 0.6.1

2026-11-10

### 修正

- 同じ古いロックを同時に回収する 2 つのプロセスが、両方とも臨界区間に入ることはなくなりました。claim、Mailbox、tracker、`acquireLock` は保護された 1 つの回収処理を共有します。
- `emet tracker create-ticket` を同時に呼び出しても、断続的に失敗することはなくなりました。

## 0.6.0

2026-11-10

### 追加

- Codex worker 向けの Mailbox: `emet ask` が質問を記録し(`--wait` で返信をポーリング)、`emet inbox` が未解決の質問を一覧し、`emet reply` が質問に回答します。これにより worker は引き継ぎメモ経由でエスカレーションする必要がなくなります。
- `emet dispatch --wait` は、稼働中の worker に未解決の質問がある間 `question <ticket> <id>` を出力し、その worker を停止状態と判定することはありません。
- `emet claims --reserve` はチケットの編集対象を保存し、他の実行の編集対象と重なる予約を拒否します。

### 修正

- `emet dispatch --wait` は、`emet results --write` が結果を書き込む git-common-dir の実行ディレクトリから結果を読み取ります。

## 0.5.2

2026-11-10

### 変更

- 非提携の注記に、Anthropic に加えて OpenAI も明記しました。
- トップページのインストールタブを Claude Code と表記し、実行コマンドに `$emet:run` の Codex タブを追加しました。
- ガイドで、各手順が Claude Code と Codex のどちらの Agent host 向けかを明示しました。

### 修正

- Codex ホストで、`emet doctor`、`emet init`、`emet dependencies`、`emet preflight` が Claude Code 専用の案内を出さなくなりました。
- `emet init --force` が、既存の設定の `agentHost` と `codex` セクションを保持します。

## 0.5.1

2026-11-10

### 変更

- README、ランディング、バナー、ガイド、共有画像で、Claude Code と並んで Codex を明記しました。

## 0.5.0

2026-11-10

### 追加

- Website のホームページ: 描き下ろしのヒーロー、仕組み、機能、概要、締めのパネル、
  ヘッダー、フッター。英語の文字列は `apps/site/src/i18n/ui/en.ts` にあります。
- `/docs/` の Website ドキュメント: リポジトリのドキュメントの許可リストとこの
  変更履歴から作られる Starlight ページ。Pagefind 検索、サイトページまたは GitHub への
  リンク書き換え、翻訳がない、または古い場合の英語フォールバック通知を備えます。
- `docs/how-to/update-emet.md`: プラグインの更新方法と、マーケットプレイスの
  自動更新を有効にする方法。
- Agent ホストとしての Codex: `emet.config.json` の `agentHost`。`emet dispatch` と
  `emet review-run` は各ワーカーとレビュアーを `codex exec` プロセスとして起動します。
  `$emet:run`、`$emet:init`、`$emet:doctor` スキル、Codex プラグインのマニフェスト、
  オプトインのエンドツーエンドテスト（`EMET_CODEX_E2E=1`）も加わりました。
- `docs/guide/codex.md`: Website で公開される Codex ガイド。

### 変更

- Codex の `codex.sandbox` の既定値は `danger-full-access` です（`workspace-write` も
  引き続き指定できます）。`emet dispatch`、`emet review-run`、Codex の `emet launch` が
  これを渡し、Codex 上の `emet guard` はすべての push 形式を拒否します。
- 実行ごとの Codex オーバーレイは、あなたの `config.toml` をリンクする代わりに、
  独自の最小限の `config.toml` を書き出します。そのルールは `-C` 形式と調整用の
  サブコマンドを許可し、push は引き続き禁止です。
- Codex ワーカーは pid ではなく `threadId` と JSONL パスで識別されます。
- Codex ガイドに実際の Codex での結果を記載しました。以前の `failed` 行はすべて
  `verified` になり、`unverified` の一覧は無人での監督のみに縮小され、プローブレポートに
  残りのフォローアップが載っています。

### 修正

- `emet cleanup` が、マージ済みで所有者のいない worktree を回収するようになりました。
- Codex の Agent ホストが既定で解決されるようになり、`emet preflight`、`doctor`、
  `cleanup`、`status`、`usage` が `agentHost: "codex"` を受け付けます。
- Codex のモデル解決は、実行ホームまたは実際の Codex ホームから `models_cache.json` を
  読み込みます。

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
