---
title: Справочник по CLI
description: Каждая подкоманда emet, гейты и записи, коды завершения и переменные окружения.
seoTitle: Справочник по CLI emet
sourceHash: cde063f67e8e54d7
---

Каждая подкоманда `emet`, гейты и записи, коды завершения и переменные окружения. Термины соответствуют [GLOSSARY.md](../../GLOSSARY.md). Назад к [README](../../README.md). Каждая команда выводит справку по использованию с `--help`.

## Подкоманды

Три слэш-команды оборачивают CLI внутри Claude Code: `/emet:run` (конвейер), `/emet:init` (`emet init`) и `/emet:doctor` (`emet doctor .`). В Codex это навыки `$emet:run`, `$emet:init` и `$emet:doctor`. Для `emet` в обычном терминале нужен `emet self install`; иначе выполняйте `! emet <subcommand>` внутри сессии.

`emet <command> [...args]`. `emet --version` выводит версию.

В любом git-репозитории:

```bash
emet init       # autodetects package manager, trunk branch, tracker kind
emet preflight # confirms the repo is dispatch-ready
```

`emet init` оставляет маркер `TODO(emet):` в сгенерированных файлах `docs/agents/*.md` для всего, что не может определить сам (общая блокировка тестовой базы данных, владелец схемы и так далее). Заполните их; пока остаётся хотя бы один, `emet preflight` отказывается запускать диспетчеризацию.

Затем, внутри Claude Code (в Codex используйте `$emet:run` с теми же аргументами):

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## Настройка и аудит

### `emet migrate`

Переименовывает устаревший репозиторий под имена emet.

- `--dry-run`

### `emet init`

