---
title: Referencia de configuración
description: Cada clave de emet.config.json con su valor por defecto y su significado.
seoTitle: Referencia de configuración de emet
sourceHash: ae0e205cbdcf4b88
---

Cada clave de `emet.config.json`, con su valor por defecto y su significado. La fuente de verdad es [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json). Los términos siguen [GLOSSARY.md](../../GLOSSARY.md). Volver al [README](../../README.md).

`emet init` escribe el archivo con `$schema` apuntando a la URL pública `https://emet.andryore.dev/schema/emet.config.schema.json`, que el sitio web sirve idéntica byte a byte a la fuente de verdad, de modo que los editores ofrecen autocompletado en cualquier lugar. `emet preflight` y `emet doctor` lo validan. Una clave marcada como solo prosa la leen los prompts de `/emet` (las skills `$emet:*` en Codex), no la CLI. Una clave marcada como obsoleta aún se acepta. El esquema también permite una clave de texto libre `"//"` para notas (nunca leída por ninguna herramienta) y `"version"`, que siempre es `1`.

## language

- `conversation` (por defecto `"en"`): etiqueta BCP 47 del idioma en el que el agente responde al usuario.
- `artifacts` (por defecto `"en"`): etiqueta BCP 47 del idioma del código, los comentarios, los mensajes de commit, el texto de los PR, los tickets y la documentación.

Ambas deben ser cadenas no vacías. Una configuración sin sección `language` se carga con ambas en `"en"`, y `emet init` escribe ambas. Los prompts instalados las leen.

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

- `afterSpec` (por defecto `"none"`, uno de `release`, `promote`, `none`): qué hace `/emet:run` cuando la última oleada de una spec se ha fusionado sin problemas. `promote` ejecuta `emet promote`: un pull request de `develop` a `main` fusionado con un commit de merge una vez que CI está en `pass`, y luego un pull request de sincronización de vuelta solo si `develop` está por detrás de `main`. `release` abre el pull request de release con los pasos del skill `cut-release` y se detiene para que intervenga una persona. `none` no hace nada. `emet init` lo detecta (`release` con una etiqueta `v*` y un archivo de workflow cuyo nombre contiene `release`; `promote` con una rama `develop` y sin esa etiqueta; en otro caso `none`), y `emet init --after-spec <mode>` lo fuerza. Una configuración que no lo incluye se carga como `none`. `--no-promote`, pasado a `/emet:run` o a `emet promote`, hace que el paso sea `none` en esa ejecución.

  `afterSpec` también acepta una lista ordenada no vacía de reglas, `{ "paths"?: string[], "mode": "release|promote|none" }`, de modo que un mismo repositorio pueda publicar una CLI y promover un sitio web. El modo se elige a partir de las rutas que promover `develop` llevaría a `main`: gana la primera regla cuyos `paths` coinciden con todas las rutas modificadas; si no, se aplica la regla sin `paths` (solo la última regla puede omitirlo); si no, `none`. Sin rutas modificadas también se recurre a esa regla de respaldo. Los globs usan el comparador del guard de edición, así que los segmentos `[locale]` y `(group)` son literales. Las rutas modificadas provienen de `git fetch origin main develop` y `git diff --name-only --no-renames -z origin/main...origin/develop`, de modo que un renombrado cuenta su ruta antigua y la nueva. Solo se leen cuando `afterSpec` es una lista de reglas o `deploy.check.paths` está definido, y solo cuando `repo.trunk` es `develop`; en otro caso la lista está vacía. Un fallo de git hace que `emet promote` salga con 1 y no abra nada. La forma de cadena nunca mira las rutas.

  ```json
  {
    "handoff": {
      "afterSpec": [
        { "paths": ["apps/site/**", "docs/**"], "mode": "promote" },
        { "mode": "release" }
      ]
    }
  }
  ```

  Aquí una spec que solo toca el sitio web o la documentación se promueve, y cualquier spec que toque la CLI se detiene en un pull request de release.

