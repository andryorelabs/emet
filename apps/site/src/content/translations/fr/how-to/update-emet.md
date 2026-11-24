---
title: Mettre à jour emet
description: Faites passer un emet installé à une nouvelle version et activez la mise à jour automatique du marketplace pour les plugins.
seoTitle: Mettre à jour emet
sourceHash: 380b07ed5a10474f
---

Comment faire passer un emet installé à une nouvelle version. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md).

## Mettre à jour l'installation autonome

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

La release est téléchargée, vérifiée avec `SHA256SUMS` (et l'attestation quand `gh` est présent) et préparée. Le basculement du lien symbolique et des fichiers installés n'a lieu que si aucun slot de worker n'est détenu ; sinon la mise à jour reste en attente et est appliquée au prochain démarrage de session. Un échec laisse la version actuelle intacte et est consigné dans le journal. La version précédente est conservée pour un retour en arrière et les plus anciennes sont élaguées. `emet doctor` avertit quand une mise à jour est en attente.

## Mettre à jour automatiquement

Un hook `SessionStart` exécute `emet self update --auto` au plus une fois par jour, détaché et silencieux hors ligne. Pour la désactiver, définissez `EMET_AUTO_UPDATE=0` ou lancez :

```bash
emet self update --auto off
```

`emet self update --auto on` la réactive. La mise à jour automatique ne fait rien pour les installations par plugin.

## Facultatif : les plugins

emet et le plugin facultatif `emet-mascot` proviennent du même marketplace, `emet-marketplace`. Claude Code ne met pas à jour de lui-même les marketplaces tiers par défaut, et un marketplace ne peut pas changer ce comportement par défaut pour ses utilisateurs.

### Claude Code

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Ignorez la dernière ligne si vous n'avez pas installé la mascotte. Redémarrez ensuite Claude Code, ou exécutez `/reload-plugins`. `claude plugin list` affiche les versions installées ; la plus récente figure dans [CHANGELOG.md](../../CHANGELOG.md).

Pour mettre à jour automatiquement, exécutez `/plugin` dans Claude Code, ouvrez l'onglet **Marketplaces**, sélectionnez `emet-marketplace` et choisissez **Enable auto-update**. Claude Code actualise alors le marketplace et met à jour les deux plugins au démarrage d'une session. Chaque utilisateur le règle sur sa propre machine.

### Codex

Actualisez l'instantané du marketplace, puis ajoutez de nouveau le plugin. Relancer `codex plugin marketplace add` ne l'actualise pas :

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` indique si `emet@emet-marketplace` est installé et activé. La mise à jour automatique est une fonction de Claude Code ; sur Codex, mettez à jour à la main.
