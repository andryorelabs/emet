---
title: Landing
description: Come una spec arriva sul trunk, per impostazione predefinita in un'unica pull request.
seoTitle: Landing di una spec in emet
sourceHash: 11d51c9132097b57
---

Come una spec arriva sul trunk, per impostazione predefinita in un'unica pull request. I termini seguono [GLOSSARY.md](../../GLOSSARY.md).

Qui **Landing** indica il modo in cui il lavoro terminato arriva sul trunk. Non ha nulla a che vedere con la home page del Website.

## Una pull request per spec

Per impostazione predefinita una spec atterra come un'unica pull request. Ogni ondata ha comunque la propria review, il proprio gate e il proprio self-check, ma un'ondata che li supera non viene fatta atterrare. Il coordinatore unisce il suo branch di integrazione con `--no-ff` in un **Spec branch** locale, `spec/<id>`, e i ticket dell'ondata diventano **Integrated**. L'ondata successiva parte dalla punta di quel branch, così le ondate seguenti si costruiscono su quelle precedenti senza aspettare la CI di una pull request.

Dopo l'ultima ondata il coordinatore sincronizza il trunk nello spec branch con un merge, mai con un rebase, e lo fa atterrare una sola volta: una pull request, oppure un merge locale quando la modalità di landing è `merge`, che non fa mai push. Ogni ondata resta un merge commit separato nella cronologia del trunk, quindi una singola ondata si può ancora annullare.

Un ticket **Integrated** conta come blocco chiuso per la **Frontier**, ma resta aperto finché il landing finale non lo chiude. **Landed** mantiene il suo significato semplice: sul trunk.

## Un'ondata atterra da sola solo su richiesta

Con `landing.unit: wave`, ogni ondata atterra per conto proprio: una pull request e un'attesa della CI per ondata, e l'ondata successiva parte solo dopo che quella pull request è stata unita. Una spec con tre ondate costa quindi tre pull request. Questo è il comportamento precedente a [ADR-0037](../adr/0037-landing-per-spec.md), e resta disponibile.

Una **Quick run** atterra sempre per ondata, perché ha esattamente un'ondata. Vedi [ADR-0039](../adr/0039-quick-mode-lands-per-wave.md).

## Pull request o merge locale

Indipendentemente dall'unità, `landing.mode` sceglie come il lavoro arriva sul trunk. `pr` apre una pull request e richiede `gh`. `merge` unisce in locale con `emet land` o `emet spec-branch land` e non fa mai push, con il comando di self-check del repository al posto della CI. Vedi [ADR-0010](../adr/0010-local-merge-landing.md).

## Cosa aspettarsi

- Un difetto che solo la CI individua emerge al landing finale, dopo che le ondate successive vi si sono basate.
- Un conflitto con il trunk emerge alla sincronizzazione, dove il coordinatore si ferma ed elenca i percorsi.
- Il checkout è legato a una sola spec alla volta; una seconda spec in parallelo richiede un altro worktree.
- `spec/<id>` viene inviato con push dopo ogni ondata integrata, per impostazione predefinita, senza aprire una pull request, così la perdita di un disco costa al massimo un'ondata.
- Unire la pull request della spec con un merge commit mantiene l'annullamento per ondata. Un trunk che consente solo squash merge fa atterrare la spec come un unico commit e perde quell'annullamento.

Per le chiavi, vedi [`landing`](../reference/configuration.md#landing). Per i comandi, vedi [`emet spec-branch` e `emet land`](../reference/cli.md#planning-review-and-landing). Per la decisione, vedi [ADR-0037](../adr/0037-landing-per-spec.md).
