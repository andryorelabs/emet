---
title: Installazione
description: Installa emet, mantienilo aggiornato e rimuovilo.
seoTitle: Installare emet
sourceHash: e67d7c2c6b22d556
---

Installa emet, mantienilo aggiornato e rimuovilo. Poi [eseguilo per la prima volta](first-run.md).

## Requisiti

Claude Code o la CLI di Codex, `git`, `gh` (autenticato) e il plugin `mattpocock-skills`, su Linux o macOS. Bun serve solo per `emet self install --from`; Windows nativo non è supportato (usa WSL). L'elenco completo, con ciò che verifica ogni voce, è nel [riferimento delle dipendenze](../reference/dependencies.md).

## Installazione

Esegui lo script di bootstrap in un terminale. Non servono Bun, clone né sudo:

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh
```

Lo script si rifiuta di girare sotto sudo, scarica il binario standalone e `SHA256SUMS` per la tua piattaforma in una directory temporanea, verifica il checksum (e l'attestazione quando `gh` è presente) e solo allora passa il controllo a `emet self install`. Se un controllo fallisce non viene scritto nulla. Non modifica il profilo della shell; se `~/.local/bin` non è nel tuo `PATH`, aggiungilo.

`emet self install` colloca il binario in `~/.local/share/emet/versions/<version>/emet` e lo collega da `~/.local/bin/emet`. Poi scrive i file di Claude Code: i prompt di riferimento in `~/.claude/emet/`, i comandi in `~/.claude/commands/emet/` e gli agenti in `~/.claude/agents/`, con i segnaposto del plugin riscritti in semplici percorsi `~/.claude`. Unisce gli hook di emet in `~/.claude/settings.json` dopo un backup e lascia in pace gli hook estranei. Quando Codex è presente scrive anche le skill di emet sotto `~/.agents/skills/emet/` e aggiunge gli hook di emet a `$CODEX_HOME/hooks.json` (predefinito `~/.codex`); non scrive mai `config.toml`. Rieseguirlo è sicuro, e un file modificato viene mantenuto, con la nuova versione scritta accanto come `<file>.new`.

Per vedere in anteprima ogni scrittura senza eseguirne alcuna, passa `--dry-run`. Gli argomenti dopo `sh -s --` arrivano a `emet self install`:

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh -s -- --dry-run
```

Puoi anche fissare una versione, come in `sh -s -- 1.2.3`; il valore predefinito è `latest`. Per installare invece da un checkout, esegui `emet self install --from <checkout>`; richiede `bun` e mantiene funzionante `emet selftest`.

### Codex

Quando Codex è presente, `emet self install` stampa un passaggio una tantum: apri `/hooks` in Codex e premi `t` nella pagina degli eventi per fidarti degli hook di emet (oppure approva il prompt "Hooks need review" all'avvio). Fino ad allora l'emet guard non viene eseguito. Vedi [Eseguire emet su Codex](../how-to/use-codex.md#installazione).

### Aggiornamento

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

La release viene scaricata, verificata rispetto a `SHA256SUMS` (e all'attestazione quando `gh` è presente) e messa in staging. Lo scambio del symlink e dei file installati avviene solo quando nessuno slot worker è occupato; altrimenti l'aggiornamento resta in sospeso e viene applicato al successivo avvio di sessione. Un errore lascia intatta la versione corrente e viene registrato nel journal. La versione precedente viene mantenuta per il rollback e quelle più vecchie vengono eliminate. `emet doctor` avvisa quando un aggiornamento è in sospeso.

### Aggiornamento automatico

Un hook `SessionStart` esegue `emet self update --auto` al massimo una volta al giorno, in background e in silenzio quando sei offline. Verifica il checksum, mette in staging la nuova versione e scambia il symlink solo quando nessuno slot worker è occupato; altrimenti l'aggiornamento resta in sospeso fino al successivo avvio di sessione. La versione precedente viene mantenuta per il rollback. Per disattivarlo, imposta `EMET_AUTO_UPDATE=0` oppure esegui `emet self update --auto off`; `emet self update --auto on` lo riattiva. L'aggiornamento automatico non fa nulla per le installazioni tramite plugin.

### Disinstallazione

```bash
emet uninstall --dry-run     # list what would be removed
emet uninstall
```

Rimuove la directory delle versioni, il symlink `~/.local/bin/emet`, il file di stato dell'installazione, le skill Codex e ogni hook di emet in entrambi i file degli hook, e ripristina gli extra che `emet setup` ha registrato. Un file di comando che hai modificato e gli hook estranei vengono mantenuti. Vedi il [riferimento della CLI](../reference/cli.md#registro-di-setup-e-ripristino).

### Opzionale: plugin

Al posto dell'installazione standalone, o per l'opzionale `emet-mascot`, puoi installare emet come plugin. `emet self install` si rifiuta di procedere mentre il plugin emet è installato e spiega come rimuoverlo; `--force` procede comunque, e `emet doctor` avvisa quando i due coesistono. Cosa include un plugin dipende dall'host dell'agente. Su Claude Code porta con sé `/emet:run`, gli agenti, gli hook di guardia e uno shim `emet` che al primo utilizzo scarica un binario standalone con checksum verificato. Il plugin Codex fornisce le skill `$emet:run`, `$emet:init` e `$emet:doctor` e un hook, ma nessun agente e nessuno shim `emet`.

:::install-tabs

```bash tab="Claude Code"
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

```bash tab="Codex"
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

:::

Ogni installazione fornisce gli stessi tre punti di ingresso. Su Claude Code sono i comandi slash `/emet:run`, `/emet:init` e `/emet:doctor`; su Codex sono le skill `$emet:run`, `$emet:init` e `$emet:doctor`. L'installazione standalone mette inoltre `emet` nel tuo `PATH`, quindi `emet init` ed `emet doctor .` funzionano in un normale terminale; con il solo plugin, usa i comandi slash, oppure `! emet <subcommand>` all'interno di una sessione di Claude Code o di Codex. Su Claude Code i nomi degli agenti differiscono: `emet:emet-worker` nel plugin, `emet-worker` standalone; Codex non ha agenti emet, perché ogni worker è un proprio processo `codex exec`.

Per aggiornare un'installazione tramite plugin, vedi [Aggiornare emet](../how-to/update-emet.md).

## Prossimo passo

[Primo avvio](first-run.md): verifica l'installazione ed esegui emet in un repo.
