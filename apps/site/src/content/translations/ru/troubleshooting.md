---
title: Устранение неполадок
description: Сбои emet doctor и emet preflight, сгруппированные по тому, что вы видите, каждый с причиной и исправлением.
seoTitle: Устранение неполадок emet doctor и preflight
sourceHash: dd82e980da9568d5
---

Сбои `emet doctor` и `emet preflight`, сгруппированные по тому, что вы видите, каждый с причиной и исправлением. Термины соответствуют [GLOSSARY.md](../GLOSSARY.md). О том, как проверки связаны между собой, см. [архитектуру](architecture.md).

<img src="brand/mascot/mascot-error.svg" alt="" width="96">

Репозиторий, в котором по-прежнему есть только `forge.config.json`, `.forge/` или переменные `FORGE_*`, продолжает работать: `emet` читает устаревшие имена, выводит в stderr по одной строке с названием каждого устаревшего файла, а `emet migrate` переименовывает их.

- [no emet.config.json](#no-emetconfigjson)
- [emet.config.json is malformed](#emetconfigjson-is-malformed)
- [docs/agents still has TODO(emet) markers](#docsagents-still-has-todoemet-markers)
- [Проверка зависимостей не проходит](#проверка-зависимостей-не-проходит)
- [no longer documents a flag in --help](#no-longer-documents-a-flag-in---help)
- [Установленный файл отсутствует или был изменён после установки](#установленный-файл-отсутствует-или-был-изменён-после-установки)
- [Stop hook error: forge: No such file or directory](#stop-hook-error-forge-no-such-file-or-directory)
- [Нет свободных слотов воркеров](#нет-свободных-слотов-воркеров)
- [Ожидались заблокированные worktree, найдено меньше](#ожидались-заблокированные-worktree-найдено-меньше)
- [Тикет захвачен несколькими worktree или ветками](#тикет-захвачен-несколькими-worktree-или-ветками)
- [requiredCommands not on PATH](#requiredcommands-not-on-path)
- [См. также](#см-также)

## no emet.config.json

**Симптом:** `emet doctor` выводит `no emet.config.json — run "emet init" here`.

**Причина:** В репозитории ещё нет конфигурации `/emet`.

**Исправление:** Выполните `emet init` в корне репозитория, затем проверьте сгенерированную конфигурацию и заполните файлы в `docs/agents/`.

## emet.config.json is malformed

**Симптом:** `emet.config.json is malformed: <reason>`; `emet preflight` завершается кодом 2.

**Причина:** Конфигурация — строгий JSON и проверяется по `emet/schema/emet.config.schema.json`. Комментарии и завершающие запятые отклоняются.

**Исправление:** Исправьте поле, названное в причине, или сгенерируйте заново командой `emet init --force`.

## docs/agents still has TODO(emet) markers

**Симптом:** `docs/agents/ still has N TODO(emet): marker(s)`; `emet doctor` также сообщает об отсутствующем `docs/agents/<file>`.

**Причина:** `emet init` оставляет маркер везде, где не может определить значение.

**Исправление:** Заполните каждую помеченную строку или устраните их и выполните `emet init --force`. Пока остаётся хотя бы один, preflight отказывается запускать диспетчеризацию.

## Проверка зависимостей не проходит

**Симптом:** строки `dependency: ...` в `emet doctor` или блокирующий сбой зависимости в `emet preflight` (например, `gh` отсутствует или нет авторизации, либо плагин mattpocock-skills отсутствует или имеет непроверенную версию).

**Причина:** `/emet` нужны `git`, `gh` и плагин mattpocock-skills; см. `emet/src/dependencies.ts` и `emet/src/skills.ts`.

**Исправление:** Установите инструмент или выполните авторизацию, либо запустите `/setup-matt-pocock-skills`. Если проверка неверна для вашего окружения, `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` понижает её до предупреждения.

## no longer documents a flag in --help

**Симптом:** `<tool> no longer documents <flags> in --help — emet relies on it` или `could not be run — cannot verify <flags>`.

**Причина:** `emet doctor` проверяет флаги, от которых зависит `emet`, а не только наличие бинарного файла. Установленная версия убрала или переименовала один из них.

**Исправление:** Установите версию инструмента, которая по-прежнему документирует этот флаг.

## Установленный файл отсутствует или был изменён после установки

**Симптом:** `~/<path> is missing — re-run install.sh` или `~/<path> was edited since install`.

**Причина:** Установленная копия больше не совпадает с манифестом установки.

**Исправление:** Снова запустите `install.sh`. Если рядом с изменённым файлом лежит ожидающий файл `.new`, объедините его или удалите.

## Stop hook error: forge: No such file or directory

**Симптом:** Claude Code в конце каждого хода выводит `Stop hook error: … forge: No such file or directory` (или то же для `emet`).

**Причина:** В `~/.claude/settings.json` всё ещё есть хук `forge guard` или `emet guard`, бинарный файл которого был перемещён или удалён.

**Исправление:** Выполните `emet doctor .`. Он перечисляет каждый мёртвый хук guard с его событием и выводит одну команду `cp … && jq …`, которая делает резервную копию `settings.json` и удаляет только эти хуки. Сам doctor файл никогда не правит.

## Нет свободных слотов воркеров

**Симптом:** `No free worker slots at all: 0 free out of N` или `only K/N worker slot(s) free`.

**Причина:** Каждый слот в `~/.local/state/emet/slots` занят активным или простаивающим запуском, поэтому волну нельзя диспетчеризовать полностью.

**Исправление:** Дождитесь, пока запуск освободит слот, или выполните `emet cleanup --run <runId>` для запуска, который, как вы знаете, завершён. `emet status` показывает, кто что занимает.

## Ожидались заблокированные worktree, найдено меньше

<img src="brand/mascot/mascot-sleep.svg" alt="" width="64">

**Симптом:** `Expected N locked worktree(s) for run <id>, found M`.

**Причина:** Воркеры не закрепили свой worktree причиной блокировки, либо `isolation: "worktree"` разместил их в другом месте. См. [`incidents.md`](../emet/reference/incidents.md).

**Исправление:** Проверьте заблокированные записи в `git worktree list --porcelain`, а ожидаемый формат причины — через `emet lock-reason`.

## Тикет захвачен несколькими worktree или ветками

**Симптом:** `<ticket> is claimed by N worktrees`, `has N branches` или `is checked out on branch ..., but its own lock names ticket ...`.

**Причина:** Повторная попытка или неверно направленная оболочка оставили дубликат.

**Исправление:** Оставьте канонический worktree или ветку, остальные удалите или заблокируйте заново, затем снова выполните `emet preflight`.

## requiredCommands not on PATH

**Симптом:** `preflight.requiredCommands not on PATH: <names>`.

**Причина:** `preflight.requiredCommands` в `emet.config.json` перечисляет бинарные файлы, нужные репозиторию.

**Исправление:** Установите названные бинарные файлы или удалите их из конфигурации, если они больше не нужны.

## См. также

- [Указатель документации](README.md)
- [README](../README.md)
- [Начало работы](guide/getting-started.md)
- [Справочник по конфигурации](reference/configuration.md)
- [Справочник по зависимостям](reference/dependencies.md)
