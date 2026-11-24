---
title: Première exécution
description: Vérifiez l'installation avec emet doctor et lancez emet pour la première fois.
seoTitle: Première exécution d'emet
sourceHash: 7daec76e45f50b8c
---

Vérifiez l'installation avec `emet doctor` et lancez emet pour la première fois. Installez d'abord emet ; voir [Installation](install.md).

## Prérequis

- emet installé, avec `emet` dans votre `PATH`.
- Un dépôt git avec `gh` authentifié.
- Sur Claude Code ou Codex, le plugin `mattpocock-skills`.

## Étapes

Dans chaque dépôt, lancez d'abord la skill `setup-matt-pocock-skills` (`/setup-matt-pocock-skills` sur Claude Code ; sur Codex, la même skill du plugin `mattpocock-skills` avec la syntaxe `$` de Codex). Ensuite, dans n'importe quel dépôt git :

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight     # confirms the repo is dispatch-ready
```

Dans une session, `/emet:init` fait la même chose que `emet init` (`$emet:init` sur Codex). `emet init` laisse un marqueur `TODO(emet):` dans les fichiers `docs/agents/*.md` générés pour tout ce qu'il ne peut pas déduire seul, comme un verrou partagé de la base de données de test ou la propriété du schéma ; complétez-les. `emet preflight` refuse de distribuer tant qu'il en reste un.

Lancez ensuite emet dans Claude Code (sur Codex, utilisez `$emet:run` au lieu de `/emet:run`) :

```
/emet:run <describe the feature>              # interview, then wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## Vérifier le résultat

Lancez `emet doctor .` dans un terminal, ou `/emet:doctor` dans Claude Code (`$emet:doctor` sur Codex). Il signale d'abord les échecs. Si `doctor` ou `preflight` signale un problème, consultez le [dépannage](../troubleshooting.md). Rien n'est jamais installé ni connecté à votre place ; la [référence des dépendances](../reference/dependencies.md) explique qui vérifie quoi et documente `EMET_SKIP_DEPENDENCY_CHECKS`.

## Suite

- [Trackers et atterrissage](../how-to/configure-tracker.md) : tickets GitHub, Linear ou locaux, et comment une spec atterrit.
- [Exécuter emet sur Codex](../how-to/use-codex.md) : l'approbation unique et les limites sur l'Agent host Codex.
- [Modèles et effort](../how-to/choose-models.md) : quel modèle et quel effort chaque rôle utilise.
- [Vérification de flotte](../how-to/check-a-fleet.md) : auditez plusieurs dépôts à la fois.
- [Référence de configuration](../reference/configuration.md) et [référence de la CLI](../reference/cli.md) : chaque clé et chaque sous-commande.
