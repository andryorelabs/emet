---
title: Référence de configuration
description: Chaque clé de emet.config.json avec sa valeur par défaut et sa signification.
seoTitle: Référence de configuration d'emet
sourceHash: 021a695d999163e3
---

Chaque clé de `emet.config.json`, avec sa valeur par défaut et sa signification. La source de vérité est [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json). Les termes suivent [GLOSSARY.md](../../GLOSSARY.md). Retour au [README](../../README.md).

`emet init` écrit le fichier avec `$schema` défini sur l'URL publique `https://emet.andryore.dev/schema/emet.config.schema.json`, que le site web sert à l'octet près identique à la source de vérité, afin que les éditeurs proposent la complétion partout. `emet preflight` et `emet doctor` le valident. Une clé marquée « prose uniquement » est lue par les prompts de `/emet` (les skills `$emet:*` sur Codex), pas par la CLI. Une clé marquée obsolète est toujours acceptée. Le schéma autorise aussi une clé de texte libre `"//"` pour des notes (jamais lue par aucun outil) et `"version"`, qui vaut toujours `1`.

## language

- `conversation` (par défaut `"en"`): balise BCP 47 de la langue dans laquelle l'agent répond à l'utilisateur.
- `artifacts` (par défaut `"en"`): balise BCP 47 de la langue du code, des commentaires, des messages de commit, du texte des PR, des tickets et de la documentation.

Les deux doivent être des chaînes non vides. Une configuration sans section `language` se charge avec les deux à `"en"`, et `emet init` écrit les deux. Les prompts installés les lisent.

## pr

Comment la PR d'une vague est fusionnée.

```json
{ "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 } }
```

- `autoMerge` (par défaut `true`) : attend les checks de la PR puis fusionne ; sans checks, fusionne immédiatement. Un check en échec est corrigé et poussé, jusqu'à `maxCiFixAttempts` fois, puis la PR est laissée ouverte à un humain. Une vague avec quoi que ce soit de signalé n'est jamais fusionnée automatiquement.
- `mergeMethod` (par défaut `squash`) : `squash`, `merge` ou `rebase`, transmis à `gh pr merge`.
- `maxCiFixAttempts` (par défaut `2`, minimum `0`) : combien de fois le coordinateur peut tenter de corriger un check en échec avant de laisser la PR ouverte à un humain.

## handoff

Ce qui se passe après la clôture d'une vague, et les limites de taille de la note de handoff d'un worker. Validé par `emet preflight`.

