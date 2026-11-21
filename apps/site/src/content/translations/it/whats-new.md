---
title: Novità
description: Note di rilascio di emet: cosa è cambiato in ogni versione.
seoTitle: "Novità di emet: note di rilascio"
sourceHash: b29bae1442d54dd2
---

## 0.15.0

2026-11-21

### Modificato

- `landing.unit` è `spec` per impostazione predefinita: le wave di una spec vengono integrate nel branch `spec/<id>` con `emet spec-branch` e la spec atterra una sola volta, come una pull request (o un merge locale con `landing.mode: merge`), invece di una pull request per wave. Usa `"landing": { "unit": "wave" }` per mantenere il comportamento precedente. La modalità `spec` richiede `worktree.baseRef: "head"` nelle impostazioni di Claude Code. Vedi ADR-0037.
- Il journal aggiunge i tipi `spec.integrate`, `spec.land` e `spec.abandon`, e `emet status` aggiunge `specBranch`.

## 0.14.5

2026-11-21

### Aggiunto

- `emet handoff --check` legge una sezione `skills:` nella nota di passaggio di un worker (`none`, oppure `loaded: a, b; missing: c`). È obbligatoria quando `state` è `done`. `--expect-skills a,b` fa fallire il controllo per ogni skill indicata che non compare in nessuna delle due liste e stampa quelle mancanti.
- Il record di dispatch porta un array opzionale `skills`, e `emet verify` lo passa a `emet handoff --check` come `--expect-skills`. Un record senza `skills` viene ancora letto.
- L'ADR-0036 permette a un ticket di cambiare la formulazione di un prompt installato quando nomina i paragrafi, e la stessa pull request alza i limiti di byte.

### Modificato

- Il prompt della fase 8 è diviso in `phases-8-review.md` e `phases-8-landing.md`. `install.sh` ritira il vecchio `phases-8-closeout.md`: una copia modificata o precedente al manifesto viene spostata in `phases-8-closeout.md.retired`, una copia non modificata viene eliminata.
- Il prompt del worker gli chiede di scrivere la riga `skills:` prima del passaggio finale.
- La pagina di architettura, il riferimento della CLI e le loro nove traduzioni descrivono i due file della fase 8 e `--expect-skills`.

## 0.14.4

2026-11-20

### Aggiunto

- `emet doctor` sull'host Codex avvisa quando il plugin emet è abilitato in `$CODEX_HOME/config.toml` ma Codex non ha considerato attendibile nessuno dei suoi hook, quindi la guardia di emet non viene eseguita. L'avviso non modifica il codice di uscita.

### Corretto

- Quando l'asset della release per la versione del plugin non può ancora essere scaricato, `bin/emet` esegue il binario in cache più recente per ogni comando, non solo per `emet guard`, e stampa un avviso che la release potrebbe essere ancora in pubblicazione. Con `EMET_PREFETCH=1` stampa l'avviso ed esce con `0` senza eseguirlo. Una checksum non corrispondente o un `SHA256SUMS` mancante continuano a non attivare mai il ripiego, e la directory di staging del download viene rimossa prima del ripiego.

## 0.14.3

2026-11-20

### Aggiunto

- `emet fleet launch --dry-run` esegue i controlli di prontezza e stampa `would launch <name>` per ogni repo senza avviare una sessione.

### Corretto

- `emet migrate` rimuove i file di esecuzione legacy di `.forge/` non tracciati che differiscono dalla copia in `.emet/` e mantiene quella di `.emet/`, così termina nei repo con log residui. Ogni conflitto che non può risolvere viene elencato insieme al passaggio manuale, e un errore di git all'interno di un repo è trattato come conflitto invece di eliminare il file.
- Il preload dei test rimuove la propria directory `emet-test-state-*` al termine dell'esecuzione, quindi `bun test` non lascia più una directory temporanea per ogni esecuzione.

## 0.14.2

2026-11-20

### Corretto

