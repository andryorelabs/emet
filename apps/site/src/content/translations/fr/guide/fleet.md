---
title: Vérification de flotte
description: Auditez plusieurs dépôts à la fois avec emet doctor, en lecture seule, et voyez lesquels demandent de l'attention.
seoTitle: Vérification de flotte avec emet doctor
sourceHash: 14501ffced8e07f0
---

Vous utilisez déjà emet sur plusieurs dépôts ? `emet doctor` en audite autant que vous voulez à la fois, en lecture seule :

```bash
emet doctor ~/code/*
```

Il indique, pour chaque dépôt : un `emet.config.json` valide, les quatre fichiers `docs/agents/*.md` présents, aucun marqueur `TODO(emet):` restant, si les commandes de `commands.selfCheck` se résolvent réellement, et les constats de dépendances propres au tracker de ce dépôt (`gh`, Linear ; voir la [référence des dépendances](../reference/dependencies.md)). Le plugin mattpocock-skills et les options des CLI externes (`gh`, `claude --bg`, `claude agents --json`, vérifiées via `--help`) sont contrôlés une seule fois pour tout le balayage, et non par dépôt.

`emet doctor` vérifie les options elles-mêmes, pas seulement l'existence des binaires. Il lit le `--help` de `gh issue view`/`gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`), `claude` (`--bg`) et `claude agents` (`--json`), et signale toute option qu'une CLI plus récente ou plus ancienne ne documente plus. Une option renommée ferait sinon échouer une vague en cours de route.

Chaque sonde est plafonnée à 5 s pour qu'un `gh auth status` bloqué (sans réseau) ne puisse pas figer une vague. Le `preflight.requiredCommands` d'un dépôt est une liste, propre au dépôt, de binaires que `emet preflight` et `emet doctor` exigent dans le PATH. Voir la [référence de la CLI](../reference/cli.md#vérification-de-flotte) et la [référence de configuration](../reference/configuration.md#preflight).
