---
title: Neuigkeiten
description: Release Notes für emet: was sich in jeder Version geändert hat.
seoTitle: "Neuigkeiten in emet: Release Notes"
sourceHash: 32b42447b1d1875a
---

## 0.17.0

2026-11-22

### Hinzugefügt

- `/emet:run --quick <Änderung>` führt einen Quick run für eine Änderung aus, die in ein Ticket passt: eine Interviewrunde, eine Spec mit einem folded Ticket, eine Freigabe, ein Worker, Review und das Landing dieser einen Wave als Pull Request (oder lokaler Merge), ohne `emet chain`. Vor der Freigabe stoppt der Lauf und empfiehlt `/emet:run` ohne `--quick`, wenn die Änderung einen Bildschirm berührt oder nicht in ein Ticket passt; zusammen mit `--draft` oder `--dispatch` wird er abgelehnt. `--no-promote` wird akzeptiert. Die Schritte stehen in der neuen `emet/reference/phases-quick.md`. Siehe ADR-0039.
- `emet assess --quick` gibt das gewohnte JSON plus `"quickRejected"` aus und beendet sich mit Code `1`, wenn die Stufe `high` ist. Ein Quick run behandelt das als Stop des Gates: kein Auto-Merge, der Pull Request bleibt offen, und der Abschlussbericht nennt die Hochrisiko-Gründe. Ohne `--quick` bleiben Ausgabe und Exit-Codes unverändert.
- `emet approve --quick` schreibt `"mode": "quick"` in `approval.json`. Vor dieser Änderung geschriebene Einträge bestehen `--check` weiterhin.
- `resolveLandingUnit(config, runId, root)` liefert `wave` für einen mit `--quick` freigegebenen Lauf und sonst `config.landing.unit`. `emet landed`, `emet status` und `emet preflight` lesen die Landing-Einheit darüber, sodass ein Quick run nie einen Spec-Branch erwartet.
- `emet validate` meldet den Fehler `no-tickets`, wenn ein Plan keine Tickets hat, und weist darauf hin, ein folded Ticket zu schreiben.
- `docs/reference/cli.md` und `docs/guide/trackers-and-landing.md` dokumentieren den Quick run, in allen neun Sprachen.

### Geändert

- Der Satz zum Schnellpfad in `phases-1-5.md` besagt jetzt, für eine Anfrage unterhalb der Schwelle ein als `folded` markiertes Ticket zu schreiben, statt gar keine Tickets zu schreiben.
- `emet preflight --approval <run>` ermittelt die Landing-Einheit aus dem Freigabeeintrag dieses Laufs, wenn `--run` fehlt.

## 0.16.0

2026-11-21

### Hinzugefügt

- Living Specs, standardmäßig aus. Mit `specs.enabled: true` schreibt der Koordinator in der letzten Wave einer Spec die Anforderungs-Deltas `ADDED`/`MODIFIED`/`REMOVED` der Spec, führt `emet spec-merge --spec <id>` einmal auf dem Integrations-Branch dieser Wave vor deren Review aus und committet die aktualisierte `docs/specs/<area>.md`, sodass die Änderung im selben Pull Request geprüft wird und landet. Eine neue Referenz, `living-specs.md`, beschreibt das Delta-Format und die Wiederholungsregel. Siehe ADR-0038.
- `specs.enabled` (Standard `false`) in der Konfiguration und in beiden Schema-Kopien. `emet init` schreibt `"specs": { "dir": "docs/specs", "enabled": false }`.
- `emet doctor` warnt, nur wenn `specs.enabled` `true` ist, falls `specs.dir` per gitignore ausgeschlossen oder eine Datei ist. Ein fehlendes `specs.dir` ist keine Warnung.
- `emet spec-merge --spec <id> --deltas-dir` legt das gemeinsame Delta-Verzeichnis `<git common dir>/.emet/runs/<id>/spec-deltas` an, gibt es aus und endet mit `0`, ohne zu mergen.
- `landing.specMergeMethod` akzeptiert `merge` (Standard), `squash` und `rebase`, damit eine Spec auch auf einem Trunk landet, der nur Squash-Merges erlaubt. `emet doctor` warnt, wenn die Repository-Einstellungen oder das Trunk-Ruleset die konfigurierte Methode nicht erlauben. Siehe ADR-0037.
- `bun run check:codex` schlägt fehl, wenn in einem generierten `codex/`-Verzeichnis eine Datei ohne Quelle liegt.

### Geändert

