---
title: Arquitectura
description: Un mapa del código de emet/src y cómo lo dirigen los prompts de /emet.
seoTitle: Arquitectura de emet
sourceHash: 3145bbde94eade03
---

Un mapa del código de `emet/src` y cómo lo dirigen los prompts de `/emet`. Los términos siguen [GLOSSARY.md](../GLOSSARY.md); las decisiones detrás de esta forma viven en [docs/adr](adr/README.md). Para los problemas, consulta la [solución de problemas](troubleshooting.md).

- [Forma](#forma)
- [Cómo los prompts dirigen la CLI](#cómo-los-prompts-dirigen-la-cli)
- [Mapa de módulos](#mapa-de-módulos)
- [Estructura de los prompts](#estructura-de-los-prompts)
- [Distribución](#distribución)
- [Véase también](#véase-también)

## Forma

Hay dos mitades. Los prompts (`commands/run.md`, `agents/*.md`, `emet/reference/*.md`) le dicen a Claude qué hacer en cada fase. La CLI `emet` (`emet/bin/emet.ts` y `emet/src/`) hace todo lo que debe ser determinista: comprobaciones, reclamaciones, slots, compuertas, escrituras en el tracker y aterrizaje. Los prompts nunca reimplementan una comprobación que la CLI ya realiza.

`emet/bin/emet.ts` es un despachador delgado: lee el primer argumento y delega en un módulo de subcomando, que lee por sí mismo el resto de `process.argv`. Los códigos de salida tienen significado en todos los subcomandos.

## Cómo los prompts dirigen la CLI

`commands/run.md` es un enrutador corto. Carga un archivo de fase de `emet/reference/` a la vez, de modo que una compactación nunca pierde las reglas de la fase actual.

| Fase                                      | Prompt                                       | Llamadas a la CLI                                                             |
| ----------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| 1-5 entrevista, spec, tickets, aprobación | `phases-1-5.md`                              | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                |
| 6-7 despacho y workers                    | `phases-6-7-dispatch.md`, `worker-prompt.md` | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results` |
| 8 revisión, compuerta, aterrizaje, cierre | `phases-8-closeout.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `cleanup`     |
| 9 handoff y encadenamiento                | `phases-9-handoff.md`                        | `status`, `metrics`, `usage`, `spec-merge`                                    |

El coordinador es el único que escribe en el tracker (ADR-0005): los workers informan mediante una nota de handoff y `emet results`, y el coordinador las publica. `emet guard` se ejecuta como un hook `PreToolUse` y bloquea los desencadenantes conocidos de fallos en ejecuciones sin supervisión.

## Mapa de módulos

Cada módulo tiene un `*.test.ts` a su lado.

| Área                      | Módulos                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Configuración y auditoría | `init.ts` (configuración y esqueleto de documentos), `config.ts` (`emet.config.json`, el `forge.config.json` heredado todavía se lee), `doctor.ts` (barrido de flota), `preflight.ts` (higiene del despacho), `dependencies.ts`, `skills.ts` (contrato con mattpocock-skills), `map.ts` (resumen del código) |
| Estado de ejecución       | `claims.ts` (reservas de tickets), `slots.ts` (pool de slots de workers), `resources.ts` (datos del host), `runs.ts` (actividad), `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `status.ts`, `launch.ts`                                                                         |
| Tracker                   | `tracker.ts`, `tracker-files.ts` (tracker local `.scratch/`), `validate.ts` (cobertura de la spec), `specmerge.ts`, `approve.ts`, `surfaces.ts` (solapamiento de superficies de edición)                                                                                                                     |
| Handoff del worker        | `handoff.ts`, `results.ts`, `materializelog.ts`                                                                                                                                                                                                                                                              |
| Revisión y aterrizaje     | `verify.ts`, `reviewpackage.ts`, `review.ts` (libro de hallazgos), `assess.ts` (clasificador de riesgo), `gate.ts`, `land.ts`                                                                                                                                                                                |
| Informes                  | `metrics.ts`, `usage.ts`                                                                                                                                                                                                                                                                                     |
| Seguridad                 | `guard.ts`, `guard-destructive.ts`                                                                                                                                                                                                                                                                           |
| Utilidades compartidas    | `narrow.ts`, `optional.ts`, `assets.ts` (archivos incrustados en los binarios compilados)                                                                                                                                                                                                                    |

Los valores específicos de cada host están tras la interfaz `AgentHost` de `agenthost.ts`: `agenthost-claude.ts` es el adaptador de Claude Code y `agenthost-codex.ts` el de Codex, elegidos con `agentHost` en la configuración. El lado de Codex añade `codex-models.ts` (resolución de modelos), `codex-home.ts` (capa `CODEX_HOME` por ejecución), `codex-process.ts` y `codex-session.ts` (ejecutor de procesos y traspaso), `codex-usage.ts` (uso desde `exec --json`), `guard-codex.ts` (entrada de hooks y puerta de aprobación), `dispatch.ts` y `review-run.ts`. Consulta la [guía de Codex](guide/codex.md).

## Estructura de los prompts

`commands/run.md` (unas 130 líneas) es el enrutador de `/emet`. Cada archivo de `emet/reference/` es un grupo de fases (`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-closeout.md`, `phases-9-handoff.md`), que se carga solo cuando el modo de la ejecución actual lo necesita. Una prueba falla si alguno crece por encima de 20 000 bytes, de modo que un solo archivo no pueda apoderarse del contexto tras una compactación. Las fases le indican al coordinador que vuelva a leer la sección pertinente antes de cada ronda de corrección o revisión. `install.sh` aparta un antiguo `phases-6-9.md` único como `phases-6-9.md.retired` cuando lo editaste o es anterior al manifiesto de instalación, y lo elimina en caso contrario. `install.sh` también conecta `emet guard` en `~/.claude/settings.json` como el hook `PreToolUse`.

## Distribución

`install.sh` copia `emet/` a `~/.claude/emet` y reescribe los prompts. La vía del plugin incluye un shim que descarga un binario independiente con suma de verificación, construido por `tools/build-binaries.ts`. Consulta el [ADR-0008](adr/0008-standalone-binaries-and-plugin-distribution.md).

## Véase también

- [Primeros pasos](guide/getting-started.md) y [Trackers y aterrizaje](guide/trackers-and-landing.md)
- [Referencia de configuración](reference/configuration.md), [referencia de la CLI](reference/cli.md) y [Dependencias](reference/dependencies.md)
- [AGENTS.md](../AGENTS.md) y [emet/AGENTS.md](../emet/AGENTS.md)
- [Índice de la documentación](README.md)
