---
title: Fehlerbehebung
description: Fehler von emet doctor und emet preflight, nach dem Sichtbaren gruppiert, jeweils mit Ursache und Lösung.
seoTitle: Fehlerbehebung für emet doctor und preflight
sourceHash: c1ebb76c9250d743
---

Fehler von `emet doctor` und `emet preflight`, nach dem Sichtbaren gruppiert, jeweils mit Ursache und Lösung. Die Begriffe folgen [GLOSSARY.md](../GLOSSARY.md). Wie die Prüfungen zusammenspielen, steht in der [Architektur](architecture.md).

<img src="brand/mascot/mascot-error.svg" alt="" width="96">

Ein Repo, das noch nur `forge.config.json`, `.forge/` oder `FORGE_*`-Variablen hat, funktioniert weiter: `emet` liest die Legacy-Namen, gibt eine stderr-Zeile aus, die jede Legacy-Datei nennt, und `emet migrate` benennt sie um.

- [no emet.config.json](#no-emetconfigjson)
- [emet.config.json is malformed](#emetconfigjson-is-malformed)
- [docs/agents still has TODO(emet) markers](#docsagents-still-has-todoemet-markers)
- [Eine Abhängigkeitsprüfung schlägt fehl](#eine-abhängigkeitsprüfung-schlägt-fehl)
- [no longer documents a flag in --help](#no-longer-documents-a-flag-in---help)
- [Eine installierte Datei fehlt oder wurde seit der Installation bearbeitet](#eine-installierte-datei-fehlt-oder-wurde-seit-der-installation-bearbeitet)
- [Stop hook error: forge: No such file or directory](#stop-hook-error-forge-no-such-file-or-directory)
- [Keine freien Worker-Slots](#keine-freien-worker-slots)
- [Gesperrte Worktrees erwartet, weniger gefunden](#gesperrte-worktrees-erwartet-weniger-gefunden)
- [Ein Ticket wird von mehreren Worktrees oder Branches beansprucht](#ein-ticket-wird-von-mehreren-worktrees-oder-branches-beansprucht)
- [requiredCommands not on PATH](#requiredcommands-not-on-path)
- [Siehe auch](#siehe-auch)

## no emet.config.json

**Symptom:** `emet doctor` gibt `no emet.config.json — run "emet init" here` aus.

**Ursache:** Das Repo hat noch keine `/emet`-Konfiguration.

**Lösung:** `emet init` im Repo-Stamm ausführen, dann die erzeugte Konfiguration prüfen und die Dateien in `docs/agents/` ausfüllen.

## emet.config.json is malformed

**Symptom:** `emet.config.json is malformed: <reason>`; `emet preflight` endet mit Exit-Code 2.

**Ursache:** Die Konfiguration ist striktes JSON und wird gegen `emet/schema/emet.config.schema.json` validiert. Kommentare und abschließende Kommas werden abgelehnt.

**Lösung:** Das in der Begründung genannte Feld korrigieren oder mit `emet init --force` neu erzeugen.

## docs/agents still has TODO(emet) markers

**Symptom:** `docs/agents/ still has N TODO(emet): marker(s)`; `emet doctor` meldet außerdem eine fehlende `docs/agents/<file>`.

**Ursache:** `emet init` hinterlässt überall dort eine Markierung, wo es keinen Wert erkennen kann.

**Lösung:** Jede markierte Zeile ausfüllen oder auflösen und `emet init --force` ausführen. Preflight verweigert den Dispatch, solange eine übrig ist.

## Eine Abhängigkeitsprüfung schlägt fehl

**Symptom:** Zeilen `dependency: ...` in `emet doctor` oder ein blockierender Abhängigkeitsfehler in `emet preflight` (zum Beispiel fehlendes oder nicht angemeldetes `gh` oder das Plugin mattpocock-skills fehlt oder hat eine ungetestete Version).

**Ursache:** `/emet` braucht `git`, `gh` und das Plugin mattpocock-skills; siehe `emet/src/dependencies.ts` und `emet/src/skills.ts`.

**Lösung:** Das Tool installieren oder anmelden oder den Skill `setup-matt-pocock-skills` ausführen (`/setup-matt-pocock-skills` unter Claude Code, derselbe Skill mit der `$`-Syntax von Codex unter Codex). Ist eine Prüfung für die eigene Umgebung falsch, stuft `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` sie zu einer Warnung herab.

## no longer documents a flag in --help

**Symptom:** `<tool> no longer documents <flags> in --help — emet relies on it` oder `could not be run — cannot verify <flags>`.

**Ursache:** `emet doctor` prüft die Flags, von denen `emet` abhängt, nicht nur, ob die Binärdatei existiert. Die installierte Version hat eines entfernt oder umbenannt.

**Lösung:** Eine Version des Tools installieren, die das Flag noch dokumentiert.

## Eine installierte Datei fehlt oder wurde seit der Installation bearbeitet

**Symptom:** `~/<path> is missing — re-run install.sh` oder `~/<path> was edited since install`.

**Ursache:** Die installierte Kopie stimmt nicht mehr mit dem Installationsmanifest überein.

**Lösung:** `install.sh` erneut ausführen. Liegt neben einer bearbeiteten Datei eine ausstehende `.new`-Datei, diese zusammenführen oder löschen.

## Stop hook error: forge: No such file or directory

**Symptom:** Claude Code gibt am Ende jedes Zuges `Stop hook error: … forge: No such file or directory` aus (oder dasselbe für `emet`).

**Ursache:** `~/.claude/settings.json` enthält noch einen Hook `forge guard` oder `emet guard`, dessen Binärdatei verschoben oder entfernt wurde.

**Lösung:** `emet doctor .` ausführen. Es listet jeden toten Guard-Hook mit seinem Ereignis auf und gibt einen `cp … && jq …`-Befehl aus, der `settings.json` sichert und nur diese Hooks entfernt. Doctor ändert die Datei nie selbst.

## Keine freien Worker-Slots

**Symptom:** `No free worker slots at all: 0 free out of N` oder `only K/N worker slot(s) free`.

**Ursache:** Jeder Slot in `~/.local/state/emet/slots` wird von einem aktiven oder untätigen Lauf gehalten, sodass die Welle nicht vollständig dispatcht werden kann.

**Lösung:** Warten, bis ein Lauf einen Slot freigibt, oder `emet cleanup --run <runId>` für einen Lauf ausführen, von dem bekannt ist, dass er beendet ist. `emet status` zeigt, wer was hält.

## Gesperrte Worktrees erwartet, weniger gefunden

<img src="brand/mascot/mascot-sleep.svg" alt="" width="64">

**Symptom:** `Expected N locked worktree(s) for run <id>, found M`.

**Ursache:** Worker haben ihren Worktree nicht mit dem Sperrgrund beansprucht, oder `isolation: "worktree"` hat sie anderswo platziert. Siehe [`incidents.md`](../emet/reference/incidents.md).

**Lösung:** `git worktree list --porcelain` auf die gesperrten Einträge prüfen und `emet lock-reason` für das erwartete Format des Grundes.

## Ein Ticket wird von mehreren Worktrees oder Branches beansprucht

**Symptom:** `<ticket> is claimed by N worktrees`, `has N branches` oder `is checked out on branch ..., but its own lock names ticket ...`.

**Ursache:** Ein Wiederholungsversuch oder eine fehlgeleitete Shell hat ein Duplikat hinterlassen.

**Lösung:** Den kanonischen Worktree oder Branch behalten, den Rest löschen oder neu sperren und dann `emet preflight` erneut ausführen.

## requiredCommands not on PATH

**Symptom:** `preflight.requiredCommands not on PATH: <names>`.

**Ursache:** `preflight.requiredCommands` in `emet.config.json` listet Binärdateien auf, die das Repo braucht.

**Lösung:** Die genannten Binärdateien installieren oder aus der Konfiguration entfernen, wenn sie nicht mehr gebraucht werden.

## Codex-Host

Diese Hinweise gelten, wenn `agentHost` `"codex"` ist. Siehe [emet mit Codex ausführen](guide/codex.md).

**Ein `codex`, das älter als `codex.minVersion` ist.** `emet doctor .` meldet es. Die `codex`-CLI in der Version aus `codex.minVersion` (Standard `0.167.0`) oder neuer installieren und dann `emet doctor .` erneut ausführen.

**Ein fehlendes Flag `--json` oder `--output-schema`.** `emet doctor .` meldet ein `codex exec`, das eines der beiden Flags nicht dokumentiert; emet braucht beide, um Worker und Reviewer zu starten. Eine `codex`-Version installieren, die sie weiterhin dokumentiert.

**Ein konfiguriertes Modell ist nicht aufgeführt.** emet löst Modelle gegen `models_cache.json` im Run-Home auf, sonst im echten Codex-Home (nur lesend). Ein nicht aufgeführter Slug wird ersetzt, und die Ersetzung wird protokolliert. Wenn nichts aufgelöst wird, schlägt `emet review-run` vor dem Modellaufruf fehl und nennt die Rolle sowie die aufgeführten Slugs. Einen aufgeführten Slug in `codex.models` setzen; siehe die [Konfigurationsreferenz](reference/configuration.md#codex).

## Siehe auch

- [Dokumentationsindex](README.md)
- [README](../README.md)
- [Erste Schritte](guide/getting-started.md)
- [Konfigurationsreferenz](reference/configuration.md)
- [Referenz der Abhängigkeiten](reference/dependencies.md)
