---
title: Review e gate
description: Come la doppia review e i gate decidono se il lavoro può atterrare.
seoTitle: Review e gate in emet
sourceHash: 6efa20526c00a453
---

Come la doppia review e i gate decidono se il lavoro può atterrare. I termini seguono [GLOSSARY.md](../../GLOSSARY.md).

## Un reviewer controlla l'ondata rispetto alla spec

Dopo che i branch di un'ondata sono stati uniti nel branch di integrazione, un **Reviewer** legge il risultato in un contesto nuovo e lo verifica rispetto alla spec. Il reviewer è un agente separato, mai il worker che ha scritto il codice.

Quanta review riceve un'ondata dipende dal suo rischio. `emet assess` classifica il diff in modo deterministico in uno di tre livelli:

- `passive`: un diff solo di documentazione. Nessun reviewer viene eseguito.
- `medium`: una normale modifica ai sorgenti. Viene eseguito un reviewer.
- `high`: il diff tocca terreno rischioso come autenticazione, pagamenti, CI, migrazioni o sink pericolosi. Queste ondate ricevono la **Dual review** (doppia review).

## Dual review nel livello high

Un'ondata `high` è letta da due reviewer in parallelo sullo stesso pacchetto: il reviewer Claude e un reviewer Codex. Un modello condivide i propri punti ciechi, quindi una seconda lettura indipendente è lo scopo.

Il coordinatore poi unisce i due insiemi di rilievi. Un rilievo sollevato da entrambi i reviewer resta aperto come concordato. Un rilievo sollevato da un solo reviewer viene valutato dal coordinatore, che lo mantiene o lo scarta con una regola registrata. Un rilievo che contraddice un requisito che hai scelto esplicitamente non viene mai scartato.

La Dual review viene eseguita solo quando il livello è `high`, l'host è Claude Code, il binario `codex` è nel PATH e `review.dual` non è `off`. Altrimenti viene eseguito un solo reviewer. Le ondate medium e passive costano lo stesso in entrambi i casi, e i token dei reviewer raddoppiano circa solo nelle ondate high. Vedi [ADR-0040](../adr/0040-dual-review-in-the-high-tier.md).

## I rilievi si verificano, non si danno per buoni

La CLI verifica ciò che il reviewer afferma:

- **Verdetti di copertura.** Per ogni requisito il reviewer dichiara met, partial o unmet. Un `met` deve indicare un test. Un `met` il cui file di test o nome del test manca, o un requisito senza verdetto, diventa un rilievo `verification-gap` aperto. La CLI non esegue test da sola; lo fa la suite completa sul branch di integrazione.
- **Rilievi preesistenti.** Un rilievo su una riga che l'ondata non ha aggiunto o modificato viene riportato ma non blocca mai il gate.
- **Opzioni dell'utente.** Un requisito che hai scelto esplicitamente è contrassegnato come opzione dell'utente. Un rilievo contro di esso blocca a ogni livello e gravità, anche su una riga non toccata, e comporta un round di correzione, non un arresto di per sé.

## Il gate decide

Le fasi non decidono mai da sole che il lavoro possa procedere. `emet gate` legge il record di verifica, i rilievi aperti, il livello di rischio, la CI, la suite di integrazione e i budget, e stampa una decisione:

- `merge` o `chain`: il lavoro può proseguire.
- `hold`: manca qualcosa che emet può risolvere da solo, come rilievi che può correggere o un controllo ancora in corso.
- `stop`: una persona deve pronunciarsi prima che l'esecuzione prosegua.
- `defer`: il ticket ha fallito troppi tentativi; viene messo da parte e il resto dell'ondata continua.

## Round di correzione

Quando ci sono rilievi bloccanti aperti, il gate si ferma e chiede un **Fix round** (round di correzione): il coordinatore corregge i rilievi aperti e un reviewer ricontrolla solo quelli, non l'intero diff. I round di correzione hanno un proprio budget, separato da quello dei round di review.

Il gate si arresta quando un rilievo mostra che la spec stessa era sbagliata, quando i round di correzione finiscono con rilievi ancora aperti, o quando la suite di integrazione fallisce una seconda volta dopo che le sue spec fallite sono state rieseguite. Una CI che non è mai stata eseguita a causa della macchina o del provider viene ritentata senza addebitare un tentativo di correzione, e segnalata come problema di infrastruttura la seconda volta consecutiva.

Per le chiavi, vedi [`review`](../reference/configuration.md#review), [`gate`](../reference/configuration.md#gate) e [`budgets`](../reference/configuration.md#budgets). Per i comandi, vedi [`emet assess`, `emet review` e `emet gate`](../reference/cli.md#gates-and-records). Per scegliere i modelli dei reviewer, vedi [Modelli ed effort](../how-to/choose-models.md).
