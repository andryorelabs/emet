---
title: Начало работы
description: Установите emet, проверьте его работу командой emet doctor и запустите в первый раз.
seoTitle: Начало работы с emet
sourceHash: ce83e38591b3de64
---

Установите emet, проверьте, что он работает, и запустите его в первый раз.

<img src="../brand/mascot/mascot-done.svg" alt="emet mascot, done" width="96" align="right">

## Требования

Claude Code или Codex CLI, `git`, `gh` (с авторизацией) и плагин `mattpocock-skills` в Linux или macOS. Bun нужен только для `emet self install --from`; нативный Windows не поддерживается (используйте WSL). Полный список с указанием, чем проверяется каждый пункт, приведён в [справочнике по зависимостям](../reference/dependencies.md).

## Установка

Запустите скрипт начальной установки в терминале. Не нужны ни Bun, ни клон репозитория, ни sudo:

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh
```

Скрипт отказывается работать под sudo, скачивает автономный бинарный файл и `SHA256SUMS` для вашей платформы во временный каталог, проверяет контрольную сумму (и аттестацию, если есть `gh`) и только затем передаёт управление `emet self install`. Если любая проверка не проходит, ничего не записывается. Профиль оболочки он не изменяет; если `~/.local/bin` нет в `PATH`, добавьте его.

`emet self install` помещает бинарный файл в `~/.local/share/emet/versions/<version>/emet` и ссылается на него из `~/.local/bin/emet`. Затем он записывает файлы Claude Code: референсные промпты в `~/.claude/emet/`, команды в `~/.claude/commands/emet/` и агентов в `~/.claude/agents/`, с заменой плейсхолдеров плагина на обычные пути `~/.claude`. Он вносит хуки emet в `~/.claude/settings.json` после резервной копии и не трогает чужие хуки. Если Codex присутствует, он также записывает навыки emet в `~/.agents/skills/emet/` и добавляет хуки emet в `$CODEX_HOME/hooks.json` (по умолчанию `~/.codex`); `config.toml` он никогда не изменяет. Повторный запуск безопасен: изменённый файл сохраняется, а новая версия записывается рядом как `<file>.new`.

Чтобы посмотреть все записи, ничего не записывая, передайте `--dry-run`. Аргументы после `sh -s --` попадают в `emet self install`:

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh -s -- --dry-run
```

Можно также закрепить версию, например `sh -s -- 1.2.3`; по умолчанию используется `latest`. Чтобы установить из клона, выполните `emet self install --from <checkout>`; для этого нужен `bun`, и `emet selftest` продолжает работать.

### Codex

Если Codex присутствует, `emet self install` выводит одноразовый шаг: откройте `/hooks` в Codex и нажмите `t` на странице событий, чтобы довериться хукам emet (или подтвердите запрос "Hooks need review" при запуске). До этого emet guard не работает. См. [Запуск emet в Codex](codex.md#установка).

### Автообновление

Хук `SessionStart` запускает `emet self update --auto` не чаще раза в сутки, в отсоединённом режиме и без вывода, если сети нет. Он проверяет контрольную сумму, подготавливает новую версию и заменяет символическую ссылку, только когда не занят ни один слот воркера; иначе обновление остаётся отложенным до следующего запуска сессии. Предыдущая версия сохраняется для отката. Чтобы отключить, задайте `EMET_AUTO_UPDATE=0` или выполните `emet self update --auto off`; `emet self update --auto on` включает его снова. См. [Обновление emet](../how-to/update-emet.md).

### Удаление

```bash
emet uninstall --dry-run     # list what would be removed
emet uninstall
```

Команда удаляет каталог версий, символическую ссылку `~/.local/bin/emet`, файл состояния установки, навыки Codex и каждый хук emet в обоих файлах хуков, а также откатывает дополнения, которые записал `emet setup`. Изменённый вами файл команды и чужие хуки сохраняются. См. [справочник по CLI](../reference/cli.md#настройка-и-аудит).

### Необязательно: плагины

Вместо автономной установки, или для необязательного `emet-mascot`, можно установить emet как плагин. `emet self install` отказывается работать, пока установлен плагин emet, и объясняет, как его удалить; `--force` всё равно продолжает, а `emet doctor` предупреждает, когда они сосуществуют. Что именно поставляет плагин, зависит от хоста агента. В Claude Code он приносит `/emet:run`, агентов, защитные хуки и шим `emet`, который при первом использовании скачивает автономный бинарный файл с проверкой контрольной суммы. Плагин Codex поставляет навыки `$emet:run`, `$emet:init` и `$emet:doctor` и хук, но без агентов и без шима `emet`.

:::install-tabs

```bash tab="Claude Code"
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

```bash tab="Codex"
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

:::

Любая установка даёт те же три точки входа. В Claude Code это слэш-команды `/emet:run`, `/emet:init` и `/emet:doctor`; в Codex это навыки `$emet:run`, `$emet:init` и `$emet:doctor`. Автономная установка также помещает `emet` в ваш `PATH`, поэтому `emet init` и `emet doctor .` работают в обычном терминале; при наличии только плагина используйте слэш-команды или `! emet <subcommand>` внутри сессии Claude Code или Codex. В Claude Code имена агентов различаются: `emet:emet-worker` в плагине, `emet-worker` в автономной установке. В Codex агентов emet нет, потому что каждый воркер — отдельный процесс `codex exec`.

Рекомендуемый порядок в каждом репозитории: сначала выполните навык `setup-matt-pocock-skills` (`/setup-matt-pocock-skills` в Claude Code; в Codex — тот же навык из плагина `mattpocock-skills` через синтаксис `$` Codex), затем `emet init`.

Проверьте результат командой `/emet:doctor` внутри Claude Code (`$emet:doctor` в Codex) или `emet doctor .` в терминале (`selftest` требует установки из исходников через `--from`).

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
