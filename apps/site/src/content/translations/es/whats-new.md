---
title: Novedades
description: Notas de versión de emet: qué cambió en cada versión.
seoTitle: Novedades de emet: notas de versión
sourceHash: 52353f60ae0e5795
---

## 0.21.0

2026-11-23

### Añadido

- `emet setup --dry-run` (combinable con `--with`, `--yes` y `--json`) imprime los pasos planificados de cada elemento elegido, o `already-present`, y no cambia nada: no ejecuta ningún comando ni escribe ningún archivo ni entrada del registro.
- `emet setup` anota en el registro de setup, `setup-ledger.json` en el directorio de estado, cada elemento que termina `installed`, con los registros de deshacer necesarios para revertirlo. Las escrituras del registro son atómicas, y un registro mal formado es un error que nombra su ruta.
- `emet setup --restore <id>` revierte `claude-settings` (el `model` anterior y las reglas deny que añadió emet, tras una copia de seguridad con marca de tiempo) o `firecrawl-local` (la entrada MCP anterior de ámbito de usuario). Cualquier otro id sale con 2, y un id sin entrada en el registro sale con 1.
- `emet uninstall [--dry-run] [--yes] [--purge] [--json]` elimina una instalación de `install.sh`: los archivos del manifiesto cuyo hash sigue coincidiendo, el shim, cada hook `emet guard` en `~/.claude/settings.json` (tras una copia de seguridad con marca de tiempo) y los extras del registro de setup. Los archivos editados se conservan y se listan. Para las instalaciones globales de brew, bun y cargo imprime el comando de eliminación y nunca lo ejecuta.
- `./install.sh --uninstall [flags]` ejecuta `emet uninstall`.
- `docs/reference/cli.md` y `README.md` documentan el registro de setup, `--dry-run`, `--restore` y `emet uninstall`, en los nueve idiomas.

## 0.20.0

2026-11-22

### Añadido

- `emet guard` registra un evento de journal `session.attention`, `{sessionId, state, from, trigger}`, cuando una sesión gestionada por emet cambia de estado entre `working`, `idle`, `needs-decision` y `ended`. Solo se agrega un evento cuando el estado difiere del último registrado de la sesión. El journal nunca guarda texto de notificaciones, prompts ni entradas de herramientas, y el registro nunca cambia el veredicto, el stdout ni el código de salida de guard.
- `hooks/hooks.json` e `install.sh` conectan los eventos de hook `Notification`, `PermissionRequest`, `SessionEnd` y `UserPromptSubmit` a `emet guard --event <Event>`. `install.sh` sigue siendo idempotente. `codex/hooks.json` no cambia.
- El JSON de `emet status` incorpora `sessions: [{sessionId, state, blocked, since, runId}]`, el último estado de cada sesión del repo en las últimas 24 horas, excluyendo `ended`. Una sesión bloqueada hace que el estado general sea `needs-decision` y se nombra en la línea de resumen y en `--brief`.
- `emet fleet status [--json]` imprime los últimos estados de sesión por repo desde el journal global, con los repos bloqueados primero.
- En una transición a `needs-decision`, emet emite una alerta: una marca de no leído y un comentario en el worktree de Orca del repo cuando Orca está disponible; si no, `notify-send` cuando está en el PATH. `attention.alert` (booleano, por defecto `true`) se añade a los esquemas de configuración y la desactiva.
- `docs/reference/cli.md`, `docs/reference/configuration.md` y `docs/guide/fleet.md` documentan las funciones de atención de sesiones, en los nueve idiomas.

## 0.19.0

2026-11-22

### Añadido

- `emet memory search --json <query> [--limit <n>]` y `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <outcome>` leen y escriben Lessons en Engram. `search` conserva las notas cuya topic key empieza por `emet/<repo>/lessons/` e imprime su contenido completo; `save` añade una sección por run a la nota de la spec o del quick run, de 1 a 5 viñetas por stdin. Ambos imprimen un objeto JSON, salen con 0 ante cualquier problema de Engram y con 2 solo por un uso incorrecto.
- `memory.enabled` (`auto` u `off`, por defecto `auto`) se añade a los esquemas de configuración. `off` nunca lanza `engram`.
- La Phase 1 busca en la memoria Lessons previas antes de la primera ronda de entrevista y escribe las relevantes bajo `## Prior lessons` en el archivo del plan. Los traspasos de la wave y del quick run guardan las Lessons del run antes del informe final. `--draft` no guarda nada.
- `docs/reference/cli.md` y `docs/reference/configuration.md` documentan `emet memory` y `memory.enabled`, en los nueve idiomas.

### Cambiado

- La compilación de Codex rechaza `mcp__engram` en una referencia generada, de modo que los nombres de herramientas de Engram nunca llegan al plugin de Codex.
- Los prompts de `/emet:run` incorporan los pasos de memoria anteriores; sin `engram` en el PATH, o con `memory.enabled: "off"`, cada paso es una nota de una línea y el run continúa como en 0.18.0.

