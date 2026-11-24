---
title: Vérification de flotte
description: Auditez plusieurs dépôts à la fois avec emet doctor, en lecture seule, et voyez lesquels demandent de l'attention.
seoTitle: Vérification de flotte avec emet doctor
sourceHash: 511c25889b2a8244
---

Auditez, modifiez et lancez emet sur plusieurs dépôts à la fois. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md).

## Prérequis

- emet est installé ; voir [Installer](../start/install.md).
- Chaque dépôt a un `emet.config.json` et se trouve un niveau sous une racine (par défaut `~/code`).
- `gh` est dans le `PATH` et authentifié ; voir la [référence des dépendances](../reference/dependencies.md).

## Auditer les dépôts

:::steps

1. Exécutez l'audit en lecture seule sur autant de dépôts que vous voulez :

   ```bash
   emet doctor ~/code/*
   ```

2. Lisez le rapport de chaque dépôt : un `emet.config.json` valide, les quatre fichiers `docs/agents/*.md`, aucun marqueur `TODO(emet):` restant, des commandes `commands.selfCheck` qui se résolvent, et les constats de dépendances du tracker de ce dépôt.
3. Lisez les constats valables pour tout le balayage, affichés une seule fois : le plugin mattpocock-skills et les options des CLI externes, vérifiées via `--help` (`gh`, et sur Claude Code `claude --bg` et `claude agents --json`, sur Codex `codex exec --json` et `--output-schema`). Une option renommée est signalée ici avant de faire échouer une vague.

:::

## Modifier un réglage dans chaque dépôt

:::steps

1. Listez ce que chaque dépôt a actuellement :

   ```bash
   emet fleet list --root ~/code
   ```

   Il affiche, pour chaque dépôt, le chemin, `tracker.kind`, `handoff.autoChain` et `models.worker` ; `--json` l'affiche sous forme de données.

2. Prévisualisez la modification :

   ```bash
   emet fleet set handoff.autoChain false --dry-run
   ```

   `--dry-run` n'écrit rien et affiche l'ancienne et la nouvelle valeur de chaque dépôt.

3. Appliquez-la en exécutant la même commande sans `--dry-run`. La valeur est d'abord validée par le chargeur de configuration ; une valeur invalide ne modifie aucun dépôt et se termine avec le code 1.

:::

## Lancer une fonctionnalité sur plusieurs dépôts

```bash
emet fleet launch --feature "add dark mode" --repos app,site
```

Il ouvre une session `/emet:run --draft <text>` dans chaque dépôt, après les mêmes contrôles de disponibilité que `emet chain`. `--repos` la limite à une liste séparée par des virgules.

## Voir les sessions bloquées

```bash
emet fleet status
```

Il affiche, pour chaque dépôt, combien de sessions emet sont bloquées sur une décision, en cours ou inactives, les dépôts bloqués d'abord. Il lit les dernières 24 heures du journal global et exclut les sessions terminées ; `--json` affiche les sessions. Dans un dépôt, `emet status` les liste sous `sessions`. Voir [Attention et journal](../concepts/attention-and-journal.md) et la [référence de configuration](../reference/configuration.md#attention).

## Vérifier

:::steps

1. Exécutez de nouveau `emet doctor ~/code/*` et confirmez qu'aucun dépôt ne signale d'échec.
2. Exécutez `emet fleet list --root ~/code` et confirmez que la clé modifiée affiche la nouvelle valeur dans chaque dépôt.
3. Exécutez `emet fleet status` et confirmez qu'aucun dépôt n'est bloqué de façon inattendue.

:::

Chaque sonde est plafonnée à 5 s, de sorte qu'un `gh auth status` bloqué ne peut pas figer une vague. `preflight.requiredCommands` est une liste, propre au dépôt, de binaires que `emet preflight` et `emet doctor` exigent ; voir la [référence de la CLI](../reference/cli.md#fleet-check) et la [référence de configuration](../reference/configuration.md#preflight).
