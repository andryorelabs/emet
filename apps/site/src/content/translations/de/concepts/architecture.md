---
title: Architektur
description: Eine Code-Karte von emet/src und wie die /emet-Prompts sie steuern.
seoTitle: emet-Architektur
sourceHash: ac65f41cf78af13e
---

Eine Code-Karte von `emet/src` und wie die `/emet`-Prompts sie steuern. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md); die Entscheidungen hinter der Form stehen in [docs/adr](../adr/README.md). Bei Problemen siehe [Fehlerbehebung](../troubleshooting.md).

- [Aufbau](#aufbau)
- [Wie die Prompts die CLI steuern](#wie-die-prompts-die-cli-steuern)
- [Modulkarte](#modulkarte)
- [Prompt-Aufbau](#prompt-aufbau)
- [Verteilung](#verteilung)
- [Siehe auch](#siehe-auch)

## Aufbau

Es gibt zwei Hälften. Die Prompts (`commands/run.md`, `agents/*.md`, `emet/reference/*.md` sowie die generierten `codex/skills/**` und `codex/hooks.json` für Codex) sagen dem Agenten, was in jeder Phase zu tun ist. Die `emet`-CLI (`emet/bin/emet.ts` und `emet/src/`) erledigt alles, was deterministisch sein muss: Prüfungen, Claims, Slots, Gates, Tracker-Schreibvorgänge und Landing. Die Prompts implementieren nie eine Prüfung neu, die die CLI bereits durchführt.

`emet/bin/emet.ts` ist ein dünner Dispatcher: Er liest das erste Argument und übergibt an ein Unterbefehlsmodul, das den Rest von `process.argv` selbst liest. Exit-Codes sind über alle Unterbefehle hinweg aussagekräftig.

## Wie die Prompts die CLI steuern

`commands/run.md` ist ein kurzer Router. Er lädt jeweils eine Phasendatei aus `emet/reference/`, sodass eine Kompaktierung nie die Regeln der aktuellen Phase verwirft.

| Phase                                  | Prompt                                                                                        | CLI-Aufrufe                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1-5 Interview, Spec, Tickets, Freigabe | `phases-1-5.md`                                                                               | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                                         |
| 6-7 Dispatch und Worker                | `phases-6-7-dispatch.md`, `worker-prompt.md`                                                  | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results`                          |
| 8 Review, Gate, Landing, Abschluss     | `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `spec-branch`, `spec-merge`, `cleanup` |
| 9 Handoff und Verkettung               | `phases-9-handoff.md`                                                                         | `status`, `metrics`, `usage`                                                                           |

Der Koordinator ist der einzige Tracker-Schreiber (ADR-0005): Worker berichten über eine Handoff-Notiz und `emet results`, und der Koordinator veröffentlicht sie. `emet guard` läuft als `PreToolUse`-Hook und blockiert bekannte Auslöser für Fehler bei unbeaufsichtigten Läufen.

## Modulkarte

Neben jedem Modul liegt eine `*.test.ts`. `tools/architecture-map.test.ts` schlägt fehl, wenn ein Nicht-Test-Modul von `emet/src` in dieser Liste fehlt.

**Einrichtung, Installation und Prüfung**

- `init.ts` schreibt die Konfiguration und das Doku-Gerüst; `config.ts` liest `emet.config.json` (die ältere `forge.config.json` wird weiterhin gelesen); `names.ts` löst einen Namen in seine aktuelle oder ältere Schreibweise auf.
- `doctor.ts` ist der Flottendurchlauf; `preflight.ts` prüft die Dispatch-Hygiene; `dependencies.ts` und `skills.ts` (der mattpocock-skills-Vertrag) prüfen, was ein Lauf braucht; `map.ts` schreibt das Codebase-Briefing; `plugin-detect.ts` meldet, welche Plugins installiert sind.
- `setup.ts` installiert die optionalen Extras, `setupledger.ts` hält jede Änderung fest, damit sie rückgängig gemacht werden kann, und `settingsapply.ts` enthält die empfohlenen Claude-Code-Einstellungen.
- `self.ts`, `self-install.ts`, `self-source.ts`, `self-types.ts`, `self-update.ts`, `self-host-claude.ts` und `self-host-codex.ts` implementieren `emet self`: Installation, Quellinstallationen, Updates und die Dateien je Host. `hooks-merge.ts` führt die emet-Hooks in die Host-Einstellungen zusammen, `uninstall.ts` macht eine Installation anhand des Ledgers rückgängig, `migrate.ts` überführt ältere Namen, `update-notice.ts` und `whats-new.ts` informieren die Person über neue Releases, und `embedded-tree.generated.ts` enthält die in die kompilierte Binärdatei eingebetteten Dateien.
- `assets.ts` liest diese eingebetteten Dateien.

**Laufzustand**

- `claims.ts` hält Ticket-Reservierungen, `slots.ts` den Worker-Slot-Pool, `resources.ts` Host-Fakten, `runs.ts` die Lebendigkeit und `runcurrent.ts` den aktuellen Lauf eines Checkouts.
- `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `mergedpr.ts` und `landed.ts` verwalten Worktrees, Sperren und das Aufräumen gelandeter Branches.
- `status.ts` berichtet Wellen und Sitzungen, `launch.ts` und `chain.ts` starten Läufe und die nächste Welle unbeaufsichtigt, `fleet.ts` arbeitet über Repos hinweg, und `phase.ts` hält die aktuelle Phase fest.
- `signals.ts` räumt bei einem Abbruch auf.

**Tracker und Specs**

- `tracker.ts` und `tracker-files.ts` (der lokale `.scratch/`-Tracker) lesen und schreiben Tickets, `ticketclose.ts` schließt sie, `validate.ts` prüft die Spec-Abdeckung, `approve.ts` hält die Freigabe fest und `surfaces.ts` findet Überlappungen von Bearbeitungsflächen.
- `specmerge.ts` führt Spec-Deltas in die lebenden Specs zusammen; `specbranch.ts`, `speclanding.ts` und `specabandon.ts` verwalten den Branch `spec/<id>`; `landing-unit.ts` bestimmt, ob ein Lauf pro Spec oder pro Welle landet; `afterspec.ts` und `promote.ts` führen den Schritt nach der Spec aus.

**Worker-Handoff**

- `handoff.ts`, `results.ts` und `materializelog.ts` tragen, was ein Worker dem Koordinator berichtet, und `mailbox.ts` ist die von der CLI verwaltete Mailbox für Codex-Worker.

**Review und Landing**

- `verify.ts`, `reviewpackage.ts`, `review.ts` (das Befund-Ledger), `review-run.ts` (der Codex-Reviewer), `assess.ts` (der Risikoklassifikator), `gate.ts`, `land.ts` und `ci.ts` prüfen, reviewen und landen eine Welle. `deploycheck.ts` führt die Prüfung nach dem Deploy aus.

**Journal, Aufmerksamkeit und Berichte**

- `journal.ts` hängt Ereignisse an und `insights.ts` liest sie; `attention.ts` hält den Aufmerksamkeitszustand einer Sitzung fest und `attention-alert.ts` löst den Alarm aus; `metrics.ts` und `usage.ts` berichten Kosten und Ergebnisse.
- `memory.ts` und `engram-client.ts` suchen und speichern Lessons in Engram.

**Sicherheit**

- `guard.ts`, `guard-destructive.ts` und `guard-codex.ts` sind die Guard-Hooks.

**Befehlsverkabelung und gemeinsame Helfer**

- `commands.ts` beschreibt die Befehle und ihre Flags, `flags.ts` die Flags, die jeder Befehl akzeptiert, `envelope.ts` die `--json`-Ausgabe, `errors.ts` die Fehlercodes, `exit-codes.ts` und `exit-code.ts` die Exit-Codes, `env.ts` die Umgebungssicht, `color.ts` und `banner.ts` die Terminalausgabe, und `present.ts`, `narrow.ts` und `optional.ts` kleine Eingrenzungshelfer.
- `test-preload.ts` und `expect-rejection.ts` unterstützen die Tests.

Hostspezifische Werte liegen hinter der Schnittstelle `AgentHost` in `agenthost.ts`: `agenthost-claude.ts` ist der Adapter für Claude Code und `agenthost-codex.ts` der für Codex, gewählt über `agentHost` in der Konfiguration. Die Codex-Seite ergänzt `codex-models.ts` (Modellauflösung), `codex-home.ts` (`CODEX_HOME`-Overlay pro Lauf), `codex-process.ts` und `codex-session.ts` (Prozess-Runner und Übergabe), `codex-usage.ts` (Nutzung aus `exec --json`), `guard-codex.ts` (Hook-Eingabe und Freigabe-Tor) und `dispatch.ts`. Siehe den [Codex-Leitfaden](../how-to/use-codex.md).

## Prompt-Aufbau

`commands/run.md` (etwa 130 Zeilen) ist der `/emet`-Router unter Claude Code; unter Codex übernehmen die generierten `codex/skills/**` und `codex/hooks.json` diese Rolle. Jede Datei in `emet/reference/` ist eine Phasengruppe (`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `phases-9-handoff.md`) und wird nur geladen, wenn der Modus des aktuellen Laufs sie braucht. Ein Test schlägt fehl, wenn eine davon über 20.000 Bytes wächst, damit eine Datei nach einer Kompaktierung nicht den Kontext übernehmen kann. Die Phasen weisen den Koordinator an, vor jeder Fix- oder Review-Runde den betreffenden Abschnitt erneut zu lesen. `emet self install` löscht eine übrig gebliebene `phases-8-closeout.md`, die noch zum Installationsmanifest passt, und legt sie andernfalls als `phases-8-closeout.md.retired` beiseite; diese Datei ist in `phases-8-review.md` (Review und Gate) und `phases-8-landing.md` (Landing und Abschluss) aufgeteilt. `phases-8-spec-landing.md` enthält die Regeln für `landing.unit: spec`: jede Welle in `spec/<id>` integrieren, den Trunk synchronisieren und die Spec einmal landen. `emet self install` führt außerdem die emet-Hooks, darunter `emet guard` als `PreToolUse`-Hook, in `~/.claude/settings.json` zusammen.

## Verteilung

`emet self install` legt die eigenständige Binärdatei ab, schreibt die umgeschriebenen Prompts nach `~/.claude/` und kopiert mit `--from <checkout>` den `emet/`-Quellcode nach `~/.claude/emet`. Das Codex-Plugin wird durch `.codex-plugin/plugin.json` beschrieben, erzeugt mit `bun run build:codex` zusammen mit `codex/skills/**` und `codex/hooks.json`. Der Plugin-Weg von Claude Code liefert einen Shim aus, der eine per Prüfsumme verifizierte eigenständige Binärdatei herunterlädt, die `tools/build-binaries.ts` erzeugt. Siehe [ADR-0008](../adr/0008-standalone-binaries-and-plugin-distribution.md).

## Siehe auch

- [Erste Schritte](../start/install.md) und [Tracker und Landing](../how-to/configure-tracker.md)
- [Konfigurationsreferenz](../reference/configuration.md), [CLI-Referenz](../reference/cli.md) und [Abhängigkeiten](../reference/dependencies.md)
- [AGENTS.md](../../AGENTS.md) und [emet/AGENTS.md](../../emet/AGENTS.md)
- [Dokumentationsindex](../README.md)
