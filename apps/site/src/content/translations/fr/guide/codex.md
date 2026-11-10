---
title: Exécuter emet sur Codex
description: "Utilisez Codex comme Agent host d'emet : installez le plugin, configurez agentHost, approuvez une seule fois et connaissez les limites."
seoTitle: Exécuter emet sur Codex
sourceHash: fedf7f4694193076
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

4. Installez la CLI `emet` comme décrit dans [Prise en main](getting-started.md), puis lancez `emet doctor .`. `install.sh` installe aussi les commandes et agents Claude Code sous `~/.claude` ; c'est sans effet sur Codex, et `emet doctor` n'avertit pas que le plugin Codex et `install.sh` sont présents ensemble. Sur l'hôte Codex, il signale un `codex` plus ancien que `codex.minVersion`, un indicateur `--json` ou `--output-schema` absent de `codex exec`, et un `mattpocock-skills` manquant avec les deux commandes ci-dessus.

Les deux commandes de plugin de l'étape 3 ont été exécutées contre le vrai `codex` (0.167.0) : dans un `CODEX_HOME` neuf, elles se terminent avec le code 0 et `codex plugin list` affiche `emet@emet-marketplace installed, enabled`. La forme avec chemin local, `codex plugin marketplace add <repo>`, donne le même résultat.

## Choisir l'Agent host

Définissez `agentHost` dans `emet.config.json` :

```json
{ "agentHost": "codex" }
```

La valeur par défaut est `"claude"`. La section `codex` règle les modèles, l'effort, la version minimale et le sandbox ; voir la [référence de configuration](../reference/configuration.md#codex) et [Modèles et effort](models-and-effort.md). Lancez une exécution depuis Codex avec `$emet:run`. `emet launch <spec> --wave <n>` démarre une vague dans un `codex exec` détaché et enregistre son id de fil, de sorte que `codex exec resume <id>` la poursuit ; aucun onglet Orca n'est ouvert.

## L'approbation unique

emet demande une seule approbation, après le plan. Sur Claude Code, c'est une invite. Sur Codex, c'est un hook :

- Tant que `.emet/runs/spec<id>/approval.json` n'existe pas, `emet guard` refuse toute mutation (`apply_patch`, `Bash`) sauf les écritures sous `.emet/runs/**/draft/**`, avec le motif `not approved: send approve <id>`. Le verrou s'applique dès qu'un répertoire `.emet/runs/spec<id>/` existe sans son `approval.json`, état dans lequel `$emet:run` laisse l'exécution après la Phase 4, qui matérialise le spec.
- Vous approuvez en envoyant une ligne d'invite qui est exactement `approve <id>`. Le hook `UserPromptSubmit` écrit alors le fichier d'approbation avec le même hachage que `emet approve`. Les mêmes mots dans la sortie d'un outil ou dans le texte du modèle n'ont aucun effet.
- L'alternative est `/plan $emet:run` : approuvez le plan dans le mode plan propre à Codex plutôt que par le hook.

Dès que ce répertoire existe, le verrou échoue en mode fermé : un fichier d'approbation absent ou illisible maintient les mutations refusées. Le guard vérifie aussi chaque chemin d'un `apply_patch` par rapport au `.emet/surface.json` du ticket.

## Comment se déroule une vague

- `emet dispatch --role worker` vérifie le claim et le slot, crée `.emet/worktrees/agent-<ticket>`, construit une surcouche `CODEX_HOME` par exécution sous `.emet/runs/<run>/codex-home/`, et lance `codex exec` avec le modèle et l'effort résolus, le mode `codex.sandbox` (`danger-full-access` par défaut), `--json` et `--output-schema`. Les événements sont capturés dans `.emet/runs/<run>/codex/<ticket>.jsonl`. Le worker est identifié par le `threadId` de son événement `thread.started` et par ce chemin JSONL ; l'identifiant de processus n'est qu'un champ auxiliaire.
- La surcouche est générée, pas liée. Votre `auth.json` est lié par un lien symbolique (jamais copié), le cache du plugin emet est lié depuis votre home Codex quand il existe, et la surcouche écrit son propre `config.toml` minimal : le marketplace local et `[plugins."emet@emet-marketplace"] enabled = true`, une table `[projects."<dir>"]` marquée `trusted` uniquement pour les répertoires propres à l'exécution, ainsi que le `model` et le `model_reasoning_effort` résolus. Aucune de vos tables `[projects]` ni aucun autre réglage n'est copié, et votre `~/.codex` n'est jamais modifié.
- Le `rules/default.rules` de la surcouche autorise `git add`, `git commit`, `git status`, `git worktree`, `git -C <dir> ...` et les sous-commandes `emet` `dispatch`, `review-run`, `launch`, `claims`, `slots`, `results`, `handoff` et `ask`, et interdit `git push`. Comme le sandbox par défaut ne bloque plus les écritures, `emet guard` refuse aussi toute commande `Bash` dont l'argv exécute `git push`, y compris `git -C <dir> push` et `git --git-dir=<dir> push`, quel que soit le sandbox.
- Un worker n'a jamais de canal parallèle vers le coordinateur. Il escalade via la boîte aux lettres du run : `emet ask --run <run> --ticket <ticket> --body <text>` enregistre une question et affiche son id, et `emet ask ... --wait <n>` interroge la réponse (le code de sortie 0 l'affiche, 3 signifie que la tranche est écoulée, 4 signifie que `budgets.askWaitMinutes` est épuisé, donc le worker écrit un résultat BLOCKED et se termine). Tant qu'un worker vivant a une question ouverte, `emet dispatch --wait` affiche `question <ticket> <id>` au lieu d'un statut de résultat et ne classe jamais le worker comme bloqué ; le coordinateur lit `emet inbox --run <run>`, répond avec `emet reply --run <run> --ticket <ticket> --id <n> --body <text>` et reprend `emet dispatch --wait`. Un résultat enregistré l'emporte toujours sur une question ouverte. Voir [ADR-0023](../adr/0023-cli-owned-mailbox-for-codex-workers.md).
- Les résultats sont lus dans `<git-common-dir>/.emet/runs/<run>/results/`, au même endroit où écrit `emet results --write`, de sorte qu'un worker dans son propre worktree est retrouvé.
- `emet review-run` exécute le relecteur en lecture seule sur un paquet issu de `emet review-package` ; le niveau `passive` ne lance aucun processus.
- Les modèles sont résolus dans `models_cache.json` du home de l'exécution, sinon de votre vrai home Codex (en lecture seule). Un slug configuré qui n'est pas listé est remplacé et la substitution est journalisée ; si rien ne se résout, `emet review-run` échoue avant l'appel au modèle et nomme le rôle et les slugs listés.
- L'usage et la détection de blocage lisent le JSONL capturé : l'usage de tokens depuis les événements `turn.completed` et la vivacité depuis la croissance du fichier, si bien qu'un worker dans un autre espace de noms de pid reste considéré comme vivant. `emet preflight` et `emet cleanup` partagent une seule règle pour un worktree sans propriétaire récupérable (branche de worker, ticket atterri, arbre propre, aucun verrou étranger), de sorte que preflight ne recommande `emet cleanup` que lorsque cleanup agirait.

