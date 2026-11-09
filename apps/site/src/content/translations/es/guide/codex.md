---
title: Ejecutar emet en Codex
description: Usa Codex como Agent host de emet: instala el plugin, configura agentHost, aprueba una sola vez y conoce los límites.
seoTitle: Ejecutar emet en Codex
sourceHash: a64f64be24588f52
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

4. Instala la CLI `emet` como se describe en [Primeros pasos](getting-started.md) y luego ejecuta `emet doctor .`. En el host de Codex informa de un `codex` anterior a `codex.minVersion`, de una bandera `--json` o `--output-schema` ausente en `codex exec` y de un `mattpocock-skills` faltante, con los dos comandos anteriores.

Los dos comandos de plugin del paso 3 siguen el patrón que el spike verificó para un marketplace local; su ortografía exacta para este repositorio es `unverified` hasta la primera versión.

## Elegir el Agent host

Define `agentHost` en `emet.config.json`:

```json
{ "agentHost": "codex" }
```

El valor por defecto es `"claude"`. La sección `codex` define los modelos, el esfuerzo, la versión mínima y el sandbox; consulta la [referencia de configuración](../reference/configuration.md#codex) y [Modelos y esfuerzo](models-and-effort.md). Inicia una corrida desde Codex con `$emet:run`. `emet launch <spec> --wave <n>` inicia una oleada en un `codex exec` desacoplado y registra su id de hilo, de modo que `codex exec resume <id>` la continúa; no se abre ninguna pestaña de Orca.

## La aprobación única

emet pide una sola aprobación, después del plan. En Claude Code es un prompt. En Codex es un hook:

- Hasta que exista `.emet/runs/spec<id>/approval.json`, `emet guard` deniega toda mutación (`apply_patch`, `Bash`) salvo las escrituras bajo `.emet/runs/**/draft/**`, con el motivo `not approved: send approve <id>`. La compuerta se aplica una vez que existe un directorio `.emet/runs/spec<id>/` sin su `approval.json`, que es el estado en que `/emet:run` deja la corrida tras la Fase 4, cuando materializa el spec.
- Apruebas enviando una línea de prompt que sea exactamente `approve <id>`. El hook `UserPromptSubmit` escribe entonces el archivo de aprobación con el mismo hash que `emet approve`. Las mismas palabras en la salida de una herramienta o en el texto del modelo no hacen nada.
- La alternativa es `/plan $emet:run`: aprueba el plan en el modo de plan propio de Codex en lugar del hook.

Una vez que existe ese directorio, la compuerta falla en modo cerrado: un archivo de aprobación ausente o ilegible mantiene denegadas las mutaciones. El guard también comprueba cada ruta de un `apply_patch` contra el `.emet/surface.json` del ticket.

## Cómo se ejecuta una oleada

- `emet dispatch --role worker` comprueba el claim y el slot, crea `.emet/worktrees/agent-<ticket>`, construye una superposición de `CODEX_HOME` por corrida en `.emet/runs/<run>/codex-home/` que enlaza tu autenticación y configuración en lugar de copiarlas, e inicia `codex exec` con el modelo y el esfuerzo resueltos, el modo `codex.sandbox` (`workspace-write` por defecto), `--json` y `--output-schema`. Los eventos se capturan en `.emet/runs/<run>/codex/<ticket>.jsonl`.
- Las reglas de la superposición permiten `git add` y `git commit` y prohíben `git push`. Tu `~/.codex` nunca se modifica.
- `emet review-run` ejecuta el revisor en solo lectura sobre un paquete de `emet review-package`; el nivel `passive` no inicia ningún proceso.
- El uso y la detección de bloqueos leen el JSONL capturado: el uso de tokens, de los eventos `turn.completed`; la actividad, del proceso `codex` y de la hora de modificación del archivo.

## Límites y puntos `unverified`

- El esfuerzo `ultra` nunca se envía y se rechaza en la configuración.
- `danger-full-access` solo está disponible si defines `codex.sandbox` con ese valor; nada lo habilita por defecto.
- No hay equivalentes de `ScheduleWakeup`, `TaskStop` ni `LSP`. emet consulta su propia CLI en su lugar.
- Los archivos rollout de `~/.codex/sessions` no tienen un formato estable, así que emet lee la salida de `exec --json` que él mismo capturó.
- La investigación marca estos comportamientos como `unverified`, y cada uno queda tras una pequeña función para que un cambio en Codex toque un solo lugar: un `CODEX_HOME` por corrida con autenticación enlazada, la ubicación del archivo de reglas en la superposición, `--dangerously-bypass-hook-trust`, el alias `CLAUDE_PLUGIN_ROOT` en los comandos de los hooks, el formato de salida de `codex plugin list`, que un modelo cargue una skill por nombre y `emet dispatch` dentro de un sandbox anidado. Consulta [la investigación de viabilidad](../research/codex-viability.md).
- No se ha observado que un modelo intente falsificar `approval.json`. La compuerta denegaría el intento, pero eso es `unverified`.
- Ejecutar Codex desde un supervisor desatendido (systemd, un contenedor) después de que termine la sesión que lo lanzó es `unverified`.
- Los nombres y precios de los modelos de Codex cambian; la tabla de precios necesita una nueva revisión cuando se hayan ejecutado oleadas reales.
