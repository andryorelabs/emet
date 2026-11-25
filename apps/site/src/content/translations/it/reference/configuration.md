---
title: Riferimento della configurazione
description: Ogni chiave di emet.config.json con il suo valore predefinito e il suo significato.
seoTitle: Riferimento della configurazione di emet
sourceHash: d10a9e6169f1f7ea
---

Ogni chiave di `emet.config.json`, con il suo valore predefinito e il suo significato. La fonte di verità è [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json). I termini seguono [GLOSSARY.md](../../GLOSSARY.md). Torna al [README](../../README.md).

`emet init` scrive il file con `$schema` impostato sull'URL pubblico `https://emet.andryore.dev/schema/emet.config.schema.json`, che il sito web serve identico byte per byte alla fonte di verità, così gli editor offrono il completamento ovunque. `emet preflight` e `emet doctor` lo validano. Una chiave contrassegnata come prose-only è letta dai prompt di `/emet` (le skill `$emet:*` su Codex), non dalla CLI. Una chiave contrassegnata come deprecated è ancora accettata. Lo schema consente inoltre una chiave di testo libero `"//"` per le note (mai letta da alcuno strumento) e `"version"`, che è sempre `1`.

## language

- `conversation` (predefinito `"en"`): tag BCP 47 della lingua in cui l'agente risponde all'utente.
- `artifacts` (predefinito `"en"`): tag BCP 47 della lingua di codice, commenti, messaggi di commit, testo delle PR, ticket e documentazione.

Entrambi devono essere stringhe non vuote. Una configurazione senza sezione `language` viene caricata con entrambi a `"en"`, ed `emet init` li scrive entrambi. I prompt installati li leggono.

## pr

Come viene unita la PR di un'ondata.

```json
{ "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 } }
```

- `autoMerge` (predefinito `true`): attende i controlli della PR e la unisce; senza controlli, la unisce subito. Un controllo fallito viene corretto e inviato, fino a `maxCiFixAttempts` volte, poi la PR resta aperta per una persona. Un'ondata con qualcosa di segnalato non viene mai unita automaticamente.
- `mergeMethod` (predefinito `squash`): `squash`, `merge` o `rebase`, passato a `gh pr merge`.
- `maxCiFixAttempts` (predefinito `2`, minimo `0`): quante volte il coordinatore può tentare di correggere un controllo fallito prima di lasciare la PR aperta per una persona.

## handoff

Cosa accade dopo la chiusura di un'ondata e i limiti di dimensione della nota di handoff di un worker. Validato da `emet preflight`.

