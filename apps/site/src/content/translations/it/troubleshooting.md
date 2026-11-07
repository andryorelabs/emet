---
title: Risoluzione dei problemi
description: Errori di emet doctor ed emet preflight, raggruppati per ciò che si vede, ciascuno con causa e soluzione.
seoTitle: Risoluzione dei problemi di emet doctor e preflight
sourceHash: dd82e980da9568d5
---

Errori di `emet doctor` ed `emet preflight`, raggruppati per ciò che si vede, ciascuno con causa e soluzione. I termini seguono [GLOSSARY.md](../GLOSSARY.md). Per come i controlli si combinano, vedi l'[architettura](architecture.md).

<img src="brand/mascot/mascot-error.svg" alt="" width="96">

Un repo che ha ancora solo `forge.config.json`, `.forge/` o variabili `FORGE_*` continua a funzionare: `emet` legge i nomi legacy, stampa una riga su stderr che nomina ogni file legacy, e `emet migrate` li rinomina.

- [no emet.config.json](#no-emetconfigjson)
- [emet.config.json is malformed](#emetconfigjson-is-malformed)
- [docs/agents still has TODO(emet) markers](#docsagents-still-has-todoemet-markers)
- [Un controllo delle dipendenze fallisce](#un-controllo-delle-dipendenze-fallisce)
- [no longer documents a flag in --help](#no-longer-documents-a-flag-in---help)
- [Un file installato manca o è stato modificato dopo l'installazione](#un-file-installato-manca-o-è-stato-modificato-dopo-linstallazione)
- [Stop hook error: forge: No such file or directory](#stop-hook-error-forge-no-such-file-or-directory)
- [Nessuno slot worker libero](#nessuno-slot-worker-libero)
- [Worktree bloccati attesi, ne sono stati trovati meno](#worktree-bloccati-attesi-ne-sono-stati-trovati-meno)
- [Un ticket è rivendicato da più worktree o branch](#un-ticket-è-rivendicato-da-più-worktree-o-branch)
- [requiredCommands not on PATH](#requiredcommands-not-on-path)
- [Vedi anche](#vedi-anche)

## no emet.config.json

**Sintomo:** `emet doctor` stampa `no emet.config.json — run "emet init" here`.

**Causa:** Il repo non ha ancora una configurazione `/emet`.

**Soluzione:** Esegui `emet init` nella radice del repo, poi controlla la configurazione generata e compila i file in `docs/agents/`.

## emet.config.json is malformed

**Sintomo:** `emet.config.json is malformed: <reason>`; `emet preflight` esce con 2.

**Causa:** La configurazione è JSON rigoroso e viene validata rispetto a `emet/schema/emet.config.schema.json`. Commenti e virgole finali vengono respinti.

**Soluzione:** Correggi il campo indicato nel motivo, oppure rigenera con `emet init --force`.

## docs/agents still has TODO(emet) markers

**Sintomo:** `docs/agents/ still has N TODO(emet): marker(s)`; `emet doctor` segnala anche un `docs/agents/<file>` mancante.

**Causa:** `emet init` lascia un marcatore ovunque non riesca a rilevare un valore.

**Soluzione:** Compila ogni riga marcata, oppure risolvile ed esegui `emet init --force`. Preflight rifiuta il dispatch finché ne resta uno.

## Un controllo delle dipendenze fallisce

**Sintomo:** righe `dependency: ...` in `emet doctor`, oppure un errore bloccante sulle dipendenze in `emet preflight` (per esempio `gh` mancante o non autenticato, o il plugin mattpocock-skills assente o in una versione non testata).

**Causa:** `/emet` richiede `git`, `gh` e il plugin mattpocock-skills; vedi `emet/src/dependencies.ts` e `emet/src/skills.ts`.

**Soluzione:** Installa o autentica lo strumento, oppure esegui `/setup-matt-pocock-skills`. Se un controllo è sbagliato per il tuo ambiente, `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` lo declassa a un avviso.

## no longer documents a flag in --help

**Sintomo:** `<tool> no longer documents <flags> in --help — emet relies on it`, oppure `could not be run — cannot verify <flags>`.

**Causa:** `emet doctor` verifica i flag da cui `emet` dipende, non solo che il binario esista. La versione installata ne ha eliminato o rinominato uno.

**Soluzione:** Installa una versione dello strumento che documenta ancora il flag.

## Un file installato manca o è stato modificato dopo l'installazione

**Sintomo:** `~/<path> is missing — re-run install.sh` oppure `~/<path> was edited since install`.

**Causa:** La copia installata non corrisponde più al manifesto di installazione.

**Soluzione:** Riesegui `install.sh`. Se accanto a un file modificato esiste un file `.new` in sospeso, uniscilo o eliminalo.

## Stop hook error: forge: No such file or directory

**Sintomo:** Claude Code stampa `Stop hook error: … forge: No such file or directory` (o lo stesso per `emet`) alla fine di ogni turno.

**Causa:** `~/.claude/settings.json` contiene ancora un hook `forge guard` o `emet guard` il cui binario è stato spostato o rimosso.

**Soluzione:** Esegui `emet doctor .`. Elenca ogni hook guard morto con il suo evento e stampa un solo comando `cp … && jq …` che fa il backup di `settings.json` e rimuove solo quegli hook. Doctor non modifica mai il file da solo.

## Nessuno slot worker libero

**Sintomo:** `No free worker slots at all: 0 free out of N`, oppure `only K/N worker slot(s) free`.

**Causa:** Ogni slot in `~/.local/state/emet/slots` è occupato da un'esecuzione attiva o inattiva, quindi l'ondata non può essere inviata per intero.

**Soluzione:** Attendi che un'esecuzione liberi uno slot, oppure esegui `emet cleanup --run <runId>` per un'esecuzione che sai essere terminata. `emet status` mostra chi occupa cosa.

## Worktree bloccati attesi, ne sono stati trovati meno

<img src="brand/mascot/mascot-sleep.svg" alt="" width="64">

**Sintomo:** `Expected N locked worktree(s) for run <id>, found M`.

**Causa:** I worker non hanno rivendicato il proprio worktree con il motivo del lock, oppure `isolation: "worktree"` li ha collocati altrove. Vedi [`incidents.md`](../emet/reference/incidents.md).

**Soluzione:** Controlla `git worktree list --porcelain` per le voci bloccate, ed `emet lock-reason` per il formato atteso del motivo.

## Un ticket è rivendicato da più worktree o branch

**Sintomo:** `<ticket> is claimed by N worktrees`, `has N branches`, oppure `is checked out on branch ..., but its own lock names ticket ...`.

**Causa:** Un nuovo tentativo o una shell instradata male ha lasciato un duplicato.

**Soluzione:** Mantieni il worktree o il branch canonico, elimina o blocca di nuovo gli altri, poi riesegui `emet preflight`.

## requiredCommands not on PATH

**Sintomo:** `preflight.requiredCommands not on PATH: <names>`.

**Causa:** `preflight.requiredCommands` in `emet.config.json` elenca i binari di cui il repo ha bisogno.

**Soluzione:** Installa i binari indicati, oppure rimuovili dalla configurazione se non servono più.

## Vedi anche

- [Indice della documentazione](README.md)
- [README](../README.md)
- [Per iniziare](guide/getting-started.md)
- [Riferimento della configurazione](reference/configuration.md)
- [Riferimento delle dipendenze](reference/dependencies.md)
