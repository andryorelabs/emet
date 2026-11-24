---
title: Modèles et effort
description: Comment emet choisit un modèle et un effort de raisonnement pour chaque rôle, et quelles clés de configuration les modifient.
seoTitle: Modèles et effort dans emet
sourceHash: 0807a288317cba93
---

`/emet` choisit automatiquement un modèle et un effort de raisonnement par rôle ; il n'y a rien à changer à la main en cours d'exécution. Les premières sections décrivent l'hôte Claude Code ; l'[hôte Codex](#hôte-codex) a ses propres valeurs par défaut. Toutes les clés de Claude Code figurent dans la [référence de configuration](../reference/configuration.md#models).

## Prérequis

- emet est installé ; voir [Installer](../start/install.md).
- Un dépôt avec `emet.config.json` (exécutez `emet init` s'il manque).

## Hôte Claude Code

| Rôle                                                       | Modèle                 | Effort                 | Défini par                                  |
| ---------------------------------------------------------- | ---------------------- | ---------------------- | ------------------------------------------- |
| Planification (phases 1–4)                                 | Opus, via `opusplan`   | celui de votre session | vous, une seule fois                        |
| Coordinateur, à partir de la phase 5                       | Sonnet, via `opusplan` | celui de votre session | vous, une seule fois                        |
| Workers (phase 7)                                          | Sonnet                 | `medium`               | `agents/emet-worker.md`, ou `models.worker` |
| Revue, niveau `passive` (diff de documentation uniquement) | aucun                  | —                      | `emet assess`                               |
| Revue, niveau `medium` (changement de code ordinaire)      | Opus                   | `medium`               | `models.reviewer.medium`                    |
| Revue, niveau `high` (chemins ou points sensibles)         | Opus                   | `medium` par défaut    | `models.reviewer.high`                      |
| Triage des logs de CI (phase 8)                            | Haiku                  | —                      | `models.triage`                             |

Sur Claude Code, les deux définitions d'agent (installées par `emet self install` dans `~/.claude/agents/`) fixent leur propre `model`/`effort` dans le frontmatter, si bien que le choix de modèle/effort du coordinateur ne déborde jamais sur un worker ou sur le relecteur. `emet doctor` signale (sans jamais bloquer) l'absence de l'un ou l'autre fichier. `emet preflight` bloque en revanche la distribution lorsque `emet-worker` ou `emet-reviewer` est absent, car la phase 6 et la phase 8 distribuent par `subagent_type`.

## Routage par niveau de risque

La phase 8 exécute `emet assess --base <trunk> --head <integration branch>`, qui classe le diff de façon déterministe et affiche du JSON avec le niveau, les raisons et le modèle/effort recommandés pour le relecteur :

- `passive` : diff de documentation uniquement ; aucun relecteur n'est distribué.
- `medium` : le relecteur s'exécute avec `models.reviewer.medium`.
- `high` : le diff touche l'authentification, la sécurité, les paiements, les webhooks, la CI, l'installateur, les lockfiles, les migrations, un point sensible dangereux (SQL brut, pipe-to-shell et similaires) ou un chemin correspondant à `review.highRiskPaths`. Le relecteur s'exécute avec `models.reviewer.high`, et l'auto-merge n'atterrit la PR qu'avec des checks au vert et aucun constat de revue ouvert.

Un ticket qui touche des chemins à haut risque peut porter une ligne `Model:` (par exemple `Model: opus` ou `Model: opus/high`), qui remplace `models.worker` pour ce seul worker.

## Triage avec Haiku

Sur Claude Code, le coordinateur ne lit jamais un log de CI en entier. Un check en échec est confié à un agent sur `models.triage` (`haiku` par défaut), qui renvoie au plus environ 2k tokens avec des pointeurs `file:line` pour la correction.

## Configuration

Voici les clés `models` de Claude Code. Chaque clé est facultative, et les valeurs par défaut reproduisent le tableau Claude Code ci-dessus :

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  },
  "review": { "highRiskPaths": [] }
}
```

`review.highRiskPaths` est une liste de sous-chaînes de chemin supplémentaires, insensibles à la casse, qui forcent le niveau `high`. Pour obtenir plus de rigueur sur les vagues à risque, augmentez `models.reviewer.high.effort` (par exemple à `high`).

## Hôte Codex

Avec `agentHost` défini sur `"codex"`, chaque worker et chaque relecteur est son propre processus `codex exec`, avec `-m` et `model_reasoning_effort` définis par rôle. Les valeurs par défaut de la section [`codex`](../reference/configuration.md) sont :

| Rôle                           | Modèle        | Effort                               | Repli                         |
| ------------------------------ | ------------- | ------------------------------------ | ----------------------------- |
| Session (`$emet:run`)          | `gpt-6.1-sol` | `medium` (`high` pendant la planif.) | aucun                         |
| Worker                         | `gpt-6.1-sol` | `medium`                             | `gpt-6.1-terra`, `gpt-6-luna` |
| Worker avec une ligne `Model:` | `gpt-6.1-sol` | `xhigh`                              | `gpt-6-astra`                 |
| Relecteur, niveau `medium`     | `gpt-6.1-sol` | `high`                               | aucun                         |
| Relecteur, niveau `high`       | `gpt-6-astra` | `high`                               | `gpt-6.1-sol`                 |
| Triage                         | `gpt-6-luna`  | `medium`                             | `gpt-6.1-terra`               |

`emet dispatch` et `emet review-run` résolvent chaque slug à partir de `models_cache.json`, lu depuis le home de superposition du run, sinon depuis votre vrai home Codex (en lecture seule). Ils conservent un slug qui y figure et prend en charge l'effort, sinon ils suivent la mise à niveau du modèle, puis les replis, puis omettent `-m`, et journalisent chaque substitution ; quand rien ne se résout, `emet review-run` échoue avant l'appel au modèle et nomme le rôle et les slugs listés. Le `config.toml` de superposition que le run génère porte aussi les `model` et `model_reasoning_effort` résolus. L'effort `ultra` n'est jamais envoyé. Le niveau `passive` ne démarre aucun relecteur.

Réajustez après quelques vraies vagues quand :

- les workers demandent des tours de correction répétés : augmentez `codex.models.worker.effort`, ou mettez une ligne `Model:` sur le ticket à risque ;
- les revues des vagues de niveau `high` manquent des constats : augmentez `codex.models.reviewer.high.effort` ;
- le journal montre une substitution : Codex a renommé ou retiré un slug, donc mettez le slug à jour.

L'exécution réelle de Codex du [rapport de sonde](../research/codex-probe-report.md) a utilisé l'effort `low` et le modèle résolu le moins cher (`gpt-6-luna`), et le modèle du relecteur s'est résolu via le cache.

## Pourquoi deux relecteurs au niveau high

Une vague `high` sur l'hôte Claude Code reçoit la Dual review quand `codex` est dans le PATH : le relecteur Claude et un relecteur Codex lisent le même paquet en parallèle, et le coordinateur fusionne leurs constats. Un modèle partage ses propres angles morts, c'est pourquoi la seconde lecture vient d'un autre modèle. Les vagues `medium` gardent un seul relecteur, donc leur coût ne change pas, et `review.dual: off` en exécute toujours un seul. Voir [Revue et portes](../concepts/review-and-gates.md) et l'[ADR-0040](../adr/0040-dual-review-in-the-high-tier.md). Pour une vague à enjeux encore plus élevés sur Claude Code, vous pouvez aussi exécuter `/code-review ultra` à la main ensuite ; `/emet` ne le distribue jamais de lui-même. `/code-review ultra` est une commande de Claude Code ; cette page ne documente aucun équivalent Codex.

## Ce que vous définissez une fois, vous-même (Claude Code)

Sur l'hôte Claude Code, `/emet` ne peut pas changer ces réglages en cours d'exécution. Ils vivent dans le `~/.claude/settings.json` de Claude Code ; l'hôte Codex ne lit pas ce fichier, et ses modèles viennent de la section `codex` ci-dessus.

- `model: "opusplan"` dans `~/.claude/settings.json` : c'est ce qui fait tourner les phases 1–4 sur Opus et la phase 5 et suivantes sur Sonnet, sans `/model`. `emet doctor` avertit (sans jamais modifier vos réglages) s'il n'est pas défini.
- Un effort de session `medium` ou `high` plutôt que `xhigh` : les workers et le relecteur portent déjà leur propre effort quel que soit le vôtre, et une valeur globale élevée n'ajoute surtout que du coût aux tours du coordinateur (gestion de la distribution, merges, rapports) qui n'en ont pas besoin.
- `permissions.defaultMode` capable de s'exécuter sans surveillance (`auto`, `acceptEdits` ou `bypassPermissions`), plus des règles `permissions.deny` bloquant `git push * main|master` et `git push --force *`. `emet doctor` avertit sur les deux, car une vague qui reste bloquée sur une demande de permission, ou qui peut forcer le passage sur la branche principale, va à l'encontre de l'exécution sans surveillance.

Ce sont des points de départ, pas des valeurs définitives. Opus 5.5 est sorti le 2026-09-22, et le choix de l'effort et du modèle pour les agents de code est encore un domaine actif ; réajustez après quelques vraies vagues plutôt que de considérer ce tableau comme définitif.

## Vérifier

Exécutez `emet doctor`. Il avertit lorsque `model: "opusplan"`, l'effort de session ou `permissions.defaultMode` dans `~/.claude/settings.json` diffèrent des points de départ ci-dessus.
