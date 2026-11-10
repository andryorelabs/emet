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
      "Un plugin per Claude Code e Codex. Dall'idea alla modifica integrata, con una sola approvazione.",
    install: "Installa emet",
    readDocs: "Leggi la documentazione",
    alt: "Una valle dipinta dove tre ruscelli si uniscono in un fiume, con campi a terrazze e un piccolo golem d'argilla su un rialzo erboso sotto un cielo calmo.",
  },
  how: {
    heading: "Dall'idea al merge",
    install: "Installalo.",
    describe: "Descrivilo.",
    land: "Guardalo arrivare.",
    tabClone: "Da un clone",
    request: "build the Website",
    youType: "tu scrivi",
    emetReplies: "emet risponde",
    alt: "La valle dove tre ruscelli confluiscono in un fiume.",
    merged: "Unito",
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
      { value: "3", label: "tracker", detail: "Linear, GitHub Issues o file locali" },
      { value: "10", label: "lingue", detail: "Inglese più nove traduzioni" },
      { value: "1", label: "approvazione", detail: "Spec e ticket, prima di ogni riga di codice" },
      { value: "MIT", label: "licenza", detail: "Libero da usare e fare fork" },
    ],
  },
  faq: {
    heading: "Domande",
    items: [
      {
        question: "Di cosa ho bisogno?",
        answer:
          "Claude Code o la CLI di Codex, git, gh autenticato e il plugin mattpocock-skills, su Linux o macOS.",
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
        question: "emet è fatto da Anthropic o OpenAI?",
        answer: "No. emet non è affiliato né approvato da Anthropic o OpenAI.",
      },
    ],
    more: "Altre domande",
  },
  about: {
    heading: "Perché si chiama emet",
    lineOne: "In ebraico significa verità. Un golem è argilla portata in vita da quella parola.",
    lineTwoBefore: "Cancella la prima lettera e si legge met, morto. Il golem si ferma. Qui ",
    flag: "nulla viene integrato quando qualcosa è segnalato",
    lineTwoAfter: ".",
    truth: "verità",
    dead: "morto",
    wordLabel: "emet, verità, diventa met, morto, senza la prima lettera",
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
    description: "Plugin per Claude Code e Codex.",
    notice: "Non affiliato né approvato da Anthropic o OpenAI",
    docs: "Documentazione",
    whatsNew: "Novità",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Dipinti generati con IA a partire da prompt del maintainer.",
    ci: "CI",
    openssf: "OpenSSF Best Practices",
    security: "Sicurezza",
    contributing: "Contribuire",
    product: "Prodotto",
    trust: "Fiducia",
    builtBy: "Creato da AndryOre",
  },
  share: {
    ogAlt: "emet: dalla specifica al merge, con una sola approvazione.",
  },
} satisfies UiStrings;