## 0.18.0

2026-11-22

### Añadido

- `emet review --ticket <t> --coverage <file|-> [--expect S1,S3]` guarda Coverage verdicts en el ledger. Un veredicto `met` cuyo test falta o no se encuentra en el árbol de trabajo, y un S# esperado sin veredicto, abren cada uno un finding `VG-S<n>`.
- `emet review --base <ref>` guarda la base de la revisión en la primera ronda y marca como `preexisting` un finding en una línea que la wave no tocó. `emet gate` nunca cuenta un finding preexistente como bloqueante.
- Los findings aceptan los campos opcionales `s`, `userOption` y `agreement`. Un finding abierto con `userOption` bloquea en todos los niveles y severidades, y el gate responde `hold` con `next: "fix-findings"`. La Phase 2 escribe un S# que viene de una opción elegida por el usuario como `(user option)`.
- `emet review --merge <a.json> <b.json>` fusiona dos arrays de findings en uno. Los findings se emparejan cuando comparten `s`, o comparten `file` con líneas a lo sumo 3 de distancia, y reciben `agreement: "both"` o `"single"`.
- `emet assess` imprime `dualReview: {run, reason}`, y `review.dual` (`auto` u `off`, por defecto `auto`) se añade a los esquemas de configuración. En el host Claude con `codex` en el PATH, una wave `high` ejecuta una Dual review: `emet:emet-reviewer` y `emet review-run --tier high --coverage-out <file>` en paralelo, y luego `emet review --merge`.
- `emet review-run --coverage-out <file>` escribe los Coverage verdicts del revisor Codex, y su esquema de salida acepta `s` y `userOption` anulables.
- `docs/reference/cli.md` y `docs/reference/configuration.md` documentan los cambios de revisión, en los nueve idiomas.

### Cambiado

- El prompt del revisor y `agents/emet-reviewer.md` piden un archivo de Coverage verdicts, `.emet/coverage-<run>.json`, en lugar de una línea en prosa `S<n>: met | partial | unmet`. La Phase 8 registra los veredictos con `emet review --coverage` y lista los findings preexistentes en el informe de la wave sin corregirlos.
- Sin `--base`, `--coverage`, `--merge` ni una Dual review, cada comando se comporta como en 0.17.0.

## 0.17.0

2026-11-22

### Añadido

- `/emet:run --quick <cambio>` ejecuta una Quick run para un cambio que cabe en un ticket: una ronda de entrevista, una spec con un ticket folded, una aprobación, un worker, revisión y el Landing de esa única Wave como pull request (o como merge local), sin `emet chain`. Se detiene antes de la aprobación y recomienda `/emet:run` sin `--quick` cuando el cambio toca una pantalla o no cabe en un ticket, y se rechaza junto con `--draft` o `--dispatch`. Acepta `--no-promote`. Los pasos están en el nuevo `emet/reference/phases-quick.md`. Consulta ADR-0039.
- `emet assess --quick` imprime el JSON habitual más `"quickRejected"` y termina con código `1` cuando el nivel es `high`. Una Quick run lo trata como un Stop del Gate: sin auto-merge, el pull request queda abierto y el informe final nombra los motivos de alto riesgo. Sin `--quick`, la salida y los códigos de salida no cambian.
- `emet approve --quick` escribe `"mode": "quick"` en `approval.json`. Los registros escritos antes de este cambio siguen pasando `--check`.
- `resolveLandingUnit(config, runId, root)` devuelve `wave` para una ejecución aprobada con `--quick` y `config.landing.unit` en los demás casos. `emet landed`, `emet status` y `emet preflight` leen la unidad de landing a través de ella, así que una Quick run nunca espera una rama de spec.
- `emet validate` informa un error `no-tickets` cuando un plan no tiene tickets e indica que se escriba un ticket folded.
- `docs/reference/cli.md` y `docs/guide/trackers-and-landing.md` documentan la Quick run, en los nueve idiomas.

### Cambiado

- La frase de la vía rápida en `phases-1-5.md` ahora indica escribir un ticket marcado como `folded` para una petición por debajo del umbral, en lugar de no escribir ningún ticket.
- `emet preflight --approval <run>` resuelve la unidad de landing a partir del registro de aprobación de esa ejecución cuando falta `--run`.

## 0.16.0

2026-11-21

### Añadido

