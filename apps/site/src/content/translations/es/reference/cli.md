---
title: Referencia de la CLI
description: Cada subcomando de emet, las compuertas y los registros, los códigos de salida y las variables de entorno.
seoTitle: Referencia de la CLI de emet
sourceHash: 5f612062f6f49bcc
---

Cada subcomando de `emet`, las compuertas y los registros, los códigos de salida y las variables de entorno. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md). Volver al [README](../../README.md). Cada comando imprime su uso con `--help`.

## Subcomandos

Tres comandos de barra envuelven la CLI dentro de Claude Code: `/emet:run` (el pipeline), `/emet:init` (`emet init`) y `/emet:doctor` (`emet doctor .`). En Codex son las skills `$emet:run`, `$emet:init` y `$emet:doctor`. Un `emet` en una terminal normal requiere `emet self install`; de lo contrario, ejecuta `! emet <subcommand>` dentro de una sesión.

`emet <command> [...args]`. `emet --version` imprime la versión.

En cualquier repositorio git:

```bash
emet init       # autodetects package manager, trunk branch, tracker kind
emet preflight  # confirms the repo is dispatch-ready
```

`emet init` deja un marcador `TODO(emet):` en los archivos `docs/agents/*.md` generados para todo lo que no puede inferir por sí mismo (un bloqueo compartido de la base de datos de pruebas, la propiedad del esquema, etc.). Complétalos; `emet preflight` se niega a despachar mientras quede alguno.

Luego, dentro de Claude Code (en Codex, usa `$emet:run` con los mismos argumentos):

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## Configuración y auditoría

### `emet migrate`

Renombra un repositorio heredado a los nombres de emet.

- `--dry-run`

### `emet init`

