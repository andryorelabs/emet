import type { UiStrings } from "./en";

/**
 * Japanese strings of the home page. AI translation, not human reviewed.
 */
export const ja = {
  meta: {
    title: "emet: 仕様からマージまで、承認は一度だけ。",
    description:
      "承認一度で仕様からマージまで。隔離された worktree で並列に動く worker、ウェーブごとのレビュー、マージ前に CI が成功。",
  },
  nav: {
    label: "メイン",
    docs: "ドキュメント",
    whatsNew: "新着情報",
    github: "GitHub",
    language: "言語",
    home: "emet、ホーム",
    menu: "メニュー",
    close: "閉じる",
    skip: "本文へスキップ",
  },
  theme: {
    label: "テーマ",
    light: "ライト",
    dark: "ダーク",
    system: "システム",
  },
  hero: {
    name: "emet",
    lineOne: "仕様からマージへ、",
    lineTwo: "承認は一度だけ。",
    sentence:
      "Claude Code と Codex のワークフロー。アイデアからマージ済みの変更まで、承認は一度だけ。",
    install: "emet をインストール",
    readDocs: "ドキュメントを読む",
    alt: "三本の小川が一つの川に合流する絵の谷。段々畑と、穏やかな空の下の草の丘に立つ小さな粘土のゴーレム。",
  },
  how: {
    heading: "アイデアからマージまで",
    install: "インストール。",
    describe: "伝える。",
    land: "マージを見届ける。",
    tabClone: "クローンから",
    request: "build the Website",
    youType: "入力",
    emetReplies: "emet の応答",
    alt: "三つの小川が一つの川に合流する谷.",
    merged: "マージ済み",
    otherInstall: "ほかのインストール方法",
    wave: "ウェーブ {n}",
    waveLine: "ウェーブ {n}",
    caption:
      "各ウェーブは 1 つのスペックブランチに合流します。スペックは 1 件のプルリクエストとして着地します。",
    prTitle: "スペック 41: 設定のダークモード",
    checks: "チェック成功",
  },
  showcase: {
    heading: "スペックはマージされる",
    headingHeld: "スペックは待機する",
    status:
      "スペック 41 レビュー済み。CI 成功。1 件のプルリクエストとしてマージ済み、チケット 4 件クローズ。",
    statusHeld: "スペック 41 保留: チケット 1 件にフラグ。何もマージされていません。",
    flag: "チケット #44 にフラグを立てる",
  },
  features: {
    heading: "実行が守るもの",
    scenes: {
      approve: "承認",
      approveName: "承認: 長押し",
      approved: "承認済み",
      gateName: "レビューゲート: コメント1件、解決済み",
      gateTip: "ウェーブ2: コメント1件、解決済み",
    },
    notes: [
      { title: "承認は一度だけ", line: "仕様とチケットのレビューは一度で済みます。" },
      { title: "ウェーブごとのレビュー", line: "レビュアーがすべてのウェーブを確認します。" },
      {
        title: "フラグがあればマージしない",
        line: "フラグが一つあれば、ウェーブ全体が保留されます。",
      },
      {
        title: "マージ前に CI が成功",
        line: "失敗したチェックは数回修正を試み、その後はあなたの判断を待ちます。",
      },
      { title: "隔離された worktree", line: "worker ごとに git worktree を一つ。" },
      {
        title: "トラッカーは自由、なしでも可",
        line: "Linear、GitHub Issues、またはローカルファイル。",
      },
    ],
    extra: [
      {
        title: "小さな変更のための高速モード",
        line: "フラグ 1 つでインタビューを 1 回にまとめ、チケット 1 件、レビュー 1 回、着地 1 回で実行します。",
      },
      {
        title: "うまくいったことを覚えている",
        line: "各実行の教訓が保存され、次の実行で呼び出されます。",
      },
      {
        title: "リスクの高い変更には 2 人のレビュアー",
        line: "高リスクの作業は、着地の前に 2 人目のレビュアーが確認します。",
      },
      {
        title: "必要なときに知らせる",
        line: "実行が承認待ちになったり止まったりすると通知します。",
      },
      {
        title: "きれいにインストール、きれいに削除",
        line: "emet が入れたものをすべて削除し、あなたが編集したファイルは残します。",
      },
    ],
  },
  stats: {
    label: "数字で見る",
    items: [
      { value: "3", label: "トラッカー", detail: "Linear、GitHub Issues、ローカルファイル" },
      { value: "10", label: "言語", detail: "英語に加えて9言語の翻訳" },
      { value: "1", label: "承認", detail: "コードより先に、仕様とチケット" },
      { value: "MIT", label: "ライセンス", detail: "自由に使えて、フォークも可能" },
    ],
  },
  faq: {
    heading: "よくある質問",
    items: [
      {
        question: "emet をアンインストールするには？",
        answer:
          "`emet uninstall` を実行します。emet が入れたものを削除し、あなたが編集したファイルは残します。先に確認するには `--dry-run` を付けます。",
      },
      {
        question: "高速モードとは？",
        answer:
          "小さな変更には `--quick` を付けます。インタビューを 1 回にまとめ、チケット 1 件、レビュー 1 回、着地 1 回で実行します。",
      },
      {
        question: "何が必要ですか？",
        answer:
          "Claude Code または Codex CLI、git、認証済みの gh、mattpocock-skills プラグインが必要です。Linux または macOS で動きます。",
      },
      {
        question: "Windows で動きますか？",
        answer: "WSL 経由のみです。Linux と macOS ではそのまま動きます。",
      },
      {
        question: "どのトラッカーに対応していますか？",
        answer: "Linear、GitHub Issues、またはローカルのファイルです。",
      },
      {
        question: "CI が失敗したらどうなりますか？",
        answer: "ウェーブは数回の修正を試み、その後あなたの判断を待ちます。",
      },
      {
        question: "ウェーブを止めるには？",
        answer: "チケットにフラグを立てます。フラグがある間は何もマージされません。",
      },
      {
        question: "emet は Anthropic または OpenAI が作っていますか？",
        answer:
          "いいえ。emet は Anthropic または OpenAI と提携しておらず、Anthropic または OpenAI の承認も受けていません。",
      },
    ],
    more: "その他の質問",
  },
  about: {
    heading: "emet という名前の理由",
    lineOne: "ヘブライ語で「真理」。ゴーレムは、その言葉で命を得た粘土です。",
    lineTwoBefore:
      "最初の一文字を消すと met、つまり「死」と読めます。ゴーレムは止まります。ここでは、",
    flag: "フラグがあれば何もマージされません",
    lineTwoAfter: "。",
    truth: "真理",
    dead: "死",
    wordLabel: "emet（真理）は、最初の一文字を消すと met（死）になる",
    caption: "描かれた emet のゴーレム。",
    role: "メンテナー",
    alt: "草の丘に立つ emet ゴーレムの絵のクローズアップ。ゴールデンアワーの光、苔と粘土の質感、頭には小さな新芽。",
  },
  closing: {
    heading: "まず一つのリポジトリで",
    action: "emet をインストール",
    alt: "低い朝霧に包まれた谷。淡い太陽とパステルの空。",
  },
  companion: {
    label: "emet のゴーレムコンパニオン、押すとメニューが開きます",
    menu: "emet に質問",
    sleep: "休憩中。スクロールすると起きます。",
    work: "ランプ点灯。仕様を読んでいます。",
    wait: "保留中。何もマージされません。",
    done: "完了。承認は一度で、マージ済みです。",
    questions: [
      {
        question: "emet とは?",
        answer:
          "Claude Code と Codex のためのワークフローです。アイデアからマージまで、承認は一度だけです。",
      },
      {
        question: "インストール方法は?",
        answer: "curl -fsSL https://emet.andryore.dev/install.sh | sh",
      },
      { question: "無料ですか?", answer: "はい。emet は MIT ライセンスです。" },
      { question: "ドキュメントはどこ?", answer: "ワンクリックで開けます。" },
    ],
    docs: "ドキュメントを開く",
  },
  footer: {
    description: "Claude Code と Codex のワークフロー。",
    notice: "Anthropic または OpenAI とは提携しておらず、その承認も受けていません",
    docs: "ドキュメント",
    whatsNew: "新着情報",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "絵はメンテナーのプロンプトから AI で生成しています。",
    ci: "CI",
    openssf: "OpenSSF Best Practices",
    security: "セキュリティ",
    contributing: "コントリビュート",
    product: "プロダクト",
    trust: "信頼性",
    builtBy: "制作 AndryOre",
  },
  links: {
    newTab: "(新しいタブで開きます)",
  },
  share: {
    ogAlt: "emet: 仕様からマージまで、承認は一度だけ。",
  },
} satisfies UiStrings;