- Specs vivas, desactivadas por defecto. Con `specs.enabled: true`, en la última wave de una spec el coordinador escribe los deltas de requisitos `ADDED`/`MODIFIED`/`REMOVED` de la spec, ejecuta `emet spec-merge --spec <id>` una sola vez en la rama de integración de esa wave antes de su revisión y hace commit de `docs/specs/<area>.md` actualizado, de modo que el cambio se revisa y aterriza en el mismo pull request. Una nueva referencia, `living-specs.md`, describe el formato de los deltas y la regla de reintento. Consulta ADR-0038.
- `specs.enabled` (por defecto `false`) en la configuración y en ambas copias del esquema. `emet init` escribe `"specs": { "dir": "docs/specs", "enabled": false }`.
- `emet doctor` avisa, solo cuando `specs.enabled` es `true`, si `specs.dir` está en gitignore o es un archivo. Que falte `specs.dir` no genera aviso.
- `emet spec-merge --spec <id> --deltas-dir` crea e imprime el directorio compartido de deltas, `<git common dir>/.emet/runs/<id>/spec-deltas`, y termina con código `0` sin fusionar.
- `landing.specMergeMethod` acepta `merge` (por defecto), `squash` y `rebase`, para que una spec aterrice en un trunk que solo permite merges squash. `emet doctor` avisa cuando los ajustes del repositorio o el ruleset del trunk no permiten el método configurado. Consulta ADR-0037.
- `bun run check:codex` falla ante un archivo en un directorio `codex/` generado que no tiene fuente.

### Cambiado

- Con `specs.enabled` desactivado, `emet spec-merge` imprime `specs.enabled is false; nothing merged` y termina con código `0`. Lee los deltas del directorio de ejecución compartido bajo el git common dir y, si no están, del `.emet/runs/<id>/spec-deltas/` de cada checkout.
- Los prompts de la Fase 8 ya no ejecutan `emet spec-merge` después de que aterriza una wave o una spec; en su lugar, `phases-8-review.md` carga `living-specs.md` en la última wave.
- `emet spec-branch land` espera los checks del pull request con el mismo poller que `emet ci`, sondeando incluso un pull request que aún no tiene checks, y fusiona con `landing.specMergeMethod`.

### Corregido

- `emet spec-branch land` ya no fusiona antes de que GitHub haya registrado algún check.
- `emet setup` lista los plugins de Claude una sola vez en lugar de hasta tres, y sus sondeos silenciosos terminan por tiempo de espera en lugar de bloquearse.
- `emet doctor` lista los plugins instalados una sola vez por ejecución.
- `bun run lint` y `bun run fix` generan primero los tipos de Astro del sitio, por lo que pasan en un checkout nuevo.

## 0.15.0

2026-11-21

### Cambiado

- `landing.unit` es `spec` por defecto: las waves de una spec se integran en la rama `spec/<id>` con `emet spec-branch` y la spec aterriza una sola vez, como un pull request (o un merge local con `landing.mode: merge`), en lugar de un pull request por wave. Usa `"landing": { "unit": "wave" }` para mantener el comportamiento anterior. El modo `spec` necesita `worktree.baseRef: "head"` en la configuración de Claude Code. Consulta ADR-0037.
- El journal añade los tipos `spec.integrate`, `spec.land` y `spec.abandon`, y `emet status` añade `specBranch`.

## 0.14.5

2026-11-21

### Añadido

- `emet handoff --check` analiza una sección `skills:` en la nota de traspaso de un worker (`none`, o `loaded: a, b; missing: c`). Es obligatoria cuando `state` es `done`. `--expect-skills a,b` falla la comprobación por cada skill indicada que no esté en ninguna de las dos listas e imprime las que faltan.
- El registro de despacho lleva un array opcional `skills`, y `emet verify` lo pasa a `emet handoff --check` como `--expect-skills`. Un registro sin `skills` se sigue analizando.
- El ADR-0036 permite que un ticket cambie la redacción de un prompt instalado cuando nombra los párrafos, y el mismo pull request sube los límites de bytes.

### Cambiado

- El prompt de la Fase 8 se divide en `phases-8-review.md` y `phases-8-landing.md`. `install.sh` retira el antiguo `phases-8-closeout.md`: una copia editada o anterior al manifiesto pasa a `phases-8-closeout.md.retired`, y una copia sin editar se elimina.
- El prompt del worker le indica que escriba la línea `skills:` antes de su traspaso final.
- La página de arquitectura, la referencia de la CLI y sus nueve traducciones describen los dos archivos de la Fase 8 y `--expect-skills`.

## 0.14.4

2026-11-20

### Añadido

- `emet doctor` en el host de Codex avisa cuando el plugin de emet está habilitado en `$CODEX_HOME/config.toml` pero Codex no ha confiado en ninguno de sus hooks, por lo que el guard de emet no se ejecuta. El aviso no cambia el código de salida.

### Corregido

- Cuando el asset del release para la versión del plugin aún no se puede descargar, `bin/emet` ejecuta el binario en caché más reciente para cualquier comando, no solo para `emet guard`, e imprime un aviso de que el release puede estar publicándose todavía. Con `EMET_PREFETCH=1` imprime el aviso y termina con `0` sin ejecutarlo. Una discrepancia de checksum o un `SHA256SUMS` ausente siguen sin recurrir nunca a la caché, y el directorio temporal de la descarga se elimina antes del recurso.

## 0.14.3

2026-11-20

### Añadido