- Bei ausgeschaltetem `specs.enabled` gibt `emet spec-merge` `specs.enabled is false; nothing merged` aus und endet mit `0`. Es liest Deltas aus dem gemeinsamen Run-Verzeichnis unter dem Git Common Dir und greift sonst auf das `.emet/runs/<id>/spec-deltas/` des jeweiligen Checkouts zurück.
- Die Prompts der Phase 8 führen `emet spec-merge` nicht mehr aus, nachdem eine Wave oder Spec gelandet ist; stattdessen lädt `phases-8-review.md` in der letzten Wave `living-specs.md`.
- `emet spec-branch land` wartet mit demselben Poller wie `emet ci` auf die Checks des Pull Requests, auch wenn dieser noch keine Checks hat, und mergt mit `landing.specMergeMethod`.

### Behoben

- `emet spec-branch land` mergt nicht mehr, bevor GitHub irgendwelche Checks registriert hat.
- `emet setup` listet die Claude-Plugins einmal statt bis zu dreimal auf, und seine stillen Abfragen laufen in ein Timeout, statt zu hängen.
- `emet doctor` listet die installierten Plugins einmal pro Lauf auf.
- `bun run lint` und `bun run fix` erzeugen zuerst die Astro-Typen für die Website und laufen so auch in einem frischen Checkout durch.

## 0.15.0

2026-11-21

### Geändert

- `landing.unit` ist standardmäßig `spec`: Die Waves einer Spec werden mit `emet spec-branch` in den Branch `spec/<id>` integriert, und die Spec landet einmal, als ein Pull Request (oder ein lokaler Merge mit `landing.mode: merge`), statt eines Pull Requests pro Wave. Mit `"landing": { "unit": "wave" }` bleibt das alte Verhalten. Der Modus `spec` braucht `worktree.baseRef: "head"` in den Claude-Code-Einstellungen. Siehe ADR-0037.
- Das Journal kennt die neuen Arten `spec.integrate`, `spec.land` und `spec.abandon`, und `emet status` gibt zusätzlich `specBranch` aus.

## 0.14.5

2026-11-21

### Hinzugefügt

- `emet handoff --check` liest einen Abschnitt `skills:` in der Übergabenotiz eines Workers (`none` oder `loaded: a, b; missing: c`). Er ist Pflicht, wenn `state` den Wert `done` hat. `--expect-skills a,b` lässt die Prüfung für jede genannte Skill fehlschlagen, die in keiner der beiden Listen steht, und gibt die fehlenden aus.
- Der Dispatch-Eintrag enthält ein optionales Array `skills`, und `emet verify` übergibt es als `--expect-skills` an `emet handoff --check`. Ein Eintrag ohne `skills` wird weiterhin gelesen.
- ADR-0036 erlaubt es einem Ticket, den Wortlaut eines installierten Prompts zu ändern, wenn es die Absätze benennt; derselbe Pull Request hebt die Byte-Grenzen an.

### Geändert

- Der Prompt der Phase 8 ist in `phases-8-review.md` und `phases-8-landing.md` aufgeteilt. `install.sh` entfernt das alte `phases-8-closeout.md`: Eine bearbeitete Kopie oder eine Kopie aus der Zeit vor dem Manifest wird zu `phases-8-closeout.md.retired` verschoben, eine unveränderte Kopie wird gelöscht.
- Der Worker-Prompt weist den Worker an, die Zeile `skills:` vor seiner letzten Übergabe zu schreiben.
- Die Architekturseite, die CLI-Referenz und ihre neun Übersetzungen beschreiben die zwei Dateien der Phase 8 und `--expect-skills`.

## 0.14.4

2026-11-20

### Hinzugefügt

- `emet doctor` warnt auf dem Codex-Host, wenn das emet-Plugin in `$CODEX_HOME/config.toml` aktiviert ist, Codex aber keinen seiner Hooks als vertrauenswürdig eingestuft hat und der emet-Guard daher nicht läuft. Die Warnung ändert den Exit-Code nicht.

### Behoben

- Wenn das Release-Asset für die Version des Plugins noch nicht heruntergeladen werden kann, führt `bin/emet` für jeden Befehl, nicht nur für `emet guard`, die neueste zwischengespeicherte Binärdatei aus und gibt einen Hinweis aus, dass das Release möglicherweise noch veröffentlicht wird. Mit `EMET_PREFETCH=1` gibt es den Hinweis aus und endet mit `0`, ohne die Binärdatei auszuführen. Eine Prüfsummenabweichung oder eine fehlende `SHA256SUMS` führt weiterhin nie zu einem Fallback, und das Staging-Verzeichnis des Downloads wird vor dem Fallback entfernt.

