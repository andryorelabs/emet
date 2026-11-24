---
title: Primo avvio
description: Verifica l'installazione con emet doctor ed esegui emet per la prima volta.
seoTitle: Primo avvio di emet
sourceHash: 7daec76e45f50b8c
---

Verifica l'installazione con `emet doctor` ed esegui emet per la prima volta. Installa prima emet; vedi [Installazione](install.md).

## Prerequisiti

- emet installato, con `emet` nel tuo `PATH`.
- Un repo git con `gh` autenticato.
- Su Claude Code o Codex, il plugin `mattpocock-skills`.

## Passaggi

In ogni repo, esegui prima la skill `setup-matt-pocock-skills` (`/setup-matt-pocock-skills` su Claude Code; su Codex, la stessa skill del plugin `mattpocock-skills` con la sintassi `$` di Codex). Poi, in qualsiasi repo git:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight     # confirms the repo is dispatch-ready
```

All'interno di una sessione, `/emet:init` fa lo stesso di `emet init` (`$emet:init` su Codex). `emet init` lascia un marcatore `TODO(emet):` nei file `docs/agents/*.md` generati per tutto ciò che non riesce a dedurre da solo, come un lock condiviso del database di test o la proprietà dello schema; compilali. `emet preflight` rifiuta il dispatch finché ne resta uno.

Poi esegui emet dentro Claude Code (su Codex usa `$emet:run` al posto di `/emet:run`):

```
/emet:run <describe the feature>              # interview, then wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## Controlla il risultato

Esegui `emet doctor .` in un terminale, oppure `/emet:doctor` dentro Claude Code (`$emet:doctor` su Codex). Riporta prima gli errori. Se `doctor` o `preflight` segnala un problema, vedi la [risoluzione dei problemi](../troubleshooting.md). Nulla viene mai installato o autenticato al posto dell'utente; il [riferimento delle dipendenze](../reference/dependencies.md) indica chi controlla cosa e documenta `EMET_SKIP_DEPENDENCY_CHECKS`.

## Prossimi passi

- [Tracker e landing](../how-to/configure-tracker.md): ticket su GitHub, Linear o locali, e come atterra una spec.
- [Eseguire emet su Codex](../how-to/use-codex.md): l'approvazione unica e i limiti sull'Agent host Codex.
- [Modelli e impegno](../how-to/choose-models.md): quale modello e quale impegno usa ogni ruolo.
- [Controllo della flotta](../how-to/check-a-fleet.md): controlla più repo in una volta.
- [Riferimento della configurazione](../reference/configuration.md) e [riferimento della CLI](../reference/cli.md): ogni chiave e ogni sottocomando.
