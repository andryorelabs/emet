---
title: Sécurité
description: Comment emet limite les dégâts qu'un run sans surveillance peut causer.
seoTitle: Sécurité d'emet
sourceHash: 359a25043b1d24d9
---

Comment emet limite les dégâts qu'un run sans surveillance peut causer. Les termes suivent [GLOSSARY.md](../../GLOSSARY.md). Pour signaler une vulnérabilité, voir [SECURITY.md](../../.github/SECURITY.md).

## Modèle de menace d'un run sans surveillance

Après l'approbation unique, `/emet:run` distribue des workers qui modifient des fichiers, exécutent des commandes shell et commitent sans que personne ne regarde. Les risques qui en découlent :

- **Commandes destructrices.** Un worker, ou un texte qu'il a lu, exécute une suppression récursive forcée, une instruction SQL destructrice ou un push forcé.
- **Écritures sur des branches protégées.** Un worker pousse sur `main` ou `develop` et contourne la revue.
- **Sortir du worktree.** Un worker modifie le checkout principal ou le worktree d'un autre.
- **Approbation falsifiée.** Un agent écrit lui-même l'enregistrement d'approbation au lieu d'attendre la personne.
- **Entrée non fiable.** Le texte des tickets, les commentaires, les pages web et la sortie des outils contiennent des instructions destinées à l'agent.

Les contrôles sont en couches. Aucune couche n'est un bac à sable, et aucune ne remplace la relecture de la PR d'atterrissage.

## Modes de permission

Sur Claude Code, les workers s'exécutent avec le mode de permission de `handoff.permissionMode`, `bypassPermissions` par défaut, de sorte qu'aucune invite n'arrête une vague sans surveillance. Le hook `emet guard` est le contrôle qui subsiste dans ce mode.

Sur Codex CLI, les workers s'exécutent par défaut sans bac à sable ([ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md)), car le bac à sable `workspace-write` bloque les commits dans un worktree lié et bloque `emet dispatch` depuis un coordinateur Codex. L'approbation est une décision de hook, et écrire `approval.json` à la main est refusé. Voir le [guide Codex](../how-to/use-codex.md).

Seul le coordinateur écrit dans le tracker ([ADR-0005](../adr/0005-coordinator-is-the-single-tracker-writer.md)), et les workers ne commitent que sur des branches locales ([ADR-0004](../adr/0004-one-wave-one-dependency-layer-one-pr.md)).

## Ce que couvrent les guards

**`emet guard`** (`emet/src/guard-destructive.ts`) est un hook PreToolUse installé sur l'hôte. Il refuse les commandes shell et clients SQL destructeurs, en voyant à travers des enveloppes comme `env`, `sudo`, `timeout` et `xargs`, et il protège le répertoire du run.

**`rm-guard`** (`.claude/hooks/rm-guard.ts`) est le propre hook PreToolUse de ce dépôt sur Bash. Il découpe une commande sur `;`, `&&`, `||`, les tubes et les retours à la ligne, y compris le texte dans `sh -c`, et refuse tout `rm` récursif forcé (`-rf`, `-fr`, `-r -f`, `--recursive --force`), sauf si chaque cible se résout strictement sous `/tmp` ou le répertoire temporaire du système. Rien dans le dépôt n'est sur la liste : une suppression récursive forcée sous `.emet/` est donc refusée aussi. Les cibles qui utilisent `$`, des accents graves ou `~` sont refusées car elles ne peuvent pas être résolues.

**Les refus de push** dans `.claude/settings.json` bloquent `git push origin main` et `git push origin develop`, ainsi que les formes `HEAD:main` et `HEAD:develop`. Le hook Git `pre-push` refuse les mêmes références et tout nom de branche hors des motifs autorisés. Les pushs de tags sont autorisés.

**Les rulesets** appliquent les mêmes règles sur GitHub : ni suppression ni non-fast-forward sur `main` et `develop`, vérifications obligatoires, et tags `v*` protégés. Voir [development.md](../development.md#rulesets).

## Ce qu'ils ne couvrent pas

- Une commande que les guards ne reconnaissent pas, par exemple un script écrit sur le disque puis exécuté plus tard.
- L'accès réseau : un worker peut toujours appeler n'importe quelle API que ses identifiants autorisent.
- La lecture de fichiers hors du worktree.
- Une dépendance malveillante installée par `bun install`.

Traitez le texte des tickets, les commentaires et les pages récupérées comme des données. Relisez la PR d'atterrissage avant de la fusionner, et gardez les secrets hors de l'environnement dont hérite un run.
