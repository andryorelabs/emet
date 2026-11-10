---
title: Per iniziare
description: Installa emet come plugin di Claude Code, verifica che funzioni con emet doctor ed eseguilo per la prima volta.
seoTitle: Iniziare con emet
sourceHash: 7a918962dca60c10
---

Installa emet, verifica che funzioni ed eseguilo per la prima volta.

<img src="../brand/mascot/mascot-done.svg" alt="emet mascot, done" width="96" align="right">

## Requisiti

Claude Code o la CLI di Codex, `git`, `gh` (autenticato) e il plugin `mattpocock-skills`, su Linux o macOS. Bun serve solo per un'installazione da sorgenti; Windows nativo non è supportato (usa WSL). L'elenco completo, con ciò che verifica ogni voce, è nel [riferimento delle dipendenze](../reference/dependencies.md).

## Installazione

Ci sono due percorsi di installazione.

**Plugin** (senza Bun). Aggiungi questo repo come marketplace e installa il plugin `emet`. Cosa include dipende dall'host dell'agente. Su Claude Code porta con sé `/emet:run`, gli agenti, gli hook di guardia e uno shim `emet` che al primo utilizzo scarica un binario standalone con checksum verificato.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

Su Codex, installa il plugin con `codex plugin`; i passaggi sono in [Eseguire emet su Codex](codex.md#installazione). Il plugin Codex fornisce le skill `$emet:run`, `$emet:init` e `$emet:doctor` e un hook, ma nessun agente e nessuno shim `emet`, quindi l'`emet` del terminale arriva da `install.sh`.

**`install.sh`** (funziona con o senza Bun):

```bash
git clone git@github.com:andryorelabs/emet.git
cd emet
./install.sh
```

Con `bun` nel PATH copia i sorgenti della CLI in `~/.claude/emet` e un wrapper `emet` in `~/.local/bin/emet`. Senza `bun` installa invece lo shim del binario standalone (`~/.local/bin/emet`, collegato a `~/.claude/emet/bin/emet`), che al primo avvio scarica il binario e ne verifica il checksum (richiede `curl`). In entrambi i casi i comandi finiscono in `~/.claude/commands/emet/` e gli agenti in `~/.claude/agents/`; i segnaposto del plugin nei prompt vengono riscritti in semplici percorsi `~/.claude`. Rieseguirlo è sicuro, e un file modificato viene mantenuto, con la nuova versione scritta accanto come `<file>.new`.

Entrambe le installazioni forniscono tre punti di ingresso. Su Claude Code sono i comandi slash `/emet:run`, `/emet:init` e `/emet:doctor`; su Codex sono le skill `$emet:run`, `$emet:init` e `$emet:doctor`, che fornisce solo il plugin Codex (`install.sh` installa i comandi di Claude Code). Il comando `emet` in un normale terminale funziona solo dopo `install.sh`; altrimenti usa i comandi slash, oppure `! emet <subcommand>` all'interno di una sessione di Claude Code o di Codex. Su Claude Code i nomi degli agenti differiscono: `emet:emet-worker` nel plugin, `emet-worker` standalone; Codex non ha agenti emet, perché ogni worker è un proprio processo `codex exec`.

Ordine consigliato, in ogni repo: esegui prima la skill `setup-matt-pocock-skills` (`/setup-matt-pocock-skills` su Claude Code; su Codex, la stessa skill del plugin `mattpocock-skills` con la sintassi `$` di Codex), poi `emet init`.

Verifica che sia andato tutto bene con `/emet:doctor` dentro Claude Code (`$emet:doctor` su Codex), oppure con `emet doctor .` in un terminale dopo `install.sh` (`selftest` richiede un'installazione da sorgenti).

Se `doctor` o `preflight` segnala un problema, vedi la [risoluzione dei problemi](../troubleshooting.md). Nulla viene mai installato o autenticato al posto dell'utente; vedi il [riferimento delle dipendenze](../reference/dependencies.md) per sapere chi controlla cosa e per `EMET_SKIP_DEPENDENCY_CHECKS`.

## Primo avvio

In qualsiasi repo git:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

All'interno di una sessione, `/emet:init` fa lo stesso di `emet init`. Poi, dentro Claude Code (su Codex usa `$emet:run` al posto di `/emet:run`):

```
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

`emet init` lascia un marcatore `TODO(emet):` nei file `docs/agents/*.md` generati per tutto ciò che non riesce a dedurre da solo (un lock condiviso del database di test, la proprietà dello schema, ecc.); compilali. `emet preflight` rifiuta il dispatch finché ne resta uno.

## Prossimi passi

- [Tracker e landing](trackers-and-landing.md): ticket su GitHub, Linear o locali, e come atterra un'ondata.
- [Eseguire emet su Codex](codex.md): installazione, l'approvazione unica e i limiti sull'Agent host Codex.
- [Modelli e impegno](models-and-effort.md): quale modello e quale impegno usa ogni ruolo.
- [Controllo della flotta](fleet.md): controlla più repo in una volta.
- [Riferimento della configurazione](../reference/configuration.md) e [riferimento della CLI](../reference/cli.md): ogni chiave e ogni sottocomando.
