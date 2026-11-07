---
title: Dépendances
description: Ce dont emet a besoin sur la machine, et quelle commande vérifie chaque élément.
seoTitle: Dépendances d'emet
sourceHash: 628a2bb58f655fd5
---

Ce dont emet a besoin sur la machine, et quelle commande vérifie chaque élément. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md). Retour au [README](../../README.md).

## Requises

- **[bun](https://bun.sh)** : uniquement pour les installations depuis les sources. Le binaire autonome n'a besoin d'aucun runtime.
- **`rsync`** et **`sha256sum` ou `shasum`** : requis par `install.sh`.
- **`git`** : requis à l'exécution. Presque toutes les sous-commandes l'invoquent.
- **CLI `gh`, authentifiée** : requise lorsque le tracker est `github` ou que l'atterrissage est `pr`. Les PR l'utilisent toujours. Avec `tracker.kind: "local"` et `landing.mode: "merge"`, `gh` n'est pas requis.
- **Le plugin `mattpocock-skills`** (marketplace `claude-plugins-official`) : les phases d'entretien, de spec et de tickets de `/emet` appellent des skills qui s'y trouvent.

  ```bash
  claude plugin marketplace add anthropics/claude-plugins-official
  claude plugin install mattpocock-skills@claude-plugins-official
  ```

- **Les agents `emet-worker` et `emet-reviewer`** dans `~/.claude/agents/` : installés par `install.sh`. La phase 6 et la phase 8 distribuent par `subagent_type`, donc l'absence de l'un ou l'autre casse la distribution. Voir [Models & effort](../../README.md#models--effort).
- **Un serveur MCP Linear déclaré dans `.mcp.json` (ou au niveau utilisateur)** : uniquement si le dépôt utilise le tracker `linear`. emet vérifie la déclaration. Savoir si la connexion est authentifiée relève du magasin d'identifiants propre à Claude Code et ne peut pas être vérifié d'ici. Si une exécution échoue à lire les tickets, redémarrez Claude Code et approuvez la connexion.

Rien de ce qui précède n'est jamais installé ni connecté à votre place. Ce qui diffère, c'est qui le vérifie et avec quelle fermeté.

## Qui vérifie quoi

|                                                  | `emet init`                        | `emet doctor`                               | `emet preflight`                                                                        |
| ------------------------------------------------ | ---------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| plugin absent/désactivé                          | affiche la commande d'installation | le signale (une fois, pour toute la flotte) | **bloque la distribution**                                                              |
| agent `emet-worker`/`emet-reviewer` absent       | —                                  | le signale (une fois, pour toute la flotte) | **bloque la distribution**                                                              |
| `gh` absent/non authentifié (tracker : `github`) | affiche quoi exécuter              | le signale                                  | **bloque la distribution**                                                              |
| serveur Linear non déclaré (tracker : `linear`)  | affiche une note                   | le signale                                  | **bloque la distribution**                                                              |
| `claude` absent du PATH, ou une sonde qui expire | affiche une note                   | le signale                                  | **avertit, ne bloque jamais** : c'est « impossible de vérifier », pas « vérifié cassé » |
| une option dont emet dépend absente de `--help`  | —                                  | le signale                                  | —                                                                                       |

### Vérification des options

`emet doctor` vérifie les options elles-mêmes, pas seulement l'existence des binaires. Il lit le `--help` de `gh issue view` et `gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`), `claude` (`--bg`) et `claude agents` (`--json`), et signale toute option qu'une CLI plus récente ou plus ancienne ne documente plus. Une option renommée ferait sinon échouer une vague en cours de route.

### Délais d'attente et contournement d'un blocage

Chaque sonde est plafonnée à 5 s pour qu'un `gh auth status` bloqué (sans réseau) ne puisse pas figer une vague. Si un blocage de `preflight` est lui-même erroné pour votre environnement, `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` le rétrograde en avertissement pour cette seule exécution. Définissez-la dans votre propre shell, pas dans ce que le coordinateur de `/emet` exécute sans surveillance. Voir [Variables d'environnement](cli.md#variables-denvironnement).

### Binaires propres au dépôt

Le `preflight.requiredCommands` d'un dépôt (dans `emet.config.json`) est une liste distincte, propre au dépôt, de binaires que `emet preflight` et `emet doctor` exigent dans le PATH. Il est utile pour `rg` et `sg`, que les prompts des workers proposent comme alternatives plus rapides à la lecture complète d'un fichier. `gh` n'a pas besoin d'y figurer ; la vérification ci-dessus le couvre déjà. Voir [`preflight`](configuration.md#preflight).

Pour les échecs et leurs corrections, voir le [dépannage](../troubleshooting.md#une-vérification-de-dépendance-échoue).