```json
{
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `maxLines` (predefinito `60`): numero massimo di righe che una nota `.emet/handoff-<ticket>.md` può avere prima che `emet handoff --check` la respinga.
- `maxChars` (predefinito `8000`, circa 2k token): numero massimo di caratteri di una nota di handoff.
- `autoChain` (predefinito `false`): dopo un'ondata pulita e unita, con altre ondate ancora da fare, avvia la successiva invece di stampare `/emet:run --dispatch <spec-id>` (`$emet:run --dispatch <spec-id>` su Codex). Su Claude Code l'avvio è `claude --bg`; sull'host Codex è un `codex exec` scollegato, che richiede `codex` alla versione `codex.minVersion` o successiva. I requisiti qui sotto sono quelli di Claude Code. Si ispeziona con `claude agents` o `claude attach emet-<spec-id>-w<n>`. Requisiti:
  1. `claude` nel PATH, con supporto a `--bg`.
  2. Un workspace fidato. `--bg` gira in modo non interattivo, quindi la finestra di fiducia non compare mai; apri `claude` in modo interattivo nel repo una volta e accettala.
  3. L'avviso di bypass accettato una volta in una sessione interattiva (`skipDangerousModePermissionPrompt`), dato che l'ondata successiva gira nel `handoff.permissionMode`, non nella modalità della sessione che la avvia.

  L'avvio avviene solo se la PR è stata unita e nulla era segnalato, e viene saltato se una sessione `emet-<spec-id>-*` è già attiva (`claude agents --json`). Se l'avvio fallisce, ripiega sulla stampa di `/emet:run --dispatch <spec-id>`.

- `afterSpec` (predefinito `"none"`, uno tra `release`, `promote`, `none`): cosa fa `/emet:run` quando l'ultima ondata di una spec è stata unita senza problemi. `promote` esegue `emet promote`: una pull request da `develop` a `main` unita con un commit di merge una volta che la CI è `pass`, e poi una pull request di sincronizzazione a ritroso solo se `main` contiene contenuti che mancano a `develop`, unita con [`pr.mergeMethod`](#pr). `release` apre la pull request di release con i passaggi dello skill `cut-release` e si ferma per una persona. `none` non fa nulla. `emet init` lo rileva (`release` con un tag `v*` e un file di workflow il cui nome contiene `release`; `promote` con un branch `develop` e senza un tag simile; altrimenti `none`), e `emet init --after-spec <mode>` lo forza. Una configurazione che non lo contiene viene caricata come `none`. `--no-promote`, passato a `/emet:run` o a `emet promote`, imposta il passaggio su `none` per quell'esecuzione.

  `afterSpec` accetta anche un elenco ordinato non vuoto di regole, `{ "paths"?: string[], "mode": "release|promote|none" }`, così che un solo repository possa rilasciare una CLI e promuovere un sito web. La modalità viene scelta in base ai percorsi che la promozione di `develop` porterebbe in `main`: vince la prima regola i cui `paths` corrispondono a tutti i percorsi modificati; altrimenti si applica la regola senza `paths` (solo l'ultima regola può ometterlo); altrimenti `none`. Anche nessun percorso modificato ricade su quella regola di ripiego. I glob usano il matcher della guardia di modifica, quindi i segmenti `[locale]` e `(group)` sono letterali. I percorsi modificati provengono da `git fetch origin main develop` e `git diff --name-only --no-renames -z origin/main...origin/develop`, quindi una rinomina conta il vecchio e il nuovo percorso. Vengono letti solo quando `afterSpec` è un elenco di regole o `deploy.check.paths` è impostato, e solo quando `repo.trunk` è `develop`; altrimenti l'elenco è vuoto. Un errore di git fa uscire `emet promote` con 1 senza aprire nulla. La forma stringa non guarda mai i percorsi.

  ```json
  {
    "handoff": {
      "afterSpec": [
        { "paths": ["apps/site/**", "docs/**"], "mode": "promote" },
        { "mode": "release" }
      ]
    }
  }
  ```

  Qui una spec che tocca solo il sito web o la documentazione viene promossa, e qualsiasi spec che tocca la CLI si ferma a una pull request di release.

- `launcher` (predefinito `auto`, uno tra `auto`, `orca`, `bg`): solo Claude Code; ignorato sull'host Codex, dove `emet launch` non apre alcuna scheda di Orca. Apre anche l'ondata in una scheda di Orca che esegue `claude attach`. `auto` interroga il runtime di Orca (`orca status`), quindi funziona anche da sessioni `claude --bg`, che non hanno `TERM_PROGRAM`; `orca` ci prova sempre; `bg` mai. L'ondata gira comunque in background, e una scheda che non si apre non ferma mai la catena. `emet launch <spec-id> --wave <n>` esegue l'intero avvio; vedi [`emet launch`](cli.md#esecuzioni-worker-e-slot).
- `permissionMode` (predefinito `bypassPermissions`, uno tra `bypassPermissions`, `auto`, `acceptEdits`): solo Claude Code; ignorato sull'host Codex, dove la sessione concatenata usa [`codex.sandbox`](#codex). Modalità di permesso della sessione concatenata. Non è ereditata dalla sessione che la avvia, perché il classificatore della modalità `auto` può negare un passaggio come `gh pr merge` e lasciare un'ondata a metà. Le tue regole `permissions.deny` continuano ad applicarsi, ma l'avviso di bypass deve essere stato accettato una volta in modo interattivo (`skipDangerousModePermissionPrompt`).

## deploy

Opzionale. Se assente, non c'è alcun controllo del deploy.

```json
{
  "deploy": {
    "check": {
      "command": "curl -fsS https://example.com/health",
      "retries": 10,
      "intervalSeconds": 15,
      "timeoutSeconds": 300,
      "paths": ["apps/site/**"]
    }
  }
}
```

- `check.command`: comando shell che termina con 0 quando il deploy è sano.
- `check.retries`, `check.intervalSeconds`, `check.timeoutSeconds`: interi positivi; il numero massimo di tentativi, l'attesa tra l'uno e l'altro e il limite di tempo complessivo. `emet deploy-check` stampa `ok`, `failed` o `timeout` e termina con 0, 1 o 3.
- `check.paths` (facoltativo): un elenco non vuoto di glob non vuoti. Con esso, un promote unito esegue il controllo solo quando corrisponde un percorso modificato; senza, ogni promote unito lo esegue.

Il controllo non dipende più da `afterSpec`. `emet promote` stampa `deployCheck: { run, reason }` e il coordinatore esegue `emet deploy-check` solo quando `run` è true: mai senza un `deploy.check` o dopo un'ultima ondata che non è pulita; su `repo.trunk` `main`, dove ogni merge fa il deploy, dopo un'ultima ondata pulita qualunque sia la modalità (anche con `--no-promote` o una spec trattenuta, ignorando `paths`); su `develop`, solo in modalità `promote` dopo un promote unito che corrisponde a `paths`. In modalità `release` il deploy attende una persona.

## verify

Facoltativo. Se assente, nessuna verifica nel browser e ogni comando si comporta come prima.

```json
{
  "verify": {
    "browser": {
      "startCommand": "bun run dev",
      "url": "http://localhost:4321",
      "paths": ["apps/site/**"]
    }
  }
}
```

- `browser.startCommand`: comando shell non vuoto che avvia il server di sviluppo dell'app. Il reviewer lo esegue e lo ferma al termine.
- `browser.url`: URL non vuoto su cui risponde l'app in esecuzione.
- `browser.paths` (facoltativo): un elenco non vuoto di glob non vuoti. Con esso, il controllo nel browser viene eseguito solo quando corrisponde un percorso modificato; senza, ogni diff revisionato è idoneo. I glob usano lo stesso matcher di `deploy.check.paths`.
- Le chiavi sconosciute sotto `verify` o `verify.browser` vengono rifiutate.

`emet assess` stampa `browserVerify: { run, reason }`, e il coordinatore compila l'asse Browser del reviewer solo quando `run` è true: il livello ha un reviewer (non `passive`), `verify.browser` è configurato, il binario facoltativo [`agent-browser`](cli.md#setup-and-audit) è nel PATH e, quando `paths` è impostato, un percorso modificato corrisponde. Altrimenti `reason` indica la prima condizione non soddisfatta e la revisione procede come prima. Un diff di sola documentazione è `passive`, quindi una modifica di solo contenuto non viene verificata nel browser. Un reviewer i cui comandi del browser falliscono due volte ripiega su Chrome DevTools MCP o segnala un riscontro `verification-gap`; non blocca mai l'ondata.

## validate

Facoltativo. Se assente, nessun controllo delle superfici accoppiate e ogni comando si comporta come prima.

```json
{
  "validate": {
    "coupledSurfaces": [
      {
        "source": "docs/{guide,reference,how-to}/**/*.md",
        "dependents": "apps/site/src/content/translations/**"
      }
    ]
  }
}
```

- `coupledSurfaces`: un elenco non vuoto di coppie. Ogni coppia ha un glob `source` e un glob `dependents`, entrambi stringhe non vuote; `source` accetta glob con parentesi graffe come `docs/{guide,reference}/**/*.md`.
- Le chiavi sconosciute sotto `validate` o in una coppia vengono rifiutate, e una voce malformata fa fallire il caricamento con un messaggio che nomina `validate.coupledSurfaces[<n>]`.

`emet validate` (`--file` e `--spec`) e il gate di esecuzione di `emet preflight` segnalano un errore `coupled-surface-split` quando un ticket le cui superfici si sovrappongono al `source` di una coppia si trova in un'ondata precedente a quella di un ticket le cui superfici si sovrappongono ai `dependents` della stessa coppia. Le modifiche a una pagina sorgente e i ticket che aggiornano ciò che ne dipende, come le traduzioni, devono uscire nella stessa ondata. La stessa ondata, o nessun ticket dei dependents, passa. Vedi [ADR-0033](../adr/0033-coupled-surfaces-ship-in-one-wave.md).

## interview

- `research` (predefinito `true`): con `true`, la Fase 1 di `/emet:run` fa cercare all'agente la risposta nel repo, nella documentazione o in fonti primarie, e spiegare perché consiglia un'opzione, prima di porre una domanda tecnica che offre delle opzioni. L'utente risponde comunque. `false` lo disattiva.

## gate

Cosa fa `emet gate` con i rilievi bloccanti aperti.

```json
{ "gate": { "onHold": "fix-and-continue" } }
```

- `onHold` (predefinito `fix-and-continue`): con `fix-and-continue`, i rilievi bloccanti aperti rispondono `hold` con `next: "fix-findings"` finché [`budgets.fixRounds`](#budgets) ha ancora round. Il gate risponde `stop` solo quando un rilievo aperto è di tipo `intent_gap`, i round di correzione sono esauriti con rilievi aperti, o la suite di integrazione fallisce una seconda volta dopo la riesecuzione delle sue spec fallite (un primo fallimento risponde `hold` con `next: "rerun-failed-specs"`). `stop` mantiene il comportamento precedente. Una CI mai eseguita (`--ci env-fault`) risponde `hold` con `next: "rerun-ci"` senza intaccare `pr.maxCiFixAttempts`, poi `next: "report-infrastructure"` la seconda volta di fila.

## budgets

Tutti facoltativi.

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "fixRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts` (predefinito `2`, minimo `1`): quante volte un ticket può fallire `verify` prima che il gate risponda `defer`. Il ticket riceve l'etichetta deferred e il resto dell'ondata prosegue. Un guasto ambientale, come il comando di test che esce con 126/127 o un'interruzione del provider, mette in pausa l'esecuzione senza consumare un tentativo.
- `reviewRounds` (predefinito `2`, minimo `1`): quanti round di review/correzione riceve un ticket prima di una sola escalation al livello di modello successivo. Ciò che resta aperto dopo riceve una decisione.
- `fixRounds` (predefinito `2`): quanti round di correzione riceve un'ondata con [`gate.onHold`](#gate) `fix-and-continue`. Ognuno termina con `emet review --recheck` e conta qui, mai contro `reviewRounds`. Senza round rimasti e con un rilievo bloccante aperto, il gate risponde `stop`. Un registro scritto senza questo campo risulta con `0` usati.
- `stallNudgeCap` (predefinito `6`, minimo `1`): quante volte un worker bloccato viene sollecitato. Il conteggio non si azzera mai.

