import type { UiStrings } from "./en";

/**
 * French strings of the home page. AI translation, not human reviewed.
 */
export const fr = {
  meta: {
    title: "emet : De la spécification au merge, en une seule approbation.",
    description:
      "De la spécification au merge en une seule approbation : des workers en parallèle dans des worktrees isolés, une revue par vague, une CI au vert avant le merge.",
  },
  nav: {
    label: "Principale",
    docs: "Docs",
    whatsNew: "Nouveautés",
    github: "GitHub",
    language: "Langue",
    home: "emet, accueil",
    menu: "Menu",
    close: "Fermer",
    skip: "Aller au contenu",
  },
  theme: {
    label: "Thème",
    light: "Clair",
    dark: "Sombre",
    system: "Système",
  },
  hero: {
    name: "emet",
    lineOne: "De l'idée au merge,",
    lineTwo: "en une approbation.",
    sentence:
      "Un plugin pour Claude Code. De l'idée au changement fusionné, en une seule approbation.",
    install: "Installer emet",
    readDocs: "Lire la documentation",
    alt: "Une vallée peinte où trois ruisseaux se joignent en une rivière, avec des champs en terrasses et un petit golem d'argile sur une butte herbeuse sous un ciel calme.",
  },
  how: {
    heading: "De l'idée au merge",
    install: "Installez.",
    describe: "Décrivez.",
    land: "Regardez-le atterrir.",
    tabPlugin: "Plugin",
    tabClone: "Depuis un clone",
    request: "build the Website",
    alt: "Une vallée peinte dans une lumière dorée, un petit golem d'argile sur une butte herbeuse au-dessus de champs en terrasses.",
  },
  showcase: {
    heading: "La vague est fusionnée",
    headingHeld: "La vague attend",
    status: "Vague 2 relue. CI réussie. Fusionnée, 3 tickets fermés.",
    statusHeld: "Vague 2 retenue : un ticket signalé. Rien n'a été fusionné.",
    flag: "Signaler le ticket #255",
  },
  features: {
    heading: "Ce qu'une exécution protège",
    notes: [
      { title: "Une seule approbation", line: "Spécification et tickets, relus une fois." },
      { title: "Une revue par vague", line: "Un relecteur vérifie chaque vague." },
      { title: "Rien n'est fusionné si signalé", line: "Un signalement retient toute la vague." },
      {
        title: "CI au vert avant le merge",
        line: "Les checks en échec reçoivent quelques corrections, puis attendent votre décision.",
      },
      { title: "Worktrees isolés", line: "Un git worktree par worker." },
      { title: "Votre tracker, ou aucun", line: "Linear, GitHub Issues ou fichiers locaux." },
    ],
  },
  stats: {
    label: "En chiffres",
    items: [
      { value: "3", label: "trackers" },
      { value: "10", label: "langues" },
      { value: "1", label: "validation" },
      { value: "MIT", label: "licence" },
    ],
  },
  faq: {
    heading: "Questions",
    items: [
      {
        question: "De quoi ai-je besoin ?",
        answer:
          "Claude Code, git, un gh authentifié et le plugin mattpocock-skills, sous Linux ou macOS.",
      },
      {
        question: "Fonctionne-t-il sous Windows ?",
        answer: "Uniquement via WSL. Linux et macOS fonctionnent en natif.",
      },
      {
        question: "Quels trackers sont pris en charge ?",
        answer: "Linear, GitHub Issues ou de simples fichiers locaux.",
      },
      {
        question: "Et si la CI échoue ?",
        answer: "La vague a droit à quelques tentatives de correction, puis elle vous attend.",
      },
      {
        question: "Comment arrêter une vague ?",
        answer: "Signalez un ticket. Rien n'est fusionné tant qu'un ticket est signalé.",
      },
      {
        question: "emet est-il fait par Anthropic ?",
        answer: "Non. emet n'est ni affilié à Anthropic ni approuvé par Anthropic.",
      },
    ],
    more: "Plus de questions",
  },
  about: {
    heading: "Pourquoi il s'appelle emet",
    lineOne: "Vérité en hébreu. Un golem est de l'argile animée par ce mot.",
    lineTwo:
      "Effacez une lettre et il s'arrête. Ici, rien n'est fusionné quand quelque chose est signalé.",
    caption: "Le golem d'emet, peint.",
    role: "Mainteneur",
    alt: "Un portrait peint en gros plan du golem emet sur sa butte herbeuse à la lumière de l'heure dorée, texture de mousse et d'argile, une petite pousse sur la tête.",
  },
  closing: {
    heading: "Essayez-le dans un dépôt",
    action: "Installer emet",
    alt: "Une vallée sous une brume matinale basse, avec un soleil pâle et un ciel pastel.",
  },
  footer: {
    description: "Plugin pour Claude Code.",
    notice: "Non affilié à Anthropic et non approuvé par Anthropic",
    docs: "Docs",
    whatsNew: "Nouveautés",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Peintures générées par IA à partir de prompts du mainteneur.",
    ci: "CI",
    openssf: "OpenSSF Best Practices",
    security: "Sécurité",
    contributing: "Contribuer",
    languages: "Langues",
    builtBy: "Créé par AndryOre",
  },
  share: {
    ogAlt: "emet : de la spécification au merge, avec une seule approbation.",
  },
} satisfies UiStrings;
