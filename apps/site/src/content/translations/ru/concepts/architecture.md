---
title: Архитектура
description: Карта кода emet/src и то, как промпты /emet управляют ею.
seoTitle: Архитектура emet
sourceHash: ac65f41cf78af13e
---

Карта кода `emet/src` и то, как промпты `/emet` управляют ею. Термины соответствуют [GLOSSARY.md](../../GLOSSARY.md); решения, определившие устройство, находятся в [docs/adr](../adr/README.md). О проблемах см. [устранение неполадок](../troubleshooting.md).

- [Устройство](#устройство)
- [Как промпты управляют CLI](#как-промпты-управляют-cli)
- [Карта модулей](#карта-модулей)
- [Структура промптов](#структура-промптов)
- [Распространение](#распространение)
- [См. также](#см-также)

## Устройство

Есть две половины. Промпты (`commands/run.md`, `agents/*.md`, `emet/reference/*.md`, а также сгенерированные `codex/skills/**` и `codex/hooks.json` для Codex) говорят агенту, что делать в каждой фазе. CLI `emet` (`emet/bin/emet.ts` и `emet/src/`) делает всё, что должно быть детерминированным: проверки, захваты, слоты, гейты, записи в трекер и посадку. Промпты никогда не реализуют заново проверку, которую CLI уже выполняет.

`emet/bin/emet.ts` — тонкий диспетчер: он читает первый аргумент и передаёт управление одному модулю подкоманды, который сам читает остальную часть `process.argv`. Коды завершения имеют смысл во всех подкомандах.

## Как промпты управляют CLI

`commands/run.md` — короткий маршрутизатор. Он загружает по одному файлу фазы из `emet/reference/`, поэтому уплотнение контекста никогда не теряет правила текущей фазы.

| Фаза                                          | Промпт                                                                                        | Вызовы CLI                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1-5 интервью, спецификация, тикеты, одобрение | `phases-1-5.md`                                                                               | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                                         |
| 6-7 диспетчеризация и воркеры                 | `phases-6-7-dispatch.md`, `worker-prompt.md`                                                  | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results`                          |
| 8 ревью, гейт, посадка, завершение            | `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `spec-branch`, `spec-merge`, `cleanup` |
| 9 передача и цепочки                          | `phases-9-handoff.md`                                                                         | `status`, `metrics`, `usage`                                                                           |

Координатор — единственный, кто пишет в трекер (ADR-0005): воркеры отчитываются через заметку передачи и `emet results`, а координатор публикует их. `emet guard` работает как хук `PreToolUse` и блокирует известные причины сбоев при запусках без присмотра.

## Карта модулей

Рядом с каждым модулем лежит `*.test.ts`. `tools/architecture-map.test.ts` падает, если неспециальный модуль из `emet/src` отсутствует в этом списке.

**Настройка, установка и аудит**

- `init.ts` записывает конфигурацию и каркас документов; `config.ts` читает `emet.config.json` (прежний `forge.config.json` по-прежнему читается); `names.ts` приводит имя к его текущему или прежнему написанию.
- `doctor.ts` — обход флота; `preflight.ts` проверяет гигиену диспетчеризации; `dependencies.ts` и `skills.ts` (контракт mattpocock-skills) проверяют, что нужно запуску; `map.ts` записывает обзор кодовой базы; `plugin-detect.ts` сообщает, какие плагины установлены.
- `setup.ts` устанавливает необязательные дополнения, `setupledger.ts` записывает каждое изменение, чтобы его можно было отменить, а `settingsapply.ts` хранит рекомендуемые настройки Claude Code.
- `self.ts`, `self-install.ts`, `self-source.ts`, `self-types.ts`, `self-update.ts`, `self-host-claude.ts` и `self-host-codex.ts` реализуют `emet self`: установку, установку из исходников, обновления и файлы для каждого хоста. `hooks-merge.ts` объединяет хуки emet с настройками хоста, `uninstall.ts` отменяет установку по журналу записей, `migrate.ts` переносит прежние имена, `update-notice.ts` и `whats-new.ts` сообщают человеку о новых релизах, а `embedded-tree.generated.ts` хранит файлы, встроенные в скомпилированный бинарный файл.
- `assets.ts` читает эти встроенные файлы.

**Состояние запусков**

- `claims.ts` хранит резервирования тикетов, `slots.ts` — пул слотов воркеров, `resources.ts` — сведения о хосте, `runs.ts` — живость, а `runcurrent.ts` — текущий запуск рабочей копии.
- `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `mergedpr.ts` и `landed.ts` управляют worktree, блокировками и очисткой веток, которые уже сели.
- `status.ts` сообщает о волнах и сессиях, `launch.ts` и `chain.ts` запускают запуски и следующую волну без присмотра, `fleet.ts` работает сразу с несколькими репозиториями, а `phase.ts` записывает текущую фазу.
- `signals.ts` выполняет очистку при прерывании.

**Трекер и спецификации**

- `tracker.ts` и `tracker-files.ts` (локальный трекер `.scratch/`) читают и записывают тикеты, `ticketclose.ts` их закрывает, `validate.ts` проверяет покрытие спецификации, `approve.ts` записывает одобрение, а `surfaces.ts` находит пересечения поверхностей правок.
- `specmerge.ts` сворачивает дельты спецификаций в живые спецификации; `specbranch.ts`, `speclanding.ts` и `specabandon.ts` управляют веткой `spec/<id>`; `landing-unit.ts` определяет, садится ли запуск по спецификациям или по волнам; `afterspec.ts` и `promote.ts` выполняют шаг после спецификации.

**Передача от воркера**

- `handoff.ts`, `results.ts` и `materializelog.ts` доставляют координатору то, о чём сообщает воркер, а `mailbox.ts` — почтовый ящик воркеров Codex, которым владеет CLI.

**Ревью и посадка**

- `verify.ts`, `reviewpackage.ts`, `review.ts` (журнал замечаний), `review-run.ts` (ревьюер Codex), `assess.ts` (классификатор риска), `gate.ts`, `land.ts` и `ci.ts` проверяют, ревьюят и сажают волну. `deploycheck.ts` выполняет проверку после развёртывания.

**Журнал, внимание и отчётность**

- `journal.ts` добавляет события, а `insights.ts` их читает; `attention.ts` записывает состояние внимания сессии, а `attention-alert.ts` поднимает оповещение; `metrics.ts` и `usage.ts` сообщают о стоимости и результатах.
- `memory.ts` и `engram-client.ts` ищут и сохраняют уроки в Engram.

**Безопасность**

- `guard.ts`, `guard-destructive.ts` и `guard-codex.ts` — хуки защиты.

**Обвязка команд и общие вспомогательные модули**

- `commands.ts` описывает команды и их флаги, `flags.ts` — флаги, которые принимает каждая команда, `envelope.ts` — вывод `--json`, `errors.ts` — коды ошибок, `exit-codes.ts` и `exit-code.ts` — коды завершения, `env.ts` — представление окружения, `color.ts` и `banner.ts` — вывод в терминал, а `present.ts`, `narrow.ts` и `optional.ts` — небольшие вспомогательные функции сужения типов.
- `test-preload.ts` и `expect-rejection.ts` поддерживают тесты.

Значения, зависящие от хоста, лежат за интерфейсом `AgentHost` в `agenthost.ts`: `agenthost-claude.ts` — адаптер Claude Code, `agenthost-codex.ts` — адаптер Codex; выбираются ключом `agentHost` в конфигурации. Сторона Codex добавляет `codex-models.ts` (выбор моделей), `codex-home.ts` (оверлей `CODEX_HOME` для запуска), `codex-process.ts` и `codex-session.ts` (запуск процессов и передача), `codex-usage.ts` (расход из `exec --json`), `guard-codex.ts` (вход хуков и шлюз одобрения) и `dispatch.ts`. См. [руководство по Codex](../how-to/use-codex.md).

## Структура промптов

`commands/run.md` (около 130 строк) — маршрутизатор `/emet` в Claude Code; в Codex эту роль играют сгенерированные `codex/skills/**` и `codex/hooks.json`. Каждый файл в `emet/reference/` — группа фаз (`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `phases-9-handoff.md`), загружаемая только тогда, когда она нужна режиму текущего запуска. Тест падает, если любой из них вырастает больше 20 000 байт, чтобы один файл не мог занять весь контекст после уплотнения. Фазы велят координатору перечитывать нужный раздел перед каждым раундом исправлений или ревью. `emet self install` удаляет оставшийся `phases-8-closeout.md`, если он всё ещё совпадает с манифестом установки, а в противном случае откладывает его как `phases-8-closeout.md.retired`; этот файл разделён на `phases-8-review.md` (ревью и гейт) и `phases-8-landing.md` (посадка и завершение). `phases-8-spec-landing.md` хранит правила для `landing.unit: spec`: интеграцию каждой волны в `spec/<id>`, синхронизацию trunk и однократную посадку спецификации. Также `emet self install` объединяет хуки emet, среди них `emet guard` как хук `PreToolUse`, с `~/.claude/settings.json`.

## Распространение

`emet self install` помещает автономный бинарный файл, записывает переписанные промпты в `~/.claude/` и, с `--from <checkout>`, копирует исходники `emet/` в `~/.claude/emet`. Плагин Codex описывается файлом `.codex-plugin/plugin.json`, который генерируется командой `bun run build:codex` вместе с `codex/skills/**` и `codex/hooks.json`. Путь через плагин Claude Code поставляет шим, который скачивает автономный бинарный файл с проверкой контрольной суммы, собранный `tools/build-binaries.ts`. См. [ADR-0008](../adr/0008-standalone-binaries-and-plugin-distribution.md).

## См. также

- [Начало работы](../start/install.md) и [Трекеры и посадка](../how-to/configure-tracker.md)
- [Справочник по конфигурации](../reference/configuration.md), [справочник по CLI](../reference/cli.md) и [Зависимости](../reference/dependencies.md)
- [AGENTS.md](../../AGENTS.md) и [emet/AGENTS.md](../../emet/AGENTS.md)
- [Указатель документации](../README.md)
