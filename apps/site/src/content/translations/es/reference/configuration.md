---
title: Referencia de configuración
description: Cada clave de emet.config.json con su valor por defecto y su significado.
seoTitle: Referencia de configuración de emet
sourceHash: ec827dfcb8627f5c
---

Cada clave de `emet.config.json`, con su valor por defecto y su significado. La fuente de verdad es [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json). Los términos siguen [GLOSSARY.md](../../GLOSSARY.md). Volver al [README](../../README.md).

`emet init` escribe el archivo. `emet preflight` y `emet doctor` lo validan. Una clave marcada como solo prosa la leen los prompts de `/emet` (las skills `$emet:*` en Codex), no la CLI. Una clave marcada como obsoleta aún se acepta. El esquema también permite una clave de texto libre `"//"` para notas (nunca leída por ninguna herramienta) y `"version"`, que siempre es `1`.

## pr

Cómo se fusiona el PR de una oleada.

```json
{ "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 } }
```

- `autoMerge` (por defecto `true`): espera los checks del PR y lo fusiona; sin checks, lo fusiona de inmediato. Un check que falla se corrige y se sube, hasta `maxCiFixAttempts` veces, y luego el PR se deja abierto para una persona. Una oleada con cualquier cosa marcada nunca se fusiona automáticamente.
- `mergeMethod` (por defecto `squash`): `squash`, `merge` o `rebase`, que se pasa a `gh pr merge`.
- `maxCiFixAttempts` (por defecto `2`, mínimo `0`): cuántas veces puede intentar el coordinador corregir un check que falla antes de dejar el PR abierto para una persona.

## handoff

Qué ocurre después de que se cierra una oleada, y los límites de tamaño de la nota de handoff de un worker. Validado por `emet preflight`.

```json
{
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `maxLines` (por defecto `60`): máximo de líneas que puede tener una nota `.emet/handoff-<ticket>.md` antes de que `emet handoff --check` la rechace.
- `maxChars` (por defecto `8000`, unos 2k tokens): máximo de caracteres que puede tener una nota de handoff.
- `autoChain` (por defecto `false`): tras una oleada limpia y fusionada con más oleadas pendientes, lanza la siguiente en lugar de imprimir `/emet:run --dispatch <spec-id>` (`$emet:run --dispatch <spec-id>` en Codex). En Claude Code el lanzamiento es `claude --bg`; en el host de Codex es un `codex exec` desacoplado, que necesita `codex` en la versión `codex.minVersion` o posterior. Los requisitos de abajo son los de Claude Code. Inspecciónala con `claude agents` o `claude attach emet-<spec-id>-w<n>`. Requisitos:
  1. `claude` en el PATH, con compatibilidad con `--bg`.
  2. Un espacio de trabajo de confianza. `--bg` se ejecuta sin interacción, así que el diálogo de confianza nunca aparece; abre `claude` de forma interactiva en el repositorio una vez y acéptalo.
  3. La advertencia de bypass aceptada una vez en una sesión interactiva (`skipDangerousModePermissionPrompt`), ya que la siguiente oleada se ejecuta en `handoff.permissionMode`, no en el modo de la sesión que la lanza.

  Solo se lanza cuando el PR se fusionó y nada quedó marcado, y se omite si ya hay una sesión `emet-<spec-id>-*` activa (`claude agents --json`). Si el lanzamiento falla, recurre a imprimir `/emet:run --dispatch <spec-id>`.

- `launcher` (por defecto `auto`, uno de `auto`, `orca`, `bg`): solo Claude Code; se ignora en el host de Codex, donde `emet launch` no abre ninguna pestaña de Orca. Abre además la oleada en una pestaña de Orca que ejecuta `claude attach`. `auto` consulta el runtime de Orca (`orca status`), por lo que también funciona desde sesiones `claude --bg`, que no tienen `TERM_PROGRAM`; `orca` siempre lo intenta; `bg` nunca. La oleada se ejecuta en segundo plano de cualquier forma, y una pestaña que no logra abrirse nunca detiene la cadena. `emet launch <spec-id> --wave <n>` hace todo el lanzamiento; consulta [`emet launch`](cli.md#ejecuciones-workers-y-slots).
- `permissionMode` (por defecto `bypassPermissions`, uno de `bypassPermissions`, `auto`, `acceptEdits`): solo Claude Code; se ignora en el host de Codex, donde la sesión encadenada usa [`codex.sandbox`](#codex). Modo de permisos de la sesión encadenada. No se hereda de la sesión que la lanza, porque el clasificador del modo `auto` puede denegar un paso como `gh pr merge` y dejar una oleada a medias. Tus reglas `permissions.deny` siguen aplicándose, pero la advertencia de bypass debe haberse aceptado una vez de forma interactiva (`skipDangerousModePermissionPrompt`).

## budgets

Todos opcionales.

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts` (por defecto `2`, mínimo `1`): cuántas veces puede fallar un ticket en `verify` antes de que la compuerta responda `defer`. El ticket recibe la etiqueta de diferido y el resto de la oleada continúa. Un fallo del entorno, como que el comando de pruebas termine con 126/127 o una caída del proveedor, pausa la ejecución sin gastar un intento.
- `reviewRounds` (por defecto `2`, mínimo `1`): cuántas rondas de revisión/corrección recibe un ticket antes de una escalada al siguiente nivel de modelo. Lo que siga abierto después de eso recibe un dictamen.
- `stallNudgeCap` (por defecto `6`, mínimo `1`): cuántas veces se empuja a un worker detenido. El conteo nunca se reinicia.

