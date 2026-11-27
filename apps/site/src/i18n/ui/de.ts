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
      "Ein Workflow für Claude Code und Codex. Von der Idee zur gemergten Änderung, mit einer Freigabe.",
    install: "emet installieren",
    readDocs: "Doku lesen",
    alt: "Ein gemaltes Tal, in dem drei Bäche in einen Fluss münden, mit Terrassenfeldern und einem kleinen Lehm-Golem auf einer grasigen Anhöhe unter ruhigem Himmel.",
  },
  how: {
    heading: "Von der Idee zum Merge",
    install: "Installieren.",
    describe: "Beschreiben.",
    land: "Zusehen, wie es landet.",
    tabClone: "Aus einem Klon",
    request: "build the Website",
    youType: "du tippst",
    emetReplies: "emet antwortet",
    alt: "Das Tal, in dem drei Bäche in einen Fluss münden.",
    merged: "Gemergt",
    otherInstall: "Weitere Installationswege",
    wave: "Welle {n}",
    waveLine: "Welle {n}",
    caption: "Jede Welle fließt in einen Spec-Branch. Die Spec landet als ein Pull Request.",
    prTitle: "Spec 41: Dunkelmodus für die Einstellungen",
    checks: "Checks bestanden",
    open: "Offen",
    closes: "Schließt",
  },
  showcase: {
    heading: "Die Spec wird gemergt",
    headingHeld: "Die Spec wartet",
    status: "Spec 41 geprüft. CI bestanden. Als ein Pull Request gemergt, 4 Tickets geschlossen.",
    statusHeld: "Spec 41 angehalten: ein Ticket markiert. Nichts gemergt.",
    flag: "Ticket #44 markieren",
    laneReview: "Review",
    laneHeld: "gehalten",
  },
  features: {
    heading: "Was ein Lauf absichert",
    scenes: {
      approve: "Freigeben",
      approveName: "Freigeben: gedrückt halten",
      approved: "Freigegeben",
      gateName: "Review-Gate: 1 Kommentar, erledigt",
      gateTip: "Welle 2: 1 Kommentar, erledigt",
    },
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
    extra: [
      { title: "Schnellmodus für kleine Änderungen", docs: "/docs/reference/cli/" },
      { title: "Merkt sich, was funktioniert hat", docs: "/docs/reference/cli/" },
      { title: "Zwei Reviewer für riskante Änderungen", docs: "/docs/reference/configuration/" },
      { title: "Meldet sich, wenn es dich braucht", docs: "/docs/how-to/check-a-fleet/" },
      { title: "Sauber installiert und deinstalliert", docs: "/docs/start/install/" },
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
        question: "Wie deinstalliere ich emet?",
        answer:
          "Führe `emet uninstall` aus. Es entfernt, was emet installiert hat, und behält jede Datei, die du bearbeitet hast. Mit `--dry-run` siehst du vorher eine Vorschau.",
      },
      {
        question: "Was ist der Schnellmodus?",
        answer:
          "Übergib `--quick` für eine kleine Änderung. Er hält das Interview auf eine Runde und führt ein Ticket, ein Review und ein Landing aus.",
      },
      {
        question: "Was brauche ich?",
        answer:
          "Claude Code oder die Codex CLI, git, ein angemeldetes gh und das Plugin mattpocock-skills, unter Linux oder macOS.",
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
        question: "Stammt emet von Anthropic oder OpenAI?",
        answer:
          "Nein. emet steht in keiner Verbindung zu Anthropic oder OpenAI und wird nicht von Anthropic oder OpenAI unterstützt.",
      },
    ],
    more: "Weitere Fragen",
  },
  about: {
    heading: "Warum es emet heißt",
    lineOne: "Hebräisch für Wahrheit. Ein Golem ist Lehm, den dieses Wort zum Leben erweckt.",
    lineTwoBefore: "Lösche den ersten Buchstaben und es heißt met, tot. Der Golem hält an. Hier ",
    flag: "wird nichts gemergt, wenn etwas markiert ist",
    lineTwoAfter: ".",
    truth: "Wahrheit",
    dead: "tot",
    wordLabel: "emet, Wahrheit, wird ohne den ersten Buchstaben zu met, tot",
    caption: "Der emet-Golem, gemalt.",
    role: "Maintainer",
    alt: "Ein gemaltes Nahporträt des emet-Golems auf seiner grasigen Anhöhe im Licht der goldenen Stunde, mit Moos- und Lehmtextur und einem kleinen Spross auf dem Kopf.",
  },
  closing: {
    heading: "Probiere es in einem Repo",
    action: "emet installieren",
    alt: "Ein Tal unter tiefem Morgennebel mit blasser Sonne und Pastellhimmel.",
  },
  companion: {
    label: "emet-Golem-Begleiter, drücken, um das Menü zu öffnen",
    menu: "Frag emet",
    sleep: "Ich ruhe. Scrolle, um mich zu wecken.",
    work: "Lampe an. Ich lese die Spezifikation.",
    wait: "Angehalten. Nichts wird gemergt.",
    done: "Fertig. Eine Freigabe, gemergt.",
    questions: [
      {
        question: "Was ist emet?",
        answer:
          "Ein Workflow für Claude Code und Codex. Von der Idee zur gemergten Änderung, mit einer einzigen Freigabe.",
      },
      {
        question: "Wie installiere ich es?",
        answer: "curl -fsSL https://emet.andryore.dev/install.sh | sh",
      },
      { question: "Ist es kostenlos?", answer: "Ja. emet steht unter der MIT-Lizenz." },
      { question: "Wo finde ich die Dokumentation?", answer: "Nur einen Klick entfernt." },
    ],
    docs: "Dokumentation öffnen",
  },
  footer: {
    description: "Workflow für Claude Code und Codex.",
    notice:
      "Nicht mit Anthropic oder OpenAI verbunden und nicht von Anthropic oder OpenAI unterstützt",
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
  links: {
    newTab: "(öffnet in einem neuen Tab)",
  },
  share: {
    ogAlt: "emet: von der Spezifikation bis zum Merge, mit einer einzigen Freigabe.",
  },
} satisfies UiStrings;
