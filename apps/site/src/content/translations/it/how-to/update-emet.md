---
title: Aggiornare emet
description: Porta un emet installato a una nuova release e attiva l'aggiornamento automatico del marketplace per i plugin.
seoTitle: Aggiornare emet
sourceHash: 442bf243cbe7eadb
---

Come portare un emet installato a una nuova release. I termini seguono [GLOSSARY.md](../../GLOSSARY.md).

emet e il plugin opzionale `emet-mascot` provengono dallo stesso marketplace, `emet-marketplace`. Per impostazione predefinita Claude Code non aggiorna da solo i marketplace di terze parti, e un marketplace non può cambiare questa impostazione per i propri utenti.

## Aggiornare a mano

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Salta l'ultima riga se non hai installato la mascotte. Poi riavvia Claude Code oppure esegui `/reload-plugins`. `claude plugin list` mostra le versioni installate; l'ultima è in [CHANGELOG.md](../../CHANGELOG.md).

## Aggiornare su Codex

Aggiorna lo snapshot del marketplace, poi aggiungi di nuovo il plugin. Eseguire `codex plugin marketplace add` una seconda volta non lo aggiorna:

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` mostra se `emet@emet-marketplace` è installato e abilitato.

## Aggiornare automaticamente

In Claude Code esegui `/plugin`, apri la scheda **Marketplaces**, seleziona `emet-marketplace` e scegli **Enable auto-update**. Claude Code poi aggiorna il marketplace e i due plugin all'avvio di una sessione, e la sessione successiva carica le nuove versioni. Questa impostazione si fa su ogni singola macchina.

## Installato con install.sh

Esegui il pull dell'ultimo `main` nel tuo clone ed esegui di nuovo `./install.sh`.
