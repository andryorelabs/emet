---
title: Esecuzioni, ondate e spec
description: Come un'esecuzione, un'ondata e una spec si relazionano tra loro.
seoTitle: Esecuzioni, ondate e spec in emet
sourceHash: e43250ad3faa9a31
---

Come un'esecuzione, un'ondata e una spec si relazionano tra loro. I termini seguono [GLOSSARY.md](../../GLOSSARY.md).

## La spec è l'unità di lavoro

Una **Spec** è il documento dei requisiti di una funzionalità, con requisiti numerati `S1..Sn`. Viene scritta e approvata prima che esista qualsiasi ticket, e tutto ciò che segue si misura rispetto a essa: ogni ticket indica i requisiti che copre in una riga `Covers:`, e ogni requisito richiede almeno un ticket e uno scenario di accettazione. `emet validate` verifica entrambe le cose prima dell'unica approvazione. Vedi [`emet validate`](../reference/cli.md#gates-and-records).

Quando una spec atterra, aggiorna le [spec vive](living-specs.md) che descrivono il comportamento attuale.

## Ticket e ondate

Un **Ticket** è un'unità di lavoro derivata dalla spec, con interfacce, superfici di modifica consentite e un budget di contesto. I ticket dipendono l'uno dall'altro, quindi non possono partire tutti insieme.

Un'**Ondata** (Wave) è uno strato di dipendenze: i ticket i cui blocchi sono tutti completati, inviati insieme. L'insieme dei ticket pronti per il dispatch in un dato momento è la **Frontier**. All'interno di un'ondata le superfici di modifica sono disgiunte, quindi i worker non toccano mai lo stesso file, e ogni worker ha il proprio worktree e il proprio branch locale.

Un'ondata è anche l'unità di review: ogni ondata ha la propria review e il proprio gate, qualunque sia l'[unità di landing](landing.md).

## Un'esecuzione è una singola esecuzione

Una **Run** (esecuzione) è una singola esecuzione di `/emet:run` per una spec. Il suo id lega insieme i claim, gli slot dei worker, i lock e i risultati che l'esecuzione crea, e i suoi record si trovano in `.emet/runs/<run-id>/` nel checkout principale.

All'interno di un'esecuzione, una sessione, il **Coordinatore**, esegue le fasi, invia i worker, unisce i loro branch ed è l'unico a scrivere sul tracker. I worker riferiscono tramite una nota di handoff e un file di risultato locale, mai al tracker. Vedi [ADR-0005](../adr/0005-coordinator-is-the-single-tracker-writer.md).

Una **Quick run** è il caso piccolo: una spec con esattamente un ticket, un round di intervista e un'ondata che atterra da sola, qualunque sia l'unità di landing del repository. Vedi [ADR-0039](../adr/0039-quick-mode-lands-per-wave.md).

## Come si incastrano

1. L'esecuzione ti intervista e scrive la spec, poi ricava i ticket e li raggruppa in ondate.
2. Approvi una sola volta. L'approvazione registra gli hash della spec e dell'elenco dei ticket, e il dispatch rifiuta di procedere se uno dei due cambia in seguito.
3. Per ogni ondata, i worker implementano i loro ticket in worktree paralleli. Il coordinatore unisce i loro branch in un branch di integrazione, e l'ondata passa per [review e gate](review-and-gates.md).
4. Un'ondata che supera i controlli viene [fatta atterrare](landing.md), da sola o insieme al resto della sua spec.
5. Alla fine dell'esecuzione il coordinatore salva ciò che ha imparato come [lezioni](memory.md).

Per i comandi dietro ogni passaggio, vedi il [riferimento della CLI](../reference/cli.md#runs-workers-and-slots) e i [gate e record](../reference/cli.md#gates-and-records) che elenca.
