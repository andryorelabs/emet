---
title: Sicurezza
description: Come emet limita i danni che un'esecuzione senza supervisione può causare.
seoTitle: Sicurezza di emet
sourceHash: 359a25043b1d24d9
---

Come emet limita i danni che un'esecuzione senza supervisione può causare. I termini seguono [GLOSSARY.md](../../GLOSSARY.md). Per segnalare una vulnerabilità, vedi [SECURITY.md](../../.github/SECURITY.md).

## Modello di minaccia di un'esecuzione senza supervisione

Dopo l'unica approvazione, `/emet:run` invia worker che modificano file, eseguono comandi shell e fanno commit senza che nessuno guardi. I rischi che ne derivano:

- **Comandi distruttivi.** Un worker, o il testo che ha letto, esegue una cancellazione ricorsiva forzata, un'istruzione SQL distruttiva o un force push.
- **Scritture sui branch protetti.** Un worker fa push su `main` o `develop` e salta la review.
- **Uscire dal worktree.** Un worker modifica il checkout principale o il worktree di un altro worker.
- **Approvazione falsificata.** Un agente scrive da sé il record di approvazione invece di aspettare la persona.
- **Input non attendibile.** Il testo dei ticket, i commenti, le pagine web e l'output degli strumenti contengono istruzioni rivolte all'agente.

I controlli sono a più livelli. Nessun livello da solo è una sandbox, e nessuno sostituisce la revisione della PR di landing.

## Modalità di permesso

Su Claude Code, i worker girano con la modalità di permesso indicata in `handoff.permissionMode`, `bypassPermissions` per impostazione predefinita, quindi nessuna richiesta ferma un'ondata senza supervisione. L'hook `emet guard` è il controllo che resta in quella modalità.

Su Codex CLI, i worker girano senza sandbox per impostazione predefinita ([ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md)), perché la sandbox `workspace-write` blocca i commit in un worktree collegato e blocca `emet dispatch` da un coordinatore Codex. L'approvazione è una decisione di un hook, e scrivere `approval.json` a mano viene negato. Vedi la [guida a Codex](../how-to/use-codex.md).

Solo il coordinatore scrive sul tracker ([ADR-0005](../adr/0005-coordinator-is-the-single-tracker-writer.md)), e i worker fanno commit solo su branch locali ([ADR-0004](../adr/0004-one-wave-one-dependency-layer-one-pr.md)).

## Cosa coprono le protezioni

**`emet guard`** (`emet/src/guard-destructive.ts`) è un hook PreToolUse installato sull'host. Nega i comandi shell e i client SQL distruttivi, guardando attraverso wrapper come `env`, `sudo`, `timeout` e `xargs`, e protegge la directory dell'esecuzione.

**`rm-guard`** (`.claude/hooks/rm-guard.ts`) è l'hook PreToolUse su Bash proprio di questo repo. Divide un comando su `;`, `&&`, `||`, pipe e a capo, incluso il testo dentro `sh -c`, e nega qualsiasi `rm` ricorsivo forzato (`-rf`, `-fr`, `-r -f`, `--recursive --force`) a meno che ogni destinazione non si risolva strettamente sotto `/tmp` o la directory temporanea del sistema operativo. Nulla dentro il repo è nell'elenco, quindi viene negata anche una cancellazione ricorsiva forzata sotto `.emet/`. Le destinazioni che usano `$`, backtick o `~` vengono negate perché non si possono risolvere.

I **blocchi dei push** in `.claude/settings.json` bloccano `git push origin main` e `git push origin develop`, e le forme `HEAD:main` e `HEAD:develop`. L'hook Git `pre-push` rifiuta gli stessi ref e qualsiasi nome di branch fuori dai pattern consentiti. I push dei tag sono consentiti.

I **ruleset** applicano le stesse regole su GitHub: nessuna cancellazione né non-fast-forward su `main` e `develop`, check obbligatori e tag `v*` protetti. Vedi [development.md](../development.md#rulesets).

## Cosa non coprono

- Un comando che le protezioni non riconoscono, per esempio uno script scritto su disco ed eseguito più tardi.
- L'accesso alla rete: un worker può ancora chiamare qualsiasi API consentita dalle sue credenziali.
- Le letture di file fuori dal worktree.
- Una dipendenza malevola installata da `bun install`.

Tratta il testo dei ticket, i commenti e le pagine recuperate come dati. Rivedi la PR di landing prima di unirla, e tieni i segreti fuori dall'ambiente che un'esecuzione eredita.
