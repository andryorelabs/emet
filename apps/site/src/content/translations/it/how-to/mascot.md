---
title: Usare la mascotte di emet (mod di Claude Code e pet di Orca)
description: Mostra la mascotte di emet in Claude Code con il mod e in Orca con il pet.
seoTitle: Mascotte di emet in Claude Code e Orca
sourceHash: caca9eb66e693e32
---

Come mostrare la **Mascotte** di emet in Claude Code e in Orca. I termini seguono [GLOSSARY.md](../../GLOSSARY.md).

Ci sono due elementi indipendenti: il plugin facoltativo `emet-mascot`, che disegna la mascotte in Claude Code, e il bundle pet di Orca, che dà a Orca lo stesso personaggio.

## Installare il plugin della mascotte

Il plugin è distribuito nello stesso marketplace di emet ed è facoltativo. emet non ne ha bisogno.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet-mascot@emet-marketplace
```

La mascotte segue la tua sessione (dorme, lavora, attende, ha finito, errore). Mentre un **Run** è attivo legge anche il **Phase file** e mostra un'etichetta attenuata come `emet · wave 2 · review`.

Opzioni del plugin:

- `position`: `pane` (predefinito), `band` o `status`. `pane` aggancia la mascotte accanto alla trascrizione, cosa che richiede il layout a schermo intero e un terminale largo almeno 144 colonne finché non apri tu stesso il pannello una volta (circa 110 dopo); quando non riesce ad agganciarsi, o il terminale si restringe in seguito, la mascotte compare invece sopra il prompt. `band` la disegna sempre sopra il prompt. `status` mostra solo l'etichetta di testo come riga di stato del plugin, senza la grafica della mascotte.
- `size`: `small` (16 x 8 celle, predefinito) o `medium` (24 x 12 celle).
- `showLabel`: mostra o nasconde l'etichetta accanto alla mascotte (predefinito attivo).

## Aggiornare il plugin della mascotte

I marketplace diversi da quello di Anthropic hanno l'aggiornamento automatico disattivato per impostazione predefinita, e un marketplace non può attivarlo per i propri utenti. Aggiorna a mano:

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Poi riavvia Claude Code. Per aggiornare automaticamente, esegui `/plugin`, apri la scheda **Marketplaces**, seleziona `emet-marketplace` e scegli **Enable auto-update**. Ogni utente lo fa una volta sulla propria macchina. Vedi [Aggiornare emet](update-emet.md) anche per il plugin principale.

## Il phase file

La CLI di emet scrive `.emet/phase.json` nel repo man mano che un'esecuzione avanza, e la mascotte lo legge circa ogni due secondi. Un file più vecchio della finestra di freschezza viene ignorato, così un'esecuzione andata in crash non lascia un'etichetta obsoleta.

Il file contiene `phase` (`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done` o `failed`), `wave`, `spec`, `runId`, `updatedAt` e un `outcome` facoltativo. Una scrittura che fallisce non fa mai fallire il sottocomando che ha segnalato la fase.

## Usare il pet in Orca

Il bundle pet si trova in `docs/brand/pet/emet/`: `pet.json` e `spritesheet.webp`. Nelle impostazioni di Orca usa «Import .codex-pet bundle…» e scegli quella cartella. L'importazione richiede `docs/brand/pet/emet/` sulla macchina in cui gira l'app Orca, quindi copia la cartella lì se Orca gira altrove rispetto a questo repo. Rigeneralo con `bun run brand:export` dopo aver modificato un SVG della mascotte e fai il commit del risultato.

## Risoluzione dei problemi

- Nessuna mascotte: esegui `claude plugin list`, controlla che `emet-mascot` sia abilitato, poi riavvia Claude Code.
- Nessuna etichetta: controlla che `.emet/phase.json` esista e sia stato aggiornato di recente.
