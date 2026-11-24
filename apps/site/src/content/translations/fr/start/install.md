---
title: Installation
description: Installez emet, gardez-le à jour et supprimez-le.
seoTitle: Installer emet
sourceHash: e67d7c2c6b22d556
---

Installez emet, gardez-le à jour et supprimez-le. Puis [lancez-le pour la première fois](first-run.md).

## Prérequis

Claude Code ou la CLI Codex, `git`, `gh` (authentifié) et le plugin `mattpocock-skills`, sous Linux ou macOS. Bun n'est nécessaire que pour `emet self install --from` ; Windows natif n'est pas pris en charge (utilisez WSL). La liste complète, avec ce que vérifie chaque élément, se trouve dans la [référence des dépendances](../reference/dependencies.md).

## Installation

Lancez le script d'amorçage dans un terminal. Ni Bun, ni clone, ni sudo ne sont nécessaires :

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh
```

Le script refuse de s'exécuter sous sudo, télécharge le binaire autonome et `SHA256SUMS` pour votre plateforme dans un répertoire temporaire, vérifie la somme de contrôle (et l'attestation quand `gh` est présent), puis seulement passe la main à `emet self install`. Rien n'est écrit si une vérification échoue. Il ne modifie pas le profil de votre shell ; si `~/.local/bin` n'est pas dans votre `PATH`, ajoutez-le.

`emet self install` place le binaire dans `~/.local/share/emet/versions/<version>/emet` et le lie depuis `~/.local/bin/emet`. Il écrit ensuite les fichiers Claude Code : les prompts de référence dans `~/.claude/emet/`, les commandes dans `~/.claude/commands/emet/` et les agents dans `~/.claude/agents/`, les espaces réservés du plugin étant réécrits en chemins simples `~/.claude`. Il fusionne les hooks emet dans `~/.claude/settings.json` après une sauvegarde et laisse les hooks étrangers intacts. Quand Codex est présent, il écrit aussi les skills emet sous `~/.agents/skills/emet/` et ajoute les hooks emet à `$CODEX_HOME/hooks.json` (par défaut `~/.codex`) ; il n'écrit jamais `config.toml`. Le relancer est sans risque, et un fichier que vous avez modifié est conservé, la nouvelle version étant écrite à côté sous le nom `<file>.new`.

Pour prévisualiser chaque écriture sans en faire aucune, passez `--dry-run`. Les arguments après `sh -s --` parviennent à `emet self install` :

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh -s -- --dry-run
```

Vous pouvez aussi épingler une version, comme dans `sh -s -- 1.2.3` ; la valeur par défaut est `latest`. Pour installer depuis un checkout à la place, lancez `emet self install --from <checkout>` ; cela nécessite `bun` et conserve le fonctionnement de `emet selftest`.

### Codex

Quand Codex est présent, `emet self install` affiche une étape à effectuer une seule fois : ouvrez `/hooks` dans Codex et appuyez sur `t` sur la page des événements pour faire confiance aux hooks emet (ou validez l'invite "Hooks need review" au démarrage). Jusque-là, l'emet guard ne s'exécute pas. Voir [Exécuter emet sur Codex](../how-to/use-codex.md#install).

### Mise à jour

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

La version est téléchargée, vérifiée avec `SHA256SUMS` (et l'attestation quand `gh` est présent) puis préparée. Le basculement du lien symbolique et des fichiers installés n'a lieu que si aucun slot de worker n'est détenu ; sinon la mise à jour reste en attente et est appliquée au prochain démarrage de session. Un échec laisse la version actuelle intacte et est consigné dans le journal. La version précédente est conservée pour un retour en arrière et les plus anciennes sont élaguées. `emet doctor` avertit quand une mise à jour est en attente.

### Mise à jour automatique

Un hook `SessionStart` exécute `emet self update --auto` au plus une fois par jour, détaché et silencieux hors ligne. Il vérifie la somme de contrôle, prépare la nouvelle version et ne bascule le lien symbolique que si aucun slot de worker n'est détenu ; sinon la mise à jour reste en attente jusqu'au prochain démarrage de session. La version précédente est conservée pour un retour en arrière. Pour la désactiver, définissez `EMET_AUTO_UPDATE=0` ou lancez `emet self update --auto off` ; `emet self update --auto on` la réactive. La mise à jour automatique ne fait rien pour les installations par plugin.

### Désinstallation

```bash
emet uninstall --dry-run     # list what would be removed
emet uninstall
```

Il supprime le répertoire des versions, le lien symbolique `~/.local/bin/emet`, le fichier d'état de l'installation, les skills Codex et chaque hook emet dans les deux fichiers de hooks, et il annule les extras que `emet setup` a enregistrés. Un fichier de commande que vous avez modifié et les hooks étrangers sont conservés. Voir la [référence de la CLI](../reference/cli.md#setup-ledger-and-restore).

### Facultatif : les plugins

Au lieu de l'installation autonome, ou pour le `emet-mascot` facultatif, vous pouvez installer emet comme plugin. `emet self install` refuse tant que le plugin emet est installé et explique comment le retirer ; `--force` poursuit malgré tout, et `emet doctor` avertit quand les deux coexistent. Ce qu'un plugin fournit dépend de l'Agent host. Sur Claude Code, il apporte `/emet:run`, les agents, les hooks de garde et un shim `emet` qui télécharge un binaire autonome à somme de contrôle vérifiée lors de la première utilisation. Le plugin Codex fournit les skills `$emet:run`, `$emet:init` et `$emet:doctor` et un hook, mais aucun agent et aucun shim `emet`.

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

Pour mettre à jour une installation par plugin, voir [Mettre à jour emet](../how-to/update-emet.md).

## Suite

[Première exécution](first-run.md) : vérifier l'installation et lancer emet dans un dépôt.
