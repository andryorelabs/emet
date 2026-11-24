---
title: Mémoire
description: Ce qu'emet retient entre les runs et où il le conserve.
seoTitle: Mémoire d'emet
sourceHash: 9053ca5dd53acba7
---

Ce qu'emet retient entre les runs et où il le conserve. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md).

## Les Lessons

Un run se déroule sans surveillance : ce qu'il apprend disparaîtrait avec la session. À la fin d'un run, le coordinateur enregistre de 1 à 5 courtes puces sur ce qui a aidé ou gêné, appelées **Lessons**, avec le résultat du run : landed, chained, hold, stop ou blocked. Chaque puce tient en une seule courte ligne.

Les Lessons sont conservées par spec, dans une note par dépôt, de sorte qu'un run ultérieur sur le même dépôt peut lire ce que les précédents ont appris. Une note qui devient trop grande perd d'abord ses sections les plus anciennes.

## Où elles sont conservées

Les Lessons vivent dans [Engram](https://github.com/Gentleman-Programming/engram), un magasin de mémoire local distinct, pas dans votre dépôt ni dans le tracker. emet ne l'utilise que si le binaire `engram` est dans le PATH et répond à sa poignée de main.

Si Engram est absent, défaillant ou désactivé, `emet memory` signale que la mémoire est indisponible et se termine avec succès. La mémoire ne bloque jamais un run.

## Comment elles servent

Au début d'un run, avant le premier tour d'entretien, le coordinateur cherche dans la mémoire les Lessons qui correspondent à la fonctionnalité. Celles qui sont pertinentes vont dans le plan sous un titre « Prior lessons », de sorte que l'entretien et le plan partent de ce que les runs précédents ont trouvé. Quand rien n'est trouvé ou que la mémoire est indisponible, le run le note en une ligne et continue.

## L'utiliser à la main

`emet memory search` et `emet memory save` sont de simples commandes de la CLI : vous pouvez donc chercher ou ajouter une Lesson vous-même. Pour désactiver la mémoire d'un dépôt, définissez `memory.enabled` sur `off`.

Pour les commandes, voir [`emet memory`](../reference/cli.md#runs-workers-and-slots). Pour la clé, voir [`memory`](../reference/configuration.md#memory). La place d'un run dans le flux global est décrite dans [Runs, vagues et specs](runs-waves-specs.md).
