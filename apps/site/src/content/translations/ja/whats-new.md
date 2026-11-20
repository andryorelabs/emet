---
title: 新機能
description: emet のリリースノート。各バージョンでの変更点をまとめています。
seoTitle: "emet の新機能: リリースノート"
sourceHash: faaf5e170bc87a1d
---

## 0.13.0

2026-11-20

### 追加

- `emet setup` が `context7` と `firecrawl-local` の項目を提供します(どちらも既定ではオフ)。`context7` は `ctx7` CLI とその `find-docs` スキルをインストールします。`firecrawl-local` は `cargo` で Firecrawl Local をビルドし、ローカル専用の MCP サーバー(`FIRECRAWL_CLOUD=off`、`--public-only`)として登録します。ADR-0034 を参照してください。
- `emet review-run --browser-verify true|false` が、ブラウザ軸を Codex レビュアーに渡します。
- `emet.config.json` の `validate.coupledSurfaces` と `emet validate` の `coupled-surface-split` エラーにより、ページとその翻訳が同じウェーブに収まります。ADR-0033 を参照してください。

## 0.12.0

2026-11-20

### 追加

- `emet.config.json` の `verify.browser`(`startCommand`、`url`、省略可能な `paths`)を設定すると、そのリポジトリでは `agent-browser` による UI 変更のブラウザー検証が有効になります。設定スキーマとそのパーサーはすべてのフィールドを検証します。
- `emet assess` は `browserVerify: { run, reason }` を出力します。ブラウザー軸が実行されるのは、ウェーブにレビュアーがいて、`verify.browser` が設定されており、`agent-browser` が PATH 上にあり、変更されたパスが `paths` に一致する場合だけです。
- `emet setup` に `agent-browser` 項目(既定ではオフ)が加わり、最新リリースとそのブラウザーをインストールします。
- `verify.browser` を設定しているリポジトリでは、`emet doctor` が agent-browser に関する任意の検出結果を報告します。バイナリーが見つからない場合や `agent-browser doctor` が失敗した場合は、注記または警告であり、終了コードは変わりません。
- レビュアー用プロンプトにブラウザー軸が加わります。これは `browserVerify.run` が true のときだけ埋められます。ワーカー用プロンプトにも、ブラウザー確認用の任意の 1 行が加わります。ADR-0032 を参照してください。

## 0.11.1

2026-11-19

### 修正

- ネイティブ Windows(Git Bash)と、サポート対象外の OS やアーキテクチャでは、`bin/emet` が失敗せず終了コード 0 で終了するようになり、PreToolUse ガードがすべてのツール呼び出しをブロックすることはなくなりました。通知を 1 回表示するのは、セッション開始時のプリフェッチだけです。
- `install.sh` は、何かを書き込む前に `MINGW*`、`MSYS*`、`CYGWIN*` での実行を拒否します。
- Codex のフックに `commandWindows` のオーバーライドが追加され、Windows(PowerShell)上の Codex がイベントのたびにエラーになることはなくなりました。

## 0.11.0

2026-11-19

### 追加

- `emet whats-new` は、更新後に emet を初めて実行したときにリリースノートへのリンクを含む 1 行の通知を表示し、実行中のバージョンを記録します。`--hook` を付けると、セッションフック向けに `systemMessage` JSON オブジェクトとしてその行を出力します。

## 0.10.0

2026-11-19

### 追加

- `handoff.afterSpec` が `{ paths?, mode }` ルールの順序付きリストを受け付けるようになり、CLI とウェブサイトを持つリポジトリで CLI をリリースし、ウェブサイトをプロモートできます。モードは、`develop` のプロモートで `main` に取り込まれるパスから選ばれます。
- `deploy.check.paths` により、デプロイチェックを、指定した glob に触れたプロモートに限定できます。
- `emet promote` が `rule` と `reason` を出力してジャーナルに記録し、`deployCheck: { run, reason }` を出力します。

### 変更

- デプロイチェックは `afterSpec` に依存しなくなりました。トランクが `main` の場合は最終 wave がクリーンに終わった後、`develop` の場合はプロモートがマージされた後に実行されます。コーディネーターは、`afterSpec` が `none` の場合も含め、すべての spec の後に `emet promote` を実行します。

## 0.9.1

2026-11-19

### 修正

- `emet setup` が `--data-dir` を受け付けるようになり、プラグインの SessionStart フックが `unknown flag --data-dir` で失敗しなくなりました。

## 0.9.0

2026-11-19

### 追加

