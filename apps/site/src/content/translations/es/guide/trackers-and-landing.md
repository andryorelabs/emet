---
title: Trackers y aterrizaje
description: Dónde viven los tickets, cómo aterriza una oleada como pull request o como merge local, y cómo se encadenan las oleadas.
seoTitle: Trackers y aterrizaje en emet
sourceHash: 4e3835764329636c
---

Dónde viven los tickets, cómo aterriza una oleada y cómo se encadenan las oleadas. Cada clave mencionada aquí está en la [referencia de configuración](../reference/configuration.md); cada subcomando está en la [referencia de la CLI](../reference/cli.md).

<img src="../brand/mascot/mascot-work.svg" alt="mascota de emet, trabajando" width="96" align="right">

## Trackers

emet funciona con Linear, GitHub Issues o archivos locales, según `tracker.kind`. `gh` es obligatorio para el tracker `github`. Para el tracker `linear` hay que declarar un servidor MCP de Linear en `.mcp.json` (o en el ámbito de usuario); consulta la [referencia de dependencias](../reference/dependencies.md).

### Tracker local

Con `tracker.kind: "local"`, las specs y los tickets son archivos markdown bajo `.scratch/` del worktree principal (sin versionar): `.scratch/<slug>/spec.md` y `.scratch/<slug>/issues/<NN>-<slug>.md`, cada uno con líneas `Status:` y `Blocked by:` y comentarios bajo `## Comments`. El coordinador los lee y escribe mediante `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` lo configura. Consulta el [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

## Aterrizaje

`landing.mode` es `"pr"` (por defecto) o `"merge"`, independiente del tracker. En modo `merge` una oleada aterriza como un único merge local en la rama troncal con `emet land`, con `commands.selfCheck` en lugar de la CI y sin push. `gh` solo es obligatorio cuando el tracker es `github` o el aterrizaje es `pr`. Consulta el [ADR-0010](../adr/0010-local-merge-landing.md).

### PRs de aterrizaje

Una oleada es un PR. Su cuerpo lleva `Closes #N` por cada ticket (la palabra clave de cierre del tracker), y el coordinador mueve los tickets a en revisión cuando abre el PR. Después el PR se fusiona según `pr.autoMerge`, o se deja abierto cuando la oleada fue marcada, `autoMerge` es `false` o se agotaron las correcciones de CI (entonces el PR recibe la etiqueta de decisión humana). Tras un merge, `emet cleanup --run <runId>` libera las ramas, las reclamaciones de tickets y los espacios de workers de la oleada.

Después de fusionar las ramas de una oleada, `commands.fullSuite` se ejecuta una vez en la rama de integración. Una ejecución en rojo bloquea el PR y `autoChain`. La compuerta recibe el resultado como `--integration`.

### Encadenar oleadas

Las oleadas posteriores se ejecutan en sus propias sesiones, nunca en la que ejecutó la oleada 1. Dos secciones opcionales de `emet.config.json` controlan lo que ocurre después (ambas validadas por `emet preflight`):

```json
{
  "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 },
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `pr.autoMerge` (por defecto `true`): espera los checks del PR y lo fusiona; sin checks, lo fusiona de inmediato. Un check que falla se corrige y se sube, hasta `maxCiFixAttempts` veces, y luego el PR se deja abierto para una persona. Una oleada con cualquier cosa marcada nunca se fusiona automáticamente.
- `handoff.autoChain` (por defecto `false`): tras una oleada limpia y fusionada con más oleadas pendientes, lanza la siguiente con `claude --bg` en lugar de imprimir `/emet:run --dispatch <spec-id>`. Inspecciónala con `claude agents` / `claude attach emet-<spec-id>-w<n>`. Requisitos:
  1. `claude` en el PATH, con compatibilidad con `--bg`.
  2. Un espacio de trabajo de confianza. `--bg` se ejecuta sin interacción, así que el diálogo de confianza nunca aparece; abre `claude` de forma interactiva en el repositorio una vez y acéptalo.
  3. La advertencia de bypass aceptada una vez en una sesión interactiva (`skipDangerousModePermissionPrompt`), ya que la siguiente oleada se ejecuta en `handoff.permissionMode` (abajo), no en el modo de la sesión que la lanza.

  Solo se lanza cuando el PR se fusionó y nada quedó marcado, y se omite si ya hay una sesión `emet-<spec-id>-*` activa (`claude agents --json`). Si el lanzamiento falla, recurre a imprimir `/emet:run --dispatch <spec-id>`.

- `handoff.launcher` (por defecto `auto`): abre además la oleada en una pestaña de Orca que ejecuta `claude attach`. `auto` consulta el runtime de Orca (`orca status`), por lo que también funciona desde sesiones `claude --bg`, que no tienen `TERM_PROGRAM`; `orca` siempre lo intenta, `bg` nunca. La oleada se ejecuta en segundo plano de cualquier forma, y una pestaña que no logra abrirse nunca detiene la cadena.

  `emet launch <spec-id> --wave <n>` hace todo el lanzamiento (comprobación de sesión duplicada, `claude --bg`, pestaña) e imprime `{ name, id, attach, orcaTab: { opened, reason } }`. Úsalo, y no un `claude --bg` a secas, siempre que quieras una oleada en otra sesión a mano.

- `handoff.permissionMode` (por defecto `bypassPermissions`): modo de permisos de la sesión encadenada. No se hereda de la sesión que la lanza, porque el clasificador del modo `auto` puede denegar un paso como `gh pr merge` y dejar una oleada a medias. Tus reglas `permissions.deny` siguen aplicándose, pero la advertencia de bypass debe haberse aceptado una vez de forma interactiva (`skipDangerousModePermissionPrompt`).

## Compuertas, presupuestos y registros

Las fases no deciden por sí solas cuándo un ticket está terminado, es fusionable o vale la pena reintentarlo. Llaman a un comando de la CLI que lee un registro en disco e imprime la decisión. Los registros de ejecución viven en `.emet/runs/<run-id>/` y el libro de revisión en `.emet/review/`, en el checkout principal, no en el worktree de un worker. Cada comando imprime su uso con `--help`. La tabla de comandos y lo que cada uno hace cumplir está en [Compuertas y registros](../reference/cli.md#compuertas-y-registros).

**Presupuestos** (`emet.config.json`, todos opcionales):

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts`: cuántas veces puede fallar un ticket en `verify` antes de que la compuerta responda `defer`. El ticket recibe la etiqueta de diferido y el resto de la oleada continúa. Un fallo del entorno, como que el comando de pruebas termine con 126/127 o una caída del proveedor, pausa la ejecución sin gastar un intento.
- `reviewRounds`: cuántas rondas de revisión/corrección recibe un ticket antes de una escalada al siguiente nivel de modelo. Lo que siga abierto después de eso recibe un dictamen.
- `stallNudgeCap`: cuántas veces se empuja a un worker detenido. El conteo nunca se reinicia.

## Specs vivas, mapa y métricas

**Specs vivas.** Después de que una oleada se fusiona automáticamente, `emet spec-merge --spec <id>` fusiona los deltas de requisitos `ADDED`/`MODIFIED`/`REMOVED` de la spec en `docs/specs/<area>.md` (`specs.dir`). Comprueba todas las áreas antes de escribir nada. Un conflicto, o un requisito que perdería un escenario, termina con código 1 y deja todos los archivos intactos.

**Mapa del código.** `emet map` escribe un resumen de una base de código existente (stack, estructura, convenciones, pruebas, puntos calientes) en `docs/agents/codebase.md` (`map.path`), sellado con el SHA del commit a partir del cual se construyó. El mismo commit siempre produce el mismo archivo. `emet map --stale` termina con código 1 cuando HEAD ha avanzado más allá del sello, y `emet preflight` avisa en ese caso. `emet map --for <globs>` imprime solo las secciones que coinciden con las superficies de edición de un ticket. Esa salida es la única parte del mapa que incluye el brief de un worker.

**Métricas.** `emet metrics --run <id>` informa tokens, costo equivalente en API y tiempo de reloj por ticket, por oleada y por ejecución, leídos de las transcripciones de sesión. También compara el presupuesto de contexto estimado por ticket con lo que realmente usó cada worker. Su resumen va al final del informe final de la ejecución.
