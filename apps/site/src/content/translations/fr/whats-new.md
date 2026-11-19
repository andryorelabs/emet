---
title: Nouveautés
description: Notes de version d'emet : ce qui a changé dans chaque version.
seoTitle: Nouveautés d'emet : notes de version
sourceHash: b47ea0e52bb41632
---

## 0.9.0

2026-11-19

### Ajouté

- `emet gate` applique une politique de correction puis de poursuite : une wave retenue exécute des tours de correction jusqu'à ce que les constats soient résolus ou que `budgets.fixRounds` (2 par défaut) soit épuisé, puis s'arrête. `gate.onHold` choisit `fix-and-continue` (par défaut) ou `stop`. `emet review --recheck` ne résout un constat que par le verdict d'un relecteur.
- `emet ci --wait` interroge les vérifications d'une pull request, relance les jobs instables et signale `pass`, `fail`, `env-fault` ou `timeout`. `emet tracker close` ferme les tickets GitHub de façon idempotente, et `emet chain` exécute gate, readiness, launch et verify en une seule étape.
- Un journal d'événements consigne les décisions du gate, les interventions, les lancements, les fermetures de tickets et les nettoyages, avec une rotation selon la taille. `emet insights` le résume (`--mark-baseline` réinitialise la base de référence), `emet run current` affiche le spec et la wave actifs, et `emet status --brief` imprime l'état sur une ligne.
- Les clés de configuration `language.conversation` et `language.artifacts`.
- Les clés de configuration `handoff.afterSpec` (`release`, `promote` ou `none`, détectée par `emet init` ou définie avec `emet init --after-spec`), `deploy.check` et `interview.research`.
- `emet promote` ouvre la pull request de `develop` vers `main` lorsque la dernière wave est inactive, la fusionne si les vérifications passent et resynchronise `main` lorsque `develop` est en retard. `--no-promote` retient un spec sur toutes ses sessions.
- `emet deploy-check` relance une commande de vérification de déploiement et tue les commandes bloquées.
- `emet fleet list | set | launch` exécute des specs sur plusieurs dépôts.
- `emet setup` et `/emet:setup` installent des compléments optionnels depuis un catalogue après avoir sauvegardé les paramètres de Claude. Un hook SessionStart affiche un avis une seule fois, et `install.sh` exécute setup dans un TTY.
- `emet doctor` et `emet init` recommandent Engram sans jamais le compter comme une dépendance non satisfaite.

### Modifié

- Les prompts et la documentation installés décrivent la politique du gate, `emet ci`, `emet chain`, le journal, l'étape après le spec, fleet et setup. La phase 8 ajoute un résumé de wave et une notification push, et `emet insights` remplace le renvoi vers `/retro`.

### Corrigé

- `--no-promote` est conservé sous forme de marqueur dans le répertoire git commun, de sorte qu'une session chaînée `/emet:run --dispatch` pour la dernière wave ne promeut plus `develop` vers `main`.

## 0.8.6

2026-11-17

### Corrigé

- Le workflow de release installe Chromium avant de relancer les vérifications sur le tag, comme le fait le job de tests de la CI, si bien que la vérification ne s'arrête plus au plancher de couverture de `tools/`. v0.8.5 a été étiquetée mais jamais publiée à cause de cela ; ses changements sont livrés dans cette version.

## 0.8.5

2026-11-17

### Modifié

- Le gate de couverture impose un plancher par fichier de 97 % des lignes et 98 % des fonctions pour `emet/`, `apps/site` et `tools/`, avec des exceptions motivées dans `tools/coverage-exceptions.ts`. Le manifeste de couverture parcourt `emet/src` récursivement, `tools/` est contrôlé, et les totaux de `tools/coverage-floors.json` montent aux valeurs mesurées.
- Le guard PreToolUse échoue en mode fermé : quand `bin/emet` ne peut pas résoudre le binaire emet, le hook sort avec 2 et bloque l'appel d'outil, avec un message qui explique comment se rétablir. Les hooks Stop et SubagentStop sortent toujours avec 1.
- Les manifestes du plugin portent l'e-mail de l'auteur, la licence, la page d'accueil, le dépôt et l'URL des bugs, et les descriptions des skills Codex indiquent quand utiliser chacune.

### Corrigé