- `emet fleet launch --dry-run` ejecuta las comprobaciones de preparación e imprime `would launch <name>` para cada repo sin iniciar una sesión.

### Corregido

- `emet migrate` elimina los archivos de ejecución heredados de `.forge/` que no están en seguimiento y difieren de su copia en `.emet/`, y conserva la de `.emet/`, de modo que termina en repos con registros sobrantes. Cada conflicto que no puede resolver se lista junto con el paso manual, y un fallo de git dentro de un repo se trata como conflicto en lugar de borrar el archivo.
- El preload de las pruebas elimina su directorio `emet-test-state-*` cuando termina la ejecución, de modo que `bun test` ya no deja un directorio temporal por ejecución.

## 0.14.2

2026-11-20

### Corregido

- `emet promote` espera los checks del pull request de sincronización y lo fusiona solo cuando pasan, en lugar de fusionarlo de inmediato. Un pull request de sincronización que falla, agota el tiempo o es rechazado queda abierto sin hacer fallar el promote, y el resultado y el evento del journal incluyen `syncMerged` y `syncReason`.

## 0.14.1

2026-11-20

### Añadido

- `emet tracker close` cierra el issue de especificación padre de un ticket de GitHub cuando se cierra su último sub-issue, e informa de cada especificación en un nuevo campo `specs`. Una lectura o un cierre fallido de la especificación termina con `1`.
- La especificación se cierra incluso cuando el resumen de sub-issues de GitHub aún no se ha actualizado: los sub-issues de la especificación se cuentan uno por uno, incluidos los tickets cerrados en la misma llamada.

## 0.14.0

2026-11-20

### Añadido

- `emet init` establece `schema.ownedPaths` cuando encuentra un esquema de Prisma (`prisma/schema.prisma` o `prisma/schema/`) o una carpeta de migraciones de Drizzle, y elimina el marcador `TODO(emet):` de propiedad del esquema.
- El elemento de configuración `agent-browser` escribe `~/.agent-browser/config.json` (`contentBoundaries` y `maxOutput`) cuando no existe, y ejecuta `agent-browser doctor` tras la instalación. Véase ADR-0035.
- `emet setup` imprime un perfil de AppArmor para el Chrome que descargó `agent-browser`, junto con los comandos `sudo` para cargarlo, cuando el host restringe los espacios de nombres de usuario sin privilegios. Nunca ejecuta `sudo`.

### Cambiado

- El elemento de configuración `firecrawl-local` registra el servidor MCP con `FIRECRAWL_CLOUD=search` en lugar de `off`, reemplaza un registro anterior y pasa el Chrome más reciente de `agent-browser` como `FIRECRAWL_CHROME_PATH`. Véase ADR-0035.

### Corregido

- `emet setup` registra el servidor MCP `firecrawl-local` con el nombre del servidor primero, de modo que el registro se interpreta correctamente.
- `emet --help` lista todos los comandos del registro (setup, fleet, insights, chain, promote, whats-new, deploy-check, ci, run).
- Las pruebas ya no escriben en el diario real de `~/.local/state/emet`.

## 0.13.0

2026-11-20

### Añadido

- `emet setup` ofrece los elementos `context7` y `firecrawl-local` (ambos desactivados por defecto). `context7` instala la CLI `ctx7` y su skill `find-docs`. `firecrawl-local` compila Firecrawl Local con `cargo` y lo registra como servidor MCP solo local (`FIRECRAWL_CLOUD=off`, `--public-only`). Véase ADR-0034.
- `emet review-run --browser-verify true|false` pasa el eje de navegador al revisor de Codex.
- `validate.coupledSurfaces` en `emet.config.json` y el error `coupled-surface-split` de `emet validate` mantienen una página y sus traducciones en una misma ola. Véase ADR-0033.

## 0.12.0

2026-11-20

### Añadido

- `verify.browser` en `emet.config.json` (`startCommand`, `url` y, opcionalmente, `paths`) activa en un repositorio la verificación en el navegador de los cambios de interfaz con `agent-browser`. El esquema de configuración y su parser validan cada campo.
- `emet assess` imprime `browserVerify: { run, reason }`. El eje de navegador solo se ejecuta cuando la ola tiene un revisor, `verify.browser` está configurado, `agent-browser` está en el PATH y una ruta modificada coincide con `paths`.
- `emet setup` ofrece un elemento `agent-browser` (desactivado por defecto) que instala la última versión y su navegador.
- `emet doctor` informa de un hallazgo opcional de agent-browser en un repositorio que configura `verify.browser`. Un binario ausente o un `agent-browser doctor` que falla es una nota o una advertencia y nunca cambia el código de salida.
- El prompt del revisor incorpora un eje de navegador, que solo se rellena cuando `browserVerify.run` es verdadero, y el prompt del worker incorpora una línea opcional para las comprobaciones en el navegador. Véase ADR-0032.

## 0.11.1

2026-11-19

### Corregido

