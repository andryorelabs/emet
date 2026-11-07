---
title: Premiers pas
description: Installez emet comme plugin Claude Code, vérifiez qu'il fonctionne avec emet doctor et lancez-le pour la première fois.
seoTitle: Premiers pas avec emet
sourceHash: 0f92cdb1a20904a3
---

Installez emet, vérifiez qu'il fonctionne et lancez-le pour la première fois.

<img src="../brand/mascot/mascot-done.svg" alt="mascotte d'emet, terminé" width="96" align="right">

## Prérequis

Claude Code, `git`, `gh` (authentifié) et le plugin `mattpocock-skills`, sous Linux ou macOS. Bun n'est nécessaire que pour une installation depuis les sources ; Windows natif n'est pas pris en charge (utilisez WSL). La liste complète, avec ce que vérifie chaque élément, se trouve dans la [référence des dépendances](../reference/dependencies.md).

## Installation

Il y a deux méthodes d'installation.

**Plugin** (sans Bun). Ajoutez ce dépôt comme marketplace et installez le plugin `emet` ; il apporte `/emet:run`, les agents, les hooks de garde et un shim `emet` qui télécharge un binaire autonome à somme de contrôle vérifiée lors de la première utilisation.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

**`install.sh`** (fonctionne avec ou sans Bun) :

```bash
git clone git@github.com:andryorelabs/emet.git
cd emet
./install.sh
```

Avec `bun` dans le PATH, il copie les sources de la CLI dans `~/.claude/emet` et un wrapper `emet` dans `~/.local/bin/emet`. Sans `bun`, il installe à la place le shim du binaire autonome (`~/.local/bin/emet`, lié à `~/.claude/emet/bin/emet`), qui télécharge et vérifie la somme de contrôle du binaire au premier lancement (nécessite `curl`). Dans les deux cas, les commandes sont placées dans `~/.claude/commands/emet/` et les agents dans `~/.claude/agents/` ; les espaces réservés du plugin dans les prompts sont réécrits en chemins simples `~/.claude`. Le relancer est sans risque, et un fichier que vous avez modifié est conservé, la nouvelle version étant écrite à côté sous le nom `<file>.new`.

Les deux installations vous donnent trois commandes slash : `/emet:run`, `/emet:init` et `/emet:doctor`. La commande `emet` dans un terminal ordinaire ne fonctionne qu'après `install.sh` ; sinon, utilisez les commandes slash, ou `! emet <subcommand>` dans une session Claude Code. Les noms des agents diffèrent : `emet:emet-worker` dans le plugin, `emet-worker` en autonome.

Ordre recommandé, dans chaque dépôt : lancez d'abord `/setup-matt-pocock-skills`, puis `emet init`.

Vérifiez que tout a fonctionné avec `/emet:doctor` dans Claude Code, ou `emet doctor .` dans un terminal après `install.sh` (`selftest` nécessite une installation depuis les sources).

Si `doctor` ou `preflight` signale un problème, consultez le [dépannage](../troubleshooting.md). Rien n'est jamais installé ni connecté à votre place ; consultez la [référence des dépendances](../reference/dependencies.md) pour savoir qui vérifie quoi et pour `EMET_SKIP_DEPENDENCY_CHECKS`.

## Première exécution

Dans n'importe quel dépôt git :

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

Dans une session, `/emet:init` fait la même chose que `emet init`. Ensuite, dans Claude Code :

```
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

`emet init` laisse un marqueur `TODO(emet):` dans les fichiers `docs/agents/*.md` générés pour tout ce qu'il ne peut pas déduire seul (un verrou partagé de la base de données de test, la propriété du schéma, etc.) ; complétez-les. `emet preflight` refuse de distribuer tant qu'il en reste un.

## Suite

- [Trackers et atterrissage](trackers-and-landing.md) : tickets GitHub, Linear ou locaux, et comment une vague atterrit.
- [Modèles et effort](models-and-effort.md) : quel modèle et quel effort chaque rôle utilise.
- [Vérification de flotte](fleet.md) : auditez plusieurs dépôts à la fois.
- [Référence de configuration](../reference/configuration.md) et [référence de la CLI](../reference/cli.md) : chaque clé et chaque sous-commande.