Автоматически определяет менеджер пакетов, основную ветку, вид трекера и режим after-spec (см. [`handoff.afterSpec`](configuration.md#handoff)). Задаёт [`schema.ownedPaths`](configuration.md#schema), если находит схему Prisma (`prisma/schema.prisma` или папку `prisma/schema/`) или папку миграций Drizzle (`drizzle/` рядом с `drizzle.config.*`), и записывает `emet.config.json` и файлы `docs/agents/*.md`.

- `--tracker linear|github|local`: `--tracker local` настраивает локальный трекер.
- `--after-spec release|promote|none`
- `--force`

### `emet doctor`

Аудит любого числа репозиториев за раз, только на чтение; по умолчанию текущий каталог.

- `--all`
- `<path> ...`: репозитории для аудита.

Для репозитория, где настроен [`verify.browser`](configuration.md#verify), он также сообщает необязательную находку об `agent-browser`: отсутствующий бинарный файл даёт `indeterminate` (строка `optional:` с указанием, как установить), а когда бинарный файл есть, неуспешный `agent-browser doctor` отображается как предупреждение. Ни то, ни другое никогда не является ошибкой и не меняет код выхода. Репозиторий без `verify.browser` ничего не показывает.

#### Проверка флота

`emet doctor` проверяет несколько репозиториев сразу, только на чтение:

```bash
emet doctor ~/code/*
```

Для каждого репозитория отчёт показывает: корректный `emet.config.json`, наличие всех четырёх файлов `docs/agents/*.md`, отсутствие оставшихся маркеров `TODO(emet):`, действительно ли разрешаются команды из `commands.selfCheck`, а также результаты проверки зависимостей, специфичных для трекера этого репозитория (`gh`, Linear; см. [зависимости](dependencies.md#что-что-проверяет)).

Плагин mattpocock-skills и флаги внешних CLI проверяются один раз на весь обход, а не для каждого репозитория. Это `gh`, а также флаги хоста агента: `claude --bg` и `claude agents --json` в Claude Code, `codex exec --json` и `--output-schema` в Codex; проверяются через `--help`.

### `emet setup`

Предлагает необязательные установки через запросы readline.

- `--yes`
- `--with <ids>`
- `--list`
- `--json`
- `--dry-run`: сочетается с `--with`, `--yes` и `--json`. Для каждого выбранного пункта печатает запланированные шаги (или `already-present`) и ничего не меняет: не запускает команд, не записывает файлов и записей журнала и завершается с кодом 0.
- `--restore <id>`: откатывает один из двух пунктов, которые можно восстановить; см. [Журнал Setup и восстановление](#журнал-setup-и-восстановление).

Без TTY, а также с `--yes` или `--with` ничего не спрашивает и устанавливает ровно указанные пункты; без TTY и без `--with` ничего не устанавливает и выводит каталог `--list`. Каждый шаг сообщает `installed`, `already-present`, `skipped` или `failed`; одна ошибка не останавливает остальные, а код выхода равен 1, если что-то завершилось с ошибкой. `/emet:setup` — это точка входа плагина, он задаёт те же вопросы через `AskUserQuestion`. Каждый пункт с результатом `installed` записывается в журнал Setup.

Пункты:

- `mattpocock-skills` (по умолчанию включено), `engram`, `mascot`, `orca-pet` и `gh-auth`.
- `agent-browser` (по умолчанию выключено): выполняет `bun add -g agent-browser@latest`, затем `agent-browser install` и записывает `~/.agent-browser/config.json` с `contentBoundaries: true` и `maxOutput: 50000` только если этого файла нет. Затем выполняет `agent-browser doctor` и выводит предупреждение, если он завершился ошибкой. Никогда не закрепляет версию и никогда не передаёт `--with-deps`, поэтому при нехватке системных библиотек выводит команду, которую нужно выполнить вам.
- `context7` (по умолчанию выключено): выполняет `bun add -g ctx7@latest`, затем `ctx7 setup --cli --claude --yes`, а `ctx7 setup --cli --codex --yes` только если `codex` есть в PATH. Устанавливает CLI `ctx7` и его навык `find-docs`, а не MCP-сервер, никогда не закрепляет версию и выводит команду для ручного запуска, если шаг `ctx7 setup` завершился ошибкой. `ctx7` отправляет анонимные события использования, если не задано `CTX7_TELEMETRY_DISABLED=1`, а `CONTEXT7_API_KEY` в окружении имеет приоритет над учётной записью, сохранённой через `ctx7 login`.
- `firecrawl-local` (по умолчанию выключено): требует `cargo` и выполняет `cargo install firecrawl-local`, если бинарного файла нет. Затем регистрирует MCP-сервер Claude Code на уровне пользователя с `FIRECRAWL_CLOUD=search` и `--public-only`, заменяя прежнюю регистрацию с другими настройками. Scrape, crawl и map выполняются на машине, в Firecrawl Cloud уходит только веб-поиск, а частные адреса блокируются.
  - Он передаёт самый новый Chrome, скачанный `agent-browser`, как `FIRECRAWL_CHROME_PATH`.
  - В Linux, где AppArmor ограничивает непривилегированные пользовательские пространства имён, он выводит профиль AppArmor и команды `sudo` для его загрузки, потому что Firecrawl Local никогда не запускает Chrome без его песочницы.
  - Без пригодного Chrome страницы, которые отрисовываются с помощью JavaScript, приходят пустыми.
- `claude-settings`: рекомендуемые настройки Claude Code, применяются только при выборе, после резервной копии `settings.json` с отметкой времени.

#### Журнал Setup и восстановление

`emet setup` записывает каждый пункт, завершившийся `installed`, в `setup-ledger.json` в каталоге состояния в виде `{ id, at, undo }`. Пункт `already-present` ничего не записывает, а повторный `installed` того же id сохраняет состояние «до» из первой записи. Записи в журнал атомарны, а повреждённый журнал приводит к ошибке с указанием его пути и никогда не читается как пустой.

Записи `undo` хранят всё, что нужно для отката:

- `claude-settings`: прежний `model` (или его отсутствие), фактически добавленные deny-правила и путь к резервной копии.
- `firecrawl-local`: прежняя запись MCP на уровне пользователя (читается из `~/.claude.json` до выполнения `claude mcp remove`) и признак того, запускал ли emet `cargo install`.
- Плагины: id плагина.
- `orca-pet`: записанные файлы.
- `agent-browser`: глобальный пакет bun (и файл конфигурации, если его создал emet).
- `context7`: глобальный пакет bun.
- `engram`: формула brew и плагин.

`emet setup --restore <id>` принимает только `claude-settings` и `firecrawl-local`; любой другой id завершается с кодом 2.

- `claude-settings` после резервной копии с отметкой времени восстанавливает прежний `model` (или удаляет ключ, если его не было) и удаляет только те deny-правила, которые добавил emet. Если текущий `model` не совпадает с тем, что установил setup, он остаётся как есть, и печатается предупреждение.
- `firecrawl-local` выполняет `claude mcp remove firecrawl-local -s user`, а затем, если запись была сохранена, `claude mcp add-json firecrawl-local '<previous json>' -s user`.

Успешное восстановление удаляет запись из журнала; id без записи печатает `nothing to restore for <id>` и завершается с кодом 1.

`emet uninstall` откатывает каждую запись журнала так же: `claude-settings` и `firecrawl-local` как в `--restore`, плагины через `claude plugin uninstall <id>`, файлы `orca-pet` и созданную emet конфигурацию agent-browser удалением. Для глобальных пакетов brew, bun и cargo он печатает команду удаления (например, `bun remove -g ctx7`) и никогда её не выполняет, а `gh auth` не трогает вовсе. Каждая откатанная запись уходит из журнала, а сбой одного дополнения не останавливает остальные.

### `emet self install`

Автономная установка: `emet self install [latest|X.Y.Z]`.

- `--dry-run`: перечисляет все записи и ничего не записывает.
- `--force`: продолжает, даже если установлен плагин emet; без него команда отказывается работать, пока плагин установлен.
- `--from <checkout>`: воспроизводит установку из исходников Bun. Исходники CLI копируются в `~/.claude/emet`, а `~/.local/bin/emet` становится обёрткой, запускающей их через `bun`, поэтому `emet selftest` работает; без `bun` команда завершается ошибкой. Контрибьюторы используют `emet self install --from .`.

Помещает бинарный файл в `~/.local/share/emet/versions/<v>/emet` с символической ссылкой `~/.local/bin/emet`, записывает референсные промпты и `.install-manifest.json` в `~/.claude/emet/`, команды в `~/.claude/commands/emet/` и агентов в `~/.claude/agents/`.

Вносит хуки emet в `~/.claude/settings.json` (с резервной копией, чужие хуки не затрагиваются) и, если Codex присутствует, записывает навыки в `~/.agents/skills` и добавляет хуки в `$CODEX_HOME/hooks.json` (по умолчанию `~/.codex`; `config.toml` никогда не записывается, поэтому один раз подтвердите хуки через `/hooks`).

Повторный запуск ничего не меняет; изменённый файл сохраняется, а новая версия ложится рядом как `<file>.new`. Однострочный скрипт установки со страницы [Установка](../start/install.md) скачивает бинарный файл релиза, проверяет `SHA256SUMS` и запускает эту команду.

### `emet self update`

`emet self update [latest|X.Y.Z]` скачивает релиз, проверяет `SHA256SUMS` (и аттестацию, если есть `gh`) и подготавливает его. Замена символической ссылки и установленных файлов происходит, только когда не занят ни один слот воркера; иначе обновление остаётся отложенным до следующего запуска сессии. Сбой оставляет текущую версию нетронутой и записывается в журнал. Предыдущая версия сохраняется для отката, более старые удаляются. Для установок плагина команда ничего не делает.

- `--auto [off|on]`: то, что запускает хук `SessionStart`. Выполняется не чаще раза в сутки, в отсоединённом режиме и без вывода, если сети нет; `off` или `on` переключает его. `EMET_AUTO_UPDATE=0` тоже отключает его.

### `emet uninstall`

Удаляет установку `emet self install` и то, что добавил `emet setup`. Сначала строится весь план, затем он выполняется.

- `--dry-run`: печатает план и ничего не меняет.
- `--yes`: отключает подтверждение. При наличии TTY и без `--yes` задаётся один вопрос, а без TTY и без `--yes` печатается план, ничего не меняется и код выхода 0.
- `--purge`: дополнительно удаляет каталог состояния (`EMET_STATE_DIR`, иначе `XDG_STATE_HOME/emet`) и `~/.emet`; без него оба остаются.
- `--json`: печатает результат в JSON.

Что удаляется:

- Каждый файл из манифеста установки, текущий хеш которого совпадает с записанным, и его соседа `.new`; изменённые файлы остаются и перечисляются.
- Шим `~/.local/bin/emet`, только если это обёртка установки или символическая ссылка на `~/.claude/emet` либо `~/.local/share/emet/versions`; затем манифест и опустевшие каталоги.
- Из `~/.claude/settings.json` и `$CODEX_HOME/hooks.json` (по умолчанию `~/.codex`) все команды хуков emet в любом событии (`emet guard`, `emet setup --notice`, `emet whats-new --hook` и `emet self update --auto`). Все прочие хуки сохраняются, опустевшие группы и события убираются.
- Навыки Codex в `~/.agents/skills/emet/`, всё ещё совпадающие с этим emet (изменённые остаются и перечисляются), каталог версий `~/.local/share/emet/versions` и состояние установки `~/.local/share/emet/install.json`.
- Дополнения из журнала Setup (см. [Журнал Setup и восстановление](#журнал-setup-и-восстановление)).

Если резервная копия установки (`.pre-emet-guard-backup.`) в точности совпадает с остатком, восстанавливаются её байты; если ничего не осталось, файл удаляется; в остальных случаях сначала записывается резервная копия с отметкой времени.

Без манифеста и состояния установки (установка плагином) файлы пропускаются и печатается `claude plugin uninstall emet@emet-marketplace`; если `codex` есть в PATH, печатается и то, как удалить плагин Codex. Завершается с кодом 1, если какой-либо шаг не удался или файл, который нужно прочитать (манифест, настройки, журнал), нечитаем; при этом называется его путь.

### `emet whats-new`

Печатает одноразовое уведомление после обновления emet.

- `--hook`: форма, которую запускает хук `SessionStart`.

### `emet fleet`

Работает со всеми git-репозиториями с `emet.config.json` на один уровень ниже `--root` (по умолчанию `~/code`). См. [руководство по fleet](../how-to/check-a-fleet.md).

- `emet fleet list [--root <dir>] [--json]`: перечисляет репозитории вместе с `tracker.kind`, `handoff.autoChain` и `models.worker`.
- `emet fleet set <key> <value> [--root <dir>] [--dry-run]`: меняет один ключ конфигурации в каждом перечисленном репозитории, предварительно проверяя его загрузчиком конфигурации (недопустимое значение ничего не меняет и завершается с кодом 1).
- `emet fleet launch --feature <text> [--root <dir>] [--repos <a,b>] [--dry-run]`: открывает сессию `/emet:run --draft <text>` в каждом репозитории после проверок готовности `emet chain`. `--dry-run` выводит запланированные запуски, не запуская сессию.
- `emet fleet status [--json]`: читает глобальный журнал и выводит для каждого репозитория последнее состояние каждой сессии за последние 24 часа (кроме `ended`).

`fleet status` выводит по одной строке `<repo>: <b> blocked, <w> working, <i> idle` на репозиторий, сначала репозитории с заблокированными сессиями. `--json` выводит `{repos: [{repo, sessions: [{sessionId, state, blocked, since, runId}]}], blocked: <count>}`. Завершается с кодом 0 и при отсутствии сессий.

### `emet preflight`

Подтверждает, что репозиторий готов к диспетчеризации.

- `--run <id>`
- `--post-dispatch`

### `emet skill-path`

`emet skill-path <name>` выводит абсолютный путь `SKILL.md` навыка из mattpocock-skills. Завершается кодом 1, если навык не найден.

### `emet selftest`

Запускает собственные модульные тесты CLI. Только для установки из исходников; скомпилированный бинарный файл завершается кодом 1 и предлагает выполнить `emet doctor`.

## Запуски, воркеры и слоты

### `emet claims`

Резервирует тикет за запуском: `emet claims --reserve <ticket> --run <id> --anchor <pid>`.

- `--release <ticket>`: снимает захват.
- `--list`: выводит список захватов.
- `--prune [--dry-run]`: удаляет устаревшие захваты.

### `emet slots`

Берёт слот воркера из общего пула хоста в `~/.local/state/emet/slots`: `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`.

- `--release --run <id>`: освобождает слоты запуска.
- `--release-index <index>`: освобождает один слот.
- `--list`: выводит список слотов.

### `emet cleanup`

`emet cleanup [--run <id> | --all] [--dry-run] [--force]`. Без аргументов освобождает ресурсы закрытых или мёртвых запусков, чья работа приземлилась. После слияния `emet cleanup --run <runId>` освобождает ветки волны, захваты тикетов и слоты воркеров.

- `--run <id>`: очищает этот запуск.
- `--all`: обход веток по всему репозиторию.
- `--dry-run`
- `--force`

В любом режиме он также удаляет каждую локальную ветку, PR которой был слит на последнем коммите ветки, вместе с чистым и незаблокированным worktree агента, в котором она находится.

### `emet lock-reason`

`emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]` выводит причину `git worktree lock`, которую воркер записывает при начальной настройке.

### `emet launch`

`emet launch <spec-id> --wave <n>`: в Claude Code запускает волну как сессию `claude --bg` и открывает её вкладку Orca согласно `handoff.launcher` (о Codex см. [Хост Codex](#хост-codex)). Выполняет запуск целиком (проверка дубликатов сессий, `claude --bg`, вкладка) и выводит `{ name, id, attach, orcaTab: { opened, reason } }`. Используйте его, а не голый `claude --bg`, когда нужно вручную запустить волну в другой сессии.

### `emet chain`

`emet chain --ticket <id> --spec <id> --wave <n> [gate flags]` запускает `emet gate` с переданными флагами гейта и стартует следующую волну, только когда решение — `chain`.

Перед запуском проверяет готовность (запас памяти хоста, свободное место на диске и inode в репозитории и в `/tmp`, CLI `orca`), а потом убеждается, что дочерняя сессия есть в списке. Любое другое решение, блокирующая проблема готовности (`low-memory`, `low-disk`, `low-inodes`, `orca-unavailable`) или уже существующая сессия для той же спецификации и волны завершает работу с кодом 1 и причинами и ничего не запускает.

### `emet status`

`emet status [--spec <id>] [--brief]` выводит Working / Checking / Ready / Needs-decision по каждой волне в виде JSON плюс итоговая строка. `emet status --help` описывает этот JSON.

- `--spec <id>`
- `--brief`: вместо этого выводит не более трёх строк: общее состояние, что ждёт человека (если есть) и следующее действие.

В JSON также есть `sessions: [{sessionId, state, blocked, since, runId}]`: последнее состояние внимания каждой сессии этого репозитория, принадлежащей emet, за последние 24 часа, кроме сессий `ended`. `blocked` равно true, когда `state` — `needs-decision`, а `since` — время этого состояния. Любая заблокированная сессия делает общий `state` равным `needs-decision`, в том числе когда волны нет; строка сводки указывает, сколько сессий заблокировано, а `--brief` перечисляет их в строке о том, что ждёт человека.

### `emet run`

`emet run current [--json]` выводит активный запуск репозитория (id запуска, спецификацию, волну, фазу и время последнего обновления), прочитанный из `.emet/phase.json`. Без активного запуска выводит `no active run` и завершается с кодом 0.

### `emet memory`

Ищет и сохраняет уроки в [Engram](https://github.com/Gentleman-Programming/engram).

- `emet memory search --json <query> [--limit <n>]`: ищет уроки прошлых запусков. Поиск идёт с `match_mode: "any"` (`--limit` по умолчанию 5, максимум 20), оставляет только заметки, чей topic key начинается с `emet/<repo>/lessons/`, и выводит `{available: true, results: [{id, topicKey, title, content}]}`, где `content` обрезан до 2000 символов. `<repo>` — последний сегмент пути из `git remote get-url <repo.remote>` без `.git`, иначе имя каталога основного worktree.
- `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <landed|chained|hold|stop|blocked>`: читает из stdin от 1 до 5 пунктов-уроков (строки `- ` не длиннее 300 символов каждая) и добавляет их разделом `## <runId> — <outcome> (<date>)` в заметку с topic key `emet/<repo>/lessons/<key>` либо создаёт эту заметку. Заметка длиннее 20000 символов теряет самые старые разделы. Выводит `{available: true, saved: true, topicKey}`.

Обе подкоманды обращаются к Engram, запуская `engram mcp --tools=agent` в корне репозитория; плагин Engram не нужен. Они никогда не передают в Engram `project`.

Коды выхода: `2` при неверном использовании (нет подкоманды, нет запроса, нет пунктов, больше 5 пунктов, пункт длиннее 300 символов, неизвестный outcome, неверный key). Любая проблема Engram (нет в PATH, неудачный handshake, ошибка инструмента, тайм-аут, некорректный JSON) завершается кодом `0`.

- До успешного handshake вывод — `{available: false, reason}`.
- После него вывод — `{available: true, results: [], reason}` для `search` или `{available: true, saved: false, reason}` для `save`.
- `memory.enabled: "off"` выводит `{available: false, reason: "memory.enabled is off"}` и ничего не запускает. См. [`memory`](configuration.md#memory).

### `emet insights`

Читает [журнал событий](../concepts/attention-and-journal.md) и сообщает о запусках по источнику (человек или авто), решениях gate по решению и причине, вмешательствах человека по запускам, результатах запуска и закрытых тикетах. Нечитаемые строки пропускаются и подсчитываются. Пустой или отсутствующий журнал даёт нулевой отчёт и код 0.

- `--since <iso|7d|30d>`
- `--repo <path>`
- `--all`
- `--json`
- `--mark-baseline`: добавляет базовую точку; последующие отчёты охватывают только события после неё, если не указан `--all`.

### `emet usage`

Сообщает об использовании сессии.

- `--session <id>` или `--file <path>`
- `--stalled [--minutes N]`: выводит застрявших воркеров.
- `--project-dir <path>`

### `emet handoff`

`emet handoff --check <path> [--expect-skills a,b] | --render <path>` проверяет или отображает заметку воркера `.emet/handoff-<ticket>.md`.

- `--check <path>`: проверяет заметку. Успешная проверка выводит `missing skills: …`, если список `missing` не пуст.
- `--expect-skills a,b` (только для check): не пропускает проверку для каждого названного навыка, которого нет ни в списке `loaded`, ни в списке `missing`.
- `--render <path>`: отображает заметку.

Заметка может содержать раздел `skills:`, записанный как `skills: none` или `skills: loaded: a, b; missing: c`. Он обязателен, только когда `state` равно `done`, а любое другое значение не проходит проверку.

### `emet metrics`

`emet metrics [--run <id>]` сообщает токены, стоимость в эквиваленте API и время выполнения по тикету, по волне и по запуску, считывая их из транскриптов сессий. Также сравнивает бюджет контекста, оценённый для каждого тикета, с фактически использованным каждым воркером. Его сводка помещается в конец итогового отчёта запуска.

### `emet ask`

Почтовый ящик воркера: задаёт вопрос координатору или ждёт ответа.

- `--run <id>`
- `--ticket <ticket>`
- `--body <text>`: отправляет вопрос.
- `--wait <n>`: ждёт ответа.
- `--slice <seconds>`

С `--wait` код выхода `0` означает ответ, `3` — тайм-аут слайса, `4` — истёк срок.

### `emet inbox`

`emet inbox --run <id>` выводит открытые вопросы воркеров в виде JSON.

### `emet reply`

`emet reply --run <id> --ticket <ticket> --id <n> --body <text>` отвечает на вопрос воркера.

## Планирование, ревью и посадка

### `emet promote`

`emet promote --spec <id> [--dry-run] [--no-promote] [--hold]` — шаг after-spec согласно [`handoff.afterSpec`](configuration.md#handoff).

- `--dry-run`: не открывает pull request.
- `--no-promote`: пропускает шаг.
- `--hold`: записывает маркер `<run dir>/runs/<id>/no-promote` и выводит `{"held":true}`. Пока он существует, `emet promote --spec <id>` завершается с кодом 0 и пометкой `skipped`, не открывая pull request, поэтому `--no-promote` сохраняется между сессиями спецификации.

В режиме `promote` открывает pull request из `develop` в `main` с заголовком `chore: 🔖 promote develop`, ждёт через `emet ci --pr <n> --wait` и сливает его merge-коммитом только при состоянии `pass`. Затем, только если в `main` есть содержимое, которого нет в `develop` (сравнение `develop...main` перечисляет хотя бы один изменённый файл; одни merge-коммиты не в счёт), открывает синхронизирующий pull request из `main` в `develop`, так же ждёт его проверок и сливает его через [`pr.mergeMethod`](configuration.md#pr) только при состоянии `pass`. Если в `main` только merge-коммиты, синхронизирующий pull request не открывается, а `syncReason` объясняет причину. Синхронизирующий pull request в состоянии `fail`, `timeout` или `env-fault`, либо с отклонённым слиянием, остаётся открытым и никогда не меняет результат promote.

Добавляет в журнал одно событие `promote` с номером pull request, `merged`, `syncPrNumber`, `syncMerged`, `syncReason`, `rule` и `reason`. `afterSpec` может быть списком правил; тогда режим выбирается по путям, которые принесло бы продвижение `develop` (см. [`handoff.afterSpec`](configuration.md#handoff)), а сбой `git fetch` или `git diff` приводит к завершению команды с кодом 1 до открытия какого-либо pull request.

Выводимый результат содержит:

- `rule`: индекс сработавшего правила, либо `null` для строковой формы или при отсутствии совпадения.
- `reason`.
- `syncPrNumber`: `null`, если синхронизирующий pull request не открывался.
- `syncMerged` и `syncReason`: фраза о том, почему синхронизирующий pull request остался открытым, иначе `null`.
- `deployCheck: { run, reason }`: сообщает, должен ли координатор запустить `emet deploy-check`.

В режиме `release` ничего не сливает и оставляет release pull request человеку. При `afterSpec` `none`, с `--no-promote`, при удержанной спецификации или если последняя волна спецификации оставлена открытой или помечена, завершается с кодом 0 и пометкой `skipped`. Тем не менее он выполняется после чистой последней волны, чтобы результат содержал решение `deployCheck` (на trunk `main` проверка деплоя выполняется независимо от режима). CI не в состоянии `pass` ничего не сливает и завершается с кодом 1.

### `emet deploy-check`

Запускает `deploy.check.command`, пока он не завершится с кодом 0, не более `retries` попыток или `timeoutSeconds` секунд, с паузой `intervalSeconds` между попытками, и выводит `state: ok | failed | timeout` с `attempts`.

- `--json`

Код выхода `0` — ok, `1` — failed, `3` — timeout. Если `deploy.check` не настроен, завершается с кодом 0 и `skipped: "no deploy check configured"`. Координатор запускает его, только если в результате `emet promote` значение `deployCheck.run` равно true. См. [`deploy`](configuration.md#deploy).

### `emet surfaces`

`emet surfaces --check <file.json | ->` отклоняет пересекающиеся glob-шаблоны разрешённых поверхностей между тикетами волны.

### `emet assess`

`emet assess --base <ref> --head <ref>` классифицирует diff как `passive`, `medium` или `high` и выводит JSON с уровнем, причинами и рекомендуемой моделью и усилием ревьюера. См. [Модели и усилие](../../README.md#models--effort) и [`review`](configuration.md#review).

- `--quick`: JSON дополнительно содержит `"quickRejected": true|false`, а команда завершается с кодом 1, когда уровень `high` (**Stop** для **Quick run**: без автослияния, PR остаётся открытым), и с 0 в остальных случаях. Без `--quick` вывод и коды завершения не меняются.

JSON также содержит два решения:

- `browserVerify: { run, reason }`: `run` равно `true` только когда у уровня есть ревьюер, настроен [`verify.browser`](configuration.md#verify), бинарный файл `agent-browser` есть в PATH и, если задан `paths`, совпал изменённый путь. Иначе `reason` называет первое невыполненное условие.
- `dualReview: { run, reason }`: `run` равно `true` только когда уровень `high`, `agentHost` равен `claude`, [`review.dual`](configuration.md#review) не равен `off` и бинарный файл `codex` есть в PATH. Иначе `reason` называет первое невыполненное условие.

### `emet land`

`emet land --spec <s> --branch <integration> --tickets <id,...>` сливает интеграционную ветку в локальный trunk (`landing.mode` `merge`). `commands.selfCheck` заменяет CI, и ничего не отправляется.

### `emet spec-branch`

`emet spec-branch ensure|integrate|status|sync|land|abandon --spec <id>` управляет веткой спецификации `spec/<id>` режима `landing.unit: spec` (см. [`landing`](configuration.md#landing)). Все выводят JSON.

- `ensure`: создаёт ветку из trunk (идемпотентно), записывает `.emet/specs/<id>/branch.json` и отказывает, если выбрана ветка другой спецификации.
- `integrate --wave <n> --branch <integration> --tickets a,b`: сливает ветку волны в `spec/<id>` с `--no-ff` и трейлерами `Emet-Wave` и `Emet-Tickets`, записывает волну, добавляет `spec.integrate` и, когда `landing.pushSpecBranch` равен true, отправляет ветку без открытия PR.
- `status`: выводит `branch`, `tip`, интегрированные волны и тикеты и `behindTrunk`, а когда волны не хватает, перестраивает `branch.json` по трейлерам.
- `sync`: сливает trunk в ветку, никогда не делает rebase, а при конфликте прерывается, перечисляет пути и завершается с ненулевым кодом.
- `land [--partial]`: выполняет синхронизацию, затем в режиме `pr` отправляет ветку, открывает один PR со строкой `Closes` на каждый тикет, ждёт его проверок и сливает через `landing.specMergeMethod` (по умолчанию merge-коммит, игнорируя `pr.mergeMethod`). В режиме `merge` сливает в локальный trunk с `--no-ff` и никогда не отправляет изменения. Добавляет `spec.land`.
- `abandon --force`: помечает тегом `abandoned/spec-<id>`, удаляет ветку, добавляет `spec.abandon` и возвращает интегрированные тикеты локального трекера в `ready-for-agent`; без `--force` отказывает.

`emet tracker frontier` считает тикеты из `branch.json` закрытыми блокерами, а `emet status` получает `specBranch` (`branch`, `tip`, `integratedWaves`).

### `emet spec-merge`

`emet spec-merge --spec <id>` вливает дельты требований `ADDED`/`MODIFIED`/`REMOVED` спецификации в `docs/specs/<area>.md` (`specs.dir`).

- `--deltas-dir`: выводит каталог, в который кладутся дельты.

При включённом `specs.enabled` координатор пишет дельты и запускает команду один раз на спецификацию, в интеграционной ветке последней волны перед её ревью, а затем коммитит результат. Перед записью она проверяет каждую область. Конфликт или требование, которое потеряло бы сценарий, завершается кодом 1 и оставляет все файлы нетронутыми. При выключенном `specs.enabled` ничего не вливает и завершается кодом 0.

### `emet map`

`emet map [--refresh]` записывает обзор существующей кодовой базы (стек, структура, соглашения, тестирование, горячие точки) в `docs/agents/codebase.md` (`map.path`) с отметкой SHA коммита, по которому он построен. Один и тот же коммит всегда даёт один и тот же файл.

- `--refresh`
- `--stale`: завершается кодом 1, когда HEAD ушёл дальше отметки, и в этом случае `emet preflight` предупреждает.
- `--for <globs>`: выводит только разделы, соответствующие поверхностям правок тикета; этот вывод — единственная часть карты, входящая в задание воркера.

### `emet guard`

Хук `PreToolUse` Claude Code; читает JSON хука из stdin (форма для Codex описана в разделе [Хост Codex](#хост-codex)). `emet self install` подключает его в `~/.claude/settings.json`. Блокирует несколько известных причин сбоев при запусках без присмотра (см. `emet/src/guard.ts`).

## Локальный трекер

При `tracker.kind: "local"` спецификации и тикеты — это markdown-файлы в `.scratch/` основного worktree (не под версионным контролем): `.scratch/<slug>/spec.md` и `.scratch/<slug>/issues/<NN>-<slug>.md`, каждый со строками `Status:` и `Blocked by:` и комментариями под `## Comments`. `emet init --tracker local` настраивает это. См. [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

`landing.mode` — это `"pr"` (по умолчанию) или `"merge"`, независимо от трекера. В режиме `merge` волна приземляется как одно локальное слияние в trunk командой `emet land`, при этом вместо CI выступает `commands.selfCheck`, а push не выполняется. При `landing.unit: "spec"` (по умолчанию) вся спецификация приземляется один раз через `emet spec-branch land`. `gh` нужен только если трекер — `github` или посадка выполняется через `pr`. См. [ADR-0010](../adr/0010-local-merge-landing.md) и [`landing`](configuration.md#landing).

### `emet tracker`

`emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close` — локальный трекер поверх `.scratch/`, JSON в stdout. Координатор читает и записывает спецификации и тикеты через него.

#### `emet tracker close`

При `tracker.kind: "github"` `emet tracker close <ticket>... [--pr <n>]` закрывает каждый тикет (`CLA-<n>`, `#<n>` или просто число) через `gh issue close --reason completed`, проверяет его состояние и сообщает `closed` или `already-closed`.

- `--pr <n>`: добавляет комментарий "Landed in #<n>".

Для каждого отдельного родителя тикета со статусом `closed` или `already-closed` затем читает `gh issue view <spec> --json state,subIssuesSummary`. Когда спецификация открыта, а `subIssuesSummary.completed` равно ненулевому `total`, закрывает спецификацию через `gh issue close --reason completed` с комментарием "All <total> tickets landed." и проверяет результат.

В выводе появляется `specs`: по одному `{ spec, outcome, detail? }` на каждого отдельного родителя с результатом `closed`, `open`, `already-closed` или `failed`. Тикет без родителя ничего не добавляет, а сбой при чтении или закрытии спецификации никогда не меняет результат тикета. Завершается с кодом `1`, если какой-либо тикет или спецификация не удались, после обработки остальных. Тикеты Linear координатор подтверждает как Done через Linear MCP.

## PR посадки и цепочки волн

При `landing.unit: "wave"` одна волна — один PR; при `"spec"` один PR охватывает все интегрированные волны. В его тексте для каждого тикета есть отдельная строка `Closes #N` (закрывающее ключевое слово трекера), а координатор переводит тикеты в in-review, когда открывает PR. Затем PR сливается согласно `pr.autoMerge` или остаётся открытым, если волна была помечена, `autoMerge` равен `false` или исправления CI закончились (тогда PR получает метку human-decision). Последующие волны выполняются в собственных сессиях, никогда не в той, что выполняла волну 1. Разделы `pr` и `handoff` управляют тем, что происходит дальше; см. [`pr`](configuration.md#pr) и [`handoff`](configuration.md#handoff).

### `emet ci`

`emet ci --pr <n> --wait [--rerun-flakes] [--timeout-minutes <m>]` опрашивает проверки PR, пока они не завершатся или не истечёт таймаут (по умолчанию 30). Выводит `state: pass | fail | env-fault | timeout`, упавшие проверки и `flakeReruns` и никогда не сливает.

- `--rerun-flakes`: каждая упавшая проверка один раз перезапускается через `gh run rerun --failed`; проверка, прошедшая при перезапуске, считается Flake.
- `--timeout-minutes <m>`

PR без проверок — это `pass` с `noChecks: true`. Код `0` — pass, `1` — fail или env-fault, `3` — timeout. `env-fault` означает проверки, завершившиеся `STARTUP_FAILURE` или слишком долго стоявшие в очереди: CI, который так и не запустился, а не сбой кода.

## Хост Codex

Эти команды обслуживают хост агента Codex (`agentHost` `"codex"`); см. [руководство по Codex](../how-to/use-codex.md).

### `emet dispatch`

`emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: после проверки резервирования и слота создаёт `.emet/worktrees/agent-<ticket>`, собирает оверлей `CODEX_HOME` для запуска и стартует воркера как отдельный `codex exec`.

- `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]`: ждёт завершения и печатает записанный статус результата.

### `emet review-run`

`emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive> [--browser-verify true|false]` запускает ревьюера как `codex exec` только для чтения над пакетом из `emet review-package` и печатает JSON замечаний для `emet review --findings`. Уровень `passive` не запускает процесс.

- `--browser-verify true|false`: по умолчанию `false`. При `true` промпт заканчивается осью Browser, где `--session review-<run>` подставляется из `--run`, так что ревьюер Codex проверяет UI так же, как ревьюер Claude (передавайте его, когда `emet assess` напечатал `browserVerify.run: true`; см. [`verify`](configuration.md#verify)). Без флага промпт не меняется, а значение, отличное от `true` и `false`, завершается с кодом 2 и строкой использования.
- `--coverage-out <file>`: дополнительно записывает Coverage verdicts ревьюера Codex в `<file>` как JSON-массив (stdout по-прежнему печатает только замечания); используйте его на хосте Codex, где работает один ревьюер.

Замечания могут содержать необязательные поля `s` и `userOption`, описанные в разделе `emet review`.

### `emet launch` в Codex

`emet launch <spec-id> --wave <n>` запускает отдельный `codex exec` с `$emet:run --dispatch <spec>` и записывает id его треда. Вкладка Orca не открывается, а `codex exec resume <id>` продолжает сессию.

### `emet guard` в Codex

При `EMET_AGENT_HOST=codex` `emet guard` читает вход хуков Codex, сверяет пути `apply_patch` с `.emet/surface.json` и держит шлюз одобрения закрытым, пока не придёт строка промпта `approve <id>`.

## Гейты и записи

Фазы сами не решают, когда тикет готов, пригоден к слиянию или заслуживает повторной попытки. Они вызывают команду CLI, которая читает запись на диске и выводит решение. Записи запусков хранятся в `.emet/runs/<run-id>/`, а журнал ревью — в `.emet/review/`, в основном чекауте, а не в worktree воркера. Команды ниже перечислены в порядке конвейера.

### `emet validate`

Перед одобрением: `emet validate --spec <id> | --file <plan.json>` выполняет проверку плана.

- Каждый `S#` покрыт хотя бы одним тикетом и имеет сценарий приёмки.
- Каждый тикет покрывает хотя бы один `S#`.
- Поверхности правок внутри волны не пересекаются.
- Нет циклов зависимостей.
- С [`validate.coupledSurfaces`](configuration.md#validate) ошибка `coupled-surface-split`, когда тикет, затрагивающий `source` пары, стоит в более ранней волне, чем тикет, затрагивающий её `dependents` (код 1).
- Пустой список тикетов — ошибка `no-tickets` (код 1, "plan has no tickets; write one folded ticket"), с пунктами `S#` или без них. План с одним тикетом `folded: true`, покрывающим все `S#`, проходит.

`emet preflight` запускает проверку повторно на одобренном плане.

### `emet approve`

Одобрение: `emet approve --run <id> --spec <file>` записывает `approval.json` с хешами спецификации и списка тикетов. Диспетчеризация отклоняется, если что-либо из этого позже изменилось (`--check`).

- `--quick`: также записывает `"mode": "quick"`, из-за чего единицей посадки для этого запуска становится `wave`. Без него поля нет, и старые записи по-прежнему проходят `--check`.

### `emet materialize-log`

Создание тикетов: `emet materialize-log --run <id> --record/--lookup` сохраняет ID каждого созданного тикета, как только он появился, поэтому прерванный запуск никогда не создаёт дубликатов.

### `emet results`

Воркер завершил: `emet results --run <id> --write/--read <ticket>`. Воркеры записывают локальный файл результата (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` или `NEEDS_CONTEXT`, плюс строка `Risk:`). В трекер пишет только координатор.

### `emet verify`

После каждого воркера: `emet verify <ticket> --run <id>` проверяет, что есть коммиты сверх базы диспетчеризации, каждый изменённый путь лежит внутри поверхностей правок тикета, заметка передачи проходит `handoff --check`, а `commands.workerScopedSuite` проходит. Ревью и слияние отказываются работать с тикетом без записи об успехе.

### `emet review-package`

Вход ревью: `emet review-package <base> <head> --out <file>` собирает diff для ревьюера, который получает его как путь к файлу. Завершается кодом 3, если диапазон пуст или не является потомком base.

### `emet review`

Ревью: `emet review --ticket <t> --findings <file>` ведёт журнал замечаний и обеспечивает порядок триажа (`intent_gap` → `bad_plan` → `patch` → `defer`) и предел раундов.

- `--base <ref>`: разрешает `<ref>` в sha в первом раунде и сохраняет его; последующие раунды используют его, а другой sha завершается с кодом 2 с указанием сохранённого. Замечание к строке, которую diff `<base>..HEAD` не добавил и не изменил, сохраняется с `preexisting: true`, и `emet gate` не считает его блокирующим.
- `--findings <file>`: замечания принимают необязательные `s: "S<n>"` (затронутое требование), `userOption: "S<n>"` и `agreement: "both"` или `"single"`. Замечание `userOption` противоречит требованию `(user option)`: оно всегда блокирующее, даже если существовало раньше, а при `gate.onHold: fix-and-continue` даёт `hold` с `next: fix-findings`. Не строковый `userOption` завершается с кодом 2.
- `--coverage <file or -> [--expect S1,S3]`: сохраняет JSON-массив Coverage verdicts `{s, verdict, test:{file,name}}` (`verdict`: `met`, `partial`, `unmet`) как `coverage` журнала, заменяя предыдущий, и не расходует раунд ревью. Открывает замечание `VG-S<n>` (major, `patch`) для каждого `met`, у которого `test` отсутствует, файл не существует или не содержит `test.name`, и для каждого S# из `--expect` без вердикта. Замечание `VG-` закрывается только когда последующий `--coverage` его больше не порождает или его снимает вердикт recheck, но не тем, что оно отсутствует в раунде `--findings`. Печатает `{coverage, open}` и завершается с кодом 1, пока открыто любое замечание; тесты не запускает.
- `--merge <a.json> <b.json>` (без `--ticket`): печатает один объединённый массив замечаний для `--findings -`. Два замечания образуют пару, если у них общий `s` или общий `file` со строками не дальше 3 друг от друга, а пара сохраняет `id` первого файла, более высокую серьёзность и `agreement: "both"`. Замечание без пары получает `agreement: "single"`, а конфликтующий id из второго файла получает префикс `X-`; замечание `userOption` никогда не отбрасывается.
- `--recheck --verdicts <file>`: завершает раунд исправлений. Оцениваются только замечания, открытые к его началу, замечание становится `resolved` лишь через вердикт, а recheck учитывается в `budgets.fixRounds` (код 1 с указанием предела, когда он исчерпан).
- `--escalate`: переходит на следующий уровень модели.
- `--rule` и `--rulings`: записывают и выводят «Rulings I made» для отчёта и текста PR.

### `emet gate`

Слияние или цепочка: `emet gate <ticket> --tier … --ci … --integration …` выводит `merge`, `hold`, `chain`, `stop` или `defer` в виде JSON с причинами. Читает запись verify, открытые замечания, уровень риска, CI, интеграционный набор тестов и бюджеты. У `hold` есть `next`: `fix-findings`, `rerun-failed-specs`, `rerun-ci` или `report-infrastructure`. См. [`gate`](configuration.md#gate).

- `--no-record`: не записывает решение в журнал.

После того как ветки волны слиты вместе, `commands.fullSuite` один раз запускается на интеграционной ветке. Красный результат блокирует PR и `autoChain`. Гейт получает результат как `--integration`. О бюджетах, которые читает гейт, см. [`budgets`](configuration.md#budgets).

## Коды завершения

Коды завершения имеют одинаковый смысл во всех подкомандах.

| Код | Значение                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------- |
| `0` | Чисто.                                                                                                    |
| `1` | Есть замечания, требующие действий.                                                                       |
| `2` | Ошибка конфигурации или использования; инструмент на самом деле не запускался. Также неизвестная команда. |
| `3` | Внутренняя ошибка.                                                                                        |

Неизвестный флаг тоже завершается с кодом `2` и называет флаг. Ctrl-C завершается с кодом `130`.

## Глобальные флаги

Их принимает каждая команда; собственные флаги каждой команды перечисляет `emet <command> --help`.

| Флаг         | Действие                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `--json`     | Выводит в stdout один конверт `{ok, data, error: {code, message, fix}}`, в том числе для `--help` и `--version`. |
| `--no-color` | Отключает цвет ANSI. Цвет также учитывает `NO_COLOR`, `FORCE_COLOR`, `TERM=dumb` и то, является ли вывод TTY.    |
| `--verbose`  | Выводит стек неожиданной ошибки. Без него перехватчик верхнего уровня выводит однострочную ошибку.               |
| `--help`     | Выводит справку по использованию команды.                                                                        |

`emet --version` выводит версию; `emet --version --json` выводит `{"ok": true, "data": {"version": ...}, "error": null}`. При `--json` упавшая команда завершается со своим обычным кодом и выводит `ok: false` с `code` ошибки `findings`, `usage`, `internal`, `slice-timeout`, `expired`, `bad-range` или `exit-<n>`; то, что команда вывела в stdout, становится `data` конверта.

В TTY `emet` выводит в stderr однострочное уведомление, если известен более новый релиз. Проверка выполняется не чаще раза в сутки, ответ кэшируется, ожидания сети нет, а при `--json` или без TTY уведомление не выводится.

## Переменные окружения

Переменные для пользователей. Заданная переменная переопределяет соответствующее значение конфигурации.

| Переменная                    | Действие                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` понижает блокировку по зависимостям до предупреждения для этого одного запуска. Задавайте её в собственной оболочке, а не в том, что координатор запускает без присмотра. |
| `EMET_MAX_LIVE_WORKERS`       | Переопределяет [`concurrency.maxLiveWorkers`](configuration.md#concurrency); принимает положительное целое или `auto`.                                                                                                   |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | Переопределяет [`concurrency.runIdleThresholdMs`](configuration.md#concurrency), в миллисекундах.                                                                                                                        |
| `EMET_STATE_DIR`              | Общий каталог состояния хоста, в котором хранится пул слотов воркеров. Порядок определения: `$EMET_STATE_DIR`, затем `$XDG_STATE_HOME/emet`, затем `~/.local/state/emet`.                                                |
| `EMET_MEM_RESERVE_GIB`        | Запас памяти в GiB, который должен оставаться свободным; захват слота отклоняется, если доступной памяти меньше. По умолчанию 8. Также влияет на предел воркеров `auto`.                                                 |
| `EMET_MEM_PER_WORKER_GIB`     | Память в GiB, принимаемая на одного воркера, когда `maxLiveWorkers` равен `auto`. По умолчанию 2. Увеличьте для более тяжёлого стека на воркера, например E2E-набора с браузером на каждый worktree.                     |
| `EMET_CPU_OVERSUBSCRIBE`      | Множитель CPU для предела воркеров `auto`. По умолчанию 1.                                                                                                                                                               |
| `EMET_AUTO_UPDATE`            | `EMET_AUTO_UPDATE=0` отключает `emet self update --auto`: команда завершается с кодом 0 без обращения к сети. То же, что `emet self update --auto off`.                                                                  |
| `EMET_AGENT_HOST`             | `codex` заставляет `emet guard` читать вход хуков Codex. Задаётся хуками Codex; в Claude Code оставьте незаданной.                                                                                                       |

Предел `auto` равен `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`. Устаревшие имена `FORGE_*` по-прежнему читаются; при наличии обоих приоритет у `EMET_*`.