## 0.14.3

2026-11-20

### Hinzugefügt

- `emet fleet launch --dry-run` führt die Bereitschaftsprüfungen aus und gibt für jedes Repo `would launch <name>` aus, ohne eine Sitzung zu starten.

### Behoben

- `emet migrate` entfernt nicht getrackte veraltete `.forge/`-Laufdateien, die von ihrer `.emet/`-Kopie abweichen, und behält die `.emet/`-Datei, sodass es auch in Repos mit übrig gebliebenen Logs abschließt. Jeden Konflikt, den es nicht lösen kann, listet es zusammen mit dem manuellen Schritt auf, und ein Git-Fehler innerhalb eines Repos wird als Konflikt behandelt, statt die Datei zu löschen.
- Der Test-Preload entfernt sein Verzeichnis `emet-test-state-*`, wenn der Lauf endet, sodass `bun test` pro Lauf kein temporäres Verzeichnis mehr zurücklässt.

## 0.14.2

2026-11-20

### Behoben

- `emet promote` wartet auf die Checks des Sync-Pull-Requests und mergt ihn nur, wenn sie bestehen, statt ihn sofort zu mergen. Ein Sync-Pull-Request, der fehlschlägt, in ein Timeout läuft oder abgelehnt wird, bleibt offen, ohne den Promote scheitern zu lassen; das Ergebnis und das Journal-Ereignis enthalten `syncMerged` und `syncReason`.

## 0.14.1

2026-11-20

### Hinzugefügt

- `emet tracker close` schließt das übergeordnete Spec-Issue eines GitHub-Tickets, wenn sein letztes Sub-Issue geschlossen wird, und meldet jede Spec in einem neuen Feld `specs`. Ein fehlgeschlagenes Lesen oder Schließen der Spec beendet mit `1`.
- Die Spec wird auch geschlossen, wenn die Sub-Issue-Zusammenfassung von GitHub noch nicht aktuell ist: Die Sub-Issues der Spec werden einzeln gezählt, einschließlich der im selben Aufruf geschlossenen Tickets.

## 0.14.0

2026-11-20

### Hinzugefügt

- `emet init` setzt `schema.ownedPaths`, wenn es ein Prisma-Schema (`prisma/schema.prisma` oder `prisma/schema/`) oder einen Drizzle-Migrationsordner findet, und entfernt den Marker `TODO(emet):` für die Schema-Zuständigkeit.
- Das Setup-Element `agent-browser` schreibt `~/.agent-browser/config.json` (`contentBoundaries` und `maxOutput`), wenn die Datei nicht existiert, und führt nach der Installation `agent-browser doctor` aus. Siehe ADR-0035.
- `emet setup` gibt ein AppArmor-Profil für den von `agent-browser` heruntergeladenen Chrome aus, zusammen mit den `sudo`-Befehlen zum Laden, wenn der Host unprivilegierte User-Namespaces einschränkt. Es führt `sudo` nie selbst aus.

### Geändert

- Das Setup-Element `firecrawl-local` registriert den MCP-Server mit `FIRECRAWL_CLOUD=search` statt `off`, ersetzt eine frühere Registrierung und übergibt den neuesten Chrome von `agent-browser` als `FIRECRAWL_CHROME_PATH`. Siehe ADR-0035.

### Behoben

- `emet setup` registriert den MCP-Server `firecrawl-local` mit dem Servernamen an erster Stelle, sodass die Registrierung korrekt geparst wird.
- `emet --help` listet jeden Befehl der Registry auf (setup, fleet, insights, chain, promote, whats-new, deploy-check, ci, run).
- Tests schreiben nicht mehr in das echte Journal unter `~/.local/state/emet`.

## 0.13.0

2026-11-20

### Hinzugefügt

- `emet setup` bietet die Einträge `context7` und `firecrawl-local` an (beide standardmäßig aus). `context7` installiert die `ctx7`-CLI und ihren Skill `find-docs`. `firecrawl-local` baut Firecrawl Local mit `cargo` und registriert es als rein lokalen MCP-Server (`FIRECRAWL_CLOUD=off`, `--public-only`). Siehe ADR-0034.
- `emet review-run --browser-verify true|false` übergibt die Browser-Achse an den Codex-Reviewer.
- `validate.coupledSurfaces` in `emet.config.json` und der Fehler `coupled-surface-split` von `emet validate` halten eine Seite und ihre Übersetzungen in einer Welle zusammen. Siehe ADR-0033.

