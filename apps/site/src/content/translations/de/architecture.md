---
title: Architektur
description: Eine Code-Karte von emet/src und wie die /emet-Prompts sie steuern.
seoTitle: emet-Architektur
sourceHash: c86098a9614756e9
---

Eine Code-Karte von `emet/src` und wie die `/emet`-Prompts sie steuern. Die Begriffe folgen [GLOSSARY.md](../GLOSSARY.md); die Entscheidungen hinter der Form stehen in [docs/adr](adr/README.md). Bei Problemen siehe [Fehlerbehebung](troubleshooting.md).

- [Aufbau](#aufbau)
- [Wie die Prompts die CLI steuern](#wie-die-prompts-die-cli-steuern)
- [Modulkarte](#modulkarte)
- [Prompt-Aufbau](#prompt-aufbau)
- [Verteilung](#verteilung)
- [Siehe auch](#siehe-auch)

## Aufbau

Es gibt zwei Hälften. Die Prompts (`commands/run.md`, `agents/*.md`, `emet/reference/*.md`) sagen dem Agenten, was in jeder Phase zu tun ist. Die `emet`-CLI (`emet/bin/emet.ts` und `emet/src/`) erledigt alles, was deterministisch sein muss: Prüfungen, Claims, Slots, Gates, Tracker-Schreibvorgänge und Landing. Die Prompts implementieren nie eine Prüfung neu, die die CLI bereits durchführt.

`emet/bin/emet.ts` ist ein dünner Dispatcher: Er liest das erste Argument und übergibt an ein Unterbefehlsmodul, das den Rest von `process.argv` selbst liest. Exit-Codes sind über alle Unterbefehle hinweg aussagekräftig.

## Wie die Prompts die CLI steuern

`commands/run.md` ist ein kurzer Router. Er lädt jeweils eine Phasendatei aus `emet/reference/`, sodass eine Kompaktierung nie die Regeln der aktuellen Phase verwirft.

| Phase                                  | Prompt                                       | CLI-Aufrufe                                                                   |
| -------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| 1-5 Interview, Spec, Tickets, Freigabe | `phases-1-5.md`                              | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                |
| 6-7 Dispatch und Worker                | `phases-6-7-dispatch.md`, `worker-prompt.md` | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results` |
| 8 Review, Gate, Landing, Abschluss     | `phases-8-closeout.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `cleanup`     |
| 9 Handoff und Verkettung               | `phases-9-handoff.md`                        | `status`, `metrics`, `usage`, `spec-merge`                                    |

Der Koordinator ist der einzige Tracker-Schreiber (ADR-0005): Worker berichten über eine Handoff-Notiz und `emet results`, und der Koordinator veröffentlicht sie. `emet guard` läuft als `PreToolUse`-Hook und blockiert bekannte Auslöser für Fehler bei unbeaufsichtigten Läufen.

## Modulkarte

Neben jedem Modul liegt eine `*.test.ts`.

| Bereich                 | Module                                                                                                                                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Einrichtung und Prüfung | `init.ts` (Konfiguration und Doku-Gerüst), `config.ts` (`emet.config.json`, die ältere `forge.config.json` wird weiterhin gelesen), `doctor.ts` (Flottendurchlauf), `preflight.ts` (Dispatch-Hygiene), `dependencies.ts`, `skills.ts` (mattpocock-skills-Vertrag), `map.ts` (Codebase-Briefing) |
| Laufzustand             | `claims.ts` (Ticket-Reservierungen), `slots.ts` (Worker-Slot-Pool), `resources.ts` (Host-Fakten), `runs.ts` (Lebendigkeit), `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `status.ts`, `launch.ts`                                                                  |
| Tracker                 | `tracker.ts`, `tracker-files.ts` (lokaler `.scratch/`-Tracker), `validate.ts` (Spec-Abdeckung), `specmerge.ts`, `approve.ts`, `surfaces.ts` (Überlappung von Bearbeitungsflächen)                                                                                                               |
| Worker-Handoff          | `handoff.ts`, `results.ts`, `materializelog.ts`                                                                                                                                                                                                                                                 |
| Review und Landing      | `verify.ts`, `reviewpackage.ts`, `review.ts` (Befund-Ledger), `assess.ts` (Risikoklassifikator), `gate.ts`, `land.ts`                                                                                                                                                                           |
| Berichte                | `metrics.ts`, `usage.ts`                                                                                                                                                                                                                                                                        |
| Sicherheit              | `guard.ts`, `guard-destructive.ts`                                                                                                                                                                                                                                                              |
| Gemeinsame Helfer       | `narrow.ts`, `optional.ts`, `assets.ts` (eingebettete Dateien in kompilierten Binärdateien)                                                                                                                                                                                                     |

Hostspezifische Werte liegen hinter der Schnittstelle `AgentHost` in `agenthost.ts`: `agenthost-claude.ts` ist der Adapter für Claude Code und `agenthost-codex.ts` der für Codex, gewählt über `agentHost` in der Konfiguration. Die Codex-Seite ergänzt `codex-models.ts` (Modellauflösung), `codex-home.ts` (`CODEX_HOME`-Overlay pro Lauf), `codex-process.ts` und `codex-session.ts` (Prozess-Runner und Übergabe), `codex-usage.ts` (Nutzung aus `exec --json`), `guard-codex.ts` (Hook-Eingabe und Freigabe-Tor), `dispatch.ts` und `review-run.ts`. Siehe den [Codex-Leitfaden](guide/codex.md).

## Prompt-Aufbau

`commands/run.md` (etwa 130 Zeilen) ist der `/emet`-Router. Jede Datei in `emet/reference/` ist eine Phasengruppe (`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-closeout.md`, `phases-9-handoff.md`) und wird nur geladen, wenn der Modus des aktuellen Laufs sie braucht. Ein Test schlägt fehl, wenn eine davon über 20.000 Bytes wächst, damit eine Datei nach einer Kompaktierung nicht den Kontext übernehmen kann. Die Phasen weisen den Koordinator an, vor jeder Fix- oder Review-Runde den betreffenden Abschnitt erneut zu lesen. `install.sh` legt eine alte einzelne `phases-6-9.md` als `phases-6-9.md.retired` beiseite, wenn sie bearbeitet wurde oder älter als das Installationsmanifest ist, und löscht sie andernfalls. `install.sh` bindet außerdem `emet guard` als `PreToolUse`-Hook in `~/.claude/settings.json` ein.

## Verteilung

`install.sh` kopiert `emet/` nach `~/.claude/emet` und schreibt die Prompts um. Der Plugin-Weg liefert einen Shim aus, der eine per Prüfsumme verifizierte eigenständige Binärdatei herunterlädt, die `tools/build-binaries.ts` erzeugt. Siehe [ADR-0008](adr/0008-standalone-binaries-and-plugin-distribution.md).

## Siehe auch

- [Erste Schritte](guide/getting-started.md) und [Tracker und Landing](guide/trackers-and-landing.md)
- [Konfigurationsreferenz](reference/configuration.md), [CLI-Referenz](reference/cli.md) und [Abhängigkeiten](reference/dependencies.md)
- [AGENTS.md](../AGENTS.md) und [emet/AGENTS.md](../emet/AGENTS.md)
- [Dokumentationsindex](README.md)
