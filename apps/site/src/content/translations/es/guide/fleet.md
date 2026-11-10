---
title: Revisión de flota
description: Audita varios repositorios a la vez con emet doctor, en modo de solo lectura, y mira cuáles necesitan atención.
seoTitle: Revisión de flota con emet doctor
sourceHash: efeca623ade98bf1
---

¿Ya usas emet en varios repositorios? `emet doctor` audita cualquier cantidad de ellos a la vez, en modo de solo lectura:

```bash
emet doctor ~/code/*
```

Informa, por repositorio: un `emet.config.json` válido, los cuatro archivos `docs/agents/*.md` presentes, cero marcadores `TODO(emet):` pendientes, si los comandos de `commands.selfCheck` realmente se resuelven y los hallazgos de dependencias propios del tracker de ese repositorio (`gh`, Linear; consulta la [referencia de dependencias](../reference/dependencies.md)). El plugin mattpocock-skills y las banderas de las CLI externas (`gh`, más las propias de la CLI del Agent host: en Claude Code `claude --bg` y `claude agents --json`, en Codex `codex exec --json` y `--output-schema`, todas verificadas mediante `--help`) se comprueban una sola vez para todo el barrido, no por repositorio.

`emet doctor` comprueba las banderas mismas, no solo que existan los binarios. Lee `--help` de `gh issue view`/`gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`) y, en Claude Code, `claude` (`--bg`) y `claude agents` (`--json`), e informa cualquier bandera que una CLI más nueva o más antigua ya no documente. Una bandera renombrada, de otro modo, haría fallar una oleada a mitad de camino. Las comprobaciones de `claude` y `claude agents` son las del host de Claude Code. En el host de Codex las comprobaciones de banderas del host las reemplazan en lugar de sumarse a ellas: `emet doctor` comprueba `codex exec` en busca de `--json` y `--output-schema` (`hostCliFlagRequirements` en `emet/src/doctor.ts`). No compara la versión de `codex` con `codex.minVersion`; consulta [Ejecutar emet en Codex](codex.md).

Cada sondeo se limita a 5 s para que un `gh auth status` detenido (sin red) no pueda colgar una oleada. El `preflight.requiredCommands` de un repositorio es una lista, propiedad del repositorio, de binarios que `emet preflight` y `emet doctor` exigen en el PATH. Consulta la [referencia de la CLI](../reference/cli.md#revisión-de-flota) y la [referencia de configuración](../reference/configuration.md#preflight).
