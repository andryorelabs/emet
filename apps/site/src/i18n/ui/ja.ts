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
    request: "add dark mode to the settings page",
    alt: "金色の光に包まれた絵の谷。段々畑の上の草の丘に立つ小さな粘土のゴーレム。",
  },
  showcase: {
    heading: "ウェーブはマージされる",
    headingHeld: "ウェーブは待機する",
    status: "ウェーブ 1 レビュー済み。CI 成功。マージ済み、チケット 4 件クローズ。",
    statusHeld: "ウェーブ 1 保留: チケット 1 件にフラグ。何もマージされていません。",
    flag: "チケット #44 にフラグを立てる",
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
  about: {
    heading: "emet という名前の理由",
    lineOne: "ヘブライ語で「真理」。ゴーレムは、その言葉で命を得た粘土です。",
    lineTwo: "一文字消せば止まります。ここでは、フラグがあれば何もマージされません。",
    signature: "AndryOre、メンテナー",
    alt: "草の丘に立つ emet ゴーレムの絵のクローズアップ。ゴールデンアワーの光、苔と粘土の質感、頭には小さな新芽。",
  },
  closing: {
    heading: "まず一つのリポジトリで",
    action: "emet をインストール",
    alt: "低い朝霧に包まれた谷。淡い太陽とパステルの空。",
  },
  footer: {
    description: "Claude Code のプラグイン。",
    notice: "Not affiliated with or endorsed by Anthropic",
    docs: "ドキュメント",
    whatsNew: "新着情報",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "絵はメンテナーのプロンプトから AI で生成しています。",
  },
} satisfies UiStrings;