```json
{
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `maxLines` (par défaut `60`) : nombre maximal de lignes qu'une note `.emet/handoff-<ticket>.md` peut avoir avant que `emet handoff --check` la rejette.
- `maxChars` (par défaut `8000`, environ 2k tokens) : nombre maximal de caractères qu'une note de handoff peut avoir.
- `autoChain` (par défaut `false`) : après une vague propre et fusionnée, s'il reste des vagues, lance la suivante au lieu d'afficher `/emet:run --dispatch <spec-id>` (`$emet:run --dispatch <spec-id>` sur Codex). Sur Claude Code, le lancement se fait avec `claude --bg` ; sur l'hôte Codex, c'est un `codex exec` détaché, qui exige `codex` en version `codex.minVersion` ou plus récente. Les prérequis ci-dessous sont ceux de Claude Code. Inspectez-la avec `claude agents` ou `claude attach emet-<spec-id>-w<n>`. Prérequis :
  1. `claude` dans le PATH, avec la prise en charge de `--bg`.
  2. Un espace de travail de confiance. `--bg` s'exécute de façon non interactive, donc la boîte de dialogue de confiance ne s'affiche jamais ; ouvrez `claude` en mode interactif dans le dépôt une fois et acceptez-la.
  3. L'avertissement de contournement accepté une fois dans une session interactive (`skipDangerousModePermissionPrompt`), puisque la vague suivante s'exécute dans `handoff.permissionMode`, et non dans le mode de la session qui la lance.

  Elle ne se lance que lorsque la PR a été fusionnée et que rien n'a été signalé, et elle est ignorée si une session `emet-<spec-id>-*` est déjà active (`claude agents --json`). Si le lancement échoue, elle se rabat sur l'affichage de `/emet:run --dispatch <spec-id>`.

- `afterSpec` (par défaut `"none"`, parmi `release`, `promote`, `none`) : ce que fait `/emet:run` une fois la dernière vague d'une spec fusionnée sans problème. `promote` exécute `emet promote` : une pull request de `develop` vers `main` fusionnée avec un commit de merge dès que la CI est `pass`, puis une pull request de resynchronisation en sens inverse seulement si `develop` est en retard sur `main`. `release` ouvre la pull request de release en suivant les étapes du skill `cut-release` et s'arrête pour qu'une personne reprenne la main. `none` ne fait rien. `emet init` le détecte (`release` avec un tag `v*` et un fichier de workflow dont le nom contient `release` ; `promote` avec une branche `develop` et sans un tel tag ; sinon `none`), et `emet init --after-spec <mode>` le force. Une configuration qui ne le contient pas se charge comme `none`. `--no-promote`, passé à `/emet:run` ou à `emet promote`, met l'étape à `none` pour cette exécution.

  `afterSpec` accepte aussi une liste ordonnée non vide de règles, `{ "paths"?: string[], "mode": "release|promote|none" }`, de sorte qu'un même dépôt puisse publier une CLI et promouvoir un site web. Le mode est choisi d'après les chemins que la promotion de `develop` apporterait dans `main` : la première règle dont les `paths` correspondent à tous les chemins modifiés l'emporte ; sinon s'applique la règle sans `paths` (seule la dernière règle peut en être dépourvue) ; sinon `none`. Aucun chemin modifié retombe aussi sur cette règle de repli. Les globs utilisent le matcher du garde d'édition, donc les segments `[locale]` et `(group)` sont littéraux. Les chemins modifiés proviennent de `git fetch origin main develop` et de `git diff --name-only --no-renames -z origin/main...origin/develop`, si bien qu'un renommage compte son ancien et son nouveau chemin. Ils ne sont lus que lorsque `afterSpec` est une liste de règles ou que `deploy.check.paths` est défini, et seulement quand `repo.trunk` vaut `develop` ; sinon la liste est vide. Un échec de git fait sortir `emet promote` avec 1 sans rien ouvrir. La forme chaîne ne regarde jamais les chemins.

  ```json
  {
    "handoff": {
      "afterSpec": [
        { "paths": ["apps/site/**", "docs/**"], "mode": "promote" },
        { "mode": "release" }
      ]
    }
  }
  ```

  Ici, une spec qui ne touche que le site web ou la documentation est promue, et toute spec qui touche la CLI s'arrête à une pull request de release.

- `launcher` (par défaut `auto`, parmi `auto`, `orca`, `bg`) : Claude Code uniquement ; ignoré sur l'hôte Codex, où `emet launch` n'ouvre aucun onglet Orca. Ouvre aussi la vague dans un onglet Orca exécutant `claude attach`. `auto` interroge le runtime d'Orca (`orca status`), donc cela fonctionne aussi depuis des sessions `claude --bg`, qui n'ont pas de `TERM_PROGRAM` ; `orca` essaie toujours ; `bg` jamais. La vague s'exécute en arrière-plan dans tous les cas, et un onglet qui ne s'ouvre pas n'arrête jamais la chaîne. `emet launch <spec-id> --wave <n>` fait tout le lancement ; voir [`emet launch`](cli.md#exécutions-workers-et-slots).
- `permissionMode` (par défaut `bypassPermissions`, parmi `bypassPermissions`, `auto`, `acceptEdits`) : Claude Code uniquement ; ignoré sur l'hôte Codex, où la session chaînée utilise [`codex.sandbox`](#codex). Mode d'autorisation de la session chaînée. Il n'est pas hérité de la session qui la lance, car le classificateur du mode `auto` peut refuser une étape comme `gh pr merge` et laisser une vague à moitié terminée. Vos règles `permissions.deny` s'appliquent toujours, mais l'avertissement de contournement doit avoir été accepté une fois en mode interactif (`skipDangerousModePermissionPrompt`).

## deploy

Optionnel. Absent, il n'y a aucune vérification de déploiement.

```json
{
  "deploy": {
    "check": {
      "command": "curl -fsS https://example.com/health",
      "retries": 10,
      "intervalSeconds": 15,
      "timeoutSeconds": 300,
      "paths": ["apps/site/**"]
    }
  }
}
```

- `check.command` : commande shell qui se termine avec 0 lorsque le déploiement est sain.
- `check.retries`, `check.intervalSeconds`, `check.timeoutSeconds` : entiers positifs ; le nombre maximal de tentatives, l'attente entre elles et la limite de temps globale. `emet deploy-check` affiche `ok`, `failed` ou `timeout` et se termine avec 0, 1 ou 3.
- `check.paths` (facultatif) : une liste non vide de globs non vides. Avec elle, un promote fusionné n'exécute la vérification que si un chemin modifié correspond ; sans elle, tout promote fusionné l'exécute.

La vérification ne dépend plus de `afterSpec`. `emet promote` affiche `deployCheck: { run, reason }` et le coordinateur n'exécute `emet deploy-check` que lorsque `run` vaut true : jamais sans `deploy.check` ni après une dernière vague qui n'est pas propre ; sur `repo.trunk` `main`, où chaque fusion déploie, après une dernière vague propre quel que soit le mode (y compris avec `--no-promote` ou une spec retenue, et en ignorant `paths`) ; sur `develop`, uniquement en mode `promote` après un promote fusionné qui correspond à `paths`. En mode `release`, le déploiement attend une personne.

## interview

- `research` (par défaut `true`) : quand il vaut `true`, la Phase 1 de `/emet:run` fait chercher à l'agent la réponse dans le dépôt, la documentation ou des sources primaires, et expliquer pourquoi il recommande une option, avant de poser une question technique qui propose des options. L'utilisateur répond toujours. `false` le désactive.

## gate

Ce que fait `emet gate` des constats bloquants ouverts.

```json
{ "gate": { "onHold": "fix-and-continue" } }
```

- `onHold` (par défaut `fix-and-continue`) : avec `fix-and-continue`, les constats bloquants ouverts répondent `hold` avec `next: "fix-findings"` tant que [`budgets.fixRounds`](#budgets) a encore des tours. La porte ne répond `stop` que lorsqu'un constat ouvert est de type `intent_gap`, que les tours de correction sont épuisés avec des constats ouverts, ou que la suite d'intégration échoue une seconde fois après la relance de ses specs en échec (un premier échec répond `hold` avec `next: "rerun-failed-specs"`). `stop` conserve le comportement précédent. Une CI qui ne s'est jamais exécutée (`--ci env-fault`) répond `hold` avec `next: "rerun-ci"` sans entamer `pr.maxCiFixAttempts`, puis `next: "report-infrastructure"` la deuxième fois de suite.

## budgets

Tous facultatifs.

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "fixRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts` (par défaut `2`, minimum `1`) : combien de fois un ticket peut échouer à `verify` avant que le gate réponde `defer`. Le ticket reçoit le label différé et le reste de la vague continue. Un défaut d'environnement, comme la commande de tests qui se termine avec 126/127 ou une panne du fournisseur, met l'exécution en pause sans consommer de tentative.
- `reviewRounds` (par défaut `2`, minimum `1`) : combien de tours de revue/correction un ticket reçoit avant une escalade vers le niveau de modèle suivant. Tout ce qui reste ouvert après cela reçoit une décision.
- `fixRounds` (par défaut `2`) : combien de tours de correction reçoit une vague sous [`gate.onHold`](#gate) `fix-and-continue`. Chacun se termine par `emet review --recheck` et compte ici, jamais contre `reviewRounds`. Sans tour restant et avec un constat bloquant ouvert, la porte répond `stop`. Un registre écrit sans ce champ compte `0` tour utilisé.
- `stallNudgeCap` (par défaut `6`, minimum `1`) : combien de fois un worker bloqué est relancé. Le compteur n'est jamais remis à zéro.

## models

Modèle et effort par rôle pour l'hôte Claude Code ; l'hôte Codex lit plutôt [`codex.models`](#codex). Chaque clé est facultative ; omettre la section conserve le worker en `sonnet`/`medium` et le relecteur en `opus`/`medium`. L'effort est l'un de `low`, `medium`, `high`, `xhigh`, `max`.

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  }
}
```

- `worker.model` (par défaut `sonnet`), `worker.effort` (par défaut `medium`) : le worker. La ligne `Model:` d'un ticket remplace `worker` pour ce seul worker.
- `reviewer.medium` et `reviewer.high` (par défaut `opus`, `medium` chacun) : le relecteur de chaque niveau de risque renvoyé par `emet assess`. Augmentez `reviewer.high.effort` (par exemple à `high`) pour plus de rigueur sur les vagues risquées.
- `triage` (par défaut `haiku`) : le modèle économique pour le triage des logs de CI et la revue de niveau passif. Un check en échec est confié à un agent sur ce modèle, qui renvoie au plus environ 2k tokens avec des pointeurs `file:line`.
- `escalation` (par défaut `{ "sonnet": "opus" }`) : le niveau de modèle suivant pour chaque nom de modèle, utilisé lorsqu'un ticket atteint son plafond de corrections.

## agentHost

`agentHost` (par défaut `"claude"`): l'hôte d'agent dans lequel s'exécute un run, `"claude"` ou `"codex"`. Voir le [guide Codex](../guide/codex.md).

## codex

Lu uniquement quand `agentHost` vaut `"codex"`. Toutes les clés sont facultatives. L'effort est l'un de `low`, `medium`, `high`, `xhigh`, `max` ; `ultra` n'est jamais accepté.

- `models.worker`, `models.workerOverride`, `models.reviewer.medium`, `models.reviewer.high`, `models.triage`: chacune est `{ "model", "effort", "fallback" }`. `fallback` liste les slugs essayés dans l'ordre quand `model` est absent du cache de modèles de Codex. Les valeurs par défaut sont dans [Modèles et effort](../guide/models-and-effort.md).
- `models.session`: `{ "model", "effort", "planEffort", "fallback" }` pour la session qui exécute `$emet:run`. `planEffort` s'applique jusqu'à la première approbation.
- `effort`: s'il est défini, remplace l'effort de tous les rôles.
- `minVersion` (par défaut `0.167.0`) : la plus ancienne version de la CLI `codex` que emet prend en charge. `emet doctor` ne compare pas la version installée à cette valeur.
- `sandbox` (par défaut `danger-full-access`): le mode de sandbox transmis comme `-s` par `emet dispatch`, `emet review-run` et un `emet launch` Codex. `workspace-write` est aussi accepté, mais il rend `.git` en lecture seule, si bien que les workers ne peuvent pas committer. Quelle que soit la valeur, `emet guard` refuse `git push` sur Codex, et le `config.toml` de la surcouche générée ne contient que le marketplace et le plugin emet, des tables de confiance pour les répertoires propres à l'exécution, ainsi que le modèle et l'effort résolus (jamais vos propres tables). Voir le [guide Codex](../guide/codex.md) et [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md).

## review

```json
{ "review": { "highRiskPaths": [] } }
```

- `highRiskPaths` (par défaut `[]`) : sous-chaînes de chemin supplémentaires, insensibles à la casse, qui forcent le niveau de revue `high` dans `emet assess`, en plus de l'ensemble intégré (authentification, sécurité, paiements, webhooks, CI, l'installateur, lockfiles, migrations et points sensibles dangereux comme le SQL brut ou le pipe-to-shell).

## landing

- `mode` (par défaut `pr`) : `pr` ouvre une pull request (nécessite `gh`). `merge` fusionne la branche d'intégration dans la branche principale locale avec `emet land` et ne pousse jamais, `commands.selfCheck` tenant lieu de CI. Indépendant du tracker. Voir l'[ADR-0010](../adr/0010-local-merge-landing.md).

## tracker

Avec quel issue tracker `/emet` (ou `$emet` sur Codex) dialogue. La CLI lit `kind` pour décider quelles vérifications de dépendances s'appliquent ; le reste documente l'adaptateur que suit la commande `/emet` (voir [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md)).

- `kind` (obligatoire) : `linear`, `github` ou `local`. Pour `local`, voir [Tracker local](cli.md#tracker-local) et l'[ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
- `transitions.onStart`, `transitions.onPrOpen`, `transitions.onPrMerge` : qui écrit chaque transition d'état du ticket : `worker`, `coordinator` ou `automatic` (l'intégration du tracker s'en charge, par exemple l'intégration GitHub de Linear à l'ouverture ou à la fusion d'une PR). Le coordinateur n'écrit jamais une transition marquée `automatic`.
- `github.priorityLabels` : associe un niveau de priorité (`"1"` = P0, le plus haut, à `"4"` = P3) à un nom de label GitHub, par exemple `{"1":"P0","2":"P1"}`. Sans aucun déclaré, les tickets sont ordonnés par `createdAt` croissant et `emet doctor` le signale.
- `github.stateLabels` : associe un état du workflow (`todo`, `in-progress`, `in-review`) à un nom de label GitHub, par exemple `{"todo":"status:todo"}`. `done` et `canceled` sont déduits de l'état fermé de l'issue et de `state_reason`.
- `linear` : réglages propres à Linear (clé d'équipe, noms des états du workflow). Lus uniquement par le modèle qui suit `docs/agents/issue-tracker.md`, jamais par la CLI.
- `local.idPrefix` (obsolète) : les ids de tickets locaux sont désormais `<feature-slug>-<NN>`.
- `readyLabel`, `triageLabels`, `prReference` (obsolètes) : modèles de labels et de référence de PR, par exemple `Closes #{number}` (github) ou `Refs: {id}` (linear).

