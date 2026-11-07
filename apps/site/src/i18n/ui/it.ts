import type { UiStrings } from "./en";

/**
 * Italian strings of the home page. AI translation, not human reviewed.
 */
export const it = {
  meta: {
    title: "emet: Dalla specifica al merge, con una sola approvazione.",
    description:
      "Dalla specifica al merge con una sola approvazione: worker in parallelo in worktree isolati, una revisione per ondata, CI verde prima del merge.",
  },
  nav: {
    label: "Principale",
    docs: "Documentazione",
    whatsNew: "Novità",
    github: "GitHub",
    language: "Lingua",
    home: "emet, home",
    menu: "Menu",
    close: "Chiudi",
    skip: "Vai al contenuto",
  },
  theme: {
    label: "Tema",
    light: "Chiaro",
    dark: "Scuro",
    system: "Sistema",
  },
  hero: {
    name: "emet",
    lineOne: "Dall'idea al merge,",
    lineTwo: "approvazione unica.",
    sentence:
      "Un plugin per Claude Code. Dall'idea alla modifica integrata, con una sola approvazione.",
    install: "Installa emet",
    readDocs: "Leggi la documentazione",
    alt: "Una valle dipinta dove tre ruscelli si uniscono in un fiume, con campi a terrazze e un piccolo golem d'argilla su un rialzo erboso sotto un cielo calmo.",
  },
  how: {
    heading: "Dall'idea al merge",
    install: "Installalo.",
    describe: "Descrivilo.",
    land: "Guardalo arrivare.",
    tabPlugin: "Plugin",
    tabClone: "Da un clone",
    request: "build the Website",
    alt: "Una valle dipinta in luce dorata, un piccolo golem d'argilla su un rialzo erboso sopra campi a terrazze.",
  },
  showcase: {
    heading: "L'ondata viene integrata",
    headingHeld: "L'ondata attende",
    status: "Ondata 2 revisionata. CI superata. Integrata, 3 ticket chiusi.",
    statusHeld: "Ondata 2 trattenuta: un ticket segnalato. Nulla è stato integrato.",
    flag: "Segnala il ticket #255",
  },
  features: {
    heading: "Cosa protegge un'esecuzione",
    notes: [
      { title: "Una sola approvazione", line: "Specifica e ticket, rivisti una volta." },
      { title: "Una revisione per ondata", line: "Un revisore controlla ogni ondata." },
      {
        title: "Nulla viene integrato se segnalato",
        line: "Una segnalazione trattiene l'intera ondata.",
      },
      {
        title: "CI verde prima del merge",
        line: "I check che falliscono ricevono qualche correzione, poi attendono te.",
      },
      { title: "Worktree isolati", line: "Un git worktree per worker." },
      { title: "Il tuo tracker, o nessuno", line: "Linear, GitHub Issues o file locali." },
    ],
  },
  stats: {
    label: "In numeri",
    items: [
      { value: "3", label: "tracker" },
      { value: "10", label: "lingue" },
      { value: "1", label: "approvazione" },
      { value: "MIT", label: "licenza" },
    ],
  },
  faq: {
    heading: "Domande",
    items: [
      {
        question: "Di cosa ho bisogno?",
        answer: "Claude Code, git, gh autenticato e il plugin mattpocock-skills, su Linux o macOS.",
      },
      {
        question: "Funziona su Windows?",
        answer: "Solo tramite WSL. Linux e macOS funzionano in modo nativo.",
      },
      {
        question: "Quali tracker supporta?",
        answer: "Linear, GitHub Issues o semplici file locali.",
      },
      {
        question: "Cosa succede se la CI fallisce?",
        answer: "L'ondata ha qualche tentativo di correzione, poi aspetta te.",
      },
      {
        question: "Come fermo un'ondata?",
        answer: "Segnala un ticket. Non viene fuso nulla finché qualcosa è segnalato.",
      },
      {
        question: "emet è fatto da Anthropic?",
        answer: "No. emet non è affiliato né approvato da Anthropic.",
      },
    ],
    more: "Altre domande",
  },
  about: {
    heading: "Perché si chiama emet",
    lineOne: "In ebraico significa verità. Un golem è argilla portata in vita da quella parola.",
    lineTwo:
      "Cancella una lettera e si ferma. Qui nulla viene integrato quando qualcosa è segnalato.",
    caption: "Il golem di emet, dipinto.",
    role: "Maintainer",
    alt: "Un ritratto dipinto ravvicinato del golem emet sul suo rialzo erboso nella luce dell'ora d'oro, con texture di muschio e argilla e un piccolo germoglio sulla testa.",
  },
  closing: {
    heading: "Provalo in un repository",
    action: "Installa emet",
    alt: "Una valle sotto una bassa foschia mattutina, con un sole pallido e un cielo pastello.",
  },
  footer: {
    description: "Plugin per Claude Code.",
    notice: "Non affiliato né approvato da Anthropic",
    docs: "Documentazione",
    whatsNew: "Novità",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Dipinti generati con IA a partire da prompt del maintainer.",
    ci: "CI",
    openssf: "OpenSSF Best Practices",
    security: "Sicurezza",
    contributing: "Contribuire",
    languages: "Lingue",
    builtBy: "Creato da AndryOre",
  },
  share: {
    ogAlt: "emet: dalla specifica al merge, con una sola approvazione.",
  },
} satisfies UiStrings;
