---
title: CLI-Referenz
description: Jeder emet-Unterbefehl, die Tabelle der Gates und Aufzeichnungen, Exit-Codes und Umgebungsvariablen.
seoTitle: emet-CLI-Referenz
sourceHash: b89b785c057b008c
---

Jeder `emet`-Unterbefehl, die Tabelle der Gates und Aufzeichnungen, Exit-Codes und Umgebungsvariablen. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md). Zurück zur [README](../../README.md). Jeder Befehl gibt seine Verwendung mit `--help` aus.

## Unterbefehle

Drei Slash-Befehle umhüllen die CLI innerhalb von Claude Code: `/emet:run` (die Pipeline), `/emet:init` (`emet init`) und `/emet:doctor` (`emet doctor .`). Unter Codex sind es die Skills `$emet:run`, `$emet:init` und `$emet:doctor`. Ein `emet` in einem normalen Terminal benötigt `install.sh`; andernfalls `! emet <subcommand>` innerhalb einer Sitzung ausführen.

`emet <command> [...args]`. `emet --version` gibt die Version aus.

### Einrichtung und Prüfung

- `emet migrate [--dry-run]`: benennt ein Legacy-Repo auf die emet-Namen um.
- `emet init [--tracker linear|github|local] [--force]`: erkennt Paketmanager, Trunk-Branch und Tracker-Art automatisch und schreibt `emet.config.json` und die `docs/agents/*.md`-Dateien. `--tracker local` richtet den lokalen Tracker ein.
- `emet doctor [--all] [<path> ...]`: schreibgeschützte Prüfung beliebig vieler Repos gleichzeitig; Standard ist das aktuelle Verzeichnis.
- `emet preflight [--run <id>] [--post-dispatch]`: bestätigt, dass das Repo bereit für den Dispatch ist.
- `emet skill-path <name>`: gibt den absoluten `SKILL.md`-Pfad eines mattpocock-skills-Skills aus. Endet mit Exit-Code 1, wenn der Skill nicht gefunden wird.
- `emet selftest`: führt die eigenen Unit-Tests der CLI aus. Nur bei Quellcode-Installationen; eine kompilierte Binärdatei endet mit Exit-Code 1 und verweist auf `emet doctor`.

In einem beliebigen Git-Repo:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

`emet init` hinterlässt in den erzeugten `docs/agents/*.md`-Dateien eine `TODO(emet):`-Markierung für alles, was es nicht selbst ableiten kann (eine gemeinsame Testdatenbank-Sperre, Schema-Zuständigkeit und so weiter). Diese ausfüllen; `emet preflight` verweigert den Dispatch, solange eine übrig ist.

Danach, in Claude Code (unter Codex `$emet:run` mit denselben Argumenten verwenden):

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

#### Flottenprüfung

`emet doctor` prüft mehrere Repos gleichzeitig und nur lesend:

```bash
emet doctor ~/code/*
```

