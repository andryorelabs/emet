---
title: Ejecutar emet en Codex
description: Usa Codex como Agent host de emet: instala el plugin, configura agentHost, aprueba una sola vez y conoce los límites.
seoTitle: Ejecutar emet en Codex
sourceHash: fedf7f4694193076
---

emet puede ejecutarse en Codex CLI además de Claude Code. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md); el producto en el que se ejecuta una corrida es el **Agent host**. Esta página cubre la instalación del lado de Codex, la elección del host, la aprobación única y los límites conocidos. Volver al [índice de la documentación](../README.md).

En el host de Codex el pipeline es el mismo: entrevista, spec, tickets, una aprobación, workers paralelos en worktrees, una revisión por oleada y, al final, el aterrizaje. Lo que cambia es la fontanería. Cada worker y cada revisor es su propio proceso `codex exec`, iniciado por `emet dispatch` y `emet review-run`, y los comandos slash pasan a ser las skills `$emet:run`, `$emet:init` y `$emet:doctor`. La ruta de Claude Code no se toca.

## Instalación

1. Instala la CLI `codex` en la versión indicada por `codex.minVersion` (por defecto `0.167.0`) o una más nueva, e inicia sesión.
2. Instala el plugin `mattpocock-skills` en Codex:

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

3. Instala el plugin de emet. El repositorio incluye `.codex-plugin/plugin.json` y las skills y hooks generados en `codex/`:

   ```bash
   codex plugin marketplace add andryorelabs/emet
   codex plugin add emet@emet-marketplace
   ```

4. Instala la CLI `emet` como se describe en [Primeros pasos](getting-started.md) y luego ejecuta `emet doctor .`. `install.sh` también instala los comandos y agentes de Claude Code bajo `~/.claude`; eso es inofensivo en Codex, y `emet doctor` no avisa de que el plugin de Codex e `install.sh` estén juntos. En el host de Codex informa de un `codex` anterior a `codex.minVersion`, de una bandera `--json` o `--output-schema` ausente en `codex exec` y de un `mattpocock-skills` faltante, con los dos comandos anteriores.

Los dos comandos de plugin del paso 3 se ejecutaron contra el `codex` real (0.167.0): en un `CODEX_HOME` limpio terminan con código 0 y `codex plugin list` muestra `emet@emet-marketplace installed, enabled`. La forma con ruta local, `codex plugin marketplace add <repo>`, da el mismo resultado.

## Elegir el Agent host

Define `agentHost` en `emet.config.json`:

```json
{ "agentHost": "codex" }
```

