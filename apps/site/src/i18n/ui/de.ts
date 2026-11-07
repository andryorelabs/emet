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
  },
  hero: {
    name: "emet",
    lineOne: "Von der Spezifikation zum Merge,",
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
    request: "add dark mode to the settings page",
    alt: "Ein gemaltes Tal im goldenen Licht, ein kleiner Lehm-Golem auf einer grasigen Anhöhe über Terrassenfeldern.",
  },
  showcase: {
    heading: "Die Welle wird gemergt",
    headingHeld: "Die Welle wartet",
    status: "Welle 1 geprüft. CI bestanden. Gemergt, 4 Tickets geschlossen.",
    statusHeld: "Welle 1 angehalten: ein Ticket markiert. Nichts gemergt.",
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
  about: {
    heading: "Warum es emet heißt",
    lineOne: "Hebräisch für Wahrheit. Ein Golem ist Lehm, den dieses Wort zum Leben erweckt.",
    lineTwo:
      "Lösche einen Buchstaben und er hält an. Hier wird nichts gemergt, wenn etwas markiert ist.",
    signature: "AndryOre, Maintainer",
    alt: "Ein gemaltes Nahporträt des emet-Golems auf seiner grasigen Anhöhe im Licht der goldenen Stunde, mit Moos- und Lehmtextur und einem kleinen Spross auf dem Kopf.",
  },
  closing: {
    heading: "Probiere es in einem Repo",
    action: "emet installieren",
    alt: "Ein Tal unter tiefem Morgennebel mit blasser Sonne und Pastellhimmel.",
  },
  footer: {
    description: "Plugin für Claude Code.",
    notice: "Not affiliated with or endorsed by Anthropic",
    docs: "Doku",
    whatsNew: "Neuigkeiten",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Gemälde, mit KI aus Prompts des Maintainers erzeugt.",
  },
} satisfies UiStrings;