## models

Modello e impegno per ruolo per l'host Claude Code; l'host Codex legge invece [`codex.models`](#codex). Ogni chiave è facoltativa; omettendo la sezione restano worker `sonnet`/`medium` e reviewer `opus`/`medium`. L'impegno è uno tra `low`, `medium`, `high`, `xhigh`, `max`.

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  }
}
```

- `worker.model` (predefinito `sonnet`), `worker.effort` (predefinito `medium`): il worker. La riga `Model:` di un ticket sostituisce `worker` solo per quel worker.
- `reviewer.medium` e `reviewer.high` (predefiniti `opus`, `medium` ciascuno): il reviewer per ogni livello di rischio restituito da `emet assess`. Alza `reviewer.high.effort` (per esempio a `high`) per maggiore attenzione sulle ondate rischiose.
- `triage` (predefinito `haiku`): il modello economico per il triage dei log di CI e per la review di livello passive. Un controllo fallito viene passato a un agente su questo modello, che restituisce al massimo circa 2k token con riferimenti `file:line`.
- `escalation` (predefinito `{ "sonnet": "opus" }`): il livello di modello successivo per ogni nome di modello, usato quando un ticket raggiunge il suo limite di correzioni.

## agentHost

`agentHost` (predefinito `"claude"`): l'host dell'agente in cui gira un'esecuzione, `"claude"` o `"codex"`. Vedi la [guida a Codex](../how-to/use-codex.md).

## codex

Letto solo quando `agentHost` è `"codex"`. Tutte le chiavi sono facoltative. Lo sforzo è uno tra `low`, `medium`, `high`, `xhigh`, `max`; `ultra` non è mai accettato.

- `models.worker`, `models.workerOverride`, `models.reviewer.medium`, `models.reviewer.high`, `models.triage`: ognuna è `{ "model", "effort", "fallback" }`. `fallback` elenca gli slug provati in ordine quando `model` manca dalla cache dei modelli di Codex. I valori predefiniti sono in [Modelli e sforzo](../how-to/choose-models.md).
- `models.session`: `{ "model", "effort", "planEffort", "fallback" }` per la sessione che esegue `$emet:run`. `planEffort` vale fino alla prima approvazione.
- `effort`: se impostato, sostituisce lo sforzo di tutti i ruoli.
- `minVersion` (predefinito `0.167.0`): la versione più vecchia della CLI `codex` supportata da emet. `emet doctor` non confronta con essa la versione installata.
- `sandbox` (predefinito `danger-full-access`): la modalità sandbox passata come `-s` da `emet dispatch`, `emet review-run` e da un `emet launch` Codex. Anche `workspace-write` è accettato, ma rende `.git` di sola lettura, quindi i worker non possono fare commit. Qualunque sia il valore, `emet guard` nega `git push` su Codex, e il `config.toml` dell'overlay generato contiene solo il marketplace e il plugin emet, tabelle trusted per le directory proprie del run e il modello e lo sforzo risolti (mai le tue tabelle). Vedi la [guida a Codex](../how-to/use-codex.md) e [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md).

## review

```json
{ "review": { "highRiskPaths": [], "dual": "auto" } }
```

- `highRiskPaths` (predefinito `[]`): sottostringhe di percorso aggiuntive, senza distinzione tra maiuscole e minuscole, che impongono il livello di review `high` in `emet assess`, oltre all'insieme integrato (autenticazione, sicurezza, pagamenti, webhook, CI, l'installer, lockfile, migrazioni e sink pericolosi come SQL grezzo o pipe-to-shell).
- `dual` (`"auto"` o `"off"`, predefinito `"auto"`; `emet init` non lo scrive): controlla la Dual review. Con `auto`, un'ondata `high` sull'host Claude Code con il binario `codex` nel PATH esegue in parallelo due reviewer, il reviewer Claude e `emet review-run`, sullo stesso pacchetto. Il coordinatore unisce i loro rilievi con `emet review --merge`, valuta ogni rilievo di un solo reviewer (lo tiene, oppure lo scarta con `emet review --rule`) e registra solo i verdetti di copertura del reviewer Claude. `off` esegue sempre un solo reviewer. `emet assess` stampa la decisione come `dualReview: { run, reason }`.

## memory

```json
{ "memory": { "enabled": "auto" } }
```

- `enabled` (`"auto"` oppure `"off"`, predefinito `"auto"`): controlla [`emet memory`](cli.md#esecuzioni-worker-e-slot). Con `auto`, il comando usa Engram quando il binario `engram` è nel PATH e il suo handshake riesce. `off` fa sì che `emet memory search` e `emet memory save` stampino `{available: false, reason: "memory.enabled is off"}` ed escano con 0 senza avviare `engram`. Qualsiasi altro valore fallisce al caricamento con `"memory.enabled" must be one of auto|off`.

## landing

- `mode` (predefinito `pr`): `pr` apre una pull request (richiede `gh`). `merge` unisce il branch di integrazione nel trunk locale con `emet land` e non fa mai push, con `commands.selfCheck` al posto della CI. Indipendente dal tracker. Vedi [ADR-0010](../adr/0010-local-merge-landing.md).
- `unit` (predefinito `spec`): `spec` integra ogni ondata nel branch `spec/<id>` con `emet spec-branch integrate` e fa atterrare la spec una volta con `emet spec-branch land`; `wave` fa atterrare ogni ondata da sola, come prima. Qualsiasi altro valore fallisce al caricamento con `"landing.unit" must be one of spec|wave`. `spec` richiede `worktree.baseRef: "head"` nelle impostazioni di Claude Code (un'impostazione dell'harness, non una chiave di emet), che `emet preflight` ed `emet doctor` verificano. Vedi [ADR-0037](../adr/0037-landing-per-spec.md).
- `specMergeMethod` (predefinito `merge`): come viene unita la PR della spec: `merge`, `squash` o `rebase`. `merge` mantiene un merge commit per ondata, quindi un'ondata può essere annullata con un revert; `squash` e `rebase` si adattano a un trunk che non consente merge commit, al prezzo di quel revert. Ignora `pr.mergeMethod`. `emet doctor` avvisa quando le impostazioni del repository o il ruleset del trunk non consentono il metodo scelto.
- `pushSpecBranch` (predefinito `true`): fa push di `spec/<id>` dopo ogni `emet spec-branch integrate`, senza aprire una PR. Imposta `false` per tenere il branch locale fino al landing finale.

## tracker

Con quale issue tracker parla `/emet` (o `$emet` su Codex). La CLI legge `kind` per decidere quali controlli sulle dipendenze si applicano; il resto documenta l'adattatore seguito dal comando `/emet` (vedi [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md)).

- `kind` (obbligatorio): `linear`, `github` o `local`. Per `local`, vedi [Tracker locale](cli.md#tracker-locale) e [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
- `transitions.onStart`, `transitions.onPrOpen`, `transitions.onPrMerge`: chi scrive ogni transizione di stato del ticket: `worker`, `coordinator` o `automatic` (lo fa l'integrazione del tracker, per esempio l'integrazione GitHub di Linear all'apertura o al merge di una PR). Il coordinatore non scrive mai una transizione contrassegnata come `automatic`.
- `github.priorityLabels`: associa un livello di priorità (`"1"` = P0 la più alta fino a `"4"` = P3) al nome di un'etichetta GitHub, per esempio `{"1":"P0","2":"P1"}`. Se non ne è dichiarata nessuna, i ticket sono ordinati per `createdAt` crescente e `emet doctor` lo segnala.
- `github.stateLabels`: associa uno stato del workflow (`todo`, `in-progress`, `in-review`) al nome di un'etichetta GitHub, per esempio `{"todo":"status:todo"}`. `done` e `canceled` sono dedotti dallo stato chiuso dell'issue e da `state_reason`.
- `linear`: impostazioni specifiche di Linear (chiave del team, nomi degli stati del workflow). Lette solo dal modello che segue `docs/agents/issue-tracker.md`, mai dalla CLI.
- `local.idPrefix` (deprecated): gli id dei ticket locali sono ora `<feature-slug>-<NN>`.
- `readyLabel`, `triageLabels`, `prReference` (deprecated): modelli di etichette e di riferimenti alle PR, per esempio `Closes #{number}` (github) o `Refs: {id}` (linear).

