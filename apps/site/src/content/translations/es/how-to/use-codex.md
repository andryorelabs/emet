---
title: Ejecutar emet en Codex
description: "Usa Codex como Agent host de emet: instala emet, configura agentHost, aprueba una sola vez y conoce los límites."
seoTitle: Ejecutar emet en Codex
sourceHash: 71c6c7d0686a6725
---

Ejecuta el pipeline de emet en Codex CLI en lugar de Claude Code. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md); el producto en el que se ejecuta una corrida es el **Agent host**. Volver al [índice de la documentación](../README.md).

Cómo se ejecuta una oleada en Codex, el guard y las contrapartidas del sandbox se explican en [Seguridad](../concepts/security.md) y [Corridas, oleadas y specs](../concepts/runs-waves-specs.md).

## Requisitos previos

- La CLI `codex` en la versión indicada por `codex.minVersion` (por defecto `0.167.0`) o una más nueva, con sesión iniciada.
- `git` y `gh` en el `PATH`; consulta la [referencia de dependencias](../reference/dependencies.md).
- Un repositorio con un `emet.config.json` (ejecuta `emet init` si no lo tiene).

## Instalación

:::steps

1. Instala el plugin `mattpocock-skills` en Codex:

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

2. Instala emet con la instalación independiente de [Instalación](../start/install.md). Escribe las skills de emet en `~/.agents/skills/emet/` y añade los hooks de emet a `$CODEX_HOME/hooks.json` (por defecto `~/.codex`), y nunca escribe `config.toml`. También instala el `emet` de la terminal y los comandos y agentes de Claude Code bajo `~/.claude`; eso es inofensivo en Codex.

3. Confía en los hooks. Codex no ejecuta un hook hasta que confíes en él: abre `/hooks` y pulsa `t` en la página de eventos, o aprueba el aviso "Hooks need review" al iniciar.

:::

### Opcional: el plugin de Codex

En lugar de la instalación independiente puedes instalar el plugin de emet:

```bash
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

El plugin no trae ningún shim `emet`, así que el `emet` de la terminal sigue necesitando la instalación independiente. `emet self install` se niega mientras el plugin esté instalado salvo que pases `--force`, y `emet doctor` avisa cuando ambos coexisten.

## Elegir el Agent host

:::steps

1. Define `agentHost` en `emet.config.json` (el valor por defecto es `"claude"`):

   ```json
   { "agentHost": "codex" }
   ```

2. Define los modelos, el esfuerzo, la versión mínima y el sandbox en la sección `codex` si los valores por defecto no te sirven; consulta la [referencia de configuración](../reference/configuration.md#codex) y [Modelos y esfuerzo](choose-models.md).
3. Inicia una corrida desde Codex con `$emet:run`. Para iniciar una oleada desde una terminal, ejecuta `emet launch <spec> --wave <n>`; inicia un `codex exec` desacoplado y registra su id de hilo, de modo que `codex exec resume <id>` la continúa. No se abre ninguna pestaña de Orca.

:::

## Aprobar el plan

emet pide una sola aprobación, después del plan. En Codex es un hook.

:::steps

1. Espera a que `$emet:run` materialice el spec. Hasta que exista `.emet/runs/spec<id>/approval.json`, `emet guard` deniega toda mutación con el motivo `not approved: send approve <id>`.
2. Envía una línea de prompt que sea exactamente `approve <id>`. El hook `UserPromptSubmit` escribe el archivo de aprobación. Las mismas palabras en la salida de una herramienta o en el texto del modelo no hacen nada.
3. Como alternativa, empieza con `/plan $emet:run` y aprueba el plan en el modo de plan propio de Codex.

:::

## Después de actualizar emet

Con la instalación independiente, los hooks son entradas normales en `hooks.json` y siguen siendo de confianza. Con el plugin, Codex vuelve a pedir que confíes en los hooks del plugin después de cada actualización.

:::steps

1. Abre `/hooks` y pulsa `t` en la página de eventos, o aprueba el aviso "Hooks need review" al iniciar. Hasta entonces, el emet guard y la aprobación única no se ejecutan.
2. Si el shim imprime `release v<version> has no downloadable asset yet`, está ejecutando la versión en caché. Reintenta en unos minutos.

:::

## Comprobar

:::steps

1. Ejecuta `emet doctor .`. En el host de Codex informa de un `codex` anterior a `codex.minVersion`, de una bandera `--json` o `--output-schema` ausente en `codex exec`, de hooks sin confianza y de un `mattpocock-skills` faltante.
2. Corrige lo que informe con la entrada correspondiente de [Solución de problemas](../troubleshooting.md#host-de-codex) y vuelve a ejecutarlo hasta que no informe fallos.

:::

Límites conocidos: el esfuerzo `ultra` nunca se envía y se rechaza en la configuración, y `codex.sandbox` es `danger-full-access` por defecto para que los workers puedan hacer commit; defínelo como `"workspace-write"` para conservar el sandbox, y los workers entonces no pueden hacer commit. Consulta [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) y el [informe de la sonda](../research/codex-probe-report.md).
