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
  },
  hero: {
    name: "emet",
    lineOne: "De la especificación al merge,",
    lineTwo: "con una sola aprobación.",
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
    request: "add dark mode to the settings page",
    alt: "Un valle pintado con luz dorada, un pequeño gólem de arcilla sobre una loma cubierta de hierba por encima de campos en terrazas.",
  },
  showcase: {
    heading: "La oleada se integra",
    headingHeld: "La oleada espera",
    status: "Oleada 1 revisada. CI superado. Integrada, 4 tickets cerrados.",
    statusHeld: "Oleada 1 retenida: un ticket marcado. No se integró nada.",
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
  about: {
    heading: "Por qué se llama emet",
    lineOne: "En hebreo, verdad. Un gólem es arcilla que cobra vida con esa palabra.",
    lineTwo: "Borra una letra y se detiene. Aquí, nada se integra cuando algo está marcado.",
    signature: "AndryOre, Mantenedor",
    alt: "Un retrato pintado de cerca del gólem emet sobre su loma cubierta de hierba, con luz de hora dorada, textura de musgo y arcilla y un pequeño brote en la cabeza.",
  },
  closing: {
    heading: "Pruébalo en un repositorio",
    action: "Instalar emet",
    alt: "Un valle bajo una neblina matinal baja, con un sol pálido y un cielo en tonos pastel.",
  },
  footer: {
    description: "Plugin para Claude Code.",
    notice: "Not affiliated with or endorsed by Anthropic",
    docs: "Documentación",
    whatsNew: "Novedades",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Pinturas generadas con IA a partir de prompts del mantenedor.",
  },
} satisfies UiStrings;