- `launcher` (por defecto `auto`, uno de `auto`, `orca`, `bg`): solo Claude Code; se ignora en el host de Codex, donde `emet launch` no abre ninguna pestaña de Orca. Abre además la oleada en una pestaña de Orca que ejecuta `claude attach`. `auto` consulta el runtime de Orca (`orca status`), por lo que también funciona desde sesiones `claude --bg`, que no tienen `TERM_PROGRAM`; `orca` siempre lo intenta; `bg` nunca. La oleada se ejecuta en segundo plano de cualquier forma, y una pestaña que no logra abrirse nunca detiene la cadena. `emet launch <spec-id> --wave <n>` hace todo el lanzamiento; consulta [`emet launch`](cli.md#ejecuciones-workers-y-slots).
- `permissionMode` (por defecto `bypassPermissions`, uno de `bypassPermissions`, `auto`, `acceptEdits`): solo Claude Code; se ignora en el host de Codex, donde la sesión encadenada usa [`codex.sandbox`](#codex). Modo de permisos de la sesión encadenada. No se hereda de la sesión que la lanza, porque el clasificador del modo `auto` puede denegar un paso como `gh pr merge` y dejar una oleada a medias. Tus reglas `permissions.deny` siguen aplicándose, pero la advertencia de bypass debe haberse aceptado una vez de forma interactiva (`skipDangerousModePermissionPrompt`).

## deploy

Opcional. Si falta, no hay comprobación de deploy.

```json
{
  "deploy": {
    "check": {
      "command": "curl -fsS https://example.com/health",
      "retries": 10,
      "intervalSeconds": 15,
      "timeoutSeconds": 300,
      "paths": ["apps/site/**"]
    }
  }
}
```

- `check.command`: comando de shell que termina con 0 cuando el deploy está sano.
- `check.retries`, `check.intervalSeconds`, `check.timeoutSeconds`: enteros positivos; el máximo de intentos, la espera entre ellos y el límite de tiempo total. `emet deploy-check` imprime `ok`, `failed` o `timeout` y termina con 0, 1 o 3.
- `check.paths` (opcional): una lista no vacía de globs no vacíos. Con ella, un promote que se fusionó ejecuta la comprobación solo cuando coincide una ruta modificada; sin ella, todo promote fusionado la ejecuta.

La comprobación ya no depende de `afterSpec`. `emet promote` imprime `deployCheck: { run, reason }` y el coordinador ejecuta `emet deploy-check` solo cuando `run` es true: nunca sin un `deploy.check` ni tras una última oleada que no esté limpia; en `repo.trunk` `main`, donde cada merge despliega, tras una última oleada limpia sea cual sea el modo (también con `--no-promote` o una spec retenida, e ignorando `paths`); en `develop`, solo en modo `promote` tras un promote fusionado que coincida con `paths`. En modo `release` el deploy espera a una persona.

## verify

Opcional. Si falta, no hay verificación en el navegador y todos los comandos se comportan como antes.

```json
{
  "verify": {
    "browser": {
      "startCommand": "bun run dev",
      "url": "http://localhost:4321",
      "paths": ["apps/site/**"]
    }
  }
}
```

- `browser.startCommand`: comando de shell no vacío que inicia el servidor de desarrollo de la app. El revisor lo ejecuta y lo detiene al terminar.
- `browser.url`: URL no vacía en la que responde la app en ejecución.
- `browser.paths` (opcional): una lista no vacía de globs no vacíos. Con ella, la comprobación en el navegador se ejecuta solo cuando coincide una ruta modificada; sin ella, todo diff revisado cumple. Los globs usan el mismo comparador que `deploy.check.paths`.
- Las claves desconocidas bajo `verify` o `verify.browser` se rechazan.

`emet assess` imprime `browserVerify: { run, reason }`, y el coordinador rellena el eje Browser del revisor solo cuando `run` es true: el nivel tiene revisor (no es `passive`), `verify.browser` está configurado, el binario opcional [`agent-browser`](cli.md#configuración-y-auditoría) está en el PATH y, si `paths` está definido, coincide una ruta modificada. En caso contrario, `reason` nombra la primera condición que falló y la revisión se ejecuta como antes. Un diff solo de documentación es `passive`, así que un cambio solo de contenido no se verifica en el navegador. Un revisor cuyos comandos del navegador fallan dos veces recurre a Chrome DevTools MCP o informa un hallazgo `verification-gap`; nunca bloquea la oleada.

## validate

Opcional. Si falta, no hay comprobación de superficies acopladas y todos los comandos se comportan como antes.

```json
{
  "validate": {
    "coupledSurfaces": [
      {
        "source": "docs/{guide,reference,how-to}/**/*.md",
        "dependents": "apps/site/src/content/translations/**"
      }
    ]
  }
}
```

- `coupledSurfaces`: una lista no vacía de pares. Cada par tiene un glob `source` y un glob `dependents`, ambos cadenas no vacías; `source` acepta globs con llaves como `docs/{guide,reference}/**/*.md`.
- Las claves desconocidas bajo `validate` o en un par se rechazan, y una entrada mal formada hace fallar la carga con un mensaje que nombra `validate.coupledSurfaces[<n>]`.

`emet validate` (`--file` y `--spec`) y la compuerta de ejecución de `emet preflight` informan un error `coupled-surface-split` cuando un ticket cuyas superficies se solapan con el `source` de un par está en una oleada anterior a la de un ticket cuyas superficies se solapan con los `dependents` de ese par. Las ediciones de una página fuente y los tickets que actualizan lo que depende de ella, como las traducciones, deben publicarse en la misma oleada. La misma oleada, o ningún ticket de dependents, pasa. Consulta [ADR-0033](../adr/0033-coupled-surfaces-ship-in-one-wave.md).

## interview

- `research` (por defecto `true`): con `true`, la Fase 1 de `/emet:run` hace que el agente busque la respuesta en el repo, la documentación o fuentes primarias, y explique por qué recomienda una opción, antes de hacer una pregunta técnica que ofrece opciones. El usuario sigue respondiendo. `false` lo desactiva.

## gate

Qué hace `emet gate` con los hallazgos bloqueantes abiertos.

```json
{ "gate": { "onHold": "fix-and-continue" } }
```

- `onHold` (por defecto `fix-and-continue`): con `fix-and-continue`, los hallazgos bloqueantes abiertos responden `hold` con `next: "fix-findings"` mientras a [`budgets.fixRounds`](#budgets) le queden rondas. La compuerta responde `stop` solo cuando un hallazgo abierto es de tipo `intent_gap`, las rondas de corrección se agotan con hallazgos abiertos, o la suite de integración falla por segunda vez después de volver a ejecutar sus specs fallidas (un primer fallo responde `hold` con `next: "rerun-failed-specs"`). `stop` mantiene el comportamiento anterior. Una CI que nunca se ejecutó (`--ci env-fault`) responde `hold` con `next: "rerun-ci"` sin cargar `pr.maxCiFixAttempts`, y luego `next: "report-infrastructure"` la segunda vez seguida.

## budgets

Todos opcionales.

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "fixRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts` (por defecto `2`, mínimo `1`): cuántas veces puede fallar un ticket en `verify` antes de que la compuerta responda `defer`. El ticket recibe la etiqueta de diferido y el resto de la oleada continúa. Un fallo del entorno, como que el comando de pruebas termine con 126/127 o una caída del proveedor, pausa la ejecución sin gastar un intento.
- `reviewRounds` (por defecto `2`, mínimo `1`): cuántas rondas de revisión/corrección recibe un ticket antes de una escalada al siguiente nivel de modelo. Lo que siga abierto después de eso recibe un dictamen.
- `fixRounds` (por defecto `2`): cuántas rondas de corrección recibe una oleada con [`gate.onHold`](#gate) `fix-and-continue`. Cada una termina con `emet review --recheck` y cuenta aquí, nunca contra `reviewRounds`. Sin rondas restantes y con un hallazgo bloqueante abierto, la compuerta responde `stop`. Un ledger escrito sin este campo se lee como `0` usadas.
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
{ "review": { "highRiskPaths": [], "dual": "auto" } }
```

- `highRiskPaths` (por defecto `[]`): subcadenas de ruta adicionales, sin distinguir mayúsculas, que fuerzan el nivel de revisión `high` en `emet assess`, además del conjunto integrado (autenticación, seguridad, pagos, webhooks, CI, el instalador, lockfiles, migraciones y puntos sensibles peligrosos como SQL sin procesar o pipe-to-shell).
- `dual` (`"auto"` o `"off"`, por defecto `"auto"`; `emet init` no lo escribe): controla la Dual review. Con `auto`, una ola `high` en el host Claude Code con el binario `codex` en el PATH ejecuta dos revisores en paralelo sobre el mismo paquete: el revisor Claude y `emet review-run`. El Coordinator combina sus hallazgos con `emet review --merge`, hace el triaje de cada hallazgo de un solo revisor (conservarlo, o descartarlo con `emet review --rule`) y registra solo los Coverage verdicts del revisor Claude. `off` ejecuta siempre un solo revisor. `emet assess` imprime la decisión como `dualReview: { run, reason }`.

## memory

```json
{ "memory": { "enabled": "auto" } }
```

- `enabled` (`"auto"` o `"off"`, por defecto `"auto"`): controla [`emet memory`](cli.md#ejecuciones-workers-y-slots). Con `auto`, el comando usa Engram cuando el binario `engram` está en el PATH y su handshake tiene éxito. `off` hace que `emet memory search` y `emet memory save` impriman `{available: false, reason: "memory.enabled is off"}` y terminen con 0 sin lanzar `engram`. Cualquier otro valor falla al cargar con `"memory.enabled" must be one of auto|off`.

## attention

```json
{ "attention": { "alert": true } }
```

- `alert` (booleano, por defecto `true`): emet lanza una sola alerta cuando una sesión pasa a `needs-decision`. Si `orca status --json` informa un runtime accesible, ejecuta `orca worktree set` sobre el worktree principal con un comentario y la marca de no leído; si no, ejecuta `notify-send` cuando está en el PATH; si no, no hace nada. Cada llamada externa tiene un límite de 3 s y un fallo nunca cambia el resultado del guard. Salir de `needs-decision` nunca borra la marca de no leído de Orca. `false` desactiva la alerta.

## landing

- `mode` (por defecto `pr`): `pr` abre un pull request (requiere `gh`). `merge` fusiona la rama de integración en la rama troncal local con `emet land` y nunca hace push, con `commands.selfCheck` en lugar de la CI. Independiente del tracker. Consulta el [ADR-0010](../adr/0010-local-merge-landing.md).
- `unit` (por defecto `spec`): `spec` integra cada oleada en la rama `spec/<id>` con `emet spec-branch integrate` y aterriza la spec una vez con `emet spec-branch land`; `wave` aterriza cada oleada sola, como antes. Cualquier otro valor falla al cargar con `"landing.unit" must be one of spec|wave`. `spec` requiere `worktree.baseRef: "head"` en los ajustes de Claude Code (un ajuste del arnés, no una clave de emet), que `emet preflight` y `emet doctor` comprueban. Consulta el [ADR-0037](../adr/0037-landing-per-spec.md).
- `specMergeMethod` (por defecto `merge`): cómo se fusiona el PR de la spec: `merge`, `squash` o `rebase`. `merge` conserva un commit de merge por oleada, así que una oleada se puede revertir; `squash` y `rebase` sirven para una rama troncal que no permite commits de merge, a costa de esa reversión. Ignora `pr.mergeMethod`. `emet doctor` avisa cuando los ajustes del repositorio o el ruleset de la rama troncal no permiten el método elegido.
- `pushSpecBranch` (por defecto `true`): envía `spec/<id>` tras cada `emet spec-branch integrate`, sin abrir un PR. Ponlo en `false` para mantener la rama local hasta el aterrizaje final.

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

- `enabled` (por defecto `false`): activa las specs vivas. En la última oleada de una spec, el coordinador escribe deltas de requisitos a partir de los elementos S# de la spec, ejecuta `emet spec-merge` y confirma `specs.dir` con esa oleada, de modo que la actualización se revisa y aterriza con ella.
- `dir` (por defecto `docs/specs`): directorio, relativo al repositorio, de las specs vivas, escrito por `emet spec-merge` cuando `enabled` es verdadero.

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

## Variables de entorno

La CLI lee estas variables, todas a través de `emet/src/env.ts`. Una variable con grafía `FORGE_` sigue funcionando como alternativa a su nombre `EMET_` e imprime una advertencia una sola vez. Los valores vacíos cuentan como no definidos. `tools/env-docs.test.ts` mantiene esta tabla y el código sincronizados.

| Variable                      | Alternativa heredada           | Significado                                                                                                                                                   |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_MAX_LIVE_WORKERS`       | `FORGE_MAX_LIVE_WORKERS`       | Límite de workers vivos a la vez: un número positivo o `auto`. Sustituye a `concurrency.maxLiveWorkers`.                                                      |
| `EMET_STATE_DIR`              | `FORGE_STATE_DIR`              | Directorio de estado de todo el host, que contiene el grupo de slots de workers.                                                                              |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `FORGE_SKIP_DEPENDENCY_CHECKS` | Defínelo en `1` para degradar a advertencias las comprobaciones de dependencias bloqueantes en `emet preflight`.                                              |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | `FORGE_RUN_IDLE_THRESHOLD_MS`  | Milisegundos que la transcripción de una ejecución puede permanecer en silencio antes de considerarse inactiva. Sustituye a `concurrency.runIdleThresholdMs`. |
| `EMET_CPU_OVERSUBSCRIBE`      | `FORGE_CPU_OVERSUBSCRIBE`      | Factor de sobresuscripción de CPU para el límite automático de workers.                                                                                       |
| `EMET_MEM_RESERVE_GIB`        | `FORGE_MEM_RESERVE_GIB`        | GiB de memoria que se mantienen libres antes de conceder un slot de worker.                                                                                   |
| `EMET_MEM_PER_WORKER_GIB`     | `FORGE_MEM_PER_WORKER_GIB`     | GiB de memoria que el límite automático de workers supone por worker.                                                                                         |
| `EMET_AGENT_HOST`             |                                | Defínelo en `codex` al ejecutar bajo el host de agente Codex; cualquier otro valor significa Claude.                                                          |
| `CODEX_HOME`                  |                                | El directorio home de Codex; por defecto `~/.codex`. Solo se lee.                                                                                             |
| `XDG_STATE_HOME`              |                                | Base del directorio de estado cuando `EMET_STATE_DIR` no está definida.                                                                                       |
| `NO_COLOR`                    |                                | Si está definida, el banner se imprime sin color.                                                                                                             |
| `FORCE_COLOR`                 |                                | Cualquier valor salvo vacío o `0` fuerza un banner con color, incluso sin TTY.                                                                                |
| `TERM`                        |                                | `dumb` desactiva el color del banner.                                                                                                                         |