## preflight

- `requiredFiles` (par défaut aucun) : fichiers que `emet preflight` exige à la racine du dépôt avant la distribution d'une vague, chacun `{ "path", "why" }` ; `why` apparaît dans le message d'échec. Vide signifie que la vérification ne s'exécute pas.
- `requiredCommands` (par défaut aucun) : binaires qui doivent se résoudre dans le PATH avant la distribution. `emet preflight` échoue avec le code 1 en nommant ceux qui ne le sont pas, et `emet doctor` les signale. C'est la liste propre au dépôt, distincte des [vérifications de dépendances](dependencies.md#qui-vérifie-quoi) pilotées par le tracker ; `gh` a déjà une vérification dédiée, donc le lister est facultatif. Ajouts courants : `rg` et `sg`.

## specs

- `dir` (par défaut `docs/specs`) : répertoire, relatif au dépôt, des specs vivantes, écrit par `emet spec-merge`.

## map

- `path` (par défaut `docs/agents/codebase.md`) : chemin, relatif au dépôt, de la carte que génère `emet map`.

## concurrency

- `waveSize` (par défaut `4`, minimum `1`) : nombre maximal d'appels Agent distribués ensemble dans une vague.
- `maxLiveWorkers` (par défaut `auto`) : plafond global partagé par tous les coordinateurs `/emet` qui tournent sur cet hôte, tous dépôts confondus. Le pool de slots se trouve sous `~/.local/state/emet/slots`, et non dans un dépôt en particulier. `auto` déduit le plafond du nombre de CPU et de la RAM de l'hôte ; un entier positif le fixe. Une vérification distincte de marge mémoire (`EMET_MEM_RESERVE_GIB`, par défaut 8 GiB) refuse une acquisition lorsque la mémoire disponible est trop basse, quel que soit ce plafond. La variable d'environnement `EMET_MAX_LIVE_WORKERS` remplace ce champ et accepte aussi `auto`.
- `runIdleThresholdMs` (par défaut `5400000`, 90 minutes) : combien de temps une exécution sans ancre vivante est encore classée comme inactive plutôt que morte, d'après la seule fraîcheur de la transcription. La variable d'environnement `EMET_RUN_IDLE_THRESHOLD_MS` la remplace.

