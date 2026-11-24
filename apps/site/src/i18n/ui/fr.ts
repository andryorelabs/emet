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
      "Un plugin pour Claude Code et Codex. De l'idée au changement fusionné, en une seule approbation.",
    install: "Installer emet",
    readDocs: "Lire la documentation",
    alt: "Une vallée peinte où trois ruisseaux se joignent en une rivière, avec des champs en terrasses et un petit golem d'argile sur une butte herbeuse sous un ciel calme.",
  },
  how: {
    heading: "De l'idée au merge",
    install: "Installez.",
    describe: "Décrivez.",
    land: "Regardez-le atterrir.",
    tabClone: "Depuis un clone",
    request: "build the Website",
    youType: "vous tapez",
    emetReplies: "emet répond",
    alt: "La vallée où trois ruisseaux se jettent dans une rivière.",
    merged: "Fusionné",
    otherInstall: "Autres façons d'installer",
    wave: "Vague {n}",
    caption:
      "Chaque vague rejoint une branche de spec. La spec atterrit en une seule pull request.",
    prTitle: "Spec 41 : mode sombre pour les réglages",
    checks: "checks réussis",
  },
  showcase: {
    heading: "La spec est fusionnée",
    headingHeld: "La spec attend",
    status: "Spec 41 relue. CI réussie. Fusionnée en une seule pull request, 4 tickets fermés.",
    statusHeld: "Spec 41 retenue : un ticket signalé. Rien n'a été fusionné.",
    flag: "Signaler le ticket #44",
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
    extra: [
      {
        title: "Mode rapide pour les petits changements",
        line: "Une option saute l'entretien et lance un ticket, une relecture et un atterrissage.",
      },
      {
        title: "Se souvient de ce qui a marché",
        line: "Les leçons de chaque exécution sont enregistrées et rappelées à la suivante.",
      },
      {
        title: "Deux relecteurs pour les changements risqués",
        line: "Le travail à risque élevé reçoit un second relecteur avant d'atterrir.",
      },
      {
        title: "Vous prévient quand il a besoin de vous",
        line: "Une alerte quand une exécution attend votre approbation ou est bloquée.",
      },
      {
        title: "S'installe et se désinstalle proprement",
        line: "Retire tout ce qu'emet a installé et garde chaque fichier que vous avez modifié.",
      },
    ],
  },
  stats: {
    label: "En chiffres",
    items: [
      { value: "3", label: "trackers", detail: "Linear, GitHub Issues ou fichiers locaux" },
      { value: "10", label: "langues", detail: "L'anglais et neuf traductions" },
      { value: "1", label: "validation", detail: "Spec et tickets, avant tout code" },
      { value: "MIT", label: "licence", detail: "Libre d'utilisation et de fork" },
    ],
  },
  faq: {
    heading: "Questions",
    items: [
      {
        question: "Comment désinstaller emet ?",
        answer:
          "Lancez `emet uninstall`. La commande retire ce qu'emet a installé et garde chaque fichier que vous avez modifié. Ajoutez `--dry-run` pour prévisualiser.",
      },
      {
        question: "Qu'est-ce que le mode rapide ?",
        answer:
          "Passez `--quick` pour un petit changement. Il saute l'entretien et lance un ticket, une relecture et un atterrissage.",
      },
      {
        question: "De quoi ai-je besoin ?",
        answer:
          "Claude Code ou la CLI Codex, git, un gh authentifié et le plugin mattpocock-skills, sous Linux ou macOS.",
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
        question: "emet est-il fait par Anthropic ou OpenAI ?",
        answer:
          "Non. emet n'est ni affilié à Anthropic ou OpenAI ni approuvé par Anthropic ou OpenAI.",
      },
    ],
    more: "Plus de questions",
  },
  about: {
    heading: "Pourquoi il s'appelle emet",
    lineOne: "Vérité en hébreu. Un golem est de l'argile animée par ce mot.",
    lineTwoBefore: "Effacez la première lettre et il se lit met, mort. Le golem s'arrête. Ici, ",
    flag: "rien n'est fusionné quand quelque chose est signalé",
    lineTwoAfter: ".",
    truth: "vérité",
    dead: "mort",
    wordLabel: "emet, vérité, devient met, mort, sans sa première lettre",
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
    description: "Plugin pour Claude Code et Codex.",
    notice: "Non affilié à Anthropic ou OpenAI et non approuvé par Anthropic ou OpenAI",
    docs: "Docs",
    whatsNew: "Nouveautés",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Peintures générées par IA à partir de prompts du mainteneur.",
    ci: "CI",
    openssf: "OpenSSF Best Practices",
    security: "Sécurité",
    contributing: "Contribuer",
    product: "Produit",
    trust: "Confiance",
    builtBy: "Créé par AndryOre",
  },
  links: {
    newTab: "(s'ouvre dans un nouvel onglet)",
  },
  share: {
    ogAlt: "emet : de la spécification au merge, avec une seule approbation.",
  },
} satisfies UiStrings;
