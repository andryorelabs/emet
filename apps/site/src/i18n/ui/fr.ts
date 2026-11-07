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
  },
  hero: {
    name: "emet",
    lineOne: "De la spécification au merge,",
    lineTwo: "en une seule approbation.",
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
    request: "add dark mode to the settings page",
    alt: "Une vallée peinte dans une lumière dorée, un petit golem d'argile sur une butte herbeuse au-dessus de champs en terrasses.",
  },
  showcase: {
    heading: "La vague est fusionnée",
    headingHeld: "La vague attend",
    status: "Vague 1 relue. CI réussie. Fusionnée, 4 tickets fermés.",
    statusHeld: "Vague 1 retenue : un ticket signalé. Rien n'a été fusionné.",
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
  about: {
    heading: "Pourquoi il s'appelle emet",
    lineOne: "Vérité en hébreu. Un golem est de l'argile animée par ce mot.",
    lineTwo:
      "Effacez une lettre et il s'arrête. Ici, rien n'est fusionné quand quelque chose est signalé.",
    signature: "AndryOre, Mainteneur",
    alt: "Un portrait peint en gros plan du golem emet sur sa butte herbeuse à la lumière de l'heure dorée, texture de mousse et d'argile, une petite pousse sur la tête.",
  },
  closing: {
    heading: "Essayez-le dans un dépôt",
    action: "Installer emet",
    alt: "Une vallée sous une brume matinale basse, avec un soleil pâle et un ciel pastel.",
  },
  footer: {
    description: "Plugin pour Claude Code.",
    notice: "Not affiliated with or endorsed by Anthropic",
    docs: "Docs",
    whatsNew: "Nouveautés",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Peintures générées par IA à partir de prompts du mainteneur.",
  },
} satisfies UiStrings;
