---
title: Revisión de flota
description: Audita varios repositorios a la vez con emet doctor, en modo de solo lectura, y mira cuáles necesitan atención.
seoTitle: Revisión de flota con emet doctor
sourceHash: 511c25889b2a8244
---

Audita, cambia y lanza emet en varios repositorios a la vez. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md).

## Requisitos previos

- emet instalado; consulta [Instalación](../start/install.md).
- Cada repositorio tiene un `emet.config.json` y está un nivel por debajo de una raíz (por defecto `~/code`).
- `gh` en el `PATH` y autenticado; consulta la [referencia de dependencias](../reference/dependencies.md).

## Auditar los repositorios

:::steps

1. Ejecuta la auditoría de solo lectura sobre cualquier cantidad de repositorios:

   ```bash
   emet doctor ~/code/*
   ```

2. Lee el informe por repositorio: un `emet.config.json` válido, los cuatro archivos `docs/agents/*.md`, ningún marcador `TODO(emet):` pendiente, comandos de `commands.selfCheck` que se resuelven y los hallazgos de dependencias del tracker de ese repositorio.
3. Lee los hallazgos de todo el barrido, impresos una sola vez: el plugin mattpocock-skills y las banderas de las CLI externas, verificadas mediante `--help` (`gh` y, en Claude Code, `claude --bg` y `claude agents --json`; en Codex, `codex exec --json` y `--output-schema`). Una bandera renombrada se informa aquí antes de que haga fallar una oleada.

:::

## Cambiar un ajuste en cada repositorio

:::steps

1. Lista lo que tiene cada repositorio ahora:

   ```bash
   emet fleet list --root ~/code
   ```

   Imprime, por repositorio, la ruta, `tracker.kind`, `handoff.autoChain` y `models.worker`; `--json` lo imprime como datos.

2. Previsualiza el cambio:

   ```bash
   emet fleet set handoff.autoChain false --dry-run
   ```

   `--dry-run` no escribe nada e imprime el valor anterior y el nuevo de cada repositorio.

3. Aplícalo ejecutando el mismo comando sin `--dry-run`. El valor se valida primero mediante el cargador de configuración; un valor no válido no modifica ningún repositorio y termina con código 1.

:::

## Lanzar una funcionalidad en varios repositorios

```bash
emet fleet launch --feature "add dark mode" --repos app,site
```

Abre una sesión `/emet:run --draft <text>` en cada repositorio, tras las mismas comprobaciones de preparación que `emet chain`. `--repos` lo limita a una lista separada por comas.

## Ver las sesiones bloqueadas

```bash
emet fleet status
```

Imprime, por repositorio, cuántas sesiones de emet están bloqueadas a la espera de una decisión, trabajando o inactivas, con los repositorios bloqueados primero. Lee las últimas 24 horas del journal global y excluye las sesiones terminadas; `--json` imprime las sesiones. Dentro de un repositorio, `emet status` las lista bajo `sessions`. Consulta [Atención y journal](../concepts/attention-and-journal.md) y la [referencia de configuración](../reference/configuration.md#attention).

## Comprobar

:::steps

1. Ejecuta `emet doctor ~/code/*` de nuevo y confirma que ningún repositorio informe un fallo.
2. Ejecuta `emet fleet list --root ~/code` y confirma que la clave cambiada muestre el valor nuevo en cada repositorio.
3. Ejecuta `emet fleet status` y confirma que ningún repositorio esté bloqueado de forma inesperada.

:::

Cada sondeo se limita a 5 s, de modo que un `gh auth status` detenido no pueda colgar una oleada. `preflight.requiredCommands` es una lista, propiedad del repositorio, de binarios que `emet preflight` y `emet doctor` exigen; consulta la [referencia de la CLI](../reference/cli.md#revisión-de-flota) y la [referencia de configuración](../reference/configuration.md#preflight).
