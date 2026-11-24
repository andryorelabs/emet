---
title: Stabilité
description: Ce qu'emet promet de ne pas casser, et ce qu'il se réserve le droit de modifier.
seoTitle: Stabilité d'emet
sourceHash: 5a596d218f43a27d
---

Ce qu'emet promet de ne pas casser, et ce qu'il se réserve le droit de modifier. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md).

## Surfaces stables

Une modification d'une surface stable qui casse un appelant existant est un changement incompatible. Elle attend une version majeure et est signalée dans [CHANGELOG.md](../../CHANGELOG.md).

- **Options de la CLI.** Les sous-commandes et les options listées dans la [référence de la CLI](cli.md). Une option n'est ni supprimée ni dotée d'un autre sens ; de nouvelles options peuvent être ajoutées.
- **Codes de sortie.** `0` propre, `1` constats à traiter, `2` erreur de configuration ou d'usage, `3` erreur interne. Les prompts et les scripts reposent sur ces nombres. Voir les [codes de sortie](cli.md#codes-de-sortie).
- **Le schéma de configuration.** `emet.config.json` tel que le décrivent [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json) et la [référence de configuration](configuration.md). Une clé n'est ni supprimée ni renommée sans incrément du `version` du schéma ; de nouvelles clés facultatives peuvent être ajoutées.
- **L'enveloppe `--json`.** La forme de premier niveau du JSON qu'une commande affiche avec `--json`. Les champs ne sont ni supprimés ni retypés ; de nouveaux champs peuvent être ajoutés, donc les analyseurs doivent ignorer les champs qu'ils ne connaissent pas.

## Surfaces internes

Elles peuvent changer à chaque version, sans autre entrée de changelog qu'une note ordinaire. Ne vous y fiez pas.

- Les modules sous `emet/src/` et leurs fonctions et types exportés.
- La formulation des prompts dans `emet/reference/`, `commands/` et `agents/`, qui ne change que dans un ticket nommant les paragraphes ([ADR-0036](../adr/0036-prompt-wording-changes-under-an-explicit-ticket.md)).
- La forme et l'emplacement des fichiers d'état, des registres et des enregistrements sous `.emet/`, ainsi que du pool de slots commun à l'hôte.
- Les fichiers Codex générés sous `codex/` et `.codex-plugin/`.
- Tout ce qui se trouve sous `tools/`, `apps/` et `docs/research/`.
- Le texte lisible des messages, des rapports et de la sortie de `--help`.

## Dépréciations

Une surface stable est dépréciée pendant au moins une version mineure avant d'être supprimée dans une version majeure. La dépréciation est annoncée dans le changelog et, quand la CLI peut la détecter, par un avertissement sur stderr.

## Décisions

Les enregistrements de décision de [docs/adr](../adr/README.md) expliquent pourquoi les surfaces sont tracées ainsi. Si vous ne savez pas de quel côté se situe un élément, posez la question dans une issue avant de vous y fier.
