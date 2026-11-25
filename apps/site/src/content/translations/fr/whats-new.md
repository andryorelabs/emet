---
title: Nouveautés
description: Notes de version d'emet : ce qui a changé dans chaque version.
seoTitle: Nouveautés d'emet : notes de version
sourceHash: 2e828f2cf39020f5
---

## 0.22.2

2026-11-25

### Modifié

- Les parties interactives du site web (menus de l'en-tête, menu mobile, recherche, menu des actions de page, FAQ, onglets d'installation, page 404 et pastille d'annonce) sont des îlots React sur shadcn `base-nova`, hydratés à la première interaction.
- `bun run lint` vérifie les fichiers `.tsx` avec `@shadcn/lint`, et le seuil de couverture et knip ignorent la couche vendorisée `apps/site/src/components/ui`.
- La CLI `emet` reste inchangée, hors sa version.

### Corrigé

- La FAQ du site web ne déclenche plus de violation de la Content-Security-Policy : les deux valeurs de style en ligne qu'elle rend sont autorisées par hachage.
- Les questions de la FAQ conservent un contour de focus visible en mode couleurs forcées.
- Le menu de langue continue de fonctionner sans script grâce à une simple liste de liens.

## 0.22.1

2026-11-25

### Corrigé

- `emet promote` n'ouvre la pull request de synchronisation de `main` vers `develop` que lorsque `main` porte du contenu absent de `develop`. Un `develop` en squash seul ne cumule donc plus, après chaque promote, une pull request de synchronisation impossible à fusionner. Quand seuls des commits de merge diffèrent, rien ne s'ouvre et `syncReason` en donne la raison.
- La pull request de synchronisation est fusionnée avec `pr.mergeMethod` au lieu d'un commit de merge.
- `emet promote --hold` écrit son marqueur dans `<git common dir>/.emet/runs/<id>/no-promote` au lieu d'un répertoire `promote hold marker`. Les marqueurs aux anciens emplacements retiennent toujours le spec.

## 0.22.0

2026-11-24

### Ajouté

- Le binaire `emet` embarque l'arborescence d'installation (commands, agents, prompts de référence, hooks, skills Codex et manifestes de plugin), générée à la compilation et contrôlée contre toute dérive par `bun run check`, de sorte qu'un binaire compilé n'a pas besoin d'un checkout.
- `emet self install [latest|X.Y.Z] [--dry-run] [--from <checkout>] [--force]` installe le binaire autonome sous `~/.local/share/emet/versions/<v>/` avec le lien symbolique `~/.local/bin/emet`, écrit les fichiers de Claude Code et fusionne les hooks d'emet dans `~/.claude/settings.json` après une sauvegarde, sans toucher aux hooks tiers. Il refuse de continuer lorsque le plugin emet est installé, sauf avec `--force`. `--from` reproduit l'installation depuis les sources avec Bun.
- L'adaptateur Codex de `emet self install` écrit les skills d'emet sous `~/.agents/skills` et ajoute les hooks embarqués à `$CODEX_HOME/hooks.json`, sans jamais écrire `config.toml`, et affiche l'étape de confiance unique `/hooks`. L'overlay du worker Codex omet les tables du plugin emet lorsqu'il détecte une installation autonome.
- `emet self update [latest|X.Y.Z]` et `emet self update --auto` téléchargent la version, vérifient `SHA256SUMS` (et l'attestation lorsque `gh` est présent) et la préparent. La substitution attend qu'aucun slot de worker ne soit occupé. `--auto` s'exécute depuis un hook `SessionStart` au plus une fois par jour.
- `scripts/install-remote.sh`, joint à chaque version sous le nom `install.sh`, télécharge le binaire, vérifie sa somme de contrôle et exécute `emet self install` : `curl -fsSL https://emet.andryore.dev/install.sh | sh`.
- `emet doctor` avertit lorsque l'installation autonome et le plugin coexistent, lorsque des fichiers installés dérivent de l'arborescence embarquée, lorsqu'un hook Codex n'a pas d'entrée `trusted_hash`, et lorsqu'une mise à jour est en attente ou que la mise à jour automatique est désactivée.
- `docs/reference/stability.md` est publié, et `docs/specs/translations.md` est une nouvelle spec vivante.

### Modifié

- La documentation est restructurée en cinq groupes, Get started, Concepts, How-to, Reference et Help, dans les dix langues. Chaque route publiée avant cette version redirige vers sa nouvelle route, et `/docs/` redirige vers `/docs/start/overview/`.
- `start/overview`, `start/install` et `start/first-run` contiennent les seules instructions d'installation. L'installation autonome vient en premier et les plugins sont marqués comme facultatifs.
- Les pages Concepts expliquent leur sujet sans tableaux de configuration, `concepts/landing` indique qu'une spec atterrit par défaut en une seule pull request, et `concepts/architecture` liste tous les modules de `emet/src` hors tests. Les pages How-to sont des étapes de tâche avec des prérequis et une vérification du résultat, et `reference/cli` a un titre par commande.
- La page d'accueil du site web montre une pull request par spec et couvre le mode rapide, la mémoire, la double revue, les alertes d'attention et l'installation réversible.
- `emet uninstall` supprime aussi les artefacts de l'installation autonome : le répertoire des versions, le lien symbolique, le fichier d'état de l'installation, les skills et hooks Codex, et chaque commande de hook d'emet dans les deux fichiers de hooks. Les fichiers modifiés et les hooks tiers sont conservés.
- Chaque page publiée sauf `whats-new` a une traduction à jour dans chacune des neuf langues, y compris la nouvelle page `reference/stability`.

### Supprimé

- `install.sh` disparaît. `emet self install` et la commande `curl` le remplacent, et les vérifications de dépendances et les remèdes de doctor y renvoient.

## 0.21.0

2026-11-23

### Ajouté

- `emet setup --dry-run` (combinable avec `--with`, `--yes` et `--json`) affiche les étapes prévues de chaque élément choisi, ou `already-present`, et ne change rien : il n'exécute aucune commande et n'écrit ni fichier ni entrée du registre.
- `emet setup` consigne dans le registre de setup, `setup-ledger.json` sous le répertoire d'état, chaque élément qui termine `installed`, avec les enregistrements d'annulation nécessaires pour le rétablir. Les écritures du registre sont atomiques, et un registre malformé est une erreur qui nomme son chemin.
- `emet setup --restore <id>` rétablit `claude-settings` (le `model` précédent et les règles deny ajoutées par emet, après une sauvegarde horodatée) ou `firecrawl-local` (l'entrée MCP précédente de portée utilisateur). Tout autre id se termine par 2, et un id sans entrée dans le registre se termine par 1.
- `emet uninstall [--dry-run] [--yes] [--purge] [--json]` supprime une installation faite par `install.sh` : les fichiers du manifeste dont le hash correspond encore, le shim, chaque hook `emet guard` dans `~/.claude/settings.json` (après une sauvegarde horodatée) et les extras du registre de setup. Les fichiers modifiés sont conservés et listés. Pour les installations globales brew, bun et cargo, il affiche la commande de suppression et ne l'exécute jamais.
- `./install.sh --uninstall [flags]` exécute `emet uninstall`.
- `docs/reference/cli.md` et `README.md` documentent le registre de setup, `--dry-run`, `--restore` et `emet uninstall`, dans les neuf langues.

## 0.20.0

2026-11-22

### Ajouté

- `emet guard` enregistre un événement de journal `session.attention`, `{sessionId, state, from, trigger}`, lorsqu'une session gérée par emet change d'état entre `working`, `idle`, `needs-decision` et `ended`. Un événement n'est ajouté que si l'état diffère du dernier état enregistré de la session. Le journal ne stocke jamais le texte des notifications, les prompts ni les entrées d'outils, et l'enregistrement ne modifie jamais le verdict, la sortie stdout ni le code de sortie de guard.
- `hooks/hooks.json` et `install.sh` relient les événements de hook `Notification`, `PermissionRequest`, `SessionEnd` et `UserPromptSubmit` à `emet guard --event <Event>`. `install.sh` reste idempotent. `codex/hooks.json` est inchangé.
- Le JSON de `emet status` gagne `sessions: [{sessionId, state, blocked, since, runId}]`, le dernier état de chaque session du dépôt au cours des dernières 24 heures, hors `ended`. Une session bloquée fait passer l'état global à `needs-decision` et est nommée dans la ligne de résumé et dans `--brief`.
- `emet fleet status [--json]` affiche les derniers états de session par dépôt depuis le journal global, les dépôts bloqués en premier.
- Lors d'une transition vers `needs-decision`, emet déclenche une alerte : une marque non lu et un commentaire sur le worktree Orca du dépôt lorsque Orca est joignable, sinon `notify-send` s'il est dans le PATH. `attention.alert` (booléen, `true` par défaut) est ajouté aux schémas de configuration et la désactive.
- `docs/reference/cli.md`, `docs/reference/configuration.md` et `docs/guide/fleet.md` documentent les fonctions d'attention des sessions, dans les neuf langues.

## 0.19.0

2026-11-22

### Ajouté

- `emet memory search --json <query> [--limit <n>]` et `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <outcome>` lisent et écrivent des Lessons dans Engram. `search` garde les notes dont la topic key commence par `emet/<repo>/lessons/` et affiche leur contenu complet ; `save` ajoute une section par run à la note de la spec ou du quick run, de 1 à 5 puces sur stdin. Les deux affichent un objet JSON, sortent avec 0 pour tout problème d'Engram et avec 2 uniquement en cas d'usage incorrect.
- `memory.enabled` (`auto` ou `off`, `auto` par défaut) est ajouté aux schémas de configuration. `off` ne lance jamais `engram`.
- La Phase 1 cherche dans la mémoire des Lessons antérieures avant le premier tour d'entretien et écrit celles qui sont pertinentes sous `## Prior lessons` dans le fichier de plan. Les passations de la wave et du quick run enregistrent les Lessons du run avant le rapport final. `--draft` n'enregistre rien.
- `docs/reference/cli.md` et `docs/reference/configuration.md` documentent `emet memory` et `memory.enabled`, dans les neuf langues.

### Modifié

- Le build Codex rejette `mcp__engram` dans une référence générée, de sorte que les noms d'outils d'Engram n'atteignent jamais le plugin Codex.
- Les prompts de `/emet:run` gagnent les étapes de mémoire ci-dessus ; sans `engram` dans le PATH, ou avec `memory.enabled: "off"`, chaque étape est une note d'une ligne et le run continue comme en 0.18.0.

## 0.18.0

2026-11-22

### Ajouté

- `emet review --ticket <t> --coverage <file|-> [--expect S1,S3]` enregistre des Coverage verdicts dans le ledger. Un verdict `met` dont le test est absent ou introuvable dans l'arbre de travail, et un S# attendu sans verdict, ouvrent chacun un finding `VG-S<n>`.
- `emet review --base <ref>` enregistre la base de la revue au premier tour et marque comme `preexisting` un finding sur une ligne que la wave n'a pas touchée. `emet gate` ne compte jamais un finding préexistant comme bloquant.
- Les findings acceptent les champs facultatifs `s`, `userOption` et `agreement`. Un finding ouvert avec `userOption` bloque à tous les niveaux et toutes les sévérités, et le gate répond `hold` avec `next: "fix-findings"`. La Phase 2 écrit un S# issu d'une option choisie par l'utilisateur sous la forme `(user option)`.
- `emet review --merge <a.json> <b.json>` fusionne deux tableaux de findings en un seul. Deux findings s'apparient quand ils partagent `s`, ou partagent `file` avec des lignes distantes d'au plus 3, et reçoivent `agreement: "both"` ou `"single"`.
- `emet assess` affiche `dualReview: {run, reason}`, et `review.dual` (`auto` ou `off`, `auto` par défaut) est ajouté aux schémas de configuration. Sur l'hôte Claude avec `codex` dans le PATH, une wave `high` lance une Dual review : `emet:emet-reviewer` et `emet review-run --tier high --coverage-out <file>` en parallèle, puis `emet review --merge`.
- `emet review-run --coverage-out <file>` écrit les Coverage verdicts du relecteur Codex, et son schéma de sortie accepte `s` et `userOption` nullables.
- `docs/reference/cli.md` et `docs/reference/configuration.md` documentent les changements de revue, dans les neuf langues.

### Modifié

- Le prompt du relecteur et `agents/emet-reviewer.md` demandent un fichier de Coverage verdicts, `.emet/coverage-<run>.json`, au lieu d'une ligne en prose `S<n>: met | partial | unmet`. La Phase 8 enregistre les verdicts avec `emet review --coverage` et liste les findings préexistants dans le rapport de wave sans les corriger.
- Sans `--base`, `--coverage`, `--merge` ni Dual review, chaque commande se comporte comme en 0.17.0.

## 0.17.0

2026-11-22

### Ajouté

- `/emet:run --quick <changement>` lance une Quick run pour un changement qui tient dans un ticket : un tour d'entretien, une spec avec un ticket folded, une approbation, un worker, la revue et le Landing de cette unique Wave sous forme de pull request (ou de merge local), sans `emet chain`. Elle s'arrête avant l'approbation et recommande `/emet:run` sans `--quick` lorsque le changement touche un écran ou ne tient pas dans un ticket, et elle est refusée avec `--draft` ou `--dispatch`. `--no-promote` est accepté. Les étapes se trouvent dans le nouveau `emet/reference/phases-quick.md`. Voir ADR-0039.
- `emet assess --quick` affiche le JSON habituel plus `"quickRejected"` et se termine avec le code `1` lorsque le niveau est `high`. Une Quick run le traite comme un Stop du Gate : pas d'auto-merge, la pull request reste ouverte et le rapport final nomme les raisons de risque élevé. Sans `--quick`, la sortie et les codes de sortie ne changent pas.
- `emet approve --quick` écrit `"mode": "quick"` dans `approval.json`. Les enregistrements écrits avant ce changement passent toujours `--check`.
- `resolveLandingUnit(config, runId, root)` renvoie `wave` pour une exécution approuvée avec `--quick` et `config.landing.unit` sinon. `emet landed`, `emet status` et `emet preflight` lisent l'unité de landing par ce biais, si bien qu'une Quick run n'attend jamais de branche de spec.
- `emet validate` signale une erreur `no-tickets` lorsqu'un plan n'a aucun ticket et indique d'écrire un ticket folded.
- `docs/reference/cli.md` et `docs/guide/trackers-and-landing.md` documentent la Quick run, dans les neuf langues.

### Modifié

- La phrase du chemin rapide dans `phases-1-5.md` indique désormais d'écrire un ticket marqué `folded` pour une demande sous le seuil, au lieu de n'écrire aucun ticket.
- `emet preflight --approval <run>` déduit l'unité de landing de l'enregistrement d'approbation de cette exécution lorsque `--run` est absent.

## 0.16.0

2026-11-21

### Ajouté

- Specs vivantes, désactivées par défaut. Avec `specs.enabled: true`, lors de la dernière wave d'une spec, le coordinateur écrit les deltas d'exigences `ADDED`/`MODIFIED`/`REMOVED` de la spec, exécute `emet spec-merge --spec <id>` une seule fois sur la branche d'intégration de cette wave avant sa revue, et commite le `docs/specs/<area>.md` mis à jour, si bien que le changement est relu et atterrit dans la même pull request. Une nouvelle référence, `living-specs.md`, décrit le format des deltas et la règle de nouvelle tentative. Voir ADR-0038.
- `specs.enabled` (`false` par défaut) dans la configuration et dans les deux copies du schéma. `emet init` écrit `"specs": { "dir": "docs/specs", "enabled": false }`.
- `emet doctor` avertit, uniquement lorsque `specs.enabled` vaut `true`, si `specs.dir` est ignoré par gitignore ou est un fichier. L'absence de `specs.dir` n'est pas un avertissement.
- `emet spec-merge --spec <id> --deltas-dir` crée et affiche le répertoire de deltas partagé, `<git common dir>/.emet/runs/<id>/spec-deltas`, et se termine avec le code `0` sans fusionner.
- `landing.specMergeMethod` accepte `merge` (par défaut), `squash` et `rebase`, afin qu'une spec atterrisse sur un trunk qui n'autorise que les merges squash. `emet doctor` avertit lorsque les réglages du dépôt ou le ruleset du trunk interdisent la méthode configurée. Voir ADR-0037.
- `bun run check:codex` échoue sur un fichier d'un répertoire `codex/` généré qui n'a pas de source.

### Modifié

- Avec `specs.enabled` désactivé, `emet spec-merge` affiche `specs.enabled is false; nothing merged` et se termine avec le code `0`. Il lit les deltas dans le répertoire d'exécution partagé sous le git common dir, avec repli sur le `.emet/runs/<id>/spec-deltas/` propre à chaque checkout.
- Les prompts de la Phase 8 n'exécutent plus `emet spec-merge` après l'atterrissage d'une wave ou d'une spec ; `phases-8-review.md` charge à la place `living-specs.md` lors de la dernière wave.
- `emet spec-branch land` attend les checks de la pull request avec le même poller que `emet ci`, en continuant d'interroger une pull request qui n'a pas encore de checks, et fusionne avec `landing.specMergeMethod`.

### Corrigé

- `emet spec-branch land` ne fusionne plus avant que GitHub ait enregistré le moindre check.
- `emet setup` liste les plugins Claude une seule fois au lieu de jusqu'à trois, et ses sondes silencieuses expirent au lieu de se bloquer.
- `emet doctor` liste les plugins installés une seule fois par exécution.
- `bun run lint` et `bun run fix` génèrent d'abord les types Astro du site, ce qui leur permet de réussir sur un checkout neuf.

## 0.15.0

2026-11-21

### Modifié

- `landing.unit` vaut `spec` par défaut : les waves d'une spec sont intégrées dans la branche `spec/<id>` avec `emet spec-branch`, et la spec atterrit une seule fois, en une pull request (ou un merge local avec `landing.mode: merge`), au lieu d'une pull request par wave. Utilisez `"landing": { "unit": "wave" }` pour garder l'ancien comportement. Le mode `spec` exige `worktree.baseRef: "head"` dans les réglages de Claude Code. Voir ADR-0037.
- Le journal gagne les types `spec.integrate`, `spec.land` et `spec.abandon`, et `emet status` gagne `specBranch`.

## 0.14.5

2026-11-21

### Ajouté

- `emet handoff --check` analyse une section `skills:` dans la note de passation d'un worker (`none`, ou `loaded: a, b; missing: c`). Elle est obligatoire lorsque `state` vaut `done`. `--expect-skills a,b` fait échouer la vérification pour chaque skill indiquée qui ne figure dans aucune des deux listes et affiche celles qui manquent.
- L'enregistrement de dispatch porte un tableau optionnel `skills`, et `emet verify` le transmet à `emet handoff --check` sous la forme `--expect-skills`. Un enregistrement sans `skills` est toujours analysé.
- L'ADR-0036 permet à un ticket de modifier la formulation d'un prompt installé lorsqu'il nomme les paragraphes, et la même pull request relève les plafonds d'octets.

### Modifié

- Le prompt de la phase 8 est scindé en `phases-8-review.md` et `phases-8-landing.md`. `install.sh` retire l'ancien `phases-8-closeout.md` : une copie modifiée ou antérieure au manifeste est déplacée vers `phases-8-closeout.md.retired`, une copie non modifiée est supprimée.
- Le prompt du worker lui demande d'écrire la ligne `skills:` avant sa passation finale.
- La page d'architecture, la référence de la CLI et leurs neuf traductions décrivent les deux fichiers de la phase 8 et `--expect-skills`.

## 0.14.4

2026-11-20

### Ajouté

- `emet doctor` sur l'hôte Codex avertit lorsque le plugin emet est activé dans `$CODEX_HOME/config.toml` mais que Codex n'a approuvé aucun de ses hooks, de sorte que le garde emet ne s'exécute pas. L'avertissement ne modifie pas le code de sortie.

### Corrigé

- Lorsque l'asset de la release pour la version du plugin ne peut pas encore être téléchargé, `bin/emet` exécute le binaire en cache le plus récent pour toutes les commandes, et pas seulement pour `emet guard`, et affiche un avis indiquant que la release est peut-être encore en cours de publication. Avec `EMET_PREFETCH=1`, il affiche l'avis et se termine avec `0` sans l'exécuter. Une somme de contrôle incorrecte ou un `SHA256SUMS` manquant ne déclenchent toujours jamais de repli, et le répertoire temporaire du téléchargement est supprimé avant le repli.

## 0.14.3

2026-11-20

### Ajouté

- `emet fleet launch --dry-run` exécute les vérifications de disponibilité et affiche `would launch <name>` pour chaque dépôt sans démarrer de session.

### Corrigé

- `emet migrate` supprime les fichiers d'exécution hérités de `.forge/` non suivis qui diffèrent de leur copie dans `.emet/` et conserve celle de `.emet/`, ce qui lui permet d'aboutir dans les dépôts contenant des journaux résiduels. Chaque conflit qu'il ne peut pas résoudre est listé avec l'étape manuelle, et une erreur git dans un dépôt est traitée comme un conflit au lieu de supprimer le fichier.
- Le preload des tests supprime son répertoire `emet-test-state-*` à la fin de l'exécution, de sorte que `bun test` ne laisse plus un répertoire temporaire par exécution.

## 0.14.2

2026-11-20

### Corrigé

- `emet promote` attend les checks de la pull request de synchronisation et ne la fusionne que s'ils réussissent, au lieu de la fusionner aussitôt. Une pull request de synchronisation qui échoue, expire ou est rejetée reste ouverte sans faire échouer le promote, et le résultat et l'événement du journal portent `syncMerged` et `syncReason`.

## 0.14.1

2026-11-20

### Ajouté

- `emet tracker close` ferme l'issue de spécification parente d'un ticket GitHub lorsque son dernier sous-issue est fermé, et signale chaque spécification dans un nouveau champ `specs`. Une lecture ou une fermeture de spécification en échec se termine avec le code `1`.
- La spécification se ferme même lorsque le résumé des sous-issues de GitHub n'est pas encore à jour : les sous-issues de la spécification sont comptés un par un, y compris les tickets fermés dans le même appel.

## 0.14.0

2026-11-20

### Ajouté

- `emet init` définit `schema.ownedPaths` lorsqu'il trouve un schéma Prisma (`prisma/schema.prisma` ou `prisma/schema/`) ou un dossier de migrations Drizzle, et supprime le marqueur `TODO(emet):` de propriété du schéma.
- L'élément de configuration `agent-browser` écrit `~/.agent-browser/config.json` (`contentBoundaries` et `maxOutput`) lorsqu'il n'existe pas, et exécute `agent-browser doctor` après l'installation. Voir ADR-0035.
- `emet setup` affiche un profil AppArmor pour le Chrome téléchargé par `agent-browser`, ainsi que les commandes `sudo` pour le charger, lorsque l'hôte restreint les espaces de noms utilisateur non privilégiés. Il n'exécute jamais `sudo`.

### Modifié

- L'élément de configuration `firecrawl-local` enregistre le serveur MCP avec `FIRECRAWL_CLOUD=search` au lieu de `off`, remplace un enregistrement antérieur et transmet le Chrome le plus récent d'`agent-browser` comme `FIRECRAWL_CHROME_PATH`. Voir ADR-0035.

### Corrigé

- `emet setup` enregistre le serveur MCP `firecrawl-local` avec le nom du serveur en premier, afin que l'enregistrement soit analysé correctement.
- `emet --help` liste toutes les commandes du registre (setup, fleet, insights, chain, promote, whats-new, deploy-check, ci, run).
- Les tests n'écrivent plus dans le vrai journal sous `~/.local/state/emet`.

## 0.13.0

2026-11-20

### Ajouté

- `emet setup` propose les éléments `context7` et `firecrawl-local` (tous deux désactivés par défaut). `context7` installe la CLI `ctx7` et son skill `find-docs`. `firecrawl-local` compile Firecrawl Local avec `cargo` et l'enregistre comme serveur MCP uniquement local (`FIRECRAWL_CLOUD=off`, `--public-only`). Voir l'ADR-0034.
- `emet review-run --browser-verify true|false` transmet l'axe navigateur au relecteur Codex.
- `validate.coupledSurfaces` dans `emet.config.json` et l'erreur `coupled-surface-split` de `emet validate` gardent une page et ses traductions dans une même vague. Voir l'ADR-0033.

## 0.12.0

2026-11-20

### Ajouté

- `verify.browser` dans `emet.config.json` (`startCommand`, `url` et, en option, `paths`) permet à un dépôt de vérifier dans le navigateur les changements d'interface avec `agent-browser`. Le schéma de configuration et son parseur valident chaque champ.
- `emet assess` affiche `browserVerify: { run, reason }`. L'axe navigateur ne s'exécute que si la vague a un reviewer, que `verify.browser` est configuré, que `agent-browser` est dans le PATH et qu'un chemin modifié correspond à `paths`.
- `emet setup` propose un élément `agent-browser` (désactivé par défaut) qui installe la dernière version et son navigateur.
- `emet doctor` signale un constat facultatif sur agent-browser pour un dépôt qui configure `verify.browser`. Un binaire absent ou un `agent-browser doctor` en échec est une note ou un avertissement et ne change jamais le code de sortie.
- Le prompt du reviewer gagne un axe navigateur, rempli uniquement quand `browserVerify.run` est vrai, et le prompt du worker gagne une ligne facultative pour les vérifications dans le navigateur. Voir ADR-0032.

## 0.11.1

2026-11-19

### Corrigé

- Sous Windows natif (Git Bash) et sur tout système d'exploitation ou toute architecture non pris en charge, `bin/emet` se termine avec le code 0 au lieu d'échouer, de sorte que le guard PreToolUse ne bloque plus chaque appel d'outil. Seul le prefetch de démarrage de session affiche un avis.
- `install.sh` refuse de s'exécuter sur `MINGW*`, `MSYS*` et `CYGWIN*` avant d'écrire quoi que ce soit.
- Les hooks Codex portent une surcharge `commandWindows`, de sorte que Codex sous Windows (PowerShell) n'échoue plus à chaque événement.

## 0.11.0

2026-11-19

### Ajouté

- `emet whats-new` affiche un avis d'une ligne avec un lien vers les notes de version la première fois qu'emet s'exécute après une mise à jour, puis enregistre la version en cours. Avec `--hook`, il émet la ligne sous forme d'objet JSON `systemMessage` pour les hooks de session.

## 0.10.0

2026-11-19

### Ajouté

- `handoff.afterSpec` accepte une liste ordonnée de règles `{ paths?, mode }`, de sorte qu'un dépôt avec une CLI et un site web puisse publier la CLI et promouvoir le site web. Le mode est choisi d'après les chemins que la promotion de `develop` apporterait dans `main`.
- `deploy.check.paths` limite la vérification de déploiement aux promotions qui ont touché les globs listés.
- `emet promote` affiche et journalise `rule` et `reason`, et affiche `deployCheck: { run, reason }`.

### Modifié

- La vérification de déploiement ne dépend plus de `afterSpec` : elle s'exécute après une dernière wave propre sur le trunk `main`, et après une promotion fusionnée sur `develop`. Le coordinateur exécute `emet promote` après chaque spec, y compris avec `afterSpec` à `none`.

## 0.9.1

2026-11-19

### Corrigé

- `emet setup` accepte `--data-dir`, de sorte que le hook SessionStart du plugin n'échoue plus avec `unknown flag --data-dir`.

## 0.9.0

2026-11-19

### Ajouté

- `emet gate` applique une politique de correction puis de poursuite : une wave retenue exécute des tours de correction jusqu'à ce que les constats soient résolus ou que `budgets.fixRounds` (2 par défaut) soit épuisé, puis s'arrête. `gate.onHold` choisit `fix-and-continue` (par défaut) ou `stop`. `emet review --recheck` ne résout un constat que par le verdict d'un relecteur.
- `emet ci --wait` interroge les vérifications d'une pull request, relance les jobs instables et signale `pass`, `fail`, `env-fault` ou `timeout`. `emet tracker close` ferme les tickets GitHub de façon idempotente, et `emet chain` exécute gate, readiness, launch et verify en une seule étape.
- Un journal d'événements consigne les décisions du gate, les interventions, les lancements, les fermetures de tickets et les nettoyages, avec une rotation selon la taille. `emet insights` le résume (`--mark-baseline` réinitialise la base de référence), `emet run current` affiche le spec et la wave actifs, et `emet status --brief` imprime l'état sur une ligne.
- Les clés de configuration `language.conversation` et `language.artifacts`.
- Les clés de configuration `handoff.afterSpec` (`release`, `promote` ou `none`, détectée par `emet init` ou définie avec `emet init --after-spec`), `deploy.check` et `interview.research`.
- `emet promote` ouvre la pull request de `develop` vers `main` lorsque la dernière wave est inactive, la fusionne si les vérifications passent et resynchronise `main` lorsque `develop` est en retard. `--no-promote` retient un spec sur toutes ses sessions.
- `emet deploy-check` relance une commande de vérification de déploiement et tue les commandes bloquées.
- `emet fleet list | set | launch` exécute des specs sur plusieurs dépôts.
- `emet setup` et `/emet:setup` installent des compléments optionnels depuis un catalogue après avoir sauvegardé les paramètres de Claude. Un hook SessionStart affiche un avis une seule fois, et `install.sh` exécute setup dans un TTY.
- `emet doctor` et `emet init` recommandent Engram sans jamais le compter comme une dépendance non satisfaite.

### Modifié

- Les prompts et la documentation installés décrivent la politique du gate, `emet ci`, `emet chain`, le journal, l'étape après le spec, fleet et setup. La phase 8 ajoute un résumé de wave et une notification push, et `emet insights` remplace le renvoi vers `/retro`.

### Corrigé

- `--no-promote` est conservé sous forme de marqueur dans le répertoire git commun, de sorte qu'une session chaînée `/emet:run --dispatch` pour la dernière wave ne promeut plus `develop` vers `main`.

## 0.8.6

2026-11-17

### Corrigé

- Le workflow de release installe Chromium avant de relancer les vérifications sur le tag, comme le fait le job de tests de la CI, si bien que la vérification ne s'arrête plus au plancher de couverture de `tools/`. v0.8.5 a été étiquetée mais jamais publiée à cause de cela ; ses changements sont livrés dans cette version.

## 0.8.5

2026-11-17

### Modifié

- Le gate de couverture impose un plancher par fichier de 97 % des lignes et 98 % des fonctions pour `emet/`, `apps/site` et `tools/`, avec des exceptions motivées dans `tools/coverage-exceptions.ts`. Le manifeste de couverture parcourt `emet/src` récursivement, `tools/` est contrôlé, et les totaux de `tools/coverage-floors.json` montent aux valeurs mesurées.
- Le guard PreToolUse échoue en mode fermé : quand `bin/emet` ne peut pas résoudre le binaire emet, le hook sort avec 2 et bloque l'appel d'outil, avec un message qui explique comment se rétablir. Les hooks Stop et SubagentStop sortent toujours avec 1.
- Les manifestes du plugin portent l'e-mail de l'auteur, la licence, la page d'accueil, le dépôt et l'URL des bugs, et les descriptions des skills Codex indiquent quand utiliser chacune.

### Corrigé

- `emet doctor` sort avec le code 3 quand une erreur inattendue s'échappe, au lieu de 0. Un code de sortie non nul défini plus tôt est conservé.
- `emet cleanup --all --force` récupère le worktree et les branches du worker d'une exécution morte, y compris les worktrees sous `.claude/worktrees/`. Un propriétaire vivant ou inactif, et un verrou qui ne nomme aucune exécution, restent protégés.
- Le guard d'édition reconnaît une surface écrite littéralement, comme `src/app/[locale]/page.tsx`. `[` et `]` dans une surface ne forment plus une classe de caractères.
- `emet preflight --post-dispatch` échoue quand un ticket qui détient encore une réservation ou un slot a perdu son worktree de worker, et indique au coordinateur de le re-dispatcher au lieu de le reprendre.
- Le binaire compilé `emet` ne charge plus de fichier `.env` du répertoire courant.
- Le site web retire les attributs de style en ligne de la page d'accueil, donne aux libellés de l'accueil un contraste AA en mode clair et nomme le bouton de recherche avec son texte visible dès le premier rendu. Les images de la documentation sont servies depuis l'origine propre du site sous `repo-assets` au lieu de `raw.githubusercontent.com`, et `astro dev` les sert aussi.

## 0.8.4

2026-11-15

### Modifié

- L'en-tête de la page d'accueil se compose désormais de deux groupes aux extrémités : le logo et Docs à gauche ; recherche, étoiles GitHub, thème et langue à droite. Ses contrôles et la pastille de version sont en verre translucide sur le ciel, et le lien en double vers Nouveautés a disparu de l'en-tête et du menu de la page d'accueil.

## 0.8.3

2026-11-15

### Corrigé

- `/docs/` et le `/docs/` de chaque langue répondent désormais par une redirection 301 vers la page de prise en main, au lieu d’une page meta-refresh qui s’affichait brièvement sans style.

## 0.8.2

2026-11-11

### Corrigé

- `emet cleanup` conserve une branche d'amorçage `worktree-<name>` tant que le worktree `<name>` existe encore, pour qu'une session qui y travaille sur une autre branche garde la branche que son hôte attend.

## 0.8.1

2026-11-11

### Ajouté

- `emet cleanup` supprime les branches d'amorçage `worktree-<name>` que l'Agent host laisse derrière lui, quand rien ne les a extraites et que trunk contient déjà leur tête.

### Corrigé

- Le guard refuse une suppression forcée de branche dans toute écriture qui associe une option de suppression à une option de force, et pas seulement avec l'option en majuscule.

## 0.8.0

2026-11-11

### Ajouté

- `emet cleanup` supprime, dans tous les modes, chaque branche locale dont la pull request a été fusionnée au commit de tête de la branche, avec le worktree d'agent propre et non verrouillé qui la contient. Les branches d'intégration, de release et de correctif n'attendent plus une suppression manuelle.
- `bun run translations:status` liste les traductions du Website en retard sur leur source.

### Modifié

- Le refus par le guard d'une suppression forcée de branche renvoie vers `emet cleanup`.
- Le runbook de release couvre les traductions de `whats-new`.

## 0.7.0

2026-11-11

### Ajouté

- Le Website sert le schéma de configuration à l'adresse `https://emet.andryore.dev/schema/emet.config.schema.json`.
- `docs/development.md` et `docs/security.md`.
- Un seuil de couverture par workspace, que `bun run test` fait respecter.

### Modifié

- `emet init` écrit l'URL publique de `$schema` dans `emet.config.json` au lieu d'un chemin local.
- Les tags de version sont signés, et le workflow Release échoue lorsque la section du CHANGELOG correspondant au tag est absente ou vide.
- Le dépôt suit le standard andryorelabs v1 : rulesets sous forme de code, fichiers communautaires, structure du README et noms de scripts standard (`format:write`, `lint:commits`).

## 0.6.1

2026-11-10

### Corrigé

- Deux processus qui reprennent en même temps le même verrou périmé ne peuvent plus entrer tous deux dans la section critique ; les claims, la Mailbox, le tracker et `acquireLock` partagent une même reprise protégée.
- Les appels concurrents à `emet tracker create-ticket` n'échouent plus de façon intermittente.

## 0.6.0

2026-11-10

### Ajouté

- Une Mailbox pour les workers Codex : `emet ask` enregistre une question (et interroge la réponse avec `--wait`), `emet inbox` liste les questions ouvertes et `emet reply` en répond une, de sorte qu'un worker ne remonte plus par une note de passation.
- `emet dispatch --wait` affiche `question <ticket> <id>` tant qu'un worker actif a une question ouverte, et ne classe jamais ce worker comme bloqué.
- `emet claims --reserve` enregistre les surfaces d'édition du ticket et refuse une réservation qui chevauche les surfaces d'une autre exécution.

### Corrigé

- `emet dispatch --wait` lit les résultats dans le répertoire d'exécution du git-common-dir, là où `emet results --write` les écrit.

## 0.5.2

2026-11-10

### Modifié

- L'avis de non-affiliation nomme OpenAI en plus d'Anthropic.
- Les onglets d'installation de la page d'accueil indiquent Claude Code, et la commande d'exécution a un onglet Codex avec `$emet:run`.
- Les guides indiquent quelles étapes relèvent de chaque Agent host : Claude Code ou Codex.

### Corrigé

- `emet doctor`, `emet init`, `emet dependencies` et `emet preflight` ne donnent plus de conseils propres à Claude Code sur l'hôte Codex.
- `emet init --force` conserve `agentHost` et la section `codex` de la configuration existante.

## 0.5.1

2026-11-10

### Modifié

- Le README, la page d'accueil, la bannière, les guides et les images de partage nomment Codex aux côtés de Claude Code.

## 0.5.0

2026-11-10

### Ajouté

- La page d'accueil du Website : héros peint, fonctionnement, fonctionnalités,
  à propos, panneau de clôture, en-tête et pied de page, avec les textes
  anglais dans `apps/site/src/i18n/ui/en.ts`.
- La documentation du Website sous `/docs/` : pages Starlight générées à partir
  d'une liste autorisée de documents du dépôt et de ce changelog, avec la
  recherche Pagefind, la réécriture des liens vers les pages du site ou GitHub,
  et un avis de repli en anglais pour les traductions manquantes ou obsolètes.
- `docs/how-to/update-emet.md` : comment mettre à jour les plugins et activer la
  mise à jour automatique du marketplace.
- Codex comme Agent host : `agentHost` dans `emet.config.json`, `emet dispatch`
  et `emet review-run` lancent chaque worker et reviewer comme un processus
  `codex exec`, les skills `$emet:run`, `$emet:init` et `$emet:doctor` et le
  manifeste du plugin Codex, ainsi que le test de bout en bout optionnel
  (`EMET_CODEX_E2E=1`).
- `docs/guide/codex.md`, le guide Codex, publié sur le Website.

### Modifié

- La valeur par défaut de `codex.sandbox` est `danger-full-access`
  (`workspace-write` reste accepté), transmise par `emet dispatch`,
  `emet review-run` et un `emet launch` Codex ; `emet guard` sur Codex refuse
  toutes les formes de push.
- La surcouche Codex de chaque exécution écrit son propre `config.toml`
  minimal au lieu de lier le vôtre, et ses règles autorisent les formes `-C` et
  les sous-commandes de coordination tandis que le push reste interdit.
- Les workers Codex sont identifiés par leur `threadId` et le chemin de leur
  JSONL, et non par leur pid.
- Le guide Codex rapporte les résultats réels avec Codex : chaque ligne
  `failed` précédente est `verified`, la liste `unverified` se réduit à la
  supervision sans surveillance, et le rapport de sonde énumère les suites
  restantes.

### Corrigé

- `emet cleanup` récupère les worktrees atterris sans propriétaire.
- L'Agent host Codex se résout par défaut, de sorte que `emet preflight`,
  `doctor`, `cleanup`, `status` et `usage` acceptent `agentHost: "codex"`.
- La résolution des modèles Codex lit `models_cache.json` depuis le home de
  l'exécution ou votre vrai home Codex.

## 0.4.0

2026-11-06

### Ajouté

- Option `position` de `emet-mascot` (`pane`, `band` ou `status`) ; `pane` est
  la valeur par défaut et se rabat sur la bande lorsqu'elle ne peut pas
  s'ancrer.
- Une section « Mascot (optional) » dans le README.

### Modifié

- Les images de `emet-mascot` sont alignées sur les six couleurs de la mascotte
  au lieu d'être floutées par un redimensionnement, de sorte que le pixel art
  est net dans le terminal.
- `emet-mascot` 0.2.0 : le `size` par défaut est désormais `small`.
- `docs/how-to/orca-pet.md` devient `docs/how-to/mascot.md`, couvrant le mod et
  le pet d'Orca.

## 0.3.0

2026-11-05

### Ajouté

- Les commandes de plugin `/emet:init` et `/emet:doctor` exécutent `emet init`
  et `emet doctor .` dans Claude Code et résument le résultat.
- `emet doctor` avertit des hooks `forge guard` et `emet guard` dans
  `~/.claude/settings.json` dont le binaire n'existe plus, et affiche une
  commande de sauvegarde suivie de `jq` pour les supprimer. Il ne modifie
  jamais le fichier.
- Fondations de la mascotte : un fichier de phase, le bundle du pet, une
  machine à états du mod, les autres rédacteurs de phase et des images
  matricielles.
- `emet-mascot`, un plugin facultatif qui affiche une mascotte en pixels
  au-dessus du prompt et reflète la session et la phase de l'exécution d'`emet`.
  Il figure dans le marketplace, avec un guide pratique pour le pet d'Orca et
  l'ADR-0016.

### Corrigé

- Le plugin n'expose plus une commande `/emet:emet` en double et cassée ;
  `commands/` est figé sur `run.md`, `init.md` et `doctor.md`.
- La vague suivante se lance désormais avec `/emet:run`, la commande
  qu'enregistre le plugin.

### Modifié

- Le dépôt a déménagé dans l'organisation GitHub `andryorelabs`. Les
  téléchargements de versions, les badges du README et l'URL de clonage
  pointent désormais vers `andryorelabs/emet` ; les anciennes URL
  `AndryOre/emet` continuent de rediriger.
- Les installations autonomes renomment `/emet` en `/emet:run`, comme le
  plugin. `install.sh` installe désormais `commands/run.md`, `init.md` et
  `doctor.md` dans `~/.claude/commands/emet/`, de sorte que `/emet:run`,
  `/emet:init` et `/emet:doctor` sont disponibles sans le plugin. L'ancien
  `~/.claude/commands/emet.md` est supprimé s'il n'a pas été modifié ; une copie
  modifiée est conservée et listée dans le résumé de l'installation.

## 0.2.0

2026-11-05

### Modifié

- Le projet passe de claude-forge à emet : la CLI est `emet`, la commande est
  `/emet`, les agents sont `emet-worker` et `emet-reviewer`, et le README porte
  la nouvelle marque. Les installations et dépôts existants continuent de
  fonctionner : les anciens noms (`forge.config.json`, `.forge/`,
  `docs/agents/forge.md`, `FORGE_*`) sont toujours lus avec un avis, et
  `emet migrate` fait passer un dépôt aux nouveaux noms.

### Ajouté

- `install.sh` fonctionne sans Bun : il installe le shim du binaire autonome
  sous `~/.local/bin/emet`, réécrit les espaces réservés du plugin dans les
  prompts qu'il copie, installe `commands/run.md` sous
  `~/.claude/commands/emet.md` et accepte `shasum -a 256` à la place de
  `sha256sum`.
- Le README indique les vrais prérequis, les deux méthodes d'installation et
  l'ordre `/setup-matt-pocock-skills` puis `emet init`.
- Guide pour les agents (`AGENTS.md`), glossaire du domaine (`GLOSSARY.md`) et
  registres de décisions d'architecture dans `docs/adr/`.
- Tracker markdown local selon la convention `.scratch/`, avec une CLI
  `emet tracker` (`create-spec`, `create-ticket`, `frontier`, `set-state`,
  `comment`, `close`) et `emet validate`, `preflight` et `doctor` conscients du
  tracker local.
- `landing.mode` (`pr` ou `merge`) et `emet land`, qui fait atterrir une vague
  en un seul merge local sans PR ; `emet cleanup` et `emet status` comparent
  avec la branche principale locale en mode merge.
- Binaires `emet` autonomes, `emet --version`, prise en charge de macOS dans la
  CI ainsi que dans l'arbre de processus et le frein mémoire, et manifestes de
  plugin avec un shim `bin/emet`.
- Contrat de skills avec `emet skill-path`, et un `emet doctor` plus complet
  couvrant les skills, le glossaire, les dépréciations et les doubles
  installations.
- `emet init` et `emet map` indépendants du langage pour les dépôts JS, Go,
  Rust et Python.
- ADR-0007 à ADR-0011.
- Index de la documentation, carte du code de l'architecture, dépannage par
  symptôme, un modèle de PR plus riche et `emet/AGENTS.md` avec les règles
  propres au runtime.

### Modifié

- `gh` n'est requis que lorsque `tracker.kind` vaut `github` ou que
  `landing.mode` vaut `pr`.
- `emet init` ne sélectionne plus le tracker local par défaut.
- L'ADR-0004 est amendé : une vague atterrit en une PR ou en un merge local.

## 0.1.0

2026-11-03

### Ajouté

- La commande globale `/forge` : entretien, spec, tickets, une seule
  approbation, puis des agents de worktree en parallèle qui implémentent,
  testent et fusionnent une fonctionnalité sans surveillance.
- La CLI `forge` avec les sous-commandes `init`, `doctor`, `preflight`,
  `selftest`, claims, slots, gates, vérifications de handoff, results et
  metrics.
- Les agents `forge-worker` et `forge-reviewer`.
- Des trackers pour Linear et GitHub Issues.
- Configuration par dépôt via `forge.config.json`.
- `install.sh`, qui installe la CLI, la commande et les agents.