## preflight

- `requiredFiles` (predefinito nessuno): file che `emet preflight` richiede nella radice del repo prima che un'ondata venga inviata, ciascuno `{ "path", "why" }`; `why` compare nel messaggio di errore. Vuoto significa che il controllo non viene eseguito.
- `requiredCommands` (predefinito nessuno): binari che devono risolversi nel PATH prima del dispatch. `emet preflight` fallisce con uscita 1 indicando quelli che non si risolvono, e `emet doctor` li segnala. È l'elenco proprio del repo, separato dai [controlli sulle dipendenze](dependencies.md#cosa-controlla-cosa) guidati dal tracker; `gh` ha già un controllo dedicato, quindi elencarlo è facoltativo. Aggiunte comuni: `rg` e `sg`.

## specs

- `dir` (predefinito `docs/specs`): directory relativa al repo delle spec vive, scritte da `emet spec-merge` quando `enabled` è true.
- `enabled` (predefinito `false`): attiva le spec vive. Sull'ultima ondata di una spec, il coordinatore scrive i delta dei requisiti dagli elementi S# della spec, esegue `emet spec-merge` e fa il commit di `specs.dir` con quell'ondata, così l'aggiornamento viene sottoposto a review e arriva insieme ad essa.

## map

- `path` (predefinito `docs/agents/codebase.md`): percorso relativo al repo della mappa generata da `emet map`.

