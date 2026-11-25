---
title: CLI-Referenz
description: Jeder emet-Unterbefehl, die Tabelle der Gates und Aufzeichnungen, Exit-Codes und Umgebungsvariablen.
seoTitle: emet-CLI-Referenz
sourceHash: cde063f67e8e54d7
---

Jeder `emet`-Unterbefehl, die Gates und Aufzeichnungen, Exit-Codes und Umgebungsvariablen. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md). Zurück zur [README](../../README.md). Jeder Befehl gibt seine Verwendung mit `--help` aus.

## Unterbefehle

Drei Slash-Befehle umhüllen die CLI innerhalb von Claude Code: `/emet:run` (die Pipeline), `/emet:init` (`emet init`) und `/emet:doctor` (`emet doctor .`). Unter Codex sind es die Skills `$emet:run`, `$emet:init` und `$emet:doctor`. Ein `emet` in einem normalen Terminal benötigt `emet self install`; andernfalls `! emet <subcommand>` innerhalb einer Sitzung ausführen.

`emet <command> [...args]`. `emet --version` gibt die Version aus.

In einem beliebigen Git-Repo:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

`emet init` hinterlässt in den erzeugten `docs/agents/*.md`-Dateien eine `TODO(emet):`-Markierung für alles, was es nicht selbst ableiten kann (eine gemeinsame Sperre der Testdatenbank, die Schema-Zuständigkeit und so weiter). Diese ausfüllen; `emet preflight` verweigert den Dispatch, solange eine übrig ist.

Dann innerhalb von Claude Code (unter Codex `$emet:run` mit denselben Argumenten verwenden):

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## Einrichtung und Prüfung

### `emet migrate`

Benennt ein Legacy-Repo auf die emet-Namen um.

- `--dry-run`

### `emet init`