Der Bericht enthält pro Repo: eine gültige `emet.config.json`, alle vier vorhandenen `docs/agents/*.md`-Dateien, keine übrig gebliebenen `TODO(emet):`-Markierungen, ob die Befehle in `commands.selfCheck` tatsächlich aufgelöst werden, sowie die trackerspezifischen Abhängigkeitsbefunde des Repos (`gh`, Linear; siehe [Abhängigkeiten](dependencies.md#was-was-prüft)). Das Plugin mattpocock-skills und die Flags der externen CLIs (`gh`, dazu die des Agent-Hosts: `claude --bg` und `claude agents --json` unter Claude Code, `codex exec --json` und `--output-schema` unter Codex, geprüft über `--help`) werden einmal für den gesamten Durchlauf geprüft, nicht pro Repo.

### Läufe, Worker und Slots

- `emet claims --reserve <ticket> --run <id> --anchor <pid>`: reserviert ein Ticket für einen Lauf. `--release <ticket>`, `--list` und `--prune [--dry-run]` geben einen Claim frei, listen Claims auf oder entfernen veraltete.
- `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`: nimmt einen Worker-Slot aus dem hostweiten Pool in `~/.local/state/emet/slots`. `--release --run <id>`, `--release-index <index>` und `--list` geben Slots frei oder listen sie auf.
- `emet cleanup [--run <id> | --all] [--dry-run] [--force]`: ohne Argumente werden abgeschlossene oder tote Läufe zurückgewonnen, deren Arbeit gelandet ist; `--run` räumt diesen Lauf auf; `--all` ist ein repoweiter Branch-Durchlauf. Nach einem Merge gibt `emet cleanup --run <runId>` die Branches, Ticket-Claims und Worker-Slots der Welle frei.
- `emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]`: gibt den `git worktree lock`-Grund aus, den ein Worker beim Bootstrap schreibt.
- `emet launch <spec-id> --wave <n>`: startet unter Claude Code eine Welle als `claude --bg`-Sitzung und öffnet ihren Orca-Tab gemäß `handoff.launcher` (unter Codex siehe [Codex-Host](#codex-host)). Es erledigt den gesamten Start (Prüfung auf doppelte Sitzungen, `claude --bg`, Tab) und gibt `{ name, id, attach, orcaTab: { opened, reason } }` aus. Dieses statt eines bloßen `claude --bg` verwenden, wenn eine Welle von Hand in einer anderen Sitzung laufen soll.
- `emet status [--spec <id>]`: Working / Checking / Ready / Needs-decision pro Welle als JSON plus eine Zusammenfassungszeile. `emet status --help` dokumentiert das JSON.
- `emet usage [--session <id> | --file <path>] [--stalled [--minutes N]] [--project-dir <path>]`: berichtet die Sitzungsnutzung; `--stalled` listet festgefahrene Worker auf.
- `emet handoff --check <path> | --render <path>`: validiert oder rendert die Notiz `.emet/handoff-<ticket>.md` eines Workers.
- `emet metrics [--run <id>]`: berichtet Tokens, API-äquivalente Kosten und Laufzeit pro Ticket, pro Welle und pro Lauf, gelesen aus den Sitzungsprotokollen. Es vergleicht außerdem das pro Ticket geschätzte Kontextbudget mit dem, was jeder Worker tatsächlich verbraucht hat. Die Zusammenfassung steht am Ende des Abschlussberichts des Laufs.

### Planung, Review und Landing

- `emet validate --spec <id> | --file <path>`: Planvalidierung; siehe [Gates und Aufzeichnungen](#gates-und-aufzeichnungen).
- `emet surfaces --check <file.json | ->`: weist überlappende Globs erlaubter Flächen zwischen den Tickets einer Welle zurück.
- `emet approve --run <id>`, `emet materialize-log`, `emet results`, `emet verify`, `emet review-package`, `emet review`, `emet gate`: siehe [Gates und Aufzeichnungen](#gates-und-aufzeichnungen).
- `emet assess --base <ref> --head <ref>`: klassifiziert einen Diff als `passive`, `medium` oder `high` und gibt JSON mit der Stufe, den Gründen und dem empfohlenen Reviewer-Modell samt Aufwand aus. Siehe [Modelle und Aufwand](../../README.md#models--effort) und [`review`](configuration.md#review).
- `emet land --spec <s> --branch <integration> --tickets <id,...>`: mergt einen Integrationsbranch in den lokalen Trunk (`landing.mode` `merge`). `commands.selfCheck` ersetzt die CI, und es wird nichts gepusht.
- `emet spec-merge --spec <id>`: führt nach dem automatischen Merge einer Welle die Anforderungs-Deltas `ADDED`/`MODIFIED`/`REMOVED` der Spec in `docs/specs/<area>.md` (`specs.dir`) zusammen. Es prüft jeden Bereich, bevor es etwas schreibt. Ein Konflikt oder eine Anforderung, die ein Szenario verlieren würde, endet mit Exit-Code 1 und lässt jede Datei unberührt.
- `emet map [--refresh]`: schreibt eine Kurzbeschreibung einer bestehenden Codebase (Stack, Struktur, Konventionen, Tests, Hotspots) nach `docs/agents/codebase.md` (`map.path`), versehen mit dem Commit-SHA, aus dem sie erstellt wurde. Derselbe Commit erzeugt immer dieselbe Datei. `emet map --stale` endet mit Exit-Code 1, sobald HEAD über den Stempel hinausgewandert ist, und `emet preflight` warnt in diesem Fall. `emet map --for <globs>` gibt nur die Abschnitte aus, die zu den Bearbeitungsflächen eines Tickets passen; diese Ausgabe ist der einzige Teil der Karte, den ein Worker-Briefing enthält.
- `emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close`: der lokale Tracker über `.scratch/`, JSON auf stdout. Siehe [Lokaler Tracker](#lokaler-tracker).
- `emet guard`: der `PreToolUse`-Hook von Claude Code; liest Hook-JSON von stdin (die Codex-Form steht unter [Codex-Host](#codex-host)). `install.sh` bindet ihn in `~/.claude/settings.json` ein. Er blockiert einige bekannte Auslöser für Fehler bei unbeaufsichtigten Läufen (siehe `emet/src/guard.ts`).

### Lokaler Tracker

Mit `tracker.kind: "local"` sind Specs und Tickets Markdown-Dateien unter `.scratch/` des Haupt-Worktrees (nicht versioniert): `.scratch/<slug>/spec.md` und `.scratch/<slug>/issues/<NN>-<slug>.md`, jeweils mit den Zeilen `Status:` und `Blocked by:` und Kommentaren unter `## Comments`. Der Koordinator liest und schreibt sie über `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` richtet das ein. Siehe [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

`landing.mode` ist `"pr"` (Standard) oder `"merge"`, unabhängig vom Tracker. Im Modus `merge` landet eine Welle mit `emet land` als ein lokaler Merge in den Trunk, wobei `commands.selfCheck` die CI ersetzt und nichts gepusht wird. `gh` ist nur erforderlich, wenn der Tracker `github` ist oder das Landing `pr` verwendet. Siehe [ADR-0010](../adr/0010-local-merge-landing.md) und [`landing`](configuration.md#landing).

### Landing-PRs und Verkettung von Wellen

Eine Welle ist ein PR. Sein Text enthält für jedes Ticket `Closes #N` (das Schließ-Schlüsselwort des Trackers), und der Koordinator setzt die Tickets auf in-review, sobald er den PR öffnet. Der PR wird dann gemäß `pr.autoMerge` gemergt oder bleibt offen, wenn die Welle markiert wurde, `autoMerge` den Wert `false` hat oder die CI-Korrekturen aufgebraucht sind (der PR erhält dann das Label human-decision). Spätere Wellen laufen in eigenen Sitzungen, nie in der, die Welle 1 ausgeführt hat. Die Abschnitte `pr` und `handoff` steuern, was als Nächstes geschieht; siehe [`pr`](configuration.md#pr) und [`handoff`](configuration.md#handoff).

### Codex-Host

Diese Befehle bedienen den Codex-Agent-Host (`agentHost` `"codex"`); siehe den [Codex-Leitfaden](../guide/codex.md).

- `emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: legt nach der Prüfung von Reservierung und Slot `.emet/worktrees/agent-<ticket>` an, baut ein `CODEX_HOME`-Overlay pro Lauf und startet den Worker als abgekoppeltes `codex exec`. `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]` blockiert bis zum Ende und gibt den aufgezeichneten Ergebnisstatus aus.
- `emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive>`: führt den Reviewer als schreibgeschütztes `codex exec` über ein Paket von `emet review-package` aus und gibt Befunde-JSON für `emet review --findings` aus. Die Stufe `passive` startet keinen Prozess.
- `emet launch <spec-id> --wave <n>`: startet auf diesem Host ein abgekoppeltes `codex exec`, das `$emet:run --dispatch <spec>` ausführt, und speichert dessen Thread-ID. Es wird kein Orca-Tab geöffnet, und `codex exec resume <id>` setzt die Sitzung fort.
- `emet guard`: liest mit `EMET_AGENT_HOST=codex` die Hook-Eingabe von Codex, prüft die Pfade von `apply_patch` gegen `.emet/surface.json` und hält das Freigabe-Tor geschlossen, bis eine Prompt-Zeile `approve <id>` kommt.

## Gates und Aufzeichnungen

Die Phasen entscheiden nicht selbst, wann ein Ticket fertig, mergebar oder einen weiteren Versuch wert ist. Sie rufen einen CLI-Befehl auf, der eine Aufzeichnung auf der Festplatte liest und die Entscheidung ausgibt. Lauf-Aufzeichnungen liegen unter `.emet/runs/<run-id>/` und das Review-Ledger unter `.emet/review/`, im Haupt-Checkout, nicht im Worktree eines Workers.

| Schritt           | Befehl                                               | Was durchgesetzt wird                                                                                                                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vor der Freigabe  | `emet validate --file <plan.json>`                   | Jedes `S#` wird von mindestens einem Ticket abgedeckt und hat ein Abnahmeszenario. Jedes Ticket deckt mindestens ein `S#` ab. Bearbeitungsflächen sind innerhalb einer Welle disjunkt. Keine Abhängigkeitszyklen. `emet preflight` führt es auf dem freigegebenen Plan erneut aus.            |
| Freigabe          | `emet approve --run <id> --spec <file>`              | Schreibt `approval.json` mit den Hashes von Spec und Ticketliste. Der Dispatch wird verweigert, wenn sich eines davon danach ändert (`--check`).                                                                                                                                              |
| Ticket-Erstellung | `emet materialize-log --run <id> --record/--lookup`  | Speichert die ID jedes erstellten Tickets, sobald es existiert, sodass ein unterbrochener Lauf nie Duplikate erzeugt.                                                                                                                                                                         |
| Worker fertig     | `emet results --run <id> --write/--read <ticket>`    | Worker schreiben eine lokale Ergebnisdatei (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` oder `NEEDS_CONTEXT`, plus eine `Risk:`-Zeile). Nur der Koordinator schreibt in den Tracker.                                                                                                              |
| Nach jedem Worker | `emet verify <ticket> --run <id>`                    | Prüft, dass Commits über die Dispatch-Basis hinaus existieren, jeder geänderte Pfad innerhalb der Bearbeitungsflächen des Tickets liegt, die Handoff-Notiz `handoff --check` besteht und `commands.workerScopedSuite` besteht. Review und Merge verweigern ein Ticket ohne Bestanden-Eintrag. |
| Review-Eingabe    | `emet review-package <base> <head> --out <file>`     | Bündelt den Diff für den Reviewer, der ihn als Dateipfad erhält. Endet mit Exit-Code 3, wenn der Bereich leer oder kein Nachfahre von base ist.                                                                                                                                               |
| Review            | `emet review --ticket <t> --findings <file>`         | Führt das Befund-Ledger und erzwingt die Triage-Reihenfolge (`intent_gap` → `bad_plan` → `patch` → `defer`) und die Rundengrenze. `--escalate` wechselt zur nächsten Modellstufe. `--rule`/`--rulings` erfassen und listen die „Rulings I made“ für den Bericht und den PR-Text.              |
| Merge oder Kette  | `emet gate <ticket> --tier … --ci … --integration …` | Gibt `merge`, `hold`, `chain`, `stop` oder `defer` als JSON samt Begründungen aus. Es liest den Verify-Eintrag, die offenen Befunde, die Risikostufe, die CI, die Integrations-Suite und die Budgets.                                                                                         |

Nachdem die Branches einer Welle zusammengeführt wurden, läuft `commands.fullSuite` einmal auf dem Integrationsbranch. Ein roter Lauf blockiert den PR und `autoChain`. Das Gate erhält das Ergebnis als `--integration`. Zu den Budgets, die das Gate liest, siehe [`budgets`](configuration.md#budgets).

## Exit-Codes

Exit-Codes sind bei jedem Unterbefehl aussagekräftig.

| Code | Bedeutung                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| `0`  | Sauber.                                                                                                     |
| `1`  | Befunde, auf die reagiert werden muss.                                                                      |
| `2`  | Konfigurations- oder Verwendungsfehler; das Tool ist nie tatsächlich gelaufen. Auch ein unbekannter Befehl. |
| `3`  | Interner Fehler.                                                                                            |

## Umgebungsvariablen

Für Nutzer gedachte Variablen. Eine gesetzte Variable überschreibt den passenden Konfigurationswert.

| Variable                      | Wirkung                                                                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` stuft eine Abhängigkeitssperre für diesen einen Lauf zu einer Warnung herab. In der eigenen Shell setzen, nicht in etwas, das der Koordinator unbeaufsichtigt ausführt. |
| `EMET_MAX_LIVE_WORKERS`       | Überschreibt [`concurrency.maxLiveWorkers`](configuration.md#concurrency); akzeptiert eine positive ganze Zahl oder `auto`.                                                                                            |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | Überschreibt [`concurrency.runIdleThresholdMs`](configuration.md#concurrency), in Millisekunden.                                                                                                                       |
| `EMET_STATE_DIR`              | Hostweites Zustandsverzeichnis, das den Worker-Slot-Pool enthält. Auflösungsreihenfolge: `$EMET_STATE_DIR`, dann `$XDG_STATE_HOME/emet`, dann `~/.local/state/emet`.                                                   |
| `EMET_MEM_RESERVE_GIB`        | Speicherreserve in GiB, die frei bleiben muss; ein Acquire wird abgelehnt, wenn der verfügbare Speicher darunter liegt. Standard 8. Sie fließt auch in die `auto`-Worker-Obergrenze ein.                               |
| `EMET_MEM_PER_WORKER_GIB`     | Speicher in GiB, der pro Worker angenommen wird, wenn `maxLiveWorkers` den Wert `auto` hat. Standard 2. Erhöhen bei einem schwereren Stack pro Worker, etwa einer browsergesteuerten E2E-Suite pro Worktree.           |
| `EMET_CPU_OVERSUBSCRIBE`      | CPU-Multiplikator für die `auto`-Worker-Obergrenze. Standard 1.                                                                                                                                                        |
| `EMET_AGENT_HOST`             | `codex` lässt `emet guard` die Hook-Eingabe von Codex lesen. Wird von den Codex-Hooks gesetzt; unter Claude Code ungesetzt lassen.                                                                                     |

Die `auto`-Obergrenze ist `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`. Die veralteten `FORGE_*`-Namen werden weiterhin gelesen; `EMET_*` hat Vorrang, wenn beide gesetzt sind.
