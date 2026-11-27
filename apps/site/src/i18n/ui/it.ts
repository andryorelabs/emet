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
      "Un workflow per Claude Code e Codex. Dall'idea alla modifica integrata, con una sola approvazione.",
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
    otherInstall: "Altri modi per installare",
    wave: "Ondata {n}",
    waveLine: "ondata {n}",
    caption:
      "Ogni ondata confluisce in un branch della spec. La spec arriva come una sola pull request.",
    prTitle: "Spec 41: modalità scura per le impostazioni",
    checks: "check superati",
  },
  showcase: {
    heading: "La spec viene integrata",
    headingHeld: "La spec attende",
    status:
      "Spec 41 revisionata. CI superata. Integrata come una sola pull request, 4 ticket chiusi.",
    statusHeld: "Spec 41 trattenuta: un ticket segnalato. Nulla è stato integrato.",
    flag: "Segnala il ticket #44",
  },
  features: {
    heading: "Cosa protegge un'esecuzione",
    scenes: {
      approve: "Approva",
      approveName: "Approva: tieni premuto",
      approved: "Approvato",
      gateName: "Gate di revisione: 1 commento, risolto",
      gateTip: "ondata 2: 1 commento, risolto",
    },
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
    extra: [
      {
        title: "Modalità rapida per piccole modifiche",
        line: "Un'opzione riduce l'intervista a un solo giro ed esegue un ticket, una revisione e un'integrazione.",
      },
      {
        title: "Ricorda ciò che ha funzionato",
        line: "Le lezioni di ogni esecuzione vengono salvate e richiamate nella successiva.",
      },
      {
        title: "Due revisori per modifiche rischiose",
        line: "Il lavoro ad alto rischio ottiene un secondo revisore prima dell'integrazione.",
      },
      {
        title: "Ti avvisa quando ha bisogno di te",
        line: "Un avviso quando un'esecuzione attende la tua approvazione o è bloccata.",
      },
      {
        title: "Si installa e si disinstalla in modo pulito",
        line: "Rimuove tutto ciò che emet ha installato e conserva ogni file che hai modificato.",
      },
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
        question: "Come disinstallo emet?",
        answer:
          "Esegui `emet uninstall`. Rimuove ciò che emet ha installato e conserva ogni file che hai modificato. Aggiungi `--dry-run` per vedere prima un'anteprima.",
      },
      {
        question: "Che cos'è la modalità rapida?",
        answer:
          "Passa `--quick` per una piccola modifica. Riduce l'intervista a un solo giro ed esegue un ticket, una revisione e un'integrazione.",
      },
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
  companion: {
    label: "Compagno golem di emet, premi per aprire il menu",
    menu: "Chiedi a emet",
    sleep: "A riposo. Scorri per svegliarmi.",
    work: "Lampada accesa. Leggo la specifica.",
    wait: "In attesa. Nulla viene unito.",
    done: "Fatto. Una sola approvazione, unito.",
    questions: [
      {
        question: "Che cos'è emet?",
        answer:
          "Un workflow per Claude Code e Codex. Dall'idea alla modifica unita, con una sola approvazione.",
      },
      {
        question: "Come lo installo?",
        answer: "curl -fsSL https://emet.andryore.dev/install.sh | sh",
      },
      { question: "È gratuito?", answer: "Sì. emet ha licenza MIT." },
      { question: "Dove trovo la documentazione?", answer: "A un clic di distanza." },
    ],
    docs: "Apri la documentazione",
  },
  footer: {
    description: "Workflow per Claude Code e Codex.",
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
  links: {
    newTab: "(si apre in una nuova scheda)",
  },
  share: {
    ogAlt: "emet: dalla specifica al merge, con una sola approvazione.",
  },
} satisfies UiStrings;