- `emet gate` が修正して継続するポリシーを適用します。保留された wave は、指摘が解消するか `budgets.fixRounds`（既定は 2）を使い切るまで修正ラウンドを実行し、その後停止します。`gate.onHold` で `fix-and-continue`（既定）か `stop` を選びます。`emet review --recheck` は、レビュアーの判定によってのみ指摘を解消します。
- `emet ci --wait` はプルリクエストのチェックをポーリングし、不安定なジョブを再実行して、`pass`、`fail`、`env-fault`、`timeout` のいずれかを報告します。`emet tracker close` は GitHub のチケットを冪等にクローズし、`emet chain` は gate、readiness、launch、verify を 1 ステップで実行します。
- イベントジャーナルが、gate の判断、介入、起動、チケットのクローズ、クリーンアップを記録し、サイズに応じてローテーションします。`emet insights` がそれを要約し（`--mark-baseline` でベースラインをリセット）、`emet run current` が現在の spec と wave を表示し、`emet status --brief` が状態を 1 行で出力します。
- 設定キー `language.conversation` と `language.artifacts`。
- 設定キー `handoff.afterSpec`（`release`、`promote`、`none`。`emet init` が検出するか、`emet init --after-spec` で設定）、`deploy.check`、`interview.research`。
- `emet promote` は、最後の wave がアイドルになると `develop` から `main` へのプルリクエストを開き、チェックが通ればマージし、`develop` が遅れていれば `main` を同期し直します。`--no-promote` は spec をそのすべてのセッションで保留します。
- `emet deploy-check` はデプロイ確認コマンドを再試行し、ハングしたコマンドを終了させます。
- `emet fleet list | set | launch` は複数のリポジトリにまたがって spec を実行します。
- `emet setup` と `/emet:setup` は、Claude の設定をバックアップしたうえで、カタログからオプションのコンパニオンをインストールします。SessionStart フックが通知を一度だけ表示し、`install.sh` は TTY で setup を実行します。
- `emet doctor` と `emet init` は Engram を推奨しますが、未充足の依存関係として数えることはありません。

### 変更

- インストールされるプロンプトとドキュメントが、gate ポリシー、`emet ci`、`emet chain`、ジャーナル、spec 後のステップ、fleet、setup を説明するようになりました。フェーズ 8 に wave の要約とプッシュ通知が加わり、`emet insights` が `/retro` への案内に置き換わります。

### 修正

- `--no-promote` は git 共通ディレクトリ配下のマーカーとして保持されるため、最後の wave に対する連鎖した `/emet:run --dispatch` セッションが `develop` を `main` に昇格させることはなくなりました。

## 0.8.6

2026-11-17

### 修正

- リリースのワークフローは、CI のテストジョブと同じように、タグでチェックを再実行する前に Chromium をインストールします。これにより検証が `tools/` のカバレッジ下限で止まらなくなりました。このため v0.8.5 はタグ付けされたものの公開されませんでした。その変更はこのバージョンで公開されます。

## 0.8.5

2026-11-17

### 変更

- カバレッジゲートは、`emet/`、`apps/site`、`tools/` に対してファイルごとに行 97 %、関数 98 % の下限を課し、理由付きの例外は `tools/coverage-exceptions.ts` に置きます。カバレッジマニフェストは `emet/src` を再帰的にたどり、`tools/` もゲートの対象になり、`tools/coverage-floors.json` の合計は測定値まで引き上げられます。
- PreToolUse ガードはフェイルクローズになりました。`bin/emet` が emet バイナリを解決できないとき、フックは終了コード 2 で終了してツール呼び出しをブロックし、復旧方法を示すメッセージを出します。Stop と SubagentStop のフックは引き続き終了コード 1 です。
- プラグインのマニフェストに、作者のメールアドレス、ライセンス、ホームページ、リポジトリ、バグ報告の URL が入り、Codex スキルの説明には各スキルをいつ使うかが書かれます。

### 修正

- `emet doctor` は、予期しないエラーが漏れたとき、0 ではなく終了コード 3 で終了します。先に設定された 0 以外の終了コードは保持されます。
- `emet cleanup --all --force` は、終了した実行のワーカーのワークツリーとブランチを回収します。`.claude/worktrees/` 以下のワークツリーも含みます。生きている、またはアイドル状態のオーナーと、実行を指していないロックは保護されたままです。
- 編集ガードは、`src/app/[locale]/page.tsx` のように文字どおり書かれたサーフェスに一致します。サーフェス内の `[` と `]` は文字クラスではなくなりました。
- `emet preflight --post-dispatch` は、予約またはスロットをまだ持つチケットがワーカーのワークツリーを失っているときに失敗し、再開ではなく再ディスパッチするようコーディネーターに伝えます。
- コンパイル済みの `emet` バイナリは、カレントディレクトリの `.env` ファイルを読み込まなくなりました。
- ウェブサイトは、ホームページのインラインスタイル属性をなくし、ライトモードでのホームのラベルに AA コントラストを与え、検索ボタンに最初の描画から見えるテキストで名前を付けます。ドキュメントの画像は `raw.githubusercontent.com` ではなくサイト自身のオリジンの `repo-assets` から配信され、`astro dev` でも配信されます。

## 0.8.4

2026-11-15

### 変更

- ホームページのヘッダーを、左端にワードマークと Docs、右端に検索・GitHub のスター数・テーマ・言語を置く 2 つのグループに変更しました。コントロールとリリースのピルは空に重なる半透明のガラス調になり、ホームのヘッダーとメニューから重複していた「更新情報」リンクを削除しました。

## 0.8.3

2026-11-15

### 修正

- `/docs/` と各ロケールの `/docs/` は、スタイルのないページが一瞬表示される meta-refresh のスタブではなく、はじめにページへの 301 で応答するようになりました。

## 0.8.2

2026-11-11

### 修正

- `emet cleanup` は、ワークツリー `<name>` がまだ存在する間は `worktree-<name>` のスキャフォールドブランチを残します。そこで別のブランチで作業しているセッションは、ホストが想定するブランチを保持できます。

## 0.8.1

2026-11-11

### 追加

- `emet cleanup` は、Agent host が残す `worktree-<name>` のスキャフォールドブランチを、どこにもチェックアウトされておらず、トランクがその先端をすでに含んでいる場合に削除します。

### 修正

- ガードは、大文字のフラグだけでなく、削除フラグと強制フラグを組み合わせたあらゆる書き方のブランチ強制削除を拒否します。

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
