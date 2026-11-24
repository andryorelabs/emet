---
title: Usare la mascotte di emet (mod di Claude Code e pet di Orca)
description: Mostra la mascotte di emet in Claude Code con il mod e in Orca con il pet.
seoTitle: Mascotte di emet in Claude Code e Orca
sourceHash: a6d2945308d1d44b
---

Mostra la **Mascotte** di emet in Claude Code e in Orca. I termini seguono [GLOSSARY.md](../../GLOSSARY.md).

Ci sono due elementi indipendenti: il plugin facoltativo `emet-mascot`, che disegna la mascotte in Claude Code, e il bundle pet di Orca, che dà a Orca lo stesso personaggio. emet non ha bisogno di nessuno dei due.

## Prerequisiti

- Claude Code, per il plugin.
- emet installato, così un'esecuzione scrive il phase file che la mascotte segue; vedi [Installazione](../start/install.md).
- Orca, per il pet. L'importazione richiede la cartella `docs/brand/pet/emet/` sulla macchina in cui gira l'app Orca.

## Installare il plugin della mascotte

:::steps

1. Aggiungi il marketplace e installa il plugin:

   ```bash
   claude plugin marketplace add andryorelabs/emet
   claude plugin install emet-mascot@emet-marketplace
   ```

2. Riavvia Claude Code. La mascotte segue la tua sessione (dorme, lavora, attende, ha finito, errore). Mentre un **Run** è attivo legge anche il phase file e mostra un'etichetta attenuata come `emet · wave 2 · review`.
3. Se vuoi, imposta le opzioni del plugin:
   - `position`: `pane` (predefinito), `band` o `status`. `pane` aggancia la mascotte accanto alla trascrizione e richiede il layout a schermo intero e un terminale largo almeno 144 colonne finché non apri tu stesso il pannello una volta (circa 110 dopo); quando non riesce ad agganciarsi, la mascotte compare sopra il prompt. `band` la disegna sempre sopra il prompt. `status` mostra solo l'etichetta di testo come riga di stato.
   - `size`: `small` (16 x 8 celle, predefinito) o `medium` (24 x 12 celle).
   - `showLabel`: mostra o nasconde l'etichetta (predefinito attivo).

:::

## Aggiornare il plugin della mascotte

I marketplace diversi da quello di Anthropic hanno l'aggiornamento automatico disattivato per impostazione predefinita, quindi aggiorna a mano oppure attivalo una volta.

:::steps

1. Aggiorna il marketplace e il plugin:

   ```bash
   claude plugin marketplace update emet-marketplace
   claude plugin update emet-mascot@emet-marketplace
   ```

2. Riavvia Claude Code.
3. Per aggiornare in autonomia, esegui `/plugin`, apri la scheda **Marketplaces**, seleziona `emet-marketplace` e scegli **Enable auto-update**. Ogni utente lo fa una volta sulla propria macchina. Vedi [Aggiornare emet](update-emet.md) per il plugin principale.

:::

## Usare il pet in Orca

:::steps

1. Assicurati che `docs/brand/pet/emet/` (`pet.json` e `spritesheet.webp`) sia sulla macchina in cui gira Orca; copia lì la cartella se Orca gira altrove rispetto a questo repo.
2. Nelle impostazioni di Orca scegli «Import .codex-pet bundle…» e seleziona quella cartella.
3. Dopo aver modificato un SVG della mascotte, rigenera il bundle con `bun run brand:export` e fai il commit del risultato.

:::

## Verifica

:::steps

1. Esegui `claude plugin list` e conferma che `emet-mascot` sia abilitato; se la mascotte manca, riavvia Claude Code.
2. Durante un'esecuzione, conferma che `.emet/phase.json` esista e sia stato aggiornato negli ultimi secondi. La mascotte lo legge circa ogni due secondi e ignora un file più vecchio della sua finestra di freschezza, così un'esecuzione andata in crash non lascia un'etichetta obsoleta. Contiene `phase` (`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done` o `failed`), `wave`, `spec`, `runId`, `updatedAt` e un `outcome` facoltativo.
3. In Orca, conferma che il pet di emet compaia nell'elenco dei pet.

:::
