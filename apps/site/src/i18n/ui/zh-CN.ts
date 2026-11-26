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
    menu: "菜单",
    close: "关闭",
    skip: "跳到正文",
  },
  theme: {
    label: "主题",
    light: "浅色",
    dark: "深色",
    system: "跟随系统",
  },
  hero: {
    name: "emet",
    lineOne: "从规格到合并，",
    lineTwo: "只需一次批准。",
    sentence: "Claude Code 和 Codex 的工作流。从想法到已合并的改动，只需一次批准。",
    install: "安装 emet",
    readDocs: "阅读文档",
    alt: "一幅画出的山谷，三条溪流汇成一条河，有梯田，一个小小的黏土魔像站在平静天空下的草坡上。",
  },
  how: {
    heading: "从想法到合并",
    install: "安装。",
    describe: "描述。",
    land: "看它合并。",
    tabClone: "从克隆安装",
    request: "build the Website",
    youType: "你输入",
    emetReplies: "emet 回复",
    alt: "三条溪流汇入一条河的山谷.",
    merged: "已合并",
    otherInstall: "其他安装方式",
    wave: "第 {n} 波",
    caption: "每一波都并入一个规格分支。规格作为一个拉取请求落地。",
    prTitle: "规格 41：设置的深色模式",
    checks: "检查通过",
  },
  showcase: {
    heading: "规格已合并",
    headingHeld: "规格在等待",
    status: "规格 41 已评审。CI 通过。作为一个拉取请求合并，关闭 4 个工单。",
    statusHeld: "规格 41 被拦下：有一个工单被标记。未合并任何内容。",
    flag: "标记工单 #44",
  },
  features: {
    heading: "一次运行守护什么",
    scenes: {
      approve: "批准",
      approveName: "批准:长按",
      approved: "已批准",
      gateName: "评审关卡:1 条评论,已解决",
      gateTip: "第 2 波:1 条评论,已解决",
    },
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
    extra: [
      {
        title: "小改动的快速模式",
        line: "一个标志即可把访谈缩成一轮，只运行一个工单、一次评审和一次落地。",
      },
      { title: "记住有效的做法", line: "每次运行的经验会被保存，并在下一次运行中调用。" },
      { title: "高风险改动由两位评审", line: "高风险的工作在落地前会多一位评审。" },
      { title: "需要你时会通知你", line: "运行在等待审批或卡住时发出提醒。" },
      { title: "干净安装，干净卸载", line: "删除 emet 安装的一切，并保留你编辑过的任何文件。" },
    ],
  },
  stats: {
    label: "数字一览",
    items: [
      { value: "3", label: "个跟踪器", detail: "Linear、GitHub Issues 或本地文件" },
      { value: "10", label: "种语言", detail: "英语加九种译文" },
      { value: "1", label: "次批准", detail: "先有规格和工单，再写代码" },
      { value: "MIT", label: "许可证", detail: "可自由使用和 Fork" },
    ],
  },
  faq: {
    heading: "常见问题",
    items: [
      {
        question: "如何卸载 emet？",
        answer:
          "运行 `emet uninstall`。它会删除 emet 安装的内容，并保留你编辑过的任何文件。先加上 `--dry-run` 可预览。",
      },
      {
        question: "什么是快速模式？",
        answer: "小改动请传入 `--quick`。它会把访谈缩成一轮，只运行一个工单、一次评审和一次落地。",
      },
      {
        question: "我需要什么？",
        answer:
          "Claude Code 或 Codex CLI、git、已认证的 gh 和 mattpocock-skills 插件，运行在 Linux 或 macOS 上。",
      },
      { question: "能在 Windows 上运行吗？", answer: "只能通过 WSL。Linux 和 macOS 可原生运行。" },
      { question: "支持哪些跟踪器？", answer: "Linear、GitHub Issues 或普通的本地文件。" },
      { question: "CI 失败了怎么办？", answer: "这一波会尝试几次修复，然后等你处理。" },
      { question: "如何停止一波？", answer: "给工单打上标记。只要有标记，就不会合并任何内容。" },
      {
        question: "emet 是 Anthropic 或 OpenAI 做的吗？",
        answer: "不是。emet 与 Anthropic 或 OpenAI 无关联，也未获得 Anthropic 或 OpenAI 认可。",
      },
    ],
    more: "更多问题",
  },
  about: {
    heading: "为什么叫 emet",
    lineOne: "希伯来语里是“真理”。魔像是被这个词赋予生命的黏土。",
    lineTwoBefore: "擦掉第一个字母，就读作 met，意为“死”。魔像就此停下。在这里，",
    flag: "有标记时什么都不会合并",
    lineTwoAfter: "。",
    truth: "真理",
    dead: "死",
    wordLabel: "emet，真理，去掉第一个字母后变成 met，死",
    caption: "绘制的 emet 魔像。",
    role: "维护者",
    alt: "一幅特写画像：emet 魔像站在草坡上，黄金时刻的光线，苔藓与黏土的质感，头上长着一株小芽。",
  },
  closing: {
    heading: "先在一个仓库里试试",
    action: "安装 emet",
    alt: "低垂晨雾下的山谷，淡淡的太阳和粉彩色的天空。",
  },
  companion: {
    label: "emet 魔像伙伴，按下以打开菜单",
    menu: "向 emet 提问",
    sleep: "休息中。滚动页面唤醒我。",
    work: "灯已亮起。正在阅读规格。",
    wait: "已搁置。不会合并任何内容。",
    done: "完成。一次批准，已合并。",
    questions: [
      {
        question: "emet 是什么？",
        answer: "面向 Claude Code 和 Codex 的工作流。从想法到合并，只需一次批准。",
      },
      { question: "如何安装？", answer: "curl -fsSL https://emet.andryore.dev/install.sh | sh" },
      { question: "免费吗？", answer: "是的。emet 采用 MIT 许可证。" },
      { question: "文档在哪里？", answer: "只需点击一下。" },
    ],
    docs: "打开文档",
  },
  footer: {
    description: "Claude Code 和 Codex 的工作流。",
    notice: "与 Anthropic 或 OpenAI 无关联，也未获得 Anthropic 或 OpenAI 认可",
    docs: "文档",
    whatsNew: "新动态",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "画作由维护者的提示词经 AI 生成。",
    ci: "CI",
    openssf: "OpenSSF Best Practices",
    security: "安全",
    contributing: "参与贡献",
    product: "产品",
    trust: "信任",
    builtBy: "由 AndryOre 构建",
  },
  links: {
    newTab: "(在新标签页中打开)",
  },
  share: {
    ogAlt: "emet：从规格到合并，只需一次批准。",
  },
} satisfies UiStrings;