## 0.12.0

2026-11-20

### Hinzugefügt

- `verify.browser` in `emet.config.json` (`startCommand`, `url`, optional `paths`) aktiviert für ein Repository die Browser-Verifikation von UI-Änderungen mit `agent-browser`. Das Konfigurationsschema und sein Parser validieren jedes Feld.
- `emet assess` gibt `browserVerify: { run, reason }` aus. Die Browser-Achse läuft nur, wenn die Welle einen Reviewer hat, `verify.browser` konfiguriert ist, `agent-browser` im PATH liegt und ein geänderter Pfad zu `paths` passt.
- `emet setup` bietet ein Element `agent-browser` an (standardmäßig aus), das die neueste Version und ihren Browser installiert.
- `emet doctor` meldet einen optionalen agent-browser-Befund für ein Repository, das `verify.browser` konfiguriert. Eine fehlende Binärdatei oder ein fehlschlagendes `agent-browser doctor` ist ein Hinweis oder eine Warnung und ändert nie den Exit-Code.
- Der Reviewer-Prompt erhält eine Browser-Achse, die nur gefüllt wird, wenn `browserVerify.run` wahr ist, und der Worker-Prompt erhält eine optionale Zeile für Browser-Prüfungen. Siehe ADR-0032.

## 0.11.1

2026-11-19

### Behoben

- Unter nativem Windows (Git Bash) und auf jedem nicht unterstützten Betriebssystem oder jeder nicht unterstützten Architektur beendet sich `bin/emet` mit 0, statt zu fehlschlagen, sodass der PreToolUse-Guard nicht mehr jeden Tool-Aufruf blockiert. Nur der Prefetch beim Session-Start gibt eine Meldung aus.
- `install.sh` weigert sich, unter `MINGW*`, `MSYS*` und `CYGWIN*` zu laufen, bevor es irgendetwas schreibt.
- Die Codex-Hooks enthalten eine `commandWindows`-Überschreibung, sodass Codex unter Windows (PowerShell) nicht mehr bei jedem Event einen Fehler meldet.

## 0.11.0

2026-11-19

### Hinzugefügt

- `emet whats-new` gibt beim ersten Start von emet nach einem Update eine einzeilige Meldung mit einem Link zu den Release Notes aus und speichert dann die laufende Version. Mit `--hook` gibt es die Zeile als `systemMessage`-JSON-Objekt für Session-Hooks aus.

## 0.10.0

2026-11-19

### Hinzugefügt

- `handoff.afterSpec` akzeptiert eine geordnete Liste von `{ paths?, mode }`-Regeln, sodass ein Repository mit einer CLI und einer Website die CLI veröffentlichen und die Website promoten kann. Der Modus wird anhand der Pfade gewählt, die das Promoten von `develop` nach `main` mitnehmen würde.
- `deploy.check.paths` beschränkt den Deploy-Check auf Promotes, die die aufgeführten Globs berührt haben.
- `emet promote` gibt `rule` und `reason` aus und schreibt sie ins Journal und gibt `deployCheck: { run, reason }` aus.

### Geändert

- Der Deploy-Check hängt nicht mehr von `afterSpec` ab: Er läuft nach einer sauberen letzten Wave auf dem Trunk `main` und nach einem gemergten Promote auf `develop`. Der Koordinator führt `emet promote` nach jedem Spec aus, auch bei `afterSpec` `none`.

## 0.9.1

2026-11-19

### Behoben

- `emet setup` akzeptiert `--data-dir`, sodass der SessionStart-Hook des Plugins nicht mehr mit `unknown flag --data-dir` fehlschlägt.

## 0.9.0

2026-11-19

### Hinzugefügt

