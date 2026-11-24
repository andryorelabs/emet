---
title: Обновление emet
description: Как перейти с установленного emet на новый релиз и включить автообновление маркетплейса для плагинов.
seoTitle: Обновление emet
sourceHash: 380b07ed5a10474f
---

Как перевести установленный emet на новый релиз. Термины соответствуют [GLOSSARY.md](../../GLOSSARY.md).

## Обновление автономной установки

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

Релиз скачивается, проверяется по `SHA256SUMS` (и по аттестации, если есть `gh`) и подготавливается. Замена символической ссылки и установленных файлов происходит, только когда не занят ни один слот воркера; иначе обновление остаётся отложенным и применяется при следующем запуске сессии. Сбой оставляет текущую версию нетронутой и записывается в журнал. Предыдущая версия сохраняется для отката, более старые удаляются. `emet doctor` предупреждает, когда обновление отложено.

## Автоматическое обновление

Хук `SessionStart` запускает `emet self update --auto` не чаще раза в сутки, в отсоединённом режиме и без вывода, если сети нет. Чтобы отключить, задайте `EMET_AUTO_UPDATE=0` или выполните:

```bash
emet self update --auto off
```

`emet self update --auto on` включает его снова. Для установок плагина автообновление ничего не делает.

## Необязательно: плагины

emet и необязательный плагин `emet-mascot` поставляются из одного маркетплейса, `emet-marketplace`. По умолчанию Claude Code не обновляет сторонние маркетплейсы самостоятельно, и маркетплейс не может изменить это значение по умолчанию для своих пользователей.

### Claude Code

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Пропустите последнюю строку, если вы не устанавливали маскота. После этого перезапустите Claude Code или выполните `/reload-plugins`. `claude plugin list` показывает установленные версии; последняя указана в [CHANGELOG.md](../../CHANGELOG.md).

Чтобы обновлять автоматически, выполните `/plugin` в Claude Code, откройте вкладку **Marketplaces**, выберите `emet-marketplace` и нажмите **Enable auto-update**. Тогда при запуске сессии Claude Code обновляет маркетплейс и оба плагина. Это настраивается отдельно на каждой машине.

### Codex

Обновите снимок маркетплейса, затем добавьте плагин ещё раз. Повторный запуск `codex plugin marketplace add` его не обновляет:

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` показывает, установлен ли и включён ли `emet@emet-marketplace`. Автообновление — функция Claude Code; в Codex обновляйте вручную.