## Ce qu'a montré l'exécution réelle de Codex

Le [rapport de sonde](../research/codex-probe-report.md) a relancé chaque vérification avec `codex-cli 0.167.0` (offre gratuite ChatGPT, Linux) après ces changements. Toutes les lignes `failed` précédentes sont maintenant `verified` :

- Un flux de 2 vagues a fait atterrir de vrais commits de workers Codex sur le trunk : la vague 1 depuis `emet dispatch`, la vague 2 depuis une session lancée par `emet launch <spec> --wave 2` qui a chargé `$emet:run` depuis le cache du plugin de la surcouche. `emet review-run` s'est exécuté dans chaque flux.
- Le e2e optionnel (`EMET_CODEX_E2E=1`) passe : le worker committe sous `danger-full-access`, et `codex execpolicy check` répond `forbidden` pour `git push origin develop` et `allow` pour `git -C <dir> commit`.
- `~/.codex/config.toml` a gardé le même sha256 pendant la sonde, le e2e et sept flux.

## Limites et points `unverified`

- L'effort `ultra` n'est jamais envoyé et il est rejeté dans la configuration.
- `danger-full-access` est la valeur par défaut de `codex.sandbox` pour les workers Codex et `emet launch`, parce que le sandbox `workspace-write` met `.git` en lecture seule et qu'un worker ne pourrait pas committer. Réglez `codex.sandbox` sur `"workspace-write"` pour garder le sandbox ; les workers ne peuvent alors pas committer. [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) consigne ce compromis. Le chemin Claude ne l'utilise jamais. Sans sandbox, le refus de push dans `emet guard` et le fichier de règles sont les garde-fous.
- Il n'existe pas d'équivalents de `ScheduleWakeup`, `TaskStop` ni `LSP`. emet interroge plutôt sa propre CLI.
- Les fichiers rollout sous `~/.codex/sessions` n'ont pas de format stable ; emet lit donc la sortie de `exec --json` qu'il a lui-même capturée.
- Vérifié contre la vraie CLI, et toujours derrière de petites fonctions pour qu'un changement dans Codex ne touche qu'un endroit : un `CODEX_HOME` par exécution avec authentification liée, le fichier de règles à `rules/default.rules`, `--dangerously-bypass-hook-trust`, l'alias `CLAUDE_PLUGIN_ROOT` dans les commandes de hook, le format de sortie de `codex plugin list`, un modèle qui charge une skill par son nom, `emet dispatch` dans une session imbriquée, un modèle qui tente de falsifier `approval.json` (refusé) et les deux formes de `codex plugin marketplace add`. Voir [la recherche de viabilité](../research/codex-viability.md).
- Toujours `unverified` : exécuter Codex depuis un superviseur non surveillé sous systemd ou dans un conteneur (seul un processus détaché a été testé).
- Suites connues du rapport de sonde : `emet init` écrit des noms de modèles Claude dans `models` pour `agentHost: "codex"`, un `emet dispatch --model` explicite n'est pas résolu dans le cache, `emet lock-reason` cherche un ancêtre `claude`, et un ticket dont le worker est mort ne peut pas être redispatché dans le même worktree.
- Les noms et les prix des modèles Codex changent ; la table des prix devra être revérifiée une fois de vraies vagues exécutées.