- `emet promote` attende i check della pull request di sincronizzazione e la unisce solo se passano, invece di unirla subito. Una pull request di sincronizzazione che fallisce, scade o viene rifiutata resta aperta senza far fallire il promote, e il risultato e l'evento del journal riportano `syncMerged` e `syncReason`.

## 0.14.1

2026-11-20

### Aggiunto

- `emet tracker close` chiude l'issue di specifica padre di un ticket GitHub quando il suo ultimo sub-issue viene chiuso, e riporta ogni specifica in un nuovo campo `specs`. Una lettura o chiusura della specifica non riuscita termina con `1`.
- La specifica si chiude anche quando il riepilogo dei sub-issue di GitHub non è ancora aggiornato: i sub-issue della specifica vengono contati uno per uno, inclusi i ticket chiusi nella stessa chiamata.

## 0.14.0

2026-11-20

### Aggiunto

- `emet init` imposta `schema.ownedPaths` quando trova uno schema Prisma (`prisma/schema.prisma` o `prisma/schema/`) o una cartella di migrazioni Drizzle, e rimuove il marcatore `TODO(emet):` di proprietà dello schema.
- L'elemento di setup `agent-browser` scrive `~/.agent-browser/config.json` (`contentBoundaries` e `maxOutput`) quando non esiste, ed esegue `agent-browser doctor` dopo l'installazione. Vedi ADR-0035.
- `emet setup` stampa un profilo AppArmor per il Chrome scaricato da `agent-browser`, insieme ai comandi `sudo` per caricarlo, quando l'host limita i namespace utente non privilegiati. Non esegue mai `sudo`.

### Modificato

- L'elemento di setup `firecrawl-local` registra il server MCP con `FIRECRAWL_CLOUD=search` invece di `off`, sostituisce una registrazione precedente e passa il Chrome più recente di `agent-browser` come `FIRECRAWL_CHROME_PATH`. Vedi ADR-0035.

### Corretto

- `emet setup` registra il server MCP `firecrawl-local` con il nome del server per primo, così la registrazione viene analizzata correttamente.
- `emet --help` elenca ogni comando del registro (setup, fleet, insights, chain, promote, whats-new, deploy-check, ci, run).
- I test non scrivono più nel vero journal sotto `~/.local/state/emet`.

## 0.13.0

2026-11-20

### Aggiunto

- `emet setup` offre le voci `context7` e `firecrawl-local` (entrambe disattivate per impostazione predefinita). `context7` installa la CLI `ctx7` e la sua skill `find-docs`. `firecrawl-local` compila Firecrawl Local con `cargo` e lo registra come server MCP solo locale (`FIRECRAWL_CLOUD=off`, `--public-only`). Vedi ADR-0034.
- `emet review-run --browser-verify true|false` passa l'asse del browser al revisore Codex.
- `validate.coupledSurfaces` in `emet.config.json` e l'errore `coupled-surface-split` di `emet validate` mantengono una pagina e le sue traduzioni nella stessa ondata. Vedi ADR-0033.

## 0.12.0

2026-11-20

### Aggiunto

- `verify.browser` in `emet.config.json` (`startCommand`, `url` e, facoltativamente, `paths`) abilita in un repository la verifica nel browser delle modifiche all'interfaccia con `agent-browser`. Lo schema di configurazione e il suo parser validano ogni campo.
- `emet assess` stampa `browserVerify: { run, reason }`. L'asse browser viene eseguito solo quando l'ondata ha un revisore, `verify.browser` è configurato, `agent-browser` è nel PATH e un percorso modificato corrisponde a `paths`.
- `emet setup` offre una voce `agent-browser` (disattivata per impostazione predefinita) che installa l'ultima versione e il relativo browser.
- `emet doctor` segnala un riscontro facoltativo su agent-browser per un repository che configura `verify.browser`. Un binario mancante o un `agent-browser doctor` che fallisce è una nota o un avviso e non cambia mai il codice di uscita.
- Il prompt del revisore ottiene un asse browser, compilato solo quando `browserVerify.run` è vero, e il prompt del worker ottiene una riga facoltativa per i controlli nel browser. Vedi ADR-0032.

