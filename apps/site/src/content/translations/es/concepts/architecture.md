---
title: Arquitectura
description: Un mapa del código de emet/src y cómo lo dirigen los prompts de /emet.
seoTitle: Arquitectura de emet
sourceHash: ac65f41cf78af13e
---

Un mapa del código de `emet/src` y cómo lo dirigen los prompts de `/emet`. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md); las decisiones detrás de esta forma viven en [docs/adr](../adr/README.md). Para los problemas, consulta la [solución de problemas](../troubleshooting.md).

- [Forma](#forma)
- [Cómo los prompts dirigen la CLI](#cómo-los-prompts-dirigen-la-cli)
- [Mapa de módulos](#mapa-de-módulos)
- [Estructura de los prompts](#estructura-de-los-prompts)
- [Distribución](#distribución)
- [Véase también](#véase-también)

## Forma

Hay dos mitades. Los prompts (`commands/run.md`, `agents/*.md`, `emet/reference/*.md`, y los `codex/skills/**` y `codex/hooks.json` generados para Codex) le dicen al agente qué hacer en cada fase. La CLI `emet` (`emet/bin/emet.ts` y `emet/src/`) hace todo lo que debe ser determinista: comprobaciones, reclamaciones, slots, compuertas, escrituras en el tracker y aterrizaje. Los prompts nunca reimplementan una comprobación que la CLI ya realiza.

`emet/bin/emet.ts` es un despachador delgado: lee el primer argumento y delega en un módulo de subcomando, que lee por sí mismo el resto de `process.argv`. Los códigos de salida tienen significado en todos los subcomandos.

## Cómo los prompts dirigen la CLI

`commands/run.md` es un enrutador corto. Carga un archivo de fase de `emet/reference/` a la vez, de modo que una compactación nunca pierde las reglas de la fase actual.

| Fase                                      | Prompt                                                                                        | Llamadas a la CLI                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1-5 entrevista, spec, tickets, aprobación | `phases-1-5.md`                                                                               | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                                         |
| 6-7 despacho y workers                    | `phases-6-7-dispatch.md`, `worker-prompt.md`                                                  | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results`                          |
| 8 revisión, compuerta, aterrizaje, cierre | `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `spec-branch`, `spec-merge`, `cleanup` |
| 9 handoff y encadenamiento                | `phases-9-handoff.md`                                                                         | `status`, `metrics`, `usage`                                                                           |

El coordinador es el único que escribe en el tracker (ADR-0005): los workers informan mediante una nota de handoff y `emet results`, y el coordinador las publica. `emet guard` se ejecuta como un hook `PreToolUse` y bloquea los desencadenantes conocidos de fallos en ejecuciones desatendidas.

## Mapa de módulos

Cada módulo tiene un `*.test.ts` a su lado. `tools/architecture-map.test.ts` falla cuando un módulo no de prueba de `emet/src` falta en esta lista.

**Configuración, instalación y auditoría**

- `init.ts` escribe la configuración y el esqueleto de documentos; `config.ts` lee `emet.config.json` (el `forge.config.json` heredado todavía se lee); `names.ts` resuelve un nombre a su grafía actual o heredada.
- `doctor.ts` es el barrido de flota; `preflight.ts` comprueba la higiene del despacho; `dependencies.ts` y `skills.ts` (el contrato con mattpocock-skills) comprueban lo que necesita una ejecución; `map.ts` escribe el resumen del código; `plugin-detect.ts` informa de qué plugins están instalados.
- `setup.ts` instala los extras opcionales, `setupledger.ts` registra cada cambio para poder deshacerlo y `settingsapply.ts` contiene los ajustes recomendados de Claude Code.
- `self.ts`, `self-install.ts`, `self-source.ts`, `self-types.ts`, `self-update.ts`, `self-host-claude.ts` y `self-host-codex.ts` implementan `emet self`: instalación, instalaciones desde el código fuente, actualizaciones y los archivos de cada host. `hooks-merge.ts` fusiona los hooks de emet en los ajustes del host, `uninstall.ts` deshace una instalación a partir del registro, `migrate.ts` migra los nombres heredados, `update-notice.ts` y `whats-new.ts` informan a la persona de las nuevas versiones, y `embedded-tree.generated.ts` contiene los archivos incrustados en el binario compilado.
- `assets.ts` lee esos archivos incrustados.

**Estado de ejecución**

- `claims.ts` contiene las reservas de tickets, `slots.ts` el pool de slots de workers, `resources.ts` los datos del host, `runs.ts` la actividad y `runcurrent.ts` la ejecución actual de un checkout.
- `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `mergedpr.ts` y `landed.ts` gestionan worktrees, bloqueos y la limpieza de las ramas que aterrizaron.
- `status.ts` informa de oleadas y sesiones, `launch.ts` y `chain.ts` inician ejecuciones y la siguiente oleada de forma desatendida, `fleet.ts` trabaja entre repos y `phase.ts` registra la fase actual.
- `signals.ts` limpia ante una interrupción.

**Tracker y specs**

- `tracker.ts` y `tracker-files.ts` (el tracker local `.scratch/`) leen y escriben tickets, `ticketclose.ts` los cierra, `validate.ts` comprueba la cobertura de la spec, `approve.ts` registra la aprobación y `surfaces.ts` encuentra solapamientos de superficies de edición.
- `specmerge.ts` incorpora los deltas de spec en las specs vivas; `specbranch.ts`, `speclanding.ts` y `specabandon.ts` gestionan la rama `spec/<id>`; `landing-unit.ts` resuelve si una ejecución aterriza por spec o por oleada; `afterspec.ts` y `promote.ts` ejecutan el paso posterior a la spec.

**Handoff del worker**

- `handoff.ts`, `results.ts` y `materializelog.ts` llevan al coordinador lo que informa un worker, y `mailbox.ts` es el buzón propiedad de la CLI para los workers de Codex.

**Revisión y aterrizaje**

- `verify.ts`, `reviewpackage.ts`, `review.ts` (el libro de hallazgos), `review-run.ts` (el revisor de Codex), `assess.ts` (el clasificador de riesgo), `gate.ts`, `land.ts` y `ci.ts` comprueban, revisan y aterrizan una oleada. `deploycheck.ts` ejecuta la comprobación posterior al despliegue.

**Diario, atención e informes**

- `journal.ts` añade eventos e `insights.ts` los lee; `attention.ts` registra el estado de atención de una sesión y `attention-alert.ts` genera la alerta; `metrics.ts` y `usage.ts` informan del coste y los resultados.
- `memory.ts` y `engram-client.ts` buscan y guardan lecciones en Engram.

**Seguridad**

- `guard.ts`, `guard-destructive.ts` y `guard-codex.ts` son los hooks de guard.

**Infraestructura de comandos y utilidades compartidas**

- `commands.ts` describe los comandos y sus flags, `flags.ts` los flags que acepta todo comando, `envelope.ts` la salida `--json`, `errors.ts` los códigos de error, `exit-codes.ts` y `exit-code.ts` los códigos de salida, `env.ts` la vista del entorno, `color.ts` y `banner.ts` la salida de la terminal, y `present.ts`, `narrow.ts` y `optional.ts` pequeñas utilidades de acotación.
- `test-preload.ts` y `expect-rejection.ts` dan soporte a las pruebas.

Los valores específicos de cada host están tras la interfaz `AgentHost` de `agenthost.ts`: `agenthost-claude.ts` es el adaptador de Claude Code y `agenthost-codex.ts` el de Codex, elegidos con `agentHost` en la configuración. El lado de Codex añade `codex-models.ts` (resolución de modelos), `codex-home.ts` (capa `CODEX_HOME` por ejecución), `codex-process.ts` y `codex-session.ts` (ejecutor de procesos y traspaso), `codex-usage.ts` (uso desde `exec --json`), `guard-codex.ts` (entrada de hooks y puerta de aprobación) y `dispatch.ts`. Consulta la [guía de Codex](../how-to/use-codex.md).

## Estructura de los prompts

`commands/run.md` (unas 130 líneas) es el enrutador de `/emet` en Claude Code; en Codex, los `codex/skills/**` y `codex/hooks.json` generados cumplen ese papel. Cada archivo de `emet/reference/` es un grupo de fases (`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `phases-9-handoff.md`), que se carga solo cuando el modo de la ejecución actual lo necesita. Una prueba falla si alguno crece por encima de 20 000 bytes, de modo que un solo archivo no pueda apoderarse del contexto tras una compactación. Las fases le indican al coordinador que vuelva a leer la sección pertinente antes de cada ronda de corrección o revisión. `emet self install` elimina un `phases-8-closeout.md` sobrante que todavía coincide con el manifiesto de instalación y, en caso contrario, lo aparta como `phases-8-closeout.md.retired`; ese archivo se divide en `phases-8-review.md` (revisión y compuerta) y `phases-8-landing.md` (aterrizaje y cierre). `phases-8-spec-landing.md` contiene las reglas de `landing.unit: spec`: integrar cada oleada en `spec/<id>`, sincronizar la rama troncal y aterrizar la spec una vez. `emet self install` también fusiona los hooks de emet, entre ellos `emet guard` como el hook `PreToolUse`, en `~/.claude/settings.json`.

## Distribución

`emet self install` coloca el binario independiente, escribe los prompts reescritos bajo `~/.claude/` y, con `--from <checkout>`, copia el código fuente de `emet/` a `~/.claude/emet`. El plugin de Codex se describe en `.codex-plugin/plugin.json`, generado con `bun run build:codex` junto con `codex/skills/**` y `codex/hooks.json`. La vía del plugin de Claude Code incluye un shim que descarga un binario independiente con suma de verificación, construido por `tools/build-binaries.ts`. Consulta el [ADR-0008](../adr/0008-standalone-binaries-and-plugin-distribution.md).

## Véase también

- [Primeros pasos](../start/install.md) y [Trackers y aterrizaje](../how-to/configure-tracker.md)
- [Referencia de configuración](../reference/configuration.md), [referencia de la CLI](../reference/cli.md) y [Dependencias](../reference/dependencies.md)
- [AGENTS.md](../../AGENTS.md) y [emet/AGENTS.md](../../emet/AGENTS.md)
- [Índice de la documentación](../README.md)
