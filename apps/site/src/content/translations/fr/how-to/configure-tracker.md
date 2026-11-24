---
title: Trackers et atterrissage
description: Où vivent les tickets, comment une vague atterrit en pull request ou en merge local, et comment les vagues s'enchaînent.
seoTitle: Trackers et atterrissage dans emet
sourceHash: c79d8a04687b4620
---

Choisissez où vivent les tickets, comment une spec atterrit et si les vagues s'enchaînent. Chaque clé citée ici figure dans la [référence de configuration](../reference/configuration.md) ; chaque sous-commande figure dans la [référence de la CLI](../reference/cli.md). Les termes suivent [GLOSSARY.md](../../GLOSSARY.md).

<img src="../brand/mascot/mascot-work.svg" alt="mascotte d'emet, au travail" width="96" align="right">

## Prérequis

- emet est installé et un dépôt a un `emet.config.json` ; exécutez `emet init` s'il n'en a pas.
- Pour le tracker `github` ou l'atterrissage `pr` : `gh` est dans le `PATH` et authentifié.
- Pour le tracker `linear` : un serveur MCP Linear déclaré dans `.mcp.json` (ou au niveau utilisateur). Voir la [référence des dépendances](../reference/dependencies.md).
- Pour comprendre ce que ces réglages changent, lisez [Atterrissage](../concepts/landing.md) et [Runs, vagues et specs](../concepts/runs-waves-specs.md).

## Choisir le tracker

:::steps

1. Définissez `tracker.kind` dans `emet.config.json` sur `"linear"`, `"github"` ou `"local"`.
2. Pour un tracker local, exécutez `emet init --tracker local`. Les specs et les tickets sont alors des fichiers markdown sous `.scratch/` du worktree principal (non versionnés) : `.scratch/<slug>/spec.md` et `.scratch/<slug>/issues/<NN>-<slug>.md`, chacun avec des lignes `Status:` et `Blocked by:` et des commentaires sous `## Comments`. Le coordinateur les lit et les écrit via `emet tracker`. Voir l'[ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
3. Pour les autres types, vérifiez le prérequis correspondant ci-dessus.

:::

## Choisir comment une spec atterrit

:::steps

1. Définissez `landing.mode` sur `"pr"` (par défaut) ou `"merge"`. En mode `merge`, une spec atterrit en un seul merge local dans la branche principale (`emet spec-branch land`, ou `emet land` par vague avec `landing.unit: "wave"`), `commands.selfCheck` tient lieu de CI et rien n'est poussé. Voir l'[ADR-0010](../adr/0010-local-merge-landing.md).
2. Définissez `landing.unit` sur `"spec"` (par défaut, toute la spec atterrit d'un bloc) ou `"wave"` (chaque vague atterrit seule). Voir l'[ADR-0037](../adr/0037-landing-per-spec.md).
3. Avec `landing.unit: "spec"`, définissez `worktree.baseRef: "head"` dans les réglages de Claude Code pour que les worktrees des workers partent de la branche `spec/<id>`. `emet preflight` et `emet doctor` le vérifient.
4. En mode `pr`, définissez `landing.specMergeMethod` (un commit de merge par défaut) sur une méthode que les réglages du dépôt et le ruleset de la branche principale autorisent ; `emet doctor` avertit quand ce n'est pas le cas.
5. Pour contrôler le merge, définissez `pr.autoMerge` (`true` par défaut) et `pr.maxCiFixAttempts`. Ne définissez `pr.mergeMethod` qu'avec `landing.unit: "wave"` ; une pull request de spec utilise `landing.specMergeMethod` de l'étape 4 et l'ignore. Une vague où quelque chose est signalé n'est jamais fusionnée automatiquement.

:::

Les commandes de branche de spec (`emet spec-branch ensure`, `integrate`, `sync`, `land`, `abandon`) sont pilotées par le coordinateur ; leurs options figurent dans la [référence de la CLI](../reference/cli.md).

## Enchaîner les vagues

Les vagues suivantes s'exécutent dans leurs propres sessions. L'enchaînement est désactivé par défaut.

:::steps

1. Définissez la section `handoff` dans `emet.config.json` :

   ```json
   {
     "handoff": {
       "autoChain": true,
       "launcher": "auto",
       "permissionMode": "bypassPermissions"
     }
   }
   ```

2. Sur Claude Code, vérifiez que `claude` est dans le `PATH` avec la prise en charge de `--bg`, que l'espace de travail est approuvé (ouvrez `claude` en mode interactif dans le dépôt une fois et acceptez-le), et que l'avertissement de contournement a été accepté une fois dans une session interactive (`skipDangerousModePermissionPrompt`).
3. Sur Codex, vérifiez que `codex` est dans le `PATH` à la version `codex.minVersion` ou plus récente, avec `--json` et `--output-schema` sur `codex exec` ; la vague suivante démarre comme un `codex exec` détaché. Voir [Exécuter emet sur Codex](use-codex.md).
4. Définissez `handoff.launcher` (Claude Code uniquement) sur `auto`, `orca` ou `bg` pour choisir si la vague ouvre aussi un onglet Orca. `permissionMode` ne concerne que Claude Code ; sur Codex, la session enchaînée utilise `codex.sandbox`.
5. Pour démarrer une vague à la main dans une autre session, exécutez `emet launch <spec-id> --wave <n>` plutôt qu'un simple `claude --bg`. Il affiche `{ name, id, attach, orcaTab: { opened, reason } }`.

:::

L'enchaînement ne se lance que si la PR a été fusionnée et que rien n'a été signalé, il est ignoré quand une session `emet-<spec-id>-*` est déjà active, et il se rabat sur l'affichage de `/emet:run --dispatch <spec-id>` si le lancement échoue. Inspectez une vague enchaînée avec `claude agents` ou `claude attach emet-<spec-id>-w<n>`.

## Définir les budgets et les fonctionnalités facultatives

:::steps

1. Définissez la section `budgets` si les valeurs par défaut ne conviennent pas :

   ```json
   { "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
   ```

   `workerAttempts` est le nombre de fois qu'un ticket peut échouer à `verify` avant d'être reporté ; `reviewRounds` est le nombre de tours de revue qu'un ticket reçoit avant une escalade (les tours de correction ont leur propre `budgets.fixRounds`, 2 par défaut) ; `stallNudgeCap` est le nombre de fois qu'un worker bloqué est relancé. Voir [Revue et portes](../concepts/review-and-gates.md).

2. Définissez `specs.enabled` pour conserver des [specs vivantes](../concepts/living-specs.md) dans `docs/specs/` (`specs.dir`).
3. Exécutez `emet map` pour écrire une carte du code dans `docs/agents/codebase.md` (`map.path`). `emet map --stale` se termine avec le code 1 dès que HEAD a dépassé l'empreinte.
4. Exécutez `emet metrics --run <id>` après un run pour obtenir les tokens, le coût et le temps écoulé par ticket, par vague et par run.

:::

Pour une petite modification d'un seul ticket, lancez `/emet:run --quick <request>` plutôt que le pipeline complet ; il atterrit toujours par vague et s'arrête sur un diff à haut risque.

## Vérifier

:::steps

1. Exécutez `emet preflight` ; il valide les sections `tracker`, `landing`, `pr`, `handoff` et `budgets` et se termine avec le code 2 sur une configuration mal formée.
2. Exécutez `emet doctor .` et confirmez qu'aucun échec ne mentionne le tracker, `gh`, le serveur MCP Linear ou les réglages d'atterrissage.
3. Pour un tracker local, exécutez `emet tracker frontier --spec <slug>` et confirmez qu'il liste les tickets attendus.

:::
