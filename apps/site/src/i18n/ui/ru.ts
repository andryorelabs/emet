import type { UiStrings } from "./en";

/**
 * Russian strings of the home page. AI translation, not human reviewed.
 */
export const ru = {
  meta: {
    title: "emet: От спецификации до мержа с одним одобрением.",
    description:
      "От спецификации до мержа с одним одобрением: параллельные воркеры в изолированных worktree, ревью на каждую волну, зелёный CI до мержа.",
  },
  nav: {
    label: "Основное",
    docs: "Документация",
    whatsNew: "Что нового",
    github: "GitHub",
    language: "Язык",
    home: "emet, главная",
    menu: "Меню",
    close: "Закрыть",
    skip: "Перейти к содержимому",
  },
  theme: {
    label: "Тема",
    light: "Светлая",
    dark: "Тёмная",
    system: "Системная",
  },
  hero: {
    name: "emet",
    lineOne: "От идеи до мержа,",
    lineTwo: "одно одобрение.",
    sentence: "Плагин для Claude Code и Codex. От идеи до слитого изменения с одним одобрением.",
    install: "Установить emet",
    readDocs: "Читать документацию",
    alt: "Нарисованная долина, где три ручья сливаются в одну реку, с террасными полями и маленьким глиняным големом на травянистом пригорке под спокойным небом.",
  },
  how: {
    heading: "От идеи до мержа",
    install: "Установите.",
    describe: "Опишите.",
    land: "Смотрите, как он сливается.",
    tabPlugin: "Плагин",
    tabClone: "Из клона",
    request: "build the Website",
    youType: "вы вводите",
    emetReplies: "emet отвечает",
    alt: "Долина, где три ручья сливаются в одну реку.",
    merged: "Влито",
  },
  showcase: {
    heading: "Волна сливается",
    headingHeld: "Волна ждёт",
    status: "Волна 2 проверена. CI пройден. Слита, закрыто 3 тикета.",
    statusHeld: "Волна 2 удержана: один тикет помечен. Ничего не слито.",
    flag: "Пометить тикет #255",
  },
  features: {
    heading: "Что защищает запуск",
    notes: [
      { title: "Одно одобрение", line: "Спецификация и тикеты, проверенные один раз." },
      { title: "Ревью на каждую волну", line: "Ревьюер проверяет каждую волну." },
      { title: "С пометкой ничего не сливается", line: "Одна пометка удерживает всю волну." },
      {
        title: "Зелёный CI до мержа",
        line: "Упавшие проверки получают несколько исправлений, затем ждут вас.",
      },
      { title: "Изолированные worktree", line: "Один git worktree на воркера." },
      { title: "Ваш трекер или никакого", line: "Linear, GitHub Issues или локальные файлы." },
    ],
  },
  stats: {
    label: "В цифрах",
    items: [
      { value: "3", label: "трекера", detail: "Linear, GitHub Issues или локальные файлы" },
      { value: "10", label: "языков", detail: "Английский и девять переводов" },
      { value: "1", label: "одобрение", detail: "Спецификация и тикеты до любого кода" },
      { value: "MIT", label: "лицензия", detail: "Свободно использовать и форкать" },
    ],
  },
  faq: {
    heading: "Вопросы",
    items: [
      {
        question: "Что мне нужно?",
        answer:
          "Claude Code или Codex CLI, git, авторизованный gh и плагин mattpocock-skills, на Linux или macOS.",
      },
      {
        question: "Работает ли на Windows?",
        answer: "Только через WSL. Linux и macOS работают нативно.",
      },
      {
        question: "Какие трекеры поддерживаются?",
        answer: "Linear, GitHub Issues или обычные локальные файлы.",
      },
      {
        question: "Что, если CI упадёт?",
        answer: "Волна получает несколько попыток исправления, затем ждёт вас.",
      },
      {
        question: "Как остановить волну?",
        answer: "Пометьте тикет флагом. Пока есть флаг, ничего не сливается.",
      },
      {
        question: "emet сделан Anthropic?",
        answer: "Нет. emet не связан с Anthropic и не одобрен Anthropic.",
      },
    ],
    more: "Другие вопросы",
  },
  about: {
    heading: "Почему он называется emet",
    lineOne: "На иврите это истина. Голем — глина, оживлённая этим словом.",
    lineTwoBefore: "Сотрите первую букву, и получится met, «мёртв». Голем остановится. Здесь ",
    flag: "ничего не сливается, пока есть пометка",
    lineTwoAfter: ".",
    truth: "истина",
    dead: "мёртв",
    wordLabel: "emet, истина, без первой буквы становится met, мёртв",
    caption: "Голем emet, нарисованный.",
    role: "Мейнтейнер",
    alt: "Нарисованный крупный портрет голема emet на травянистом пригорке в свете золотого часа, фактура мха и глины, маленький росток на голове.",
  },
  closing: {
    heading: "Попробуйте в одном репозитории",
    action: "Установить emet",
    alt: "Долина в низком утреннем тумане с бледным солнцем и пастельным небом.",
  },
  footer: {
    description: "Плагин для Claude Code и Codex.",
    notice: "Не связан с Anthropic и не одобрен Anthropic",
    docs: "Документация",
    whatsNew: "Что нового",
    github: "GitHub",
    legal: "2026, MIT.",
    paintings: "Картины созданы с помощью ИИ по промптам мейнтейнера.",
    ci: "CI",
    openssf: "OpenSSF Best Practices",
    security: "Безопасность",
    contributing: "Участие в проекте",
    product: "Продукт",
    trust: "Доверие",
    builtBy: "Создал AndryOre",
  },
  share: {
    ogAlt: "emet: от спецификации до слияния, с одним подтверждением.",
  },
} satisfies UiStrings;
