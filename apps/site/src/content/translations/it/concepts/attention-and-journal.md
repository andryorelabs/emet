---
title: Attenzione e journal
description: Come emet registra i propri eventi in un journal globale e segnala quando una sessione ti aspetta.
seoTitle: Attenzione e journal in emet
sourceHash: 378e84638489f44f
---

emet registra i propri eventi in un unico journal globale. Un tipo di evento ti dice quando una sessione ti sta aspettando. I termini seguono [GLOSSARY.md](../../GLOSSARY.md); le decisioni sono in [ADR-0030](../adr/0030-global-event-journal.md) e [ADR-0042](../adr/0042-session-attention-state-in-the-journal.md).

## Il journal

Il journal è un unico file append-only di righe JSON, un evento per riga, nella directory di stato dell'host che contiene anche il pool di slot dei worker. Essendo globale, un'analisi successiva può distinguere un'esecuzione avviata da `emet launch` o `emet chain` da una digitata a mano: ogni evento porta con sé il repo, l'host e un'origine `human` o `auto`.

I comandi esistenti scrivono gli eventi: l'avvio di un'esecuzione, una decisione del gate, un intervento umano in un'ondata senza supervisione, un esito di launch, un ticket chiuso, una pulizia, un segno di baseline, e l'integrazione, il landing o l'abbandono di uno spec branch.

### Cosa non registra mai

Prompt, testo dell'assistente, input degli hook, variabili d'ambiente, argv, token, diff e corpi delle issue. Un evento contiene solo id, codici, conteggi, durate e un breve motivo. Un evento che supererebbe i 2 KiB perde i suoi dati e viene contrassegnato come troncato.

### Errori e rotazione

Un journal che non può essere scritto non cambia mai l'output o il codice di uscita di un comando. Quando il file supera circa 10 MiB, la scrittura successiva lo sposta in un segmento numerato e conserva i cinque più recenti. Su un filesystem di rete le scritture concorrenti possono intrecciarsi, quindi `emet doctor` avvisa, senza fallire, quando la directory di stato si trova su uno di essi.

### Lettura

`emet insights` legge ogni segmento e riporta le esecuzioni per origine, le decisioni del gate, gli interventi, gli esiti dei launch, gli eventi delle spec e i ticket chiusi. Per impostazione predefinita copre gli eventi dall'ultima baseline; `--mark-baseline` inizia a contare da adesso. Salta le righe che non riesce a interpretare e le conta, e stampa un report a zero quando il journal è vuoto. Poiché il file è fatto di semplici righe JSON, funziona anche `jq`. Vedi il [riferimento della CLI](../reference/cli.md#runs-workers-and-slots).

## Attenzione

Un'esecuzione può restare bloccata su una richiesta di permesso o su una domanda mentre nessuno guarda. L'attenzione è la risposta a "una sessione ha bisogno di me?".

Ogni sessione di un'esecuzione gestita da emet si trova in uno di quattro stati:

- **working**: l'agente sta agendo.
- **needs-decision**: l'agente aspetta una persona, per esempio su una richiesta di permesso o una domanda. "Blocked" è un altro modo per dirlo.
- **idle**: l'agente si è fermato e aspetta il prossimo prompt.
- **ended**: la sessione è finita.

L'hook `emet guard`, già installato sull'host, rileva le transizioni e aggiunge un evento `session.attention` al journal solo quando lo stato cambia, quindi non esiste un secondo archivio. Una sessione conta come gestita da emet quando gira in un worktree di worker di emet, o in un repo con una configurazione emet e un'esecuzione non terminata. Su Codex non ci sono eventi di notifica, quindi un arresto è idle a meno che l'esecuzione non abbia un risultato bloccato, che è needs-decision.

L'evento contiene l'id della sessione, lo stato vecchio e nuovo, il trigger e l'id dell'esecuzione. Non contiene mai il testo della notifica, il nome dello strumento o il suo input. La registrazione non blocca mai: un errore viene ignorato e la finestra di dialogo dei permessi resta invariata.

### L'avviso

Entrare in needs-decision genera un solo avviso: un segno di non letto di Orca sul worktree quando il runtime di Orca è raggiungibile, altrimenti una notifica desktop quando disponibile. emet non lo cancella mai, e `attention.alert` lo disattiva.

### Dove lo vedi

`emet status` elenca le sessioni e il loro stato, e una sessione bloccata porta lo stato complessivo a needs-decision anche quando nessuna ondata è in corso. `emet fleet status` mostra lo stesso tra i repo.

## Vedi anche

- [Esecuzioni, ondate e spec](runs-waves-specs.md)
- [Sicurezza](security.md)
- [Riferimento della configurazione](../reference/configuration.md) per `attention.alert`
