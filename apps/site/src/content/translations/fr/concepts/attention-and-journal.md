---
title: Attention et journal
description: Le journal global des événements d'emet et l'état d'attention d'une session.
seoTitle: Attention et journal d'emet
sourceHash: 378e84638489f44f
---

emet consigne ses propres événements dans un seul journal global. Un type d'événement indique quand une session vous attend. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md) ; les décisions figurent dans l'[ADR-0030](../adr/0030-global-event-journal.md) et l'[ADR-0042](../adr/0042-session-attention-state-in-the-journal.md).

## Le journal

Le journal est un unique fichier en ajout seul de lignes JSON, un événement par ligne, dans le répertoire d'état de l'hôte qui contient aussi le pool de slots de workers. Comme il est global, une analyse ultérieure peut distinguer un run lancé par `emet launch` ou `emet chain` d'un run saisi à la main : chaque événement porte son dépôt, son hôte et une origine, `human` ou `auto`.

Les commandes existantes écrivent les événements : démarrage d'un run, décision de gate, intervention humaine dans une vague sans surveillance, résultat de lancement, ticket fermé, nettoyage, repère de référence, et intégration, atterrissage ou abandon d'une branche de spec.

### Ce qu'il n'enregistre jamais

Les prompts, le texte de l'assistant, l'entrée des hooks, les variables d'environnement, argv, les jetons, les diffs et les corps de tickets. Un événement ne contient que des identifiants, des codes, des compteurs, des durées et une courte raison. Un événement qui dépasserait 2 Kio perd ses données et est marqué comme tronqué.

### Échecs et rotation

Un journal impossible à écrire ne modifie jamais la sortie ni le code de sortie d'une commande. Quand le fichier dépasse environ 10 Mio, l'ajout suivant le déplace vers un segment numéroté et conserve les cinq plus récents. Sur un système de fichiers réseau, des écritures concurrentes peuvent s'entrelacer ; `emet doctor` avertit donc, sans échouer, quand le répertoire d'état s'y trouve.

### Le lire

`emet insights` lit tous les segments et rapporte les runs par origine, les décisions de gate, les interventions, les résultats de lancement, les événements de spec et les tickets fermés. Par défaut, il couvre les événements depuis le dernier repère ; `--mark-baseline` repart de zéro à partir de maintenant. Il ignore les lignes qu'il ne peut pas analyser et les compte, et il affiche un rapport à zéro quand le journal est vide. Comme le fichier est du JSON Lines, `jq` fonctionne aussi dessus. Voir la [référence de la CLI](../reference/cli.md#runs-workers-and-slots).

## L'attention

Un run peut rester bloqué sur une demande de permission ou une question sans que personne ne regarde. L'attention répond à la question « une session a-t-elle besoin de moi ? ».

Chaque session d'un run géré par emet est dans l'un de quatre états :

- **working** : l'agent agit.
- **needs-decision** : l'agent attend une personne, par exemple sur une demande de permission ou une question. « Bloqué » en est un autre nom.
- **idle** : l'agent s'est arrêté et attend le prompt suivant.
- **ended** : la session est terminée.

Le hook `emet guard`, déjà installé sur l'hôte, repère les transitions et ajoute un événement `session.attention` au journal seulement quand l'état change, donc il n'y a pas de second magasin. Une session compte comme gérée par emet quand elle s'exécute dans un worktree de worker emet, ou dans un dépôt avec une configuration emet et un run inachevé. Sur Codex, il n'existe pas d'événements de notification : un arrêt est donc idle, sauf si le run a un résultat bloqué, qui est needs-decision.

L'événement contient l'identifiant de session, l'ancien et le nouvel état, le déclencheur et l'identifiant du run. Il ne contient jamais le texte de la notification, le nom de l'outil ni son entrée. L'enregistrement ne bloque jamais : un échec est avalé et la boîte de dialogue de permission reste inchangée.

### L'alerte

Entrer dans needs-decision déclenche une alerte : une marque non lue d'Orca sur le worktree quand le runtime Orca est joignable, sinon une notification de bureau quand il y en a une de disponible. emet ne l'efface jamais, et `attention.alert` la désactive.

### Où la voir

`emet status` liste les sessions et leur état, et une session bloquée fait passer l'état global à needs-decision même si aucune vague n'est en cours. `emet fleet status` affiche la même chose pour plusieurs dépôts.

## Voir aussi

- [Runs, vagues et specs](runs-waves-specs.md)
- [Sécurité](security.md)
- [Référence de configuration](../reference/configuration.md) pour `attention.alert`
