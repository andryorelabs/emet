---
title: Tracker e landing
description: Dove vivono i ticket, come un'ondata atterra come pull request o merge locale e come si concatenano le ondate.
seoTitle: Tracker e landing in emet
sourceHash: a8b11b49ae9e48ab
---

Dove vivono i ticket, come atterra un'ondata e come si concatenano le ondate. Ogni chiave citata qui è nel [riferimento della configurazione](../reference/configuration.md); ogni sottocomando è nel [riferimento della CLI](../reference/cli.md).

<img src="../brand/mascot/mascot-work.svg" alt="emet mascot, working" width="96" align="right">

## Tracker

emet funziona con Linear, GitHub Issues o file locali, in base a `tracker.kind`. Per il tracker `github` serve `gh`. Per il tracker `linear` un server MCP di Linear deve essere dichiarato in `.mcp.json` (o a livello utente); vedi il [riferimento delle dipendenze](../reference/dependencies.md).

### Tracker locale

Con `tracker.kind: "local"`, spec e ticket sono file markdown sotto `.scratch/` del worktree principale (non versionato): `.scratch/<slug>/spec.md` e `.scratch/<slug>/issues/<NN>-<slug>.md`, ciascuno con righe `Status:` e `Blocked by:` e commenti sotto `## Comments`. Il coordinatore li legge e li scrive tramite `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` lo configura. Vedi [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

## Landing

`landing.mode` è `"pr"` (predefinito) o `"merge"`, indipendente dal tracker. In modalità `merge` un'ondata atterra come un unico merge locale nel trunk con `emet land`, con `commands.selfCheck` al posto della CI e senza push. `gh` serve solo quando il tracker è `github` o il landing è `pr`. Vedi [ADR-0010](../adr/0010-local-merge-landing.md).

### PR di landing

Un'ondata è una PR. Il suo corpo contiene `Closes #N` per ogni ticket (la parola chiave di chiusura del tracker), e il coordinatore sposta i ticket in in-review quando apre la PR. La PR viene poi unita secondo `pr.autoMerge`, oppure resta aperta quando l'ondata è stata segnalata, `autoMerge` è `false` o le correzioni di CI sono esaurite (la PR riceve allora l'etichetta human-decision). Dopo un merge, `emet cleanup --run <runId>` libera i branch, i claim dei ticket e gli slot dei worker dell'ondata. Elimina anche ogni branch locale la cui PR è stata unita al commit di testa del branch, compreso il branch di integrazione.

Dopo che i branch di un'ondata sono stati uniti, `commands.fullSuite` viene eseguito una volta sul branch di integrazione. Un'esecuzione rossa blocca la PR e `autoChain`. Il gate riceve il risultato come `--integration`.

### Concatenare le ondate

Le ondate successive girano in sessioni proprie, mai in quella che ha eseguito l'ondata 1. Due sezioni facoltative di `emet.config.json` controllano cosa accade dopo (entrambe validate da `emet preflight`):

```json
{
  "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 },
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `pr.autoMerge` (predefinito `true`): attende i controlli della PR e la unisce; senza controlli, la unisce subito. Un controllo fallito viene corretto e inviato, fino a `maxCiFixAttempts` volte, poi la PR resta aperta per una persona. Un'ondata con qualcosa di segnalato non viene mai unita automaticamente.
- `handoff.autoChain` (predefinito `false`): dopo un'ondata pulita e unita, con altre ondate ancora da fare, avvia la successiva con `claude --bg` invece di stampare `/emet:run --dispatch <spec-id>`. Si ispeziona con `claude agents` / `claude attach emet-<spec-id>-w<n>`. Requisiti su Claude Code:
  1. `claude` nel PATH, con supporto a `--bg`.
  2. Un workspace fidato. `--bg` gira in modo non interattivo, quindi la finestra di fiducia non compare mai; apri `claude` in modo interattivo nel repo una volta e accettala.
  3. L'avviso di bypass accettato una volta in una sessione interattiva (`skipDangerousModePermissionPrompt`), dato che l'ondata successiva gira nel `handoff.permissionMode` (sotto), non nella modalità della sessione che la avvia.

  Sull'host Codex, l'ondata successiva parte invece come `codex exec` scollegato (vedi `handoff.launcher` sotto); il requisito è quindi `codex` nel PATH alla versione `codex.minVersion` o successiva, con `--json` e `--output-schema` su `codex exec`; `emet doctor` controlla i flag, non il numero di versione. La finestra di fiducia e l'avviso di bypass di Claude non si applicano. Se Codex richieda un workspace attendibile per un'esecuzione scollegata non è verificato nella documentazione di questo repo.

  L'avvio avviene solo se la PR è stata unita e nulla era segnalato, e viene saltato se una sessione `emet-<spec-id>-*` è già attiva (`claude agents --json`). Se l'avvio fallisce, ripiega sulla stampa di `/emet:run --dispatch <spec-id>`.

- `handoff.launcher` (predefinito `auto`): apre anche l'ondata in una scheda di Orca che esegue `claude attach`. `auto` interroga il runtime di Orca (`orca status`), quindi funziona anche da sessioni `claude --bg`, che non hanno `TERM_PROGRAM`; `orca` ci prova sempre, `bg` mai. `launcher` vale solo per l'host Claude Code; su Codex `emet launch` si comporta sempre come `bg`. L'ondata gira comunque in background, e una scheda che non si apre non ferma mai la catena.

  `emet launch <spec-id> --wave <n>` esegue l'intero avvio (controllo delle sessioni duplicate, `claude --bg`, scheda) e stampa `{ name, id, attach, orcaTab: { opened, reason } }`. Usalo, e non un semplice `claude --bg`, ogni volta che vuoi un'ondata in un'altra sessione a mano.

  Sull'Agent host Codex, `emet launch` avvia un `codex exec` staccato che esegue `$emet:run --dispatch <spec-id>` e registra il suo id di thread. Non apre nessuna scheda di Orca, e `codex exec resume <id>` riprende la sessione. Vedi il [riferimento della CLI](../reference/cli.md#host-codex) e [Eseguire emet su Codex](codex.md).

- `handoff.permissionMode` (predefinito `bypassPermissions`): solo Claude Code; modalità di permesso della sessione concatenata. Sull'host Codex viene ignorato e la sessione concatenata usa `codex.sandbox` (predefinito `danger-full-access`; vedi [Eseguire emet su Codex](codex.md)). Non è ereditata dalla sessione che la avvia, perché il classificatore della modalità `auto` può negare un passaggio come `gh pr merge` e lasciare un'ondata a metà. Le tue regole `permissions.deny` continuano ad applicarsi, ma l'avviso di bypass deve essere stato accettato una volta in modo interattivo (`skipDangerousModePermissionPrompt`).

## Gate, budget e registri

Le fasi non decidono da sole quando un ticket è finito, unibile o vale un altro tentativo. Chiamano un comando della CLI che legge un registro su disco e stampa la decisione. I registri di esecuzione stanno sotto `.emet/runs/<run-id>/` e il ledger delle review sotto `.emet/review/`, nel checkout principale, non nel worktree di un worker. Ogni comando stampa il proprio utilizzo con `--help`. La tabella dei comandi e di ciò che ciascuno impone è in [Gate e registri](../reference/cli.md#gate-e-registri).

**Budget** (`emet.config.json`, tutti facoltativi):

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts`: quante volte un ticket può fallire `verify` prima che il gate risponda `defer`. Il ticket riceve l'etichetta deferred e il resto dell'ondata prosegue. Un guasto ambientale, come il comando di test che esce con 126/127 o un'interruzione del provider, mette in pausa l'esecuzione senza consumare un tentativo.
- `reviewRounds`: quanti round di review/correzione riceve un ticket prima di una sola escalation al livello di modello successivo. Ciò che resta aperto dopo riceve una decisione.
- `stallNudgeCap`: quante volte un worker bloccato viene sollecitato. Il conteggio non si azzera mai.

## Spec vive, mappa e metriche

**Spec vive.** Dopo che un'ondata viene unita automaticamente, `emet spec-merge --spec <id>` fonde i delta dei requisiti `ADDED`/`MODIFIED`/`REMOVED` della spec in `docs/specs/<area>.md` (`specs.dir`). Controlla ogni area prima di scrivere qualcosa. Un conflitto, o un requisito che perderebbe uno scenario, esce con 1 e lascia ogni file intatto.

**Mappa del codebase.** `emet map` scrive una sintesi di un codebase esistente (stack, struttura, convenzioni, test, hotspot) in `docs/agents/codebase.md` (`map.path`), marcata con lo SHA del commit da cui è stata costruita. Lo stesso commit produce sempre lo stesso file. `emet map --stale` esce con 1 quando HEAD ha superato il marcatore, e in tal caso `emet preflight` avvisa. `emet map --for <globs>` stampa solo le sezioni che corrispondono alle superfici di modifica di un ticket. Quell'output è l'unica parte della mappa inclusa nel brief di un worker.

**Metriche.** `emet metrics --run <id>` riporta token, costo equivalente in API e tempo di esecuzione per ticket, per ondata e per esecuzione, letti dalle trascrizioni delle sessioni. Confronta inoltre il budget di contesto stimato per ticket con quello effettivamente usato da ogni worker. Il suo riepilogo va in fondo al report finale dell'esecuzione.
