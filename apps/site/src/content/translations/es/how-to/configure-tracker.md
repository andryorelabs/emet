---
title: Trackers y aterrizaje
description: Dónde viven los tickets, cómo aterriza una oleada como pull request o como merge local, y cómo se encadenan las oleadas.
seoTitle: Trackers y aterrizaje en emet
sourceHash: c79d8a04687b4620
---

Elige dónde viven los tickets, cómo aterriza una spec y si las oleadas se encadenan. Cada clave mencionada aquí está en la [referencia de configuración](../reference/configuration.md); cada subcomando está en la [referencia de la CLI](../reference/cli.md). Los términos siguen [GLOSSARY.md](../../GLOSSARY.md).

<img src="../brand/mascot/mascot-work.svg" alt="mascota de emet, trabajando" width="96" align="right">

## Requisitos previos

- emet instalado y un repositorio con un `emet.config.json`; ejecuta `emet init` si no lo tiene.
- Para el tracker `github` o el aterrizaje `pr`: `gh` en el `PATH` y autenticado.
- Para el tracker `linear`: un servidor MCP de Linear declarado en `.mcp.json` (o en el ámbito de usuario). Consulta la [referencia de dependencias](../reference/dependencies.md).
- Para entender qué cambian estos ajustes, lee [Aterrizaje](../concepts/landing.md) y [Corridas, oleadas y specs](../concepts/runs-waves-specs.md).

## Elegir el tracker

:::steps

1. Define `tracker.kind` en `emet.config.json` como `"linear"`, `"github"` o `"local"`.
2. Para un tracker local, ejecuta `emet init --tracker local`. Las specs y los tickets son entonces archivos markdown bajo `.scratch/` del worktree principal (sin versionar): `.scratch/<slug>/spec.md` y `.scratch/<slug>/issues/<NN>-<slug>.md`, cada uno con líneas `Status:` y `Blocked by:` y comentarios bajo `## Comments`. El coordinador los lee y escribe mediante `emet tracker`. Consulta el [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
3. Para los demás tipos, confirma el requisito previo correspondiente de arriba.

:::

## Elegir cómo aterriza una spec

:::steps

1. Define `landing.mode` como `"pr"` (por defecto) o `"merge"`. En modo `merge`, una spec aterriza como un único merge local en la rama troncal (`emet spec-branch land`, o `emet land` por oleada con `landing.unit: "wave"`), `commands.selfCheck` hace las veces de CI y no se hace push. Consulta el [ADR-0010](../adr/0010-local-merge-landing.md).
2. Define `landing.unit` como `"spec"` (por defecto, la spec entera aterriza de una vez) o `"wave"` (cada oleada aterriza sola). Consulta el [ADR-0037](../adr/0037-landing-per-spec.md).
3. Con `landing.unit: "spec"`, define `worktree.baseRef: "head"` en los ajustes de Claude Code para que los worktrees de los workers partan de la rama `spec/<id>`. `emet preflight` y `emet doctor` lo comprueban.
4. En modo `pr`, define `landing.specMergeMethod` (un commit de merge por defecto) con un método que permitan los ajustes del repositorio y el ruleset de la rama troncal; `emet doctor` avisa cuando no lo permiten.
5. Para controlar el merge, define `pr.autoMerge` (por defecto `true`) y `pr.maxCiFixAttempts`. Define `pr.mergeMethod` solo con `landing.unit: "wave"`; un pull request de spec usa `landing.specMergeMethod` del paso 4 e ignora este. Una oleada con cualquier cosa marcada nunca se fusiona automáticamente.

:::

Los comandos de la rama de la spec (`emet spec-branch ensure`, `integrate`, `sync`, `land`, `abandon`) los maneja el coordinador; sus banderas están en la [referencia de la CLI](../reference/cli.md).

## Encadenar oleadas

Las oleadas posteriores se ejecutan en sus propias sesiones. El encadenamiento está desactivado por defecto.

:::steps

1. Define la sección `handoff` en `emet.config.json`:

   ```json
   {
     "handoff": {
       "autoChain": true,
       "launcher": "auto",
       "permissionMode": "bypassPermissions"
     }
   }
   ```

2. En Claude Code, asegúrate de que `claude` esté en el `PATH` con compatibilidad con `--bg`, de que el espacio de trabajo sea de confianza (abre `claude` de forma interactiva en el repositorio una vez y acéptalo) y de que la advertencia de bypass se haya aceptado una vez en una sesión interactiva (`skipDangerousModePermissionPrompt`).
3. En Codex, asegúrate de que `codex` esté en el `PATH` en la versión `codex.minVersion` o posterior, con `--json` y `--output-schema` en `codex exec`; la siguiente oleada se inicia como un `codex exec` desacoplado. Consulta [Ejecutar emet en Codex](use-codex.md).
4. Define `handoff.launcher` (solo Claude Code) como `auto`, `orca` o `bg` para elegir si la oleada también abre una pestaña de Orca. `permissionMode` es solo de Claude Code; en Codex la sesión encadenada usa `codex.sandbox`.
5. Para iniciar una oleada en otra sesión a mano, ejecuta `emet launch <spec-id> --wave <n>` y no un `claude --bg` a secas. Imprime `{ name, id, attach, orcaTab: { opened, reason } }`.

:::

El encadenamiento solo lanza cuando el PR se fusionó y nada quedó marcado, se omite si ya hay una sesión `emet-<spec-id>-*` activa y recurre a imprimir `/emet:run --dispatch <spec-id>` si el lanzamiento falla. Inspecciona una oleada encadenada con `claude agents` o `claude attach emet-<spec-id>-w<n>`.

## Definir presupuestos y funciones opcionales

:::steps

1. Define la sección `budgets` si los valores por defecto no te sirven:

   ```json
   { "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
   ```

   `workerAttempts` es cuántas veces puede fallar un ticket en `verify` antes de diferirse; `reviewRounds` es cuántas rondas de revisión recibe un ticket antes de una escalada (las rondas de corrección tienen su propio `budgets.fixRounds`, por defecto 2); `stallNudgeCap` es cuántas veces se empuja a un worker detenido. Consulta [Revisión y compuertas](../concepts/review-and-gates.md).

2. Define `specs.enabled` para mantener [specs vivas](../concepts/living-specs.md) en `docs/specs/` (`specs.dir`).
3. Ejecuta `emet map` para escribir un mapa del código en `docs/agents/codebase.md` (`map.path`). `emet map --stale` termina con código 1 cuando HEAD ha avanzado más allá del sello.
4. Ejecuta `emet metrics --run <id>` tras una ejecución para ver tokens, costo y tiempo de reloj por ticket, oleada y ejecución.

:::

Para un cambio pequeño de un solo ticket, inicia `/emet:run --quick <solicitud>` en lugar del pipeline completo; siempre aterriza por oleada y se detiene ante un diff de alto riesgo.

## Comprobar

:::steps

1. Ejecuta `emet preflight`; valida las secciones `tracker`, `landing`, `pr`, `handoff` y `budgets` y termina con código 2 si la configuración está mal formada.
2. Ejecuta `emet doctor .` y confirma que ningún fallo nombre el tracker, `gh`, el servidor MCP de Linear ni los ajustes de aterrizaje.
3. Para un tracker local, ejecuta `emet tracker frontier --spec <slug>` y confirma que lista los tickets que esperas.

:::