## 0.11.1

2026-11-19

### Corretto

- Su Windows nativo (Git Bash) e su qualsiasi sistema operativo o architettura non supportati, `bin/emet` esce con 0 invece di fallire, quindi la guard PreToolUse non blocca più ogni chiamata agli strumenti. Solo il prefetch all'avvio della sessione stampa un avviso.
- `install.sh` rifiuta di essere eseguito su `MINGW*`, `MSYS*` e `CYGWIN*` prima di scrivere qualsiasi cosa.
- Gli hook di Codex includono un override `commandWindows`, quindi Codex su Windows (PowerShell) non genera più un errore a ogni evento.

## 0.11.0

2026-11-19

### Aggiunto

- `emet whats-new` stampa un avviso di una riga con un link alle note di rilascio la prima volta che emet viene eseguito dopo un aggiornamento, poi registra la versione in esecuzione. Con `--hook` emette la riga come oggetto JSON `systemMessage` per gli hook di sessione.

## 0.10.0

2026-11-19

### Aggiunto

- `handoff.afterSpec` accetta un elenco ordinato di regole `{ paths?, mode }`, così un repository con una CLI e un sito web può rilasciare la CLI e promuovere il sito web. La modalità viene scelta in base ai percorsi che la promozione di `develop` porterebbe in `main`.
- `deploy.check.paths` limita il controllo di deploy alle promozioni che hanno toccato i glob elencati.
- `emet promote` stampa e registra nel journal `rule` e `reason`, e stampa `deployCheck: { run, reason }`.

### Modificato

- Il controllo di deploy non dipende più da `afterSpec`: viene eseguito dopo una wave finale pulita sul trunk `main` e dopo una promozione unita su `develop`. Il coordinatore esegue `emet promote` dopo ogni spec, anche con `afterSpec` su `none`.

## 0.9.1

2026-11-19

### Corretto

- `emet setup` accetta `--data-dir`, quindi l'hook SessionStart del plugin non fallisce più con `unknown flag --data-dir`.

## 0.9.0

2026-11-19

### Aggiunto

- `emet gate` applica una politica di correzione e prosecuzione: una wave trattenuta esegue round di correzione finché i riscontri non sono risolti o `budgets.fixRounds` (2 per impostazione predefinita) si esaurisce, poi si ferma. `gate.onHold` sceglie `fix-and-continue` (predefinito) o `stop`. `emet review --recheck` risolve un riscontro solo tramite il verdetto di un revisore.
- `emet ci --wait` interroga i controlli di una pull request, rilancia i job instabili e riporta `pass`, `fail`, `env-fault` o `timeout`. `emet tracker close` chiude i ticket GitHub in modo idempotente, e `emet chain` esegue gate, readiness, launch e verify come un unico passo.
- Un diario degli eventi registra decisioni del gate, interventi, lanci, chiusure di ticket e pulizie, con rotazione in base alla dimensione. `emet insights` lo riassume (`--mark-baseline` reimposta la baseline), `emet run current` mostra lo spec e la wave attivi, e `emet status --brief` stampa lo stato in una riga.
- Le chiavi di configurazione `language.conversation` e `language.artifacts`.
- Le chiavi di configurazione `handoff.afterSpec` (`release`, `promote` o `none`, rilevata da `emet init` o impostata con `emet init --after-spec`), `deploy.check` e `interview.research`.
- `emet promote` apre la pull request da `develop` a `main` quando l'ultima wave è inattiva, la unisce se i controlli passano e risincronizza `main` quando `develop` è indietro. `--no-promote` trattiene uno spec in tutte le sue sessioni.
- `emet deploy-check` riprova un comando di verifica del deploy e termina i comandi bloccati.
- `emet fleet list | set | launch` esegue spec su più repository.
- `emet setup` e `/emet:setup` installano componenti opzionali da un catalogo dopo aver salvato un backup delle impostazioni di Claude. Un hook SessionStart mostra un avviso una sola volta, e `install.sh` esegue setup in un TTY.
- `emet doctor` e `emet init` raccomandano Engram senza mai contarlo come dipendenza non soddisfatta.

