---
title: Specs vivantes
description: Des fichiers par domaine qui décrivent le comportement actuel, tenus à jour par la pull request qui le modifie.
seoTitle: Specs vivantes dans emet
sourceHash: d2468b14b371c04b
---

Une spec dans le tracker est un plan : ses exigences, ses tickets et ses vagues. Une fois les tickets fermés, le tracker ne dit plus ce que fait le système. Une spec vivante comble ce manque : un fichier par domaine sous `docs/specs/` qui décrit le comportement actuel, tenu à jour par la pull request même qui le modifie. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md) ; la décision figure dans l'[ADR-0038](../adr/0038-living-specs-hold-current-behaviour.md).

## Ce que contient une spec vivante

Chaque domaine a un fichier. C'est une liste d'exigences ; chaque exigence a un nom descriptif, une ligne `Source: #<spec> S<n>` qui renvoie à l'élément de spec qui l'a introduite, et un ou plusieurs scénarios sous la forme WHEN et THEN. La ligne de source compte parce que les numéros S sont locaux à une spec ; le nom lui-même n'en utilise donc jamais.

Une spec vivante décrit un comportement, pas un travail : rien n'y dit ce qui est prévu ni qui s'en charge. Cela reste dans le tracker.

## Comment une spec la met à jour

Les specs vivantes sont optionnelles, via `specs.enabled`. Quand elle est activée, la mise à jour a lieu une fois par spec, à la dernière vague de la spec :

1. Le coordinateur lit la spec vivante actuelle de chaque domaine concerné.
2. Pour chaque exigence que la spec touche, il décide si elle est ajoutée, modifiée ou supprimée, et écrit le résultat sous forme de delta de spec dans un répertoire partagé par tous les worktrees du dépôt.
3. `emet spec-merge` fusionne les deltas dans les fichiers de `docs/specs/`. Il n'exécute jamais git ; le coordinateur commite le résultat.
4. Le commit fait partie de la dernière vague, de sorte que la revue et les gates voient la modification de la spec vivante comme n'importe quelle autre.

Une fusion qui entre en conflit, ou qui ferait perdre un scénario existant, n'écrit rien et se termine par une erreur. Le coordinateur corrige le delta une fois ; si cela échoue de nouveau, la vague atterrit sans la mise à jour et le rapport le signale.

## Pourquoi le coordinateur décide

Savoir à quel domaine appartient une exigence, et si elle est nouvelle ou modifie une exigence existante, est un jugement qui demande le fichier actuel et l'intention de la spec. Un outil qui générerait les deltas mécaniquement ne pourrait connaître ni l'un ni l'autre ; le jugement reste donc au coordinateur et la fusion reste mécanique.

## Où elle atterrit

Avec l'atterrissage par défaut, le commit de la spec vivante voyage dans la branche de spec et arrive sur le trunk avec l'unique pull request. Voir [Atterrissage](landing.md). Avec la vague comme unité d'atterrissage, il fait partie de la pull request de la dernière vague.

## Voir aussi

- [Runs, vagues et specs](runs-waves-specs.md)
- [Revue et gates](review-and-gates.md)
- [Référence de configuration](../reference/configuration.md) pour `specs.enabled` et `specs.dir`
