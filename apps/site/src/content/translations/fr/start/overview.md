---
title: Présentation
description: Ce qu'est emet, ce que fait une exécution et où aller ensuite.
seoTitle: Présentation d'emet
sourceHash: 8627801ad3b7d807
---

Ce qu'est emet, ce que fait une exécution et où aller ensuite. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md).

<img src="../brand/mascot/mascot-done.svg" alt="mascotte d'emet, terminé" width="96" align="right">

emet mène une fonctionnalité de l'idée jusqu'au changement fusionné, dans Claude Code ou la CLI Codex, dans n'importe quel dépôt git, avec Linear, GitHub Issues ou des tickets locaux. Vous décrivez la fonctionnalité une fois et vous approuvez la spec et les tickets une fois ; le reste s'exécute sans surveillance.

## Ce que fait une exécution

1. `/emet:run` (`$emet:run` sur Codex) vous interroge et rédige une spec.
2. Il découpe la spec en tickets et demande une seule approbation.
3. Des workers parallèles implémentent chaque ticket dans son propre worktree git.
4. Une revue vérifie chaque vague et la CI doit être verte ; tout ce qui est signalé bloque la fusion.
5. La spec atterrit par défaut en une seule pull request, ou en une fusion locale, et la vague suivante peut s'enchaîner.

## Où aller ensuite

1. [Installation](install.md) : l'installation autonome, la mise à jour, la mise à jour automatique et la désinstallation.
2. [Première exécution](first-run.md) : vérifier l'installation et lancer emet dans un dépôt.
3. [Exécutions, vagues et specs](../concepts/runs-waves-specs.md) : le vocabulaire d'une exécution.
4. [Trackers et atterrissage](../how-to/configure-tracker.md) : tickets GitHub, Linear ou locaux, et comment une spec atterrit.
