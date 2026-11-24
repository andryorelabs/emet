---
title: Solución de problemas
description: Fallos de emet doctor y emet preflight, agrupados por lo que ves, cada uno con su causa y los pasos para solucionarlo.
seoTitle: Solución de problemas de emet doctor y preflight
sourceHash: 459018815038cdc0
---

Soluciona los fallos de `emet doctor` y `emet preflight`, agrupados por lo que ves, cada uno con su causa y los pasos para solucionarlo. Los términos siguen [GLOSSARY.md](../GLOSSARY.md). Para saber cómo encajan las comprobaciones, consulta la [arquitectura](concepts/architecture.md).

<img src="brand/mascot/mascot-error.svg" alt="" width="96">

Un repositorio que todavía tiene solo `forge.config.json`, `.forge/` o variables `FORGE_*` sigue funcionando: `emet` lee los nombres heredados, imprime una línea por stderr que nombra cada archivo heredado, y `emet migrate` los renombra.

- [Requisitos previos](#requisitos-previos)
- [No hay emet.config.json](#no-hay-emetconfigjson)
- [emet.config.json está mal formado](#emetconfigjson-está-mal-formado)
- [docs/agents aún tiene marcadores TODO(emet)](#docsagents-aún-tiene-marcadores-todoemet)
- [Falla una comprobación de dependencias](#falla-una-comprobación-de-dependencias)
- [ya no documenta una bandera en --help](#ya-no-documenta-una-bandera-en---help)
- [Falta un archivo instalado o se editó desde la instalación](#falta-un-archivo-instalado-o-se-editó-desde-la-instalación)
- [Stop hook error: forge: No such file or directory](#stop-hook-error-forge-no-such-file-or-directory)
- [No hay slots de worker libres](#no-hay-slots-de-worker-libres)
- [Se esperaban worktrees bloqueados, hay menos](#se-esperaban-worktrees-bloqueados-hay-menos)
- [Un ticket está reclamado por varios worktrees o ramas](#un-ticket-está-reclamado-por-varios-worktrees-o-ramas)
- [requiredCommands no está en el PATH](#requiredcommands-no-está-en-el-path)
- [Host de Codex](#host-de-codex)
- [Comprobación](#comprobación)
- [Véase también](#véase-también)

## Requisitos previos

- `emet` en el `PATH`; consulta [Instalar](start/install.md).
- Una shell en la raíz del repositorio con el problema.
- El mensaje exacto de `emet doctor .` o `emet preflight`: búscalo en la lista de arriba.

## No hay emet.config.json

**Síntoma:** `emet doctor` imprime `no emet.config.json — run "emet init" here`.

**Causa:** El repositorio todavía no tiene configuración de `/emet`.

**Solución:**

1. Ejecuta `emet init` en la raíz del repositorio.
2. Revisa la configuración generada y completa los archivos de `docs/agents/`.

## emet.config.json está mal formado

**Síntoma:** `emet.config.json is malformed: <reason>`; `emet preflight` termina con código 2.

**Causa:** La configuración es JSON estricto y se valida contra `emet/schema/emet.config.schema.json`. Se rechazan los comentarios y las comas finales.

**Solución:**

1. Corrige el campo que nombra el motivo.
2. O regenera la configuración con `emet init --force`.

## docs/agents aún tiene marcadores TODO(emet)

**Síntoma:** `docs/agents/ still has N TODO(emet): marker(s)`; `emet doctor` también informa un `docs/agents/<file>` ausente.

**Causa:** `emet init` deja un marcador dondequiera que no puede detectar un valor.

**Solución:**

1. Completa cada línea marcada, o resuélvelas y ejecuta `emet init --force`.
2. Ejecuta `emet preflight`; se niega a despachar mientras quede algún marcador.

## Falla una comprobación de dependencias

**Síntoma:** Líneas `dependency: ...` en `emet doctor`, o un fallo de dependencia bloqueante en `emet preflight` (por ejemplo `gh` ausente o sin autenticar, o el plugin mattpocock-skills ausente o en una versión no probada).

**Causa:** `/emet` necesita `git`, `gh` y el plugin mattpocock-skills; consulta `emet/src/dependencies.ts` y `emet/src/skills.ts`.

**Solución:**

1. Instala o autentica la herramienta, o ejecuta la skill `setup-matt-pocock-skills` (`/setup-matt-pocock-skills` en Claude Code, la misma skill con la sintaxis `$` de Codex en Codex).
2. Si una comprobación es errónea para tu entorno, ejecuta `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` para degradarla a una advertencia.

## ya no documenta una bandera en --help

**Síntoma:** `<tool> no longer documents <flags> in --help — emet relies on it`, o `could not be run — cannot verify <flags>`.

**Causa:** `emet doctor` comprueba las banderas de las que depende `emet`, no solo que exista el binario. La versión instalada eliminó o renombró una.

**Solución:** Instala una versión de la herramienta que todavía documente la bandera.

## Falta un archivo instalado o se editó desde la instalación

**Síntoma:** `~/<path> is missing — re-run emet self install` o `~/<path> was edited since install`.

**Causa:** La copia instalada ya no coincide con el manifiesto de instalación.

**Solución:**

1. Vuelve a ejecutar `emet self install` (desde un checkout del código fuente, `emet self install --from .`).
2. Si existe un archivo `.new` pendiente junto a un archivo editado, fusiónalo o elimínalo.

## Stop hook error: forge: No such file or directory

**Síntoma:** Claude Code imprime `Stop hook error: … forge: No such file or directory` (o lo mismo para `emet`) al final de cada turno.

**Causa:** `~/.claude/settings.json` todavía tiene un hook `forge guard` o `emet guard` cuyo binario se movió o se eliminó.

**Solución:**

1. Ejecuta `emet doctor .`. Lista cada hook guard muerto con su evento.
2. Ejecuta el único comando `cp … && jq …` que imprime; respalda `settings.json` y elimina solo esos hooks. Doctor nunca edita el archivo por sí mismo.

## No hay slots de worker libres

**Síntoma:** `No free worker slots at all: 0 free out of N`, o `only K/N worker slot(s) free`.

**Causa:** Cada slot en `~/.local/state/emet/slots` está en manos de una ejecución viva o inactiva, por lo que la oleada no puede despacharse por completo.

**Solución:**

1. Ejecuta `emet status` para ver quién tiene cada slot.
2. Espera a que una ejecución libere un slot, o ejecuta `emet cleanup --run <runId>` para una ejecución que sepas que terminó.

## Se esperaban worktrees bloqueados, hay menos

<img src="brand/mascot/mascot-sleep.svg" alt="" width="64">

**Síntoma:** `Expected N locked worktree(s) for run <id>, found M`.

**Causa:** Los workers no reclamaron su worktree con el motivo de bloqueo, o `isolation: "worktree"` los colocó en otro lugar. Consulta [`incidents.md`](../emet/reference/incidents.md).

**Solución:**

1. Ejecuta `git worktree list --porcelain` y revisa las entradas bloqueadas.
2. Ejecuta `emet lock-reason` para ver el formato de motivo esperado y vuelve a bloquear con él el worktree de un worker.

## Un ticket está reclamado por varios worktrees o ramas

**Síntoma:** `<ticket> is claimed by N worktrees`, `has N branches`, o `is checked out on branch ..., but its own lock names ticket ...`.

**Causa:** Un reintento o un shell mal enrutado dejó un duplicado.

**Solución:**

1. Conserva el worktree o la rama canónicos.
2. Elimina o vuelve a bloquear el resto.
3. Vuelve a ejecutar `emet preflight`.

## requiredCommands no está en el PATH

**Síntoma:** `preflight.requiredCommands not on PATH: <names>`.

**Causa:** `preflight.requiredCommands` en `emet.config.json` lista binarios que el repositorio necesita.

**Solución:**

1. Instala los binarios nombrados.
2. O quítalos de `preflight.requiredCommands` si ya no se necesitan.

## Host de Codex

Esto aplica cuando `agentHost` es `"codex"`. Consulta [Ejecutar emet en Codex](how-to/use-codex.md).

**Un `codex` anterior a `codex.minVersion`.** `emet doctor .` lo informa. Instala la CLI `codex` en la versión de `codex.minVersion` (por defecto `0.167.0`) o posterior y vuelve a ejecutar `emet doctor .`.

**Falta la bandera `--json` o `--output-schema`.** `emet doctor .` informa de un `codex exec` que no documenta alguna de las dos banderas; emet depende de ambas para iniciar workers y revisores. Instala una versión de `codex` que aún las documente.

**Un modelo configurado no aparece en la lista.** emet resuelve los modelos contra `models_cache.json` en el home de la ejecución y, si no, en tu home real de Codex (solo lectura). Un slug que no aparece se sustituye y la sustitución se registra. Si nada se resuelve, `emet review-run` falla antes de la llamada al modelo, nombrando el rol y los slugs listados. Define un slug listado en `codex.models`; consulta la [referencia de configuración](reference/configuration.md#codex).

## Comprobación

1. Ejecuta `emet doctor .` y confirma que no informa ningún fallo del problema que solucionaste.
2. Ejecuta `emet preflight` y confirma que termina con código 0.

## Véase también

- [Índice de la documentación](README.md)
- [README](../README.md)
- [Primeros pasos](start/install.md)
- [Referencia de configuración](reference/configuration.md)
- [Referencia de dependencias](reference/dependencies.md)
