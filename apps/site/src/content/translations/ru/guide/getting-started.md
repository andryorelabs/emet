---
title: Начало работы
description: Установите emet как плагин Claude Code, проверьте его работу командой emet doctor и запустите в первый раз.
seoTitle: Начало работы с emet
sourceHash: 381754ac3b3a0479
---

Установите emet, проверьте, что он работает, и запустите его в первый раз.

<img src="../brand/mascot/mascot-done.svg" alt="emet mascot, done" width="96" align="right">

## Требования

Claude Code или Codex CLI, `git`, `gh` (с авторизацией) и плагин `mattpocock-skills` в Linux или macOS. Bun нужен только для установки из исходников; нативный Windows не поддерживается (используйте WSL). Полный список с указанием, чем проверяется каждый пункт, приведён в [справочнике по зависимостям](../reference/dependencies.md).

## Установка

Есть два способа установки.

**Плагин** (Bun не нужен). Добавьте этот репозиторий как маркетплейс и установите плагин `emet`; он приносит `/emet:run`, агентов, защитные хуки и шим `emet`, который при первом использовании скачивает автономный бинарный файл с проверкой контрольной суммы.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

В Codex плагин устанавливается командой `codex plugin`; шаги описаны в разделе [Запуск emet в Codex](codex.md#установка).

**`install.sh`** (работает с Bun и без него):

```bash
git clone git@github.com:andryorelabs/emet.git
cd emet
./install.sh
```

Если `bun` есть в PATH, скрипт копирует исходники CLI в `~/.claude/emet`, а обёртку `emet` — в `~/.local/bin/emet`. Без `bun` он устанавливает шим автономного бинарного файла (`~/.local/bin/emet`, ссылка на `~/.claude/emet/bin/emet`), который при первом запуске скачивает бинарный файл и проверяет его контрольную сумму (нужен `curl`). В обоих случаях команды попадают в `~/.claude/commands/emet/`, а агенты — в `~/.claude/agents/`; плейсхолдеры плагина в промптах заменяются обычными путями `~/.claude`. Повторный запуск безопасен: изменённый файл сохраняется, а новая версия записывается рядом как `<file>.new`.

Обе установки дают три слэш-команды: `/emet:run`, `/emet:init` и `/emet:doctor`. Команда `emet` в обычном терминале работает только после `install.sh`; иначе используйте слэш-команды или `! emet <subcommand>` внутри сессии Claude Code или Codex. Имена агентов различаются: `emet:emet-worker` в плагине, `emet-worker` в автономной установке.

Рекомендуемый порядок в каждом репозитории: сначала выполните `/setup-matt-pocock-skills`, затем `emet init`.

Проверьте результат командой `/emet:doctor` внутри Claude Code (`$emet:doctor` в Codex) или `emet doctor .` в терминале после `install.sh` (`selftest` требует установки из исходников).

Если `doctor` или `preflight` сообщает о проблеме, см. [устранение неполадок](../troubleshooting.md). Ничего не устанавливается и не авторизуется за пользователя; о том, кто что проверяет, и о `EMET_SKIP_DEPENDENCY_CHECKS` см. [справочник по зависимостям](../reference/dependencies.md).

## Первый запуск

В любом git-репозитории:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

Внутри сессии `/emet:init` делает то же, что и `emet init`. Затем, внутри Claude Code (в Codex используйте `$emet:run` вместо `/emet:run`):

```
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

`emet init` оставляет маркер `TODO(emet):` в сгенерированных файлах `docs/agents/*.md` для всего, что не может определить сам (общая блокировка тестовой базы данных, владелец схемы и т. п.); заполните их. Пока остаётся хотя бы один, `emet preflight` отказывается запускать диспетчеризацию.

## Дальше

- [Трекеры и посадка](trackers-and-landing.md): тикеты GitHub, Linear или локальные и то, как волна приземляется.
- [Запуск emet в Codex](codex.md): установка, единственное подтверждение и ограничения хоста агента Codex.
- [Модели и усилие](models-and-effort.md): какую модель и какое усилие использует каждая роль.
- [Проверка флота](fleet.md): проверка нескольких репозиториев сразу.
- [Справочник по конфигурации](../reference/configuration.md) и [справочник по CLI](../reference/cli.md): каждый ключ и каждая подкоманда.
