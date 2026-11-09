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
    sentence: "Claude Code のプラグイン。アイデアからマージ済みの変更まで、承認は一度だけ。",
    install: "emet をインストール",
    readDocs: "ドキュメントを読む",
    alt: "三本の小川が一つの川に合流する絵の谷。段々畑と、穏やかな空の下の草の丘に立つ小さな粘土のゴーレム。",
  },
  how: {
    heading: "アイデアからマージまで",
    install: "インストール。",
    describe: "伝える。",
    land: "マージを見届ける。",
    tabPlugin: "プラグイン",
    tabClone: "クローンから",
    request: "build the Website",
    youType: "入力",
    emetReplies: "emet の応答",
    alt: "三つの小川が一つの川に合流する谷.",
    merged: "マージ済み",
  },
  showcase: {
    heading: "ウェーブはマージされる",
    headingHeld: "ウェーブは待機する",
    status: "ウェーブ 2 レビュー済み。CI 成功。マージ済み、チケット 3 件クローズ。",
    statusHeld: "ウェーブ 2 保留: チケット 1 件にフラグ。何もマージされていません。",
    flag: "チケット #255 にフラグを立てる",
  },
  features: {
    heading: "実行が守るもの",
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
        question: "何が必要ですか？",
        answer:
          "Claude Code、git、認証済みの gh、mattpocock-skills プラグインが必要です。Linux または macOS で動きます。",
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
        question: "emet は Anthropic が作っていますか？",
        answer: "いいえ。emet は Anthropic と提携しておらず、Anthropic の承認も受けていません。",
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
  footer: {
    description: "Claude Code のプラグイン。",
    notice: "Anthropic とは提携しておらず、Anthropic の承認も受けていません",
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
  share: {
    ogAlt: "emet: 仕様からマージまで、承認は一度だけ。",
  },
} satisfies UiStrings;
