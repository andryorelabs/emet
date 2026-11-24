---
title: Revue et gates
description: Comment la double revue et les gates décident si le travail peut atterrir.
seoTitle: Revue et gates dans emet
sourceHash: 6efa20526c00a453
---

Comment la double revue et les gates décident si le travail peut atterrir. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md).

## Un relecteur vérifie la vague par rapport à la spec

Une fois les branches d'une vague fusionnées dans la branche d'intégration, un **Reviewer** lit le résultat dans un contexte neuf et le vérifie par rapport à la spec. Le relecteur est un agent distinct, jamais le worker qui a écrit le code.

La quantité de revue que reçoit une vague dépend de son risque. `emet assess` classe le diff de façon déterministe dans l'un de trois niveaux :

- `passive` : un diff limité à la documentation. Aucun relecteur ne s'exécute.
- `medium` : une modification ordinaire du code source. Un relecteur s'exécute.
- `high` : le diff touche un terrain risqué comme l'authentification, les paiements, la CI, les migrations ou des sinks dangereux. Ces vagues reçoivent la **Dual review**.

## Dual review dans le niveau high

Une vague `high` est lue par deux relecteurs en parallèle sur le même paquet : le relecteur Claude et un relecteur Codex. Un seul modèle partage ses propres angles morts ; une seconde lecture indépendante est donc tout l'intérêt.

Le coordinateur fusionne ensuite les deux ensembles de constats. Un constat que les deux relecteurs soulèvent reste ouvert comme convenu. Un constat soulevé par un seul relecteur est trié par le coordinateur, qui le garde ou l'écarte avec une règle enregistrée. Un constat qui contredit une exigence que vous avez explicitement choisie n'est jamais écarté.

La Dual review ne s'exécute que lorsque le niveau est `high`, que l'hôte est Claude Code, que le binaire `codex` est dans le PATH et que `review.dual` n'est pas `off`. Sinon, un seul relecteur s'exécute. Les vagues medium et passive coûtent la même chose dans les deux cas, et les jetons de relecteur ne doublent à peu près que pour les vagues high. Voir l'[ADR-0040](../adr/0040-dual-review-in-the-high-tier.md).

## Les constats sont vérifiés, pas crus sur parole

La CLI vérifie ce que le relecteur affirme :

- **Verdicts de couverture.** Pour chaque exigence, le relecteur dit met, partial ou unmet. Un `met` doit nommer un test. Un `met` dont le fichier de test ou le nom de test manque, ou une exigence sans verdict, devient un constat `verification-gap` ouvert. La CLI n'exécute elle-même aucun test ; c'est la suite complète sur la branche d'intégration qui le fait.
- **Constats préexistants.** Un constat sur une ligne que la vague n'a ni ajoutée ni modifiée est rapporté, mais ne bloque jamais la gate.
- **Options de l'utilisateur.** Une exigence que vous avez choisie explicitement est marquée comme option de l'utilisateur. Un constat qui la contredit bloque à tous les niveaux et toutes les sévérités, même sur une ligne intacte, et mérite un tour de correction, pas un arrêt à lui seul.

## La gate décide

Les phases ne décident jamais d'elles-mêmes que le travail peut continuer. `emet gate` lit l'enregistrement de vérification, les constats ouverts, le niveau de risque, la CI, la suite d'intégration et les budgets, et affiche une seule décision :

- `merge` ou `chain` : le travail peut continuer.
- `hold` : il manque quelque chose qu'emet peut résoudre seul, comme des constats qu'il peut corriger ou une vérification encore en cours.
- `stop` : une personne doit trancher avant que le run continue.
- `defer` : le ticket a échoué trop de fois ; il est mis de côté et le reste de la vague continue.

## Tours de correction

Quand des constats bloquants sont ouverts, la gate attend et demande un **Fix round** : le coordinateur corrige les constats ouverts et un relecteur ne revérifie que ceux-ci, pas tout le diff. Les tours de correction ont leur propre budget, distinct de celui des tours de revue.

La gate s'arrête quand un constat montre que la spec elle-même était fausse, quand les tours de correction sont épuisés avec des constats encore ouverts, ou quand la suite d'intégration échoue une seconde fois après la ré-exécution de ses specs en échec. Une CI qui ne s'est jamais exécutée à cause de la machine ou du fournisseur est relancée sans compter une tentative de correction, et signalée comme un problème d'infrastructure la deuxième fois de suite.

Pour les clés, voir [`review`](../reference/configuration.md#review), [`gate`](../reference/configuration.md#gate) et [`budgets`](../reference/configuration.md#budgets). Pour les commandes, voir [`emet assess`, `emet review` et `emet gate`](../reference/cli.md#gates-and-records). Pour choisir les modèles de relecteur, voir [Modèles et effort](../how-to/choose-models.md).
