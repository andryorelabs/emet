---
title: Novità
description: Note di rilascio di emet: cosa è cambiato in ogni versione.
seoTitle: "Novità di emet: note di rilascio"
sourceHash: 7cd403f7cf42abea
---

## 0.23.0

2026-11-28

### Modificato

- La home page del sito web è riprogettata sul prototipo v17, con un harness di parità (`bun run --cwd apps/site parity`) che confronta ogni sezione con il suo riferimento e registra ogni differenza visibile.
- L'animazione di merge del sito web riceve un overlay «light in the water», e un giro di revisione corregge il layout bento della home, il contrasto delle schede della documentazione e il footer.
- Le dipendenze di sito web, strumenti e toolchain sono alle ultime versioni: Astro 7, Starlight 0.43, `@types/node` 26, `eslint-plugin-unicorn` 80, oxlint 1.95, oxfmt 0.80, bun 1.4.5, node 26.13.1 e zizmor 1.33.1.
- La CLI `emet` resta invariata, a parte la versione.

### Corretto

- I link dei passaggi di pagina del sito web usano il colore del testo invece del blu del browser.
- Lo smoke test dell'immagine del sito web non fallisce più a caso con `curl` in pipe verso `grep -q`.

## 0.22.2

2026-11-25

### Modificato