## models

Modelo y esfuerzo por rol para el host de Claude Code; el host de Codex lee en su lugar [`codex.models`](#codex). Todas las claves son opcionales; omitir la sección mantiene el worker en `sonnet`/`medium` y el revisor en `opus`/`medium`. El esfuerzo es uno de `low`, `medium`, `high`, `xhigh`, `max`.

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  }
}
```

- `worker.model` (por defecto `sonnet`), `worker.effort` (por defecto `medium`): el worker. La línea `Model:` de un ticket reemplaza a `worker` solo para ese worker.
- `reviewer.medium` y `reviewer.high` (por defecto `opus`, `medium` cada uno): el revisor para cada nivel de riesgo que devuelve `emet assess`. Sube `reviewer.high.effort` (por ejemplo a `high`) para más escrutinio en las oleadas riesgosas.
- `triage` (por defecto `haiku`): el modelo económico para el triaje de logs de CI y la revisión de nivel pasivo. Un check que falla se entrega a un agente con este modelo, que devuelve como máximo unos 2k tokens con punteros `file:line`.
- `escalation` (por defecto `{ "sonnet": "opus" }`): el siguiente nivel de modelo por nombre de modelo, usado cuando un ticket alcanza su tope de correcciones.

## agentHost

`agentHost` (por defecto `"claude"`): el host de agente en el que se ejecuta una ejecución, `"claude"` o `"codex"`. Consulta la [guía de Codex](../guide/codex.md).

## codex

Solo se lee cuando `agentHost` es `"codex"`. Todas las claves son opcionales. El esfuerzo es uno de `low`, `medium`, `high`, `xhigh`, `max`; `ultra` nunca se acepta.

- `models.worker`, `models.workerOverride`, `models.reviewer.medium`, `models.reviewer.high`, `models.triage`: cada una es `{ "model", "effort", "fallback" }`. `fallback` lista los slugs que se prueban en orden cuando `model` no está en la caché de modelos de Codex. Los valores por defecto están en [Modelos y esfuerzo](../guide/models-and-effort.md).
- `models.session`: `{ "model", "effort", "planEffort", "fallback" }` para la sesión que ejecuta `$emet:run`. `planEffort` se aplica hasta la primera aprobación.
- `effort`: si se define, reemplaza el esfuerzo de todos los roles.
- `minVersion` (por defecto `0.167.0`): la versión más antigua de la CLI `codex` que admite emet. `emet doctor` no compara con ella la versión instalada.
- `sandbox` (por defecto `danger-full-access`): el modo de sandbox que pasan como `-s` `emet dispatch`, `emet review-run` y un `emet launch` de Codex. `workspace-write` también se acepta, pero deja `.git` en solo lectura, así que los workers no pueden hacer commit. Sea cual sea el valor, `emet guard` deniega `git push` en Codex, y el `config.toml` de la superposición generada solo contiene el marketplace y el plugin de emet, tablas de confianza para los directorios propios de la corrida y el modelo y el esfuerzo resueltos (nunca tus propias tablas). Consulta la [guía de Codex](../guide/codex.md) y [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md).

## review

```json
{ "review": { "highRiskPaths": [] } }
```

- `highRiskPaths` (por defecto `[]`): subcadenas de ruta adicionales, sin distinguir mayúsculas, que fuerzan el nivel de revisión `high` en `emet assess`, además del conjunto integrado (autenticación, seguridad, pagos, webhooks, CI, el instalador, lockfiles, migraciones y puntos sensibles peligrosos como SQL sin procesar o pipe-to-shell).

## landing

- `mode` (por defecto `pr`): `pr` abre un pull request (requiere `gh`). `merge` fusiona la rama de integración en la rama troncal local con `emet land` y nunca hace push, con `commands.selfCheck` en lugar de la CI. Independiente del tracker. Consulta el [ADR-0010](../adr/0010-local-merge-landing.md).

## tracker

Con qué issue tracker habla `/emet` (o `$emet` en Codex). La CLI lee `kind` para decidir qué comprobaciones de dependencias aplican; el resto documenta el adaptador que sigue el comando `/emet` (consulta [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md)).

- `kind` (obligatorio): `linear`, `github` o `local`. Para `local`, consulta [Tracker local](cli.md#tracker-local) y el [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
- `transitions.onStart`, `transitions.onPrOpen`, `transitions.onPrMerge`: quién escribe cada transición de estado del ticket: `worker`, `coordinator` o `automatic` (lo hace la integración del tracker, por ejemplo la integración de GitHub de Linear al abrir o fusionar un PR). El coordinador nunca escribe una transición marcada como `automatic`.
- `github.priorityLabels`: asigna un nivel de prioridad (`"1"` = P0 la más alta a `"4"` = P3) a un nombre de etiqueta de GitHub, por ejemplo `{"1":"P0","2":"P1"}`. Si no se declara ninguno, los tickets se ordenan por `createdAt` ascendente y `emet doctor` lo indica.
- `github.stateLabels`: asigna un estado del flujo de trabajo (`todo`, `in-progress`, `in-review`) a un nombre de etiqueta de GitHub, por ejemplo `{"todo":"status:todo"}`. `done` y `canceled` se infieren del estado cerrado de la issue y de `state_reason`.
- `linear`: ajustes específicos de Linear (clave del equipo, nombres de los estados del flujo). Solo los lee el modelo que sigue `docs/agents/issue-tracker.md`, nunca la CLI.
- `local.idPrefix` (obsoleto): los ids de tickets locales ahora son `<feature-slug>-<NN>`.
- `readyLabel`, `triageLabels`, `prReference` (obsoletos): plantillas de etiquetas y de referencia al PR, por ejemplo `Closes #{number}` (github) o `Refs: {id}` (linear).

