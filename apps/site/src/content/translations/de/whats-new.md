---
title: Neuigkeiten
description: Release Notes für emet: was sich in jeder Version geändert hat.
seoTitle: "Neuigkeiten in emet: Release Notes"
sourceHash: a633f8ebdf12e2a7
---

## 0.4.0

2026-11-06

### Hinzugefügt

- Die Option `position` von `emet-mascot` (`pane`, `band` oder `status`); `pane` ist
  der Standard und weicht auf das Band aus, wenn es nicht andocken kann.
- Ein Abschnitt „Mascot (optional)“ in der README.

### Geändert

- Die Frames von `emet-mascot` werden auf die sechs Maskottchen-Farben gerastet, statt
  durch eine Größenänderung weichgezeichnet zu werden, sodass die Pixelgrafik im Terminal
  scharf ist.
- `emet-mascot` 0.2.0: Die Standardgröße `size` ist jetzt `small`.
- `docs/how-to/orca-pet.md` heißt jetzt `docs/how-to/mascot.md` und behandelt den Mod
  und das Orca-Pet.

## 0.3.0

2026-11-05

### Hinzugefügt

- Die Plugin-Befehle `/emet:init` und `/emet:doctor` führen `emet init` und
  `emet doctor .` in Claude Code aus und fassen das Ergebnis zusammen.
- `emet doctor` warnt vor `forge guard`- und `emet guard`-Hooks in
  `~/.claude/settings.json`, deren Binärdatei nicht mehr existiert, und gibt einen
  Befehl aus, der erst sichert und dann mit `jq` entfernt. Die Datei wird nie bearbeitet.
- Grundlagen des Maskottchens: eine Phase-Datei, das Pet-Bundle, eine Zustandsmaschine
  des Mods, die übrigen Phasen-Schreiber und Raster-Frames.
- `emet-mascot`, ein optionales Plugin, das ein Pixel-Maskottchen über dem Prompt zeigt
  und die Sitzung sowie die Phase des `emet`-Laufs widerspiegelt. Es ist im
  Marketplace gelistet, mit einer Anleitung für das Orca-Pet und ADR-0016.

### Behoben

- Das Plugin stellt keinen defekten doppelten Befehl `/emet:emet` mehr bereit;
  `commands/` ist auf `run.md`, `init.md` und `doctor.md` festgelegt.
- Die nächste Welle startet jetzt mit `/emet:run`, dem Befehl, den das Plugin
  registriert.

### Geändert

- Das Repository ist in die GitHub-Organisation `andryorelabs` umgezogen. Release-Downloads,
  die README-Badges und die Klon-URL zeigen jetzt auf
  `andryorelabs/emet`; die alten URLs `AndryOre/emet` werden weiterhin weitergeleitet.
- Eigenständige Installationen benennen `/emet` in `/emet:run` um, passend zum Plugin.
  `install.sh` installiert jetzt `commands/run.md`, `init.md` und `doctor.md` nach
  `~/.claude/commands/emet/`, sodass `/emet:run`, `/emet:init` und `/emet:doctor`
  auch ohne das Plugin verfügbar sind. Die alte `~/.claude/commands/emet.md` wird
  entfernt, wenn sie unbearbeitet ist; eine bearbeitete Kopie bleibt erhalten und wird in der
  Installationszusammenfassung aufgeführt.

## 0.2.0

2026-11-05

### Geändert

- Das Projekt wurde von claude-forge in emet umbenannt: Die CLI heißt `emet`, der
  Befehl `/emet`, die Agents `emet-worker` und `emet-reviewer`, und die
  README trägt die neue Marke. Bestehende Installationen und Repos funktionieren weiter:
  Legacy-Namen (`forge.config.json`, `.forge/`, `docs/agents/forge.md`,
  `FORGE_*`) werden weiterhin mit einem Hinweis gelesen, und `emet migrate` bringt ein Repo auf
  die neuen Namen.

### Hinzugefügt

- `install.sh` funktioniert ohne Bun: Es installiert den Shim der eigenständigen Binärdatei als
  `~/.local/bin/emet`, schreibt Plugin-Platzhalter in den kopierten Prompts um,
  installiert `commands/run.md` als `~/.claude/commands/emet.md` und akzeptiert
  `shasum -a 256` anstelle von `sha256sum`.
- Die README nennt die tatsächlichen Voraussetzungen, beide Installationswege und die
  Reihenfolge `/setup-matt-pocock-skills`, dann `emet init`.
- Agent-Leitfaden (`AGENTS.md`), Domänenglossar (`GLOSSARY.md`) und Architecture
  Decision Records unter `docs/adr/`.
- Lokaler Markdown-Tracker nach der `.scratch/`-Konvention, mit einer `emet tracker`-CLI
  (`create-spec`, `create-ticket`, `frontier`, `set-state`, `comment`,
  `close`) und mit lokaler Unterstützung in `emet validate`, `preflight` und `doctor`.
- `landing.mode` (`pr` oder `merge`) und `emet land`, das eine Welle als einen
  lokalen Merge ohne PR landet; `emet cleanup` und `emet status` vergleichen im Merge-Modus
  mit dem lokalen Trunk.
- Eigenständige `emet`-Binärdateien, `emet --version`, macOS-Unterstützung in der CI sowie in der
  Prozessbaum- und Speicherbremse, und Plugin-Manifeste mit einem `bin/emet`-Shim.
- Skills-Vertrag mit `emet skill-path` und ein erweitertes `emet doctor`, das
  Skills, Glossar, Deprecations und doppelte Installationen abdeckt.
- Sprachneutrale `emet init` und `emet map` für JS-, Go-, Rust- und Python-Repos.
- ADR-0007 bis ADR-0011.
- Dokumentationsindex, Architektur-Code-Karte, Fehlerbehebung nach Symptom, eine
  ausführlichere PR-Vorlage und `emet/AGENTS.md` mit den reinen Laufzeitregeln.

### Geändert

- `gh` ist nur erforderlich, wenn `tracker.kind` den Wert `github` hat oder `landing.mode` den Wert
  `pr`.
- `emet init` wählt den lokalen Tracker nicht mehr standardmäßig.
- ADR-0004 wurde angepasst: Eine Welle landet als ein PR oder ein lokaler Merge.

## 0.1.0

2026-11-03

### Hinzugefügt

- Der globale Befehl `/forge`: Interview, Spec, Tickets, eine Freigabe, dann
  parallele Worktree-Agents, die ein Feature unbeaufsichtigt implementieren, testen und mergen.
- Die `forge`-CLI mit den Unterbefehlen `init`, `doctor`, `preflight`, `selftest`, Claims, Slots,
  Gates, Handoff-Prüfungen, Ergebnisse und Metriken.
- Die Agents `forge-worker` und `forge-reviewer`.
- Tracker für Linear und GitHub Issues.
- Konfiguration pro Repo über `forge.config.json`.
- `install.sh`, das die CLI, den Befehl und die Agents installiert.
