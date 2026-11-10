/**
 * English strings of the home page, the source for every locale. Copy is the
 * minimum deck of `apps/site/design/run-notes.md` section 5; the tagline, the
 * notice and the six claim titles are verbatim from `docs/brand/copy.md`.
 */
export const en = {
  meta: {
    title: "emet: Spec to merge, on one approval.",
    description:
      "Spec to merge on one approval: parallel workers in isolated worktrees, a review per wave, CI green before merge.",
  },
  nav: {
    label: "Main",
    docs: "Docs",
    whatsNew: "What's new",
    github: "GitHub",
    language: "Language",
    home: "emet, home",
    menu: "Menu",
    close: "Close",
    skip: "Skip to content",
  },
  theme: {
    label: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
  },
  hero: {
    name: "emet",
    lineOne: "Spec to merge,",
    lineTwo: "on one approval.",
    sentence: "A plugin for Claude Code and Codex. Idea to merged change, one approval.",
    install: "Install emet",
    readDocs: "Read the docs",
    alt: "A painted valley where three streams join one river, with terraced fields and a small clay golem on a grassy rise under a calm sky.",
  },
  how: {
    heading: "From idea to merge",
    install: "Install.",
    describe: "Describe it.",
    land: "Watch it land.",
    tabPlugin: "Plugin",
    tabClone: "From a clone",
    request: "build the Website",
    youType: "you type",
    emetReplies: "emet replies",
    alt: "The valley where three streams join one river.",
    merged: "Merged",
  },
  showcase: {
    heading: "The wave merges",
    headingHeld: "The wave waits",
    status: "Wave 2 reviewed. CI passed. Merged, 3 tickets closed.",
    statusHeld: "Wave 2 held: one ticket flagged. Nothing merged.",
    flag: "Flag ticket #255",
  },
  features: {
    heading: "What a run guards",
    notes: [
      { title: "One approval", line: "Spec and tickets, reviewed once." },
      { title: "A review per wave", line: "A reviewer checks every wave." },
      { title: "Nothing merges when flagged", line: "A flag holds the whole wave." },
      {
        title: "CI green before merge",
        line: "Failing checks get a few fixes, then wait for you.",
      },
      { title: "Isolated worktrees", line: "One git worktree per worker." },
      { title: "Your tracker, or none", line: "Linear, GitHub Issues or local files." },
    ],
  },
  stats: {
    label: "In numbers",
    items: [
      { value: "3", label: "trackers", detail: "Linear, GitHub Issues or local files" },
      { value: "10", label: "languages", detail: "English plus nine translations" },
      { value: "1", label: "approval", detail: "Spec and tickets, before any code" },
      { value: "MIT", label: "license", detail: "Free to use and fork" },
    ],
  },
  faq: {
    heading: "Questions",
    items: [
      {
        question: "What do I need?",
        answer:
          "Claude Code or the Codex CLI, git, an authenticated gh and the mattpocock-skills plugin, on Linux or macOS.",
      },
      {
        question: "Does it run on Windows?",
        answer: "Only through WSL. Linux and macOS run natively.",
      },
      {
        question: "Which trackers does it support?",
        answer: "Linear, GitHub Issues or plain local files.",
      },
      {
        question: "What if CI fails?",
        answer: "The wave gets a few fix attempts, then waits for you.",
      },
      {
        question: "How do I stop a wave?",
        answer: "Flag a ticket. Nothing merges while something is flagged.",
      },
      {
        question: "Is emet made by Anthropic?",
        answer: "No. emet is not affiliated with or endorsed by Anthropic.",
      },
    ],
    more: "More questions",
  },
  about: {
    heading: "Why it is called emet",
    lineOne: "Hebrew for truth. A golem is clay brought to life by that word.",
    lineTwoBefore: "Erase the first letter and it reads met, dead. The golem stops. Here, ",
    flag: "nothing merges when something is flagged",
    lineTwoAfter: ".",
    truth: "truth",
    dead: "dead",
    wordLabel: "emet, truth, becomes met, dead, without its first letter",
    caption: "The emet golem, painted.",
    role: "Maintainer",
    alt: "A close painted portrait of the emet golem on its grassy rise in golden-hour light, moss and clay texture, a small sprout on its head.",
  },
  closing: {
    heading: "Try it in one repo",
    action: "Install emet",
    alt: "A valley under low morning mist with a pale sun and pastel sky.",
  },
  footer: {
    description: "Plugin for Claude Code and Codex.",
    notice: "Not affiliated with or endorsed by Anthropic",
    docs: "Docs",
    whatsNew: "What's new",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Paintings generated with AI from prompts by the maintainer.",
    ci: "CI",
    openssf: "OpenSSF Best Practices",
    security: "Security",
    contributing: "Contributing",
    product: "Product",
    trust: "Trust",
    builtBy: "Built by AndryOre",
  },
  share: {
    ogAlt: "emet: spec to merge, on one approval.",
  },
};

/**
 * The shape every locale module must match.
 */
export type UiStrings = typeof en;
