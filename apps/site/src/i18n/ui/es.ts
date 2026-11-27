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
      "Un flujo de trabajo para Claude Code y Codex. De la idea al cambio integrado, con una sola aprobación.",
    install: "Instalar emet",
    readDocs: "Leer la documentación",
    alt: "Un valle pintado donde tres arroyos se unen en un río, con campos en terrazas y un pequeño gólem de arcilla sobre una loma cubierta de hierba bajo un cielo en calma.",
  },
  how: {
    heading: "De la idea al merge",
    install: "Instálalo.",
    describe: "Descríbelo.",
    land: "Míralo integrarse.",
    tabClone: "Desde un clon",
    request: "build the Website",
    youType: "tú escribes",
    emetReplies: "emet responde",
    alt: "El valle donde tres arroyos se unen en un río.",
    merged: "Fusionado",
    otherInstall: "Otras formas de instalar",
    wave: "Oleada {n}",
    waveLine: "oleada {n}",
    caption:
      "Cada oleada se une a una rama de la spec. La spec se integra como una sola pull request.",
    prTitle: "Spec 41: modo oscuro para los ajustes",
    checks: "checks superados",
    open: "Abierto",
    closes: "Cierra",
  },
  showcase: {
    heading: "La spec se integra",
    headingHeld: "La spec espera",
    status:
      "Spec 41 revisada. CI superado. Integrada como una sola pull request, 4 tickets cerrados.",
    statusHeld: "Spec 41 retenida: un ticket marcado. No se integró nada.",
    flag: "Marcar el ticket #44",
    laneReview: "revisión",
    laneHeld: "retenido",
  },
  features: {
    heading: "Lo que protege una ejecución",
    scenes: {
      approve: "Aprobar",
      approveName: "Aprobar: mantén pulsado",
      approved: "Aprobado",
      gateName: "Puerta de revisión: 1 comentario, resuelto",
      gateTip: "oleada 2: 1 comentario, resuelto",
    },
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
    extra: [
      { title: "Modo rápido para cambios pequeños", docs: "/docs/reference/cli/" },
      { title: "Recuerda lo que funcionó", docs: "/docs/reference/cli/" },
      { title: "Dos revisores para cambios de riesgo", docs: "/docs/reference/configuration/" },
      { title: "Te avisa cuando te necesita", docs: "/docs/how-to/check-a-fleet/" },
      { title: "Se instala y se desinstala limpiamente", docs: "/docs/start/install/" },
    ],
  },
  stats: {
    label: "En cifras",
    items: [
      {
        value: "3",
        label: "gestores de tareas",
        detail: "Linear, GitHub Issues o archivos locales",
      },
      { value: "10", label: "idiomas", detail: "Inglés y nueve traducciones" },
      { value: "1", label: "aprobación", detail: "Spec y tickets, antes de escribir código" },
      { value: "MIT", label: "licencia", detail: "Libre para usar y bifurcar" },
    ],
  },
  faq: {
    heading: "Preguntas",
    items: [
      {
        question: "¿Cómo desinstalo emet?",
        answer:
          "Ejecuta `emet uninstall`. Elimina lo que emet instaló y conserva cualquier archivo que hayas editado. Añade `--dry-run` para verlo antes.",
      },
      {
        question: "¿Qué es el modo rápido?",
        answer:
          "Usa `--quick` para un cambio pequeño. Reduce la entrevista a una ronda y ejecuta un ticket, una revisión y una integración.",
      },
      {
        question: "¿Qué necesito?",
        answer:
          "Claude Code o Codex CLI, git, gh autenticado y el plugin mattpocock-skills, en Linux o macOS.",
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
        question: "¿emet lo hace Anthropic u OpenAI?",
        answer: "No. emet no está afiliado a Anthropic ni a OpenAI, ni cuenta con su respaldo.",
      },
    ],
    more: "Más preguntas",
  },
  about: {
    heading: "Por qué se llama emet",
    lineOne: "En hebreo, verdad. Un gólem es arcilla que cobra vida con esa palabra.",
    lineTwoBefore: "Borra la primera letra y se lee met, muerto. El gólem se detiene. Aquí, ",
    flag: "nada se integra cuando algo está marcado",
    lineTwoAfter: ".",
    truth: "verdad",
    dead: "muerto",
    wordLabel: "emet, verdad, se convierte en met, muerto, sin su primera letra",
    caption: "El gólem de emet, pintado.",
    role: "Mantenedor",
    alt: "Un retrato pintado de cerca del gólem emet sobre su loma cubierta de hierba, con luz de hora dorada, textura de musgo y arcilla y un pequeño brote en la cabeza.",
  },
  closing: {
    heading: "Pruébalo en un repositorio",
    action: "Instalar emet",
    alt: "Un valle bajo una neblina matinal baja, con un sol pálido y un cielo en tonos pastel.",
  },
  companion: {
    label: "Compañero golem de emet, pulsa para abrir el menú",
    menu: "Pregunta a emet",
    sleep: "Descansando. Desplázate para despertarme.",
    work: "Lámpara encendida. Leyendo la especificación.",
    wait: "En espera. Nada se fusiona.",
    done: "Listo. Una aprobación, fusionado.",
    questions: [
      {
        question: "¿Qué es emet?",
        answer:
          "Un flujo de trabajo para Claude Code y Codex. De la idea al cambio fusionado, con una sola aprobación.",
      },
      {
        question: "¿Cómo lo instalo?",
        answer: "curl -fsSL https://emet.andryore.dev/install.sh | sh",
      },
      { question: "¿Es gratis?", answer: "Sí. emet tiene licencia MIT." },
      { question: "¿Dónde está la documentación?", answer: "Está a un clic." },
    ],
    docs: "Abrir la documentación",
  },
  footer: {
    description: "Flujo de trabajo para Claude Code y Codex.",
    notice: "Sin afiliación ni respaldo de Anthropic u OpenAI",
    docs: "Documentación",
    whatsNew: "Novedades",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Pinturas generadas con IA a partir de prompts del mantenedor.",
    ci: "CI",
    openssf: "OpenSSF Best Practices",
    security: "Seguridad",
    contributing: "Cómo contribuir",
    product: "Producto",
    trust: "Confianza",
    builtBy: "Creado por AndryOre",
  },
  links: {
    newTab: "(se abre en una pestaña nueva)",
  },
  share: {
    ogAlt: "emet: de la especificación al merge, con una sola aprobación.",
  },
} satisfies UiStrings;
