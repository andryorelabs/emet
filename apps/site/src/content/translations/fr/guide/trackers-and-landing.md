---
title: Trackers et atterrissage
description: Où vivent les tickets, comment une vague atterrit en pull request ou en merge local, et comment les vagues s'enchaînent.
seoTitle: Trackers et atterrissage dans emet
sourceHash: 9aa84264f5f8cc95
---

Où vivent les tickets, comment une vague atterrit et comment les vagues s'enchaînent. Chaque clé citée ici figure dans la [référence de configuration](../reference/configuration.md) ; chaque sous-commande figure dans la [référence de la CLI](../reference/cli.md).

<img src="../brand/mascot/mascot-work.svg" alt="mascotte d'emet, au travail" width="96" align="right">

## Trackers

emet fonctionne avec Linear, GitHub Issues ou des fichiers locaux, selon `tracker.kind`. `gh` est requis pour le tracker `github`. Un serveur MCP Linear doit être déclaré dans `.mcp.json` (ou au niveau utilisateur) pour le tracker `linear` ; voir la [référence des dépendances](../reference/dependencies.md).

### Tracker local

Avec `tracker.kind: "local"`, les specs et les tickets sont des fichiers markdown sous `.scratch/` du worktree principal (non versionnés) : `.scratch/<slug>/spec.md` et `.scratch/<slug>/issues/<NN>-<slug>.md`, chacun avec des lignes `Status:` et `Blocked by:` et des commentaires sous `## Comments`. Le coordinateur les lit et les écrit via `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` met cela en place. Voir l'[ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

## Atterrissage

`landing.mode` vaut `"pr"` (par défaut) ou `"merge"`, indépendamment du tracker. En mode `merge`, une vague atterrit en un seul merge local dans la branche principale avec `emet land`, `commands.selfCheck` tenant lieu de CI et sans push. `gh` n'est requis que lorsque le tracker est `github` ou que l'atterrissage est `pr`. Voir l'[ADR-0010](../adr/0010-local-merge-landing.md).

### PR d'atterrissage

Une vague est une PR. Son corps porte `Closes #N` pour chaque ticket (le mot-clé de fermeture du tracker), et le coordinateur passe les tickets en revue à l'ouverture de la PR. La PR est ensuite fusionnée selon `pr.autoMerge`, ou laissée ouverte lorsque la vague a été signalée, que `autoMerge` vaut `false` ou que les corrections de CI sont épuisées (la PR reçoit alors le label de décision humaine). Après un merge, `emet cleanup --run <runId>` libère les branches, les réservations de tickets et les emplacements de workers de la vague.

Une fois les branches d'une vague fusionnées ensemble, `commands.fullSuite` s'exécute une fois sur la branche d'intégration. Une exécution au rouge bloque la PR et `autoChain`. Le gate reçoit le résultat sous la forme `--integration`.

### Enchaîner les vagues

Les vagues suivantes s'exécutent dans leurs propres sessions, jamais dans celle qui a exécuté la vague 1. Deux sections facultatives de `emet.config.json` contrôlent la suite (toutes deux validées par `emet preflight`) :