### Modificato

- I prompt e la documentazione installati descrivono la politica del gate, `emet ci`, `emet chain`, il diario, il passo successivo allo spec, fleet e setup. La fase 8 aggiunge un riepilogo della wave e una notifica push, e `emet insights` sostituisce il rimando a `/retro`.

### Corretto

- `--no-promote` viene conservato come marcatore nella directory git comune, così una sessione concatenata `/emet:run --dispatch` per l'ultima wave non promuove più `develop` in `main`.

## 0.8.6

2026-11-17

### Corretto

- Il workflow di release installa Chromium prima di rieseguire i controlli sul tag, come fa il job di test della CI, così la verifica non si ferma più alla soglia di copertura di `tools/`. v0.8.5 è stata taggata ma mai pubblicata per questo motivo; le sue modifiche escono in questa versione.

## 0.8.5

2026-11-17

### Modificato

- Il gate di copertura impone una soglia per file del 97 % delle righe e del 98 % delle funzioni per `emet/`, `apps/site` e `tools/`, con eccezioni motivate in `tools/coverage-exceptions.ts`. Il manifest di copertura percorre `emet/src` ricorsivamente, `tools/` è controllato e i totali di `tools/coverage-floors.json` salgono ai valori misurati.
- La guard PreToolUse fallisce in modo chiuso: quando `bin/emet` non riesce a risolvere il binario di emet, l'hook esce con 2 e blocca la chiamata allo strumento, con un messaggio che spiega come ripristinare. Gli hook Stop e SubagentStop escono ancora con 1.
- I manifest del plugin riportano l'email dell'autore, la licenza, la home page, il repository e l'URL dei bug, e le descrizioni delle skill di Codex indicano quando usare ciascuna.

### Corretto

- `emet doctor` esce con il codice 3 quando sfugge un errore inatteso, invece di 0. Un codice di uscita diverso da zero impostato prima viene mantenuto.
- `emet cleanup --all --force` recupera il worktree e i branch del worker di un'esecuzione morta, inclusi i worktree sotto `.claude/worktrees/`. Un proprietario vivo o inattivo, e un blocco che non nomina nessuna esecuzione, restano protetti.
- La guard di modifica riconosce una superficie scritta in modo letterale, come `src/app/[locale]/page.tsx`. `[` e `]` in una superficie non sono più una classe di caratteri.
- `emet preflight --post-dispatch` fallisce quando un ticket che detiene ancora una prenotazione o uno slot ha perso il suo worktree di worker, e dice al coordinatore di ri-dispatcharlo invece di riprenderlo.
- Il binario compilato di `emet` non carica più un file `.env` dalla directory corrente.
- Il sito web elimina gli attributi di stile inline della home page, dà alle etichette della home un contrasto AA in modalità chiara e nomina il pulsante di ricerca con il suo testo visibile fin dal primo rendering. Le immagini della documentazione sono servite dall'origine propria del sito sotto `repo-assets` invece che da `raw.githubusercontent.com`, e anche `astro dev` le serve.

## 0.8.4

2026-11-15

### Modificato

- L'header della home ora è composto da due gruppi ai bordi: logo e Docs a sinistra; ricerca, stelle GitHub, tema e lingua a destra. I suoi controlli e il badge della versione sono in vetro traslucido sopra il cielo, e il link duplicato a Novità non compare più nell'header e nel menu della home.

## 0.8.3

2026-11-15

### Corretto

- `/docs/` e il `/docs/` di ogni lingua ora rispondono con un 301 verso la pagina di introduzione, invece di una pagina meta-refresh che lampeggiava senza stili.

## 0.8.2

2026-11-11

### Corretto

- `emet cleanup` mantiene un branch scaffold `worktree-<name>` finché il worktree `<name>` esiste ancora, così una sessione che vi lavora su un altro branch conserva il branch che il suo host si aspetta.

