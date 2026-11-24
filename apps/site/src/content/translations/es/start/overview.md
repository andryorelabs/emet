---
title: Resumen
description: Qué es emet, qué hace una ejecución y adónde ir después.
seoTitle: Resumen de emet
sourceHash: 8627801ad3b7d807
---

Qué es emet, qué hace una ejecución y adónde ir después. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md).

<img src="../brand/mascot/mascot-done.svg" alt="mascota de emet, lista" width="96" align="right">

emet lleva una funcionalidad desde la idea hasta el cambio fusionado dentro de Claude Code o de la CLI de Codex, en cualquier repositorio git, con Linear, GitHub Issues o tickets locales. Describes la funcionalidad una vez y apruebas la spec y los tickets una vez; el resto se ejecuta sin supervisión.

## Qué hace una ejecución

1. `/emet:run` (`$emet:run` en Codex) te entrevista y escribe una spec.
2. Divide la spec en tickets y pide una única aprobación.
3. Workers en paralelo implementan cada ticket en su propio worktree de git.
4. Una revisión comprueba cada oleada y la CI debe estar en verde; cualquier cosa marcada detiene la fusión.
5. La spec aterriza como un único pull request por defecto, o como una fusión local, y la siguiente oleada puede encadenarse.

## Adónde ir después

1. [Instalar](install.md): la instalación independiente, la actualización, la actualización automática y la desinstalación.
2. [Primera ejecución](first-run.md): comprueba la instalación y ejecuta emet en un repositorio.
3. [Ejecuciones, oleadas y specs](../concepts/runs-waves-specs.md): el vocabulario de una ejecución.
4. [Trackers y aterrizaje](../how-to/configure-tracker.md): GitHub, Linear o tickets locales, y cómo aterriza una spec.