```json
{
  "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 },
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `pr.autoMerge` (par défaut `true`) : attend les checks de la PR puis fusionne ; sans checks, fusionne immédiatement. Un check en échec est corrigé et poussé, jusqu'à `maxCiFixAttempts` fois, puis la PR est laissée ouverte à un humain. Une vague avec quoi que ce soit de signalé n'est jamais fusionnée automatiquement.
- `handoff.autoChain` (par défaut `false`) : après une vague propre et fusionnée, s'il reste des vagues, lance la suivante avec `claude --bg` au lieu d'afficher `/emet:run --dispatch <spec-id>`. Inspectez-la avec `claude agents` / `claude attach emet-<spec-id>-w<n>`. Prérequis sur Claude Code :
  1. `claude` dans le PATH, avec la prise en charge de `--bg`.
  2. Un espace de travail de confiance. `--bg` s'exécute de façon non interactive, donc la boîte de dialogue de confiance ne s'affiche jamais ; ouvrez `claude` en mode interactif dans le dépôt une fois et acceptez-la.
  3. L'avertissement de contournement accepté une fois dans une session interactive (`skipDangerousModePermissionPrompt`), puisque la vague suivante s'exécute dans `handoff.permissionMode` (ci-dessous), et non dans le mode de la session qui la lance.

  Sur l'hôte Codex, la vague suivante démarre plutôt comme un `codex exec` détaché (voir `handoff.launcher` ci-dessous) ; le prérequis est donc `codex` dans le PATH en version `codex.minVersion` ou plus récente, avec `--json` et `--output-schema` sur `codex exec` ; `emet doctor` vérifie les options, pas le numéro de version. La boîte de dialogue de confiance et l'avertissement de contournement de Claude ne s'appliquent pas. Que Codex exige un espace de travail de confiance pour une exécution détachée n'est pas vérifié dans la documentation de ce dépôt.

  Elle ne se lance que lorsque la PR a été fusionnée et que rien n'a été signalé, et elle est ignorée si une session `emet-<spec-id>-*` est déjà active (`claude agents --json`). Si le lancement échoue, elle se rabat sur l'affichage de `/emet:run --dispatch <spec-id>`.

- `handoff.launcher` (par défaut `auto`) : ouvre aussi la vague dans un onglet Orca exécutant `claude attach`. `auto` interroge le runtime d'Orca (`orca status`), donc cela fonctionne aussi depuis des sessions `claude --bg`, qui n'ont pas de `TERM_PROGRAM` ; `orca` essaie toujours, `bg` jamais. `launcher` ne s'applique qu'à l'hôte Claude Code ; sur Codex, `emet launch` se comporte toujours comme `bg`. La vague s'exécute en arrière-plan dans tous les cas, et un onglet qui ne s'ouvre pas n'arrête jamais la chaîne.

  `emet launch <spec-id> --wave <n>` fait tout le lancement (vérification de session en double, `claude --bg`, onglet) et affiche `{ name, id, attach, orcaTab: { opened, reason } }`. Utilisez-le, plutôt qu'un simple `claude --bg`, chaque fois que vous voulez une vague dans une autre session à la main.

  Sur l'Agent host Codex, `emet launch` démarre un `codex exec` détaché qui exécute `$emet:run --dispatch <spec-id>` et enregistre son identifiant de fil. Il n'ouvre aucun onglet Orca, et `codex exec resume <id>` reprend la session. Voir la [référence de la CLI](../reference/cli.md#hôte-codex) et [Exécuter emet sur Codex](codex.md).

- `handoff.permissionMode` (par défaut `bypassPermissions`) : Claude Code uniquement ; mode d'autorisation de la session chaînée. Sur l'hôte Codex il est ignoré et la session chaînée utilise `codex.sandbox` (par défaut `danger-full-access` ; voir [Exécuter emet sur Codex](codex.md)). Il n'est pas hérité de la session qui la lance, car le classificateur du mode `auto` peut refuser une étape comme `gh pr merge` et laisser une vague à moitié terminée. Vos règles `permissions.deny` s'appliquent toujours, mais l'avertissement de contournement doit avoir été accepté une fois en mode interactif (`skipDangerousModePermissionPrompt`).

## Gates, budgets et enregistrements

Les phases ne décident pas d'elles-mêmes quand un ticket est terminé, fusionnable ou mérite une nouvelle tentative. Elles appellent une commande de la CLI qui lit un enregistrement sur disque et affiche la décision. Les enregistrements d'exécution se trouvent sous `.emet/runs/<run-id>/` et le registre de revue sous `.emet/review/`, dans le checkout principal, pas dans le worktree d'un worker. Chaque commande affiche son usage avec `--help`. Le tableau des commandes et de ce que chacune impose se trouve dans [Gates et enregistrements](../reference/cli.md#gates-et-enregistrements).

**Budgets** (`emet.config.json`, tous facultatifs) :

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts` : combien de fois un ticket peut échouer à `verify` avant que le gate réponde `defer`. Le ticket reçoit le label différé et le reste de la vague continue. Un défaut d'environnement, comme la commande de tests qui se termine avec 126/127 ou une panne du fournisseur, met l'exécution en pause sans consommer de tentative.
- `reviewRounds` : combien de tours de revue/correction un ticket reçoit avant une escalade vers le niveau de modèle suivant. Tout ce qui reste ouvert après cela reçoit une décision.
- `stallNudgeCap` : combien de fois un worker bloqué est relancé. Le compteur n'est jamais remis à zéro.

## Specs vivantes, carte et métriques

**Specs vivantes.** Après la fusion automatique d'une vague, `emet spec-merge --spec <id>` fusionne les deltas d'exigences `ADDED`/`MODIFIED`/`REMOVED` de la spec dans `docs/specs/<area>.md` (`specs.dir`). Il vérifie toutes les zones avant d'écrire quoi que ce soit. Un conflit, ou une exigence qui perdrait un scénario, se termine avec le code 1 et laisse tous les fichiers intacts.

**Carte du code.** `emet map` écrit un résumé d'une base de code existante (stack, structure, conventions, tests, points chauds) dans `docs/agents/codebase.md` (`map.path`), estampillé avec le SHA du commit dont il est issu. Le même commit produit toujours le même fichier. `emet map --stale` se termine avec le code 1 une fois que HEAD a dépassé l'estampille, et `emet preflight` avertit dans ce cas. `emet map --for <globs>` n'affiche que les sections qui correspondent aux surfaces d'édition d'un ticket. Cette sortie est la seule partie de la carte qu'inclut le brief d'un worker.

**Métriques.** `emet metrics --run <id>` indique les tokens, le coût équivalent API et le temps écoulé par ticket, par vague et par exécution, lus dans les transcriptions de session. Il compare aussi le budget de contexte estimé par ticket avec ce que chaque worker a réellement utilisé. Son résumé figure à la fin du rapport final de l'exécution.
