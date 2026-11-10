---
title: Обновление emet
description: Как перейти с установленного emet на новый релиз и включить автообновление маркетплейса для плагинов.
seoTitle: Обновление emet
sourceHash: 584eafb89175d6c7
---

Как перевести установленный emet на новый релиз. Термины соответствуют [GLOSSARY.md](../../GLOSSARY.md).

emet и необязательный плагин `emet-mascot` поставляются из одного маркетплейса, `emet-marketplace`. По умолчанию Claude Code не обновляет сторонние маркетплейсы самостоятельно, и маркетплейс не может изменить это значение по умолчанию для своих пользователей.

## Обновление вручную

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Пропустите последнюю строку, если вы не устанавливали маскота. После этого перезапустите Claude Code или выполните `/reload-plugins`. `claude plugin list` показывает установленные версии; последняя указана в [CHANGELOG.md](../../CHANGELOG.md).

## Обновление в Codex

В документации этого репозитория для плагина Codex нет отдельной команды обновления. Выполните заново команды установки из раздела [Запуск emet в Codex](../guide/codex.md#установка):

```bash
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

`codex plugin list` показывает, установлен ли и включён ли `emet@emet-marketplace`.

## Автоматическое обновление

В Claude Code выполните `/plugin`, откройте вкладку **Marketplaces**, выберите `emet-marketplace` и нажмите **Enable auto-update**. Тогда при запуске сессии Claude Code обновляет маркетплейс и оба плагина, а следующая сессия загружает новые версии. Это настраивается отдельно на каждой машине.

## Установлено через install.sh

Подтяните последний `main` в своём клоне и снова запустите `./install.sh`.
