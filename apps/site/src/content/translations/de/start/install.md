---
title: Installation
description: emet eigenständig installieren, aktuell halten und wieder entfernen.
seoTitle: emet installieren
sourceHash: e67d7c2c6b22d556
---

emet installieren, aktuell halten und entfernen. Danach [zum ersten Mal ausführen](first-run.md).

## Voraussetzungen

Claude Code oder die Codex-CLI, `git`, `gh` (angemeldet) und das Plugin `mattpocock-skills`, unter Linux oder macOS. Bun wird nur für `emet self install --from` benötigt; natives Windows wird nicht unterstützt (WSL verwenden). Die vollständige Liste, mit der Angabe, was jeden Eintrag prüft, steht in der [Referenz der Abhängigkeiten](../reference/dependencies.md).

## Installation

Das Bootstrap-Skript in einem Terminal ausführen. Weder Bun noch ein Klon noch sudo sind nötig:

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh
```

Das Skript verweigert die Ausführung unter sudo, lädt die eigenständige Binärdatei und `SHA256SUMS` für deine Plattform in ein temporäres Verzeichnis, verifiziert die Prüfsumme (und die Attestierung, wenn `gh` vorhanden ist) und übergibt erst dann an `emet self install`. Schlägt eine Prüfung fehl, wird nichts geschrieben. Es ändert dein Shell-Profil nicht; liegt `~/.local/bin` nicht im `PATH`, füge es hinzu.

`emet self install` legt die Binärdatei unter `~/.local/share/emet/versions/<version>/emet` ab und verlinkt sie von `~/.local/bin/emet`. Danach schreibt es die Claude-Code-Dateien: die Referenz-Prompts in `~/.claude/emet/`, die Befehle in `~/.claude/commands/emet/` und die Agents in `~/.claude/agents/`, wobei die Plugin-Platzhalter zu einfachen `~/.claude`-Pfaden umgeschrieben werden. Es führt die emet-Hooks nach einem Backup in `~/.claude/settings.json` zusammen und lässt fremde Hooks unberührt. Ist Codex vorhanden, schreibt es außerdem die emet-Skills unter `~/.agents/skills/emet/` und hängt die emet-Hooks an `$CODEX_HOME/hooks.json` an (Standard `~/.codex`); `config.toml` schreibt es nie. Der erneute Aufruf ist unbedenklich, und eine bearbeitete Datei bleibt erhalten, während die neue Version daneben als `<file>.new` abgelegt wird.

Um jeden Schreibzugriff anzuzeigen, ohne einen auszuführen, `--dry-run` übergeben. Argumente nach `sh -s --` erreichen `emet self install`:

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh -s -- --dry-run
```

Eine Version lässt sich auch festlegen, etwa mit `sh -s -- 1.2.3`; der Standard ist `latest`. Um stattdessen aus einem Checkout zu installieren, `emet self install --from <checkout>` ausführen; das benötigt `bun` und hält `emet selftest` lauffähig.

### Codex

Ist Codex vorhanden, gibt `emet self install` einen einmaligen Schritt aus: `/hooks` in Codex öffnen und auf der Ereignisseite `t` drücken, um den emet-Hooks zu vertrauen (oder beim Start die Meldung "Hooks need review" bestätigen). Bis dahin läuft der emet guard nicht. Siehe [emet mit Codex ausführen](../how-to/use-codex.md#install).

### Aktualisierung

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

Die Version wird heruntergeladen, gegen `SHA256SUMS` verifiziert (und gegen die Attestierung, wenn `gh` vorhanden ist) und bereitgestellt. Der Austausch des Symlinks und der installierten Dateien erfolgt nur, wenn kein Worker-Slot belegt ist; andernfalls bleibt das Update ausstehend und wird beim nächsten Sitzungsstart angewendet. Ein Fehler lässt die aktuelle Version unberührt und wird im Journal festgehalten. Die vorherige Version bleibt für ein Rollback erhalten, ältere werden entfernt. `emet doctor` warnt, wenn ein Update aussteht.

### Automatische Aktualisierung

Ein `SessionStart`-Hook führt `emet self update --auto` höchstens einmal täglich aus, losgelöst und still, wenn offline. Er verifiziert die Prüfsumme, stellt die neue Version bereit und tauscht den Symlink nur aus, wenn kein Worker-Slot belegt ist; andernfalls bleibt das Update bis zum nächsten Sitzungsstart ausstehend. Die vorherige Version bleibt für ein Rollback erhalten. Zum Ausschalten `EMET_AUTO_UPDATE=0` setzen oder `emet self update --auto off` ausführen; `emet self update --auto on` schaltet sie wieder ein. Die automatische Aktualisierung tut bei Plugin-Installationen nichts.

### Deinstallation

```bash
emet uninstall --dry-run     # list what would be removed
emet uninstall
```

Es entfernt das Versionsverzeichnis, den Symlink `~/.local/bin/emet`, die Install-Statusdatei, die Codex-Skills und jeden emet-Hook in beiden Hook-Dateien und macht die Extras rückgängig, die `emet setup` festgehalten hat. Eine bearbeitete Befehlsdatei und fremde Hooks bleiben erhalten. Siehe die [CLI-Referenz](../reference/cli.md#setup-ledger-and-restore).

### Optional: Plugins

Statt der eigenständigen Installation oder für das optionale `emet-mascot` lässt sich emet als Plugin installieren. `emet self install` verweigert den Dienst, solange das emet-Plugin installiert ist, und erklärt, wie man es entfernt; `--force` fährt trotzdem fort, und `emet doctor` warnt, wenn beide nebeneinander vorhanden sind. Was ein Plugin mitbringt, hängt vom Agent-Host ab. Unter Claude Code bringt es `/emet:run`, die Agents, die Guard-Hooks und einen `emet`-Shim mit, der beim ersten Gebrauch eine per Prüfsumme verifizierte eigenständige Binärdatei herunterlädt. Das Codex-Plugin liefert die Skills `$emet:run`, `$emet:init` und `$emet:doctor` und einen Hook, aber keine Agents und keinen `emet`-Shim.

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

Jede Installation liefert dieselben drei Einstiegspunkte. Unter Claude Code sind das die Slash-Befehle `/emet:run`, `/emet:init` und `/emet:doctor`; unter Codex die Skills `$emet:run`, `$emet:init` und `$emet:doctor`. Die eigenständige Installation legt außerdem `emet` in deinen `PATH`, sodass `emet init` und `emet doctor .` in einem normalen Terminal funktionieren; mit nur einem Plugin die Slash-Befehle verwenden oder `! emet <subcommand>` innerhalb einer Claude-Code- oder Codex-Sitzung. Unter Claude Code unterscheiden sich die Agent-Namen: `emet:emet-worker` im Plugin, `emet-worker` eigenständig; Codex hat keine emet-Agents, weil jeder Worker ein eigener `codex exec`-Prozess ist.

Zum Aktualisieren einer Plugin-Installation siehe [emet aktualisieren](../how-to/update-emet.md).

## Weiter

[Erster Lauf](first-run.md): die Installation prüfen und emet in einem Repo ausführen.
