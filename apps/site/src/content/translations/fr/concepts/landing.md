---
title: Atterrissage
description: Comment une spec atterrit, par défaut en une seule pull request.
seoTitle: Atterrissage d'une spec dans emet
sourceHash: 11d51c9132097b57
---

Comment une spec atterrit, par défaut en une seule pull request. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md).

Ici, **Landing** (atterrissage) désigne la façon dont le travail terminé arrive sur le trunk. Cela n'a rien à voir avec la page d'accueil du Website.

## Une pull request par spec

Par défaut, une spec atterrit en une seule pull request. Chaque vague a toujours sa propre revue, sa gate et son autocontrôle, mais une vague qui passe n'atterrit pas. Le coordinateur fusionne sa branche d'intégration avec `--no-ff` dans une **Spec branch** locale, `spec/<id>`, et les tickets de la vague deviennent **Integrated**. La vague suivante part de la pointe de cette branche : les vagues suivantes s'appuient donc sur les précédentes sans attendre la CI d'une pull request.

Après la dernière vague, le coordinateur synchronise le trunk dans la branche de spec par une fusion, jamais par un rebase, et la fait atterrir une seule fois : une pull request, ou une fusion locale quand le mode d'atterrissage est `merge`, qui ne pousse jamais. Chaque vague reste un commit de fusion distinct dans l'historique du trunk ; une vague peut donc toujours être annulée.

Un ticket **Integrated** compte comme un bloqueur fermé pour la **Frontier**, mais il reste ouvert jusqu'à ce que l'atterrissage final le ferme. **Landed** garde son sens simple : sur le trunk.

## Une vague n'atterrit seule que sur demande

Avec `landing.unit: wave`, chaque vague atterrit seule : une pull request et une attente de CI par vague, et la vague suivante ne démarre qu'après la fusion de cette pull request. Une spec de trois vagues coûte alors trois pull requests. C'est le comportement d'avant l'[ADR-0037](../adr/0037-landing-per-spec.md), et il reste disponible.

Un **Quick run** atterrit toujours par vague, car il n'a qu'une seule vague. Voir l'[ADR-0039](../adr/0039-quick-mode-lands-per-wave.md).

## Pull request ou fusion locale

Indépendamment de l'unité, `landing.mode` choisit comment le travail arrive sur le trunk. `pr` ouvre une pull request et nécessite `gh`. `merge` fusionne localement avec `emet land` ou `emet spec-branch land` et ne pousse jamais, la commande d'autocontrôle du dépôt remplaçant la CI. Voir l'[ADR-0010](../adr/0010-local-merge-landing.md).

## À quoi s'attendre

- Un défaut que seule la CI détecte apparaît à l'atterrissage final, après que des vagues suivantes se sont appuyées dessus.
- Un conflit avec le trunk apparaît à la synchronisation, où le coordinateur s'arrête et liste les chemins.
- Le checkout est lié à une seule spec à la fois ; une deuxième spec en parallèle demande un autre worktree.
- `spec/<id>` est poussée par défaut après chaque vague intégrée, sans ouvrir de pull request, de sorte qu'un disque perdu coûte au plus une vague.
- Fusionner la pull request de la spec avec un commit de fusion conserve l'annulation par vague. Un trunk qui n'autorise que les fusions squash fait atterrir la spec en un seul commit et perd cette annulation.

Pour les clés, voir [`landing`](../reference/configuration.md#landing). Pour les commandes, voir [`emet spec-branch` et `emet land`](../reference/cli.md#planning-review-and-landing). Pour la décision, voir l'[ADR-0037](../adr/0037-landing-per-spec.md).
