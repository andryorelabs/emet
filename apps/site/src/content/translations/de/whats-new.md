---
title: Neuigkeiten
description: Release Notes für emet: was sich in jeder Version geändert hat.
seoTitle: "Neuigkeiten in emet: Release Notes"
sourceHash: ffd419a534a47352
---

## 0.6.0

2026-11-10

### Hinzugefügt

- Eine Mailbox für Codex-Worker: `emet ask` zeichnet eine Frage auf (und fragt mit `--wait` die Antwort ab), `emet inbox` listet offene Fragen auf und `emet reply` beantwortet eine, sodass ein Worker nicht mehr über eine Übergabenotiz eskalieren muss.
- `emet dispatch --wait` gibt `question <ticket> <id>` aus, solange ein laufender Worker eine offene Frage hat, und stuft diesen Worker nie als hängend ein.
- `emet claims --reserve` speichert die Bearbeitungsflächen des Tickets und lehnt eine Reservierung ab, die sich mit den Flächen eines anderen Laufs überschneidet.

### Behoben

- `emet dispatch --wait` liest Ergebnisse aus dem Laufverzeichnis im git-common-dir, wo `emet results --write` sie schreibt.

## 0.5.2

2026-11-10

### Geändert

- Der Hinweis zur fehlenden Verbindung nennt neben Anthropic jetzt auch OpenAI.
- Die Installations-Tabs der Startseite heißen Claude Code, und der Run-Befehl hat einen Codex-Tab mit `$emet:run`.
- Die Anleitungen kennzeichnen, welche Schritte für welchen Agent-Host gelten: Claude Code oder Codex.

### Behoben

- `emet doctor`, `emet init`, `emet dependencies` und `emet preflight` geben auf dem Codex-Host keine reinen Claude-Code-Hinweise mehr aus.
- `emet init --force` behält `agentHost` und den Abschnitt `codex` der bestehenden Konfiguration.

## 0.5.1

2026-11-10

### Geändert

- Das README, die Startseite, das Banner, die Guides und die Share-Bilder nennen Codex neben Claude Code.

## 0.5.0

2026-11-10

### Hinzugefügt

- Die Startseite der Website: gemaltes Hero, Funktionsweise, Features, Über uns,
  Abschlussbereich, Header und Footer, mit englischen Texten in
  `apps/site/src/i18n/ui/en.ts`.
- Die Website-Dokumentation unter `/docs/`: Starlight-Seiten, erzeugt aus einer
  Allowlist von Repository-Dokumenten und diesem Changelog, mit Pagefind-Suche,
  Umschreiben von Links auf Seiten der Website oder GitHub und einem
  englischen Fallback-Hinweis für fehlende oder veraltete Übersetzungen.
- `docs/how-to/update-emet.md`: wie man die Plugins aktualisiert und das
  automatische Marketplace-Update einschaltet.
- Codex als Agent host: `agentHost` in `emet.config.json`, `emet dispatch` und
  `emet review-run` starten jeden Worker und Reviewer als `codex exec`-Prozess,
  die Skills `$emet:run`, `$emet:init` und `$emet:doctor`, das Codex-Plugin-Manifest
  und der optionale End-to-End-Test (`EMET_CODEX_E2E=1`).
- `docs/guide/codex.md`, der Codex-Leitfaden, auf der Website veröffentlicht.

### Geändert

- Der Standardwert von `codex.sandbox` ist `danger-full-access`
  (`workspace-write` wird weiterhin akzeptiert); ihn übergeben `emet dispatch`,
  `emet review-run` und ein Codex-`emet launch`; `emet guard` verweigert unter
  Codex jede Push-Form.
- Das Codex-Overlay pro Lauf schreibt eine eigene minimale `config.toml`, statt
  deine zu verlinken, und seine Regeln erlauben die `-C`-Formen und die
  Koordinations-Unterbefehle, während Pushen verboten bleibt.
- Codex-Worker werden über ihre `threadId` und ihren JSONL-Pfad identifiziert,
  nicht über ihre pid.
- Der Codex-Leitfaden berichtet die echten Codex-Ergebnisse: jede frühere
  `failed`-Zeile ist `verified`, die `unverified`-Liste schrumpft auf die
  unbeaufsichtigte Überwachung, und der Probe-Bericht listet die verbleibenden
  Folgeaufgaben auf.

### Behoben

- `emet cleanup` holt gelandete Worktrees ohne Besitzer zurück.
- Der Codex-Agent-host wird standardmäßig aufgelöst, sodass `emet preflight`,
  `doctor`, `cleanup`, `status` und `usage` `agentHost: "codex"` akzeptieren.
- Die Codex-Modellauflösung liest `models_cache.json` aus dem Lauf-Home oder
  deinem echten Codex-Home.

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
