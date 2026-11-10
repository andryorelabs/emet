---
title: Nouveautés
description: Notes de version d'emet : ce qui a changé dans chaque version.
seoTitle: Nouveautés d'emet : notes de version
sourceHash: e658e982cb203285
---

## 0.5.2

2026-11-10

### Modifié

- L'avis de non-affiliation nomme OpenAI en plus d'Anthropic.
- Les onglets d'installation de la page d'accueil indiquent Claude Code, et la commande d'exécution a un onglet Codex avec `$emet:run`.
- Les guides indiquent quelles étapes relèvent de chaque Agent host : Claude Code ou Codex.

### Corrigé

- `emet doctor`, `emet init`, `emet dependencies` et `emet preflight` ne donnent plus de conseils propres à Claude Code sur l'hôte Codex.
- `emet init --force` conserve `agentHost` et la section `codex` de la configuration existante.

## 0.5.1

2026-11-10

### Modifié

- Le README, la page d'accueil, la bannière, les guides et les images de partage nomment Codex aux côtés de Claude Code.

## 0.5.0

2026-11-10

### Ajouté

- La page d'accueil du Website : héros peint, fonctionnement, fonctionnalités,
  à propos, panneau de clôture, en-tête et pied de page, avec les textes
  anglais dans `apps/site/src/i18n/ui/en.ts`.
- La documentation du Website sous `/docs/` : pages Starlight générées à partir
  d'une liste autorisée de documents du dépôt et de ce changelog, avec la
  recherche Pagefind, la réécriture des liens vers les pages du site ou GitHub,
  et un avis de repli en anglais pour les traductions manquantes ou obsolètes.
- `docs/how-to/update-emet.md` : comment mettre à jour les plugins et activer la
  mise à jour automatique du marketplace.
- Codex comme Agent host : `agentHost` dans `emet.config.json`, `emet dispatch`
  et `emet review-run` lancent chaque worker et reviewer comme un processus
  `codex exec`, les skills `$emet:run`, `$emet:init` et `$emet:doctor` et le
  manifeste du plugin Codex, ainsi que le test de bout en bout optionnel
  (`EMET_CODEX_E2E=1`).
- `docs/guide/codex.md`, le guide Codex, publié sur le Website.

### Modifié

- La valeur par défaut de `codex.sandbox` est `danger-full-access`
  (`workspace-write` reste accepté), transmise par `emet dispatch`,
  `emet review-run` et un `emet launch` Codex ; `emet guard` sur Codex refuse
  toutes les formes de push.
- La surcouche Codex de chaque exécution écrit son propre `config.toml`
  minimal au lieu de lier le vôtre, et ses règles autorisent les formes `-C` et
  les sous-commandes de coordination tandis que le push reste interdit.
- Les workers Codex sont identifiés par leur `threadId` et le chemin de leur
  JSONL, et non par leur pid.
- Le guide Codex rapporte les résultats réels avec Codex : chaque ligne
  `failed` précédente est `verified`, la liste `unverified` se réduit à la
  supervision sans surveillance, et le rapport de sonde énumère les suites
  restantes.

### Corrigé

- `emet cleanup` récupère les worktrees atterris sans propriétaire.
- L'Agent host Codex se résout par défaut, de sorte que `emet preflight`,
  `doctor`, `cleanup`, `status` et `usage` acceptent `agentHost: "codex"`.
- La résolution des modèles Codex lit `models_cache.json` depuis le home de
  l'exécution ou votre vrai home Codex.

## 0.4.0

2026-11-06

### Ajouté

- Option `position` de `emet-mascot` (`pane`, `band` ou `status`) ; `pane` est
  la valeur par défaut et se rabat sur la bande lorsqu'elle ne peut pas
  s'ancrer.
- Une section « Mascot (optional) » dans le README.

### Modifié

- Les images de `emet-mascot` sont alignées sur les six couleurs de la mascotte
  au lieu d'être floutées par un redimensionnement, de sorte que le pixel art
  est net dans le terminal.
- `emet-mascot` 0.2.0 : le `size` par défaut est désormais `small`.
- `docs/how-to/orca-pet.md` devient `docs/how-to/mascot.md`, couvrant le mod et
  le pet d'Orca.

## 0.3.0

2026-11-05

### Ajouté

- Les commandes de plugin `/emet:init` et `/emet:doctor` exécutent `emet init`
  et `emet doctor .` dans Claude Code et résument le résultat.
- `emet doctor` avertit des hooks `forge guard` et `emet guard` dans
  `~/.claude/settings.json` dont le binaire n'existe plus, et affiche une
  commande de sauvegarde suivie de `jq` pour les supprimer. Il ne modifie
  jamais le fichier.
- Fondations de la mascotte : un fichier de phase, le bundle du pet, une
  machine à états du mod, les autres rédacteurs de phase et des images
  matricielles.