- `emet gate` wendet eine Fix-and-continue-Richtlinie an: Eine angehaltene Wave führt Korrekturrunden aus, bis die Befunde gelöst sind oder `budgets.fixRounds` (Standard 2) aufgebraucht ist, und stoppt dann. `gate.onHold` wählt `fix-and-continue` (Standard) oder `stop`. `emet review --recheck` löst einen Befund nur über das Urteil eines Reviewers auf.
- `emet ci --wait` fragt die Prüfungen eines Pull Requests ab, startet instabile Jobs neu und meldet `pass`, `fail`, `env-fault` oder `timeout`. `emet tracker close` schließt GitHub-Tickets idempotent, und `emet chain` führt Gate, Readiness, Launch und Verify als einen Schritt aus.
- Ein Ereignisjournal erfasst Gate-Entscheidungen, Eingriffe, Starts, Ticket-Schließungen und Bereinigungen, mit größenbasierter Rotation. `emet insights` fasst es zusammen (`--mark-baseline` setzt die Baseline zurück), `emet run current` zeigt das aktive Spec und die aktive Wave, und `emet status --brief` gibt den Zustand in einer Zeile aus.
- Die Konfigurationsschlüssel `language.conversation` und `language.artifacts`.
- Die Konfigurationsschlüssel `handoff.afterSpec` (`release`, `promote` oder `none`, von `emet init` erkannt oder mit `emet init --after-spec` gesetzt), `deploy.check` und `interview.research`.
- `emet promote` öffnet den Pull Request von `develop` nach `main`, sobald die letzte Wave im Leerlauf ist, führt ihn zusammen, wenn die Prüfungen bestehen, und synchronisiert `main` zurück, wenn `develop` zurückliegt. `--no-promote` hält ein Spec über alle seine Sitzungen zurück.
- `emet deploy-check` wiederholt einen Deploy-Prüfbefehl und beendet hängende Befehle.
- `emet fleet list | set | launch` führt Specs über mehrere Repos aus.
- `emet setup` und `/emet:setup` installieren optionale Begleiter aus einem Katalog, nachdem die Claude-Einstellungen gesichert wurden. Ein SessionStart-Hook zeigt einmalig einen Hinweis, und `install.sh` führt Setup in einem TTY aus.
- `emet doctor` und `emet init` empfehlen Engram, ohne es je als unerfüllte Abhängigkeit zu zählen.

### Geändert

- Die installierten Prompts und Dokumente beschreiben die Gate-Richtlinie, `emet ci`, `emet chain`, das Journal, den After-Spec-Schritt, Fleet und Setup. Phase 8 ergänzt eine Wave-Zusammenfassung und eine Push-Benachrichtigung, und `emet insights` ersetzt den Verweis auf `/retro`.

### Behoben

- `--no-promote` wird als Marker im gemeinsamen Git-Verzeichnis gespeichert, sodass eine verkettete `/emet:run --dispatch`-Sitzung für die letzte Wave `develop` nicht mehr nach `main` befördert.

## 0.8.6

2026-11-17

### Behoben

- Der Release-Workflow installiert Chromium, bevor er die Prüfungen auf dem Tag erneut ausführt, wie es der CI-Test-Job tut. Die Verifikation bleibt damit nicht mehr an der Coverage-Untergrenze von `tools/` hängen. v0.8.5 wurde deshalb getaggt, aber nie veröffentlicht; seine Änderungen erscheinen in dieser Version.

## 0.8.5

2026-11-17

### Geändert

- Das Coverage-Gate verlangt pro Datei mindestens 97 % der Zeilen und 98 % der Funktionen für `emet/`, `apps/site` und `tools/`, mit begründeten Ausnahmen in `tools/coverage-exceptions.ts`. Das Coverage-Manifest durchläuft `emet/src` rekursiv, `tools/` wird geprüft, und die Summen in `tools/coverage-floors.json` steigen auf die gemessenen Werte.
- Der PreToolUse-Guard schlägt geschlossen fehl: Wenn `bin/emet` das emet-Binary nicht auflösen kann, beendet sich der Hook mit 2 und blockiert den Tool-Aufruf, mit einer Meldung, die die Wiederherstellung erklärt. Die Hooks Stop und SubagentStop beenden sich weiterhin mit 1.
- Die Plugin-Manifeste enthalten E-Mail des Autors, Lizenz, Homepage, Repository und Bugs-URL, und die Beschreibungen der Codex-Skills sagen, wann welcher Skill zu verwenden ist.

### Behoben

