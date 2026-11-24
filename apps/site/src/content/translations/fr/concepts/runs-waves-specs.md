---
title: Runs, vagues et specs
description: Comment un run, une vague et une spec se relient entre eux.
seoTitle: Runs, vagues et specs dans emet
sourceHash: e43250ad3faa9a31
---

Comment un run, une vague et une spec se relient entre eux. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md).

## La spec est l'unité de travail

Une **Spec** est le document d'exigences d'une fonctionnalité, avec des exigences numérotées `S1..Sn`. Elle est écrite et approuvée avant qu'aucun ticket n'existe, et tout ce qui suit se mesure par rapport à elle : chaque ticket nomme les exigences qu'il couvre sur une ligne `Covers:`, et chaque exigence a besoin d'au moins un ticket et d'un scénario d'acceptation. `emet validate` impose les deux avant l'approbation unique. Voir [`emet validate`](../reference/cli.md#gates-and-records).

Quand une spec atterrit, elle met à jour les [specs vivantes](living-specs.md) qui décrivent le comportement actuel.

## Tickets et vagues

Un **Ticket** est une unité de travail dérivée de la spec, avec des interfaces, des surfaces d'édition autorisées et un budget de contexte. Les tickets dépendent les uns des autres ; ils ne peuvent donc pas tous démarrer en même temps.

Une **Wave** est une couche de dépendance : les tickets dont tous les bloqueurs sont terminés, distribués ensemble. L'ensemble des tickets prêts à être distribués à un instant donné est la **Frontier**. Dans une vague, les surfaces d'édition sont disjointes : les workers ne touchent donc jamais le même fichier, et chaque worker reçoit son propre worktree et sa propre branche locale.

Une vague est aussi l'unité de revue : chaque vague a sa propre revue et sa propre gate, quelle que soit l'[unité d'atterrissage](landing.md).

## Un run est une exécution

Un **Run** est une exécution de `/emet:run` pour une spec. Son identifiant de run relie les réservations, slots de workers, verrous et résultats que le run crée, et ses enregistrements se trouvent sous `.emet/runs/<run-id>/` dans le checkout principal.

Au sein d'un run, une session, le **Coordinator**, exécute les phases, distribue les workers, fusionne leurs branches et est le seul à écrire dans le tracker. Les workers font leur rapport par une note de handoff et un fichier de résultat local, jamais au tracker. Voir l'[ADR-0005](../adr/0005-coordinator-is-the-single-tracker-writer.md).

Un **Quick run** est le cas réduit : une spec avec exactement un ticket, un tour d'entretien et une vague qui atterrit seule, quelle que soit l'unité d'atterrissage du dépôt. Voir l'[ADR-0039](../adr/0039-quick-mode-lands-per-wave.md).

## Comment tout s'articule

1. Le run vous interroge et écrit la spec, puis en dérive des tickets et les regroupe en vagues.
2. Vous approuvez une seule fois. L'approbation enregistre des hachages de la spec et de la liste de tickets, et la distribution refuse si l'un des deux a changé ensuite.
3. Pour chaque vague, les workers implémentent leurs tickets dans des worktrees parallèles. Le coordinateur fusionne leurs branches dans une branche d'intégration, et la vague passe par la [revue et les gates](review-and-gates.md).
4. Une vague qui passe [atterrit](landing.md), seule ou avec le reste de sa spec.
5. À la fin du run, le coordinateur enregistre ce qu'il a appris sous forme de [Lessons](memory.md).

Pour les commandes derrière chaque étape, voir la [référence de la CLI](../reference/cli.md#runs-workers-and-slots) et les [gates et enregistrements](../reference/cli.md#gates-and-records) qu'elle liste.