- En Windows nativo (Git Bash) y en cualquier sistema operativo o arquitectura no compatible, `bin/emet` termina con código 0 en lugar de fallar, de modo que el guard de PreToolUse ya no bloquea todas las llamadas a herramientas. Solo el prefetch de inicio de sesión imprime un aviso.
- `install.sh` se niega a ejecutarse en `MINGW*`, `MSYS*` y `CYGWIN*` antes de escribir nada.
- Los hooks de Codex incluyen un override `commandWindows`, de modo que Codex en Windows (PowerShell) ya no da error en cada evento.

## 0.11.0

2026-11-19

### Añadido

- `emet whats-new` imprime un aviso de una línea con un enlace a las notas de versión la primera vez que emet se ejecuta tras una actualización y después registra la versión en ejecución. Con `--hook` emite la línea como un objeto JSON `systemMessage` para los hooks de sesión.

## 0.10.0

2026-11-19

### Añadido

- `handoff.afterSpec` acepta una lista ordenada de reglas `{ paths?, mode }`, de modo que un repositorio con una CLI y un sitio web puede publicar la CLI y promover el sitio web. El modo se elige según las rutas que promover `develop` llevaría a `main`.
- `deploy.check.paths` limita la comprobación de despliegue a las promociones que tocaron los globs indicados.
- `emet promote` imprime y registra en el diario `rule` y `reason`, e imprime `deployCheck: { run, reason }`.

### Cambiado

- La comprobación de despliegue ya no depende de `afterSpec`: se ejecuta tras una última wave limpia en el trunk `main`, y tras una promoción fusionada en `develop`. El coordinador ejecuta `emet promote` después de cada spec, también con `afterSpec` en `none`.

## 0.9.1

2026-11-19

### Corregido

- `emet setup` acepta `--data-dir`, de modo que el hook SessionStart del plugin ya no falla con `unknown flag --data-dir`.

## 0.9.0

2026-11-19

### Añadido

- `emet gate` aplica una política de corregir y continuar: una wave retenida ejecuta rondas de corrección hasta que los hallazgos se resuelvan o se agote `budgets.fixRounds` (2 por defecto), y entonces se detiene. `gate.onHold` elige `fix-and-continue` (por defecto) o `stop`. `emet review --recheck` resuelve un hallazgo solo mediante el veredicto de un revisor.
- `emet ci --wait` sondea las comprobaciones de un pull request, relanza los jobs inestables e informa `pass`, `fail`, `env-fault` o `timeout`. `emet tracker close` cierra tickets de GitHub de forma idempotente, y `emet chain` ejecuta gate, readiness, launch y verify como un solo paso.
- Un diario de eventos registra decisiones del gate, intervenciones, lanzamientos, cierres de tickets y limpiezas, con rotación por tamaño. `emet insights` lo resume (`--mark-baseline` reinicia la línea base), `emet run current` muestra el spec y la wave activos, y `emet status --brief` imprime el estado en una línea.
- Las claves de configuración `language.conversation` y `language.artifacts`.
- Las claves de configuración `handoff.afterSpec` (`release`, `promote` o `none`, detectada por `emet init` o fijada con `emet init --after-spec`), `deploy.check` e `interview.research`.
- `emet promote` abre el pull request de `develop` a `main` cuando la última wave está inactiva, lo fusiona si las comprobaciones pasan y sincroniza `main` de vuelta cuando `develop` queda atrás. `--no-promote` retiene un spec en todas sus sesiones.
- `emet deploy-check` reintenta un comando de comprobación de despliegue y mata los comandos colgados.
- `emet fleet list | set | launch` ejecuta specs en varios repositorios.
- `emet setup` y `/emet:setup` instalan complementos opcionales desde un catálogo tras respaldar la configuración de Claude. Un hook SessionStart muestra un aviso una sola vez, e `install.sh` ejecuta setup en una TTY.
- `emet doctor` y `emet init` recomiendan Engram sin contarlo nunca como dependencia no satisfecha.

### Cambiado

- Los prompts y la documentación instalados describen la política del gate, `emet ci`, `emet chain`, el diario, el paso posterior al spec, fleet y setup. La fase 8 añade un resumen de la wave y una notificación push, y `emet insights` reemplaza la referencia a `/retro`.

### Corregido

- `--no-promote` se guarda como una marca bajo el directorio común de git, de modo que una sesión encadenada de `/emet:run --dispatch` para la última wave ya no promueve `develop` a `main`.

## 0.8.6

2026-11-17

### Corregido

- El workflow de release instala Chromium antes de volver a ejecutar las comprobaciones sobre el tag, como hace el job de pruebas de CI, de modo que la verificación ya no se detiene en el mínimo de cobertura de `tools/`. v0.8.5 se etiquetó pero nunca se publicó por esto; sus cambios se publican en esta versión.

## 0.8.5

2026-11-17

### Cambiado

