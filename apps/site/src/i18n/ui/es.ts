import type { UiStrings } from "./en";

/**
 * Spanish strings of the home page. AI translation, not human reviewed.
 */
export const es = {
  meta: {
    title: "emet: De la especificación al merge, con una sola aprobación.",
    description:
      "De la especificación al merge con una sola aprobación: workers en paralelo en worktrees aislados, una revisión por oleada, CI en verde antes del merge.",
  },
  nav: {
    label: "Principal",
    docs: "Documentación",
    whatsNew: "Novedades",
    github: "GitHub",
    language: "Idioma",
    home: "emet, inicio",
    menu: "Menú",
    close: "Cerrar",
    skip: "Saltar al contenido",
  },
  theme: {
    label: "Tema",
    light: "Claro",
    dark: "Oscuro",
    system: "Sistema",
  },
  hero: {
    name: "emet",
    lineOne: "De la idea al merge,",
    lineTwo: "con una aprobación.",
    sentence:
      "Un plugin para Claude Code. De la idea al cambio integrado, con una sola aprobación.",
    install: "Instalar emet",
    readDocs: "Leer la documentación",
    alt: "Un valle pintado donde tres arroyos se unen en un río, con campos en terrazas y un pequeño gólem de arcilla sobre una loma cubierta de hierba bajo un cielo en calma.",
  },
  how: {
    heading: "De la idea al merge",
    install: "Instálalo.",
    describe: "Descríbelo.",
    land: "Míralo integrarse.",
    tabPlugin: "Plugin",
    tabClone: "Desde un clon",
    request: "build the Website",
    alt: "Un valle pintado con luz dorada, un pequeño gólem de arcilla sobre una loma cubierta de hierba por encima de campos en terrazas.",
  },
  showcase: {
    heading: "La oleada se integra",
    headingHeld: "La oleada espera",
    status: "Oleada 2 revisada. CI superado. Integrada, 3 tickets cerrados.",
    statusHeld: "Oleada 2 retenida: un ticket marcado. No se integró nada.",
    flag: "Marcar el ticket #255",
  },
  features: {
    heading: "Lo que protege una ejecución",
    notes: [
      { title: "Una sola aprobación", line: "Especificación y tickets, revisados una vez." },
      { title: "Una revisión por oleada", line: "Un revisor comprueba cada oleada." },
      { title: "Nada se integra si hay una marca", line: "Una marca retiene toda la oleada." },
      {
        title: "CI en verde antes del merge",
        line: "Si los checks fallan, se intentan unas correcciones y luego se espera tu decisión.",
      },
      { title: "Worktrees aislados", line: "Un git worktree por worker." },
      { title: "Tu tracker, o ninguno", line: "Linear, GitHub Issues o archivos locales." },
    ],
  },
  stats: {
    label: "En cifras",
    items: [
      { value: "3", label: "gestores de tareas" },
      { value: "10", label: "idiomas" },
      { value: "1", label: "aprobación" },
      { value: "MIT", label: "licencia" },
    ],
  },
  faq: {
    heading: "Preguntas",
    items: [
      {
        question: "¿Qué necesito?",
        answer: "Claude Code, git, gh autenticado y el plugin mattpocock-skills, en Linux o macOS.",
      },
      {
        question: "¿Funciona en Windows?",
        answer: "Solo a través de WSL. Linux y macOS funcionan de forma nativa.",
      },
      {
        question: "¿Qué gestores de tareas admite?",
        answer: "Linear, GitHub Issues o simples archivos locales.",
      },
      {
        question: "¿Qué pasa si falla el CI?",
        answer: "La oleada recibe unos cuantos intentos de arreglo y luego te espera.",
      },
      {
        question: "¿Cómo detengo una oleada?",
        answer: "Marca un ticket. Nada se fusiona mientras haya algo marcado.",
      },
      {
        question: "¿emet lo hace Anthropic?",
        answer: "No. emet no está afiliado a Anthropic ni cuenta con su respaldo.",
      },
    ],
    more: "Más preguntas",
  },
  about: {
    heading: "Por qué se llama emet",
    lineOne: "En hebreo, verdad. Un gólem es arcilla que cobra vida con esa palabra.",
    lineTwo: "Borra una letra y se detiene. Aquí, nada se integra cuando algo está marcado.",
    caption: "El gólem de emet, pintado.",
    role: "Mantenedor",
    alt: "Un retrato pintado de cerca del gólem emet sobre su loma cubierta de hierba, con luz de hora dorada, textura de musgo y arcilla y un pequeño brote en la cabeza.",
  },
  closing: {
    heading: "Pruébalo en un repositorio",
    action: "Instalar emet",
    alt: "Un valle bajo una neblina matinal baja, con un sol pálido y un cielo en tonos pastel.",
  },
  footer: {
    description: "Plugin para Claude Code.",
    notice: "Sin afiliación ni respaldo de Anthropic",
    docs: "Documentación",
    whatsNew: "Novedades",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Pinturas generadas con IA a partir de prompts del mantenedor.",
    ci: "CI",
    openssf: "OpenSSF Best Practices",
    security: "Seguridad",
    contributing: "Cómo contribuir",
    languages: "Idiomas",
    builtBy: "Creado por AndryOre",
  },
  share: {
    ogAlt:
      "emet: de la especificación al merge, con una sola aprobación, sobre un valle pintado con un pequeño gólem de arcilla.",
  },
} satisfies UiStrings;
