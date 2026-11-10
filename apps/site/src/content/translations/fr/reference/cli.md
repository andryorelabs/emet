---
title: Référence de la CLI
description: Chaque sous-commande d'emet, le tableau des gates et enregistrements, les codes de sortie et les variables d'environnement.
seoTitle: Référence de la CLI d'emet
sourceHash: b89b785c057b008c
---

Chaque sous-commande d'`emet`, le tableau des gates et enregistrements, les codes de sortie et les variables d'environnement. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md). Retour au [README](../../README.md). Chaque commande affiche son usage avec `--help`.

## Sous-commandes

Trois commandes slash enveloppent la CLI dans Claude Code : `/emet:run` (le pipeline), `/emet:init` (`emet init`) et `/emet:doctor` (`emet doctor .`). Sur Codex, ce sont les skills `$emet:run`, `$emet:init` et `$emet:doctor`. Un `emet` dans un terminal ordinaire nécessite `install.sh` ; sinon, exécutez `! emet <subcommand>` dans une session.

`emet <command> [...args]`. `emet --version` affiche la version.

### Configuration et audit

- `emet migrate [--dry-run]` : renomme un dépôt hérité vers les noms d'emet.
- `emet init [--tracker linear|github|local] [--force]` : détecte automatiquement le gestionnaire de paquets, la branche principale et le type de tracker, puis écrit `emet.config.json` et les fichiers `docs/agents/*.md`. `--tracker local` met en place le tracker local.
- `emet doctor [--all] [<path> ...]` : audit en lecture seule d'autant de dépôts que vous voulez à la fois ; par défaut, le répertoire courant.
- `emet preflight [--run <id>] [--post-dispatch]` : confirme que le dépôt est prêt pour la distribution.
- `emet skill-path <name>` : affiche le chemin absolu du `SKILL.md` d'une skill de mattpocock-skills. Se termine avec le code 1 si la skill est introuvable.
- `emet selftest` : exécute les tests unitaires propres à la CLI. Installations depuis les sources uniquement ; un binaire compilé se termine avec le code 1 et vous demande d'exécuter `emet doctor`.

Dans n'importe quel dépôt git :

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

`emet init` laisse un marqueur `TODO(emet):` dans les fichiers `docs/agents/*.md` générés pour tout ce qu'il ne peut pas déduire seul (un verrou partagé de la base de données de test, la propriété du schéma, etc.). Complétez-les ; `emet preflight` refuse de distribuer tant qu'il en reste un.

Ensuite, dans Claude Code (sur Codex, utilisez `$emet:run` avec les mêmes arguments) :

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

#### Vérification de flotte

`emet doctor` audite plusieurs dépôts à la fois, en lecture seule :

```bash
emet doctor ~/code/*
```

