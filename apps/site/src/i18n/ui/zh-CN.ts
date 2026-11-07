import type { UiStrings } from "./en";

/**
 * Simplified Chinese strings of the home page. AI translation, not human
 * reviewed.
 */
export const zhCN = {
  meta: {
    title: "emet：从规格到合并，只需一次批准。",
    description:
      "一次批准，从规格到合并：并行的 worker 在隔离的 worktree 中工作，每一波都有评审，合并前 CI 通过。",
  },
  nav: {
    label: "主导航",
    docs: "文档",
    whatsNew: "新动态",
    github: "GitHub",
    language: "语言",
    home: "emet，首页",
  },
  hero: {
    name: "emet",
    lineOne: "从规格到合并，",
    lineTwo: "只需一次批准。",
    sentence: "Claude Code 的插件。从想法到已合并的改动，只需一次批准。",
    install: "安装 emet",
    readDocs: "阅读文档",
    alt: "一幅画出的山谷，三条溪流汇成一条河，有梯田，一个小小的黏土魔像站在平静天空下的草坡上。",
  },
  how: {
    heading: "从想法到合并",
    install: "安装。",
    describe: "描述。",
    land: "看它合并。",
    tabPlugin: "插件",
    tabClone: "从克隆安装",
    request: "add dark mode to the settings page",
    alt: "一幅金色光线下的山谷画，一个小小的黏土魔像站在梯田上方的草坡上。",
  },
  showcase: {
    heading: "这一波已合并",
    headingHeld: "这一波在等待",
    status: "第 1 波已评审。CI 通过。已合并，关闭 4 个工单。",
    statusHeld: "第 1 波被拦下：有一个工单被标记。未合并任何内容。",
  },
  features: {
    heading: "一次运行守护什么",
    notes: [
      { title: "一次批准", line: "规格和工单只评审一次。" },
      { title: "每一波都有评审", line: "评审者检查每一波。" },
      { title: "有标记就不合并", line: "一个标记会拦下整波。" },
      {
        title: "合并前 CI 通过",
        line: "检查失败时会尝试几次修复，然后等你决定。",
      },
      { title: "隔离的 worktree", line: "每个 worker 一个 git worktree。" },
      { title: "用你的追踪器，或不用", line: "Linear、GitHub Issues 或本地文件。" },
    ],
  },
  about: {
    heading: "为什么叫 emet",
    lineOne: "希伯来语里是“真理”。魔像是被这个词赋予生命的黏土。",
    lineTwo: "擦掉一个字母，它就停下。在这里，有标记时什么都不会合并。",
    signature: "AndryOre，维护者",
    alt: "一幅特写画像：emet 魔像站在草坡上，黄金时刻的光线，苔藓与黏土的质感，头上长着一株小芽。",
  },
  closing: {
    heading: "先在一个仓库里试试",
    action: "安装 emet",
    alt: "低垂晨雾下的山谷，淡淡的太阳和粉彩色的天空。",
  },
  footer: {
    description: "Claude Code 的插件。",
    notice: "Not affiliated with or endorsed by Anthropic",
    docs: "文档",
    whatsNew: "新动态",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "画作由维护者的提示词经 AI 生成。",
  },
} satisfies UiStrings;
