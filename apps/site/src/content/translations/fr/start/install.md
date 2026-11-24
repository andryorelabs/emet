---
title: Premiers pas
description: Installez emet comme plugin Claude Code, vérifiez qu'il fonctionne avec emet doctor et lancez-le pour la première fois.
seoTitle: Premiers pas avec emet
sourceHash: ce83e38591b3de64
---

Installez emet, vérifiez qu'il fonctionne et lancez-le pour la première fois.

<img src="../brand/mascot/mascot-done.svg" alt="mascotte d'emet, terminé" width="96" align="right">

## Prérequis

Claude Code ou la CLI Codex, `git`, `gh` (authentifié) et le plugin `mattpocock-skills`, sous Linux ou macOS. Bun n'est nécessaire que pour `emet self install --from` ; Windows natif n'est pas pris en charge (utilisez WSL). La liste complète, avec ce que vérifie chaque élément, se trouve dans la [référence des dépendances](../reference/dependencies.md).

## Installation

Lancez le script d'amorçage dans un terminal. Ni Bun, ni clone, ni sudo ne sont nécessaires :

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh
```

Le script refuse de s'exécuter sous sudo, télécharge le binaire autonome et `SHA256SUMS` pour votre plateforme dans un répertoire temporaire, vérifie la somme de contrôle (et l'attestation quand `gh` est présent), puis seulement passe la main à `emet self install`. Rien n'est écrit si une vérification échoue. Il ne modifie pas le profil de votre shell ; si `~/.local/bin` n'est pas dans votre `PATH`, ajoutez-le.

`emet self install` place le binaire dans `~/.local/share/emet/versions/<version>/emet` et le lie depuis `~/.local/bin/emet`. Il écrit ensuite les fichiers Claude Code : les prompts de référence dans `~/.claude/emet/`, les commandes dans `~/.claude/commands/emet/` et les agents dans `~/.claude/agents/`, les espaces réservés du plugin étant réécrits en chemins simples `~/.claude`. Il fusionne les hooks emet dans `~/.claude/settings.json` après une sauvegarde et laisse les hooks étrangers tranquilles. Quand Codex est présent, il écrit aussi les skills emet sous `~/.agents/skills/emet/` et ajoute les hooks emet à `$CODEX_HOME/hooks.json` (par défaut `~/.codex`) ; il n'écrit jamais `config.toml`. Le relancer est sans risque, et un fichier que vous avez modifié est conservé, la nouvelle version étant écrite à côté sous le nom `<file>.new`.

Pour prévisualiser chaque écriture sans en faire aucune, passez `--dry-run`. Les arguments après `sh -s --` parviennent à `emet self install` :

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh -s -- --dry-run
```

Vous pouvez aussi épingler une version, comme dans `sh -s -- 1.2.3` ; la valeur par défaut est `latest`. Pour installer depuis un clone à la place, lancez `emet self install --from <checkout>` ; cela nécessite `bun` et conserve le fonctionnement de `emet selftest`.

### Codex

