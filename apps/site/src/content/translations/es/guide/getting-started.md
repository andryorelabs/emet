---
title: Primeros pasos
description: Instala emet como plugin de Claude Code, comprueba que funciona con emet doctor y ejecútalo por primera vez.
seoTitle: Primeros pasos con emet
sourceHash: 381754ac3b3a0479
---

Instala emet, comprueba que funciona y ejecútalo por primera vez.

<img src="../brand/mascot/mascot-done.svg" alt="mascota de emet, lista" width="96" align="right">

## Requisitos

Claude Code o la CLI de Codex, `git`, `gh` (autenticado) y el plugin `mattpocock-skills`, en Linux o macOS. Bun solo hace falta para una instalación desde el código fuente; Windows nativo no es compatible (usa WSL). La lista completa, con qué comprueba cada elemento, está en la [referencia de dependencias](../reference/dependencies.md).

## Instalar

Hay dos formas de instalar.

**Plugin** (sin Bun). Agrega este repositorio como marketplace e instala el plugin `emet`; trae `/emet:run`, los agentes, los hooks de protección y un shim `emet` que descarga un binario independiente con suma de verificación en el primer uso.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

En Codex, instala el plugin con `codex plugin`; los pasos están en [Ejecutar emet en Codex](codex.md#instalación).

**`install.sh`** (funciona con o sin Bun):

```bash
git clone git@github.com:andryorelabs/emet.git
cd emet
./install.sh
```

Con `bun` en el PATH copia el código fuente de la CLI a `~/.claude/emet` y un contenedor `emet` a `~/.local/bin/emet`. Sin `bun` instala en su lugar el shim del binario independiente (`~/.local/bin/emet`, enlazado a `~/.claude/emet/bin/emet`), que descarga y verifica la suma del binario en la primera ejecución (requiere `curl`). En ambos casos los comandos quedan en `~/.claude/commands/emet/` y los agentes en `~/.claude/agents/`; los marcadores de posición del plugin en los prompts se reescriben como rutas simples de `~/.claude`. Volver a ejecutarlo es seguro, y un archivo que hayas editado se conserva, con la nueva versión escrita al lado como `<file>.new`.

Ambas instalaciones te dan tres comandos de barra: `/emet:run`, `/emet:init` y `/emet:doctor`. El comando `emet` en una terminal normal funciona solo después de `install.sh`; de lo contrario, usa los comandos de barra, o `! emet <subcommand>` dentro de una sesión de Claude Code o de Codex. Los nombres de los agentes difieren: `emet:emet-worker` en el plugin, `emet-worker` en la instalación independiente.

Orden recomendado, en cada repositorio: ejecuta primero `/setup-matt-pocock-skills` y luego `emet init`.

Verifica que funcionó con `/emet:doctor` dentro de Claude Code (`$emet:doctor` en Codex), o con `emet doctor .` en una terminal después de `install.sh` (`selftest` requiere una instalación desde el código fuente).

Si `doctor` o `preflight` informan un problema, consulta la [solución de problemas](../troubleshooting.md). Nunca se instala nada ni se inicia sesión en tu nombre; consulta la [referencia de dependencias](../reference/dependencies.md) para saber quién comprueba qué y para `EMET_SKIP_DEPENDENCY_CHECKS`.

## Primera ejecución

En cualquier repositorio git:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

Dentro de una sesión, `/emet:init` hace lo mismo que `emet init`. Luego, dentro de Claude Code (en Codex, usa `$emet:run` en lugar de `/emet:run`):

```
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

`emet init` deja un marcador `TODO(emet):` en los archivos `docs/agents/*.md` generados para todo lo que no puede inferir por sí mismo (un bloqueo compartido de la base de datos de pruebas, la propiedad del esquema, etc.); complétalos. `emet preflight` se niega a despachar mientras quede alguno.

## Siguiente

- [Trackers y aterrizaje](trackers-and-landing.md): tickets de GitHub, Linear o locales, y cómo aterriza una oleada.
- [Ejecutar emet en Codex](codex.md): instalación, la aprobación única y los límites en el Agent host de Codex.
- [Modelos y esfuerzo](models-and-effort.md): qué modelo y esfuerzo usa cada rol.
- [Revisión de flota](fleet.md): audita varios repositorios a la vez.
- [Referencia de configuración](../reference/configuration.md) y [referencia de la CLI](../reference/cli.md): cada clave y subcomando.