Detecta automáticamente el gestor de paquetes, la rama troncal, el tipo de tracker y el modo after-spec (consulta [`handoff.afterSpec`](configuration.md#handoff)). Establece [`schema.ownedPaths`](configuration.md#schema) cuando encuentra un esquema de Prisma (`prisma/schema.prisma` o una carpeta `prisma/schema/`) o una carpeta de migraciones de Drizzle (`drizzle/` junto a un `drizzle.config.*`), y escribe `emet.config.json` y los archivos `docs/agents/*.md`.

- `--tracker linear|github|local`: `--tracker local` configura el tracker local.
- `--after-spec release|promote|none`
- `--force`

### `emet doctor`

Auditoría de solo lectura de cualquier cantidad de repositorios a la vez; por defecto, el directorio actual.

- `--all`
- `<path> ...`: los repositorios que se auditan.

Para un repositorio que configura [`verify.browser`](configuration.md#verify) también informa un hallazgo opcional sobre `agent-browser`: un binario ausente es `indeterminate` (una línea `optional:` con un remedio de instalación), y cuando el binario existe, un `agent-browser doctor` que falla aparece como advertencia. Ninguno es nunca un error, y ninguno cambia el código de salida. Un repositorio sin `verify.browser` no muestra nada.

#### Revisión de flota

`emet doctor` audita varios repositorios a la vez, en modo de solo lectura:

```bash
emet doctor ~/code/*
```

Informa, por repositorio: un `emet.config.json` válido, los cuatro archivos `docs/agents/*.md` presentes, cero marcadores `TODO(emet):` pendientes, si los comandos de `commands.selfCheck` realmente se resuelven y los hallazgos de dependencias propios del tracker de ese repositorio (`gh`, Linear; consulta [dependencias](dependencies.md#qué-comprueba-cada-cosa)).

El plugin mattpocock-skills y las banderas de las CLI externas se comprueban una sola vez para todo el barrido, no por repositorio. Son `gh`, más las del Agent host: `claude --bg` y `claude agents --json` en Claude Code, `codex exec --json` y `--output-schema` en Codex, verificadas mediante `--help`.

### `emet setup`

Ofrece las instalaciones opcionales con preguntas de readline.

- `--yes`
- `--with <ids>`
- `--list`
- `--json`
- `--dry-run`: combinable con `--with`, `--yes` y `--json`. Imprime los pasos planificados de cada elemento elegido, o `already-present`, y no cambia nada: no ejecuta ningún comando, no escribe ningún archivo ni entrada del registro, y termina con 0.
- `--restore <id>`: deshace uno de los dos elementos que se pueden restaurar; véase [Registro de setup y restauración](#registro-de-setup-y-restauración).

Sin TTY, o con `--yes` o `--with`, no pregunta nada e instala exactamente los elementos indicados; sin TTY y sin `--with` no instala nada e imprime el catálogo de `--list`. Cada paso informa `installed`, `already-present`, `skipped` o `failed`; un fallo no detiene a los demás, y el código de salida es 1 si alguno falló. `/emet:setup` es la entrada del plugin y plantea las mismas opciones con `AskUserQuestion`. Cada elemento que termina `installed` se anota en el Setup ledger.

Los elementos:

- `mattpocock-skills` (activado por defecto), `engram`, `mascot`, `orca-pet` y `gh-auth`.
- `agent-browser` (desactivado por defecto): ejecuta `bun add -g agent-browser@latest` y luego `agent-browser install`, y escribe `~/.agent-browser/config.json` con `contentBoundaries: true` y `maxOutput: 50000` solo cuando ese archivo no existe. Después ejecuta `agent-browser doctor` e imprime una advertencia si falla. Nunca fija una versión y nunca pasa `--with-deps`, así que si faltan bibliotecas del sistema imprime el comando para que lo ejecutes tú.
- `context7` (desactivado por defecto): ejecuta `bun add -g ctx7@latest`, luego `ctx7 setup --cli --claude --yes` y `ctx7 setup --cli --codex --yes` solo si `codex` está en el PATH. Instala la CLI `ctx7` y su skill `find-docs`, no el servidor MCP, nunca fija una versión e imprime el comando para ejecutar a mano cuando falla un paso de `ctx7 setup`. `ctx7` envía eventos de uso anónimos salvo que se defina `CTX7_TELEMETRY_DISABLED=1`, y un `CONTEXT7_API_KEY` en el entorno tiene prioridad sobre la cuenta guardada por `ctx7 login`.
- `firecrawl-local` (desactivado por defecto): requiere `cargo` y ejecuta `cargo install firecrawl-local` cuando falta el binario. Luego registra un servidor MCP de Claude Code de ámbito de usuario con `FIRECRAWL_CLOUD=search` y `--public-only`, reemplazando un registro anterior con otros ajustes. Scrape, crawl y map se ejecutan en la máquina, solo la búsqueda web va a Firecrawl Cloud y se bloquean las direcciones privadas.
  - Pasa el Chrome más reciente que descargó `agent-browser` como `FIRECRAWL_CHROME_PATH`.
  - En Linux, donde AppArmor restringe los espacios de nombres de usuario sin privilegios, imprime un perfil de AppArmor y los comandos `sudo` para cargarlo, porque Firecrawl Local nunca ejecuta Chrome sin su sandbox.
  - Sin un Chrome utilizable, las páginas que se renderizan con JavaScript llegan vacías.
- `claude-settings`: los ajustes recomendados de Claude Code, aplicados solo si se eligen, tras una copia de seguridad con marca de tiempo de `settings.json`.

#### Registro de setup y restauración

`emet setup` anota cada elemento que termina `installed` en `setup-ledger.json`, dentro del directorio de estado, como `{ id, at, undo }`. Un elemento `already-present` no anota nada, y un segundo `installed` del mismo id conserva el estado previo de la primera entrada. Las escrituras del registro son atómicas, y un registro mal formado es un error que nombra su ruta, nunca se lee como vacío.

Los registros de deshacer contienen lo necesario para revertir:

- `claude-settings`: el `model` anterior (o ninguno), las reglas de denegación que realmente añadió y la ruta de la copia de seguridad.
- `firecrawl-local`: la entrada MCP de ámbito de usuario anterior (leída de `~/.claude.json` antes de que se ejecute `claude mcp remove`) y si emet ejecutó `cargo install`.
- Plugins: el id del plugin.
- `orca-pet`: los archivos escritos.
- `agent-browser`: el global de bun (y el archivo de configuración, cuando lo creó emet).
- `context7`: el global de bun.
- `engram`: la fórmula de brew y el plugin.

`emet setup --restore <id>` acepta solo `claude-settings` y `firecrawl-local`; cualquier otro id termina con 2.

- `claude-settings` restaura el `model` anterior (o borra la clave cuando no había ninguno) y quita solo las reglas de denegación que añadió emet, tras una copia de seguridad con marca de tiempo. Cuando el `model` actual no es el que estableció setup, lo conserva e imprime una advertencia.
- `firecrawl-local` ejecuta `claude mcp remove firecrawl-local -s user` y luego `claude mcp add-json firecrawl-local '<previous json>' -s user` cuando se había anotado una entrada.

Una restauración correcta elimina la entrada del registro; un id sin entrada imprime `nothing to restore for <id>` y termina con 1.

`emet uninstall` revierte cada entrada del registro de la misma manera: `claude-settings` y `firecrawl-local` como en `--restore`, los plugins con `claude plugin uninstall <id>`, los archivos de `orca-pet` y una configuración de agent-browser creada por emet borrándolos. Para los globales de brew, bun y cargo imprime el comando de eliminación (por ejemplo `bun remove -g ctx7`) y nunca lo ejecuta, y nunca toca `gh auth`. Cada entrada revertida sale del registro, y un extra que falla no detiene a los demás.

### `emet self install`

La instalación independiente: `emet self install [latest|X.Y.Z]`.

- `--dry-run`: lista cada escritura y no escribe nada.
- `--force`: continúa aunque el plugin de emet esté instalado; sin él, el comando se niega mientras el plugin esté instalado.
- `--from <checkout>`: reproduce una instalación desde el código fuente con Bun. El código fuente de la CLI se copia a `~/.claude/emet` y `~/.local/bin/emet` pasa a ser un contenedor que ejecuta `bun` sobre él, de modo que `emet selftest` funciona; falla sin `bun`. Quienes contribuyen usan `emet self install --from .`.

Coloca el binario en `~/.local/share/emet/versions/<v>/emet` con el enlace simbólico `~/.local/bin/emet`, escribe los prompts de referencia y `.install-manifest.json` en `~/.claude/emet/`, los comandos en `~/.claude/commands/emet/` y los agentes en `~/.claude/agents/`.

Fusiona los hooks de emet en `~/.claude/settings.json` (con copia de seguridad, sin tocar los hooks ajenos) y, cuando Codex está presente, escribe las skills bajo `~/.agents/skills` y añade los hooks a `$CODEX_HOME/hooks.json` (por defecto `~/.codex`; `config.toml` nunca se escribe, así que aprueba los hooks una vez con `/hooks`).

Una segunda ejecución no cambia nada; un archivo editado se conserva y la nueva versión queda a su lado como `<file>.new`. El script de instalación de una línea de [Instalar](../start/install.md) descarga el binario de la versión, verifica `SHA256SUMS` y ejecuta este comando.

### `emet self update`

`emet self update [latest|X.Y.Z]` descarga la versión, verifica `SHA256SUMS` (y la atestación cuando `gh` está presente) y la deja preparada. El cambio del enlace simbólico y de los archivos instalados ocurre solo cuando no hay ningún slot de worker retenido; de lo contrario queda pendiente hasta el siguiente inicio de sesión. Un fallo deja intacta la versión actual y se registra en el journal. La versión anterior se conserva para volver atrás y las más antiguas se eliminan. No hace nada en instalaciones como plugin.

- `--auto [off|on]`: lo que ejecuta el hook `SessionStart`. Se ejecuta como máximo una vez al día, desacoplado y en silencio cuando no hay conexión; `off` u `on` lo activa o desactiva. `EMET_AUTO_UPDATE=0` también lo desactiva.

### `emet uninstall`

Elimina una instalación de `emet self install` y lo que añadió `emet setup`. Primero construye el plan completo y después lo ejecuta.

- `--dry-run`: imprime el plan y no cambia nada.
- `--yes`: omite la confirmación. Con TTY y sin `--yes` pregunta una vez, y sin TTY y sin `--yes` imprime el plan, no cambia nada y termina con 0.
- `--purge`: elimina además el directorio de estado (`EMET_STATE_DIR`, o `XDG_STATE_HOME/emet`) y `~/.emet`; sin él ambos se conservan.
- `--json`: imprime el resultado como JSON.

Lo que elimina:

- Cada archivo del manifiesto de instalación cuyo hash siga coincidiendo con el registrado, junto con su hermano `.new`; los archivos editados se conservan y se listan.
- El shim `~/.local/bin/emet`, solo cuando es el wrapper de la instalación o un enlace simbólico a `~/.claude/emet` o `~/.local/share/emet/versions`; después el manifiesto y los directorios que quedan vacíos.
- De `~/.claude/settings.json` y de `$CODEX_HOME/hooks.json` (por defecto `~/.codex`), todo comando de hook de emet en cualquier evento (`emet guard`, `emet setup --notice`, `emet whats-new --hook` y `emet self update --auto`). Conserva los demás hooks y elimina los grupos y eventos que quedan vacíos.
- Las skills de Codex bajo `~/.agents/skills/emet/` que siguen coincidiendo con este emet (las editadas se conservan y se listan), el directorio de versiones `~/.local/share/emet/versions` y el estado de instalación `~/.local/share/emet/install.json`.
- Los extras del Setup ledger (véase [Registro de setup y restauración](#registro-de-setup-y-restauración)).

Cuando una copia de seguridad de la instalación (`.pre-emet-guard-backup.`) contiene exactamente lo que queda, se restauran sus bytes; cuando no queda nada, se elimina el archivo; en caso contrario, antes se escribe una copia de seguridad con marca de tiempo.

Sin manifiesto ni estado de instalación (instalación como plugin) omite los archivos e imprime `claude plugin uninstall emet@emet-marketplace`; si `codex` está en el PATH, imprime además cómo quitar el plugin de Codex. Termina con 1 cuando algún paso falló o un archivo que debe leer (manifiesto, settings, registro) no se puede leer, y nombra su ruta.

### `emet whats-new`

Imprime un aviso único tras las actualizaciones de emet.

- `--hook`: la forma que ejecuta el hook `SessionStart`.

### `emet fleet`

Trabaja sobre los repositorios git con un `emet.config.json` un nivel por debajo de `--root` (por defecto `~/code`). Consulta la [guía de fleet](../how-to/check-a-fleet.md).

- `emet fleet list [--root <dir>] [--json]`: lista los repositorios con `tracker.kind`, `handoff.autoChain` y `models.worker`.
- `emet fleet set <key> <value> [--root <dir>] [--dry-run]`: cambia una clave de configuración en cada repositorio listado, validando antes con el cargador de configuración (un valor no válido no cambia nada y sale con 1).
- `emet fleet launch --feature <text> [--root <dir>] [--repos <a,b>] [--dry-run]`: abre una sesión `/emet:run --draft <text>` en cada repositorio tras las comprobaciones de preparación de `emet chain`. `--dry-run` imprime los lanzamientos planificados sin iniciar ninguna sesión.
- `emet fleet status [--json]`: lee el journal global e imprime, por repositorio, el último estado de cada sesión en las últimas 24 horas (sin las `ended`).

`fleet status` imprime una línea `<repo>: <b> blocked, <w> working, <i> idle` por repositorio, con los repositorios bloqueados primero. `--json` imprime `{repos: [{repo, sessions: [{sessionId, state, blocked, since, runId}]}], blocked: <count>}`. Termina con 0 también cuando no hay sesiones.

### `emet preflight`

Confirma que el repositorio está listo para despachar.

- `--run <id>`
- `--post-dispatch`

### `emet skill-path`

`emet skill-path <name>` imprime la ruta absoluta del `SKILL.md` de una skill de mattpocock-skills. Termina con código 1 si no se encuentra la skill.

### `emet selftest`

Ejecuta las pruebas unitarias propias de la CLI. Solo en instalaciones desde el código fuente; un binario compilado termina con código 1 y te indica que ejecutes `emet doctor`.

## Ejecuciones, workers y slots

### `emet claims`

Reserva un ticket para una ejecución: `emet claims --reserve <ticket> --run <id> --anchor <pid>`.

- `--release <ticket>`: libera una reclamación.
- `--list`: lista las reclamaciones.
- `--prune [--dry-run]`: purga las reclamaciones obsoletas.

### `emet slots`

Toma un slot de worker del pool de todo el host en `~/.local/state/emet/slots`: `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`.

- `--release --run <id>`: libera los slots de la ejecución.
- `--release-index <index>`: libera un slot.
- `--list`: lista los slots.

### `emet cleanup`

`emet cleanup [--run <id> | --all] [--dry-run] [--force]`. Sin argumentos, recupera las ejecuciones cerradas o muertas cuyo trabajo ya aterrizó. Tras un merge, `emet cleanup --run <runId>` libera las ramas, las reclamaciones de tickets y los slots de workers de la oleada.

- `--run <id>`: limpia esta ejecución.
- `--all`: un barrido de ramas de todo el repositorio.
- `--dry-run`
- `--force`

En todos los modos también elimina cada rama local cuyo PR se fusionó en el commit de la punta de la rama, junto con el worktree de agente limpio y sin bloqueo que la contiene.

### `emet lock-reason`

`emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]` imprime el motivo de `git worktree lock` que un worker escribe al arrancar.

### `emet launch`

`emet launch <spec-id> --wave <n>`: en Claude Code, inicia una oleada como una sesión `claude --bg` y abre su pestaña de Orca según `handoff.launcher` (en Codex consulta [Host de Codex](#host-de-codex)). Hace todo el lanzamiento (comprobación de sesión duplicada, `claude --bg`, pestaña) e imprime `{ name, id, attach, orcaTab: { opened, reason } }`. Úsalo, y no un `claude --bg` a secas, siempre que quieras una oleada en otra sesión a mano.

### `emet chain`

`emet chain --ticket <id> --spec <id> --wave <n> [gate flags]` ejecuta `emet gate` con las banderas de compuerta que recibe e inicia la siguiente oleada solo cuando la decisión es `chain`.

Antes de lanzar comprueba la preparación (margen de memoria del host, disco e inodos libres en el repositorio y en `/tmp`, la CLI `orca`) y después confirma que la sesión hija aparece en la lista. Cualquier otra decisión, un problema de preparación bloqueante (`low-memory`, `low-disk`, `low-inodes`, `orca-unavailable`) o una sesión ya existente para el mismo spec y oleada termina con 1 con los motivos y no lanza nada.

### `emet status`

`emet status [--spec <id>] [--brief]` imprime Working / Checking / Ready / Needs-decision por oleada como JSON más una línea de resumen. `emet status --help` documenta el JSON.

- `--spec <id>`
- `--brief`: imprime en su lugar como máximo tres líneas: el estado general, lo que espera a una persona (si hay algo) y la siguiente acción.

El JSON incluye además `sessions: [{sessionId, state, blocked, since, runId}]`: el último estado de atención de cada sesión de este repositorio propiedad de emet en las últimas 24 horas, sin las sesiones `ended`. `blocked` es verdadero cuando `state` es `needs-decision`, y `since` es la hora de ese estado. Cualquier sesión bloqueada hace que el `state` general sea `needs-decision`, también cuando no hay ninguna oleada activa; la línea de resumen indica cuántas sesiones están bloqueadas y `--brief` las lista en la línea de lo que espera a una persona.

### `emet run`

`emet run current [--json]` imprime la ejecución activa del repositorio (id de la ejecución, spec, oleada, fase y última actualización), leída de `.emet/phase.json`. Sin ejecución activa imprime `no active run` y termina con 0.

### `emet memory`

Busca y guarda lecciones en [Engram](https://github.com/Gentleman-Programming/engram).

- `emet memory search --json <query> [--limit <n>]`: busca lecciones de ejecuciones anteriores. Busca con `match_mode: "any"` (`--limit` es 5 por defecto, máximo 20), conserva solo las notas cuya clave de tema empieza por `emet/<repo>/lessons/` e imprime `{available: true, results: [{id, topicKey, title, content}]}` con `content` truncado a 2000 caracteres. `<repo>` es el último segmento de la ruta de `git remote get-url <repo.remote>` sin `.git`, o si no, el nombre base del worktree principal.
- `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <landed|chained|hold|stop|blocked>`: lee de stdin de 1 a 5 viñetas de lecciones (líneas `- ` de como máximo 300 caracteres cada una) y las añade como una sección `## <runId> — <outcome> (<date>)` a la nota con la clave de tema `emet/<repo>/lessons/<key>`, o inicia esa nota. Una nota de más de 20000 caracteres descarta sus secciones más antiguas. Imprime `{available: true, saved: true, topicKey}`.

Ambos subcomandos hablan con Engram lanzando `engram mcp --tools=agent` en la raíz del repositorio; el plugin de Engram no es necesario. Nunca pasan un `project` a Engram.

Códigos de salida: `2` para un uso incorrecto (sin subcomando, una consulta ausente, sin viñetas, más de 5 viñetas, una viñeta de más de 300 caracteres, un resultado desconocido, una clave incorrecta). Todo problema de Engram (no está en el PATH, un handshake fallido, un error de la herramienta, un tiempo de espera agotado, JSON mal formado) termina con `0`.

- Antes de un handshake correcto, la salida es `{available: false, reason}`.
- Después, la salida es `{available: true, results: [], reason}` para `search` o `{available: true, saved: false, reason}` para `save`.
- `memory.enabled: "off"` imprime `{available: false, reason: "memory.enabled is off"}` y no lanza nada. Consulta [`memory`](configuration.md#memory).

### `emet insights`

Lee el [journal de eventos](../concepts/attention-and-journal.md) e informa las ejecuciones por origen (humano o auto), las decisiones de compuerta por decisión y motivo, las intervenciones humanas por ejecución, los resultados de los lanzamientos y los tickets cerrados. Las líneas ilegibles se omiten y se cuentan. Un journal vacío o ausente imprime un informe en cero y termina con 0.

- `--since <iso|7d|30d>`
- `--repo <path>`
- `--all`
- `--json`
- `--mark-baseline`: añade una línea base; los informes posteriores cubren solo los eventos posteriores a ella, salvo que se pase `--all`.

### `emet usage`

Informa el uso de las sesiones.

- `--session <id>` o `--file <path>`
- `--stalled [--minutes N]`: lista los workers detenidos.
- `--project-dir <path>`

### `emet handoff`

`emet handoff --check <path> [--expect-skills a,b] | --render <path>` valida o renderiza la nota `.emet/handoff-<ticket>.md` de un worker.

- `--check <path>`: valida la nota. Una comprobación correcta imprime `missing skills: …` cuando la lista `missing` no está vacía.
- `--expect-skills a,b` (solo con check): hace fallar la comprobación por cada skill nombrada que no esté ni en la lista `loaded` ni en la `missing`.
- `--render <path>`: renderiza la nota.

La nota puede llevar una sección `skills:`, escrita `skills: none` o `skills: loaded: a, b; missing: c`. Solo es obligatoria cuando `state` es `done`, y cualquier otro valor hace fallar la comprobación.

### `emet metrics`

`emet metrics [--run <id>]` informa tokens, costo equivalente en API y tiempo de reloj por ticket, por oleada y por ejecución, leídos de las transcripciones de sesión. También compara el presupuesto de contexto estimado por ticket con lo que cada worker usó realmente. Su resumen va al final del informe final de la ejecución.

### `emet ask`

El buzón del worker: pregunta al coordinador, o espera la respuesta.

- `--run <id>`
- `--ticket <ticket>`
- `--body <text>`: envía la pregunta.
- `--wait <n>`: espera la respuesta.
- `--slice <seconds>`

Con `--wait`, la salida `0` es una respuesta, `3` un tiempo de espera de la porción y `4` expirada.

### `emet inbox`

`emet inbox --run <id>` lista como JSON las preguntas abiertas de los workers.

### `emet reply`

`emet reply --run <id> --ticket <ticket> --id <n> --body <text>` responde a una pregunta de un worker.

## Planificación, revisión y aterrizaje

### `emet promote`

`emet promote --spec <id> [--dry-run] [--no-promote] [--hold]` es el paso after-spec, según [`handoff.afterSpec`](configuration.md#handoff).

- `--dry-run`: no abre ningún pull request.
- `--no-promote`: omite el paso.
- `--hold`: escribe el marcador `<run dir>/runs/<id>/no-promote` e imprime `{"held":true}`. Mientras exista, `emet promote --spec <id>` termina con 0 con una nota `skipped` y no abre ningún pull request, de modo que `--no-promote` sobrevive entre las sesiones de un spec.

En modo `promote` abre un pull request de `develop` a `main` titulado `chore: 🔖 promote develop`, espera con `emet ci --pr <n> --wait` y lo fusiona con un merge commit solo cuando el estado es `pass`. Luego, solo si `main` contiene contenido que `develop` no tiene (la comparación `develop...main` lista al menos un archivo modificado; los merge commits por sí solos no cuentan), abre un pull request de sincronización de `main` a `develop`, espera sus checks de la misma manera y lo fusiona con [`pr.mergeMethod`](configuration.md#pr) solo cuando el estado es `pass`. Cuando `main` solo contiene merge commits, no se abre ningún pull request de sincronización y `syncReason` explica el motivo. Un pull request de sincronización cuyo estado es `fail`, `timeout` o `env-fault`, o cuyo merge es rechazado, queda abierto y nunca cambia el resultado de promote.

Añade al journal un evento `promote` con el número del pull request, `merged`, `syncPrNumber`, `syncMerged`, `syncReason`, `rule` y `reason`. `afterSpec` puede ser una lista de reglas; entonces el modo se elige según las rutas que promover `develop` arrastraría (consulta [`handoff.afterSpec`](configuration.md#handoff)), y un `git fetch` o `git diff` que falle hace que el comando termine con 1 antes de abrir cualquier pull request.

El resultado impreso incluye:

- `rule`: el índice de la regla que coincidió, o `null` para la forma de cadena o si ninguna coincide.
- `reason`.
- `syncPrNumber`: `null` cuando no se abrió ningún pull request de sincronización.
- `syncMerged` y `syncReason`: una frase que dice por qué un pull request de sincronización se dejó abierto, o `null`.
- `deployCheck: { run, reason }`: indica si el coordinador debe ejecutar `emet deploy-check`.

En modo `release` no fusiona nada y deja el pull request de la versión a una persona. Con `afterSpec` en `none`, con `--no-promote`, con un spec retenido, o cuando la última oleada del spec se dejó abierta o marcada, termina con 0 con una nota `skipped`. Aun así se ejecuta tras una oleada final limpia para que el resultado incluya la decisión de `deployCheck` (en la rama troncal `main` el deploy check se ejecuta sea cual sea el modo). Un CI que no es `pass` no fusiona nada y termina con 1.

### `emet deploy-check`

Ejecuta `deploy.check.command` hasta que termine con 0, hasta `retries` intentos o `timeoutSeconds`, esperando `intervalSeconds` entre ellos, e imprime `state: ok | failed | timeout` con `attempts`.

- `--json`

Salida `0` ok, `1` failed, `3` timeout. Sin `deploy.check` configurado termina con 0 con `skipped: "no deploy check configured"`. El coordinador lo ejecuta solo cuando el resultado de `emet promote` tiene `deployCheck.run` en true. Consulta [`deploy`](configuration.md#deploy).

### `emet surfaces`

`emet surfaces --check <file.json | ->` rechaza los globs de superficies permitidas que se solapan entre los tickets de una oleada.

### `emet assess`

`emet assess --base <ref> --head <ref>` clasifica un diff como `passive`, `medium` o `high` e imprime JSON con el nivel, los motivos y el modelo y esfuerzo recomendados para el revisor. Consulta [Models & effort](../../README.md#models--effort) y [`review`](configuration.md#review).

- `--quick`: el JSON incluye además `"quickRejected": true|false` y el comando sale con código 1 cuando el nivel es `high` (un **Stop** para una **Quick run**: sin auto-merge, el PR queda abierto) y con 0 en caso contrario. Sin `--quick` la salida y los códigos de salida no cambian.

El JSON incluye además dos decisiones:

- `browserVerify: { run, reason }`: `run` es `true` solo cuando el nivel tiene revisor, [`verify.browser`](configuration.md#verify) está configurado, el binario `agent-browser` está en el PATH y, si `paths` está definido, coincide una ruta modificada. En caso contrario, `reason` nombra la primera condición que falló.
- `dualReview: { run, reason }`: `run` es `true` solo cuando el nivel es `high`, `agentHost` es `claude`, [`review.dual`](configuration.md#review) no es `off` y el binario `codex` está en el PATH. En caso contrario, `reason` nombra la primera condición que falló.

### `emet land`

`emet land --spec <s> --branch <integration> --tickets <id,...>` fusiona una rama de integración en la rama troncal local (`landing.mode` `merge`). `commands.selfCheck` sustituye al CI y no se publica nada.

### `emet spec-branch`

`emet spec-branch ensure|integrate|status|sync|land|abandon --spec <id>` gestiona la rama del spec `spec/<id>` de `landing.unit: spec` (consulta [`landing`](configuration.md#landing)). Todos imprimen JSON.

- `ensure`: crea la rama desde la troncal (idempotente), escribe `.emet/specs/<id>/branch.json` y se niega cuando está activa la rama de otro spec.
- `integrate --wave <n> --branch <integration> --tickets a,b`: fusiona la rama de la oleada en `spec/<id>` con `--no-ff` y los trailers `Emet-Wave` y `Emet-Tickets`, registra la oleada, añade `spec.integrate` y, cuando `landing.pushSpecBranch` es true, publica la rama sin abrir un PR.
- `status`: imprime `branch`, `tip`, las oleadas y los tickets integrados y `behindTrunk`, y reconstruye `branch.json` a partir de los trailers cuando falta una oleada.
- `sync`: fusiona la troncal en la rama, nunca hace rebase, y ante un conflicto aborta, lista las rutas y termina con un código distinto de cero.
- `land [--partial]`: sincroniza y luego, en modo `pr`, publica la rama, abre un PR con una línea `Closes` por ticket, espera sus checks y lo fusiona con `landing.specMergeMethod` (un merge commit por defecto, ignorando `pr.mergeMethod`). En modo `merge` fusiona en la troncal local con `--no-ff` y nunca publica. Añade `spec.land`.
- `abandon --force`: etiqueta `abandoned/spec-<id>`, borra la rama, añade `spec.abandon` y devuelve a `ready-for-agent` los tickets integrados de un tracker local; sin `--force` se niega.

`emet tracker frontier` cuenta los tickets listados en `branch.json` como bloqueadores cerrados, y `emet status` gana `specBranch` (`branch`, `tip`, `integratedWaves`).

### `emet spec-merge`

`emet spec-merge --spec <id>` fusiona los deltas de requisitos `ADDED`/`MODIFIED`/`REMOVED` del spec en `docs/specs/<area>.md` (`specs.dir`).

- `--deltas-dir`: imprime el directorio donde van los deltas.

Con `specs.enabled` activado, el coordinador escribe los deltas y lo ejecuta una vez por spec, en la rama de integración de la última oleada antes de su revisión, y luego confirma el resultado. Comprueba todas las áreas antes de escribir nada. Un conflicto, o un requisito que perdería un escenario, termina con 1 y deja todos los archivos intactos. Con `specs.enabled` desactivado no fusiona nada y termina con 0.

### `emet map`

`emet map [--refresh]` escribe un resumen de un código existente (stack, estructura, convenciones, pruebas, puntos calientes) en `docs/agents/codebase.md` (`map.path`), sellado con el SHA del commit a partir del cual se construyó. El mismo commit siempre produce el mismo archivo.

- `--refresh`
- `--stale`: termina con 1 una vez que HEAD avanzó más allá del sello, y `emet preflight` avisa en ese caso.
- `--for <globs>`: imprime solo las secciones que coinciden con las superficies de edición de un ticket; esa salida es la única parte del mapa que incluye el brief de un worker.

### `emet guard`

El hook `PreToolUse` de Claude Code; lee el JSON del hook por stdin (la forma de Codex está en [Host de Codex](#host-de-codex)). `emet self install` lo conecta en `~/.claude/settings.json`. Bloquea un puñado de desencadenantes conocidos de fallos en ejecuciones sin supervisión (consulta `emet/src/guard.ts`).

## Tracker local

Con `tracker.kind: "local"`, los specs y los tickets son archivos markdown bajo `.scratch/` del worktree principal (sin versionar): `.scratch/<slug>/spec.md` y `.scratch/<slug>/issues/<NN>-<slug>.md`, cada uno con líneas `Status:` y `Blocked by:` y comentarios bajo `## Comments`. `emet init --tracker local` lo configura. Consulta [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

`landing.mode` es `"pr"` (por defecto) o `"merge"`, independiente del tracker. En modo `merge` una oleada aterriza como un merge local en la troncal con `emet land`, con `commands.selfCheck` sustituyendo al CI y sin publicar. Con `landing.unit: "spec"` (por defecto) el spec completo aterriza una vez mediante `emet spec-branch land`. `gh` solo es obligatorio cuando el tracker es `github` o el aterrizaje es `pr`. Consulta [ADR-0010](../adr/0010-local-merge-landing.md) y [`landing`](configuration.md#landing).

### `emet tracker`

`emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close` es el tracker local sobre `.scratch/`, con JSON por stdout. El coordinador lee y escribe specs y tickets a través de él.

#### `emet tracker close`

Con `tracker.kind: "github"`, `emet tracker close <ticket>... [--pr <n>]` cierra cada ticket (`CLA-<n>`, `#<n>` o un número a secas) con `gh issue close --reason completed`, verifica su estado e informa `closed` o `already-closed`.

- `--pr <n>`: añade el comentario "Landed in #<n>".

Para cada padre distinto de un ticket `closed` o `already-closed`, lee después `gh issue view <spec> --json state,subIssuesSummary`. Cuando el spec está abierto y `subIssuesSummary.completed` es igual a un `total` distinto de cero, cierra el spec con `gh issue close --reason completed` y el comentario "All <total> tickets landed.", y luego lo verifica.

La salida gana `specs`, un `{ spec, outcome, detail? }` por cada padre distinto con resultado `closed`, `open`, `already-closed` o `failed`. Un ticket sin padre no añade ninguno, y una lectura o un cierre fallido de un spec nunca cambia el resultado de un ticket. Termina con `1` si algún ticket o spec falló, tras procesar el resto. Los tickets de Linear los confirma como Done el coordinador mediante el MCP de Linear.

## PR de aterrizaje y encadenamiento de oleadas

Con `landing.unit: "wave"`, una oleada es un PR; con `"spec"`, un PR cubre todas las oleadas integradas. Su cuerpo lleva una línea `Closes #N` por ticket (la palabra clave de cierre del tracker), y el coordinador mueve los tickets a in-review cuando abre el PR. Después el PR se fusiona según `pr.autoMerge`, o se deja abierto cuando la oleada fue marcada, `autoMerge` es `false` o se agotaron las correcciones de CI (entonces el PR recibe la etiqueta de decisión humana). Las oleadas posteriores se ejecutan en sus propias sesiones, nunca en la que ejecutó la oleada 1. Las secciones `pr` y `handoff` controlan lo que ocurre después; consulta [`pr`](configuration.md#pr) y [`handoff`](configuration.md#handoff).

### `emet ci`

`emet ci --pr <n> --wait [--rerun-flakes] [--timeout-minutes <m>]` sondea los checks del PR hasta que terminan o pasa el tiempo límite (30 por defecto). Imprime `state: pass | fail | env-fault | timeout`, los checks fallidos y `flakeReruns`, y nunca fusiona.

- `--rerun-flakes`: vuelve a ejecutar una vez cada check fallido mediante `gh run rerun --failed`; un check que pasa en la repetición es un Flake.
- `--timeout-minutes <m>`

Un PR sin checks es `pass` con `noChecks: true`. Salida `0` pass, `1` fail o env-fault, `3` timeout. `env-fault` significa checks que terminaron en `STARTUP_FAILURE` o que permanecieron en cola demasiado tiempo: un CI que nunca se ejecutó, no un fallo del código.

## Host de Codex

Estos comandos sirven al Agent host de Codex (`agentHost` `"codex"`); consulta la [guía de Codex](../how-to/use-codex.md).

### `emet dispatch`

`emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: tras comprobar la reclamación y el slot, crea `.emet/worktrees/agent-<ticket>`, construye una capa de `CODEX_HOME` por ejecución e inicia el worker como un `codex exec` desacoplado.

- `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]`: se bloquea hasta que termina e imprime el estado de resultado registrado.

### `emet review-run`

`emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive> [--browser-verify true|false]` ejecuta el revisor como un `codex exec` de solo lectura sobre un paquete de `emet review-package` e imprime el JSON de hallazgos para `emet review --findings`. El nivel `passive` no inicia ningún proceso.

- `--browser-verify true|false`: por defecto `false`. Con `true` el prompt termina con el eje Browser, con `--session review-<run>` completado a partir de `--run`, de modo que el revisor de Codex verifica la UI como lo hace el revisor de Claude (pásalo cuando `emet assess` imprimió `browserVerify.run: true`; consulta [`verify`](configuration.md#verify)). Sin la bandera el prompt no cambia, y un valor distinto de `true` o `false` termina con 2 con la línea de uso.
- `--coverage-out <file>`: escribe además los veredictos de Coverage del revisor de Codex en `<file>` como un arreglo JSON (stdout sigue imprimiendo solo los hallazgos); úsalo en el host de Codex, donde se ejecuta un solo revisor.

Los hallazgos pueden llevar los campos opcionales `s` y `userOption` descritos en `emet review`.

### `emet launch` en Codex

`emet launch <spec-id> --wave <n>` inicia un `codex exec` desacoplado que ejecuta `$emet:run --dispatch <spec>` y registra su id de hilo. No se abre ninguna pestaña de Orca, y `codex exec resume <id>` continúa la sesión.

### `emet guard` en Codex

Con `EMET_AGENT_HOST=codex`, `emet guard` lee la entrada de hook de Codex, comprueba las rutas de `apply_patch` contra `.emet/surface.json` y mantiene cerrada la compuerta de aprobación hasta una línea de prompt `approve <id>`.

## Compuertas y registros

Las fases no deciden por sí solas cuándo un ticket está terminado, es fusionable o vale la pena reintentarlo. Llaman a un comando de la CLI que lee un registro en disco e imprime la decisión. Los registros de ejecución viven bajo `.emet/runs/<run-id>/` y el ledger de revisión bajo `.emet/review/`, en el checkout principal, no en el worktree de un worker. Los comandos siguientes se listan en el orden del pipeline.

### `emet validate`

Antes de la aprobación: `emet validate --spec <id> | --file <plan.json>` ejecuta la validación del plan.

- Cada `S#` está cubierto por al menos un ticket y tiene un escenario de aceptación.
- Cada ticket cubre al menos un `S#`.
- Las superficies de edición son disjuntas dentro de una oleada.
- No hay ciclos de dependencias.
- Con [`validate.coupledSurfaces`](configuration.md#validate), un error `coupled-surface-split` cuando un ticket que toca el `source` de un par está en una oleada anterior a la de un ticket que toca sus `dependents` (salida 1).
- Una lista de tickets vacía es un error `no-tickets` (salida 1, "plan has no tickets; write one folded ticket"), con o sin elementos `S#`. Un plan con un ticket marcado `folded: true` que cubre todos los `S#` pasa.

`emet preflight` lo ejecuta de nuevo sobre el plan aprobado.

### `emet approve`

Aprobación: `emet approve --run <id> --spec <file>` escribe `approval.json` con los hashes del spec y de la lista de tickets. El despacho se niega si alguno cambió después (`--check`).

- `--quick`: escribe además `"mode": "quick"`, lo que hace que la unidad de aterrizaje sea `wave` para esa ejecución. Sin él el campo está ausente y los registros más antiguos siguen pasando `--check`.

### `emet materialize-log`

Creación de tickets: `emet materialize-log --run <id> --record/--lookup` guarda el ID de cada ticket creado en cuanto existe, de modo que una ejecución interrumpida nunca crea duplicados.

### `emet results`

Worker terminado: `emet results --run <id> --write/--read <ticket>`. Los workers escriben un archivo de resultado local (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` o `NEEDS_CONTEXT`, más una línea `Risk:`). Solo el coordinador escribe en el tracker.

### `emet verify`

Tras cada worker: `emet verify <ticket> --run <id>` comprueba que existen commits más allá de la base del despacho, que cada ruta modificada está dentro de las superficies de edición del ticket, que la nota de handoff pasa `handoff --check` y que `commands.workerScopedSuite` pasa. La revisión y el merge se niegan a procesar un ticket sin un registro de aprobación.

### `emet review-package`

Entrada de la revisión: `emet review-package <base> <head> --out <file>` empaqueta el diff para el revisor, que lo recibe como una ruta de archivo. Termina con 3 si el rango está vacío o no es descendiente de base.

### `emet review`

Revisión: `emet review --ticket <t> --findings <file>` mantiene el ledger de hallazgos y hace cumplir el orden de triaje (`intent_gap` → `bad_plan` → `patch` → `defer`) y el tope de rondas.

- `--base <ref>`: resuelve `<ref>` a un sha en la primera ronda y lo guarda; las rondas posteriores lo reutilizan, y un sha distinto termina con 2 nombrando el guardado. Un hallazgo en una línea que el diff `<base>..HEAD` no añadió ni cambió se guarda con `preexisting: true`, y `emet gate` no lo cuenta como bloqueante.
- `--findings <file>`: los hallazgos aceptan los campos opcionales `s: "S<n>"` (el requisito en cuestión), `userOption: "S<n>"` y `agreement: "both"` o `"single"`. Un hallazgo `userOption` contradice un requisito `(user option)`: siempre es bloqueante, incluso cuando es preexistente, y con `gate.onHold: fix-and-continue` retiene con `next: fix-findings`. Un `userOption` que no sea una cadena termina con 2.
- `--coverage <file or -> [--expect S1,S3]`: guarda un arreglo JSON de veredictos de Coverage `{s, verdict, test:{file,name}}` (`verdict`: `met`, `partial`, `unmet`) como el `coverage` del ledger, reemplazando el anterior, y no consume ninguna ronda de revisión. Abre un hallazgo `VG-S<n>` (major, `patch`) por cada `met` cuyo `test` falte, cuyo archivo no exista o no contenga `test.name`, y por cada S# de `--expect` sin veredicto. Un hallazgo `VG-` solo se cierra cuando un `--coverage` posterior ya no lo produce o un veredicto de recheck lo resuelve, nunca por estar ausente de una ronda de `--findings`. Imprime `{coverage, open}` y termina con 1 mientras haya algún hallazgo abierto; no ejecuta pruebas.
- `--merge <a.json> <b.json>` (sin `--ticket`): imprime un único arreglo de hallazgos fusionado para `--findings -`. Dos hallazgos forman pareja cuando comparten `s` o comparten `file` con líneas a lo sumo a 3 de distancia, y una pareja conserva el `id` del primer archivo, la mayor severidad y `agreement: "both"`. Un hallazgo sin pareja recibe `agreement: "single"`, con un id en colisión del segundo archivo con el prefijo `X-`; un hallazgo `userOption` nunca se descarta.
- `--recheck --verdicts <file>`: termina una ronda de correcciones. Solo se evalúan los hallazgos abiertos cuando empezó, un hallazgo pasa a `resolved` únicamente mediante un veredicto, y el recheck cuenta contra `budgets.fixRounds` (termina con 1 nombrando el tope cuando se agota).
- `--escalate`: pasa al siguiente nivel de modelo.
- `--rule` y `--rulings`: registran y listan los "Rulings I made" para el informe y el cuerpo del PR.

### `emet gate`

Merge o encadenamiento: `emet gate <ticket> --tier … --ci … --integration …` imprime `merge`, `hold`, `chain`, `stop` o `defer` como JSON con sus motivos. Lee el registro de verify, los hallazgos abiertos, el nivel de riesgo, el CI, la suite de integración y los presupuestos. Un `hold` lleva `next`: `fix-findings`, `rerun-failed-specs`, `rerun-ci` o `report-infrastructure`. Consulta [`gate`](configuration.md#gate).

- `--no-record`: mantiene la decisión fuera del journal.

Después de fusionar las ramas de una oleada, `commands.fullSuite` se ejecuta una vez en la rama de integración. Una ejecución en rojo bloquea el PR y `autoChain`. La compuerta recibe el resultado como `--integration`. Para los presupuestos que lee la compuerta, consulta [`budgets`](configuration.md#budgets).

## Códigos de salida

Los códigos de salida tienen significado en todos los subcomandos.

| Código | Significado                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------- |
| `0`    | Limpio.                                                                                                   |
| `1`    | Hallazgos que atender.                                                                                    |
| `2`    | Error de configuración o de uso; la herramienta nunca llegó a ejecutarse. También un comando desconocido. |
| `3`    | Error interno.                                                                                            |

Una bandera desconocida también termina con `2` y nombra la bandera. Ctrl-C termina con `130`.

## Banderas globales

Todos los comandos las aceptan; las banderas propias de cada comando se listan con `emet <command> --help`.

| Bandera      | Efecto                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `--json`     | Imprime un único sobre `{ok, data, error: {code, message, fix}}` por stdout, también para `--help` y `--version`.  |
| `--no-color` | Desactiva el color ANSI. El color también respeta `NO_COLOR`, `FORCE_COLOR`, `TERM=dumb` y si la salida es un TTY. |
| `--verbose`  | Imprime la traza de un error inesperado. Sin ella, el catch de nivel superior imprime un error de una línea.       |
| `--help`     | Imprime el uso del comando.                                                                                        |

`emet --version` imprime la versión; `emet --version --json` imprime `{"ok": true, "data": {"version": ...}, "error": null}`. Con `--json`, un comando que falla termina con su código habitual e imprime `ok: false` con un `code` de error de `findings`, `usage`, `internal`, `slice-timeout`, `expired`, `bad-range` o `exit-<n>`; lo que el comando haya impreso por stdout es el `data` del sobre.

En un TTY, `emet` imprime por stderr un aviso de una línea cuando se conoce una versión más nueva. Lo comprueba como máximo una vez al día, guarda la respuesta en caché, nunca espera a la red y permanece en silencio con `--json` o sin TTY.

## Variables de entorno

Variables orientadas al usuario. Una variable anula el valor de configuración correspondiente cuando está definida.

| Variable                      | Efecto                                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` degrada un bloqueo de dependencias a una advertencia solo en esa ejecución. Defínela en tu propia shell, no en nada que el coordinador ejecute sin supervisión. |
| `EMET_MAX_LIVE_WORKERS`       | Anula [`concurrency.maxLiveWorkers`](configuration.md#concurrency); acepta un entero positivo o `auto`.                                                                                                        |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | Anula [`concurrency.runIdleThresholdMs`](configuration.md#concurrency), en milisegundos.                                                                                                                       |
| `EMET_STATE_DIR`              | Directorio de estado de todo el host, que contiene el pool de slots de workers. Orden de resolución: `$EMET_STATE_DIR`, luego `$XDG_STATE_HOME/emet`, luego `~/.local/state/emet`.                             |
| `EMET_MEM_RESERVE_GIB`        | Margen de memoria en GiB que debe seguir libre; se deniega una adquisición cuando la memoria disponible es menor. Por defecto 8. También alimenta el tope `auto` de workers.                                   |
| `EMET_MEM_PER_WORKER_GIB`     | Memoria en GiB que se asume por worker cuando `maxLiveWorkers` es `auto`. Por defecto 2. Auméntala para un stack más pesado por worker, como una suite E2E guiada por navegador por worktree.                  |
| `EMET_CPU_OVERSUBSCRIBE`      | Multiplicador de CPU para el tope `auto` de workers. Por defecto 1.                                                                                                                                            |
| `EMET_AUTO_UPDATE`            | `EMET_AUTO_UPDATE=0` desactiva `emet self update --auto`: termina con 0 sin una llamada de red. Igual que `emet self update --auto off`.                                                                       |
| `EMET_AGENT_HOST`             | `codex` hace que `emet guard` lea la entrada de hook de Codex. Lo definen los hooks de Codex; déjala sin definir en Claude Code.                                                                               |

El tope `auto` es `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`. Los nombres heredados `FORGE_*` se siguen leyendo; `EMET_*` gana cuando ambos están definidos.
