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
    menu: "Menu",
    close: "Fechar",
    skip: "Ir para o conteúdo",
  },
  theme: {
    label: "Tema",
    light: "Claro",
    dark: "Escuro",
    system: "Sistema",
  },
  hero: {
    name: "emet",
    lineOne: "Da ideia ao merge,",
    lineTwo: "uma só aprovação.",
    sentence:
      "Um plugin para o Claude Code e o Codex. Da ideia à mudança integrada, com uma única aprovação.",
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
    request: "build the Website",
    youType: "você digita",
    emetReplies: "emet responde",
    alt: "O vale onde três riachos se juntam em um rio.",
    merged: "Mesclado",
  },
  showcase: {
    heading: "A onda é integrada",
    headingHeld: "A onda espera",
    status: "Onda 2 revisada. CI aprovada. Integrada, 3 tickets fechados.",
    statusHeld: "Onda 2 retida: um ticket sinalizado. Nada foi integrado.",
    flag: "Sinalizar o ticket #255",
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
  stats: {
    label: "Em números",
    items: [
      { value: "3", label: "rastreadores", detail: "Linear, GitHub Issues ou arquivos locais" },
      { value: "10", label: "idiomas", detail: "Inglês e nove traduções" },
      { value: "1", label: "aprovação", detail: "Spec e tickets, antes de qualquer código" },
      { value: "MIT", label: "licença", detail: "Livre para usar e fazer fork" },
    ],
  },
  faq: {
    heading: "Perguntas",
    items: [
      {
        question: "O que eu preciso?",
        answer:
          "Claude Code ou a CLI do Codex, git, gh autenticado e o plugin mattpocock-skills, em Linux ou macOS.",
      },
      {
        question: "Funciona no Windows?",
        answer: "Somente pelo WSL. Linux e macOS funcionam nativamente.",
      },
      {
        question: "Quais rastreadores ele suporta?",
        answer: "Linear, GitHub Issues ou simples arquivos locais.",
      },
      {
        question: "E se o CI falhar?",
        answer: "A onda recebe algumas tentativas de correção e depois espera por você.",
      },
      {
        question: "Como paro uma onda?",
        answer: "Sinalize um ticket. Nada é mesclado enquanto algo estiver sinalizado.",
      },
      {
        question: "O emet é feito pela Anthropic?",
        answer: "Não. O emet não é afiliado à Anthropic nem endossado por ela.",
      },
    ],
    more: "Mais perguntas",
  },
  about: {
    heading: "Por que se chama emet",
    lineOne: "Verdade em hebraico. Um golem é argila trazida à vida por essa palavra.",
    lineTwoBefore: "Apague a primeira letra e vira met, morto. O golem para. Aqui, ",
    flag: "nada é integrado quando algo está sinalizado",
    lineTwoAfter: ".",
    truth: "verdade",
    dead: "morto",
    wordLabel: "emet, verdade, vira met, morto, sem a primeira letra",
    caption: "O golem do emet, pintado.",
    role: "Mantenedor",
    alt: "Um retrato pintado de perto do golem emet em seu outeiro gramado na luz da hora dourada, com textura de musgo e argila e um pequeno broto na cabeça.",
  },
  closing: {
    heading: "Experimente em um repositório",
    action: "Instalar o emet",
    alt: "Um vale sob uma névoa baixa da manhã, com um sol pálido e um céu em tons pastel.",
  },
  footer: {
    description: "Plugin para o Claude Code e o Codex.",
    notice: "Sem afiliação com a Anthropic nem endosso dela",
    docs: "Documentação",
    whatsNew: "Novidades",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Pinturas geradas com IA a partir de prompts do mantenedor.",
    ci: "CI",
    openssf: "OpenSSF Best Practices",
    security: "Segurança",
    contributing: "Contribuir",
    product: "Produto",
    trust: "Confiança",
    builtBy: "Criado por AndryOre",
  },
  share: {
    ogAlt: "emet: da especificação ao merge, com uma única aprovação.",
  },
} satisfies UiStrings;
