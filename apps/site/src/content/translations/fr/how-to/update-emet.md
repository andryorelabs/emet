---
title: Mettre à jour emet
description: Faites passer un emet installé à une nouvelle version et activez la mise à jour automatique du marketplace pour les plugins.
seoTitle: Mettre à jour emet
sourceHash: e9018d796fe23437
---

Comment faire passer un emet installé à une nouvelle version. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md).

emet et le plugin facultatif `emet-mascot` proviennent du même marketplace, `emet-marketplace`. Claude Code ne met pas à jour de lui-même les marketplaces tiers par défaut, et un marketplace ne peut pas changer ce comportement par défaut pour ses utilisateurs.

## Mettre à jour sur Claude Code

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Ignorez la dernière ligne si vous n'avez pas installé la mascotte. Redémarrez ensuite Claude Code, ou exécutez `/reload-plugins`. `claude plugin list` affiche les versions installées ; la plus récente figure dans [CHANGELOG.md](../../CHANGELOG.md).

## Mettre à jour sur Codex

Actualisez l'instantané du marketplace, puis ajoutez de nouveau le plugin. Relancer `codex plugin marketplace add` ne l'actualise pas :

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` indique si `emet@emet-marketplace` est installé et activé.

## Mettre à jour automatiquement

La mise à jour automatique est une fonction de Claude Code ; sur Codex, mettez à jour à la main. Dans Claude Code, exécutez `/plugin`, ouvrez l'onglet **Marketplaces**, sélectionnez `emet-marketplace` et choisissez **Enable auto-update**. Claude Code actualise alors le marketplace et met à jour les deux plugins au démarrage d'une session, et la session suivante charge les nouvelles versions. Chaque utilisateur le règle sur sa propre machine.

## Installé avec install.sh

Récupérez la dernière `main` dans votre clone et relancez `./install.sh`.