Erkennt Paketmanager, Trunk-Branch, Tracker-Art und After-Spec-Modus automatisch (siehe [`handoff.afterSpec`](configuration.md#handoff)). Es setzt [`schema.ownedPaths`](configuration.md#schema), wenn es ein Prisma-Schema (`prisma/schema.prisma` oder einen Ordner `prisma/schema/`) oder einen Drizzle-Migrationsordner (`drizzle/` neben einer `drizzle.config.*`) findet, und schreibt `emet.config.json` und die `docs/agents/*.md`-Dateien.

- `--tracker linear|github|local`: `--tracker local` richtet den lokalen Tracker ein.
- `--after-spec release|promote|none`
- `--force`

### `emet doctor`

Schreibgeschützte Prüfung beliebig vieler Repos auf einmal; Standard ist das aktuelle Verzeichnis.

- `--all`
- `<path> ...`: die zu prüfenden Repos.

Für ein Repo, das [`verify.browser`](configuration.md#verify) konfiguriert, meldet es außerdem einen optionalen Befund zu `agent-browser`: Eine fehlende Binärdatei ist `indeterminate` (eine `optional:`-Zeile mit einer Installationsanleitung), und wenn die Binärdatei existiert, erscheint ein fehlschlagendes `agent-browser doctor` als Warnung. Beides ist nie ein Fehler und ändert nie den Exit-Code. Ein Repo ohne `verify.browser` zeigt nichts.

#### Flottenprüfung

`emet doctor` prüft mehrere Repos auf einmal, schreibgeschützt:

```bash
emet doctor ~/code/*
```

Der Bericht enthält pro Repo: eine gültige `emet.config.json`, alle vier vorhandenen `docs/agents/*.md`-Dateien, keine übrig gebliebenen `TODO(emet):`-Markierungen, ob die Befehle in `commands.selfCheck` tatsächlich aufgelöst werden, sowie die trackerspezifischen Abhängigkeitsbefunde des Repos (`gh`, Linear; siehe [Abhängigkeiten](dependencies.md#was-was-prüft)).

Das Plugin mattpocock-skills und die Flags der externen CLIs werden einmal für den gesamten Durchlauf geprüft, nicht pro Repo. Das sind `gh` sowie die des Agent-Hosts: `claude --bg` und `claude agents --json` unter Claude Code, `codex exec --json` und `--output-schema` unter Codex, geprüft über `--help`.

### `emet setup`

Bietet die optionalen Installationen über readline-Abfragen an.

- `--yes`
- `--with <ids>`
- `--list`
- `--json`
- `--dry-run`: kombinierbar mit `--with`, `--yes` und `--json`. Es gibt die geplanten Schritte jedes gewählten Eintrags aus, oder `already-present`, und ändert nichts: Es führt keinen Befehl aus, schreibt keine Datei und keinen Ledger-Eintrag und beendet sich mit 0.
- `--restore <id>`: macht eines der beiden wiederherstellbaren Elemente rückgängig; siehe [Setup-Ledger und Wiederherstellung](#setup-ledger-und-wiederherstellung).

Ohne TTY oder mit `--yes` oder `--with` fragt es nichts und installiert genau die genannten Einträge; ohne TTY und ohne `--with` installiert es nichts und gibt den `--list`-Katalog aus. Jeder Schritt meldet `installed`, `already-present`, `skipped` oder `failed`; ein Fehlschlag stoppt die anderen nicht, und der Exit-Code ist 1, wenn einer fehlgeschlagen ist. `/emet:setup` ist der Plugin-Einstieg und stellt dieselben Fragen mit `AskUserQuestion`. Jeder Eintrag mit `installed` wird im Setup-Ledger festgehalten.

Die Einträge:

- `mattpocock-skills` (standardmäßig an), `engram`, `mascot`, `orca-pet` und `gh-auth`.
- `agent-browser` (standardmäßig aus): führt `bun add -g agent-browser@latest` und dann `agent-browser install` aus und schreibt `~/.agent-browser/config.json` mit `contentBoundaries: true` und `maxOutput: 50000` nur, wenn diese Datei nicht existiert. Danach führt es `agent-browser doctor` aus und gibt eine Warnung aus, wenn es fehlschlägt. Es pinnt nie eine Version und übergibt nie `--with-deps`; fehlen Systembibliotheken, gibt es daher den Befehl aus, den du selbst ausführst.
- `context7` (standardmäßig aus): führt `bun add -g ctx7@latest` aus, dann `ctx7 setup --cli --claude --yes` und `ctx7 setup --cli --codex --yes` nur, wenn `codex` im PATH liegt. Es installiert die `ctx7`-CLI und ihren Skill `find-docs`, nicht den MCP-Server, pinnt nie eine Version und gibt den von Hand auszuführenden Befehl aus, wenn ein `ctx7 setup`-Schritt fehlschlägt. `ctx7` sendet anonyme Nutzungsereignisse, solange `CTX7_TELEMETRY_DISABLED=1` nicht gesetzt ist, und ein `CONTEXT7_API_KEY` in der Umgebung hat Vorrang vor dem mit `ctx7 login` gespeicherten Konto.
- `firecrawl-local` (standardmäßig aus): benötigt `cargo` und führt `cargo install firecrawl-local` aus, wenn die Binärdatei fehlt. Danach registriert es einen Claude-Code-MCP-Server im Nutzerbereich mit `FIRECRAWL_CLOUD=search` und `--public-only` und ersetzt dabei eine frühere Registrierung mit anderen Einstellungen. Scrape, Crawl und Map laufen auf der Maschine, nur die Websuche geht an Firecrawl Cloud, und private Adressen werden blockiert.
  - Es übergibt das neueste Chrome, das `agent-browser` heruntergeladen hat, als `FIRECRAWL_CHROME_PATH`.
  - Unter Linux, wo AppArmor unprivilegierte User-Namespaces einschränkt, gibt es ein AppArmor-Profil und die `sudo`-Befehle zum Laden aus, weil Firecrawl Local Chrome nie ohne dessen Sandbox ausführt.
  - Ohne ein nutzbares Chrome kommen Seiten, die mit JavaScript rendern, leer zurück.
- `claude-settings`: die empfohlenen Claude-Code-Einstellungen, nur bei Auswahl angewendet, nach einem Backup von `settings.json` mit Zeitstempel.

#### Setup-Ledger und Wiederherstellung

`emet setup` hält jeden Eintrag, der mit `installed` endet, in `setup-ledger.json` im Zustandsverzeichnis fest, als `{ id, at, undo }`. Ein Eintrag mit `already-present` hält nichts fest, und ein zweites `installed` derselben id behält den Vorzustand des ersten Eintrags. Ledger-Schreibvorgänge sind atomar, und ein fehlerhaftes Ledger ist ein Fehler, der seinen Pfad nennt, und wird nie als leer gelesen.

Die Undo-Einträge enthalten, was zum Zurücksetzen nötig ist:

- `claude-settings`: das vorherige `model` (oder keines), die tatsächlich hinzugefügten Deny-Regeln und der Backup-Pfad.
- `firecrawl-local`: der vorherige MCP-Eintrag im Nutzerbereich (vor dem Lauf von `claude mcp remove` aus `~/.claude.json` gelesen) und ob emet `cargo install` ausgeführt hat.
- Plugins: die Plugin-id.
- `orca-pet`: die geschriebenen Dateien.
- `agent-browser`: das globale Bun-Paket (und die Konfigurationsdatei, wenn emet sie angelegt hat).
- `context7`: das globale Bun-Paket.
- `engram`: die Brew-Formel und das Plugin.

`emet setup --restore <id>` akzeptiert nur `claude-settings` und `firecrawl-local`; jede andere id endet mit 2.

- `claude-settings` stellt das vorherige `model` wieder her (oder löscht den Schlüssel, wenn es keines gab) und entfernt nur die von emet hinzugefügten Deny-Regeln, nach einem Backup mit Zeitstempel. Ist das aktuelle `model` nicht das, das Setup gesetzt hat, behält es dieses und gibt eine Warnung aus.
- `firecrawl-local` führt `claude mcp remove firecrawl-local -s user` aus und dann `claude mcp add-json firecrawl-local '<previous json>' -s user`, wenn ein Eintrag festgehalten wurde.

Eine erfolgreiche Wiederherstellung entfernt den Ledger-Eintrag; eine id ohne Eintrag gibt `nothing to restore for <id>` aus und endet mit 1.

`emet uninstall` setzt jeden Ledger-Eintrag auf dieselbe Weise zurück: `claude-settings` und `firecrawl-local` wie bei `--restore`, Plugins mit `claude plugin uninstall <id>`, `orca-pet`-Dateien und eine von emet angelegte agent-browser-Konfiguration durch Löschen. Für globale Brew-, Bun- und Cargo-Pakete gibt es den Entfernungsbefehl aus (zum Beispiel `bun remove -g ctx7`) und führt ihn nie aus, und es berührt nie `gh auth`. Jeder zurückgesetzte Eintrag verlässt das Ledger, und ein fehlschlagendes Extra stoppt die anderen nicht.

### `emet self install`

Die eigenständige Installation: `emet self install [latest|X.Y.Z]`.

- `--dry-run`: listet jeden Schreibvorgang auf und schreibt nichts.
- `--force`: fährt fort, obwohl das emet-Plugin installiert ist; ohne es verweigert der Befehl, solange das Plugin installiert ist.
- `--from <checkout>`: reproduziert eine Bun-Quellinstallation. Der CLI-Quellcode wird nach `~/.claude/emet` kopiert, und `~/.local/bin/emet` wird zu einem Wrapper, der `bun` darauf ausführt, sodass `emet selftest` funktioniert; ohne `bun` schlägt er fehl. Mitwirkende verwenden `emet self install --from .`.

Er legt die Binärdatei unter `~/.local/share/emet/versions/<v>/emet` mit dem Symlink `~/.local/bin/emet` ab, schreibt die Referenz-Prompts und `.install-manifest.json` nach `~/.claude/emet/`, die Befehle nach `~/.claude/commands/emet/` und die Agents nach `~/.claude/agents/`.

Er führt die emet-Hooks in `~/.claude/settings.json` zusammen (mit Backup, fremde Hooks bleiben unberührt) und schreibt, wenn Codex vorhanden ist, die Skills unter `~/.agents/skills` und hängt die Hooks an `$CODEX_HOME/hooks.json` an (Standard `~/.codex`; `config.toml` wird nie geschrieben, daher die Hooks einmal mit `/hooks` freigeben).

Ein zweiter Lauf ändert nichts; eine bearbeitete Datei bleibt erhalten, und die neue Version landet daneben als `<file>.new`. Das Einzeiler-Installationsskript aus [Installation](../start/install.md) lädt die Release-Binärdatei herunter, verifiziert `SHA256SUMS` und führt diesen Befehl aus.

### `emet self update`

`emet self update [latest|X.Y.Z]` lädt das Release herunter, verifiziert `SHA256SUMS` (und die Attestierung, wenn `gh` vorhanden ist) und stellt es bereit. Der Austausch des Symlinks und der installierten Dateien geschieht nur, wenn kein Worker-Slot belegt ist; andernfalls bleibt er bis zum nächsten Sitzungsstart ausstehend. Ein Fehlschlag lässt die aktuelle Version unberührt und wird im Journal festgehalten. Die vorherige Version wird für einen Rollback behalten, ältere werden entfernt. Für Plugin-Installationen tut er nichts.

- `--auto [off|on]`: was der `SessionStart`-Hook ausführt. Er läuft höchstens einmal am Tag, abgekoppelt und still, wenn offline; `off` oder `on` schaltet ihn um. `EMET_AUTO_UPDATE=0` deaktiviert ihn ebenfalls.

### `emet uninstall`

Entfernt eine Installation per `emet self install` und das, was `emet setup` hinzugefügt hat. Er erstellt zuerst den gesamten Plan und führt ihn dann aus.

- `--dry-run`: gibt den Plan aus und ändert nichts.
- `--yes`: überspringt die Bestätigung. Mit TTY und ohne `--yes` fragt er einmal, und ohne TTY und ohne `--yes` gibt er den Plan aus, ändert nichts und endet mit 0.
- `--purge`: entfernt außerdem das Zustandsverzeichnis (`EMET_STATE_DIR`, sonst `XDG_STATE_HOME/emet`) und `~/.emet`; ohne ihn bleiben beide.
- `--json`: gibt das Ergebnis als JSON aus.

Was er entfernt:

- Jede Datei im Installationsmanifest, deren Hash noch dem festgehaltenen entspricht, samt ihrer `.new`-Geschwisterdatei; bearbeitete Dateien bleiben und werden aufgelistet.
- Den Shim `~/.local/bin/emet`, nur wenn er der Wrapper der Installation oder ein Symlink nach `~/.claude/emet` oder `~/.local/share/emet/versions` ist, danach das Manifest und die leer gewordenen Verzeichnisse.
- Aus `~/.claude/settings.json` und aus `$CODEX_HOME/hooks.json` (Standard `~/.codex`) jeden emet-Hook-Befehl in jedem Ereignis (`emet guard`, `emet setup --notice`, `emet whats-new --hook` und `emet self update --auto`). Jeden anderen Hook behält er und entfernt leer gewordene Gruppen und Ereignisse.
- Die Codex-Skills unter `~/.agents/skills/emet/`, die noch zu diesem emet passen (bearbeitete bleiben und werden aufgelistet), das Versionsverzeichnis `~/.local/share/emet/versions` und den Installationszustand `~/.local/share/emet/install.json`.
- Die Extras des Setup-Ledgers (siehe [Setup-Ledger und Wiederherstellung](#setup-ledger-und-wiederherstellung)).

Enthält ein Installations-Backup (`.pre-emet-guard-backup.`) genau das, was übrig bleibt, werden dessen Bytes wiederhergestellt; bleibt nichts übrig, wird die Datei entfernt; andernfalls wird zuerst ein Backup mit Zeitstempel geschrieben.

Ohne Manifest oder Installationszustand (eine Plugin-Installation) überspringt er die Dateien und gibt `claude plugin uninstall emet@emet-marketplace` aus; liegt `codex` im PATH, gibt er außerdem aus, wie das Codex-Plugin entfernt wird. Er endet mit 1, wenn ein Schritt fehlgeschlagen ist oder eine Datei, die er lesen muss (Manifest, Einstellungen, Ledger), nicht lesbar ist, und nennt diesen Pfad.

### `emet whats-new`

Gibt nach emet-Updates einen einmaligen Hinweis aus.

- `--hook`: die Form, die der `SessionStart`-Hook ausführt.

### `emet fleet`

Arbeitet über die Git-Repos mit einer `emet.config.json` eine Ebene unter `--root` (Standard `~/code`). Siehe den [Fleet-Leitfaden](../how-to/check-a-fleet.md).

- `emet fleet list [--root <dir>] [--json]`: listet die Repos mit `tracker.kind`, `handoff.autoChain` und `models.worker` auf.
- `emet fleet set <key> <value> [--root <dir>] [--dry-run]`: ändert einen Konfigurationsschlüssel in jedem aufgelisteten Repo und validiert vorher über den Config-Loader (ein ungültiger Wert ändert nichts und endet mit 1).
- `emet fleet launch --feature <text> [--root <dir>] [--repos <a,b>] [--dry-run]`: öffnet in jedem Repo eine `/emet:run --draft <text>`-Sitzung nach den Bereitschaftsprüfungen von `emet chain`. `--dry-run` gibt die geplanten Starts aus, ohne eine Sitzung zu starten.
- `emet fleet status [--json]`: liest das globale Journal und gibt pro Repo den letzten Zustand jeder Sitzung der letzten 24 Stunden aus (`ended` ausgenommen).

`fleet status` gibt pro Repo eine Zeile `<repo>: <b> blocked, <w> working, <i> idle` aus, blockierte Repos zuerst. `--json` gibt `{repos: [{repo, sessions: [{sessionId, state, blocked, since, runId}]}], blocked: <count>}` aus. Es endet auch ohne Sitzungen mit 0.

### `emet preflight`

Bestätigt, dass das Repo dispatch-bereit ist.

- `--run <id>`
- `--post-dispatch`

### `emet skill-path`

`emet skill-path <name>` gibt den absoluten `SKILL.md`-Pfad eines mattpocock-skills-Skills aus. Endet mit 1, wenn der Skill nicht gefunden wird.

### `emet selftest`

Führt die eigenen Unit-Tests der CLI aus. Nur für Quellinstallationen; eine kompilierte Binärdatei endet mit 1 und weist darauf hin, `emet doctor` auszuführen.

## Läufe, Worker und Slots

### `emet claims`

Reserviert ein Ticket für einen Lauf: `emet claims --reserve <ticket> --run <id> --anchor <pid>`.

- `--release <ticket>`: gibt einen Claim frei.
- `--list`: listet Claims auf.
- `--prune [--dry-run]`: entfernt veraltete Claims.

### `emet slots`

Nimmt einen Worker-Slot aus dem hostweiten Pool in `~/.local/state/emet/slots`: `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`.

- `--release --run <id>`: gibt die Slots des Laufs frei.
- `--release-index <index>`: gibt einen Slot frei.
- `--list`: listet die Slots auf.

### `emet cleanup`

`emet cleanup [--run <id> | --all] [--dry-run] [--force]`. Ohne Argumente räumt es geschlossene oder tote Läufe auf, deren Arbeit gelandet ist. Nach einem Merge gibt `emet cleanup --run <runId>` die Branches, Ticket-Claims und Worker-Slots der Welle frei.

- `--run <id>`: räumt diesen Lauf auf.
- `--all`: ein repoweiter Branch-Durchlauf.
- `--dry-run`
- `--force`

In jedem Modus löscht es außerdem jeden lokalen Branch, dessen PR am Spitzen-Commit des Branches gemergt wurde, zusammen mit dem sauberen, nicht gesperrten Agent-Worktree, der ihn enthält.

### `emet lock-reason`

`emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]` gibt den `git worktree lock`-Grund aus, den ein Worker beim Bootstrap schreibt.

### `emet launch`

`emet launch <spec-id> --wave <n>`: startet unter Claude Code eine Welle als `claude --bg`-Sitzung und öffnet ihren Orca-Tab gemäß `handoff.launcher` (zu Codex siehe [Codex-Host](#codex-host)). Es erledigt den gesamten Start (Prüfung auf doppelte Sitzungen, `claude --bg`, Tab) und gibt `{ name, id, attach, orcaTab: { opened, reason } }` aus. Dieses Kommando verwenden, nicht ein nacktes `claude --bg`, wann immer du eine Welle von Hand in einer anderen Sitzung haben willst.

### `emet chain`

`emet chain --ticket <id> --spec <id> --wave <n> [gate flags]` führt `emet gate` mit den übergebenen Gate-Flags aus und startet die nächste Welle nur, wenn die Entscheidung `chain` ist.

Vor dem Start prüft es die Bereitschaft (freier Hauptspeicher des Hosts, freier Speicherplatz und Inodes im Repo und in `/tmp`, die `orca`-CLI) und bestätigt danach, dass die Kindsitzung aufgelistet ist. Jede andere Entscheidung, ein blockierendes Bereitschaftsproblem (`low-memory`, `low-disk`, `low-inodes`, `orca-unavailable`) oder eine bestehende Sitzung für dieselbe Spec und Welle endet mit 1 samt den Gründen und startet nichts.

### `emet status`

`emet status [--spec <id>] [--brief]` gibt pro Welle Working / Checking / Ready / Needs-decision als JSON plus eine Zusammenfassungszeile aus. `emet status --help` dokumentiert das JSON.

- `--spec <id>`
- `--brief`: gibt stattdessen höchstens drei Zeilen aus: den Gesamtzustand, was auf eine Person wartet (falls etwas wartet) und die nächste Aktion.

Das JSON enthält außerdem `sessions: [{sessionId, state, blocked, since, runId}]`: den letzten Aufmerksamkeitszustand jeder emet-eigenen Sitzung dieses Repos innerhalb der letzten 24 Stunden, `ended`-Sitzungen ausgenommen. `blocked` ist true, wenn `state` `needs-decision` ist, und `since` ist der Zeitpunkt dieses Zustands. Jede blockierte Sitzung macht den Gesamt-`state` zu `needs-decision`, auch wenn keine Welle aktiv ist; die Zusammenfassungszeile nennt, wie viele Sitzungen blockiert sind, und `--brief` listet sie in der Zeile für das auf, was auf eine Person wartet.

### `emet run`

`emet run current [--json]` gibt den aktiven Lauf des Repos aus (Lauf-id, Spec, Welle, Phase und letzte Aktualisierung), gelesen aus `.emet/phase.json`. Ohne aktiven Lauf gibt es `no active run` aus und endet mit 0.

### `emet memory`

Sucht und speichert Lessons in [Engram](https://github.com/Gentleman-Programming/engram).

- `emet memory search --json <query> [--limit <n>]`: sucht nach Lessons aus früheren Läufen. Es sucht mit `match_mode: "any"` (`--limit` ist standardmäßig 5, maximal 20), behält nur Notizen, deren Topic-Key mit `emet/<repo>/lessons/` beginnt, und gibt `{available: true, results: [{id, topicKey, title, content}]}` aus, wobei `content` auf 2000 Zeichen gekürzt wird. `<repo>` ist das letzte Pfadsegment von `git remote get-url <repo.remote>` ohne `.git`, sonst der Basisname des Haupt-Worktrees.
- `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <landed|chained|hold|stop|blocked>`: liest 1 bis 5 Lesson-Stichpunkte (`- `-Zeilen mit höchstens 300 Zeichen) von stdin und hängt sie als Abschnitt `## <runId> — <outcome> (<date>)` an die Notiz mit dem Topic-Key `emet/<repo>/lessons/<key>` an oder legt diese Notiz an. Eine Notiz über 20000 Zeichen verliert ihre ältesten Abschnitte. Es gibt `{available: true, saved: true, topicKey}` aus.

Beide Unterbefehle sprechen mit Engram, indem sie `engram mcp --tools=agent` im Repo-Root starten; das Engram-Plugin ist nicht erforderlich. Sie übergeben Engram nie ein `project`.

Exit-Codes: `2` bei falscher Verwendung (kein Unterbefehl, eine fehlende Abfrage, keine Stichpunkte, mehr als 5 Stichpunkte, ein Stichpunkt über 300 Zeichen, ein unbekanntes Ergebnis, ein ungültiger Key). Jedes Engram-Problem (nicht im PATH, ein fehlgeschlagener Handshake, ein Tool-Fehler, ein Timeout, fehlerhaftes JSON) endet mit `0`.

- Vor einem erfolgreichen Handshake lautet die Ausgabe `{available: false, reason}`.
- Danach lautet die Ausgabe `{available: true, results: [], reason}` für `search` oder `{available: true, saved: false, reason}` für `save`.
- `memory.enabled: "off"` gibt `{available: false, reason: "memory.enabled is off"}` aus und startet nichts. Siehe [`memory`](configuration.md#memory).

### `emet insights`

Liest das [Ereignisjournal](../concepts/attention-and-journal.md) und berichtet Läufe nach Ursprung (menschlich oder automatisch), Gate-Entscheidungen nach Entscheidung und Grund, menschliche Eingriffe pro Lauf, Start-Ergebnisse und geschlossene Tickets. Unlesbare Zeilen werden übersprungen und gezählt. Ein leeres oder fehlendes Journal gibt einen Nullbericht aus und endet mit 0.

- `--since <iso|7d|30d>`
- `--repo <path>`
- `--all`
- `--json`
- `--mark-baseline`: hängt eine Baseline an; spätere Berichte decken nur Ereignisse danach ab, außer `--all` ist angegeben.

### `emet usage`

Berichtet die Sitzungsnutzung.

- `--session <id>` oder `--file <path>`
- `--stalled [--minutes N]`: listet festgefahrene Worker auf.
- `--project-dir <path>`

### `emet handoff`

`emet handoff --check <path> [--expect-skills a,b] | --render <path>` validiert oder rendert die Notiz `.emet/handoff-<ticket>.md` eines Workers.

- `--check <path>`: validiert die Notiz. Eine bestandene Prüfung gibt `missing skills: …` aus, wenn die Liste `missing` nicht leer ist.
- `--expect-skills a,b` (nur mit check): lässt die Prüfung für jeden genannten Skill fehlschlagen, der weder in der Liste `loaded` noch in der Liste `missing` steht.
- `--render <path>`: rendert die Notiz.

Die Notiz kann einen Abschnitt `skills:` enthalten, geschrieben als `skills: none` oder `skills: loaded: a, b; missing: c`. Er ist nur erforderlich, wenn `state` `done` ist, und jeder andere Wert lässt die Prüfung fehlschlagen.

### `emet metrics`

`emet metrics [--run <id>]` berichtet Tokens, API-äquivalente Kosten und Laufzeit pro Ticket, pro Welle und pro Lauf, gelesen aus den Sitzungsprotokollen. Es vergleicht außerdem das pro Ticket geschätzte Kontextbudget mit dem, was jeder Worker tatsächlich verbraucht hat. Seine Zusammenfassung steht am Ende des Abschlussberichts des Laufs.

### `emet ask`

Das Worker-Postfach: fragt den Koordinator oder wartet auf die Antwort.

- `--run <id>`
- `--ticket <ticket>`
- `--body <text>`: sendet die Frage.
- `--wait <n>`: wartet auf die Antwort.
- `--slice <seconds>`

Mit `--wait` bedeutet Exit `0` eine Antwort, `3` ein Slice-Timeout und `4` abgelaufen.

### `emet inbox`

`emet inbox --run <id>` listet die offenen Worker-Fragen als JSON auf.

### `emet reply`

`emet reply --run <id> --ticket <ticket> --id <n> --body <text>` beantwortet eine Worker-Frage.

## Planung, Review und Landing

### `emet promote`

`emet promote --spec <id> [--dry-run] [--no-promote] [--hold]` ist der After-Spec-Schritt gemäß [`handoff.afterSpec`](configuration.md#handoff).

- `--dry-run`: öffnet keinen Pull Request.
- `--no-promote`: überspringt den Schritt.
- `--hold`: schreibt die Markierung `<run dir>/runs/<id>/no-promote` und gibt `{"held":true}` aus. Solange sie existiert, endet `emet promote --spec <id>` mit 0 und einer `skipped`-Notiz und öffnet keinen Pull Request, sodass `--no-promote` über die Sitzungen einer Spec hinweg erhalten bleibt.

Im Modus `promote` öffnet es einen Pull Request `develop` nach `main` mit dem Titel `chore: 🔖 promote develop`, wartet mit `emet ci --pr <n> --wait` und mergt ihn nur dann mit einem Merge-Commit, wenn der Zustand `pass` ist. Danach, nur wenn `main` Inhalte enthält, die `develop` fehlen (der Vergleich `develop...main` listet mindestens eine geänderte Datei; Merge-Commits allein zählen nicht), öffnet es einen Sync-Pull-Request `main` nach `develop`, wartet auf dessen Checks auf dieselbe Weise und mergt ihn mit [`pr.mergeMethod`](configuration.md#pr) nur dann, wenn der Zustand `pass` ist. Enthält `main` nur Merge-Commits, wird kein Sync-Pull-Request geöffnet, und `syncReason` nennt den Grund. Ein Sync-Pull-Request, dessen Zustand `fail`, `timeout` oder `env-fault` ist oder dessen Merge abgelehnt wird, bleibt offen und ändert nie das Promote-Ergebnis.

Es hängt ein `promote`-Ereignis mit der Pull-Request-Nummer, `merged`, `syncPrNumber`, `syncMerged`, `syncReason`, `rule` und `reason` an das Journal an. `afterSpec` kann eine Regelliste sein; der Modus wird dann anhand der Pfade gewählt, die das Promoten von `develop` mitnähme (siehe [`handoff.afterSpec`](configuration.md#handoff)), und ein fehlschlagendes `git fetch` oder `git diff` lässt den Befehl mit 1 enden, bevor ein Pull Request geöffnet wird.

Das ausgegebene Ergebnis enthält:

- `rule`: den Index der passenden Regel, oder `null` für die String-Form oder ohne Treffer.
- `reason`.
- `syncPrNumber`: `null`, wenn kein Sync-Pull-Request geöffnet wurde.
- `syncMerged` und `syncReason`: ein Satz, der sagt, warum ein Sync-Pull-Request offen blieb, sonst `null`.
- `deployCheck: { run, reason }`: gibt an, ob der Koordinator `emet deploy-check` ausführen soll.

Im Modus `release` mergt es nichts und überlässt den Release-Pull-Request einer Person. Mit `afterSpec` `none`, mit `--no-promote`, mit einer angehaltenen Spec oder wenn die letzte Welle der Spec offen gelassen oder markiert wurde, endet es mit 0 und einer `skipped`-Notiz. Es läuft dennoch nach einer sauberen letzten Welle, damit das Ergebnis die `deployCheck`-Entscheidung enthält (auf dem Trunk `main` läuft die Deploy-Prüfung unabhängig vom Modus). Eine CI, die nicht `pass` ist, mergt nichts und endet mit 1.

### `emet deploy-check`

Führt `deploy.check.command` aus, bis es mit 0 endet, höchstens `retries` Versuche lang oder `timeoutSeconds`, mit `intervalSeconds` Wartezeit dazwischen, und gibt `state: ok | failed | timeout` mit `attempts` aus.

- `--json`

Exit `0` ok, `1` failed, `3` timeout. Ohne konfiguriertes `deploy.check` endet es mit 0 und `skipped: "no deploy check configured"`. Der Koordinator führt es nur aus, wenn das Ergebnis von `emet promote` `deployCheck.run` true hat. Siehe [`deploy`](configuration.md#deploy).

### `emet surfaces`

`emet surfaces --check <file.json | ->` weist überlappende Globs erlaubter Flächen zwischen den Tickets einer Welle zurück.

### `emet assess`

`emet assess --base <ref> --head <ref>` klassifiziert einen Diff als `passive`, `medium` oder `high` und gibt JSON mit der Stufe, den Gründen und dem empfohlenen Reviewer-Modell samt Aufwand aus. Siehe [Modelle und Aufwand](../../README.md#models--effort) und [`review`](configuration.md#review).

- `--quick`: das JSON enthält zusätzlich `"quickRejected": true|false`, und der Befehl endet mit Exit 1, wenn die Stufe `high` ist (ein **Stop** für einen **Quick run**: kein Auto-Merge, der PR bleibt offen), sonst mit 0. Ohne `--quick` bleiben Ausgabe und Exit-Codes unverändert.

Das JSON enthält außerdem zwei Entscheidungen:

- `browserVerify: { run, reason }`: `run` ist nur dann `true`, wenn die Stufe einen Reviewer hat, [`verify.browser`](configuration.md#verify) konfiguriert ist, die Binärdatei `agent-browser` im PATH liegt und, falls `paths` gesetzt ist, ein geänderter Pfad passt. Andernfalls nennt `reason` die erste nicht erfüllte Bedingung.
- `dualReview: { run, reason }`: `run` ist nur dann `true`, wenn die Stufe `high` ist, `agentHost` `claude` ist, [`review.dual`](configuration.md#review) nicht `off` ist und die Binärdatei `codex` im PATH liegt. Andernfalls nennt `reason` die erste nicht erfüllte Bedingung.

### `emet land`

`emet land --spec <s> --branch <integration> --tickets <id,...>` mergt einen Integrations-Branch in den lokalen Trunk (`landing.mode` `merge`). `commands.selfCheck` ersetzt die CI, und nichts wird gepusht.

### `emet spec-branch`

`emet spec-branch ensure|integrate|status|sync|land|abandon --spec <id>` verwaltet den Spec-Branch `spec/<id>` von `landing.unit: spec` (siehe [`landing`](configuration.md#landing)). Alle geben JSON aus.

- `ensure`: legt den Branch vom Trunk aus an (idempotent), schreibt `.emet/specs/<id>/branch.json` und verweigert, wenn der Branch einer anderen Spec ausgecheckt ist.
- `integrate --wave <n> --branch <integration> --tickets a,b`: mergt den Wellen-Branch mit `--no-ff` und den Trailern `Emet-Wave` und `Emet-Tickets` in `spec/<id>`, hält die Welle fest, hängt `spec.integrate` an und pusht, wenn `landing.pushSpecBranch` true ist, den Branch ohne einen PR zu öffnen.
- `status`: gibt `branch`, `tip`, die integrierten Wellen und Tickets und `behindTrunk` aus und baut `branch.json` aus den Trailern neu auf, wenn eine Welle fehlt.
- `sync`: mergt den Trunk in den Branch, rebased nie, und bricht bei einem Konflikt ab, listet die Pfade auf und endet mit einem Wert ungleich null.
- `land [--partial]`: synchronisiert, dann pusht es im Modus `pr` den Branch, öffnet einen PR mit einer `Closes`-Zeile pro Ticket, wartet auf dessen Checks und mergt ihn mit `landing.specMergeMethod` (standardmäßig ein Merge-Commit, `pr.mergeMethod` wird ignoriert). Im Modus `merge` mergt es mit `--no-ff` in den lokalen Trunk und pusht nie. Es hängt `spec.land` an.
- `abandon --force`: setzt das Tag `abandoned/spec-<id>`, löscht den Branch, hängt `spec.abandon` an und setzt die integrierten Tickets eines lokalen Trackers auf `ready-for-agent` zurück; ohne `--force` verweigert es.

`emet tracker frontier` zählt in `branch.json` aufgeführte Tickets als geschlossene Blocker, und `emet status` erhält `specBranch` (`branch`, `tip`, `integratedWaves`).

### `emet spec-merge`

`emet spec-merge --spec <id>` mergt die `ADDED`-/`MODIFIED`-/`REMOVED`-Anforderungs-Deltas der Spec in `docs/specs/<area>.md` (`specs.dir`).

- `--deltas-dir`: gibt das Verzeichnis aus, in das die Deltas gehören.

Bei aktiviertem `specs.enabled` schreibt der Koordinator die Deltas und führt es einmal pro Spec aus, auf dem Integrations-Branch der letzten Welle vor deren Review, und committet dann das Ergebnis. Es prüft jeden Bereich, bevor es etwas schreibt. Ein Konflikt oder eine Anforderung, die ein Szenario verlöre, endet mit 1 und lässt jede Datei unberührt. Bei deaktiviertem `specs.enabled` mergt es nichts und endet mit 0.

### `emet map`

`emet map [--refresh]` schreibt einen Überblick über eine bestehende Codebasis (Stack, Struktur, Konventionen, Tests, Hotspots) nach `docs/agents/codebase.md` (`map.path`), gestempelt mit dem Commit-SHA, aus dem er erstellt wurde. Derselbe Commit erzeugt immer dieselbe Datei.

- `--refresh`
- `--stale`: endet mit 1, sobald HEAD über den Stempel hinaus weitergewandert ist, und `emet preflight` warnt in diesem Fall.
- `--for <globs>`: gibt nur die Abschnitte aus, die zu den Bearbeitungsflächen eines Tickets passen; diese Ausgabe ist der einzige Teil der Map, den ein Worker-Briefing enthält.

### `emet guard`

Der `PreToolUse`-Hook von Claude Code; liest Hook-JSON von stdin (die Codex-Form steht unter [Codex-Host](#codex-host)). `emet self install` verdrahtet ihn in `~/.claude/settings.json`. Er blockiert eine Handvoll bekannter Auslöser für Fehlschläge bei unbeaufsichtigten Läufen (siehe `emet/src/guard.ts`).

## Lokaler Tracker

Mit `tracker.kind: "local"` sind Specs und Tickets Markdown-Dateien unter `.scratch/` des Haupt-Worktrees (nicht versioniert): `.scratch/<slug>/spec.md` und `.scratch/<slug>/issues/<NN>-<slug>.md`, jeweils mit den Zeilen `Status:` und `Blocked by:` und Kommentaren unter `## Comments`. `emet init --tracker local` richtet das ein. Siehe [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

`landing.mode` ist `"pr"` (Standard) oder `"merge"`, unabhängig vom Tracker. Im Modus `merge` landet eine Welle mit `emet land` als ein lokaler Merge in den Trunk, wobei `commands.selfCheck` die CI ersetzt und nichts gepusht wird. Mit `landing.unit: "spec"` (Standard) landet die ganze Spec einmal über `emet spec-branch land`. `gh` ist nur erforderlich, wenn der Tracker `github` ist oder das Landing `pr` verwendet. Siehe [ADR-0010](../adr/0010-local-merge-landing.md) und [`landing`](configuration.md#landing).

### `emet tracker`

`emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close` ist der lokale Tracker über `.scratch/`, JSON auf stdout. Der Koordinator liest und schreibt Specs und Tickets darüber.

#### `emet tracker close`

Mit `tracker.kind: "github"` schließt `emet tracker close <ticket>... [--pr <n>]` jedes Ticket (`CLA-<n>`, `#<n>` oder eine bloße Zahl) mit `gh issue close --reason completed`, verifiziert seinen Zustand und meldet `closed` oder `already-closed`.

- `--pr <n>`: fügt den Kommentar „Landed in #<n>“ hinzu.

Für jedes verschiedene Eltern-Issue eines Tickets mit `closed` oder `already-closed` liest es danach `gh issue view <spec> --json state,subIssuesSummary`. Ist die Spec offen und `subIssuesSummary.completed` gleich einem von null verschiedenen `total`, schließt es die Spec mit `gh issue close --reason completed` und dem Kommentar „All <total> tickets landed.“ und verifiziert sie dann.

Die Ausgabe erhält `specs`, je ein `{ spec, outcome, detail? }` pro verschiedenem Eltern-Issue mit dem Ergebnis `closed`, `open`, `already-closed` oder `failed`. Ein Ticket ohne Eltern-Issue fügt keines hinzu, und ein fehlgeschlagenes Lesen oder Schließen der Spec ändert nie ein Ticket-Ergebnis. Es endet mit `1`, wenn ein Ticket oder eine Spec fehlgeschlagen ist, nachdem es den Rest verarbeitet hat. Linear-Tickets bestätigt der Koordinator über den Linear-MCP als Done.

## Landing-PRs und Verkettung von Wellen

Mit `landing.unit: "wave"` ist eine Welle ein PR; mit `"spec"` deckt ein PR jede integrierte Welle ab. Sein Text enthält pro Ticket eine Zeile `Closes #N` (das Schließ-Schlüsselwort des Trackers), und der Koordinator setzt die Tickets auf in-review, wenn er den PR öffnet. Der PR wird dann gemäß `pr.autoMerge` gemergt oder bleibt offen, wenn die Welle markiert wurde, `autoMerge` `false` ist oder die CI-Korrekturen aufgebraucht waren (der PR erhält dann das Label für menschliche Entscheidung). Spätere Wellen laufen in eigenen Sitzungen, nie in der, die Welle 1 ausgeführt hat. Die Abschnitte `pr` und `handoff` steuern, was als Nächstes geschieht; siehe [`pr`](configuration.md#pr) und [`handoff`](configuration.md#handoff).

### `emet ci`

`emet ci --pr <n> --wait [--rerun-flakes] [--timeout-minutes <m>]` fragt die Checks des PRs ab, bis sie fertig sind oder das Timeout (Standard 30) verstreicht. Es gibt `state: pass | fail | env-fault | timeout`, die fehlgeschlagenen Checks und `flakeReruns` aus und mergt nie.

- `--rerun-flakes`: führt jeden fehlgeschlagenen Check einmal über `gh run rerun --failed` erneut aus; ein Check, der beim erneuten Lauf besteht, ist ein Flake.
- `--timeout-minutes <m>`

Ein PR ohne Checks ist `pass` mit `noChecks: true`. Exit `0` pass, `1` fail oder env-fault, `3` timeout. `env-fault` bedeutet Checks, die mit `STARTUP_FAILURE` endeten oder zu lange in der Warteschlange blieben: eine CI, die nie lief, kein Codefehler.

## Codex-Host

Diese Befehle bedienen den Codex-Agent-Host (`agentHost` `"codex"`); siehe den [Codex-Leitfaden](../how-to/use-codex.md).

### `emet dispatch`

`emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: erstellt nach der Prüfung von Claim und Slot `.emet/worktrees/agent-<ticket>`, baut ein `CODEX_HOME`-Overlay pro Lauf und startet den Worker als abgekoppeltes `codex exec`.

- `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]`: blockiert, bis er endet, und gibt den festgehaltenen Ergebnisstatus aus.

### `emet review-run`

`emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive> [--browser-verify true|false]` führt den Reviewer als schreibgeschütztes `codex exec` über ein Paket von `emet review-package` aus und gibt Findings-JSON für `emet review --findings` aus. Die Stufe `passive` startet keinen Prozess.

- `--browser-verify true|false`: Standard ist `false`. Mit `true` endet der Prompt mit der Browser-Achse, mit `--session review-<run>` aus `--run` gefüllt, sodass der Codex-Reviewer die UI so verifiziert wie der Claude-Reviewer (übergeben, wenn `emet assess` `browserVerify.run: true` ausgegeben hat; siehe [`verify`](configuration.md#verify)). Ohne das Flag bleibt der Prompt unverändert, und ein anderer Wert als `true` oder `false` endet mit 2 und der Verwendungszeile.
- `--coverage-out <file>`: schreibt außerdem die Coverage-Urteile des Codex-Reviewers als JSON-Array nach `<file>` (stdout gibt weiterhin nur die Findings aus); auf dem Codex-Host verwenden, wo ein einzelner Reviewer läuft.

Findings können die optionalen Felder `s` und `userOption` tragen, die unter `emet review` beschrieben sind.

### `emet launch` unter Codex

`emet launch <spec-id> --wave <n>` startet ein abgekoppeltes `codex exec`, das `$emet:run --dispatch <spec>` ausführt, und hält dessen Thread-id fest. Es wird kein Orca-Tab geöffnet, und `codex exec resume <id>` setzt die Sitzung fort.

### `emet guard` unter Codex

Mit `EMET_AGENT_HOST=codex` liest `emet guard` die Codex-Hook-Eingabe, prüft `apply_patch`-Pfade gegen `.emet/surface.json` und hält das Freigabe-Gate geschlossen, bis eine Prompt-Zeile `approve <id>` kommt.

## Gates und Aufzeichnungen

Die Phasen entscheiden nicht selbst, wann ein Ticket fertig, mergebar oder einen weiteren Versuch wert ist. Sie rufen einen CLI-Befehl auf, der eine Aufzeichnung auf der Platte liest und die Entscheidung ausgibt. Lauf-Aufzeichnungen liegen unter `.emet/runs/<run-id>/` und das Review-Ledger unter `.emet/review/`, im Haupt-Checkout, nicht im Worktree eines Workers. Die folgenden Befehle sind in Pipeline-Reihenfolge aufgeführt.

### `emet validate`

Vor der Freigabe: `emet validate --spec <id> | --file <plan.json>` führt die Plan-Validierung aus.

- Jedes `S#` wird von mindestens einem Ticket abgedeckt und hat ein Abnahmeszenario.
- Jedes Ticket deckt mindestens ein `S#` ab.
- Bearbeitungsflächen sind innerhalb einer Welle disjunkt.
- Es gibt keine Abhängigkeitszyklen.
- Mit [`validate.coupledSurfaces`](configuration.md#validate) ein Fehler `coupled-surface-split`, wenn ein Ticket, das die `source` eines Paars berührt, in einer früheren Welle liegt als ein Ticket, das dessen `dependents` berührt (Exit 1).
- Eine leere Ticketliste ist ein Fehler `no-tickets` (Exit 1, „plan has no tickets; write one folded ticket“), mit oder ohne `S#`-Einträge. Ein Plan mit einem als `folded: true` markierten Ticket, das jedes `S#` abdeckt, besteht.

`emet preflight` führt ihn auf dem freigegebenen Plan erneut aus.

### `emet approve`

Freigabe: `emet approve --run <id> --spec <file>` schreibt `approval.json` mit den Hashes von Spec und Ticketliste. Der Dispatch verweigert, wenn eines davon danach geändert wurde (`--check`).

- `--quick`: schreibt außerdem `"mode": "quick"`, wodurch die Landing-Einheit für diesen Lauf `wave` wird. Ohne ihn fehlt das Feld, und ältere Aufzeichnungen bestehen `--check` weiterhin.

### `emet materialize-log`

Ticket-Erstellung: `emet materialize-log --run <id> --record/--lookup` speichert die ID jedes erstellten Tickets, sobald es existiert, sodass ein unterbrochener Lauf nie Duplikate erzeugt.

### `emet results`

Worker fertig: `emet results --run <id> --write/--read <ticket>`. Worker schreiben eine lokale Ergebnisdatei (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` oder `NEEDS_CONTEXT`, dazu eine `Risk:`-Zeile). Nur der Koordinator schreibt in den Tracker.

### `emet verify`

Nach jedem Worker: `emet verify <ticket> --run <id>` prüft, dass es Commits über die Dispatch-Baseline hinaus gibt, jeder geänderte Pfad innerhalb der Bearbeitungsflächen des Tickets liegt, die Handoff-Notiz `handoff --check` besteht und `commands.workerScopedSuite` besteht. Review und Merge verweigern ein Ticket ohne Pass-Aufzeichnung.

### `emet review-package`

Review-Eingabe: `emet review-package <base> <head> --out <file>` bündelt den Diff für den Reviewer, der ihn als Dateipfad erhält. Endet mit 3, wenn der Bereich leer oder kein Nachfahre von base ist.

### `emet review`

Review: `emet review --ticket <t> --findings <file>` führt das Findings-Ledger und erzwingt die Triage-Reihenfolge (`intent_gap` → `bad_plan` → `patch` → `defer`) und die Rundenobergrenze.

- `--base <ref>`: löst `<ref>` in der ersten Runde zu einem SHA auf und speichert ihn; spätere Runden verwenden ihn wieder, und ein anderer SHA endet mit 2 unter Nennung des gespeicherten. Ein Finding in einer Zeile, die der Diff `<base>..HEAD` nicht hinzugefügt oder geändert hat, wird mit `preexisting: true` gespeichert, und `emet gate` zählt es nicht als blockierend.
- `--findings <file>`: Findings akzeptieren die optionalen Felder `s: "S<n>"` (die betroffene Anforderung), `userOption: "S<n>"` und `agreement: "both"` oder `"single"`. Ein `userOption`-Finding widerspricht einer `(user option)`-Anforderung: Es ist immer blockierend, auch wenn es bereits bestand, und unter `gate.onHold: fix-and-continue` hält es mit `next: fix-findings`. Ein `userOption`, das kein String ist, endet mit 2.
- `--coverage <file or -> [--expect S1,S3]`: speichert ein JSON-Array von Coverage-Urteilen `{s, verdict, test:{file,name}}` (`verdict`: `met`, `partial`, `unmet`) als `coverage` des Ledgers, ersetzt das vorherige und verbraucht keine Review-Runde. Es öffnet ein `VG-S<n>`-Finding (major, `patch`) für jedes `met`, dessen `test` fehlt, dessen Datei nicht existiert oder `test.name` nicht enthält, und für jedes `--expect`-S# ohne Urteil. Ein `VG-`-Finding schließt sich nur, wenn ein späteres `--coverage` es nicht mehr erzeugt oder ein Recheck-Urteil es auflöst, nie dadurch, dass es in einer `--findings`-Runde fehlt. Es gibt `{coverage, open}` aus und endet mit 1, solange ein Finding offen ist; es führt keine Tests aus.
- `--merge <a.json> <b.json>` (ohne `--ticket`): gibt ein zusammengeführtes Findings-Array für `--findings -` aus. Zwei Findings bilden ein Paar, wenn sie `s` teilen oder `file` mit höchstens 3 Zeilen Abstand teilen, und ein Paar behält die `id` der ersten Datei, den höheren Schweregrad und `agreement: "both"`. Ein ungepaartes Finding erhält `agreement: "single"`, wobei eine kollidierende id aus der zweiten Datei mit `X-` präfixiert wird; ein `userOption`-Finding wird nie verworfen.
- `--recheck --verdicts <file>`: beendet eine Fix-Runde. Nur Findings, die bei ihrem Beginn offen waren, werden bewertet, ein Finding wird nur durch ein Urteil `resolved`, und der Recheck zählt gegen `budgets.fixRounds` (Exit 1 unter Nennung der Obergrenze, wenn aufgebraucht).
- `--escalate`: wechselt zur nächsten Modellstufe.
- `--rule` und `--rulings`: halten die „Rulings I made“ für den Bericht und den PR-Text fest und listen sie auf.

### `emet gate`

Merge oder Verkettung: `emet gate <ticket> --tier … --ci … --integration …` gibt `merge`, `hold`, `chain`, `stop` oder `defer` als JSON samt Gründen aus. Es liest die Verify-Aufzeichnung, die offenen Findings, die Risikostufe, die CI, die Integrationssuite und die Budgets. Ein `hold` trägt `next`: `fix-findings`, `rerun-failed-specs`, `rerun-ci` oder `report-infrastructure`. Siehe [`gate`](configuration.md#gate).

- `--no-record`: hält die Entscheidung aus dem Journal heraus.

Nachdem die Branches einer Welle zusammengeführt wurden, läuft `commands.fullSuite` einmal auf dem Integrations-Branch. Ein roter Lauf blockiert den PR und `autoChain`. Das Gate erhält das Ergebnis als `--integration`. Zu den Budgets, die das Gate liest, siehe [`budgets`](configuration.md#budgets).

## Exit-Codes

Exit-Codes sind über alle Unterbefehle hinweg aussagekräftig.

| Code | Bedeutung                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------ |
| `0`  | Sauber.                                                                                          |
| `1`  | Befunde, auf die zu reagieren ist.                                                               |
| `2`  | Konfigurations- oder Verwendungsfehler; das Tool lief nie wirklich. Auch ein unbekannter Befehl. |
| `3`  | Interner Fehler.                                                                                 |

Ein unbekanntes Flag endet ebenfalls mit `2` und nennt das Flag. Strg-C endet mit `130`.

## Globale Flags

Jeder Befehl akzeptiert diese; die eigenen Flags jedes Befehls listet `emet <command> --help` auf.

| Flag         | Wirkung                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `--json`     | Gibt einen Envelope `{ok, data, error: {code, message, fix}}` auf stdout aus, auch für `--help` und `--version`.                 |
| `--no-color` | Deaktiviert ANSI-Farbe. Die Farbe berücksichtigt außerdem `NO_COLOR`, `FORCE_COLOR`, `TERM=dumb` und ob die Ausgabe ein TTY ist. |
| `--verbose`  | Gibt den Stack eines unerwarteten Fehlers aus. Ohne es gibt der Catch auf oberster Ebene eine einzeilige Fehlermeldung aus.      |
| `--help`     | Gibt die Verwendung des Befehls aus.                                                                                             |

`emet --version` gibt die Version aus; `emet --version --json` gibt `{"ok": true, "data": {"version": ...}, "error": null}` aus. Unter `--json` endet ein fehlschlagender Befehl mit seinem üblichen Code und gibt `ok: false` mit einem Fehler-`code` von `findings`, `usage`, `internal`, `slice-timeout`, `expired`, `bad-range` oder `exit-<n>` aus; was der Befehl auf stdout ausgegeben hat, ist das `data` des Envelopes.

Auf einem TTY gibt `emet` auf stderr einen einzeiligen Hinweis aus, wenn ein neueres Release bekannt ist. Es prüft höchstens einmal am Tag, speichert die Antwort zwischen, wartet nie auf das Netzwerk und bleibt unter `--json` oder ohne TTY still.

## Umgebungsvariablen

Nutzerseitige Variablen. Eine gesetzte Variable überschreibt den passenden Konfigurationswert.

| Variable                      | Wirkung                                                                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` stuft eine Abhängigkeitssperre für diesen einen Lauf zu einer Warnung herab. In der eigenen Shell setzen, nicht in etwas, das der Koordinator unbeaufsichtigt ausführt. |
| `EMET_MAX_LIVE_WORKERS`       | Überschreibt [`concurrency.maxLiveWorkers`](configuration.md#concurrency); akzeptiert eine positive ganze Zahl oder `auto`.                                                                                            |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | Überschreibt [`concurrency.runIdleThresholdMs`](configuration.md#concurrency), in Millisekunden.                                                                                                                       |
| `EMET_STATE_DIR`              | Hostweites Zustandsverzeichnis, das den Worker-Slot-Pool enthält. Auflösungsreihenfolge: `$EMET_STATE_DIR`, dann `$XDG_STATE_HOME/emet`, dann `~/.local/state/emet`.                                                   |
| `EMET_MEM_RESERVE_GIB`        | Hauptspeicher-Reserve in GiB, die frei bleiben muss; ein Acquire wird verweigert, wenn der verfügbare Speicher darunter liegt. Standard 8. Sie fließt auch in die `auto`-Worker-Obergrenze ein.                        |
| `EMET_MEM_PER_WORKER_GIB`     | Pro Worker angenommener Speicher in GiB, wenn `maxLiveWorkers` `auto` ist. Standard 2. Erhöhen bei einem schwereren Stack pro Worker, etwa einer browsergesteuerten E2E-Suite pro Worktree.                            |
| `EMET_CPU_OVERSUBSCRIBE`      | CPU-Multiplikator für die `auto`-Worker-Obergrenze. Standard 1.                                                                                                                                                        |
| `EMET_AUTO_UPDATE`            | `EMET_AUTO_UPDATE=0` deaktiviert `emet self update --auto`: Es endet mit 0 ohne Netzwerkaufruf. Wie `emet self update --auto off`.                                                                                     |
| `EMET_AGENT_HOST`             | `codex` lässt `emet guard` die Codex-Hook-Eingabe lesen. Wird von den Codex-Hooks gesetzt; unter Claude Code ungesetzt lassen.                                                                                         |

Die `auto`-Obergrenze ist `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`. Die veralteten `FORGE_*`-Namen werden weiterhin gelesen; `EMET_*` gewinnt, wenn beide gesetzt sind.
