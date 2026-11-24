---
title: Трекеры и посадка
description: Где живут тикеты, как волна приземляется в виде pull request или локального слияния и как волны выстраиваются в цепочку.
seoTitle: Трекеры и посадка в emet
sourceHash: c79d8a04687b4620
---

Выберите, где живут тикеты, как приземляется спецификация и выстраиваются ли волны в цепочку. Каждый упомянутый здесь ключ описан в [справочнике по конфигурации](../reference/configuration.md); каждая подкоманда — в [справочнике по CLI](../reference/cli.md). Термины соответствуют [GLOSSARY.md](../../GLOSSARY.md).

<img src="../brand/mascot/mascot-work.svg" alt="emet mascot, working" width="96" align="right">

## Предварительные требования

- emet установлен, и есть репозиторий с `emet.config.json`; выполните `emet init`, если его нет.
- Для трекера `github` или посадки `pr`: `gh` в `PATH` и авторизован.
- Для трекера `linear`: сервер Linear MCP, объявленный в `.mcp.json` (или на уровне пользователя). См. [справочник по зависимостям](../reference/dependencies.md).
- Чтобы понять, что меняют эти настройки, прочитайте [Посадка](../concepts/landing.md) и [Запуски, волны и спецификации](../concepts/runs-waves-specs.md).

## Выбор трекера

:::steps

1. Задайте `tracker.kind` в `emet.config.json` равным `"linear"`, `"github"` или `"local"`.
2. Для локального трекера выполните `emet init --tracker local`. Тогда спецификации и тикеты — это markdown-файлы в `.scratch/` основного worktree (не под версионным контролем): `.scratch/<slug>/spec.md` и `.scratch/<slug>/issues/<NN>-<slug>.md`, каждый со строками `Status:` и `Blocked by:` и комментариями под `## Comments`. Координатор читает и записывает их через `emet tracker`. См. [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
3. Для остальных видов убедитесь, что выполнено соответствующее требование выше.

:::

## Выбор способа посадки спецификации

:::steps

1. Задайте `landing.mode` равным `"pr"` (по умолчанию) или `"merge"`. В режиме `merge` спецификация приземляется как одно локальное слияние в trunk (`emet spec-branch land` или `emet land` для каждой волны при `landing.unit: "wave"`), вместо CI выступает `commands.selfCheck`, а push не выполняется. См. [ADR-0010](../adr/0010-local-merge-landing.md).
2. Задайте `landing.unit` равным `"spec"` (по умолчанию, вся спецификация приземляется целиком) или `"wave"` (каждая волна приземляется отдельно). См. [ADR-0037](../adr/0037-landing-per-spec.md).
3. При `landing.unit: "spec"` задайте `worktree.baseRef: "head"` в настройках Claude Code, чтобы worktree воркеров стартовали от ветки `spec/<id>`. Это проверяют `emet preflight` и `emet doctor`.
4. В режиме `pr` задайте `landing.specMergeMethod` (по умолчанию merge-коммит) равным методу, который разрешают настройки репозитория и ruleset trunk; `emet doctor` предупреждает, когда они его не разрешают.
5. Чтобы управлять слиянием, задайте `pr.autoMerge` (по умолчанию `true`) и `pr.maxCiFixAttempts`. Задавайте `pr.mergeMethod` только при `landing.unit: "wave"`; PR спецификации использует `landing.specMergeMethod` из шага 4 и игнорирует его. Волна с чем-либо помеченным никогда не сливается автоматически.

:::

Команды ветки спецификации (`emet spec-branch ensure`, `integrate`, `sync`, `land`, `abandon`) выполняет координатор; их флаги описаны в [справочнике по CLI](../reference/cli.md).

## Цепочки волн

Последующие волны выполняются в собственных сессиях. По умолчанию цепочки выключены.

:::steps

1. Задайте секцию `handoff` в `emet.config.json`:

   ```json
   {
     "handoff": {
       "autoChain": true,
       "launcher": "auto",
       "permissionMode": "bypassPermissions"
     }
   }
   ```

2. В Claude Code убедитесь, что `claude` есть в `PATH` с поддержкой `--bg`, рабочее пространство доверенное (один раз откройте `claude` интерактивно в репозитории и подтвердите это), а предупреждение об обходе было один раз принято в интерактивной сессии (`skipDangerousModePermissionPrompt`).
3. В Codex убедитесь, что `codex` есть в `PATH` версии `codex.minVersion` или новее, с `--json` и `--output-schema` у `codex exec`; следующая волна запускается как отсоединённый `codex exec`. См. [Запуск emet в Codex](use-codex.md).
4. Задайте `handoff.launcher` (только Claude Code) равным `auto`, `orca` или `bg`, чтобы выбрать, открывать ли для волны ещё и вкладку Orca. `permissionMode` относится только к Claude Code; в Codex цепочечная сессия использует `codex.sandbox`.
5. Чтобы вручную запустить волну в другой сессии, выполните `emet launch <spec-id> --wave <n>`, а не голый `claude --bg`. Команда выводит `{ name, id, attach, orcaTab: { opened, reason } }`.

:::

Цепочка запускается, только если PR слит и ничего не помечено, пропускается, если сессия `emet-<spec-id>-*` уже активна, а при сбое запуска возвращается к выводу `/emet:run --dispatch <spec-id>`. Посмотреть цепочечную волну можно через `claude agents` или `claude attach emet-<spec-id>-w<n>`.

## Бюджеты и необязательные возможности

:::steps

1. Задайте секцию `budgets`, если значения по умолчанию не подходят:

   ```json
   { "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
   ```

   `workerAttempts` — сколько раз тикет может провалить `verify`, прежде чем будет отложен; `reviewRounds` — сколько раундов ревью получает тикет до одной эскалации (у раундов исправлений собственный `budgets.fixRounds`, по умолчанию 2); `stallNudgeCap` — сколько раз застрявшего воркера подталкивают. См. [Ревью и гейты](../concepts/review-and-gates.md).

2. Задайте `specs.enabled`, чтобы вести [живые спецификации](../concepts/living-specs.md) в `docs/specs/` (`specs.dir`).
3. Выполните `emet map`, чтобы записать карту кодовой базы в `docs/agents/codebase.md` (`map.path`). `emet map --stale` завершается кодом 1, когда HEAD ушёл дальше отметки.
4. После запуска выполните `emet metrics --run <id>`, чтобы увидеть токены, стоимость и время выполнения по тикету, волне и запуску.

:::

Для небольшого изменения в один тикет запустите `/emet:run --quick <запрос>` вместо полного конвейера; он всегда приземляется по волнам и останавливается на diff с высоким риском.

## Проверка

:::steps

1. Выполните `emet preflight`; он проверяет секции `tracker`, `landing`, `pr`, `handoff` и `budgets` и завершается кодом 2 при некорректной конфигурации.
2. Выполните `emet doctor .` и убедитесь, что ни один сбой не называет трекер, `gh`, сервер Linear MCP или настройки посадки.
3. Для локального трекера выполните `emet tracker frontier --spec <slug>` и убедитесь, что он перечисляет ожидаемые тикеты.

:::
