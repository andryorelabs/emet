---
title: Referencia de la CLI
description: Cada subcomando de emet, la tabla de compuertas y registros, los códigos de salida y las variables de entorno.
seoTitle: Referencia de la CLI de emet
sourceHash: 6ac3b40ddcfe5237
---

Cada subcomando de `emet`, la tabla de compuertas y registros, los códigos de salida y las variables de entorno. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md). Volver al [README](../../README.md). Cada comando imprime su uso con `--help`.

## Subcomandos

Tres comandos de barra envuelven la CLI dentro de Claude Code: `/emet:run` (el pipeline), `/emet:init` (`emet init`) y `/emet:doctor` (`emet doctor .`). Un `emet` en una terminal normal requiere `install.sh`; de lo contrario, ejecuta `! emet <subcommand>` dentro de una sesión.

`emet <command> [...args]`. `emet --version` imprime la versión.

### Configuración y auditoría

- `emet migrate [--dry-run]`: renombra un repositorio heredado a los nombres de emet.
- `emet init [--tracker linear|github|local] [--force]`: detecta automáticamente el gestor de paquetes, la rama troncal y el tipo de tracker, y escribe `emet.config.json` y los archivos `docs/agents/*.md`. `--tracker local` configura el tracker local.
- `emet doctor [--all] [<path> ...]`: auditoría de solo lectura de cualquier cantidad de repositorios a la vez; por defecto, el directorio actual.
- `emet preflight [--run <id>] [--post-dispatch]`: confirma que el repositorio está listo para despachar.
- `emet skill-path <name>`: imprime la ruta absoluta del `SKILL.md` de una skill de mattpocock-skills. Termina con código 1 si no se encuentra la skill.
- `emet selftest`: ejecuta las pruebas unitarias propias de la CLI. Solo en instalaciones desde el código fuente; un binario compilado termina con código 1 y te indica que ejecutes `emet doctor`.

En cualquier repositorio git:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

`emet init` deja un marcador `TODO(emet):` en los archivos `docs/agents/*.md` generados para todo lo que no puede inferir por sí mismo (un bloqueo compartido de la base de datos de pruebas, la propiedad del esquema, etc.). Complétalos; `emet preflight` se niega a despachar mientras quede alguno.

Luego, dentro de Claude Code:

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

#### Revisión de flota

`emet doctor` audita varios repositorios a la vez, en modo de solo lectura:

```bash
emet doctor ~/code/*
```

