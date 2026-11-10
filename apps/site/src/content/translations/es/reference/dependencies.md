---
title: Dependencias
description: Qué necesita emet en la máquina y qué comando comprueba cada elemento.
seoTitle: Dependencias de emet
sourceHash: 50444429c7883bd3
---

Qué necesita emet en la máquina y qué comando comprueba cada elemento. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md). Volver al [README](../../README.md).

## Obligatorias

- **[bun](https://bun.sh)**: solo para instalaciones desde el código fuente. El binario independiente no necesita ningún runtime.
- **`rsync`** y **`sha256sum` o `shasum`**: los exige `install.sh`.
- **`git`**: obligatorio en tiempo de ejecución. Casi todos los subcomandos lo invocan.
- **CLI `gh`, autenticada**: obligatoria cuando el tracker es `github` o el aterrizaje es `pr`. Los PR siempre la usan. Con `tracker.kind: "local"` y `landing.mode: "merge"`, `gh` no es obligatoria.
- **El plugin `mattpocock-skills`** (marketplace `claude-plugins-official`): las fases de entrevista, spec y tickets de `/emet` llaman a skills que viven allí.

  ```bash
  claude plugin marketplace add anthropics/claude-plugins-official
  claude plugin install mattpocock-skills@claude-plugins-official
  ```

- **Los agentes `emet-worker` y `emet-reviewer`** en `~/.claude/agents/`: los instala `install.sh`. La fase 6 y la fase 8 despachan por `subagent_type`, así que si falta cualquiera de los dos, el despacho se rompe. Consulta [Models & effort](../../README.md#models--effort).
- **Un servidor MCP de Linear declarado en `.mcp.json` (o en el ámbito de usuario)**: solo si el repositorio usa el tracker `linear`. emet verifica la declaración. Que la conexión esté autenticada depende del almacén de credenciales propio de Claude Code y no se puede comprobar desde aquí. Si una ejecución no logra leer los tickets, reinicia Claude Code y aprueba la conexión.

Nada de lo anterior se instala ni se inicia sesión en tu nombre. Lo que cambia es quién lo comprueba y con qué rigor.

## Host de Codex

Solo cuando `agentHost` es `"codex"`; consulta la [guía de Codex](../guide/codex.md). Los agentes `emet-worker` y `emet-reviewer` no se usan ahí.

- **La CLI `codex`**, con sesión iniciada, en la versión `codex.minVersion` (por defecto `0.167.0`) o posterior. `emet doctor` informa de una versión anterior y comprueba que `codex exec --help` liste `--json` y `--output-schema`.
- **El plugin `mattpocock-skills`** en Codex, comprobado con `codex plugin list`:

  ```bash
  codex plugin marketplace add mattpocock/skills
  codex plugin add mattpocock-skills@mattpocock
  ```

- **El plugin de emet para Codex** (`.codex-plugin/plugin.json`), que incluye las skills `$emet:run`, `$emet:init` y `$emet:doctor` y el hook de aprobación.

emet nunca escribe en tu `~/.codex`: los workers se ejecutan con un `CODEX_HOME` por ejecución que enlaza tu autenticación y configuración.

## Qué comprueba cada cosa

|                                                          | `emet init`                       | `emet doctor`                            | `emet preflight`                                                                    |
| -------------------------------------------------------- | --------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| plugin ausente/deshabilitado                             | imprime el comando de instalación | lo informa (una vez, para toda la flota) | **bloquea el despacho**                                                             |
| agente `emet-worker`/`emet-reviewer` ausente             | —                                 | lo informa (una vez, para toda la flota) | **bloquea el despacho**                                                             |
| `gh` ausente/sin autenticar (tracker: `github`)          | imprime qué ejecutar              | lo informa                               | **bloquea el despacho**                                                             |
| servidor de Linear sin declarar (tracker: `linear`)      | imprime una nota                  | lo informa                               | **bloquea el despacho**                                                             |
| `claude` no está en el PATH, o un sondeo agota el tiempo | imprime una nota                  | lo informa                               | **avisa, nunca bloquea**: esto es "no se pudo comprobar", no "verificado como roto" |
| una bandera de la que depende emet falta en `--help`     | —                                 | lo informa                               | —                                                                                   |

### Comprobación de banderas

`emet doctor` comprueba las banderas mismas, no solo que existan los binarios. Lee `--help` de `gh issue view` y `gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`), `claude` (`--bg`) y `claude agents` (`--json`), e informa cualquier bandera que una CLI más nueva o más antigua ya no documente. Una bandera renombrada, de otro modo, haría fallar una oleada a mitad de camino.

### Tiempos de espera y cómo omitir un bloqueo

Cada sondeo se limita a 5 s para que un `gh auth status` detenido (sin red) no pueda colgar una oleada. Si un bloqueo de `preflight` es erróneo para tu entorno, `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` lo degrada a una advertencia solo en esa ejecución. Defínela en tu propia shell, no en nada que el coordinador de `/emet` ejecute sin supervisión. Consulta [Variables de entorno](cli.md#variables-de-entorno).

### Binarios propios del repositorio

El `preflight.requiredCommands` de un repositorio (en `emet.config.json`) es una lista aparte, propiedad del repositorio, de binarios que `emet preflight` y `emet doctor` exigen en el PATH. Es útil para `rg` y `sg`, que los prompts de los workers ofrecen como alternativas más rápidas a leer un archivo completo. `gh` no necesita figurar ahí; la comprobación anterior ya lo cubre. Consulta [`preflight`](configuration.md#preflight).

Para los fallos y sus soluciones, consulta la [solución de problemas](../troubleshooting.md#falla-una-comprobación-de-dependencias).