## 0.8.1

2026-11-11

### Aggiunto

- `emet cleanup` elimina i branch scaffold `worktree-<name>` che l'Agent host lascia indietro, quando nessuno li ha in uso e trunk contiene già la loro testa.

### Corretto

- Il guard rifiuta un'eliminazione forzata di un branch in ogni forma che abbina un flag di eliminazione a un flag di forzatura, non solo con il flag maiuscolo.

## 0.8.0

2026-11-11

### Aggiunto

- `emet cleanup` elimina, in ogni modalità, ogni branch locale la cui pull request è stata unita al commit di testa del branch, insieme al worktree dell'agente pulito e non bloccato che lo contiene. I branch di integrazione, di release e di fix non aspettano più un'eliminazione manuale.
- `bun run translations:status` elenca le traduzioni del Website rimaste indietro rispetto alla fonte.

### Modificato

- Il rifiuto del guard a un'eliminazione forzata di un branch rimanda a `emet cleanup`.
- Il runbook di release copre le traduzioni di `whats-new`.

## 0.7.0

2026-11-11

### Aggiunto

- Il Website serve lo schema di configurazione all'indirizzo `https://emet.andryore.dev/schema/emet.config.schema.json`.
- `docs/development.md` e `docs/security.md`.
- Una soglia minima di copertura per workspace, fatta rispettare da `bun run test`.

### Modificato

- `emet init` scrive l'URL pubblico di `$schema` in `emet.config.json` invece di un percorso locale.
- I tag di rilascio sono firmati, e il workflow Release fallisce quando la sezione del CHANGELOG per il tag manca o è vuota.
- Il repository segue lo standard andryorelabs v1: ruleset come codice, file di comunità, struttura del README e nomi di script standard (`format:write`, `lint:commits`).

## 0.6.1

2026-11-10

### Corretto

- Due processi che recuperano contemporaneamente lo stesso lock scaduto non possono più entrare entrambi nella sezione critica; i claim, la Mailbox, il tracker e `acquireLock` condividono un unico recupero protetto.
- Le chiamate concorrenti a `emet tracker create-ticket` non falliscono più in modo intermittente.

## 0.6.0

2026-11-10

### Aggiunto

- Una Mailbox per i worker Codex: `emet ask` registra una domanda (e controlla la risposta con `--wait`), `emet inbox` elenca le domande aperte e `emet reply` ne risponde a una, così un worker non deve più passare da una nota di passaggio.
- `emet dispatch --wait` stampa `question <ticket> <id>` finché un worker attivo ha una domanda aperta, e non classifica mai quel worker come bloccato.
- `emet claims --reserve` memorizza le superfici di modifica del ticket e rifiuta una prenotazione che si sovrappone alle superfici di un'altra esecuzione.

### Corretto

- `emet dispatch --wait` legge i risultati dalla directory di esecuzione del git-common-dir, dove `emet results --write` li scrive.

## 0.5.2

2026-11-10

### Modificato

- L'avviso di non affiliazione nomina OpenAI oltre ad Anthropic.
- Le schede di installazione della home dicono Claude Code, e il comando di esecuzione ha una scheda Codex con `$emet:run`.
- Le guide indicano quali passaggi riguardano ciascun Agent host: Claude Code o Codex.

### Corretto

- `emet doctor`, `emet init`, `emet dependencies` e `emet preflight` non danno più consigli solo per Claude Code sull'host Codex.
- `emet init --force` mantiene `agentHost` e la sezione `codex` della configurazione esistente.

## 0.5.1

2026-11-10

### Modificato

- Il README, la home page, il banner, le guide e le immagini di condivisione nominano Codex accanto a Claude Code.

## 0.5.0

2026-11-10

### Aggiunto

- La home page del Website: hero dipinto, come funziona, funzionalità, chi
  siamo, pannello di chiusura, header e footer, con i testi in inglese in
  `apps/site/src/i18n/ui/en.ts`.
