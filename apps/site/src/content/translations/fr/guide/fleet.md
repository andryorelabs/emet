---
title: Vérification de flotte
description: Auditez plusieurs dépôts à la fois avec emet doctor, en lecture seule, et voyez lesquels demandent de l'attention.
seoTitle: Vérification de flotte avec emet doctor
sourceHash: 7b3c5a56abfffcc1
---

Vous utilisez déjà emet sur plusieurs dépôts ? `emet doctor` en audite autant que vous voulez à la fois, en lecture seule :

```bash
emet doctor ~/code/*
```

Il indique, pour chaque dépôt : un `emet.config.json` valide, les quatre fichiers `docs/agents/*.md` présents, aucun marqueur `TODO(emet):` restant, si les commandes de `commands.selfCheck` se résolvent réellement, et les constats de dépendances propres au tracker de ce dépôt (`gh`, Linear ; voir la [référence des dépendances](../reference/dependencies.md)). Le plugin mattpocock-skills et les options des CLI externes (`gh`, plus celles de la CLI propre à l'Agent host : sur Claude Code `claude --bg` et `claude agents --json`, sur Codex `codex exec --json` et `--output-schema`, toutes vérifiées via `--help`) sont contrôlés une seule fois pour tout le balayage, et non par dépôt.

`emet doctor` vérifie les options elles-mêmes, pas seulement l'existence des binaires. Il lit le `--help` de `gh issue view`/`gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`) et, sur Claude Code, `claude` (`--bg`) et `claude agents` (`--json`), et signale toute option qu'une CLI plus récente ou plus ancienne ne documente plus. Une option renommée ferait sinon échouer une vague en cours de route. Les vérifications de `claude` et `claude agents` sont celles de l'hôte Claude Code. Sur l'hôte Codex, les vérifications d'options de l'hôte les remplacent au lieu de s'y ajouter : `emet doctor` vérifie `codex exec` pour `--json` et `--output-schema` (`hostCliFlagRequirements` dans `emet/src/doctor.ts`). Il ne compare pas la version de `codex` à `codex.minVersion` ; voir [Exécuter emet sur Codex](codex.md).

## Modifier et lancer sur plusieurs dépôts

`emet fleet` travaille sur les dépôts qui ont un `emet.config.json` un niveau sous une racine (par défaut `~/code`) :

```bash
emet fleet list --root ~/code
emet fleet set handoff.autoChain false --dry-run
emet fleet launch --feature "add dark mode" --repos app,site
```

- `list` affiche, pour chaque dépôt, le chemin, `tracker.kind`, `handoff.autoChain` et `models.worker`. `--json` l'affiche sous forme de données.
- `set <key> <value>` modifie une clé de configuration dans chaque dépôt listé. Chaque valeur est validée par le chargeur de configuration avant toute écriture ; une valeur invalide ne modifie aucun dépôt et se termine avec le code 1. `--dry-run` n'écrit rien et affiche l'ancienne et la nouvelle valeur de chaque dépôt.
- `launch --feature <text>` ouvre une session `/emet:run --draft <text>` dans chaque dépôt, après les mêmes contrôles de disponibilité que `emet chain`. `--repos` la limite à une liste séparée par des virgules.

Chaque sonde est plafonnée à 5 s pour qu'un `gh auth status` bloqué (sans réseau) ne puisse pas figer une vague. Le `preflight.requiredCommands` d'un dépôt est une liste, propre au dépôt, de binaires que `emet preflight` et `emet doctor` exigent dans le PATH. Voir la [référence de la CLI](../reference/cli.md#vérification-de-flotte) et la [référence de configuration](../reference/configuration.md#preflight).
