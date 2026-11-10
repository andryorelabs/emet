---
title: Проверка флота
description: Проверяйте любое число репозиториев сразу с помощью emet doctor, только на чтение, и смотрите, каким из них нужно внимание.
seoTitle: "Проверка флота: несколько репозиториев с emet doctor"
sourceHash: efeca623ade98bf1
---

Уже используете emet в нескольких репозиториях? `emet doctor` проверяет любое их число за один проход, только на чтение:

```bash
emet doctor ~/code/*
```

Для каждого репозитория отчёт показывает: корректный `emet.config.json`, наличие всех четырёх файлов `docs/agents/*.md`, отсутствие оставшихся маркеров `TODO(emet):`, действительно ли разрешаются команды из `commands.selfCheck`, а также результаты проверки зависимостей, специфичных для трекера этого репозитория (`gh`, Linear; см. [справочник по зависимостям](../reference/dependencies.md)). Плагин mattpocock-skills и флаги внешних CLI (`gh`, а также флаги собственного CLI хоста агента: в Claude Code `claude --bg` и `claude agents --json`, в Codex `codex exec --json` и `--output-schema`; все проверяются через `--help`) проверяются один раз на весь обход, а не для каждого репозитория.

`emet doctor` проверяет сами флаги, а не только наличие бинарных файлов. Он читает `--help` для `gh issue view`/`gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`) и, в Claude Code, `claude` (`--bg`) и `claude agents` (`--json`) и сообщает о каждом флаге, который более новая или более старая версия CLI больше не документирует. Переименованный флаг иначе сорвал бы волну на полпути. Проверки `claude` и `claude agents` относятся к хосту Claude Code. На хосте Codex проверки флагов хоста заменяют их, а не дополняют: `emet doctor` проверяет `codex exec` на наличие `--json` и `--output-schema` (`hostCliFlagRequirements` в `emet/src/doctor.ts`). Версию `codex` он с `codex.minVersion` не сравнивает; см. [Запуск emet в Codex](codex.md).

Каждая проба ограничена 5 с, чтобы зависший `gh auth status` (без сети) не мог заблокировать волну. `preflight.requiredCommands` репозитория — это список бинарных файлов, принадлежащий самому репозиторию, которые `emet preflight` и `emet doctor` требуют в PATH. См. [справочник по CLI](../reference/cli.md#проверка-флота) и [справочник по конфигурации](../reference/configuration.md#preflight).