Il indique, pour chaque dépôt : un `emet.config.json` valide, les quatre fichiers `docs/agents/*.md` présents, aucun marqueur `TODO(emet):` restant, si les commandes de `commands.selfCheck` se résolvent réellement, et les constats de dépendances propres au tracker de ce dépôt (`gh`, Linear ; voir [dépendances](dependencies.md#qui-vérifie-quoi)). Le plugin mattpocock-skills et les options des CLI externes (`gh`, plus celles de l'Agent host : `claude --bg` et `claude agents --json` sur Claude Code, `codex exec --json` et `--output-schema` sur Codex, vérifiées via `--help`) sont contrôlés une seule fois pour tout le balayage, et non par dépôt.

### Exécutions, workers et slots

- `emet claims --reserve <ticket> --run <id> --anchor <pid>` : réserve un ticket pour une exécution. `--release <ticket>`, `--list` et `--prune [--dry-run]` libèrent une réservation, listent les réservations ou élaguent les périmées.
- `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>` : prend un slot de worker dans le pool commun à l'hôte, situé dans `~/.local/state/emet/slots`. `--release --run <id>`, `--release-index <index>` et `--list` libèrent des slots ou les listent.
- `emet cleanup [--run <id> | --all] [--dry-run] [--force]` : sans argument, récupère les exécutions terminées ou mortes dont le travail a atterri ; `--run` nettoie cette exécution ; `--all` est un balayage de branches sur tout le dépôt. Après un merge, `emet cleanup --run <runId>` libère les branches, les réservations de tickets et les slots de workers de la vague.
- `emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]` : affiche la raison du `git worktree lock` qu'un worker écrit au démarrage.
- `emet launch <spec-id> --wave <n>` : sur Claude Code, démarre une vague comme une session `claude --bg` et ouvre son onglet Orca selon `handoff.launcher` (sur Codex, voir [Hôte Codex](#hôte-codex)). Il fait tout le lancement (vérification de session en double, `claude --bg`, onglet) et affiche `{ name, id, attach, orcaTab: { opened, reason } }`. Utilisez-le, plutôt qu'un simple `claude --bg`, chaque fois que vous voulez une vague dans une autre session à la main.
- `emet status [--spec <id>]` : Working / Checking / Ready / Needs-decision par vague en JSON, plus une ligne de résumé. `emet status --help` documente le JSON.
- `emet usage [--session <id> | --file <path>] [--stalled [--minutes N]] [--project-dir <path>]` : indique l'usage de la session ; `--stalled` liste les workers bloqués.
- `emet handoff --check <path> | --render <path>` : valide ou rend la note `.emet/handoff-<ticket>.md` d'un worker.
- `emet metrics [--run <id>]` : indique les tokens, le coût équivalent API et le temps écoulé par ticket, par vague et par exécution, lus dans les transcriptions de session. Il compare aussi le budget de contexte estimé par ticket avec ce que chaque worker a réellement utilisé. Son résumé figure à la fin du rapport final de l'exécution.

### Planification, revue et atterrissage

- `emet validate --spec <id> | --file <path>` : validation du plan ; voir [Gates et enregistrements](#gates-et-enregistrements).
- `emet surfaces --check <file.json | ->` : rejette les globs de surfaces autorisées qui se chevauchent entre les tickets d'une vague.
- `emet approve --run <id>`, `emet materialize-log`, `emet results`, `emet verify`, `emet review-package`, `emet review`, `emet gate` : voir [Gates et enregistrements](#gates-et-enregistrements).
- `emet assess --base <ref> --head <ref>` : classe un diff comme `passive`, `medium` ou `high` et affiche du JSON avec le niveau, les raisons ainsi que le modèle et l'effort recommandés pour le relecteur. Voir [Models & effort](../../README.md#models--effort) et [`review`](configuration.md#review).
- `emet land --spec <s> --branch <integration> --tickets <id,...>` : fusionne une branche d'intégration dans la branche principale locale (`landing.mode` `merge`). `commands.selfCheck` tient lieu de CI et rien n'est poussé.
- `emet spec-merge --spec <id>` : après la fusion automatique d'une vague, fusionne les deltas d'exigences `ADDED`/`MODIFIED`/`REMOVED` de la spec dans `docs/specs/<area>.md` (`specs.dir`). Il vérifie toutes les zones avant d'écrire quoi que ce soit. Un conflit, ou une exigence qui perdrait un scénario, se termine avec le code 1 et laisse tous les fichiers intacts.
- `emet map [--refresh]` : écrit un résumé d'une base de code existante (stack, structure, conventions, tests, points chauds) dans `docs/agents/codebase.md` (`map.path`), estampillé avec le SHA du commit dont il est issu. Le même commit produit toujours le même fichier. `emet map --stale` se termine avec le code 1 une fois que HEAD a dépassé l'estampille, et `emet preflight` avertit dans ce cas. `emet map --for <globs>` n'affiche que les sections qui correspondent aux surfaces d'édition d'un ticket ; cette sortie est la seule partie de la carte qu'inclut le brief d'un worker.
- `emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close` : le tracker local sur `.scratch/`, JSON sur stdout. Voir [Tracker local](#tracker-local).
- `emet guard` : le hook `PreToolUse` de Claude Code ; lit le JSON du hook sur stdin (la forme Codex figure sous [Hôte Codex](#hôte-codex)). `install.sh` le branche dans `~/.claude/settings.json`. Il bloque une poignée de déclencheurs connus d'échecs lors d'exécutions sans surveillance (voir `emet/src/guard.ts`).

### Tracker local

Avec `tracker.kind: "local"`, les specs et les tickets sont des fichiers markdown sous `.scratch/` du worktree principal (non versionnés) : `.scratch/<slug>/spec.md` et `.scratch/<slug>/issues/<NN>-<slug>.md`, chacun avec des lignes `Status:` et `Blocked by:` et des commentaires sous `## Comments`. Le coordinateur les lit et les écrit via `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` met cela en place. Voir l'[ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

`landing.mode` vaut `"pr"` (par défaut) ou `"merge"`, indépendamment du tracker. En mode `merge`, une vague atterrit en un seul merge local dans la branche principale avec `emet land`, `commands.selfCheck` tenant lieu de CI et sans push. `gh` n'est requis que lorsque le tracker est `github` ou que l'atterrissage est `pr`. Voir l'[ADR-0010](../adr/0010-local-merge-landing.md) et [`landing`](configuration.md#landing).

### PR d'atterrissage et enchaînement des vagues

Une vague est une PR. Son corps porte `Closes #N` pour chaque ticket (le mot-clé de fermeture du tracker), et le coordinateur passe les tickets en revue à l'ouverture de la PR. La PR est ensuite fusionnée selon `pr.autoMerge`, ou laissée ouverte lorsque la vague a été signalée, que `autoMerge` vaut `false` ou que les corrections de CI sont épuisées (la PR reçoit alors le label de décision humaine). Les vagues suivantes s'exécutent dans leurs propres sessions, jamais dans celle qui a exécuté la vague 1. Les sections `pr` et `handoff` contrôlent la suite ; voir [`pr`](configuration.md#pr) et [`handoff`](configuration.md#handoff).

### Hôte Codex

Ces commandes servent l'hôte d'agent Codex (`agentHost` `"codex"`) ; voir le [guide Codex](../guide/codex.md).

- `emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: après avoir vérifié la réservation et le slot, crée `.emet/worktrees/agent-<ticket>`, construit une surcouche `CODEX_HOME` par run et lance le worker comme un `codex exec` détaché. `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]` attend sa fin et affiche le statut de résultat enregistré.
- `emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive>`: exécute le reviewer comme un `codex exec` en lecture seule sur un paquet issu de `emet review-package` et affiche le JSON des constats pour `emet review --findings`. Le niveau `passive` ne lance aucun processus.
- `emet launch <spec-id> --wave <n>`: sur cet hôte, lance un `codex exec` détaché qui exécute `$emet:run --dispatch <spec>` et enregistre son id de thread. Aucun onglet Orca n'est ouvert, et `codex exec resume <id>` reprend la session.
- `emet guard`: avec `EMET_AGENT_HOST=codex`, lit l'entrée de hooks de Codex, vérifie les chemins d'`apply_patch` par rapport à `.emet/surface.json` et garde la porte d'approbation fermée jusqu'à une ligne de prompt `approve <id>`.

## Gates et enregistrements

Les phases ne décident pas d'elles-mêmes quand un ticket est terminé, fusionnable ou mérite une nouvelle tentative. Elles appellent une commande de la CLI qui lit un enregistrement sur disque et affiche la décision. Les enregistrements d'exécution se trouvent sous `.emet/runs/<run-id>/` et le registre de revue sous `.emet/review/`, dans le checkout principal, pas dans le worktree d'un worker.

| Étape                 | Commande                                             | Ce qu'elle impose                                                                                                                                                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Avant l'approbation   | `emet validate --file <plan.json>`                   | Chaque `S#` est couvert par au moins un ticket et a un scénario d'acceptation. Chaque ticket couvre au moins un `S#`. Les surfaces d'édition sont disjointes au sein d'une vague. Aucun cycle de dépendances. `emet preflight` le relance sur le plan approuvé.                                                    |
| Approbation           | `emet approve --run <id> --spec <file>`              | Écrit `approval.json` avec les hashes de la spec et de la liste de tickets. La distribution refuse si l'un des deux a changé ensuite (`--check`).                                                                                                                                                                  |
| Création des tickets  | `emet materialize-log --run <id> --record/--lookup`  | Enregistre l'ID de chaque ticket créé dès qu'il existe, de sorte qu'une exécution interrompue ne crée jamais de doublons.                                                                                                                                                                                          |
| Worker terminé        | `emet results --run <id> --write/--read <ticket>`    | Les workers écrivent un fichier de résultat local (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` ou `NEEDS_CONTEXT`, plus une ligne `Risk:`). Seul le coordinateur écrit dans le tracker.                                                                                                                                |
| Après chaque worker   | `emet verify <ticket> --run <id>`                    | Vérifie que des commits existent au-delà de la base de distribution, que chaque chemin modifié se trouve dans les surfaces d'édition du ticket, que la note de handoff passe `handoff --check` et que `commands.workerScopedSuite` passe. La revue et le merge refusent un ticket sans enregistrement de réussite. |
| Entrée de la revue    | `emet review-package <base> <head> --out <file>`     | Regroupe le diff pour le relecteur, qui le reçoit sous forme de chemin de fichier. Se termine avec le code 3 si la plage est vide ou n'est pas un descendant de la base.                                                                                                                                           |
| Revue                 | `emet review --ticket <t> --findings <file>`         | Tient le registre des constats et impose l'ordre de triage (`intent_gap` → `bad_plan` → `patch` → `defer`) et le plafond de tours. `--escalate` passe au niveau de modèle suivant. `--rule`/`--rulings` enregistrent et listent les « Rulings I made » pour le rapport et le corps de la PR.                       |
| Merge ou enchaînement | `emet gate <ticket> --tier … --ci … --integration …` | Affiche `merge`, `hold`, `chain`, `stop` ou `defer` en JSON avec ses raisons. Il lit l'enregistrement verify, les constats ouverts, le niveau de risque, la CI, la suite d'intégration et les budgets.                                                                                                             |

Une fois les branches d'une vague fusionnées ensemble, `commands.fullSuite` s'exécute une fois sur la branche d'intégration. Une exécution au rouge bloque la PR et `autoChain`. Le gate reçoit le résultat sous la forme `--integration`. Pour les budgets que lit le gate, voir [`budgets`](configuration.md#budgets).

## Codes de sortie

Les codes de sortie ont la même signification dans toutes les sous-commandes.

| Code | Signification                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------- |
| `0`  | Propre.                                                                                            |
| `1`  | Constats à traiter.                                                                                |
| `2`  | Erreur de configuration ou d'usage ; l'outil ne s'est jamais exécuté. Aussi une commande inconnue. |
| `3`  | Erreur interne.                                                                                    |

## Variables d'environnement

Variables destinées à l'utilisateur. Une variable, lorsqu'elle est définie, remplace la valeur de configuration correspondante.

| Variable                      | Effet                                                                                                                                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` rétrograde un blocage de dépendance en avertissement pour cette seule exécution. Définissez-la dans votre propre shell, pas dans ce que le coordinateur exécute sans surveillance. |
| `EMET_MAX_LIVE_WORKERS`       | Remplace [`concurrency.maxLiveWorkers`](configuration.md#concurrency) ; accepte un entier positif ou `auto`.                                                                                                                      |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | Remplace [`concurrency.runIdleThresholdMs`](configuration.md#concurrency), en millisecondes.                                                                                                                                      |
| `EMET_STATE_DIR`              | Répertoire d'état commun à l'hôte, qui contient le pool de slots de workers. Ordre de résolution : `$EMET_STATE_DIR`, puis `$XDG_STATE_HOME/emet`, puis `~/.local/state/emet`.                                                    |
| `EMET_MEM_RESERVE_GIB`        | Marge de mémoire en GiB qui doit rester libre ; une acquisition est refusée quand la mémoire disponible est en dessous. Par défaut 8. Elle alimente aussi le plafond `auto` de workers.                                           |
| `EMET_MEM_PER_WORKER_GIB`     | Mémoire en GiB supposée par worker quand `maxLiveWorkers` vaut `auto`. Par défaut 2. Augmentez-la pour une stack plus lourde par worker, comme une suite E2E pilotée par navigateur par worktree.                                 |
| `EMET_CPU_OVERSUBSCRIBE`      | Multiplicateur de CPU pour le plafond `auto` de workers. Par défaut 1.                                                                                                                                                            |
| `EMET_AGENT_HOST`             | `codex` fait lire à `emet guard` l'entrée de hooks de Codex. Défini par les hooks Codex ; laissez-la non définie sur Claude Code.                                                                                                 |

Le plafond `auto` vaut `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`. Les anciens noms `FORGE_*` sont toujours lus ; `EMET_*` l'emporte quand les deux sont définis.
