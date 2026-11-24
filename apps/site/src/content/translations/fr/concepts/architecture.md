---
title: Architecture
description: Une carte du code de emet/src et la façon dont les prompts de /emet le pilotent.
seoTitle: Architecture d'emet
sourceHash: ac65f41cf78af13e
---

Une carte du code de `emet/src` et la façon dont les prompts de `/emet` le pilotent. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md) ; les décisions derrière cette forme se trouvent dans [docs/adr](../adr/README.md). Pour les problèmes, voir le [dépannage](../troubleshooting.md).

- [Forme](#forme)
- [Comment les prompts pilotent la CLI](#comment-les-prompts-pilotent-la-cli)
- [Carte des modules](#carte-des-modules)
- [Organisation des prompts](#organisation-des-prompts)
- [Distribution](#distribution)
- [Voir aussi](#voir-aussi)

## Forme

Il y a deux moitiés. Les prompts (`commands/run.md`, `agents/*.md`, `emet/reference/*.md`, et les `codex/skills/**` et `codex/hooks.json` générés pour Codex) disent à l'agent quoi faire à chaque phase. La CLI `emet` (`emet/bin/emet.ts` et `emet/src/`) fait tout ce qui doit être déterministe : vérifications, réservations, slots, gates, écritures dans le tracker et atterrissage. Les prompts ne réimplémentent jamais une vérification que la CLI effectue déjà.

`emet/bin/emet.ts` est un répartiteur léger : il lit le premier argument et passe la main à un module de sous-commande, qui lit lui-même le reste de `process.argv`. Les codes de sortie ont un sens dans toutes les sous-commandes.

## Comment les prompts pilotent la CLI

`commands/run.md` est un routeur court. Il charge un seul fichier de phase de `emet/reference/` à la fois, de sorte qu'une compaction ne perd jamais les règles de la phase en cours.

| Phase                                     | Prompt                                                                                        | Appels à la CLI                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1-5 entretien, spec, tickets, approbation | `phases-1-5.md`                                                                               | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                                         |
| 6-7 distribution et workers               | `phases-6-7-dispatch.md`, `worker-prompt.md`                                                  | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results`                          |
| 8 revue, gate, atterrissage, clôture      | `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `spec-branch`, `spec-merge`, `cleanup` |
| 9 handoff et enchaînement                 | `phases-9-handoff.md`                                                                         | `status`, `metrics`, `usage`                                                                           |

Le coordinateur est le seul à écrire dans le tracker (ADR-0005) : les workers font leur rapport via une note de handoff et `emet results`, et le coordinateur les publie. `emet guard` s'exécute comme un hook `PreToolUse` et bloque les déclencheurs connus d'échecs lors d'exécutions sans surveillance.

## Carte des modules

Chaque module a un `*.test.ts` à ses côtés. `tools/architecture-map.test.ts` échoue quand un module hors test de `emet/src` manque dans cette liste.

**Installation, setup et audit**

- `init.ts` écrit la configuration et le squelette de documents ; `config.ts` lit `emet.config.json` (l'ancien `forge.config.json` est toujours lu) ; `names.ts` résout un nom vers son orthographe actuelle ou ancienne.
- `doctor.ts` est le balayage de flotte ; `preflight.ts` vérifie l'hygiène de la distribution ; `dependencies.ts` et `skills.ts` (le contrat mattpocock-skills) vérifient ce dont un run a besoin ; `map.ts` écrit le résumé du code ; `plugin-detect.ts` indique quels plugins sont installés.
- `setup.ts` installe les extras optionnels, `setupledger.ts` enregistre chaque changement pour pouvoir l'annuler, et `settingsapply.ts` contient les réglages recommandés de Claude Code.
- `self.ts`, `self-install.ts`, `self-source.ts`, `self-types.ts`, `self-update.ts`, `self-host-claude.ts` et `self-host-codex.ts` implémentent `emet self` : installation, installations depuis les sources, mises à jour et fichiers propres à chaque hôte. `hooks-merge.ts` fusionne les hooks d'emet dans les réglages de l'hôte, `uninstall.ts` annule une installation à partir du registre, `migrate.ts` migre les anciens noms, `update-notice.ts` et `whats-new.ts` informent la personne des nouvelles versions, et `embedded-tree.generated.ts` contient les fichiers embarqués dans le binaire compilé.
- `assets.ts` lit ces fichiers embarqués.

**État d'exécution**

- `claims.ts` gère les réservations de tickets, `slots.ts` le pool de slots de workers, `resources.ts` les infos de l'hôte, `runs.ts` la vivacité et `runcurrent.ts` le run courant d'un checkout.
- `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `mergedpr.ts` et `landed.ts` gèrent les worktrees, les verrous et le nettoyage des branches qui ont atterri.
- `status.ts` rapporte les vagues et les sessions, `launch.ts` et `chain.ts` démarrent les runs et la vague suivante sans surveillance, `fleet.ts` travaille sur plusieurs dépôts, et `phase.ts` enregistre la phase courante.
- `signals.ts` nettoie lors d'une interruption.

**Tracker et specs**

- `tracker.ts` et `tracker-files.ts` (le tracker local `.scratch/`) lisent et écrivent les tickets, `ticketclose.ts` les ferme, `validate.ts` vérifie la couverture de la spec, `approve.ts` enregistre l'approbation et `surfaces.ts` détecte le chevauchement des surfaces d'édition.
- `specmerge.ts` fusionne les deltas de spec dans les specs vivantes ; `specbranch.ts`, `speclanding.ts` et `specabandon.ts` gèrent la branche `spec/<id>` ; `landing-unit.ts` détermine si un run atterrit par spec ou par vague ; `afterspec.ts` et `promote.ts` exécutent l'étape après la spec.

**Handoff du worker**

- `handoff.ts`, `results.ts` et `materializelog.ts` transmettent au coordinateur ce que rapporte un worker, et `mailbox.ts` est la boîte aux lettres gérée par la CLI pour les workers Codex.

**Revue et atterrissage**

- `verify.ts`, `reviewpackage.ts`, `review.ts` (le registre des constats), `review-run.ts` (le relecteur Codex), `assess.ts` (le classificateur de risque), `gate.ts`, `land.ts` et `ci.ts` vérifient, relisent et font atterrir une vague. `deploycheck.ts` exécute la vérification après déploiement.

**Journal, attention et rapports**

- `journal.ts` ajoute des événements et `insights.ts` les lit ; `attention.ts` enregistre l'état d'attention d'une session et `attention-alert.ts` déclenche l'alerte ; `metrics.ts` et `usage.ts` rapportent le coût et les résultats.
- `memory.ts` et `engram-client.ts` cherchent et enregistrent des Lessons dans Engram.

**Sécurité**

- `guard.ts`, `guard-destructive.ts` et `guard-codex.ts` sont les hooks de garde.

**Plomberie des commandes et utilitaires partagés**

- `commands.ts` décrit les commandes et leurs options, `flags.ts` les options que toutes les commandes acceptent, `envelope.ts` la sortie `--json`, `errors.ts` les codes d'erreur, `exit-codes.ts` et `exit-code.ts` les codes de sortie, `env.ts` la vue de l'environnement, `color.ts` et `banner.ts` la sortie du terminal, et `present.ts`, `narrow.ts` et `optional.ts` de petits utilitaires de restriction de type.
- `test-preload.ts` et `expect-rejection.ts` soutiennent les tests.

Les valeurs propres à chaque hôte se trouvent derrière l'interface `AgentHost` de `agenthost.ts` : `agenthost-claude.ts` est l'adaptateur Claude Code et `agenthost-codex.ts` celui de Codex, choisis par `agentHost` dans la configuration. Le côté Codex ajoute `codex-models.ts` (résolution des modèles), `codex-home.ts` (surcouche `CODEX_HOME` par run), `codex-process.ts` et `codex-session.ts` (exécuteur de processus et passation), `codex-usage.ts` (usage depuis `exec --json`), `guard-codex.ts` (entrée de hooks et porte d'approbation) et `dispatch.ts`. Voir le [guide Codex](../how-to/use-codex.md).

## Organisation des prompts

`commands/run.md` (environ 130 lignes) est le routeur de `/emet` sur Claude Code ; sur Codex, les `codex/skills/**` et `codex/hooks.json` générés jouent ce rôle. Chaque fichier de `emet/reference/` est un groupe de phases (`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `phases-9-handoff.md`), chargé seulement quand le mode de l'exécution en cours en a besoin. Un test échoue si l'un d'eux dépasse 20 000 octets, afin qu'un seul fichier ne puisse pas envahir le contexte après une compaction. Les phases demandent au coordinateur de relire la section concernée avant chaque tour de correction ou de revue. `emet self install` supprime un `phases-8-closeout.md` résiduel qui correspond encore au manifeste d'installation et, sinon, le met de côté sous le nom `phases-8-closeout.md.retired` ; ce fichier est scindé en `phases-8-review.md` (revue et gate) et `phases-8-landing.md` (atterrissage et clôture). `phases-8-spec-landing.md` contient les règles de `landing.unit: spec` : intégrer chaque vague dans `spec/<id>`, synchroniser le trunk et faire atterrir la spec une seule fois. `emet self install` fusionne aussi les hooks d'emet, dont `emet guard` comme hook `PreToolUse`, dans `~/.claude/settings.json`.

## Distribution

`emet self install` place le binaire autonome, écrit les prompts réécrits sous `~/.claude/` et, avec `--from <checkout>`, copie les sources de `emet/` dans `~/.claude/emet`. Le plugin Codex est décrit par `.codex-plugin/plugin.json`, généré avec `bun run build:codex` en même temps que `codex/skills/**` et `codex/hooks.json`. La voie par plugin de Claude Code fournit un shim qui télécharge un binaire autonome à somme de contrôle vérifiée, construit par `tools/build-binaries.ts`. Voir l'[ADR-0008](../adr/0008-standalone-binaries-and-plugin-distribution.md).

## Voir aussi

- [Premiers pas](../start/install.md) et [Trackers et atterrissage](../how-to/configure-tracker.md)
- [Référence de configuration](../reference/configuration.md), [référence de la CLI](../reference/cli.md) et [Dépendances](../reference/dependencies.md)
- [AGENTS.md](../../AGENTS.md) et [emet/AGENTS.md](../../emet/AGENTS.md)
- [Index de la documentation](../README.md)