- La documentazione del Website in `/docs/`: pagine Starlight generate da una
  allowlist di documenti del repository e da questo changelog, con ricerca
  Pagefind, riscrittura dei link verso pagine del sito o GitHub e un avviso di
  ripiego in inglese per le traduzioni mancanti o obsolete.
- `docs/how-to/update-emet.md`: come aggiornare i plugin e attivare
  l'aggiornamento automatico del marketplace.
- Codex come Agent host: `agentHost` in `emet.config.json`, `emet dispatch` e
  `emet review-run` avviano ogni worker e reviewer come processo `codex exec`,
  le skill `$emet:run`, `$emet:init` e `$emet:doctor` e il manifest del plugin
  Codex, e il test end-to-end opzionale (`EMET_CODEX_E2E=1`).
- `docs/guide/codex.md`, la guida a Codex, pubblicata sul Website.

### Modificato

- Il valore predefinito di `codex.sandbox` è `danger-full-access`
  (`workspace-write` è ancora accettato), passato da `emet dispatch`,
  `emet review-run` e da un `emet launch` Codex; `emet guard` su Codex nega
  ogni forma di push.
- L'overlay Codex di ogni esecuzione scrive un proprio `config.toml` minimale
  invece di collegare il tuo, e le sue regole consentono le forme `-C` e i
  sottocomandi di coordinamento mentre il push resta vietato.
- I worker Codex sono identificati dal loro `threadId` e dal percorso del
  JSONL, non dal pid.
- La guida a Codex riporta i risultati reali con Codex: ogni riga `failed`
  precedente è `verified`, l'elenco `unverified` si riduce alla supervisione
  non presidiata e il report della sonda elenca i seguiti rimanenti.

### Corretto

- `emet cleanup` recupera i worktree atterrati senza proprietario.
- L'Agent host Codex si risolve per impostazione predefinita, quindi
  `emet preflight`, `doctor`, `cleanup`, `status` e `usage` accettano
  `agentHost: "codex"`.
- La risoluzione dei modelli Codex legge `models_cache.json` dalla home
  dell'esecuzione o dalla tua vera home Codex.

## 0.4.0

2026-11-06

### Aggiunto

- Opzione `position` di `emet-mascot` (`pane`, `band` o `status`); `pane` è
  il valore predefinito e ripiega sulla banda quando non riesce ad agganciarsi.
- Una sezione «Mascot (optional)» nel README.

### Modificato

- I frame di `emet-mascot` sono allineati ai sei colori della mascotte invece di
  essere sfocati da un ridimensionamento, così la pixel art è nitida nel terminale.
- `emet-mascot` 0.2.0: la `size` predefinita è ora `small`.
- `docs/how-to/orca-pet.md` è ora `docs/how-to/mascot.md` e tratta il mod
  e il pet di Orca.

## 0.3.0

2026-11-05

### Aggiunto

- I comandi del plugin `/emet:init` e `/emet:doctor` eseguono `emet init` ed
  `emet doctor .` dentro Claude Code e riassumono il risultato.
- `emet doctor` avvisa degli hook `forge guard` ed `emet guard` in
  `~/.claude/settings.json` il cui binario non esiste più, e stampa un comando
  che prima fa il backup e poi usa `jq` per rimuoverli. Non modifica mai il file.
- Fondamenta della mascotte: un phase file, il bundle pet, una macchina a stati
  del mod, gli altri scrittori di fase e frame raster.
- `emet-mascot`, un plugin facoltativo che mostra una mascotte in pixel art sopra il prompt
  e rispecchia la sessione e la fase dell'esecuzione di `emet`. È elencato nel
  marketplace, con una guida per il pet di Orca e l'ADR-0016.

### Corretto

- Il plugin non espone più un comando duplicato difettoso `/emet:emet`;
  `commands/` è fissato a `run.md`, `init.md` e `doctor.md`.
- L'ondata successiva ora si avvia con `/emet:run`, il comando che il plugin
  registra.

### Modificato

