---
title: Erste Schritte
description: emet als Claude-Code-Plugin installieren, mit emet doctor prüfen, ob es funktioniert, und zum ersten Mal ausführen.
seoTitle: Erste Schritte mit emet
sourceHash: 0f92cdb1a20904a3
---

emet installieren, prüfen, ob es funktioniert, und zum ersten Mal ausführen.

<img src="../brand/mascot/mascot-done.svg" alt="emet mascot, done" width="96" align="right">

## Voraussetzungen

Claude Code, `git`, `gh` (angemeldet) und das Plugin `mattpocock-skills`, unter Linux oder macOS. Bun wird nur für eine Installation aus dem Quellcode benötigt; natives Windows wird nicht unterstützt (WSL verwenden). Die vollständige Liste, mit der Angabe, was jeden Eintrag prüft, steht in der [Referenz der Abhängigkeiten](../reference/dependencies.md).

## Installation

Es gibt zwei Installationswege.

**Plugin** (ohne Bun). Dieses Repo als Marketplace hinzufügen und das Plugin `emet` installieren; es bringt `/emet:run`, die Agents, die Guard-Hooks und einen `emet`-Shim mit, der beim ersten Gebrauch eine per Prüfsumme verifizierte eigenständige Binärdatei herunterlädt.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

**`install.sh`** (funktioniert mit oder ohne Bun):

```bash
git clone git@github.com:andryorelabs/emet.git
cd emet
./install.sh
```

Mit `bun` im PATH kopiert es den CLI-Quellcode nach `~/.claude/emet` und einen `emet`-Wrapper nach `~/.local/bin/emet`. Ohne `bun` installiert es stattdessen den Shim für die eigenständige Binärdatei (`~/.local/bin/emet`, verlinkt auf `~/.claude/emet/bin/emet`), der die Binärdatei beim ersten Start herunterlädt und per Prüfsumme verifiziert (benötigt `curl`). In beiden Fällen landen die Befehle in `~/.claude/commands/emet/` und die Agents in `~/.claude/agents/`; Plugin-Platzhalter in den Prompts werden zu einfachen `~/.claude`-Pfaden umgeschrieben. Der erneute Aufruf ist unbedenklich, und eine bearbeitete Datei bleibt erhalten, während die neue Version daneben als `<file>.new` abgelegt wird.

Beide Installationen liefern drei Slash-Befehle: `/emet:run`, `/emet:init` und `/emet:doctor`. Der Befehl `emet` in einem normalen Terminal funktioniert erst nach `install.sh`; andernfalls die Slash-Befehle verwenden oder `! emet <subcommand>` innerhalb einer Claude-Code-Sitzung. Die Agent-Namen unterscheiden sich: `emet:emet-worker` im Plugin, `emet-worker` eigenständig.

Empfohlene Reihenfolge, in jedem Repo: zuerst `/setup-matt-pocock-skills` ausführen, dann `emet init`.

Mit `/emet:doctor` in Claude Code oder `emet doctor .` in einem Terminal nach `install.sh` prüfen, ob alles funktioniert hat (`selftest` benötigt eine Quellcode-Installation).

Meldet `doctor` oder `preflight` ein Problem, siehe [Fehlerbehebung](../troubleshooting.md). Es wird nie etwas im Auftrag des Nutzers installiert oder angemeldet; wer was prüft und was `EMET_SKIP_DEPENDENCY_CHECKS` bewirkt, steht in der [Referenz der Abhängigkeiten](../reference/dependencies.md).

## Erster Lauf

In einem beliebigen Git-Repo:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

Innerhalb einer Sitzung macht `/emet:init` dasselbe wie `emet init`. Danach, in Claude Code:

```
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

`emet init` hinterlässt in den erzeugten `docs/agents/*.md`-Dateien eine `TODO(emet):`-Markierung für alles, was es nicht selbst ableiten kann (eine gemeinsame Testdatenbank-Sperre, Schema-Zuständigkeit usw.); diese ausfüllen. `emet preflight` verweigert den Dispatch, solange eine übrig ist.

## Weiter

- [Tracker und Landing](trackers-and-landing.md): GitHub, Linear oder lokale Tickets und wie eine Welle landet.
- [Modelle und Aufwand](models-and-effort.md): welches Modell und welchen Aufwand jede Rolle verwendet.
- [Flottenprüfung](fleet.md): mehrere Repos gleichzeitig prüfen.
- [Konfigurationsreferenz](../reference/configuration.md) und [CLI-Referenz](../reference/cli.md): jeder Schlüssel und jeder Unterbefehl.