Informa, por repositorio: un `emet.config.json` válido, los cuatro archivos `docs/agents/*.md` presentes, cero marcadores `TODO(emet):` pendientes, si los comandos de `commands.selfCheck` realmente se resuelven y los hallazgos de dependencias propios del tracker de ese repositorio (`gh`, Linear; consulta [dependencias](dependencies.md#qué-comprueba-cada-cosa)). El plugin mattpocock-skills y las banderas de las CLI externas (`gh`, `claude --bg`, `claude agents --json`, verificadas mediante `--help`) se comprueban una sola vez para todo el barrido, no por repositorio.

### Ejecuciones, workers y slots

- `emet claims --reserve <ticket> --run <id> --anchor <pid>`: reserva un ticket para una ejecución. `--release <ticket>`, `--list` y `--prune [--dry-run]` liberan una reclamación, listan las reclamaciones o purgan las obsoletas.
- `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`: toma un slot de worker del pool de todo el host en `~/.local/state/emet/slots`. `--release --run <id>`, `--release-index <index>` y `--list` liberan slots o los listan.
- `emet cleanup [--run <id> | --all] [--dry-run] [--force]`: sin argumentos, recupera las ejecuciones cerradas o muertas cuyo trabajo ya aterrizó; `--run` limpia esta ejecución; `--all` es un barrido de ramas de todo el repositorio. Tras un merge, `emet cleanup --run <runId>` libera las ramas, las reclamaciones de tickets y los slots de workers de la oleada.
- `emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]`: imprime el motivo de `git worktree lock` que un worker escribe al arrancar.
- `emet launch <spec-id> --wave <n>`: inicia una oleada como una sesión `claude --bg` y abre su pestaña de Orca según `handoff.launcher`. Hace todo el lanzamiento (comprobación de sesión duplicada, `claude --bg`, pestaña) e imprime `{ name, id, attach, orcaTab: { opened, reason } }`. Úsalo, y no un `claude --bg` a secas, siempre que quieras una oleada en otra sesión a mano.
- `emet status [--spec <id>]`: Working / Checking / Ready / Needs-decision por oleada como JSON más una línea de resumen. `emet status --help` documenta el JSON.
- `emet usage [--session <id> | --file <path>] [--stalled [--minutes N]] [--project-dir <path>]`: informa del uso de la sesión; `--stalled` lista los workers detenidos.
- `emet handoff --check <path> | --render <path>`: valida o renderiza la nota `.emet/handoff-<ticket>.md` de un worker.
- `emet metrics [--run <id>]`: informa tokens, costo equivalente en API y tiempo de reloj por ticket, por oleada y por ejecución, leídos de las transcripciones de sesión. También compara el presupuesto de contexto estimado por ticket con lo que realmente usó cada worker. Su resumen va al final del informe final de la ejecución.

### Planificación, revisión y aterrizaje

- `emet validate --spec <id> | --file <path>`: validación del plan; consulta [Compuertas y registros](#compuertas-y-registros).
- `emet surfaces --check <file.json | ->`: rechaza globs de superficies permitidas que se solapen entre los tickets de una oleada.
- `emet approve --run <id>`, `emet materialize-log`, `emet results`, `emet verify`, `emet review-package`, `emet review`, `emet gate`: consulta [Compuertas y registros](#compuertas-y-registros).
- `emet assess --base <ref> --head <ref>`: clasifica un diff como `passive`, `medium` o `high` e imprime JSON con el nivel, los motivos y el modelo y esfuerzo recomendados para el revisor. Consulta [Models & effort](../../README.md#models--effort) y [`review`](configuration.md#review).
- `emet land --spec <s> --branch <integration> --tickets <id,...>`: fusiona una rama de integración en la rama troncal local (`landing.mode` `merge`). `commands.selfCheck` hace las veces de CI y no se hace push de nada.
- `emet spec-merge --spec <id>`: después de que una oleada se fusiona automáticamente, fusiona los deltas de requisitos `ADDED`/`MODIFIED`/`REMOVED` de la spec en `docs/specs/<area>.md` (`specs.dir`). Comprueba todas las áreas antes de escribir nada. Un conflicto, o un requisito que perdería un escenario, termina con código 1 y deja todos los archivos intactos.
- `emet map [--refresh]`: escribe un resumen de una base de código existente (stack, estructura, convenciones, pruebas, puntos calientes) en `docs/agents/codebase.md` (`map.path`), sellado con el SHA del commit a partir del cual se construyó. El mismo commit siempre produce el mismo archivo. `emet map --stale` termina con código 1 cuando HEAD ha avanzado más allá del sello, y `emet preflight` avisa en ese caso. `emet map --for <globs>` imprime solo las secciones que coinciden con las superficies de edición de un ticket; esa salida es la única parte del mapa que incluye el brief de un worker.
- `emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close`: el tracker local sobre `.scratch/`, JSON por stdout. Consulta [Tracker local](#tracker-local).
- `emet guard`: el hook `PreToolUse` de Claude Code; lee el JSON del hook por stdin. `install.sh` lo conecta en `~/.claude/settings.json`. Bloquea un puñado de desencadenantes conocidos de fallos en ejecuciones sin supervisión (consulta `emet/src/guard.ts`).

### Tracker local

Con `tracker.kind: "local"`, las specs y los tickets son archivos markdown bajo `.scratch/` del worktree principal (sin versionar): `.scratch/<slug>/spec.md` y `.scratch/<slug>/issues/<NN>-<slug>.md`, cada uno con líneas `Status:` y `Blocked by:` y comentarios bajo `## Comments`. El coordinador los lee y escribe mediante `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` lo configura. Consulta el [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

`landing.mode` es `"pr"` (por defecto) o `"merge"`, independiente del tracker. En modo `merge` una oleada aterriza como un único merge local en la rama troncal con `emet land`, con `commands.selfCheck` en lugar de la CI y sin push. `gh` solo es obligatorio cuando el tracker es `github` o el aterrizaje es `pr`. Consulta el [ADR-0010](../adr/0010-local-merge-landing.md) y [`landing`](configuration.md#landing).

### PRs de aterrizaje y encadenamiento de oleadas

Una oleada es un PR. Su cuerpo lleva `Closes #N` por cada ticket (la palabra clave de cierre del tracker), y el coordinador mueve los tickets a en revisión cuando abre el PR. Después el PR se fusiona según `pr.autoMerge`, o se deja abierto cuando la oleada fue marcada, `autoMerge` es `false` o se agotaron las correcciones de CI (entonces el PR recibe la etiqueta de decisión humana). Las oleadas posteriores se ejecutan en sus propias sesiones, nunca en la que ejecutó la oleada 1. Las secciones `pr` y `handoff` controlan lo que ocurre después; consulta [`pr`](configuration.md#pr) y [`handoff`](configuration.md#handoff).

## Compuertas y registros

Las fases no deciden por sí solas cuándo un ticket está terminado, es fusionable o vale la pena reintentarlo. Llaman a un comando de la CLI que lee un registro en disco e imprime la decisión. Los registros de ejecución viven en `.emet/runs/<run-id>/` y el libro de revisión en `.emet/review/`, en el checkout principal, no en el worktree de un worker.

| Paso                   | Comando                                              | Qué hace cumplir                                                                                                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Antes de la aprobación | `emet validate --file <plan.json>`                   | Cada `S#` está cubierto por al menos un ticket y tiene un escenario de aceptación. Cada ticket cubre al menos un `S#`. Las superficies de edición son disjuntas dentro de una oleada. No hay ciclos de dependencia. `emet preflight` lo ejecuta de nuevo sobre el plan aprobado.                            |
| Aprobación             | `emet approve --run <id> --spec <file>`              | Escribe `approval.json` con los hashes de la spec y de la lista de tickets. El despacho se niega si alguno cambió después (`--check`).                                                                                                                                                                      |
| Creación de tickets    | `emet materialize-log --run <id> --record/--lookup`  | Guarda el ID de cada ticket creado en cuanto existe, de modo que una ejecución interrumpida nunca crea duplicados.                                                                                                                                                                                          |
| Worker terminado       | `emet results --run <id> --write/--read <ticket>`    | Los workers escriben un archivo de resultado local (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` o `NEEDS_CONTEXT`, más una línea `Risk:`). Solo el coordinador escribe en el tracker.                                                                                                                           |
| Después de cada worker | `emet verify <ticket> --run <id>`                    | Comprueba que existan commits más allá de la base del despacho, que cada ruta modificada esté dentro de las superficies de edición del ticket, que la nota de handoff pase `handoff --check` y que `commands.workerScopedSuite` pase. La revisión y el merge rechazan un ticket sin registro de aprobación. |
| Entrada de la revisión | `emet review-package <base> <head> --out <file>`     | Empaqueta el diff para el revisor, que lo recibe como una ruta de archivo. Termina con código 3 si el rango está vacío o no es descendiente de la base.                                                                                                                                                     |
| Revisión               | `emet review --ticket <t> --findings <file>`         | Mantiene el libro de hallazgos y hace cumplir el orden de triaje (`intent_gap` → `bad_plan` → `patch` → `defer`) y el tope de rondas. `--escalate` pasa al siguiente nivel de modelo. `--rule`/`--rulings` registran y listan los "Rulings I made" para el informe y el cuerpo del PR.                      |
| Merge o encadenamiento | `emet gate <ticket> --tier … --ci … --integration …` | Imprime `merge`, `hold`, `chain`, `stop` o `defer` como JSON con sus motivos. Lee el registro de verify, los hallazgos abiertos, el nivel de riesgo, la CI, la suite de integración y los presupuestos.                                                                                                     |

Después de fusionar las ramas de una oleada, `commands.fullSuite` se ejecuta una vez en la rama de integración. Una ejecución en rojo bloquea el PR y `autoChain`. La compuerta recibe el resultado como `--integration`. Para los presupuestos que lee la compuerta, consulta [`budgets`](configuration.md#budgets).

## Códigos de salida

Los códigos de salida tienen el mismo significado en todos los subcomandos.

| Código | Significado                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------- |
| `0`    | Limpio.                                                                                                   |
| `1`    | Hallazgos sobre los que actuar.                                                                           |
| `2`    | Error de configuración o de uso; la herramienta nunca llegó a ejecutarse. También un comando desconocido. |
| `3`    | Error interno.                                                                                            |

## Variables de entorno

Variables de cara al usuario. Una variable, cuando está definida, reemplaza el valor de configuración correspondiente.

| Variable                      | Efecto                                                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` degrada un bloqueo por dependencias a una advertencia solo en esa ejecución. Defínela en tu propia shell, no en nada que el coordinador ejecute sin supervisión. |
| `EMET_MAX_LIVE_WORKERS`       | Reemplaza [`concurrency.maxLiveWorkers`](configuration.md#concurrency); acepta un entero positivo o `auto`.                                                                                                     |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | Reemplaza [`concurrency.runIdleThresholdMs`](configuration.md#concurrency), en milisegundos.                                                                                                                    |
| `EMET_STATE_DIR`              | Directorio de estado de todo el host, que contiene el pool de slots de workers. Orden de resolución: `$EMET_STATE_DIR`, luego `$XDG_STATE_HOME/emet`, luego `~/.local/state/emet`.                              |
| `EMET_MEM_RESERVE_GIB`        | Margen de memoria en GiB que debe seguir libre; una adquisición se deniega cuando la memoria disponible está por debajo. Por defecto 8. También alimenta el tope `auto` de workers.                             |
| `EMET_MEM_PER_WORKER_GIB`     | Memoria en GiB que se supone por worker cuando `maxLiveWorkers` es `auto`. Por defecto 2. Súbela para un stack más pesado por worker, como una suite E2E con navegador por worktree.                            |
| `EMET_CPU_OVERSUBSCRIBE`      | Multiplicador de CPU para el tope `auto` de workers. Por defecto 1.                                                                                                                                             |

El tope `auto` es `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`. Los nombres heredados `FORGE_*` aún se leen; `EMET_*` gana cuando ambos están definidos.
