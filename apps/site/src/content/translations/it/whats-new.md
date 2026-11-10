---
title: Novità
description: Note di rilascio di emet: cosa è cambiato in ogni versione.
seoTitle: "Novità di emet: note di rilascio"
sourceHash: 865aee0375b56c7a
---

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
