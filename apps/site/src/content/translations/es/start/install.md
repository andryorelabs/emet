---
title: Primeros pasos
description: Instala emet con la instalación independiente, comprueba que funciona con emet doctor y ejecútalo por primera vez.
seoTitle: Primeros pasos con emet
sourceHash: ce83e38591b3de64
---

Instala emet, comprueba que funciona y ejecútalo por primera vez.

<img src="../brand/mascot/mascot-done.svg" alt="mascota de emet, lista" width="96" align="right">

## Requisitos

Claude Code o la CLI de Codex, `git`, `gh` (autenticado) y el plugin `mattpocock-skills`, en Linux o macOS. Bun solo hace falta para `emet self install --from`; Windows nativo no es compatible (usa WSL). La lista completa, con qué comprueba cada elemento, está en la [referencia de dependencias](../reference/dependencies.md).

## Instalar

Ejecuta el script de arranque en una terminal. No hacen falta Bun, ni un clon, ni sudo:

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh
```

El script se niega a ejecutarse con sudo, descarga el binario independiente y `SHA256SUMS` de tu plataforma a un directorio temporal, verifica la suma (y la atestación cuando `gh` está presente) y solo entonces cede el control a `emet self install`. No se escribe nada si una comprobación falla. No edita el perfil de tu shell; si `~/.local/bin` no está en tu `PATH`, añádelo.

`emet self install` coloca el binario en `~/.local/share/emet/versions/<version>/emet` y lo enlaza desde `~/.local/bin/emet`. Después escribe los archivos de Claude Code: los prompts de referencia en `~/.claude/emet/`, los comandos en `~/.claude/commands/emet/` y los agentes en `~/.claude/agents/`, con los marcadores de posición del plugin reescritos como rutas simples de `~/.claude`. Fusiona los hooks de emet en `~/.claude/settings.json` tras una copia de seguridad y deja intactos los hooks ajenos. Cuando Codex está presente, también escribe las skills de emet en `~/.agents/skills/emet/` y añade los hooks de emet a `$CODEX_HOME/hooks.json` (por defecto `~/.codex`); nunca escribe `config.toml`. Volver a ejecutarlo es seguro, y un archivo que hayas editado se conserva, con la nueva versión escrita al lado como `<file>.new`.

Para previsualizar cada escritura sin hacer ninguna, pasa `--dry-run`. Los argumentos después de `sh -s --` llegan a `emet self install`:

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh -s -- --dry-run
```

También puedes fijar una versión, como en `sh -s -- 1.2.3`; por defecto es `latest`. Para instalar desde un checkout, ejecuta `emet self install --from <checkout>`; necesita `bun` y mantiene funcionando `emet selftest`.

### Codex

Cuando Codex está presente, `emet self install` imprime un paso único: abre `/hooks` en Codex y pulsa `t` en la página de eventos para confiar en los hooks de emet (o aprueba el aviso "Hooks need review" al iniciar). Hasta entonces el emet guard no se ejecuta. Consulta [Ejecutar emet en Codex](codex.md#instalación).

### Actualización automática

Un hook `SessionStart` ejecuta `emet self update --auto` como máximo una vez al día, desacoplado y en silencio cuando no hay conexión. Verifica la suma, deja preparada la nueva versión y cambia el enlace simbólico solo cuando no hay ningún slot de worker retenido; de lo contrario la actualización queda pendiente hasta el siguiente inicio de sesión. La versión anterior se conserva para volver atrás. Para desactivarla, define `EMET_AUTO_UPDATE=0` o ejecuta `emet self update --auto off`; `emet self update --auto on` la vuelve a activar. Consulta [Actualizar emet](../how-to/update-emet.md).

### Desinstalar

```bash
emet uninstall --dry-run     # list what would be removed
emet uninstall
```

Elimina el directorio de versiones, el enlace simbólico `~/.local/bin/emet`, el archivo de estado de la instalación, las skills de Codex y todo hook de emet en ambos archivos de hooks, y revierte los extras que registró `emet setup`. Se conservan un archivo de comandos que hayas editado y los hooks ajenos. Consulta la [referencia de la CLI](../reference/cli.md#registro-de-setup-y-restauración).

### Opcional: plugins

En lugar de la instalación independiente, o para el opcional `emet-mascot`, puedes instalar emet como plugin. `emet self install` se niega mientras el plugin de emet esté instalado y explica cómo quitarlo; `--force` continúa de todos modos, y `emet doctor` avisa cuando ambos coexisten. Lo que incluye un plugin depende del host del agente. En Claude Code trae `/emet:run`, los agentes, los hooks de protección y un shim `emet` que descarga un binario independiente con suma de verificación en el primer uso. El plugin de Codex incluye las skills `$emet:run`, `$emet:init` y `$emet:doctor` y un hook, pero ningún agente ni shim `emet`.

:::install-tabs

```bash tab="Claude Code"
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

```bash tab="Codex"
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

:::

Toda instalación te da los mismos tres puntos de entrada. En Claude Code son los comandos de barra `/emet:run`, `/emet:init` y `/emet:doctor`; en Codex son las skills `$emet:run`, `$emet:init` y `$emet:doctor`. La instalación independiente también pone `emet` en tu `PATH`, así que `emet init` y `emet doctor .` funcionan en una terminal normal; con solo un plugin, usa los comandos de barra, o `! emet <subcommand>` dentro de una sesión de Claude Code o de Codex. En Claude Code los nombres de los agentes difieren: `emet:emet-worker` en el plugin, `emet-worker` en la instalación independiente; Codex no tiene agentes de emet, porque cada worker es su propio proceso `codex exec`.

Orden recomendado, en cada repositorio: ejecuta primero la skill `setup-matt-pocock-skills` (`/setup-matt-pocock-skills` en Claude Code; en Codex, la misma skill del plugin `mattpocock-skills` con la sintaxis `$` de Codex) y luego `emet init`.

Verifica que funcionó con `/emet:doctor` dentro de Claude Code (`$emet:doctor` en Codex), o con `emet doctor .` en una terminal (`selftest` requiere una instalación con `--from` desde el código fuente).

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