- El gate de cobertura exige un mínimo por archivo del 97 % de líneas y el 98 % de funciones para `emet/`, `apps/site` y `tools/`, con excepciones razonadas en `tools/coverage-exceptions.ts`. El manifiesto de cobertura recorre `emet/src` de forma recursiva, `tools/` pasa por el gate y los totales de `tools/coverage-floors.json` suben a los valores medidos.
- El guard de PreToolUse falla en cerrado: cuando `bin/emet` no puede resolver el binario de emet, el hook sale con 2 y bloquea la llamada a la herramienta, con un mensaje que explica cómo recuperarse. Los hooks Stop y SubagentStop siguen saliendo con 1.
- Los manifiestos del plugin incluyen correo del autor, licencia, página de inicio, repositorio y URL de incidencias, y las descripciones de las skills de Codex indican cuándo usar cada una.

### Corregido

- `emet doctor` sale con el código 3 cuando se escapa un error inesperado, en lugar de 0. Un código de salida distinto de cero fijado antes se conserva.
- `emet cleanup --all --force` recupera el worktree y las ramas del worker de una ejecución muerta, incluidos los worktrees bajo `.claude/worktrees/`. Un dueño vivo o inactivo, y un bloqueo que no nombra ninguna ejecución, siguen protegidos.
- El guard de edición reconoce una superficie escrita de forma literal, como `src/app/[locale]/page.tsx`. `[` y `]` en una superficie ya no son una clase de caracteres.
- `emet preflight --post-dispatch` falla cuando un ticket que aún tiene una reserva o un slot ha perdido su worktree de worker, e indica al coordinador que lo vuelva a despachar en lugar de reanudarlo.
- El binario compilado de `emet` ya no carga un archivo `.env` del directorio actual.
- El sitio web elimina los atributos de estilo en línea de la página de inicio, da contraste AA a las etiquetas de inicio en modo claro y nombra el botón de búsqueda con su texto visible desde el primer render. Las imágenes de la documentación se sirven desde el origen propio del sitio bajo `repo-assets` en lugar de `raw.githubusercontent.com`, y `astro dev` también las sirve.

## 0.8.4

2026-11-15

### Cambiado

- El encabezado de la página de inicio ahora son dos grupos en los extremos: la marca y Docs a la izquierda; búsqueda, estrellas de GitHub, tema e idioma a la derecha. Sus controles y la etiqueta de versión son de vidrio translúcido sobre el cielo, y el enlace duplicado a Novedades ya no aparece en el encabezado ni en el menú de la página de inicio.

## 0.8.3

2026-11-15

### Corregido

- `/docs/` y el `/docs/` de cada idioma ahora responden con un 301 a la página de primeros pasos, en lugar de una página con meta-refresh que mostraba un destello sin estilos.

## 0.8.2

2026-11-11

### Corregido

- `emet cleanup` conserva una rama scaffold `worktree-<name>` mientras el worktree `<name>` siga existiendo, de modo que una sesión que trabaja ahí en otra rama mantiene la rama que su host espera.

## 0.8.1

2026-11-11

### Añadido

- `emet cleanup` elimina las ramas scaffold `worktree-<name>` que deja el Agent host, cuando nada las tiene en uso y trunk ya contiene su punta.

### Corregido

- El guard rechaza un borrado forzado de rama en cualquier forma que combine un flag de borrado con un flag de fuerza, no solo con el flag en mayúscula.

## 0.8.0

2026-11-11

### Añadido

- `emet cleanup` elimina cada rama local cuyo pull request se fusionó en el commit de la punta de la rama, en todos los modos, junto con el worktree de agente limpio y sin bloqueo que la contiene. Las ramas de integración, de release y de corrección ya no esperan un borrado manual.
- `bun run translations:status` lista las traducciones del Website que están atrasadas respecto a su fuente.

### Cambiado

- El rechazo del guard a un borrado forzado de rama apunta a `emet cleanup`.
- El runbook de release cubre las traducciones de `whats-new`.

## 0.7.0

2026-11-11

### Añadido

- El Website sirve el esquema de configuración en `https://emet.andryore.dev/schema/emet.config.schema.json`.
- `docs/development.md` y `docs/security.md`.
- Un piso de cobertura por workspace que `bun run test` hace cumplir.

### Cambiado

- `emet init` escribe la URL pública de `$schema` en `emet.config.json` en lugar de una ruta local.
- Los tags de versión van firmados, y el workflow Release falla cuando la sección del CHANGELOG para el tag falta o está vacía.
- El repositorio sigue el estándar andryorelabs v1: rulesets como código, archivos de comunidad, estructura del README y nombres de scripts estándar (`format:write`, `lint:commits`).

## 0.6.1

2026-11-10

### Corregido

- Dos procesos que recuperan a la vez el mismo lock caducado ya no pueden entrar ambos en la sección crítica; los claims, el Mailbox, el tracker y `acquireLock` comparten una única recuperación protegida.
- Las llamadas concurrentes a `emet tracker create-ticket` ya no fallan de forma intermitente.

## 0.6.0

