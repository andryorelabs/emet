---
title: Solución de problemas
description: Fallos de emet doctor y emet preflight, agrupados por lo que ves, cada uno con su causa y una solución.
seoTitle: Solución de problemas de emet doctor y preflight
sourceHash: dd82e980da9568d5
---

Fallos de `emet doctor` y `emet preflight`, agrupados por lo que ves, cada uno con su causa y una solución. Los términos siguen [GLOSSARY.md](../GLOSSARY.md). Para saber cómo encajan las comprobaciones, consulta la [arquitectura](architecture.md).

<img src="brand/mascot/mascot-error.svg" alt="" width="96">

Un repositorio que todavía tiene solo `forge.config.json`, `.forge/` o variables `FORGE_*` sigue funcionando: `emet` lee los nombres heredados, imprime una línea por stderr que nombra cada archivo heredado, y `emet migrate` los renombra.

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
- [Véase también](#véase-también)

## No hay emet.config.json

**Síntoma:** `emet doctor` imprime `no emet.config.json — run "emet init" here`.

**Causa:** El repositorio todavía no tiene configuración de `/emet`.

**Solución:** Ejecuta `emet init` en la raíz del repositorio, luego revisa la configuración generada y completa los archivos de `docs/agents/`.

## emet.config.json está mal formado

**Síntoma:** `emet.config.json is malformed: <reason>`; `emet preflight` termina con código 2.

**Causa:** La configuración es JSON estricto y se valida contra `emet/schema/emet.config.schema.json`. Se rechazan los comentarios y las comas finales.

**Solución:** Corrige el campo que nombra el motivo, o regenera con `emet init --force`.

## docs/agents aún tiene marcadores TODO(emet)

**Síntoma:** `docs/agents/ still has N TODO(emet): marker(s)`; `emet doctor` también informa un `docs/agents/<file>` ausente.

**Causa:** `emet init` deja un marcador dondequiera que no puede detectar un valor.

**Solución:** Completa cada línea marcada, o resuélvelas y ejecuta `emet init --force`. Preflight se niega a despachar mientras quede alguno.

## Falla una comprobación de dependencias

**Síntoma:** Líneas `dependency: ...` en `emet doctor`, o un fallo de dependencia bloqueante en `emet preflight` (por ejemplo `gh` ausente o sin autenticar, o el plugin mattpocock-skills ausente o en una versión no probada).

**Causa:** `/emet` necesita `git`, `gh` y el plugin mattpocock-skills; consulta `emet/src/dependencies.ts` y `emet/src/skills.ts`.

**Solución:** Instala o autentica la herramienta, o ejecuta `/setup-matt-pocock-skills`. Si una comprobación es errónea para tu entorno, `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` la degrada a una advertencia.

## ya no documenta una bandera en --help

**Síntoma:** `<tool> no longer documents <flags> in --help — emet relies on it`, o `could not be run — cannot verify <flags>`.

**Causa:** `emet doctor` comprueba las banderas de las que depende `emet`, no solo que exista el binario. La versión instalada eliminó o renombró una.

**Solución:** Instala una versión de la herramienta que todavía documente la bandera.

## Falta un archivo instalado o se editó desde la instalación

**Síntoma:** `~/<path> is missing — re-run install.sh` o `~/<path> was edited since install`.

**Causa:** La copia instalada ya no coincide con el manifiesto de instalación.

**Solución:** Vuelve a ejecutar `install.sh`. Si existe un archivo `.new` pendiente junto a un archivo editado, fusiónalo o elimínalo.

## Stop hook error: forge: No such file or directory

**Síntoma:** Claude Code imprime `Stop hook error: … forge: No such file or directory` (o lo mismo para `emet`) al final de cada turno.

**Causa:** `~/.claude/settings.json` todavía tiene un hook `forge guard` o `emet guard` cuyo binario se movió o se eliminó.

**Solución:** Ejecuta `emet doctor .`. Lista cada hook guard muerto con su evento e imprime un comando `cp … && jq …` que respalda `settings.json` y elimina solo esos hooks. Doctor nunca edita el archivo por sí mismo.

## No hay slots de worker libres

**Síntoma:** `No free worker slots at all: 0 free out of N`, o `only K/N worker slot(s) free`.

**Causa:** Cada slot en `~/.local/state/emet/slots` está en manos de una ejecución viva o inactiva, por lo que la oleada no puede despacharse por completo.

**Solución:** Espera a que una ejecución libere un slot, o ejecuta `emet cleanup --run <runId>` para una ejecución que sepas que terminó. `emet status` muestra quién tiene qué.

## Se esperaban worktrees bloqueados, hay menos

<img src="brand/mascot/mascot-sleep.svg" alt="" width="64">

**Síntoma:** `Expected N locked worktree(s) for run <id>, found M`.

**Causa:** Los workers no reclamaron su worktree con el motivo de bloqueo, o `isolation: "worktree"` los colocó en otro lugar. Consulta [`incidents.md`](../emet/reference/incidents.md).

**Solución:** Revisa `git worktree list --porcelain` para ver las entradas bloqueadas, y `emet lock-reason` para el formato de motivo esperado.

## Un ticket está reclamado por varios worktrees o ramas

**Síntoma:** `<ticket> is claimed by N worktrees`, `has N branches`, o `is checked out on branch ..., but its own lock names ticket ...`.

**Causa:** Un reintento o un shell mal enrutado dejó un duplicado.

**Solución:** Conserva el worktree o la rama canónicos, elimina o vuelve a bloquear el resto, y luego ejecuta de nuevo `emet preflight`.

## requiredCommands no está en el PATH

**Síntoma:** `preflight.requiredCommands not on PATH: <names>`.

**Causa:** `preflight.requiredCommands` en `emet.config.json` lista binarios que el repositorio necesita.

**Solución:** Instala los binarios nombrados, o quítalos de la configuración si ya no se necesitan.

## Véase también

- [Índice de la documentación](README.md)
- [README](../README.md)
- [Primeros pasos](guide/getting-started.md)
- [Referencia de configuración](reference/configuration.md)
- [Referencia de dependencias](reference/dependencies.md)
