---
title: Architecture
description: Une carte du code de emet/src et la façon dont les prompts de /emet le pilotent.
seoTitle: Architecture d'emet
sourceHash: c86098a9614756e9
---

Une carte du code de `emet/src` et la façon dont les prompts de `/emet` le pilotent. Les termes suivent [GLOSSARY.md](../GLOSSARY.md) ; les décisions derrière cette forme se trouvent dans [docs/adr](adr/README.md). Pour les problèmes, voir le [dépannage](troubleshooting.md).

- [Forme](#forme)
- [Comment les prompts pilotent la CLI](#comment-les-prompts-pilotent-la-cli)
- [Carte des modules](#carte-des-modules)
- [Organisation des prompts](#organisation-des-prompts)
- [Distribution](#distribution)
- [Voir aussi](#voir-aussi)

## Forme

Il y a deux moitiés. Les prompts (`commands/run.md`, `agents/*.md`, `emet/reference/*.md`) disent à l'agent quoi faire à chaque phase. La CLI `emet` (`emet/bin/emet.ts` et `emet/src/`) fait tout ce qui doit être déterministe : vérifications, réservations, slots, gates, écritures dans le tracker et atterrissage. Les prompts ne réimplémentent jamais une vérification que la CLI effectue déjà.

`emet/bin/emet.ts` est un répartiteur léger : il lit le premier argument et passe la main à un module de sous-commande, qui lit lui-même le reste de `process.argv`. Les codes de sortie ont un sens dans toutes les sous-commandes.

## Comment les prompts pilotent la CLI

`commands/run.md` est un routeur court. Il charge un seul fichier de phase de `emet/reference/` à la fois, de sorte qu'une compaction ne perd jamais les règles de la phase en cours.

| Phase                                     | Prompt                                       | Appels à la CLI                                                               |
| ----------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| 1-5 entretien, spec, tickets, approbation | `phases-1-5.md`                              | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                |
| 6-7 distribution et workers               | `phases-6-7-dispatch.md`, `worker-prompt.md` | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results` |
| 8 revue, gate, atterrissage, clôture      | `phases-8-closeout.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `cleanup`     |
| 9 handoff et enchaînement                 | `phases-9-handoff.md`                        | `status`, `metrics`, `usage`, `spec-merge`                                    |

Le coordinateur est le seul à écrire dans le tracker (ADR-0005) : les workers font leur rapport via une note de handoff et `emet results`, et le coordinateur les publie. `emet guard` s'exécute comme un hook `PreToolUse` et bloque les déclencheurs connus d'échecs lors d'exécutions sans surveillance.

## Carte des modules

Chaque module a un `*.test.ts` à ses côtés.

| Domaine                | Modules                                                                                                                                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration et audit | `init.ts` (configuration et squelette de documents), `config.ts` (`emet.config.json`, l'ancien `forge.config.json` est toujours lu), `doctor.ts` (balayage de flotte), `preflight.ts` (hygiène de la distribution), `dependencies.ts`, `skills.ts` (contrat mattpocock-skills), `map.ts` (résumé du code) |
| État d'exécution       | `claims.ts` (réservations de tickets), `slots.ts` (pool de slots de workers), `resources.ts` (infos de l'hôte), `runs.ts` (vivacité), `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `status.ts`, `launch.ts`                                                                  |
| Tracker                | `tracker.ts`, `tracker-files.ts` (tracker local `.scratch/`), `validate.ts` (couverture de la spec), `specmerge.ts`, `approve.ts`, `surfaces.ts` (chevauchement des surfaces d'édition)                                                                                                                   |
| Handoff du worker      | `handoff.ts`, `results.ts`, `materializelog.ts`                                                                                                                                                                                                                                                           |
| Revue et atterrissage  | `verify.ts`, `reviewpackage.ts`, `review.ts` (registre des constats), `assess.ts` (classificateur de risque), `gate.ts`, `land.ts`                                                                                                                                                                        |
| Rapports               | `metrics.ts`, `usage.ts`                                                                                                                                                                                                                                                                                  |
| Sécurité               | `guard.ts`, `guard-destructive.ts`                                                                                                                                                                                                                                                                        |
| Utilitaires partagés   | `narrow.ts`, `optional.ts`, `assets.ts` (fichiers embarqués dans les binaires compilés)                                                                                                                                                                                                                   |

Les valeurs propres à chaque hôte se trouvent derrière l'interface `AgentHost` de `agenthost.ts` : `agenthost-claude.ts` est l'adaptateur Claude Code et `agenthost-codex.ts` celui de Codex, choisis par `agentHost` dans la configuration. Le côté Codex ajoute `codex-models.ts` (résolution des modèles), `codex-home.ts` (surcouche `CODEX_HOME` par run), `codex-process.ts` et `codex-session.ts` (exécuteur de processus et passation), `codex-usage.ts` (usage depuis `exec --json`), `guard-codex.ts` (entrée de hooks et porte d'approbation), `dispatch.ts` et `review-run.ts`. Voir le [guide Codex](guide/codex.md).

## Organisation des prompts

`commands/run.md` (environ 130 lignes) est le routeur de `/emet`. Chaque fichier de `emet/reference/` est un groupe de phases (`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-closeout.md`, `phases-9-handoff.md`), chargé seulement quand le mode de l'exécution en cours en a besoin. Un test échoue si l'un d'eux dépasse 20 000 octets, afin qu'un seul fichier ne puisse pas envahir le contexte après une compaction. Les phases demandent au coordinateur de relire la section concernée avant chaque tour de correction ou de revue. `install.sh` met de côté un ancien `phases-6-9.md` unique sous le nom `phases-6-9.md.retired` lorsque vous l'avez modifié ou qu'il est antérieur au manifeste d'installation, et le supprime sinon. `install.sh` branche aussi `emet guard` dans `~/.claude/settings.json` comme hook `PreToolUse`.

## Distribution

`install.sh` copie `emet/` dans `~/.claude/emet` et réécrit les prompts. La voie par plugin fournit un shim qui télécharge un binaire autonome à somme de contrôle vérifiée, construit par `tools/build-binaries.ts`. Voir l'[ADR-0008](adr/0008-standalone-binaries-and-plugin-distribution.md).

## Voir aussi

- [Premiers pas](guide/getting-started.md) et [Trackers et atterrissage](guide/trackers-and-landing.md)
- [Référence de configuration](reference/configuration.md), [référence de la CLI](reference/cli.md) et [Dépendances](reference/dependencies.md)
- [AGENTS.md](../AGENTS.md) et [emet/AGENTS.md](../emet/AGENTS.md)
- [Index de la documentation](README.md)