2026-11-10

### Añadido

- Un Mailbox para los workers de Codex: `emet ask` registra una pregunta (y consulta la respuesta con `--wait`), `emet inbox` lista las preguntas abiertas y `emet reply` responde una, de modo que un worker ya no escala mediante una nota de traspaso.
- `emet dispatch --wait` imprime `question <ticket> <id>` mientras un worker activo tiene una pregunta abierta, y nunca clasifica a ese worker como detenido.
- `emet claims --reserve` guarda las superficies de edición del ticket y rechaza una reserva que se solape con las superficies de otra ejecución.

### Corregido

- `emet dispatch --wait` lee los resultados del directorio de ejecución del git-common-dir, donde `emet results --write` los escribe.

## 0.5.2

2026-11-10

### Cambiado

- El aviso de no afiliación nombra a OpenAI además de Anthropic.
- Las pestañas de instalación de la página de inicio dicen Claude Code, y el comando de ejecución tiene una pestaña de Codex con `$emet:run`.
- Las guías indican qué pasos son de cada Agent host: Claude Code o Codex.

### Corregido

- `emet doctor`, `emet init`, `emet dependencies` y `emet preflight` ya no dan consejos solo de Claude Code en el host Codex.
- `emet init --force` conserva `agentHost` y la sección `codex` de la configuración existente.

## 0.5.1

2026-11-10

### Cambiado

- El README, la página de inicio, el banner, las guías y las imágenes para compartir nombran a Codex junto a Claude Code.

## 0.5.0

2026-11-10

### Añadido

- La página de inicio del Website: héroe pintado, cómo funciona, funciones,
  acerca de, panel de cierre, encabezado y pie de página, con textos en inglés
  en `apps/site/src/i18n/ui/en.ts`.
- La documentación del Website en `/docs/`: páginas de Starlight generadas a
  partir de una lista permitida de documentos del repositorio y de este
  registro de cambios, con búsqueda de Pagefind, reescritura de enlaces hacia
  páginas del sitio o GitHub, y un aviso de respaldo en inglés para las
  traducciones ausentes o desactualizadas.
- `docs/how-to/update-emet.md`: cómo actualizar los plugins y activar la
  actualización automática del marketplace.
- Codex como Agent host: `agentHost` en `emet.config.json`, `emet dispatch` y
  `emet review-run` inician cada worker y revisor como un proceso `codex exec`,
  las skills `$emet:run`, `$emet:init` y `$emet:doctor` y el manifiesto del
  plugin de Codex, y la prueba de extremo a extremo opcional
  (`EMET_CODEX_E2E=1`).
- `docs/guide/codex.md`, la guía de Codex, publicada en el Website.

### Cambiado

- El valor por defecto de `codex.sandbox` en Codex es `danger-full-access`
  (`workspace-write` sigue aceptándose), que pasan `emet dispatch`,
  `emet review-run` y un `emet launch` de Codex; `emet guard` en Codex deniega
  todas las formas de push.
- La superposición de Codex de cada corrida escribe su propio `config.toml`
  mínimo en lugar de enlazar el tuyo, y sus reglas permiten las formas `-C` y
  los subcomandos de coordinación mientras el push sigue prohibido.
- Los workers de Codex se identifican por su `threadId` y la ruta de su JSONL,
  no por su pid.
- La guía de Codex informa de los resultados reales con Codex: cada fila
  `failed` anterior pasa a `verified`, la lista `unverified` se reduce a la
  supervisión desatendida, y el informe de la sonda enumera los seguimientos
  pendientes.

### Corregido

- `emet cleanup` recupera los worktrees aterrizados que no tienen dueño.
- El Agent host de Codex se resuelve por defecto, de modo que `emet preflight`,
  `doctor`, `cleanup`, `status` y `usage` aceptan `agentHost: "codex"`.
- La resolución de modelos de Codex lee `models_cache.json` del home de la
  corrida o de tu home real de Codex.

## 0.4.0

2026-11-06

### Añadido

- Opción `position` de `emet-mascot` (`pane`, `band` o `status`); `pane` es el
  valor por defecto y recurre a la banda cuando no puede acoplarse.
- Una sección "Mascot (optional)" en el README.

### Cambiado

- Los fotogramas de `emet-mascot` se ajustan a los seis colores de la mascota
  en lugar de difuminarse por un redimensionado, de modo que el pixel art se
  ve nítido en la terminal.
- `emet-mascot` 0.2.0: el `size` por defecto ahora es `small`.
- `docs/how-to/orca-pet.md` ahora es `docs/how-to/mascot.md`, y cubre el mod
  y el pet de Orca.

## 0.3.0

2026-11-05

### Añadido

- Los comandos de plugin `/emet:init` y `/emet:doctor` ejecutan `emet init` y
  `emet doctor .` dentro de Claude Code y resumen el resultado.