- Le parti interattive del sito web (menu dell'intestazione, menu mobile, ricerca, menu delle azioni di pagina, FAQ, schede di installazione, pagina 404 e pillola di annuncio) sono isole React su shadcn `base-nova`, idratate alla prima interazione.
- `bun run lint` controlla i file `.tsx` con `@shadcn/lint`, e la soglia di copertura e knip ignorano il livello vendorizzato `apps/site/src/components/ui`.
- La CLI `emet` resta invariata, a parte la versione.

### Corretto

- La FAQ del sito web non genera più una violazione della Content-Security-Policy: i due valori di stile inline che renderizza sono consentiti tramite hash.
- Le domande della FAQ mantengono un contorno di focus visibile in modalità colori forzati.
- Il menu della lingua continua a funzionare senza script tramite un semplice elenco di link.

## 0.22.1

2026-11-25

### Corretto

- `emet promote` apre la pull request di sincronizzazione da `main` a `develop` solo quando `main` contiene contenuto che manca a `develop`, quindi un `develop` solo squash non accumula più, dopo ogni promote, una pull request di sincronizzazione non fondibile. Quando differiscono solo i commit di merge, non si apre nulla e `syncReason` ne indica il motivo.
- La pull request di sincronizzazione viene fusa con `pr.mergeMethod` invece che con un commit di merge.
- `emet promote --hold` scrive il suo marcatore in `<git common dir>/.emet/runs/<id>/no-promote` invece che in una directory `promote hold marker`. I marcatori nelle vecchie posizioni trattengono ancora lo spec.

## 0.22.0

2026-11-24

### Aggiunto

- Il binario `emet` incorpora l'albero di installazione (comandi, agenti, prompt di riferimento, hook, skill Codex e manifest dei plugin), generato in fase di build e verificato contro la deriva da `bun run check`, quindi un binario compilato non richiede alcun checkout.
- `emet self install [latest|X.Y.Z] [--dry-run] [--from <checkout>] [--force]` installa il binario standalone in `~/.local/share/emet/versions/<v>/` con il link simbolico `~/.local/bin/emet`, scrive i file di Claude Code e unisce gli hook di emet in `~/.claude/settings.json` dopo un backup, lasciando intatti gli hook di terze parti. Si rifiuta di procedere quando il plugin emet è installato, a meno che non venga passato `--force`. `--from` riproduce l'installazione da sorgenti Bun.
- L'adattatore Codex di `emet self install` scrive le skill di emet in `~/.agents/skills` e aggiunge gli hook incorporati a `$CODEX_HOME/hooks.json`, senza mai scrivere `config.toml`, e stampa il passaggio di attendibilità `/hooks` da eseguire una sola volta. L'overlay del worker Codex omette le tabelle del plugin emet quando rileva un'installazione standalone.
- `emet self update [latest|X.Y.Z]` e `emet self update --auto` scaricano la release, verificano `SHA256SUMS` (e l'attestazione quando `gh` è presente) e la preparano. Lo scambio attende finché nessuno slot worker è occupato. `--auto` viene eseguito da un hook `SessionStart` al massimo una volta al giorno.
- `scripts/install-remote.sh`, allegato a ogni release come `install.sh`, scarica il binario, ne verifica il checksum ed esegue `emet self install`: `curl -fsSL https://emet.andryore.dev/install.sh | sh`.
- `emet doctor` avvisa quando l'installazione standalone e il plugin coesistono, quando i file installati divergono dall'albero incorporato, quando un hook Codex non ha una voce `trusted_hash` e quando un aggiornamento è in sospeso o l'aggiornamento automatico è disattivato.
- `docs/reference/stability.md` è pubblicato e `docs/specs/translations.md` è una nuova spec vivente.

### Modificato

- La documentazione è ristrutturata in cinque gruppi, Per iniziare, Concetti, Guide pratiche, Riferimento e Aiuto, in tutte e dieci le lingue. Ogni percorso pubblicato prima di questa release reindirizza al nuovo percorso, e `/docs/` reindirizza a `/docs/start/overview/`.
- `start/overview`, `start/install` e `start/first-run` contengono le uniche istruzioni di installazione. L'installazione standalone viene per prima e i plugin sono indicati come facoltativi.
- Le pagine dei Concetti spiegano il loro argomento senza tabelle di configurazione, `concepts/landing` afferma che una spec viene integrata come un'unica pull request per impostazione predefinita, e `concepts/architecture` elenca ogni modulo non di test di `emet/src`. Le pagine delle guide pratiche sono passaggi operativi con prerequisiti e una verifica del risultato, e `reference/cli` ha un titolo per ogni comando.
- La home del Website mostra una pull request per spec e copre la modalità veloce, la memoria, la doppia revisione, gli avvisi di attenzione e l'installazione reversibile.
- `emet uninstall` rimuove anche gli artefatti standalone: la directory delle versioni, il link simbolico, il file di stato dell'installazione, le skill e gli hook Codex, e ogni comando hook di emet in entrambi i file di hook. I file modificati e gli hook di terze parti vengono mantenuti.
- Ogni pagina pubblicata tranne `whats-new` ha una traduzione aggiornata in ciascuna delle nove lingue, inclusa la nuova pagina `reference/stability`.

### Rimosso

- `install.sh` non esiste più. `emet self install` e il comando `curl` lo sostituiscono, e i controlli delle dipendenze e i rimedi di doctor rimandano a questi.

## 0.21.0

2026-11-23

### Aggiunto

- `emet setup --dry-run` (combinabile con `--with`, `--yes` e `--json`) stampa i passi pianificati di ogni elemento scelto, oppure `already-present`, e non cambia nulla: non esegue alcun comando e non scrive alcun file né voce del registro.
- `emet setup` annota nel registro di setup, `setup-ledger.json` nella directory di stato, ogni elemento che termina `installed`, con i record di annullamento necessari per ripristinarlo. Le scritture del registro sono atomiche, e un registro malformato è un errore che ne indica il percorso.
- `emet setup --restore <id>` ripristina `claude-settings` (il `model` precedente e le regole deny aggiunte da emet, dopo un backup con timestamp) o `firecrawl-local` (la voce MCP precedente a livello utente). Qualsiasi altro id esce con 2, e un id senza voce nel registro esce con 1.
- `emet uninstall [--dry-run] [--yes] [--purge] [--json]` rimuove un'installazione di `install.sh`: i file del manifest il cui hash corrisponde ancora, lo shim, ogni hook `emet guard` in `~/.claude/settings.json` (dopo un backup con timestamp) e gli extra del registro di setup. I file modificati vengono mantenuti ed elencati. Per le installazioni globali brew, bun e cargo stampa il comando di rimozione e non lo esegue mai.
- `./install.sh --uninstall [flags]` esegue `emet uninstall`.
- `docs/reference/cli.md` e `README.md` documentano il registro di setup, `--dry-run`, `--restore` e `emet uninstall`, in tutte e nove le lingue.

## 0.20.0

2026-11-22

### Aggiunto

- `emet guard` registra un evento di journal `session.attention`, `{sessionId, state, from, trigger}`, quando una sessione di proprietà di emet passa tra gli stati `working`, `idle`, `needs-decision` e `ended`. Un evento viene aggiunto solo se lo stato è diverso dall'ultimo registrato per la sessione. Il journal non memorizza mai il testo delle notifiche, i prompt o l'input degli strumenti, e la registrazione non cambia mai il verdetto, lo stdout o l'exit code di guard.
- `hooks/hooks.json` e `install.sh` collegano gli eventi hook `Notification`, `PermissionRequest`, `SessionEnd` e `UserPromptSubmit` a `emet guard --event <Event>`. `install.sh` resta idempotente. `codex/hooks.json` non cambia.
- Il JSON di `emet status` aggiunge `sessions: [{sessionId, state, blocked, since, runId}]`, l'ultimo stato di ogni sessione del repo nelle ultime 24 ore, escluse quelle `ended`. Una sessione bloccata porta lo stato complessivo a `needs-decision` ed è citata nella riga di riepilogo e in `--brief`.
- `emet fleet status [--json]` stampa gli ultimi stati delle sessioni per repo dal journal globale, con i repo bloccati per primi.
- Alla transizione verso `needs-decision`, emet genera un solo avviso: un contrassegno di non letto e un commento sul worktree Orca del repo quando Orca è raggiungibile, altrimenti `notify-send` se è nel PATH. `attention.alert` (booleano, predefinito `true`) viene aggiunto agli schemi di configurazione e lo disattiva.
- `docs/reference/cli.md`, `docs/reference/configuration.md` e `docs/guide/fleet.md` documentano le funzioni di attenzione delle sessioni, in tutte e nove le lingue.

## 0.19.0

2026-11-22

### Aggiunto

- `emet memory search --json <query> [--limit <n>]` e `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <outcome>` leggono e scrivono Lessons in Engram. `search` tiene le note la cui topic key inizia con `emet/<repo>/lessons/` e ne stampa il contenuto completo, `save` aggiunge una sezione per run alla nota della spec o della quick run, da 1 a 5 punti elenco su stdin. Entrambi stampano un solo oggetto JSON, terminano con exit 0 per ogni problema di Engram e con exit 2 solo per un uso errato.
- `memory.enabled` (`auto` oppure `off`, predefinito `auto`) viene aggiunto agli schemi di configurazione. `off` non avvia mai `engram`.
- La Phase 1 cerca in memoria le Lessons precedenti prima del primo giro di interviste e scrive quelle rilevanti sotto `## Prior lessons` nel file del piano. I passaggi di consegna della wave e della quick run salvano le Lessons della run prima del report finale. `--draft` non salva nulla.
- `docs/reference/cli.md` e `docs/reference/configuration.md` documentano `emet memory` e `memory.enabled`, in tutte e nove le lingue.

### Modificato

- La build Codex rifiuta `mcp__engram` in un riferimento generato, così i nomi degli strumenti Engram non raggiungono mai il plugin Codex.
- I prompt di `/emet:run` ottengono i passi di memoria descritti sopra; senza `engram` nel PATH, o con `memory.enabled: "off"`, ogni passo è una nota di una riga e la run prosegue come in 0.18.0.

## 0.18.0

2026-11-22

### Aggiunto

- `emet review --ticket <t> --coverage <file|-> [--expect S1,S3]` salva i Coverage verdicts nel ledger. Un verdetto `met` il cui test manca o non si trova nell'albero di lavoro, e un S# atteso senza verdetto, aprono ciascuno un finding `VG-S<n>`.
- `emet review --base <ref>` salva la base della revisione al primo giro e segna come `preexisting` un finding su una riga che la wave non ha toccato. `emet gate` non conta mai un finding preesistente come bloccante.
- I finding accettano i campi facoltativi `s`, `userOption` e `agreement`. Un finding aperto con `userOption` blocca a ogni livello e gravità, e il gate risponde `hold` con `next: "fix-findings"`. La Phase 2 scrive come `(user option)` un S# che deriva da un'opzione scelta dall'utente.
- `emet review --merge <a.json> <b.json>` unisce due array di finding in uno. Due finding si accoppiano quando condividono `s`, o condividono `file` con righe distanti al massimo 3, e ricevono `agreement: "both"` o `"single"`.
- `emet assess` stampa `dualReview: {run, reason}`, e `review.dual` (`auto` oppure `off`, predefinito `auto`) viene aggiunto agli schemi di configurazione. Sull'host Claude con `codex` nel PATH, una wave `high` esegue una Dual review: `emet:emet-reviewer` e `emet review-run --tier high --coverage-out <file>` in parallelo, poi `emet review --merge`.
- `emet review-run --coverage-out <file>` scrive i Coverage verdicts del revisore Codex, e il suo schema di output accetta `s` e `userOption` nullable.
- `docs/reference/cli.md` e `docs/reference/configuration.md` documentano le modifiche alla revisione, in tutte e nove le lingue.

### Modificato

- Il prompt del revisore e `agents/emet-reviewer.md` chiedono un file di Coverage verdicts, `.emet/coverage-<run>.json`, al posto di una riga in prosa `S<n>: met | partial | unmet`. La Phase 8 registra i verdetti con `emet review --coverage` ed elenca i finding preesistenti nel report della wave senza correggerli.
- Senza `--base`, `--coverage`, `--merge` o una Dual review, ogni comando si comporta come in 0.17.0.

## 0.17.0

2026-11-22

### Aggiunto

- `/emet:run --quick <modifica>` esegue una Quick run per una modifica che sta in un ticket: un giro di intervista, una spec con un ticket folded, un'approvazione, un worker, la revisione e il Landing di quella singola Wave come pull request (o come merge locale), senza `emet chain`. Si ferma prima dell'approvazione e raccomanda `/emet:run` senza `--quick` quando la modifica tocca una schermata o non sta in un ticket, e viene rifiutata insieme a `--draft` o `--dispatch`. Accetta `--no-promote`. I passaggi sono nel nuovo `emet/reference/phases-quick.md`. Vedi ADR-0039.
- `emet assess --quick` stampa il JSON consueto più `"quickRejected"` e termina con codice `1` quando il livello è `high`. Una Quick run lo tratta come uno Stop del Gate: nessun auto-merge, la pull request resta aperta e il rapporto finale riporta i motivi di alto rischio. Senza `--quick`, l'output e i codici di uscita restano invariati.
- `emet approve --quick` scrive `"mode": "quick"` in `approval.json`. I record scritti prima di questa modifica continuano a superare `--check`.
- `resolveLandingUnit(config, runId, root)` restituisce `wave` per un'esecuzione approvata con `--quick` e `config.landing.unit` negli altri casi. `emet landed`, `emet status` e `emet preflight` leggono l'unità di landing tramite questa funzione, così una Quick run non si aspetta mai un branch di spec.
- `emet validate` segnala un errore `no-tickets` quando un piano non ha ticket e indica di scrivere un ticket folded.
- `docs/reference/cli.md` e `docs/guide/trackers-and-landing.md` documentano la Quick run, in tutte e nove le lingue.

### Modificato

- La frase sul percorso rapido in `phases-1-5.md` ora dice di scrivere un ticket contrassegnato come `folded` per una richiesta sotto la soglia, invece di non scrivere alcun ticket.
- `emet preflight --approval <run>` ricava l'unità di landing dal record di approvazione di quell'esecuzione quando manca `--run`.

## 0.16.0

2026-11-21

### Aggiunto

- Spec vive, disattivate per impostazione predefinita. Con `specs.enabled: true`, nell'ultima wave di una spec il coordinatore scrive i delta dei requisiti `ADDED`/`MODIFIED`/`REMOVED` della spec, esegue `emet spec-merge --spec <id>` una sola volta sul branch di integrazione di quella wave prima della sua review e fa il commit di `docs/specs/<area>.md` aggiornato, così la modifica viene rivista e atterra nella stessa pull request. Un nuovo riferimento, `living-specs.md`, descrive il formato dei delta e la regola di nuovo tentativo. Vedi ADR-0038.
- `specs.enabled` (predefinito `false`) nella configurazione e in entrambe le copie dello schema. `emet init` scrive `"specs": { "dir": "docs/specs", "enabled": false }`.
- `emet doctor` avvisa, solo quando `specs.enabled` è `true`, se `specs.dir` è ignorata da gitignore o è un file. Una `specs.dir` mancante non genera un avviso.
- `emet spec-merge --spec <id> --deltas-dir` crea e stampa la directory condivisa dei delta, `<git common dir>/.emet/runs/<id>/spec-deltas`, e termina con codice `0` senza fare il merge.
- `landing.specMergeMethod` accetta `merge` (predefinito), `squash` e `rebase`, così una spec può atterrare su un trunk che consente solo merge squash. `emet doctor` avvisa quando le impostazioni del repository o il ruleset del trunk non consentono il metodo configurato. Vedi ADR-0037.
- `bun run check:codex` fallisce su un file in una directory `codex/` generata che non ha una sorgente.

### Modificato

- Con `specs.enabled` disattivato, `emet spec-merge` stampa `specs.enabled is false; nothing merged` e termina con codice `0`. Legge i delta dalla directory di esecuzione condivisa sotto il git common dir, con ripiego su `.emet/runs/<id>/spec-deltas/` del singolo checkout.
- I prompt della Fase 8 non eseguono più `emet spec-merge` dopo l'atterraggio di una wave o di una spec; `phases-8-review.md` carica invece `living-specs.md` nell'ultima wave.
- `emet spec-branch land` attende i check della pull request con lo stesso poller di `emet ci`, continuando a interrogare anche una pull request che non ha ancora check, e fa il merge con `landing.specMergeMethod`.

### Corretto

- `emet spec-branch land` non fa più il merge prima che GitHub abbia registrato dei check.
- `emet setup` elenca i plugin di Claude una sola volta invece di fino a tre, e le sue sonde silenziose scadono invece di bloccarsi.
- `emet doctor` elenca i plugin installati una sola volta per esecuzione.
- `bun run lint` e `bun run fix` generano prima i tipi Astro del sito, quindi passano su un checkout nuovo.

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