- `emet-mascot`, un plugin facultatif qui affiche une mascotte en pixels
  au-dessus du prompt et reflète la session et la phase de l'exécution d'`emet`.
  Il figure dans le marketplace, avec un guide pratique pour le pet d'Orca et
  l'ADR-0016.

### Corrigé

- Le plugin n'expose plus une commande `/emet:emet` en double et cassée ;
  `commands/` est figé sur `run.md`, `init.md` et `doctor.md`.
- La vague suivante se lance désormais avec `/emet:run`, la commande
  qu'enregistre le plugin.

### Modifié

- Le dépôt a déménagé dans l'organisation GitHub `andryorelabs`. Les
  téléchargements de versions, les badges du README et l'URL de clonage
  pointent désormais vers `andryorelabs/emet` ; les anciennes URL
  `AndryOre/emet` continuent de rediriger.
- Les installations autonomes renomment `/emet` en `/emet:run`, comme le
  plugin. `install.sh` installe désormais `commands/run.md`, `init.md` et
  `doctor.md` dans `~/.claude/commands/emet/`, de sorte que `/emet:run`,
  `/emet:init` et `/emet:doctor` sont disponibles sans le plugin. L'ancien
  `~/.claude/commands/emet.md` est supprimé s'il n'a pas été modifié ; une copie
  modifiée est conservée et listée dans le résumé de l'installation.

## 0.2.0

2026-11-05

### Modifié

- Le projet passe de claude-forge à emet : la CLI est `emet`, la commande est
  `/emet`, les agents sont `emet-worker` et `emet-reviewer`, et le README porte
  la nouvelle marque. Les installations et dépôts existants continuent de
  fonctionner : les anciens noms (`forge.config.json`, `.forge/`,
  `docs/agents/forge.md`, `FORGE_*`) sont toujours lus avec un avis, et
  `emet migrate` fait passer un dépôt aux nouveaux noms.

### Ajouté

- `install.sh` fonctionne sans Bun : il installe le shim du binaire autonome
  sous `~/.local/bin/emet`, réécrit les espaces réservés du plugin dans les
  prompts qu'il copie, installe `commands/run.md` sous
  `~/.claude/commands/emet.md` et accepte `shasum -a 256` à la place de
  `sha256sum`.
- Le README indique les vrais prérequis, les deux méthodes d'installation et
  l'ordre `/setup-matt-pocock-skills` puis `emet init`.
- Guide pour les agents (`AGENTS.md`), glossaire du domaine (`GLOSSARY.md`) et
  registres de décisions d'architecture dans `docs/adr/`.
- Tracker markdown local selon la convention `.scratch/`, avec une CLI
  `emet tracker` (`create-spec`, `create-ticket`, `frontier`, `set-state`,
  `comment`, `close`) et `emet validate`, `preflight` et `doctor` conscients du
  tracker local.
- `landing.mode` (`pr` ou `merge`) et `emet land`, qui fait atterrir une vague
  en un seul merge local sans PR ; `emet cleanup` et `emet status` comparent
  avec la branche principale locale en mode merge.
- Binaires `emet` autonomes, `emet --version`, prise en charge de macOS dans la
  CI ainsi que dans l'arbre de processus et le frein mémoire, et manifestes de
  plugin avec un shim `bin/emet`.
- Contrat de skills avec `emet skill-path`, et un `emet doctor` plus complet
  couvrant les skills, le glossaire, les dépréciations et les doubles
  installations.
- `emet init` et `emet map` indépendants du langage pour les dépôts JS, Go,
  Rust et Python.
- ADR-0007 à ADR-0011.
- Index de la documentation, carte du code de l'architecture, dépannage par
  symptôme, un modèle de PR plus riche et `emet/AGENTS.md` avec les règles
  propres au runtime.

### Modifié

- `gh` n'est requis que lorsque `tracker.kind` vaut `github` ou que
  `landing.mode` vaut `pr`.
- `emet init` ne sélectionne plus le tracker local par défaut.
- L'ADR-0004 est amendé : une vague atterrit en une PR ou en un merge local.

## 0.1.0

2026-11-03

### Ajouté

- La commande globale `/forge` : entretien, spec, tickets, une seule
  approbation, puis des agents de worktree en parallèle qui implémentent,
  testent et fusionnent une fonctionnalité sans surveillance.
- La CLI `forge` avec les sous-commandes `init`, `doctor`, `preflight`,
  `selftest`, claims, slots, gates, vérifications de handoff, results et
  metrics.
- Les agents `forge-worker` et `forge-reviewer`.
- Des trackers pour Linear et GitHub Issues.
- Configuration par dépôt via `forge.config.json`.
- `install.sh`, qui installe la CLI, la commande et les agents.
