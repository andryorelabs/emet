---
title: Первый запуск
description: Проверьте установку командой emet doctor и запустите emet в первый раз.
seoTitle: Первый запуск emet
sourceHash: 7daec76e45f50b8c
---

Проверьте установку командой `emet doctor` и запустите emet в первый раз. Сначала установите emet; см. [Установка](install.md).

## Предварительные требования

- emet установлен, `emet` есть в `PATH`.
- Git-репозиторий и `gh` с авторизацией.
- В Claude Code или Codex: плагин `mattpocock-skills`.

## Шаги

В каждом репозитории сначала выполните навык `setup-matt-pocock-skills` (`/setup-matt-pocock-skills` в Claude Code; в Codex — тот же навык из плагина `mattpocock-skills` через синтаксис `$` Codex). Затем в любом git-репозитории:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight     # confirms the repo is dispatch-ready
```

Внутри сессии `/emet:init` делает то же, что и `emet init` (`$emet:init` в Codex). `emet init` оставляет маркер `TODO(emet):` в сгенерированных файлах `docs/agents/*.md` для всего, что не может определить сам, например общая блокировка тестовой базы данных или владелец схемы; заполните их. Пока остаётся хотя бы один, `emet preflight` отказывается запускать диспетчеризацию.

Затем запустите emet внутри Claude Code (в Codex используйте `$emet:run` вместо `/emet:run`):

```
/emet:run <describe the feature>              # interview, then wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## Проверьте результат

Выполните `emet doctor .` в терминале или `/emet:doctor` внутри Claude Code (`$emet:doctor` в Codex). Сначала он сообщает о сбоях. Если `doctor` или `preflight` сообщает о проблеме, см. [устранение неполадок](../troubleshooting.md). Ничего не устанавливается и не авторизуется за вас; о том, кто что проверяет, и о `EMET_SKIP_DEPENDENCY_CHECKS` см. [справочник по зависимостям](../reference/dependencies.md).

## Дальше

- [Трекеры и посадка](../how-to/configure-tracker.md): GitHub, Linear или локальные тикеты и то, как приземляется спецификация.
- [Запуск emet в Codex](../how-to/use-codex.md): единственное подтверждение и ограничения хоста агента Codex.
- [Модели и усилие](../how-to/choose-models.md): какую модель и какое усилие использует каждая роль.
- [Проверка флота](../how-to/check-a-fleet.md): проверка нескольких репозиториев сразу.
- [Справочник по конфигурации](../reference/configuration.md) и [справочник по CLI](../reference/cli.md): каждый ключ и каждая подкоманда.
