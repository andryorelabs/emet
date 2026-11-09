---
title: Exécuter emet sur Codex
description: "Utilisez Codex comme Agent host d'emet : installez le plugin, configurez agentHost, approuvez une seule fois et connaissez les limites."
seoTitle: Exécuter emet sur Codex
sourceHash: a64f64be24588f52
---

emet peut s'exécuter sur Codex CLI comme sur Claude Code. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md) ; le produit dans lequel une exécution tourne est l'**Agent host**. Cette page couvre l'installation côté Codex, le choix de l'hôte, l'approbation unique et les limites connues. Retour à l'[index de la documentation](../README.md).

Sur l'hôte Codex, le pipeline est le même : entretien, spec, tickets, une approbation, workers parallèles dans des worktrees, une revue par vague, puis l'atterrissage. Seule la plomberie change. Chaque worker et chaque relecteur est son propre processus `codex exec`, lancé par `emet dispatch` et `emet review-run`, et les commandes slash deviennent les skills `$emet:run`, `$emet:init` et `$emet:doctor`. Le chemin Claude Code n'est pas modifié.

## Installation

1. Installez la CLI `codex` à la version indiquée par `codex.minVersion` (par défaut `0.167.0`) ou plus récente, puis connectez-vous.
2. Installez le plugin `mattpocock-skills` dans Codex :

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

3. Installez le plugin emet. Le dépôt fournit `.codex-plugin/plugin.json` ainsi que les skills et hooks générés sous `codex/` :

   ```bash
   codex plugin marketplace add andryorelabs/emet
   codex plugin add emet@emet-marketplace
   ```

4. Installez la CLI `emet` comme décrit dans [Prise en main](getting-started.md), puis lancez `emet doctor .`. Sur l'hôte Codex, il signale un `codex` plus ancien que `codex.minVersion`, un indicateur `--json` ou `--output-schema` absent de `codex exec`, et un `mattpocock-skills` manquant avec les deux commandes ci-dessus.

Les deux commandes de plugin de l'étape 3 suivent le schéma que le spike a vérifié pour un marketplace local ; leur graphie exacte pour ce dépôt reste `unverified` jusqu'à la première version.

## Choisir l'Agent host

Définissez `agentHost` dans `emet.config.json` :

```json
{ "agentHost": "codex" }
```

La valeur par défaut est `"claude"`. La section `codex` règle les modèles, l'effort, la version minimale et le sandbox ; voir la [référence de configuration](../reference/configuration.md#codex) et [Modèles et effort](models-and-effort.md). Lancez une exécution depuis Codex avec `$emet:run`. `emet launch <spec> --wave <n>` démarre une vague dans un `codex exec` détaché et enregistre son id de fil, de sorte que `codex exec resume <id>` la poursuit ; aucun onglet Orca n'est ouvert.

## L'approbation unique

emet demande une seule approbation, après le plan. Sur Claude Code, c'est une invite. Sur Codex, c'est un hook :

- Tant que `.emet/runs/spec<id>/approval.json` n'existe pas, `emet guard` refuse toute mutation (`apply_patch`, `Bash`) sauf les écritures sous `.emet/runs/**/draft/**`, avec le motif `not approved: send approve <id>`. Le verrou s'applique dès qu'un répertoire `.emet/runs/spec<id>/` existe sans son `approval.json`, état dans lequel `/emet:run` laisse l'exécution après la Phase 4, qui matérialise le spec.
- Vous approuvez en envoyant une ligne d'invite qui est exactement `approve <id>`. Le hook `UserPromptSubmit` écrit alors le fichier d'approbation avec le même hachage que `emet approve`. Les mêmes mots dans la sortie d'un outil ou dans le texte du modèle n'ont aucun effet.
- L'alternative est `/plan $emet:run` : approuvez le plan dans le mode plan propre à Codex plutôt que par le hook.

Dès que ce répertoire existe, le verrou échoue en mode fermé : un fichier d'approbation absent ou illisible maintient les mutations refusées. Le guard vérifie aussi chaque chemin d'un `apply_patch` par rapport au `.emet/surface.json` du ticket.

## Comment se déroule une vague

- `emet dispatch --role worker` vérifie le claim et le slot, crée `.emet/worktrees/agent-<ticket>`, construit une surcouche `CODEX_HOME` par exécution sous `.emet/runs/<run>/codex-home/` qui lie votre authentification et votre configuration au lieu de les copier, et lance `codex exec` avec le modèle et l'effort résolus, le mode `codex.sandbox` (`workspace-write` par défaut), `--json` et `--output-schema`. Les événements sont capturés dans `.emet/runs/<run>/codex/<ticket>.jsonl`.
- Les règles de la surcouche autorisent `git add` et `git commit` et interdisent `git push`. Votre `~/.codex` n'est jamais modifié.
- `emet review-run` exécute le relecteur en lecture seule sur un paquet issu de `emet review-package` ; le niveau `passive` ne lance aucun processus.
- L'usage et la détection de blocage lisent le JSONL capturé : l'usage de tokens depuis les événements `turn.completed`, la vivacité depuis le processus `codex` et l'heure de modification du fichier.

## Limites et points `unverified`

- L'effort `ultra` n'est jamais envoyé et il est rejeté dans la configuration.
- `danger-full-access` n'est disponible qu'en réglant `codex.sandbox` sur cette valeur ; rien ne l'active par défaut.
- Il n'existe pas d'équivalents de `ScheduleWakeup`, `TaskStop` ni `LSP`. emet interroge plutôt sa propre CLI.
- Les fichiers rollout sous `~/.codex/sessions` n'ont pas de format stable ; emet lit donc la sortie de `exec --json` qu'il a lui-même capturée.
- La recherche marque ces comportements comme `unverified`, et chacun se trouve derrière une petite fonction pour qu'un changement dans Codex ne touche qu'un endroit : un `CODEX_HOME` par exécution avec authentification liée, l'emplacement du fichier de règles dans la surcouche, `--dangerously-bypass-hook-trust`, l'alias `CLAUDE_PLUGIN_ROOT` dans les commandes de hook, le format de sortie de `codex plugin list`, un modèle qui charge une skill par son nom, et `emet dispatch` dans un sandbox imbriqué. Voir [la recherche de viabilité](../research/codex-viability.md).
- Aucune tentative d'un modèle de falsifier `approval.json` n'a été observée. Le verrou refuserait la tentative, mais cela reste `unverified`.
- Exécuter Codex depuis un superviseur non surveillé (systemd, conteneur) après la fin de la session qui l'a lancé est `unverified`.
- Les noms et les prix des modèles Codex changent ; la table des prix devra être revérifiée une fois de vraies vagues exécutées.