## concurrency

- `waveSize` (predefinito `4`, minimo `1`): numero massimo di chiamate Agent inviate insieme in un'ondata.
- `maxLiveWorkers` (predefinito `auto`): limite globale condiviso da ogni coordinatore `/emet` in esecuzione su questo host, in ogni repo. Il pool di slot sta sotto `~/.local/state/emet/slots`, non in un singolo repo. `auto` ricava il limite dal numero di CPU e dalla RAM dell'host; un intero positivo lo fissa. Un controllo separato del margine di memoria (`EMET_MEM_RESERVE_GIB`, predefinito 8 GiB) nega un acquire quando la memoria disponibile è troppo bassa, a prescindere da questo limite. La variabile d'ambiente `EMET_MAX_LIVE_WORKERS` sostituisce questo campo e accetta anch'essa `auto`.
- `runIdleThresholdMs` (predefinito `5400000`, 90 minuti): per quanto tempo un'esecuzione senza ancora attiva viene ancora classificata come inattiva anziché morta, in base alla sola freschezza della trascrizione. La variabile d'ambiente `EMET_RUN_IDLE_THRESHOLD_MS` la sostituisce.

Vedi [Variabili d'ambiente](cli.md#variabili-dambiente).

## ticket

- `idPattern`: sorgente di una regex ancorata a cui deve corrispondere l'id di un ticket, per esempio `^PROJ-\d+$`. Un pattern non valido è un errore di configurazione grave.
- `branchPrefix`: prefisso in minuscolo (`^[a-z0-9-]+$`) per il branch locale di un worker. I branch sono `<branchPrefix>-<number>-<slug>`, e `cleanup` scansiona il glob `<branchPrefix>-*`.
- `idExample` (deprecated, prose-only): un id di esempio che corrisponde a `idPattern`.
- `branchPattern` (deprecated, prose-only): modello completo del nome del branch.

## commands

Tutti prose-only.

- `selfCheck`: comandi che un worker esegue prima di considerare finita la sua modifica, per esempio `["npm run check"]`. Con `landing.mode` `merge` sostituisce la CI.
- `workerScopedSuite`: comando che un worker esegue per testare solo l'area toccata. `emet verify` ne richiede il superamento.
- `fullSuite.run`: comando per la suite dell'intero repo, eseguito una volta sul branch di integrazione dopo l'unione dei branch di un'ondata. Un'esecuzione rossa blocca la PR e `autoChain`.
- `fullSuite.singleton`: `true` se solo un worktree alla volta può eseguire la suite.
- `fullSuite.runInBackground`, `fullSuite.reset` (deprecated): flag per l'esecuzione in background e comandi di ripristino dello stato.

## worktree

- `lockReason`: modello per il motivo del `git worktree lock` che un worker scrive al bootstrap, compilato da `emet lock-reason`. Il valore predefinito è `emet run={runId} ticket={ticket} anchor={anchorPid} slug={coordinatorSlug} at={iso}`. Sostituiscilo solo per aggiungere campi: `emet lock-reason` rifiuta un modello che elimina il token letterale `emet` oppure uno tra `run=`, `ticket=`, `anchor=`, `at=` o `slug=`.
- `copyFromMain` (prose-only): percorsi copiati dal checkout del trunk in un worktree nuovo prima del bootstrap, per esempio file env non tracciati.
- `bootstrap` (prose-only): comandi di shell eseguiti una volta in un worktree nuovo prima dell'avvio di un worker, per esempio `["npm ci"]`. Eseguiti dalla fase 6 di `/emet`, mai dalla CLI.
- `stateDir` (deprecated, prose-only): directory per i log locali dell'esecuzione, per esempio `.emet`.

## usage

- `oversizedReadLines` (predefinito `400`, minimo `1`): una Read senza offset né limite su un file con più di questo numero di righe conta come sovradimensionata in `emet usage`.
- `stalledMinutes` (predefinito `10`, minimo `1`): soglia predefinita di `--minutes` per `emet usage --stalled`.

## sizing

- `inlineMaxLines` (predefinito `100`, minimo `1`): il corpo di ticket più grande, in righe, mantenuto inline nel prompt di un worker.

## attention

- `alert` (booleano, predefinito `true`): quando una sessione entra in `needs-decision`, emet lancia un solo avviso. Se `orca status --json` segnala un runtime raggiungibile, segna il worktree come non letto in Orca; altrimenti esegue `notify-send` quando è nel PATH; altrimenti non fa nulla. Ogni chiamata ha un timeout di 3 s e un errore non cambia mai il risultato di un hook. Uscire da `needs-decision` non cancella il segno non letto di Orca. Imposta `false` per disattivare l'avviso.

```json
{ "attention": { "alert": true } }
```

Vedi [`emet fleet status`](cli.md#setup-and-audit).

## schema

Prose-only. La proprietà degli schemi di dati di questo repo, usata dalla regola di prevenzione dei conflitti della fase 3 quando si dividono i ticket. Vuoto od omesso salta la regola.

- `ownedPaths`: percorsi che definiscono lo schema condiviso, per esempio `["prisma/schema.prisma"]`. Al massimo un worker per ondata può toccarli.
- `sharedDatabase` (deprecated): `true` se i worker condividono un unico database fisico.

## commit

Prose-only.

- `trailer`: chiave del trailer git che un worker aggiunge ai commit che fanno riferimento al ticket, per esempio `Refs`.
- `trailerPosition`: `body` o `footer`.

## repo

- `trunk`: il branch verso cui confluiscono le modifiche di ogni worker e la base di ogni confronto git di cleanup e preflight, per esempio `main`.
- `remote` (predefinito `origin`): il remote git su cui risiede `trunk`.
- `integrationBranch` (deprecated, prose-only): branch facoltativo di lunga durata su cui un'ondata si integra prima del trunk.
- `commitTypes` (deprecated, prose-only): tipi di Conventional Commit consentiti per i commit dei worker.

## design

Facoltativo, prose-only. `null` od omesso salta il passaggio di review di design/UI.

- `canvasIndex` (deprecated): percorso di un file canvas di design che i worker controllano prima delle modifiche all'interfaccia.

## Variabili d'ambiente

La CLI legge queste variabili, tutte tramite `emet/src/env.ts`. Una variabile con grafia `FORGE_` funziona ancora come ripiego per il suo nome `EMET_` e stampa un avviso una sola volta. I valori vuoti contano come non impostati. `tools/env-docs.test.ts` mantiene allineati questa tabella e il codice.

| Variabile                     | Ripiego legacy                 | Significato                                                                                                                                                      |
| ----------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_MAX_LIVE_WORKERS`       | `FORGE_MAX_LIVE_WORKERS`       | Limite di worker attivi contemporaneamente: un numero positivo o `auto`. Sostituisce `concurrency.maxLiveWorkers`.                                               |
| `EMET_STATE_DIR`              | `FORGE_STATE_DIR`              | Directory di stato a livello di host, che contiene il pool di slot dei worker.                                                                                   |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `FORGE_SKIP_DEPENDENCY_CHECKS` | Impostala a `1` per declassare ad avvisi i controlli di dipendenze bloccanti in `emet preflight`.                                                                |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | `FORGE_RUN_IDLE_THRESHOLD_MS`  | Millisecondi per cui la trascrizione di un'esecuzione può restare silenziosa prima di essere considerata inattiva. Sostituisce `concurrency.runIdleThresholdMs`. |
| `EMET_CPU_OVERSUBSCRIBE`      | `FORGE_CPU_OVERSUBSCRIBE`      | Fattore di sovrasottoscrizione della CPU per il limite automatico di worker.                                                                                     |
| `EMET_MEM_RESERVE_GIB`        | `FORGE_MEM_RESERVE_GIB`        | GiB di memoria mantenuti liberi prima di concedere uno slot di worker.                                                                                           |
| `EMET_MEM_PER_WORKER_GIB`     | `FORGE_MEM_PER_WORKER_GIB`     | GiB di memoria presunti per worker dal limite automatico di worker.                                                                                              |
| `EMET_AGENT_HOST`             |                                | Impostala a `codex` quando si esegue sotto l'host agente Codex; qualsiasi altro valore indica Claude.                                                            |
| `EMET_AUTO_UPDATE`            |                                | Impostala a `0` per disattivare `emet self update --auto` in un'installazione standalone.                                                                        |
| `EMET_RELEASE_BASE_URL`       |                                | Radice di download per `emet self update`: le risorse vengono lette da `<root>/vX.Y.Z` o `<root>/latest`.                                                        |
| `CODEX_HOME`                  |                                | La home directory di Codex; predefinita `~/.codex`. Viene solo letta.                                                                                            |
| `XDG_STATE_HOME`              |                                | Base della directory di stato quando `EMET_STATE_DIR` non è impostata.                                                                                           |
| `NO_COLOR`                    |                                | Se impostata, il banner viene stampato senza colore.                                                                                                             |
| `FORCE_COLOR`                 |                                | Qualsiasi valore tranne vuoto o `0` forza un banner a colori, anche senza TTY.                                                                                   |
| `TERM`                        |                                | `dumb` disattiva il colore del banner.                                                                                                                           |