- `emet doctor` sort avec le code 3 quand une erreur inattendue s'échappe, au lieu de 0. Un code de sortie non nul défini plus tôt est conservé.
- `emet cleanup --all --force` récupère le worktree et les branches du worker d'une exécution morte, y compris les worktrees sous `.claude/worktrees/`. Un propriétaire vivant ou inactif, et un verrou qui ne nomme aucune exécution, restent protégés.
- Le guard d'édition reconnaît une surface écrite littéralement, comme `src/app/[locale]/page.tsx`. `[` et `]` dans une surface ne forment plus une classe de caractères.
- `emet preflight --post-dispatch` échoue quand un ticket qui détient encore une réservation ou un slot a perdu son worktree de worker, et indique au coordinateur de le re-dispatcher au lieu de le reprendre.
- Le binaire compilé `emet` ne charge plus de fichier `.env` du répertoire courant.
- Le site web retire les attributs de style en ligne de la page d'accueil, donne aux libellés de l'accueil un contraste AA en mode clair et nomme le bouton de recherche avec son texte visible dès le premier rendu. Les images de la documentation sont servies depuis l'origine propre du site sous `repo-assets` au lieu de `raw.githubusercontent.com`, et `astro dev` les sert aussi.

## 0.8.4

2026-11-15

### Modifié

- L'en-tête de la page d'accueil se compose désormais de deux groupes aux extrémités : le logo et Docs à gauche ; recherche, étoiles GitHub, thème et langue à droite. Ses contrôles et la pastille de version sont en verre translucide sur le ciel, et le lien en double vers Nouveautés a disparu de l'en-tête et du menu de la page d'accueil.

## 0.8.3

2026-11-15

### Corrigé

- `/docs/` et le `/docs/` de chaque langue répondent désormais par une redirection 301 vers la page de prise en main, au lieu d’une page meta-refresh qui s’affichait brièvement sans style.

## 0.8.2

2026-11-11

### Corrigé

- `emet cleanup` conserve une branche d'amorçage `worktree-<name>` tant que le worktree `<name>` existe encore, pour qu'une session qui y travaille sur une autre branche garde la branche que son hôte attend.

## 0.8.1

2026-11-11

### Ajouté

- `emet cleanup` supprime les branches d'amorçage `worktree-<name>` que l'Agent host laisse derrière lui, quand rien ne les a extraites et que trunk contient déjà leur tête.

### Corrigé

- Le guard refuse une suppression forcée de branche dans toute écriture qui associe une option de suppression à une option de force, et pas seulement avec l'option en majuscule.

## 0.8.0

2026-11-11

### Ajouté

- `emet cleanup` supprime, dans tous les modes, chaque branche locale dont la pull request a été fusionnée au commit de tête de la branche, avec le worktree d'agent propre et non verrouillé qui la contient. Les branches d'intégration, de release et de correctif n'attendent plus une suppression manuelle.
- `bun run translations:status` liste les traductions du Website en retard sur leur source.

### Modifié

- Le refus par le guard d'une suppression forcée de branche renvoie vers `emet cleanup`.
- Le runbook de release couvre les traductions de `whats-new`.

## 0.7.0

2026-11-11

### Ajouté

- Le Website sert le schéma de configuration à l'adresse `https://emet.andryore.dev/schema/emet.config.schema.json`.
- `docs/development.md` et `docs/security.md`.
- Un seuil de couverture par workspace, que `bun run test` fait respecter.

### Modifié

- `emet init` écrit l'URL publique de `$schema` dans `emet.config.json` au lieu d'un chemin local.
- Les tags de version sont signés, et le workflow Release échoue lorsque la section du CHANGELOG correspondant au tag est absente ou vide.
- Le dépôt suit le standard andryorelabs v1 : rulesets sous forme de code, fichiers communautaires, structure du README et noms de scripts standard (`format:write`, `lint:commits`).

## 0.6.1

2026-11-10

### Corrigé

- Deux processus qui reprennent en même temps le même verrou périmé ne peuvent plus entrer tous deux dans la section critique ; les claims, la Mailbox, le tracker et `acquireLock` partagent une même reprise protégée.
- Les appels concurrents à `emet tracker create-ticket` n'échouent plus de façon intermittente.

## 0.6.0

2026-11-10

### Ajouté

- Une Mailbox pour les workers Codex : `emet ask` enregistre une question (et interroge la réponse avec `--wait`), `emet inbox` liste les questions ouvertes et `emet reply` en répond une, de sorte qu'un worker ne remonte plus par une note de passation.
- `emet dispatch --wait` affiche `question <ticket> <id>` tant qu'un worker actif a une question ouverte, et ne classe jamais ce worker comme bloqué.
- `emet claims --reserve` enregistre les surfaces d'édition du ticket et refuse une réservation qui chevauche les surfaces d'une autre exécution.

### Corrigé

- `emet dispatch --wait` lit les résultats dans le répertoire d'exécution du git-common-dir, là où `emet results --write` les écrit.

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
