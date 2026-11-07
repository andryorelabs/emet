---
title: Utiliser la mascotte d'emet (mod Claude Code et pet Orca)
description: Affichez la mascotte d'emet dans Claude Code avec le mod et dans Orca avec le pet.
seoTitle: Utiliser la mascotte d'emet dans Claude Code et Orca
sourceHash: caca9eb66e693e32
---

Comment afficher la **Mascot** d'emet dans Claude Code et dans Orca. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md).

Il y a deux éléments indépendants : le plugin facultatif `emet-mascot`, qui dessine la mascotte dans Claude Code, et le bundle de pet d'Orca, qui donne à Orca le même personnage.

## Installer le plugin de la mascotte

Le plugin est distribué dans le même marketplace qu'emet et il est facultatif. emet n'en a pas besoin.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet-mascot@emet-marketplace
```

La mascotte suit votre session (endormie, au travail, en attente, terminé, en erreur). Tant qu'un **Run** est actif, elle lit aussi le **Phase file** et affiche une étiquette discrète comme `emet · wave 2 · review`.

Options du plugin :

- `position` : `pane` (la valeur par défaut), `band` ou `status`. `pane` ancre la mascotte à côté de la transcription, ce qui nécessite la disposition plein écran et un terminal d'au moins 144 colonnes de large jusqu'à ce que vous ouvriez le volet une fois vous-même (environ 110 ensuite) ; quand elle ne peut pas s'ancrer, ou que le terminal se rétrécit plus tard, la mascotte s'affiche au-dessus du prompt. `band` la dessine toujours au-dessus du prompt. `status` n'affiche que l'étiquette de texte comme ligne d'état du plugin, sans l'illustration de la mascotte.
- `size` : `small` (16 x 8 cellules, la valeur par défaut) ou `medium` (24 x 12 cellules).
- `showLabel` : afficher ou masquer l'étiquette à côté de la mascotte (activé par défaut).

## Mettre à jour le plugin de la mascotte

Les marketplaces autres que celui d'Anthropic ont la mise à jour automatique désactivée par défaut, et un marketplace ne peut pas l'activer pour ses utilisateurs. Mettez à jour à la main :

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Redémarrez ensuite Claude Code. Pour qu'il se mette à jour tout seul, exécutez `/plugin`, ouvrez l'onglet **Marketplaces**, sélectionnez `emet-marketplace` et choisissez **Enable auto-update**. Chaque utilisateur le fait une fois sur sa propre machine. Voir [Mettre à jour emet](update-emet.md) pour le plugin principal aussi.

## Le fichier de phase

La CLI d'emet écrit `.emet/phase.json` dans le dépôt au fil de l'exécution, et la mascotte l'interroge environ toutes les deux secondes. Un fichier plus ancien que la fenêtre de fraîcheur est ignoré, de sorte qu'une exécution plantée ne laisse pas d'étiquette périmée.

Le fichier contient `phase` (`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done` ou `failed`), `wave`, `spec`, `runId`, `updatedAt` et un `outcome` facultatif. Une écriture qui échoue ne fait jamais échouer la sous-commande qui a signalé la phase.

## Utiliser le pet dans Orca

Le bundle du pet se trouve dans `docs/brand/pet/emet/` : `pet.json` et `spritesheet.webp`. Dans les réglages d'Orca, utilisez « Import .codex-pet bundle… » et choisissez ce dossier. L'import nécessite `docs/brand/pet/emet/` sur la machine où l'application Orca s'exécute, donc copiez-y le dossier si Orca s'exécute ailleurs que sur ce dépôt. Régénérez-le avec `bun run brand:export` après avoir modifié un SVG de la mascotte, puis committez le résultat.

## Dépannage

- Pas de mascotte : exécutez `claude plugin list`, vérifiez que `emet-mascot` est activé, puis redémarrez Claude Code.
- Pas d'étiquette : vérifiez que `.emet/phase.json` existe et a été mis à jour récemment.