Quand Codex est présent, `emet self install` affiche une étape à effectuer une seule fois : ouvrez `/hooks` dans Codex et appuyez sur `t` sur la page des événements pour faire confiance aux hooks emet (ou validez l'invite "Hooks need review" au démarrage). Jusque-là, l'emet guard ne s'exécute pas. Voir [Exécuter emet sur Codex](codex.md#installation).

### Mise à jour automatique

Un hook `SessionStart` exécute `emet self update --auto` au plus une fois par jour, détaché et silencieux hors ligne. Il vérifie la somme de contrôle, prépare la nouvelle version et ne bascule le lien symbolique que si aucun slot de worker n'est détenu ; sinon la mise à jour reste en attente jusqu'au prochain démarrage de session. La version précédente est conservée pour un retour en arrière. Pour la désactiver, définissez `EMET_AUTO_UPDATE=0` ou lancez `emet self update --auto off` ; `emet self update --auto on` la réactive. Voir [Mettre à jour emet](../how-to/update-emet.md).

### Désinstallation

```bash
emet uninstall --dry-run     # list what would be removed
emet uninstall
```

Il supprime le répertoire des versions, le lien symbolique `~/.local/bin/emet`, le fichier d'état de l'installation, les skills Codex et chaque hook emet dans les deux fichiers de hooks, et il annule les extras que `emet setup` a enregistrés. Un fichier de commande que vous avez modifié et les hooks étrangers sont conservés. Voir la [référence de la CLI](../reference/cli.md#registre-de-setup-et-restauration).

### Facultatif : les plugins

Au lieu de l'installation autonome, ou pour le `emet-mascot` facultatif, vous pouvez installer emet comme plugin. `emet self install` refuse tant que le plugin emet est installé et explique comment le retirer ; `--force` poursuit malgré tout, et `emet doctor` avertit quand les deux coexistent. Ce qu'un plugin fournit dépend de l'hôte d'agent. Sur Claude Code, il apporte `/emet:run`, les agents, les hooks de garde et un shim `emet` qui télécharge un binaire autonome à somme de contrôle vérifiée lors de la première utilisation. Le plugin Codex fournit les skills `$emet:run`, `$emet:init` et `$emet:doctor` et un hook, mais aucun agent et aucun shim `emet`.

:::install-tabs

```bash tab="Claude Code"
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

```bash tab="Codex"
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

:::

Chaque installation vous donne les mêmes trois points d'entrée. Sur Claude Code, ce sont les commandes slash `/emet:run`, `/emet:init` et `/emet:doctor` ; sur Codex, ce sont les skills `$emet:run`, `$emet:init` et `$emet:doctor`. L'installation autonome place aussi `emet` dans votre `PATH`, donc `emet init` et `emet doctor .` fonctionnent dans un terminal ordinaire ; avec un plugin seul, utilisez les commandes slash, ou `! emet <subcommand>` dans une session Claude Code ou Codex. Sur Claude Code, les noms des agents diffèrent : `emet:emet-worker` dans le plugin, `emet-worker` en autonome ; Codex n'a pas d'agents emet, car chaque worker est son propre processus `codex exec`.

Ordre recommandé, dans chaque dépôt : lancez d'abord la skill `setup-matt-pocock-skills` (`/setup-matt-pocock-skills` sur Claude Code ; sur Codex, la même skill du plugin `mattpocock-skills` avec la syntaxe `$` de Codex), puis `emet init`.

Vérifiez que tout a fonctionné avec `/emet:doctor` dans Claude Code (`$emet:doctor` sur Codex), ou `emet doctor .` dans un terminal (`selftest` nécessite une installation `--from` depuis les sources).

Si `doctor` ou `preflight` signale un problème, consultez le [dépannage](../troubleshooting.md). Rien n'est jamais installé ni connecté à votre place ; consultez la [référence des dépendances](../reference/dependencies.md) pour savoir qui vérifie quoi et pour `EMET_SKIP_DEPENDENCY_CHECKS`.

## Première exécution

Dans n'importe quel dépôt git :

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

Dans une session, `/emet:init` fait la même chose que `emet init`. Ensuite, dans Claude Code (sur Codex, utilisez `$emet:run` au lieu de `/emet:run`) :

```
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

`emet init` laisse un marqueur `TODO(emet):` dans les fichiers `docs/agents/*.md` générés pour tout ce qu'il ne peut pas déduire seul (un verrou partagé de la base de données de test, la propriété du schéma, etc.) ; complétez-les. `emet preflight` refuse de distribuer tant qu'il en reste un.

## Suite

- [Trackers et atterrissage](trackers-and-landing.md) : tickets GitHub, Linear ou locaux, et comment une vague atterrit.
- [Exécuter emet sur Codex](codex.md) : installation, l'approbation unique et les limites sur l'Agent host Codex.
- [Modèles et effort](models-and-effort.md) : quel modèle et quel effort chaque rôle utilise.
- [Vérification de flotte](fleet.md) : auditez plusieurs dépôts à la fois.
- [Référence de configuration](../reference/configuration.md) et [référence de la CLI](../reference/cli.md) : chaque clé et chaque sous-commande.