- `emet doctor` beendet sich mit dem Code 3, wenn ein unerwarteter Fehler durchschlägt, statt mit 0. Ein zuvor gesetzter Exit-Code ungleich null bleibt erhalten.
- `emet cleanup --all --force` räumt den Worktree und die Branches des Workers eines toten Laufs auf, auch die Worktrees unter `.claude/worktrees/`. Ein lebender oder inaktiver Besitzer und eine Sperre ohne Laufbezug bleiben geschützt.
- Der Edit-Guard erkennt eine wörtlich geschriebene Oberfläche wie `src/app/[locale]/page.tsx`. `[` und `]` in einer Oberfläche sind keine Zeichenklasse mehr.
- `emet preflight --post-dispatch` schlägt fehl, wenn ein Ticket, das noch eine Reservierung oder einen Slot hält, seinen Worker-Worktree verloren hat, und weist den Koordinator an, es neu zu dispatchen, statt es fortzusetzen.
- Das kompilierte `emet`-Binary lädt keine `.env`-Datei mehr aus dem aktuellen Verzeichnis.
- Die Website entfernt die Inline-Style-Attribute der Startseite, gibt den Startseiten-Labels im hellen Modus AA-Kontrast und benennt die Suchschaltfläche ab dem ersten Rendern mit ihrem sichtbaren Text. Die Bilder der Dokumentation kommen aus dem eigenen Ursprung der Website unter `repo-assets` statt von `raw.githubusercontent.com`, und `astro dev` liefert sie ebenfalls aus.

## 0.8.4

2026-11-15

### Geändert

- Der Header der Startseite besteht jetzt aus zwei Gruppen an den Rändern: links Wortmarke und Docs, rechts Suche, GitHub-Sterne, Design und Sprache. Seine Bedienelemente und das Release-Pill sind durchscheinendes Glas über dem Himmel, und der doppelte Link zu „Neuigkeiten“ entfällt im Header und im Menü der Startseite.

## 0.8.3

2026-11-15

### Behoben

- `/docs/` und das `/docs/` jeder Sprache antworten jetzt mit einem 301 auf die Seite „Erste Schritte“, statt mit einer Meta-Refresh-Seite, die kurz ungestylt aufblitzte.

## 0.8.2

2026-11-11

### Behoben

- `emet cleanup` behält einen Scaffold-Branch `worktree-<name>`, solange der Worktree `<name>` noch existiert, sodass eine Sitzung, die dort auf einem anderen Branch arbeitet, den Branch behält, den ihr Host erwartet.

## 0.8.1

2026-11-11

### Hinzugefügt

- `emet cleanup` löscht die Scaffold-Branches `worktree-<name>`, die der Agent host zurücklässt, wenn sie nirgends ausgecheckt sind und Trunk ihren Tip bereits enthält.

### Behoben

- Der Guard lehnt ein erzwungenes Branch-Löschen in jeder Schreibweise ab, die ein Lösch-Flag mit einem Force-Flag kombiniert, nicht nur mit dem großgeschriebenen Flag.

## 0.8.0

2026-11-11

### Hinzugefügt

- `emet cleanup` löscht in jedem Modus jeden lokalen Branch, dessen Pull Request am Tip-Commit des Branches gemergt wurde, zusammen mit dem sauberen, nicht gesperrten Agent-Worktree, der ihn enthält. Integrations-, Release- und Fix-Branches warten nicht mehr auf ein manuelles Löschen.
- `bun run translations:status` listet die Übersetzungen der Website auf, die hinter ihrer Quelle zurückliegen.

### Geändert

- Die Ablehnung eines erzwungenen Branch-Löschens durch den Guard verweist auf `emet cleanup`.
- Das Release-Runbook deckt die `whats-new`-Übersetzungen ab.

## 0.7.0

2026-11-11

### Hinzugefügt

- Die Website liefert das Konfigurationsschema unter `https://emet.andryore.dev/schema/emet.config.schema.json` aus.
- `docs/development.md` und `docs/security.md`.
- Eine Coverage-Untergrenze pro Workspace, die `bun run test` durchsetzt.

### Geändert

- `emet init` schreibt die öffentliche `$schema`-URL statt eines lokalen Pfads in `emet.config.json`.
- Release-Tags sind signiert, und der Release-Workflow schlägt fehl, wenn der CHANGELOG-Abschnitt für den Tag fehlt oder leer ist.
- Das Repository folgt dem andryorelabs-Standard v1: Rulesets als Code, Community-Dateien, README-Aufbau und Standard-Skriptnamen (`format:write`, `lint:commits`).

## 0.6.1

2026-11-10

### Behoben

- Zwei Prozesse, die gleichzeitig denselben veralteten Lock übernehmen, können nicht mehr beide in den kritischen Abschnitt eintreten; Claims, die Mailbox, der Tracker und `acquireLock` nutzen eine gemeinsame, abgesicherte Übernahme.
- Gleichzeitige Aufrufe von `emet tracker create-ticket` schlagen nicht mehr sporadisch fehl.

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