Voir [Variables d'environnement](cli.md#variables-denvironnement).

## ticket

- `idPattern` : source d'une regex ancrée à laquelle l'id d'un ticket doit correspondre, par exemple `^PROJ-\d+$`. Un motif invalide est une erreur de configuration bloquante.
- `branchPrefix` : préfixe en minuscules (`^[a-z0-9-]+$`) pour la branche locale d'un worker. Les branches sont `<branchPrefix>-<number>-<slug>`, et `cleanup` balaie le glob `<branchPrefix>-*`.
- `idExample` (obsolète, prose uniquement) : un exemple d'id correspondant à `idPattern`.
- `branchPattern` (obsolète, prose uniquement) : modèle complet du nom de branche.

## commands

Tous en prose uniquement.

- `selfCheck` : commandes qu'un worker exécute avant de considérer son changement terminé, par exemple `["npm run check"]`. Avec `landing.mode` à `merge`, elles tiennent lieu de CI.
- `workerScopedSuite` : commande qu'un worker exécute pour tester uniquement la zone qu'il a touchée. `emet verify` exige qu'elle passe.
- `fullSuite.run` : commande de la suite de tout le dépôt, exécutée une fois sur la branche d'intégration après la fusion des branches d'une vague. Une exécution au rouge bloque la PR et `autoChain`.
- `fullSuite.singleton` : `true` si un seul worktree peut exécuter la suite à la fois.
- `fullSuite.runInBackground`, `fullSuite.reset` (obsolètes) : indicateur d'arrière-plan et commandes de réinitialisation d'état.

## worktree

- `lockReason` : modèle de la raison du `git worktree lock` qu'un worker écrit au démarrage, rempli par `emet lock-reason`. La valeur par défaut est `emet run={runId} ticket={ticket} anchor={anchorPid} slug={coordinatorSlug} at={iso}`. Ne la remplacez que pour ajouter des champs : `emet lock-reason` refuse un modèle qui omet le jeton littéral `emet`, ou l'un de `run=`, `ticket=`, `anchor=`, `at=` ou `slug=`.
- `copyFromMain` (prose uniquement) : chemins copiés depuis le checkout de la branche principale vers un worktree neuf avant le bootstrap, par exemple des fichiers d'environnement non suivis.
- `bootstrap` (prose uniquement) : commandes shell exécutées une fois dans un worktree neuf avant le démarrage d'un worker, par exemple `["npm ci"]`. Exécutées par la phase 6 de `/emet`, jamais par la CLI.
- `stateDir` (obsolète, prose uniquement) : répertoire des logs locaux de l'exécution, par exemple `.emet`.

## usage

- `oversizedReadLines` (par défaut `400`, minimum `1`) : un Read sans offset ni limite sur un fichier de plus de ce nombre de lignes compte comme surdimensionné dans `emet usage`.
- `stalledMinutes` (par défaut `10`, minimum `1`) : seuil `--minutes` par défaut de `emet usage --stalled`.

## sizing

- `inlineMaxLines` (par défaut `100`, minimum `1`) : le plus grand corps de ticket, en lignes, conservé en ligne dans le prompt d'un worker.

## schema

Prose uniquement. La propriété du schéma de données de ce dépôt, utilisée par la règle d'évitement de conflits de la phase 3 lors du découpage des tickets. Vide ou omis, la règle est ignorée.

- `ownedPaths` : chemins qui définissent le schéma partagé, par exemple `["prisma/schema.prisma"]`. Au plus un worker par vague peut les toucher.
- `sharedDatabase` (obsolète) : `true` si les workers partagent une même base de données physique.

## commit

Prose uniquement.

- `trailer` : clé du trailer git qu'un worker ajoute aux commits référençant le ticket, par exemple `Refs`.
- `trailerPosition` : `body` ou `footer`.

## repo

- `trunk` : la branche vers laquelle les changements de chaque worker sont fusionnés, et la base de toute comparaison git de cleanup et de preflight, par exemple `main`.
- `remote` (par défaut `origin`) : le remote git sur lequel se trouve `trunk`.
- `integrationBranch` (obsolète, prose uniquement) : branche facultative de longue durée sur laquelle une vague s'intègre avant la branche principale.
- `commitTypes` (obsolète, prose uniquement) : types de Conventional Commit autorisés pour les commits des workers.

## design

Facultatif, prose uniquement. `null` ou omis, l'étape de design/revue d'UI est ignorée.

- `canvasIndex` (obsolète) : chemin d'un fichier de canevas de design que les workers consultent avant des changements d'UI.

## Variables d'environnement

La CLI lit ces variables, toutes via `emet/src/env.ts`. Une variable écrite avec `FORGE_` fonctionne toujours comme repli de son nom `EMET_` et affiche un avertissement une seule fois. Les valeurs vides comptent comme non définies. `tools/env-docs.test.ts` maintient ce tableau et le code synchronisés.

| Variable                      | Repli hérité                   | Signification                                                                                                                                                                |
| ----------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_MAX_LIVE_WORKERS`       | `FORGE_MAX_LIVE_WORKERS`       | Plafond de workers actifs simultanément : un nombre positif ou `auto`. Remplace `concurrency.maxLiveWorkers`.                                                                |
| `EMET_STATE_DIR`              | `FORGE_STATE_DIR`              | Répertoire d'état à l'échelle de l'hôte, qui contient le pool de slots de workers.                                                                                           |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `FORGE_SKIP_DEPENDENCY_CHECKS` | À définir à `1` pour rétrograder en avertissements les vérifications de dépendances bloquantes dans `emet preflight`.                                                        |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | `FORGE_RUN_IDLE_THRESHOLD_MS`  | Millisecondes pendant lesquelles la transcription d'une exécution peut rester silencieuse avant d'être considérée comme inactive. Remplace `concurrency.runIdleThresholdMs`. |
| `EMET_CPU_OVERSUBSCRIBE`      | `FORGE_CPU_OVERSUBSCRIBE`      | Facteur de sursouscription du CPU pour le plafond automatique de workers.                                                                                                    |
| `EMET_MEM_RESERVE_GIB`        | `FORGE_MEM_RESERVE_GIB`        | Gio de mémoire laissés libres avant l'attribution d'un slot de worker.                                                                                                       |
| `EMET_MEM_PER_WORKER_GIB`     | `FORGE_MEM_PER_WORKER_GIB`     | Gio de mémoire supposés par worker par le plafond automatique de workers.                                                                                                    |
| `EMET_AGENT_HOST`             |                                | À définir à `codex` lors d'une exécution sous l'hôte d'agent Codex ; toute autre valeur signifie Claude.                                                                     |
| `CODEX_HOME`                  |                                | Le répertoire personnel de Codex ; `~/.codex` par défaut. Uniquement lu.                                                                                                     |
| `XDG_STATE_HOME`              |                                | Base du répertoire d'état lorsque `EMET_STATE_DIR` n'est pas définie.                                                                                                        |
| `NO_COLOR`                    |                                | Si elle est définie, la bannière est affichée sans couleur.                                                                                                                  |
| `FORCE_COLOR`                 |                                | Toute valeur sauf vide ou `0` force une bannière en couleur, même sans TTY.                                                                                                  |
| `TERM`                        |                                | `dumb` désactive la couleur de la bannière.                                                                                                                                  |