- `emet doctor` avisa de los hooks `forge guard` y `emet guard` en
  `~/.claude/settings.json` cuyo binario ya no existe, e imprime un comando de
  respaldo seguido de `jq` para eliminarlos. Nunca edita el archivo.
- Fundamentos de la mascota: un archivo de fase, el paquete del pet, una
  máquina de estados del mod, el resto de escritores de fase y fotogramas
  rasterizados.
- `emet-mascot`, un plugin opcional que muestra una mascota de píxeles encima
  del prompt y refleja la sesión y la fase de la ejecución de `emet`. Está
  listado en el marketplace, con una guía práctica para el pet de Orca y el
  ADR-0016.

### Corregido

- El plugin ya no expone un comando `/emet:emet` duplicado y roto;
  `commands/` queda fijado a `run.md`, `init.md` y `doctor.md`.
- La siguiente oleada ahora se lanza con `/emet:run`, el comando que registra
  el plugin.

### Cambiado

- El repositorio se movió a la organización de GitHub `andryorelabs`. Las
  descargas de versiones, las insignias del README y la URL de clonación ahora
  apuntan a `andryorelabs/emet`; las antiguas URL `AndryOre/emet` siguen
  redirigiendo.
- Las instalaciones independientes renombran `/emet` a `/emet:run`, igual que
  el plugin. `install.sh` ahora instala `commands/run.md`, `init.md` y
  `doctor.md` en `~/.claude/commands/emet/`, de modo que `/emet:run`,
  `/emet:init` y `/emet:doctor` están disponibles sin el plugin. El antiguo
  `~/.claude/commands/emet.md` se elimina cuando no fue editado; una copia
  editada se conserva y se lista en el resumen de la instalación.

## 0.2.0

2026-11-05

### Cambiado

- El proyecto pasa de llamarse claude-forge a emet: la CLI es `emet`, el
  comando es `/emet`, los agentes son `emet-worker` y `emet-reviewer`, y el
  README lleva la nueva marca. Las instalaciones y los repositorios existentes
  siguen funcionando: los nombres heredados (`forge.config.json`, `.forge/`,
  `docs/agents/forge.md`, `FORGE_*`) se siguen leyendo con un aviso, y
  `emet migrate` lleva un repositorio a los nuevos nombres.

### Añadido

- `install.sh` funciona sin Bun: instala el shim del binario independiente
  como `~/.local/bin/emet`, reescribe los marcadores de posición del plugin en
  los prompts que copia, instala `commands/run.md` como
  `~/.claude/commands/emet.md` y acepta `shasum -a 256` en lugar de
  `sha256sum`.
- El README indica los requisitos reales, ambas vías de instalación y el
  orden `/setup-matt-pocock-skills` y luego `emet init`.
- Guía para agentes (`AGENTS.md`), glosario del dominio (`GLOSSARY.md`) y
  registros de decisiones de arquitectura en `docs/adr/`.
- Tracker local en markdown sobre la convención `.scratch/`, con una CLI
  `emet tracker` (`create-spec`, `create-ticket`, `frontier`, `set-state`,
  `comment`, `close`) y `emet validate`, `preflight` y `doctor` conscientes del
  tracker local.
- `landing.mode` (`pr` o `merge`) y `emet land`, que aterriza una oleada como
  un único merge local sin PR; `emet cleanup` y `emet status` comparan con la
  rama troncal local en modo merge.
- Binarios independientes de `emet`, `emet --version`, compatibilidad con
  macOS en la CI y en el árbol de procesos y el freno de memoria, y manifiestos
  de plugin con un shim `bin/emet`.
- Contrato de skills con `emet skill-path`, y un `emet doctor` más amplio que
  cubre skills, glosario, obsolescencias e instalaciones dobles.
- `emet init` y `emet map` neutrales respecto al lenguaje para repositorios de
  JS, Go, Rust y Python.
- ADR-0007 a ADR-0011.
- Índice de la documentación, mapa de código de la arquitectura, solución de
  problemas por síntoma, una plantilla de PR más completa y `emet/AGENTS.md`
  con las reglas exclusivas del runtime.

### Cambiado

- `gh` solo es obligatorio cuando `tracker.kind` es `github` o `landing.mode`
  es `pr`.
- `emet init` ya no selecciona el tracker local por defecto.
- Se enmienda el ADR-0004: una oleada aterriza como un PR o como un merge
  local.

## 0.1.0

2026-11-03

### Añadido

- El comando global `/forge`: entrevista, spec, tickets, una sola aprobación y
  luego agentes de worktree en paralelo que implementan, prueban y fusionan una
  funcionalidad sin supervisión.
- La CLI `forge` con los subcomandos `init`, `doctor`, `preflight`, `selftest`,
  claims, slots, gates, comprobaciones de handoff, results y metrics.
- Los agentes `forge-worker` y `forge-reviewer`.
- Trackers para Linear y GitHub Issues.
- Configuración por repositorio mediante `forge.config.json`.
- `install.sh`, que instala la CLI, el comando y los agentes.