El valor por defecto es `"claude"`. La sección `codex` define los modelos, el esfuerzo, la versión mínima y el sandbox; consulta la [referencia de configuración](../reference/configuration.md#codex) y [Modelos y esfuerzo](models-and-effort.md). Inicia una corrida desde Codex con `$emet:run`. `emet launch <spec> --wave <n>` inicia una oleada en un `codex exec` desacoplado y registra su id de hilo, de modo que `codex exec resume <id>` la continúa; no se abre ninguna pestaña de Orca.

## La aprobación única

emet pide una sola aprobación, después del plan. En Claude Code es un prompt. En Codex es un hook:

- Hasta que exista `.emet/runs/spec<id>/approval.json`, `emet guard` deniega toda mutación (`apply_patch`, `Bash`) salvo las escrituras bajo `.emet/runs/**/draft/**`, con el motivo `not approved: send approve <id>`. La compuerta se aplica una vez que existe un directorio `.emet/runs/spec<id>/` sin su `approval.json`, que es el estado en que `$emet:run` deja la corrida tras la Fase 4, cuando materializa el spec.
- Apruebas enviando una línea de prompt que sea exactamente `approve <id>`. El hook `UserPromptSubmit` escribe entonces el archivo de aprobación con el mismo hash que `emet approve`. Las mismas palabras en la salida de una herramienta o en el texto del modelo no hacen nada.
- La alternativa es `/plan $emet:run`: aprueba el plan en el modo de plan propio de Codex en lugar del hook.

Una vez que existe ese directorio, la compuerta falla en modo cerrado: un archivo de aprobación ausente o ilegible mantiene denegadas las mutaciones. El guard también comprueba cada ruta de un `apply_patch` contra el `.emet/surface.json` del ticket.

## Cómo se ejecuta una oleada

- `emet dispatch --role worker` comprueba el claim y el slot, crea `.emet/worktrees/agent-<ticket>`, construye una superposición de `CODEX_HOME` por corrida en `.emet/runs/<run>/codex-home/`, e inicia `codex exec` con el modelo y el esfuerzo resueltos, el modo `codex.sandbox` (`danger-full-access` por defecto), `--json` y `--output-schema`. Los eventos se capturan en `.emet/runs/<run>/codex/<ticket>.jsonl`. El worker se identifica por el `threadId` de su evento `thread.started` y por esa ruta JSONL; el id de proceso es solo un campo auxiliar.
- La superposición se genera, no se enlaza. Tu `auth.json` se enlaza con un symlink (nunca se copia), la caché del plugin de emet se enlaza desde tu home de Codex cuando existe, y la superposición escribe su propio `config.toml` mínimo: el marketplace local y `[plugins."emet@emet-marketplace"] enabled = true`, una tabla `[projects."<dir>"]` con `trusted` solo para los directorios propios de la corrida, y el `model` y el `model_reasoning_effort` resueltos. No se copia ninguna de tus tablas `[projects]` ni otros ajustes, y tu `~/.codex` nunca se modifica.
- El `rules/default.rules` de la superposición permite `git add`, `git commit`, `git status`, `git worktree`, `git -C <dir> ...` y los subcomandos de `emet` `dispatch`, `review-run`, `launch`, `claims`, `slots`, `results`, `handoff` y `ask`, y prohíbe `git push`. Como el sandbox por defecto ya no bloquea las escrituras, `emet guard` también deniega cualquier comando `Bash` cuyo argv ejecute `git push`, incluidos `git -C <dir> push` y `git --git-dir=<dir> push`, sea cual sea el sandbox.
- Un worker nunca tiene un canal lateral con el coordinador. Escala a través del buzón de la ejecución: `emet ask --run <run> --ticket <ticket> --body <text>` registra una pregunta e imprime su id, y `emet ask ... --wait <n>` sondea la respuesta (el código de salida 0 la imprime, 3 significa que la ventana terminó, 4 significa que `budgets.askWaitMinutes` se agotó, así que el worker escribe un resultado BLOCKED y termina). Mientras un worker vivo tiene una pregunta abierta, `emet dispatch --wait` imprime `question <ticket> <id>` en lugar de un estado de resultado y nunca clasifica al worker como bloqueado; el coordinador lee `emet inbox --run <run>`, responde con `emet reply --run <run> --ticket <ticket> --id <n> --body <text>` y reanuda `emet dispatch --wait`. Un resultado registrado siempre prevalece sobre una pregunta abierta. Véase [ADR-0023](../adr/0023-cli-owned-mailbox-for-codex-workers.md).
- Los resultados se leen de `<git-common-dir>/.emet/runs/<run>/results/`, el mismo lugar donde escribe `emet results --write`, de modo que se encuentra a un worker en su propio worktree.
- `emet review-run` ejecuta el revisor en solo lectura sobre un paquete de `emet review-package`; el nivel `passive` no inicia ningún proceso.
- Los modelos se resuelven contra `models_cache.json` en el home de la corrida y, si no está ahí, en tu home real de Codex (solo lectura). Un slug configurado que no aparece en la lista se sustituye y la sustitución se registra; si nada se resuelve, `emet review-run` falla antes de la llamada al modelo y nombra el rol y los slugs listados.
- El uso y la detección de bloqueos leen el JSONL capturado: el uso de tokens, de los eventos `turn.completed`, y la actividad, de que el archivo siga creciendo, de modo que un worker en otro espacio de nombres de pid sigue figurando como activo. `emet preflight` y `emet cleanup` comparten una sola regla para un worktree sin dueño recuperable (rama de worker, ticket aterrizado, árbol limpio, sin bloqueo ajeno), así que preflight solo indica ejecutar `emet cleanup` cuando cleanup actuaría.

## Lo que mostró la ejecución real de Codex

El [informe de la sonda](../research/codex-probe-report.md) repitió cada comprobación con `codex-cli 0.167.0` (plan gratuito de ChatGPT, Linux) tras estos cambios. Todas las filas `failed` anteriores ahora son `verified`:

- Un flujo de 2 olas aterrizó commits reales de workers de Codex en el trunk: la ola 1 desde `emet dispatch`, la ola 2 desde una sesión iniciada con `emet launch <spec> --wave 2` que cargó `$emet:run` desde la caché del plugin de la superposición. `emet review-run` se ejecutó en cada flujo.
- El e2e opcional (`EMET_CODEX_E2E=1`) pasa: el worker hace commit bajo `danger-full-access`, y `codex execpolicy check` responde `forbidden` para `git push origin develop` y `allow` para `git -C <dir> commit`.
- `~/.codex/config.toml` mantuvo el mismo sha256 durante la sonda, el e2e y siete flujos.

## Límites y puntos `unverified`

- El esfuerzo `ultra` nunca se envía y se rechaza en la configuración.
- `danger-full-access` es el `codex.sandbox` por defecto para los workers de Codex y para `emet launch`, porque el sandbox `workspace-write` deja `.git` en solo lectura y un worker no podría hacer commit. Define `codex.sandbox` como `"workspace-write"` para conservar el sandbox; los workers entonces no pueden hacer commit. [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) registra el compromiso. La ruta de Claude nunca lo usa. Sin sandbox, la denegación de push en `emet guard` y el archivo de reglas son las barreras de protección.
- No hay equivalentes de `ScheduleWakeup`, `TaskStop` ni `LSP`. emet consulta su propia CLI en su lugar.
- Los archivos rollout de `~/.codex/sessions` no tienen un formato estable, así que emet lee la salida de `exec --json` que él mismo capturó.
- Verificado contra la CLI real, y aún tras pequeñas funciones para que un cambio en Codex toque un solo lugar: un `CODEX_HOME` por corrida con autenticación enlazada, el archivo de reglas en `rules/default.rules`, `--dangerously-bypass-hook-trust`, el alias `CLAUDE_PLUGIN_ROOT` en los comandos de los hooks, el formato de salida de `codex plugin list`, que un modelo cargue una skill por nombre, `emet dispatch` dentro de una sesión anidada, un modelo que intenta falsificar `approval.json` (denegado) y las dos formas de `codex plugin marketplace add`. Consulta [la investigación de viabilidad](../research/codex-viability.md).
- Aún `unverified`: ejecutar Codex desde un supervisor desatendido bajo systemd o en un contenedor (solo se probó un proceso desacoplado).
- Seguimientos conocidos del informe de la sonda: `emet init` escribe nombres de modelos de Claude en `models` para `agentHost: "codex"`, un `emet dispatch --model` explícito no se resuelve contra la caché, `emet lock-reason` busca un ancestro `claude`, y un ticket cuyo worker murió no puede volver a despacharse en el mismo worktree.
- Los nombres y precios de los modelos de Codex cambian; la tabla de precios necesita una nueva revisión cuando se hayan ejecutado oleadas reales.