- Il repository è passato all'organizzazione GitHub `andryorelabs`. I download delle release,
  i badge del README e l'URL di clonazione ora puntano a
  `andryorelabs/emet`; i vecchi URL `AndryOre/emet` continuano a reindirizzare.
- Le installazioni standalone rinominano `/emet` in `/emet:run`, in linea con il plugin.
  `install.sh` ora installa `commands/run.md`, `init.md` e `doctor.md` in
  `~/.claude/commands/emet/`, così `/emet:run`, `/emet:init` e `/emet:doctor`
  sono disponibili anche senza il plugin. Il vecchio `~/.claude/commands/emet.md` viene
  rimosso se non modificato; una copia modificata viene mantenuta ed elencata nel
  riepilogo dell'installazione.

## 0.2.0

2026-11-05

### Modificato

- Il progetto passa da claude-forge a emet: la CLI è `emet`, il
  comando è `/emet`, gli agenti sono `emet-worker` ed `emet-reviewer`, e il
  README porta il nuovo marchio. Le installazioni e i repo esistenti continuano a funzionare:
  i nomi legacy (`forge.config.json`, `.forge/`, `docs/agents/forge.md`,
  `FORGE_*`) sono ancora letti con un avviso, ed `emet migrate` porta un repo ai
  nuovi nomi.

### Aggiunto

- `install.sh` funziona senza Bun: installa lo shim del binario standalone come
  `~/.local/bin/emet`, riscrive i segnaposto del plugin nei prompt che copia,
  installa `commands/run.md` come `~/.claude/commands/emet.md` e accetta
  `shasum -a 256` al posto di `sha256sum`.
- Il README indica i requisiti reali, entrambi i percorsi di installazione e
  l'ordine `/setup-matt-pocock-skills` e poi `emet init`.
- Guida per gli agenti (`AGENTS.md`), glossario del dominio (`GLOSSARY.md`) e
  architecture decision record in `docs/adr/`.
- Tracker markdown locale sulla convenzione `.scratch/`, con una CLI `emet tracker`
  (`create-spec`, `create-ticket`, `frontier`, `set-state`, `comment`,
  `close`) e con supporto locale in `emet validate`, `preflight` e `doctor`.
- `landing.mode` (`pr` o `merge`) ed `emet land`, che fa atterrare un'ondata come un unico
  merge locale senza PR; `emet cleanup` ed `emet status` confrontano con il trunk locale
  in modalità merge.
- Binari `emet` standalone, `emet --version`, supporto a macOS nella CI e nel
  freno dell'albero dei processi e della memoria, e manifesti del plugin con uno shim `bin/emet`.
- Contratto delle skill con `emet skill-path`, e un `emet doctor` più ampio che copre
  skill, glossario, deprecazioni e doppie installazioni.
- `emet init` ed `emet map` indipendenti dal linguaggio per repo JS, Go, Rust e Python.
- ADR-0007 fino a ADR-0011.
- Indice della documentazione, mappa del codice dell'architettura, risoluzione dei problemi per sintomo,
  un template di PR più ricco ed `emet/AGENTS.md` con le regole solo runtime.

### Modificato

- `gh` è richiesto solo quando `tracker.kind` è `github` o `landing.mode` è
  `pr`.
- `emet init` non seleziona più il tracker locale per impostazione predefinita.
- L'ADR-0004 è modificato: un'ondata atterra come una PR o un merge locale.

## 0.1.0

2026-11-03

### Aggiunto

- Il comando globale `/forge`: intervista, spec, ticket, una sola approvazione, poi
  agenti paralleli nei worktree che implementano, testano e uniscono una funzionalità senza supervisione.
- La CLI `forge` con i sottocomandi `init`, `doctor`, `preflight`, `selftest`, claim, slot,
  gate, controlli di handoff, risultati e metriche.
- Gli agenti `forge-worker` e `forge-reviewer`.
- Tracker per Linear e GitHub Issues.
- Configurazione per repo tramite `forge.config.json`.
- `install.sh`, che installa la CLI, il comando e gli agenti.
