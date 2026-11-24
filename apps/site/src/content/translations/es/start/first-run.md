---
title: Primera ejecución
description: Comprueba la instalación con emet doctor y ejecuta emet por primera vez.
seoTitle: Primera ejecución de emet
sourceHash: 7daec76e45f50b8c
---

Comprueba la instalación con `emet doctor` y ejecuta emet por primera vez. Instala emet primero; consulta [Instalar](install.md).

## Requisitos previos

- emet instalado, con `emet` en tu `PATH`.
- Un repositorio git con `gh` autenticado.
- En Claude Code o Codex, el plugin `mattpocock-skills`.

## Pasos

En cada repositorio, ejecuta primero la skill `setup-matt-pocock-skills` (`/setup-matt-pocock-skills` en Claude Code; en Codex, la misma skill del plugin `mattpocock-skills` con la sintaxis `$` de Codex). Luego, en cualquier repositorio git:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight     # confirms the repo is dispatch-ready
```

Dentro de una sesión, `/emet:init` hace lo mismo que `emet init` (`$emet:init` en Codex). `emet init` deja un marcador `TODO(emet):` en los archivos `docs/agents/*.md` generados para todo lo que no puede inferir por sí mismo, como un bloqueo compartido de la base de datos de pruebas o la propiedad del esquema; complétalos. `emet preflight` se niega a despachar mientras quede alguno.

Luego ejecuta emet dentro de Claude Code (en Codex, usa `$emet:run` en lugar de `/emet:run`):

```
/emet:run <describe the feature>              # interview, then wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## Comprueba el resultado

Ejecuta `emet doctor .` en una terminal, o `/emet:doctor` dentro de Claude Code (`$emet:doctor` en Codex). Informa primero de los fallos. Si `doctor` o `preflight` informan un problema, consulta la [solución de problemas](../troubleshooting.md). Nunca se instala nada ni se inicia sesión en tu nombre; la [referencia de dependencias](../reference/dependencies.md) explica quién comprueba qué y documenta `EMET_SKIP_DEPENDENCY_CHECKS`.

## Siguiente

- [Trackers y aterrizaje](../how-to/configure-tracker.md): GitHub, Linear o tickets locales, y cómo aterriza una spec.
- [Ejecutar emet en Codex](../how-to/use-codex.md): la aprobación única y los límites en el Agent host de Codex.
- [Modelos y esfuerzo](../how-to/choose-models.md): qué modelo y esfuerzo usa cada rol.
- [Revisión de flota](../how-to/check-a-fleet.md): audita varios repositorios a la vez.
- [Referencia de configuración](../reference/configuration.md) y [referencia de la CLI](../reference/cli.md): cada clave y subcomando.
