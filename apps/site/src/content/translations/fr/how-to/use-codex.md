---
title: Exécuter emet sur Codex
description: "Utilisez Codex comme Agent host d'emet : installez le plugin, configurez agentHost, approuvez une seule fois et connaissez les limites."
seoTitle: Exécuter emet sur Codex
sourceHash: 71c6c7d0686a6725
---

Exécutez le pipeline d'emet sur Codex CLI plutôt que sur Claude Code. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md) ; le produit dans lequel une exécution tourne est l'**Agent host**. Retour à l'[index de la documentation](../README.md).

Le déroulement d'une vague sur Codex, la garde et les compromis du bac à sable sont expliqués dans [Sécurité](../concepts/security.md) et [Runs, vagues et specs](../concepts/runs-waves-specs.md).

## Prérequis

- La CLI `codex` à la version de `codex.minVersion` (`0.167.0` par défaut) ou plus récente, connectée.
- `git` et `gh` dans le `PATH` ; voir la [référence des dépendances](../reference/dependencies.md).
- Un dépôt avec un `emet.config.json` (exécutez `emet init` s'il n'en a pas).

## Installer

:::steps

1. Installez le plugin `mattpocock-skills` dans Codex :

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

2. Installez emet avec l'installation autonome de [Installer](../start/install.md). Elle écrit les skills d'emet sous `~/.agents/skills/emet/` et ajoute les hooks d'emet à `$CODEX_HOME/hooks.json` (`~/.codex` par défaut), et n'écrit jamais `config.toml`. Elle installe aussi l'`emet` du terminal ainsi que les commandes et agents de Claude Code sous `~/.claude` ; c'est sans effet sur Codex.

3. Approuvez les hooks. Codex n'exécute pas un hook tant que vous ne l'avez pas approuvé : ouvrez `/hooks` et appuyez sur `t` dans la page des événements, ou acceptez l'invite « Hooks need review » au démarrage.

:::

### Facultatif : le plugin Codex

Au lieu de l'installation autonome, vous pouvez installer le plugin emet :

```bash
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

Le plugin n'apporte pas de shim `emet`, donc l'`emet` du terminal nécessite toujours l'installation autonome. `emet self install` refuse de s'exécuter tant que le plugin est installé, sauf avec `--force`, et `emet doctor` avertit quand les deux coexistent.

## Choisir l'Agent host

:::steps

1. Définissez `agentHost` dans `emet.config.json` (la valeur par défaut est `"claude"`) :

   ```json
   { "agentHost": "codex" }
   ```

2. Définissez les modèles, l'effort, la version minimale et le bac à sable dans la section `codex` si les valeurs par défaut ne conviennent pas ; voir la [référence de configuration](../reference/configuration.md#codex) et [Choisir les modèles](choose-models.md).
3. Démarrez un run depuis Codex avec `$emet:run`. Pour démarrer une vague depuis un terminal, exécutez `emet launch <spec> --wave <n>` ; il démarre un `codex exec` détaché et enregistre son identifiant de thread, de sorte que `codex exec resume <id>` le poursuit. Aucun onglet Orca n'est ouvert.

:::

## Approuver le plan

emet demande une seule approbation, après le plan. Sur Codex, c'est un hook.

:::steps

1. Attendez que `$emet:run` matérialise la spec. Tant que `.emet/runs/spec<id>/approval.json` n'existe pas, `emet guard` refuse toute mutation avec la raison `not approved: send approve <id>`.
2. Envoyez une ligne d'invite qui est exactement `approve <id>`. Le hook `UserPromptSubmit` écrit le fichier d'approbation. Les mêmes mots dans la sortie d'un outil ou dans le texte du modèle ne font rien.
3. Sinon, démarrez avec `/plan $emet:run` et approuvez le plan dans le mode plan propre à Codex.

:::

## Après une mise à jour d'emet

Avec l'installation autonome, les hooks sont de simples entrées dans `hooks.json` et restent approuvés. Avec le plugin, Codex vous demande d'approuver de nouveau les hooks du plugin après chaque mise à jour.

:::steps

1. Ouvrez `/hooks` et appuyez sur `t` dans la page des événements, ou acceptez l'invite « Hooks need review » au démarrage. D'ici là, la garde d'emet et l'approbation unique ne s'exécutent pas.
2. Si le shim affiche `release v<version> has no downloadable asset yet`, il exécute la version en cache. Réessayez dans quelques minutes.

:::

## Vérifier

:::steps

1. Exécutez `emet doctor .`. Sur l'hôte Codex, il signale un `codex` plus ancien que `codex.minVersion`, une option `--json` ou `--output-schema` manquante sur `codex exec`, des hooks non approuvés et l'absence de `mattpocock-skills`.
2. Corrigez ce qu'il signale en suivant l'entrée correspondante du [dépannage](../troubleshooting.md#codex-host), puis relancez-le jusqu'à ce qu'il ne signale plus d'échec.

:::

Limites connues : l'effort `ultra` n'est jamais envoyé et est rejeté dans la configuration, et `codex.sandbox` vaut par défaut `danger-full-access` pour que les workers puissent committer ; définissez-le sur `"workspace-write"` pour conserver le bac à sable, et les workers ne pourront alors plus committer. Voir l'[ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) et le [rapport de sonde](../research/codex-probe-report.md).
