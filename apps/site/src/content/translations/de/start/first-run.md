---
title: Erster Lauf
description: Die Installation mit emet doctor prüfen und emet zum ersten Mal ausführen.
seoTitle: Erster Lauf mit emet
sourceHash: 7daec76e45f50b8c
---

Die Installation mit `emet doctor` prüfen und emet zum ersten Mal ausführen. Zuerst emet installieren; siehe [Installation](install.md).

## Voraussetzungen

- emet ist installiert, und `emet` liegt in deinem `PATH`.
- Ein Git-Repo mit angemeldetem `gh`.
- Unter Claude Code oder Codex das Plugin `mattpocock-skills`.

## Schritte

In jedem Repo zuerst den Skill `setup-matt-pocock-skills` ausführen (`/setup-matt-pocock-skills` unter Claude Code; unter Codex derselbe Skill aus dem Plugin `mattpocock-skills` mit der `$`-Skill-Syntax von Codex). Danach, in einem beliebigen Git-Repo:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight     # confirms the repo is dispatch-ready
```

Innerhalb einer Sitzung macht `/emet:init` dasselbe wie `emet init` (`$emet:init` unter Codex). `emet init` hinterlässt in den erzeugten `docs/agents/*.md`-Dateien eine `TODO(emet):`-Markierung für alles, was es nicht selbst ableiten kann, etwa eine gemeinsame Testdatenbank-Sperre oder die Schema-Zuständigkeit; diese ausfüllen. `emet preflight` verweigert den Dispatch, solange eine übrig ist.

Dann emet in Claude Code ausführen (unter Codex `$emet:run` statt `/emet:run` verwenden):

```
/emet:run <describe the feature>              # interview, then wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## Das Ergebnis prüfen

`emet doctor .` in einem Terminal ausführen oder `/emet:doctor` in Claude Code (`$emet:doctor` unter Codex). Es meldet Fehler zuerst. Meldet `doctor` oder `preflight` ein Problem, siehe [Fehlerbehebung](../troubleshooting.md). Es wird nie etwas im Auftrag des Nutzers installiert oder angemeldet; die [Referenz der Abhängigkeiten](../reference/dependencies.md) sagt, wer was prüft, und dokumentiert `EMET_SKIP_DEPENDENCY_CHECKS`.

## Weiter

- [Tracker und Landing](../how-to/configure-tracker.md): GitHub, Linear oder lokale Tickets und wie eine Spec landet.
- [emet mit Codex ausführen](../how-to/use-codex.md): die einmalige Freigabe und die Grenzen des Agent host Codex.
- [Modelle und Aufwand](../how-to/choose-models.md): welches Modell und welchen Aufwand jede Rolle verwendet.
- [Flottenprüfung](../how-to/check-a-fleet.md): mehrere Repos gleichzeitig prüfen.
- [Konfigurationsreferenz](../reference/configuration.md) und [CLI-Referenz](../reference/cli.md): jeder Schlüssel und jeder Unterbefehl.
