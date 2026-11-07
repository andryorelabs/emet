import type { UiStrings } from "./en";

/**
 * Brazilian Portuguese strings of the home page. AI translation, not human
 * reviewed.
 */
export const ptBR = {
  meta: {
    title: "emet: Da especificação ao merge, com uma única aprovação.",
    description:
      "Da especificação ao merge com uma única aprovação: workers em paralelo em worktrees isolados, uma revisão por onda, CI verde antes do merge.",
  },
  nav: {
    label: "Principal",
    docs: "Documentação",
    whatsNew: "Novidades",
    github: "GitHub",
    language: "Idioma",
    home: "emet, início",
  },
  hero: {
    name: "emet",
    lineOne: "Da especificação ao merge,",
    lineTwo: "com uma única aprovação.",
    sentence:
      "Um plugin para o Claude Code. Da ideia à mudança integrada, com uma única aprovação.",
    install: "Instalar o emet",
    readDocs: "Ler a documentação",
    alt: "Um vale pintado onde três riachos se unem em um rio, com campos em terraços e um pequeno golem de argila em um outeiro gramado sob um céu calmo.",
  },
  how: {
    heading: "Da ideia ao merge",
    install: "Instale.",
    describe: "Descreva.",
    land: "Veja ser integrado.",
    tabPlugin: "Plugin",
    tabClone: "A partir de um clone",
    request: "add dark mode to the settings page",
    alt: "Um vale pintado em luz dourada, um pequeno golem de argila em um outeiro gramado acima de campos em terraços.",
  },
  showcase: {
    heading: "A onda é integrada",
    headingHeld: "A onda espera",
    status: "Onda 1 revisada. CI aprovada. Integrada, 4 tickets fechados.",
    statusHeld: "Onda 1 retida: um ticket sinalizado. Nada foi integrado.",
    flag: "Sinalizar o ticket #44",
  },
  features: {
    heading: "O que uma execução protege",
    notes: [
      { title: "Uma única aprovação", line: "Especificação e tickets, revisados uma vez." },
      { title: "Uma revisão por onda", line: "Um revisor confere cada onda." },
      { title: "Nada é integrado se sinalizado", line: "Um sinal retém a onda inteira." },
      {
        title: "CI verde antes do merge",
        line: "Checks que falham recebem algumas correções, depois esperam por você.",
      },
      { title: "Worktrees isolados", line: "Um git worktree por worker." },
      { title: "Seu tracker, ou nenhum", line: "Linear, GitHub Issues ou arquivos locais." },
    ],
  },
  about: {
    heading: "Por que se chama emet",
    lineOne: "Verdade em hebraico. Um golem é argila trazida à vida por essa palavra.",
    lineTwo: "Apague uma letra e ele para. Aqui, nada é integrado quando algo está sinalizado.",
    signature: "AndryOre, Mantenedor",
    alt: "Um retrato pintado de perto do golem emet em seu outeiro gramado na luz da hora dourada, com textura de musgo e argila e um pequeno broto na cabeça.",
  },
  closing: {
    heading: "Experimente em um repositório",
    action: "Instalar o emet",
    alt: "Um vale sob uma névoa baixa da manhã, com um sol pálido e um céu em tons pastel.",
  },
  footer: {
    description: "Plugin para o Claude Code.",
    notice: "Not affiliated with or endorsed by Anthropic",
    docs: "Documentação",
    whatsNew: "Novidades",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Pinturas geradas com IA a partir de prompts do mantenedor.",
  },
} satisfies UiStrings;
