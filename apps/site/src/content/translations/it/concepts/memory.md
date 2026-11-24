---
title: Memoria
description: Cosa emet ricorda tra un'esecuzione e l'altra e dove lo conserva.
seoTitle: Memoria di emet
sourceHash: 9053ca5dd53acba7
---

Cosa emet ricorda tra un'esecuzione e l'altra e dove lo conserva. I termini seguono [GLOSSARY.md](../../GLOSSARY.md).

## Lezioni

Un'esecuzione è senza supervisione, quindi ciò che impara svanirebbe con la sessione. Alla fine di un'esecuzione il coordinatore salva da 1 a 5 brevi punti elenco su ciò che ha aiutato o ostacolato, chiamati **Lezioni**, insieme all'esito dell'esecuzione: landed, chained, hold, stop o blocked. Ogni punto è una singola riga breve.

Le lezioni sono conservate per spec, in una nota per repository, così un'esecuzione successiva sullo stesso repository può leggere ciò che le precedenti hanno imparato. Una nota che diventa troppo grande scarta per prime le sezioni più vecchie.

## Dove sono conservate

Le lezioni vivono in [Engram](https://github.com/Gentleman-Programming/engram), un archivio di memoria locale separato, non nel tuo repository e non nel tracker. emet lo usa solo quando il binario `engram` è nel PATH e risponde al suo handshake.

Se Engram manca, è guasto o è disattivato, `emet memory` segnala che la memoria non è disponibile ed esce con successo. La memoria non blocca mai un'esecuzione.

## Come vengono usate

All'inizio di un'esecuzione, prima del primo round di intervista, il coordinatore cerca nella memoria le lezioni pertinenti alla funzionalità. Quelle rilevanti vanno nel piano sotto un titolo "Prior lessons", così l'intervista e il piano partono da ciò che le esecuzioni precedenti hanno scoperto. Quando non si trova nulla o la memoria non è disponibile, l'esecuzione lo annota in una riga e prosegue.

## Uso manuale

`emet memory search` e `emet memory save` sono normali comandi della CLI, quindi puoi cercare o aggiungere una lezione tu stesso. Per disattivare la memoria in un repository, imposta `memory.enabled` su `off`.

Per i comandi, vedi [`emet memory`](../reference/cli.md#runs-workers-and-slots). Per la chiave, vedi [`memory`](../reference/configuration.md#memory). Il posto di un'esecuzione nel flusso più ampio è descritto in [Esecuzioni, ondate e spec](runs-waves-specs.md).
