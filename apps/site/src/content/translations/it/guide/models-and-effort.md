---
title: Modelli e impegno
description: Come emet sceglie un modello e un livello di ragionamento per ogni ruolo e quali chiavi di configurazione li modificano.
seoTitle: Modelli e impegno in emet
sourceHash: a46d2e68a403f4f9
---

`/emet` sceglie automaticamente un modello e un livello di ragionamento per ogni ruolo; non c'è nulla da cambiare a mano durante l'esecuzione. Ogni chiave è nel [riferimento della configurazione](../reference/configuration.md#models).

| Ruolo                                                   | Modello                    | Impegno                               | Impostato da                               |
| ------------------------------------------------------- | -------------------------- | ------------------------------------- | ------------------------------------------ |
| Pianificazione (fasi 1–4)                               | Opus, tramite `opusplan`   | quello della tua sessione             | te, una sola volta                         |
| Coordinatore, dalla fase 5                              | Sonnet, tramite `opusplan` | quello della tua sessione             | te, una sola volta                         |
| Worker (fase 7)                                         | Sonnet                     | `medium`                              | `agents/emet-worker.md`, o `models.worker` |
| Review, livello `passive` (diff solo di documenti)      | nessuno                    | —                                     | `emet assess`                              |
| Review, livello `medium` (normale modifica ai sorgenti) | Opus                       | `medium`                              | `models.reviewer.medium`                   |
| Review, livello `high` (percorsi o sink a rischio)      | Opus                       | `medium` per impostazione predefinita | `models.reviewer.high`                     |
| Triage dei log di CI (fase 8)                           | Haiku                      | —                                     | `models.triage`                            |

Le due definizioni di agente (installate da `install.sh` in `~/.claude/agents/`) fissano da sole `model`/`effort` nel frontmatter, così la scelta di modello e impegno del coordinatore non si trasmette mai a un worker o al reviewer. `emet doctor` segnala (senza mai bloccare) la scomparsa di uno dei due file. `emet preflight` blocca invece il dispatch quando manca `emet-worker` o `emet-reviewer`, perché la fase 6 e la fase 8 fanno il dispatch tramite `subagent_type`.

## Instradamento per livello di rischio

La fase 8 esegue `emet assess --base <trunk> --head <integration branch>`, che classifica il diff in modo deterministico e stampa un JSON con il livello, i motivi e il modello/impegno consigliati per il reviewer:

- `passive`: diff solo di documenti; non viene inviato alcun reviewer.
- `medium`: il reviewer usa `models.reviewer.medium`.
- `high`: il diff tocca autenticazione, sicurezza, pagamenti, webhook, CI, l'installer, lockfile, migrazioni, un sink pericoloso (SQL grezzo, pipe-to-shell e simili) o un percorso che corrisponde a `review.highRiskPaths`. Il reviewer usa `models.reviewer.high`, e l'auto-merge fa atterrare la PR solo con controlli verdi e nessun rilievo di review aperto.

Un ticket che tocca percorsi ad alto rischio può avere una riga `Model:` (per esempio `Model: opus` oppure `Model: opus/high`), che sostituisce `models.worker` solo per quel worker.

## Triage con Haiku

Il coordinatore non legge mai un log di CI per intero. Un controllo fallito viene passato a un agente su `models.triage` (predefinito `haiku`), che restituisce al massimo circa 2k token con riferimenti `file:line` per la correzione.

## Configurazione

Ogni chiave è facoltativa, e i valori predefiniti riproducono la tabella qui sopra:

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  },
  "review": { "highRiskPaths": [] }
}
```

`review.highRiskPaths` è un elenco di sottostringhe di percorso aggiuntive, senza distinzione tra maiuscole e minuscole, che impongono il livello `high`. Per maggiore attenzione sulle ondate rischiose, alza `models.reviewer.high.effort` (per esempio a `high`).

## Host Codex

Con `agentHost` su `"codex"`, ogni worker e reviewer è un proprio processo `codex exec`, con `-m` e `model_reasoning_effort` impostati per ruolo. I valori predefiniti della sezione [`codex`](../reference/configuration.md) sono:

| Ruolo                        | Modello       | Sforzo                                      | Alternative                   |
| ---------------------------- | ------------- | ------------------------------------------- | ----------------------------- |
| Sessione (`$emet:run`)       | `gpt-6.1-sol` | `medium` (`high` durante la pianificazione) | nessuna                       |
| Worker                       | `gpt-6.1-sol` | `medium`                                    | `gpt-6.1-terra`, `gpt-6-luna` |
| Worker con una riga `Model:` | `gpt-6.1-sol` | `xhigh`                                     | `gpt-6-astra`                 |
| Reviewer, livello `medium`   | `gpt-6.1-sol` | `high`                                      | nessuna                       |
| Reviewer, livello `high`     | `gpt-6-astra` | `high`                                      | `gpt-6.1-sol`                 |
| Triage                       | `gpt-6-luna`  | `medium`                                    | `gpt-6.1-terra`               |

`emet dispatch` e `emet review-run` risolvono ogni slug rispetto a `models_cache.json`, letto dalla home dell'overlay del run e altrimenti dalla tua home Codex reale (sola lettura). Mantengono uno slug elencato lì che supporta lo sforzo; altrimenti seguono l'aggiornamento del modello, poi le alternative, poi omettono `-m`, e registrano ogni sostituzione; quando nulla si risolve, `emet review-run` fallisce prima della chiamata al modello e nomina il ruolo e gli slug elencati. Il `config.toml` dell'overlay che il run genera porta anche il `model` e il `model_reasoning_effort` risolti. Lo sforzo `ultra` non viene mai inviato. Il livello `passive` non avvia alcun reviewer.

Ritara dopo alcune ondate reali quando:

- i worker richiedono più cicli di correzione: alza `codex.models.worker.effort` o metti una riga `Model:` sul ticket rischioso;
- le revisioni delle ondate di livello `high` perdono rilievi: alza `codex.models.reviewer.high.effort`;
- il log mostra una sostituzione: Codex ha rinominato o ritirato uno slug, quindi aggiornalo.

Il run Codex reale nel [report della sonda](../research/codex-probe-report.md) ha usato lo sforzo `low` e il modello risolto più economico (`gpt-6-luna`), e il modello del reviewer è stato risolto tramite la cache.

## Perché un solo reviewer

Perché un solo reviewer a contesto pulito invece di una ventola di più punti di vista: nessun benchmark pubblico confronta direttamente le due soluzioni, ma una ventola rilegge l'intero diff una volta per ogni punto di vista e in questo repo è rimasta bloccata per oltre un'ora, mentre i resoconti di Anthropic e di terze parti sui modelli di classe Opus suggeriscono che l'aggiornamento del modello valga quanto i punti di vista aggiuntivi. Per un'ondata ad alta posta in gioco, esegui poi `/code-review ultra` a mano; `/emet` non lo invia mai da solo.

## Cosa imposti una volta, di persona

`/emet` non può cambiare queste impostazioni durante l'esecuzione:

- `model: "opusplan"` in `~/.claude/settings.json`: è ciò che fa girare le fasi 1–4 su Opus e dalla fase 5 in poi su Sonnet, senza bisogno di `/model`. `emet doctor` avvisa (senza mai modificare le tue impostazioni) se non è impostato.
- Un impegno di sessione `medium` o `high` anziché `xhigh`: i worker e il reviewer hanno già il proprio impegno a prescindere dal tuo, e un valore globale alto aggiunge per lo più costi ai turni del coordinatore (contabilità del dispatch, merge, report) che non ne hanno bisogno.
- Un `permissions.defaultMode` in grado di funzionare senza supervisione (`auto`, `acceptEdits` o `bypassPermissions`), più regole `permissions.deny` che bloccano `git push * main|master` e `git push --force *`. `emet doctor` avvisa su entrambi, perché un'ondata che si ferma su una richiesta di permesso o che può forzare il passaggio oltre il branch trunk vanifica lo scopo dell'esecuzione senza supervisione.

Sono punti di partenza, non numeri definitivi. Opus 5.5 è stato lanciato il 2026-09-22, e la scelta di impegno e modello per gli agenti di programmazione è ancora un campo attivo; ritara dopo alcune ondate reali invece di considerare questa tabella definitiva.
