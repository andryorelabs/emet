import type { UiStrings } from "./en";

/**
 * German strings of the home page. AI translation, not human reviewed.
 */
export const de = {
  meta: {
    title: "emet: Von der Spezifikation zum Merge, mit einer Freigabe.",
    description:
      "Von der Spezifikation zum Merge mit einer Freigabe: parallele Worker in isolierten Worktrees, ein Review pro Welle, CI grün vor dem Merge.",
  },
  nav: {
    label: "Hauptnavigation",
    docs: "Doku",
    whatsNew: "Neuigkeiten",
    github: "GitHub",
    language: "Sprache",
    home: "emet, Startseite",
    menu: "Menü",
    close: "Schließen",
    skip: "Zum Inhalt springen",
  },
  theme: {
    label: "Design",
    light: "Hell",
    dark: "Dunkel",
    system: "System",
  },
  hero: {
    name: "emet",
    lineOne: "Von Idee zu Merge,",
    lineTwo: "mit einer Freigabe.",
    sentence:
      "Ein Plugin für Claude Code. Von der Idee zur gemergten Änderung, mit einer Freigabe.",
    install: "emet installieren",
    readDocs: "Doku lesen",
    alt: "Ein gemaltes Tal, in dem drei Bäche in einen Fluss münden, mit Terrassenfeldern und einem kleinen Lehm-Golem auf einer grasigen Anhöhe unter ruhigem Himmel.",
  },
  how: {
    heading: "Von der Idee zum Merge",
    install: "Installieren.",
    describe: "Beschreiben.",
    land: "Zusehen, wie es landet.",
    tabPlugin: "Plugin",
    tabClone: "Aus einem Klon",
    request: "build the Website",
    alt: "Ein gemaltes Tal im goldenen Licht, ein kleiner Lehm-Golem auf einer grasigen Anhöhe über Terrassenfeldern.",
  },
  showcase: {
    heading: "Die Welle wird gemergt",
    headingHeld: "Die Welle wartet",
    status: "Welle 2 geprüft. CI bestanden. Gemergt, 3 Tickets geschlossen.",
    statusHeld: "Welle 2 angehalten: ein Ticket markiert. Nichts gemergt.",
    flag: "Ticket #255 markieren",
  },
  features: {
    heading: "Was ein Lauf absichert",
    notes: [
      { title: "Eine Freigabe", line: "Spezifikation und Tickets, einmal geprüft." },
      { title: "Ein Review pro Welle", line: "Ein Reviewer prüft jede Welle." },
      {
        title: "Nichts wird gemergt, wenn markiert",
        line: "Eine Markierung hält die ganze Welle an.",
      },
      {
        title: "CI grün vor dem Merge",
        line: "Fehlschlagende Checks bekommen ein paar Korrekturen, dann wartet es auf dich.",
      },
      { title: "Isolierte Worktrees", line: "Ein git worktree pro Worker." },
      { title: "Dein Tracker, oder keiner", line: "Linear, GitHub Issues oder lokale Dateien." },
    ],
  },
  stats: {
    label: "In Zahlen",
    items: [
      { value: "3", label: "Tracker", detail: "Linear, GitHub Issues oder lokale Dateien" },
      { value: "10", label: "Sprachen", detail: "Englisch plus neun Übersetzungen" },
      { value: "1", label: "Freigabe", detail: "Spec und Tickets, bevor Code entsteht" },
      { value: "MIT", label: "Lizenz", detail: "Frei nutzbar und forkbar" },
    ],
  },
  faq: {
    heading: "Fragen",
    items: [
      {
        question: "Was brauche ich?",
        answer:
          "Claude Code, git, ein angemeldetes gh und das Plugin mattpocock-skills, unter Linux oder macOS.",
      },
      {
        question: "Läuft es unter Windows?",
        answer: "Nur über WSL. Linux und macOS laufen nativ.",
      },
      {
        question: "Welche Tracker werden unterstützt?",
        answer: "Linear, GitHub Issues oder einfache lokale Dateien.",
      },
      {
        question: "Was, wenn die CI fehlschlägt?",
        answer: "Die Welle bekommt einige Korrekturversuche und wartet dann auf dich.",
      },
      {
        question: "Wie halte ich eine Welle an?",
        answer: "Markiere ein Ticket. Solange etwas markiert ist, wird nichts gemergt.",
      },
      {
        question: "Stammt emet von Anthropic?",
        answer:
          "Nein. emet steht in keiner Verbindung zu Anthropic und wird nicht von Anthropic unterstützt.",
      },
    ],
    more: "Weitere Fragen",
  },
  about: {
    heading: "Warum es emet heißt",
    lineOne: "Hebräisch für Wahrheit. Ein Golem ist Lehm, den dieses Wort zum Leben erweckt.",
    lineTwo:
      "Lösche einen Buchstaben und er hält an. Hier wird nichts gemergt, wenn etwas markiert ist.",
    caption: "Der emet-Golem, gemalt.",
    role: "Maintainer",
    alt: "Ein gemaltes Nahporträt des emet-Golems auf seiner grasigen Anhöhe im Licht der goldenen Stunde, mit Moos- und Lehmtextur und einem kleinen Spross auf dem Kopf.",
  },
  closing: {
    heading: "Probiere es in einem Repo",
    action: "emet installieren",
    alt: "Ein Tal unter tiefem Morgennebel mit blasser Sonne und Pastellhimmel.",
  },
  footer: {
    description: "Plugin für Claude Code.",
    notice: "Nicht mit Anthropic verbunden und nicht von Anthropic unterstützt",
    docs: "Doku",
    whatsNew: "Neuigkeiten",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Gemälde, mit KI aus Prompts des Maintainers erzeugt.",
    ci: "CI",
    openssf: "OpenSSF Best Practices",
    security: "Sicherheit",
    contributing: "Mitwirken",
    product: "Produkt",
    trust: "Vertrauen",
    builtBy: "Erstellt von AndryOre",
  },
  share: {
    ogAlt: "emet: von der Spezifikation bis zum Merge, mit einer einzigen Freigabe.",
  },
} satisfies UiStrings;
