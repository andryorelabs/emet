---
title: Spec vive
description: Come le spec vive descrivono il comportamento attuale e come una spec le aggiorna.
seoTitle: Spec vive in emet
sourceHash: d2468b14b371c04b
---

Una spec nel tracker è un piano: i suoi requisiti, i suoi ticket e le sue ondate. Una volta chiusi i ticket, il tracker non dice più cosa fa il sistema. Una spec viva colma questa lacuna: un file per area in `docs/specs/` che descrive il comportamento attuale, mantenuto aggiornato dalla stessa pull request che lo modifica. I termini seguono [GLOSSARY.md](../../GLOSSARY.md); la decisione è in [ADR-0038](../adr/0038-living-specs-hold-current-behaviour.md).

## Cosa contiene una spec viva

Ogni area ha un file. È un elenco di requisiti, e ogni requisito ha un nome descrittivo, una riga `Source: #<spec> S<n>` che punta alla voce della spec che l'ha introdotto, e uno o più scenari in forma WHEN e THEN. La riga di origine è importante perché i numeri S sono locali a una singola spec, quindi il nome non ne usa mai uno.

Una spec viva descrive il comportamento, non il lavoro: nulla al suo interno dice cosa è pianificato o chi lo fa. Questo resta nel tracker.

## Come la aggiorna una spec

Le spec vive sono opt-in, tramite `specs.enabled`. Quando è attivo, l'aggiornamento avviene una volta per spec, nell'ultima ondata:

1. Il coordinatore legge la spec viva corrente di ogni area interessata.
2. Per ogni requisito che la spec tocca, decide se è aggiunto, modificato o rimosso, e scrive il risultato come delta della spec in una directory condivisa da tutti i worktree del repo.
3. `emet spec-merge` integra i delta nei file di `docs/specs/`. Non esegue mai git; è il coordinatore a fare il commit del risultato.
4. Il commit fa parte dell'ultima ondata, quindi la review e i gate vedono la modifica alla spec viva come qualsiasi altra modifica.

Un merge che va in conflitto, o che perderebbe uno scenario esistente, non scrive nulla ed esce con un errore. Il coordinatore corregge il delta una volta; se fallisce di nuovo, l'ondata atterra senza l'aggiornamento e il report lo dichiara.

## Perché decide il coordinatore

A quale area appartiene un requisito, e se è nuovo o modifica uno esistente, è un giudizio che richiede il file corrente e l'intento della spec. Uno strumento che generasse i delta in modo meccanico non potrebbe saperlo, quindi il giudizio resta al coordinatore e il merge resta meccanico.

## Dove atterra

Con il landing predefinito, il commit della spec viva viaggia dentro lo spec branch e arriva sul trunk con l'unica pull request. Vedi [Landing](landing.md). Con l'ondata come unità di landing fa parte della pull request dell'ultima ondata.

## Vedi anche

- [Esecuzioni, ondate e spec](runs-waves-specs.md)
- [Review e gate](review-and-gates.md)
- [Riferimento della configurazione](../reference/configuration.md) per `specs.enabled` e `specs.dir`