## preflight

- `requiredFiles` (por defecto ninguno): archivos que `emet preflight` exige en la raíz del repositorio antes de que se despache una oleada, cada uno `{ "path", "why" }`; `why` aparece en el mensaje de fallo. Vacío significa que la comprobación no se ejecuta.
- `requiredCommands` (por defecto ninguno): binarios que deben resolverse en el PATH antes del despacho. `emet preflight` falla con código 1 nombrando los que no, y `emet doctor` los informa. Es la lista propia del repositorio, separada de las [comprobaciones de dependencias](dependencies.md#qué-comprueba-cada-cosa) dirigidas por el tracker; `gh` ya tiene una comprobación dedicada, por lo que listarlo es opcional. Adiciones habituales: `rg` y `sg`.

## specs

- `dir` (por defecto `docs/specs`): directorio, relativo al repositorio, de las specs vivas, escrito por `emet spec-merge`.

## map

- `path` (por defecto `docs/agents/codebase.md`): ruta, relativa al repositorio, del mapa que genera `emet map`.

## concurrency

- `waveSize` (por defecto `4`, mínimo `1`): máximo de llamadas a Agent despachadas juntas en una oleada.
- `maxLiveWorkers` (por defecto `auto`): tope global compartido por todos los coordinadores `/emet` que se ejecutan en este host, en todos los repositorios. El pool de slots vive en `~/.local/state/emet/slots`, no en ningún repositorio concreto. `auto` deriva el tope del número de CPU y de la RAM del host; un entero positivo lo fija. Una comprobación separada de margen de memoria (`EMET_MEM_RESERVE_GIB`, por defecto 8 GiB) deniega una adquisición cuando la memoria disponible es demasiado baja, independientemente de este tope. La variable de entorno `EMET_MAX_LIVE_WORKERS` reemplaza este campo y también acepta `auto`.
- `runIdleThresholdMs` (por defecto `5400000`, 90 minutos): cuánto tiempo una ejecución sin ancla viva sigue clasificándose como inactiva en lugar de muerta, basándose solo en la frescura de la transcripción. La variable de entorno `EMET_RUN_IDLE_THRESHOLD_MS` la reemplaza.

Consulta [Variables de entorno](cli.md#variables-de-entorno).

## ticket

- `idPattern`: fuente de una regex anclada que debe cumplir el id de un ticket, por ejemplo `^PROJ-\d+$`. Un patrón inválido es un error de configuración grave.
- `branchPrefix`: prefijo en minúsculas (`^[a-z0-9-]+$`) para la rama local de un worker. Las ramas son `<branchPrefix>-<number>-<slug>`, y `cleanup` barre el glob `<branchPrefix>-*`.
- `idExample` (obsoleto, solo prosa): un id de ejemplo que cumple `idPattern`.
- `branchPattern` (obsoleto, solo prosa): plantilla completa del nombre de rama.

## commands

Todos son solo prosa.

- `selfCheck`: comandos que un worker ejecuta antes de dar por terminado su cambio, por ejemplo `["npm run check"]`. Con `landing.mode` en `merge` hace las veces de la CI.
- `workerScopedSuite`: comando que un worker ejecuta para probar solo el área que tocó. `emet verify` exige que pase.
- `fullSuite.run`: comando de la suite de todo el repositorio, ejecutado una vez en la rama de integración después de fusionar las ramas de una oleada. Una ejecución en rojo bloquea el PR y `autoChain`.
- `fullSuite.singleton`: `true` si solo un worktree puede ejecutar la suite a la vez.
- `fullSuite.runInBackground`, `fullSuite.reset` (obsoletos): bandera de segundo plano y comandos de restablecimiento de estado.

## worktree

- `lockReason`: plantilla del motivo de `git worktree lock` que un worker escribe al arrancar, completada por `emet lock-reason`. El valor por defecto es `emet run={runId} ticket={ticket} anchor={anchorPid} slug={coordinatorSlug} at={iso}`. Reemplázala solo para añadir campos: `emet lock-reason` rechaza una plantilla que omita el token literal `emet`, o cualquiera de `run=`, `ticket=`, `anchor=`, `at=` o `slug=`.
- `copyFromMain` (solo prosa): rutas copiadas del checkout troncal a un worktree nuevo antes del bootstrap, por ejemplo archivos de entorno sin seguimiento.
- `bootstrap` (solo prosa): comandos de shell que se ejecutan una vez en un worktree nuevo antes de que arranque un worker, por ejemplo `["npm ci"]`. Los ejecuta la fase 6 de `/emet`, nunca la CLI.
- `stateDir` (obsoleto, solo prosa): directorio para los logs locales de la ejecución, por ejemplo `.emet`.

## usage

- `oversizedReadLines` (por defecto `400`, mínimo `1`): un Read sin offset ni límite sobre un archivo con más de esta cantidad de líneas cuenta como sobredimensionado en `emet usage`.
- `stalledMinutes` (por defecto `10`, mínimo `1`): umbral `--minutes` por defecto de `emet usage --stalled`.

## sizing

- `inlineMaxLines` (por defecto `100`, mínimo `1`): el cuerpo de ticket más grande, en líneas, que se mantiene en línea en el prompt de un worker.

## schema

Solo prosa. La propiedad del esquema de datos de este repositorio, usada por la regla de evitación de conflictos de la fase 3 al dividir tickets. Vacío u omitido omite la regla.

- `ownedPaths`: rutas que definen el esquema compartido, por ejemplo `["prisma/schema.prisma"]`. A lo sumo un worker por oleada puede tocarlas.
- `sharedDatabase` (obsoleto): `true` si los workers comparten una misma base de datos física.

## commit

Solo prosa.

- `trailer`: clave del trailer de git que un worker añade a los commits que referencian el ticket, por ejemplo `Refs`.
- `trailerPosition`: `body` o `footer`.

## repo

- `trunk`: la rama hacia la que se fusionan los cambios de todos los workers, y la base de cada comparación de git de cleanup y preflight, por ejemplo `main`.
- `remote` (por defecto `origin`): el remoto de git en el que vive `trunk`.
- `integrationBranch` (obsoleto, solo prosa): rama opcional de larga vida sobre la que se integra una oleada antes de la rama troncal.
- `commitTypes` (obsoleto, solo prosa): tipos de Conventional Commit permitidos para los commits de los workers.

## design

Opcional, solo prosa. `null` u omitido omite el paso de diseño/revisión de UI.

- `canvasIndex` (obsoleto): ruta a un archivo de lienzo de diseño que los workers consultan antes de cambios de UI.
