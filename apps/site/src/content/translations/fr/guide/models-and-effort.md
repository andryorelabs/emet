---
title: Modèles et effort
description: Comment emet choisit un modèle et un effort de raisonnement pour chaque rôle, et quelles clés de configuration les modifient.
seoTitle: Modèles et effort dans emet
sourceHash: 7ab8a2e10ec9cae7
---

`/emet` choisit automatiquement un modèle et un effort de raisonnement par rôle ; il n'y a rien à changer à la main en cours d'exécution. Toutes les clés figurent dans la [référence de configuration](../reference/configuration.md#models).

| Rôle                                                       | Modèle                 | Effort                 | Défini par                                  |
| ---------------------------------------------------------- | ---------------------- | ---------------------- | ------------------------------------------- |
| Planification (phases 1–4)                                 | Opus, via `opusplan`   | celui de votre session | vous, une seule fois                        |
| Coordinateur, à partir de la phase 5                       | Sonnet, via `opusplan` | celui de votre session | vous, une seule fois                        |
| Workers (phase 7)                                          | Sonnet                 | `medium`               | `agents/emet-worker.md`, ou `models.worker` |
| Revue, niveau `passive` (diff de documentation uniquement) | aucun                  | —                      | `emet assess`                               |
| Revue, niveau `medium` (changement de code ordinaire)      | Opus                   | `medium`               | `models.reviewer.medium`                    |
| Revue, niveau `high` (chemins ou points sensibles)         | Opus                   | `medium` par défaut    | `models.reviewer.high`                      |
| Triage des logs de CI (phase 8)                            | Haiku                  | —                      | `models.triage`                             |

Les deux définitions d'agent (installées par `install.sh` dans `~/.claude/agents/`) fixent leur propre `model`/`effort` dans le frontmatter, si bien que le choix de modèle/effort du coordinateur ne déborde jamais sur un worker ou sur le relecteur. `emet doctor` signale (sans jamais bloquer) l'absence de l'un ou l'autre fichier. `emet preflight` bloque en revanche la distribution lorsque `emet-worker` ou `emet-reviewer` est absent, car la phase 6 et la phase 8 distribuent par `subagent_type`.

## Routage par niveau de risque

La phase 8 exécute `emet assess --base <trunk> --head <integration branch>`, qui classe le diff de façon déterministe et affiche du JSON avec le niveau, les raisons et le modèle/effort recommandés pour le relecteur :

- `passive` : diff de documentation uniquement ; aucun relecteur n'est distribué.
- `medium` : le relecteur s'exécute avec `models.reviewer.medium`.
- `high` : le diff touche l'authentification, la sécurité, les paiements, les webhooks, la CI, l'installateur, les lockfiles, les migrations, un point sensible dangereux (SQL brut, pipe-to-shell et similaires) ou un chemin correspondant à `review.highRiskPaths`. Le relecteur s'exécute avec `models.reviewer.high`, et l'auto-merge n'atterrit la PR qu'avec des checks au vert et aucun constat de revue ouvert.

Un ticket qui touche des chemins à haut risque peut porter une ligne `Model:` (par exemple `Model: opus` ou `Model: opus/high`), qui remplace `models.worker` pour ce seul worker.

## Triage avec Haiku

Le coordinateur ne lit jamais un log de CI en entier. Un check en échec est confié à un agent sur `models.triage` (par défaut `haiku`), qui renvoie au plus environ 2k tokens avec des pointeurs `file:line` pour la correction.

## Configuration

Toutes les clés sont facultatives, et les valeurs par défaut reproduisent le tableau ci-dessus :

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

`review.highRiskPaths` est une liste de sous-chaînes de chemin supplémentaires, insensibles à la casse, qui forcent le niveau `high`. Pour obtenir plus de rigueur sur les vagues risquées, augmentez `models.reviewer.high.effort` (par exemple à `high`).

## Hôte Codex

Avec `agentHost` à `"codex"`, chaque worker et chaque reviewer est son propre processus `codex exec`, avec `-m` et `model_reasoning_effort` fixés par rôle. Les valeurs par défaut de la section [`codex`](../reference/configuration.md) sont :

| Rôle                           | Modèle        | Effort                                     | Repli                         |
| ------------------------------ | ------------- | ------------------------------------------ | ----------------------------- |
| Session (`$emet:run`)          | `gpt-6.1-sol` | `medium` (`high` pendant la planification) | aucun                         |
| Worker                         | `gpt-6.1-sol` | `medium`                                   | `gpt-6.1-terra`, `gpt-6-luna` |
| Worker avec une ligne `Model:` | `gpt-6.1-sol` | `xhigh`                                    | `gpt-6-astra`                 |
| Reviewer, niveau `medium`      | `gpt-6.1-sol` | `high`                                     | aucun                         |
| Reviewer, niveau `high`        | `gpt-6-astra` | `high`                                     | `gpt-6.1-sol`                 |
| Triage                         | `gpt-6-luna`  | `medium`                                   | `gpt-6.1-terra`               |

`emet dispatch` résout chaque slug dans le cache de modèles de Codex. Il garde un slug qui y figure et accepte l'effort, sinon suit la mise à niveau du modèle, puis les replis, puis omet `-m`, et journalise chaque substitution. L'effort `ultra` n'est jamais envoyé. Le niveau `passive` ne lance aucun reviewer.

Réglez de nouveau après quelques vraies vagues quand :

- les workers demandent plusieurs tours de correction : augmentez `codex.models.worker.effort` ou mettez une ligne `Model:` sur le ticket risqué ;
- les revues de vagues de niveau `high` manquent des constats : augmentez `codex.models.reviewer.high.effort` ;
- le journal montre une substitution : Codex a renommé ou retiré un slug, mettez-le à jour.

## Pourquoi un seul relecteur

Pourquoi un seul relecteur à contexte neuf plutôt qu'un éventail de plusieurs angles : aucun benchmark public ne compare directement les deux, mais un éventail relit tout le diff une fois par angle et s'est bloqué pendant plus d'une heure dans ce dépôt, tandis que des rapports d'Anthropic et de tiers sur les modèles de classe Opus suggèrent que la montée en gamme du modèle apporte autant que les angles supplémentaires. Pour une vague à forts enjeux, lancez ensuite `/code-review ultra` à la main ; `/emet` ne le distribue jamais de lui-même.

## Ce que vous définissez une fois, vous-même

`/emet` ne peut pas changer ceci en cours d'exécution :

- `model: "opusplan"` dans `~/.claude/settings.json` : c'est ce qui fait tourner les phases 1–4 sur Opus et la phase 5 et suivantes sur Sonnet, sans `/model`. `emet doctor` avertit (sans jamais modifier vos réglages) s'il n'est pas défini.
- Un effort de session `medium` ou `high` plutôt que `xhigh` : les workers et le relecteur portent déjà leur propre effort quel que soit le vôtre, et une valeur globale élevée par défaut ajoute surtout du coût aux tours du coordinateur lui-même (suivi des distributions, merges, rapports) qui n'en ont pas besoin.
- Un `permissions.defaultMode` capable de tourner sans surveillance (`auto`, `acceptEdits` ou `bypassPermissions`), plus des règles `permissions.deny` bloquant `git push * main|master` et `git push --force *`. `emet doctor` avertit pour les deux, car une vague qui reste bloquée sur une demande d'autorisation ou qui peut forcer le passage sur la branche principale va à l'encontre du but d'une exécution sans surveillance.

Ce sont des points de départ, pas des chiffres définitifs. Opus 5.5 est sorti le 2026-09-22, et le choix d'effort et de modèle pour les agents de programmation reste un domaine actif ; réajustez après quelques vagues réelles plutôt que de considérer ce tableau comme final.
