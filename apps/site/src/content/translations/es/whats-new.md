---
title: Novedades
description: Notas de versión de emet: qué cambió en cada versión.
seoTitle: Novedades de emet: notas de versión
sourceHash: a633f8ebdf12e2a7
---

## 0.4.0

2026-11-06

### Añadido

- Opción `position` de `emet-mascot` (`pane`, `band` o `status`); `pane` es el
  valor por defecto y recurre a la banda cuando no puede acoplarse.
- Una sección "Mascot (optional)" en el README.

### Cambiado

- Los fotogramas de `emet-mascot` se ajustan a los seis colores de la mascota
  en lugar de difuminarse por un redimensionado, de modo que el pixel art se
  ve nítido en la terminal.
- `emet-mascot` 0.2.0: el `size` por defecto ahora es `small`.
- `docs/how-to/orca-pet.md` ahora es `docs/how-to/mascot.md`, y cubre el mod
  y el pet de Orca.

## 0.3.0

2026-11-05

### Añadido

- Los comandos de plugin `/emet:init` y `/emet:doctor` ejecutan `emet init` y
  `emet doctor .` dentro de Claude Code y resumen el resultado.
- `emet doctor` avisa de los hooks `forge guard` y `emet guard` en
  `~/.claude/settings.json` cuyo binario ya no existe, e imprime un comando de
  respaldo seguido de `jq` para eliminarlos. Nunca edita el archivo.
- Fundamentos de la mascota: un archivo de fase, el paquete del pet, una
  máquina de estados del mod, el resto de escritores de fase y fotogramas
  rasterizados.
- `emet-mascot`, un plugin opcional que muestra una mascota de píxeles encima
  del prompt y refleja la sesión y la fase de la ejecución de `emet`. Está
  listado en el marketplace, con una guía práctica para el pet de Orca y el
  ADR-0016.

### Corregido

- El plugin ya no expone un comando `/emet:emet` duplicado y roto;
  `commands/` queda fijado a `run.md`, `init.md` y `doctor.md`.
- La siguiente oleada ahora se lanza con `/emet:run`, el comando que registra
  el plugin.

### Cambiado

- El repositorio se movió a la organización de GitHub `andryorelabs`. Las
  descargas de versiones, las insignias del README y la URL de clonación ahora
  apuntan a `andryorelabs/emet`; las antiguas URL `AndryOre/emet` siguen
  redirigiendo.
- Las instalaciones independientes renombran `/emet` a `/emet:run`, igual que
  el plugin. `install.sh` ahora instala `commands/run.md`, `init.md` y
  `doctor.md` en `~/.claude/commands/emet/`, de modo que `/emet:run`,
  `/emet:init` y `/emet:doctor` están disponibles sin el plugin. El antiguo
  `~/.claude/commands/emet.md` se elimina cuando no fue editado; una copia
  editada se conserva y se lista en el resumen de la instalación.

## 0.2.0

2026-11-05

### Cambiado

- El proyecto pasa de llamarse claude-forge a emet: la CLI es `emet`, el
  comando es `/emet`, los agentes son `emet-worker` y `emet-reviewer`, y el
  README lleva la nueva marca. Las instalaciones y los repositorios existentes
  siguen funcionando: los nombres heredados (`forge.config.json`, `.forge/`,
  `docs/agents/forge.md`, `FORGE_*`) se siguen leyendo con un aviso, y
  `emet migrate` lleva un repositorio a los nuevos nombres.

### Añadido

- `install.sh` funciona sin Bun: instala el shim del binario independiente
  como `~/.local/bin/emet`, reescribe los marcadores de posición del plugin en
  los prompts que copia, instala `commands/run.md` como
  `~/.claude/commands/emet.md` y acepta `shasum -a 256` en lugar de
  `sha256sum`.
- El README indica los requisitos reales, ambas vías de instalación y el
  orden `/setup-matt-pocock-skills` y luego `emet init`.
- Guía para agentes (`AGENTS.md`), glosario del dominio (`GLOSSARY.md`) y
  registros de decisiones de arquitectura en `docs/adr/`.
- Tracker local en markdown sobre la convención `.scratch/`, con una CLI
  `emet tracker` (`create-spec`, `create-ticket`, `frontier`, `set-state`,
  `comment`, `close`) y `emet validate`, `preflight` y `doctor` conscientes del
  tracker local.
- `landing.mode` (`pr` o `merge`) y `emet land`, que aterriza una oleada como
  un único merge local sin PR; `emet cleanup` y `emet status` comparan con la
  rama troncal local en modo merge.
- Binarios independientes de `emet`, `emet --version`, compatibilidad con
  macOS en la CI y en el árbol de procesos y el freno de memoria, y manifiestos
  de plugin con un shim `bin/emet`.
- Contrato de skills con `emet skill-path`, y un `emet doctor` más amplio que
  cubre skills, glosario, obsolescencias e instalaciones dobles.
- `emet init` y `emet map` neutrales respecto al lenguaje para repositorios de
  JS, Go, Rust y Python.
- ADR-0007 a ADR-0011.
- Índice de la documentación, mapa de código de la arquitectura, solución de
  problemas por síntoma, una plantilla de PR más completa y `emet/AGENTS.md`
  con las reglas exclusivas del runtime.

### Cambiado

- `gh` solo es obligatorio cuando `tracker.kind` es `github` o `landing.mode`
  es `pr`.
- `emet init` ya no selecciona el tracker local por defecto.
- Se enmienda el ADR-0004: una oleada aterriza como un PR o como un merge
  local.

## 0.1.0

2026-11-03

### Añadido

- El comando global `/forge`: entrevista, spec, tickets, una sola aprobación y
  luego agentes de worktree en paralelo que implementan, prueban y fusionan una
  funcionalidad sin supervisión.
- La CLI `forge` con los subcomandos `init`, `doctor`, `preflight`, `selftest`,
  claims, slots, gates, comprobaciones de handoff, results y metrics.
- Los agentes `forge-worker` y `forge-reviewer`.
- Trackers para Linear y GitHub Issues.
- Configuración por repositorio mediante `forge.config.json`.
- `install.sh`, que instala la CLI, el comando y los agentes.
