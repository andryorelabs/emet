---
title: Utiliser la mascotte d'emet (mod Claude Code et pet Orca)
description: Affichez la mascotte d'emet dans Claude Code avec le mod et dans Orca avec le pet.
seoTitle: Utiliser la mascotte d'emet dans Claude Code et Orca
sourceHash: a6d2945308d1d44b
---

Affichez la **Mascot** d'emet dans Claude Code et dans Orca. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md).

Il y a deux éléments indépendants : le plugin facultatif `emet-mascot`, qui dessine la mascotte dans Claude Code, et le bundle de pet d'Orca, qui donne à Orca le même personnage. emet n'a besoin ni de l'un ni de l'autre.

## Prérequis

- Claude Code, pour le plugin.
- emet est installé, afin qu'un run écrive le fichier de phase que la mascotte suit ; voir [Installer](../start/install.md).
- Orca, pour le pet. L'import nécessite le dossier `docs/brand/pet/emet/` sur la machine où l'application Orca s'exécute.

## Installer le plugin de la mascotte

:::steps

1. Ajoutez le marketplace et installez le plugin :

   ```bash
   claude plugin marketplace add andryorelabs/emet
   claude plugin install emet-mascot@emet-marketplace
   ```

2. Redémarrez Claude Code. La mascotte suit votre session (endormie, au travail, en attente, terminé, en erreur). Tant qu'un **Run** est actif, elle lit aussi le fichier de phase et affiche une étiquette discrète comme `emet · wave 2 · review`.
3. Définissez éventuellement les options du plugin :
   - `position` : `pane` (la valeur par défaut), `band` ou `status`. `pane` ancre la mascotte à côté de la transcription, ce qui nécessite la disposition plein écran et un terminal d'au moins 144 colonnes de large jusqu'à ce que vous ouvriez le volet une fois vous-même (environ 110 ensuite) ; quand elle ne peut pas s'ancrer, la mascotte s'affiche au-dessus du prompt. `band` la dessine toujours au-dessus du prompt. `status` n'affiche que l'étiquette de texte comme ligne d'état.
   - `size` : `small` (16 x 8 cellules, la valeur par défaut) ou `medium` (24 x 12 cellules).
   - `showLabel` : afficher ou masquer l'étiquette (activé par défaut).

:::

## Mettre à jour le plugin de la mascotte

Les marketplaces autres que celui d'Anthropic ont la mise à jour automatique désactivée par défaut : mettez à jour à la main ou activez-la une fois.

:::steps

1. Mettez à jour le marketplace et le plugin :

   ```bash
   claude plugin marketplace update emet-marketplace
   claude plugin update emet-mascot@emet-marketplace
   ```

2. Redémarrez Claude Code.
3. Pour qu'il se mette à jour tout seul, exécutez `/plugin`, ouvrez l'onglet **Marketplaces**, sélectionnez `emet-marketplace` et choisissez **Enable auto-update**. Chaque utilisateur le fait une fois sur sa propre machine. Voir [Mettre à jour emet](update-emet.md) pour le plugin principal.

:::

## Utiliser le pet dans Orca

:::steps

1. Vérifiez que `docs/brand/pet/emet/` (`pet.json` et `spritesheet.webp`) se trouve sur la machine où Orca s'exécute ; copiez-y le dossier si Orca s'exécute ailleurs que sur ce dépôt.
2. Dans les réglages d'Orca, choisissez « Import .codex-pet bundle… » et sélectionnez ce dossier.
3. Après avoir modifié un SVG de la mascotte, régénérez le bundle avec `bun run brand:export` et committez le résultat.

:::

## Vérifier

:::steps

1. Exécutez `claude plugin list` et confirmez que `emet-mascot` est activé ; si la mascotte est absente, redémarrez Claude Code.
2. Pendant un run, confirmez que `.emet/phase.json` existe et a été mis à jour il y a quelques secondes. La mascotte l'interroge environ toutes les deux secondes et ignore un fichier plus ancien que sa fenêtre de fraîcheur, de sorte qu'un run planté ne laisse pas d'étiquette périmée. Il contient `phase` (`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done` ou `failed`), `wave`, `spec`, `runId`, `updatedAt` et un `outcome` facultatif.
3. Dans Orca, confirmez que le pet emet apparaît dans la liste des pets.

:::
