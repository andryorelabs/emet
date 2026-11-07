---
title: Dépannage
description: Échecs de emet doctor et emet preflight, regroupés selon ce que vous voyez, chacun avec sa cause et un correctif.
seoTitle: Dépannage de emet doctor et preflight
sourceHash: dd82e980da9568d5
---

Échecs de `emet doctor` et `emet preflight`, regroupés selon ce que vous voyez, chacun avec sa cause et un correctif. Les termes suivent [GLOSSARY.md](../GLOSSARY.md). Pour comprendre comment les vérifications s'articulent, voir l'[architecture](architecture.md).

<img src="brand/mascot/mascot-error.svg" alt="" width="96">

Un dépôt qui n'a encore que `forge.config.json`, `.forge/` ou des variables `FORGE_*` continue de fonctionner : `emet` lit les anciens noms, affiche sur stderr une ligne nommant chaque ancien fichier, et `emet migrate` les renomme.

- [Pas de emet.config.json](#pas-de-emetconfigjson)
- [emet.config.json est mal formé](#emetconfigjson-est-mal-formé)
- [docs/agents contient encore des marqueurs TODO(emet)](#docsagents-contient-encore-des-marqueurs-todoemet)
- [Une vérification de dépendance échoue](#une-vérification-de-dépendance-échoue)
- [ne documente plus une option dans --help](#ne-documente-plus-une-option-dans---help)
- [Un fichier installé est manquant ou a été modifié depuis l'installation](#un-fichier-installé-est-manquant-ou-a-été-modifié-depuis-linstallation)
- [Stop hook error: forge: No such file or directory](#stop-hook-error-forge-no-such-file-or-directory)
- [Aucun slot de worker libre](#aucun-slot-de-worker-libre)
- [Worktrees verrouillés attendus, moins trouvés](#worktrees-verrouillés-attendus-moins-trouvés)
- [Un ticket est réservé par plusieurs worktrees ou branches](#un-ticket-est-réservé-par-plusieurs-worktrees-ou-branches)
- [requiredCommands absent du PATH](#requiredcommands-absent-du-path)
- [Voir aussi](#voir-aussi)

## Pas de emet.config.json

**Symptôme :** `emet doctor` affiche `no emet.config.json — run "emet init" here`.

**Cause :** Le dépôt n'a pas encore de configuration `/emet`.

**Correctif :** Exécutez `emet init` à la racine du dépôt, puis relisez la configuration générée et complétez les fichiers de `docs/agents/`.

## emet.config.json est mal formé

**Symptôme :** `emet.config.json is malformed: <reason>` ; `emet preflight` se termine avec le code 2.

**Cause :** La configuration est du JSON strict et est validée par rapport à `emet/schema/emet.config.schema.json`. Les commentaires et les virgules finales sont rejetés.

**Correctif :** Corrigez le champ nommé dans la raison, ou régénérez avec `emet init --force`.

## docs/agents contient encore des marqueurs TODO(emet)

**Symptôme :** `docs/agents/ still has N TODO(emet): marker(s)` ; `emet doctor` signale aussi un `docs/agents/<file>` manquant.

**Cause :** `emet init` laisse un marqueur partout où il ne peut pas détecter une valeur.

**Correctif :** Complétez chaque ligne marquée, ou résolvez-les et exécutez `emet init --force`. Preflight refuse de distribuer tant qu'il en reste un.

## Une vérification de dépendance échoue

**Symptôme :** des lignes `dependency: ...` dans `emet doctor`, ou un échec de dépendance bloquant dans `emet preflight` (par exemple `gh` absent ou non authentifié, ou le plugin mattpocock-skills absent ou dans une version non testée).

**Cause :** `/emet` a besoin de `git`, de `gh` et du plugin mattpocock-skills ; voir `emet/src/dependencies.ts` et `emet/src/skills.ts`.

**Correctif :** Installez ou authentifiez l'outil, ou exécutez `/setup-matt-pocock-skills`. Si une vérification est erronée pour votre environnement, `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` la rétrograde en avertissement.

## ne documente plus une option dans --help

**Symptôme :** `<tool> no longer documents <flags> in --help — emet relies on it`, ou `could not be run — cannot verify <flags>`.

**Cause :** `emet doctor` vérifie les options dont dépend `emet`, pas seulement l'existence du binaire. La version installée en a supprimé ou renommé une.

**Correctif :** Installez une version de l'outil qui documente encore l'option.

## Un fichier installé est manquant ou a été modifié depuis l'installation

**Symptôme :** `~/<path> is missing — re-run install.sh` ou `~/<path> was edited since install`.

**Cause :** La copie installée ne correspond plus au manifeste d'installation.

**Correctif :** Relancez `install.sh`. S'il existe un fichier `.new` en attente à côté d'un fichier modifié, fusionnez-le ou supprimez-le.

## Stop hook error: forge: No such file or directory

**Symptôme :** Claude Code affiche `Stop hook error: … forge: No such file or directory` (ou la même chose pour `emet`) à la fin de chaque tour.

**Cause :** `~/.claude/settings.json` contient encore un hook `forge guard` ou `emet guard` dont le binaire a été déplacé ou supprimé.

**Correctif :** Exécutez `emet doctor .`. Il liste chaque hook guard mort avec son événement et affiche une commande `cp … && jq …` qui sauvegarde `settings.json` et ne supprime que ces hooks. Doctor ne modifie jamais le fichier lui-même.

## Aucun slot de worker libre

**Symptôme :** `No free worker slots at all: 0 free out of N`, ou `only K/N worker slot(s) free`.

**Cause :** Chaque slot de `~/.local/state/emet/slots` est détenu par une exécution vivante ou inactive, donc la vague ne peut pas être entièrement distribuée.

**Correctif :** Attendez qu'une exécution libère un slot, ou exécutez `emet cleanup --run <runId>` pour une exécution dont vous savez qu'elle est terminée. `emet status` montre qui détient quoi.

## Worktrees verrouillés attendus, moins trouvés

<img src="brand/mascot/mascot-sleep.svg" alt="" width="64">

**Symptôme :** `Expected N locked worktree(s) for run <id>, found M`.

**Cause :** Les workers n'ont pas réservé leur worktree avec la raison de verrouillage, ou `isolation: "worktree"` les a placés ailleurs. Voir [`incidents.md`](../emet/reference/incidents.md).

**Correctif :** Vérifiez `git worktree list --porcelain` pour les entrées verrouillées, et `emet lock-reason` pour le format de raison attendu.

## Un ticket est réservé par plusieurs worktrees ou branches

**Symptôme :** `<ticket> is claimed by N worktrees`, `has N branches`, ou `is checked out on branch ..., but its own lock names ticket ...`.

**Cause :** Une nouvelle tentative ou un shell mal aiguillé a laissé un doublon.

**Correctif :** Conservez le worktree ou la branche canonique, supprimez ou reverrouillez le reste, puis relancez `emet preflight`.

## requiredCommands absent du PATH

**Symptôme :** `preflight.requiredCommands not on PATH: <names>`.

**Cause :** `preflight.requiredCommands` dans `emet.config.json` liste des binaires dont le dépôt a besoin.

**Correctif :** Installez les binaires nommés, ou retirez-les de la configuration s'ils ne sont plus nécessaires.

## Voir aussi

- [Index de la documentation](README.md)
- [README](../README.md)
- [Premiers pas](guide/getting-started.md)
- [Référence de configuration](reference/configuration.md)
- [Référence des dépendances](reference/dependencies.md)
