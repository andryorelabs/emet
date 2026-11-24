---
title: Aggiornare emet
description: Porta un emet installato a una nuova release e attiva l'aggiornamento automatico del marketplace per i plugin.
seoTitle: Aggiornare emet
sourceHash: 380b07ed5a10474f
---

Come portare un emet installato a una nuova release. I termini seguono [GLOSSARY.md](../../GLOSSARY.md).

## Aggiornare l'installazione standalone

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

La release viene scaricata, verificata rispetto a `SHA256SUMS` (e all'attestazione quando `gh` è presente) e messa in staging. Lo scambio del symlink e dei file installati avviene solo quando nessuno slot worker è occupato; altrimenti l'aggiornamento resta in sospeso e viene applicato al successivo avvio di sessione. Un errore lascia intatta la versione corrente e viene registrato nel journal. La versione precedente viene mantenuta per il rollback e quelle più vecchie vengono eliminate. `emet doctor` avvisa quando un aggiornamento è in sospeso.

## Aggiornare automaticamente

Un hook `SessionStart` esegue `emet self update --auto` al massimo una volta al giorno, in background e in silenzio quando sei offline. Per disattivarlo, imposta `EMET_AUTO_UPDATE=0` oppure esegui:

```bash
emet self update --auto off
```

`emet self update --auto on` lo riattiva. L'aggiornamento automatico non fa nulla per le installazioni tramite plugin.

## Opzionale: plugin

emet e il plugin opzionale `emet-mascot` provengono dallo stesso marketplace, `emet-marketplace`. Per impostazione predefinita Claude Code non aggiorna da solo i marketplace di terze parti, e un marketplace non può cambiare questa impostazione per i propri utenti.

### Claude Code

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Salta l'ultima riga se non hai installato la mascotte. Poi riavvia Claude Code oppure esegui `/reload-plugins`. `claude plugin list` mostra le versioni installate; l'ultima è in [CHANGELOG.md](../../CHANGELOG.md).

Per aggiornare automaticamente, esegui `/plugin` in Claude Code, apri la scheda **Marketplaces**, seleziona `emet-marketplace` e scegli **Enable auto-update**. Claude Code poi aggiorna il marketplace e i due plugin all'avvio di una sessione. Questa impostazione si fa su ogni singola macchina.

### Codex

Aggiorna lo snapshot del marketplace, poi aggiungi di nuovo il plugin. Eseguire `codex plugin marketplace add` una seconda volta non lo aggiorna:

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` mostra se `emet@emet-marketplace` è installato e abilitato. L'aggiornamento automatico è una funzione di Claude Code; su Codex aggiorna a mano.
