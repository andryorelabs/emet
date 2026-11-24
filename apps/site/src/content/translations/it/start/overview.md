---
title: Panoramica
description: Cos'è emet, cosa fa un'esecuzione e dove andare dopo.
seoTitle: Panoramica di emet
sourceHash: 8627801ad3b7d807
---

Cos'è emet, cosa fa un'esecuzione e dove andare dopo. I termini seguono [GLOSSARY.md](../../GLOSSARY.md).

<img src="../brand/mascot/mascot-done.svg" alt="mascotte di emet, completato" width="96" align="right">

emet porta una funzionalità dall'idea alla modifica integrata dentro Claude Code o la CLI di Codex, in qualsiasi repo git, con Linear, GitHub Issues o ticket locali. Descrivi la funzionalità una volta sola e approvi la spec e i ticket una volta sola; il resto procede senza supervisione.

## Cosa fa un'esecuzione

1. `/emet:run` (`$emet:run` su Codex) ti intervista e scrive una spec.
2. Divide la spec in ticket e chiede una sola approvazione.
3. Worker paralleli implementano ogni ticket nel proprio worktree git.
4. Una revisione controlla ogni ondata e la CI deve essere verde; tutto ciò che viene segnalato blocca l'integrazione.
5. La spec atterra per impostazione predefinita come una sola pull request, oppure come un merge locale, e l'ondata successiva può concatenarsi.

## Dove andare dopo

1. [Installazione](install.md): l'installazione standalone, l'aggiornamento, l'aggiornamento automatico e la disinstallazione.
2. [Primo avvio](first-run.md): verifica l'installazione ed esegui emet in un repo.
3. [Esecuzioni, ondate e spec](../concepts/runs-waves-specs.md): il vocabolario di un'esecuzione.
4. [Tracker e landing](../how-to/configure-tracker.md): ticket su GitHub, Linear o locali, e come atterra una spec.
