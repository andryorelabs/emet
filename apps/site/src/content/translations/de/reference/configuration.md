---
title: Konfigurationsreferenz
description: Jeder Schlüssel in emet.config.json mit Standardwert und Bedeutung.
seoTitle: emet-Konfigurationsreferenz
sourceHash: eb2611cf0c7e09b4
---

Jeder Schlüssel in `emet.config.json` mit Standardwert und Bedeutung. Die maßgebliche Quelle ist [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json). Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md). Zurück zur [README](../../README.md).

`emet init` schreibt die Datei und setzt `$schema` auf die öffentliche URL `https://emet.andryore.dev/schema/emet.config.schema.json`, die die Website bytegenau identisch zur maßgeblichen Quelle ausliefert, sodass Editoren überall Vervollständigung bieten. `emet preflight` und `emet doctor` validieren sie. Ein als prose-only gekennzeichneter Schlüssel wird von den `/emet`-Prompts (unter Codex den `$emet:*`-Skills) gelesen, nicht von der CLI. Ein als deprecated gekennzeichneter Schlüssel wird weiterhin akzeptiert. Das Schema erlaubt außerdem einen freien Text-Schlüssel `"//"` für Notizen (von keinem Tool gelesen) und `"version"`, der immer `1` ist.

## pr

Wie der PR einer Welle gemergt wird.

```json
{ "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 } }
```

- `autoMerge` (Standard `true`): auf die Prüfungen des PR warten und mergen; ohne Prüfungen sofort mergen. Eine fehlgeschlagene Prüfung wird korrigiert und gepusht, bis zu `maxCiFixAttempts`-mal, danach bleibt der PR für einen Menschen offen. Eine Welle mit irgendeiner Markierung wird nie automatisch gemergt.
- `mergeMethod` (Standard `squash`): `squash`, `merge` oder `rebase`, an `gh pr merge` übergeben.
- `maxCiFixAttempts` (Standard `2`, Minimum `0`): wie oft der Koordinator versuchen darf, eine fehlgeschlagene Prüfung zu beheben, bevor er den PR für einen Menschen offen lässt.

## handoff

Was geschieht, nachdem eine Welle abgeschlossen ist, und die Größenlimits der Handoff-Notiz eines Workers. Von `emet preflight` validiert.

```json
{
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `maxLines` (Standard `60`): die höchste Zeilenzahl, die eine Notiz `.emet/handoff-<ticket>.md` haben darf, bevor `emet handoff --check` sie ablehnt.
- `maxChars` (Standard `8000`, etwa 2k Tokens): die höchste Zeichenzahl einer Handoff-Notiz.
- `autoChain` (Standard `false`): Nach einer sauberen, gemergten Welle mit weiteren offenen Wellen die nächste starten, statt `/emet:run --dispatch <spec-id>` auszugeben (unter Codex `$emet:run --dispatch <spec-id>`). Unter Claude Code ist der Start `claude --bg`; auf dem Codex-Host ist es ein abgekoppeltes `codex exec`, das `codex` in Version `codex.minVersion` oder neuer braucht. Die folgenden Voraussetzungen gelten für Claude Code. Mit `claude agents` oder `claude attach emet-<spec-id>-w<n>` einsehbar. Voraussetzungen:
  1. `claude` im PATH, mit `--bg`-Unterstützung.
  2. Ein vertrauenswürdiger Arbeitsbereich. `--bg` läuft nicht interaktiv, daher erscheint der Vertrauensdialog nie; `claude` einmal interaktiv im Repo öffnen und bestätigen.
  3. Die Bypass-Warnung einmal in einer interaktiven Sitzung akzeptiert (`skipDangerousModePermissionPrompt`), da die nächste Welle im `handoff.permissionMode` läuft, nicht im Modus der startenden Sitzung.

  Der Start erfolgt nur, wenn der PR gemergt wurde und nichts markiert war, und wird übersprungen, wenn bereits eine Sitzung `emet-<spec-id>-*` läuft (`claude agents --json`). Schlägt der Start fehl, wird stattdessen `/emet:run --dispatch <spec-id>` ausgegeben.

- `launcher` (Standard `auto`, eines von `auto`, `orca`, `bg`): nur Claude Code; auf dem Codex-Host ignoriert, wo `emet launch` keinen Orca-Tab öffnet. Die Welle zusätzlich in einem Orca-Tab öffnen, der `claude attach` ausführt. `auto` fragt die Orca-Runtime (`orca status`) und funktioniert daher auch aus `claude --bg`-Sitzungen, die kein `TERM_PROGRAM` haben; `orca` versucht es immer; `bg` nie. Die Welle läuft in beiden Fällen im Hintergrund, und ein Tab, der sich nicht öffnen lässt, stoppt die Kette nie. `emet launch <spec-id> --wave <n>` erledigt den gesamten Start; siehe [`emet launch`](cli.md#läufe-worker-und-slots).
- `permissionMode` (Standard `bypassPermissions`, eines von `bypassPermissions`, `auto`, `acceptEdits`): nur Claude Code; auf dem Codex-Host ignoriert, wo die verkettete Sitzung [`codex.sandbox`](#codex) nutzt. Berechtigungsmodus der verketteten Sitzung. Er wird nicht von der startenden Sitzung geerbt, weil der Klassifikator des Modus `auto` einen Schritt wie `gh pr merge` ablehnen und eine Welle halb fertig zurücklassen kann. Deine `permissions.deny`-Regeln gelten weiterhin, aber die Bypass-Warnung muss einmal interaktiv akzeptiert worden sein (`skipDangerousModePermissionPrompt`).

## budgets

Alle optional.

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts` (Standard `2`, Minimum `1`): Wie oft ein Ticket `verify` nicht bestehen darf, bevor das Gate mit `defer` antwortet. Das Ticket erhält das Label deferred, und der Rest der Welle läuft weiter. Ein Umgebungsfehler, etwa ein Testbefehl, der mit 126/127 endet, oder ein Anbieterausfall, pausiert den Lauf, ohne einen Versuch zu verbrauchen.
- `reviewRounds` (Standard `2`, Minimum `1`): Wie viele Review-/Fix-Runden ein Ticket erhält, bevor einmal auf die nächste Modellstufe eskaliert wird. Was danach noch offen ist, bekommt eine Entscheidung.
- `stallNudgeCap` (Standard `6`, Minimum `1`): Wie oft ein festgefahrener Worker angestoßen wird. Der Zähler wird nie zurückgesetzt.

## models

Modell und Aufwand pro Rolle für den Claude-Code-Host; der Codex-Host liest stattdessen [`codex.models`](#codex). Jeder Schlüssel ist optional; wird der Abschnitt weggelassen, bleiben Worker `sonnet`/`medium` und Reviewer `opus`/`medium`. Der Aufwand ist einer von `low`, `medium`, `high`, `xhigh`, `max`.

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  }
}
```

- `worker.model` (Standard `sonnet`), `worker.effort` (Standard `medium`): der Worker. Eine `Model:`-Zeile eines Tickets überschreibt `worker` nur für diesen Worker.
- `reviewer.medium` und `reviewer.high` (Standard jeweils `opus`, `medium`): der Reviewer für jede von `emet assess` zurückgegebene Risikostufe. `reviewer.high.effort` erhöhen (zum Beispiel auf `high`) für mehr Sorgfalt bei riskanten Wellen.
- `triage` (Standard `haiku`): das günstige Modell für die CI-Log-Triage und das Review der Stufe passive. Eine fehlgeschlagene Prüfung geht an einen Agent mit diesem Modell, der höchstens etwa 2k Tokens mit `file:line`-Verweisen zurückgibt.
- `escalation` (Standard `{ "sonnet": "opus" }`): die nächste Modellstufe pro Modellname, verwendet, wenn ein Ticket sein Korrekturlimit erreicht.

## agentHost

`agentHost` (Standard `"claude"`): der Agent-Host, in dem ein Lauf ausgeführt wird, `"claude"` oder `"codex"`. Siehe den [Codex-Leitfaden](../guide/codex.md).

## codex

Wird nur gelesen, wenn `agentHost` `"codex"` ist. Alle Schlüssel sind optional. Der Aufwand ist einer von `low`, `medium`, `high`, `xhigh`, `max`; `ultra` wird nie akzeptiert.

- `models.worker`, `models.workerOverride`, `models.reviewer.medium`, `models.reviewer.high`, `models.triage`: jeweils `{ "model", "effort", "fallback" }`. `fallback` listet die Slugs, die der Reihe nach versucht werden, wenn `model` im Modell-Cache von Codex fehlt. Die Standardwerte stehen unter [Modelle und Aufwand](../guide/models-and-effort.md).
- `models.session`: `{ "model", "effort", "planEffort", "fallback" }` für die Sitzung, die `$emet:run` ausführt. `planEffort` gilt bis zur ersten Freigabe.
- `effort`: wenn gesetzt, ersetzt er den Aufwand aller Rollen.
- `minVersion` (Standard `0.167.0`): die älteste Version der `codex`-CLI, die emet unterstützt. `emet doctor` vergleicht die installierte Version nicht damit.
- `sandbox` (Standard `danger-full-access`): der Sandbox-Modus, den `emet dispatch`, `emet review-run` und ein Codex-`emet launch` als `-s` übergeben. `workspace-write` wird ebenfalls akzeptiert, macht aber `.git` schreibgeschützt, sodass Worker nicht committen können. Unabhängig vom Wert verweigert `emet guard` `git push` auf Codex, und die erzeugte Overlay-`config.toml` enthält nur den emet-Marketplace und das Plugin, vertrauenswürdige Tabellen für die eigenen Verzeichnisse des Laufs sowie das aufgelöste Modell und den aufgelösten Aufwand (nie deine eigenen Tabellen). Siehe den [Codex-Leitfaden](../guide/codex.md) und [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md).

## review

```json
{ "review": { "highRiskPaths": [] } }
```

- `highRiskPaths` (Standard `[]`): zusätzliche, nicht zwischen Groß- und Kleinschreibung unterscheidende Pfad-Teilstrings, die in `emet assess` die Review-Stufe `high` erzwingen, zusätzlich zum eingebauten Satz (Authentifizierung, Sicherheit, Zahlungen, Webhooks, CI, der Installer, Lockfiles, Migrationen und gefährliche Senken wie rohes SQL oder Pipe-to-Shell).

## landing

- `mode` (Standard `pr`): `pr` öffnet einen Pull Request (erfordert `gh`). `merge` mergt den Integrationsbranch mit `emet land` in den lokalen Trunk und pusht nie, wobei `commands.selfCheck` die CI ersetzt. Unabhängig vom Tracker. Siehe [ADR-0010](../adr/0010-local-merge-landing.md).

## tracker

Mit welchem Issue-Tracker `/emet` (unter Codex `$emet`) spricht. Die CLI liest `kind`, um zu entscheiden, welche Abhängigkeitsprüfungen gelten; der Rest dokumentiert den Adapter, dem der Befehl `/emet` folgt (siehe [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md)).

- `kind` (erforderlich): `linear`, `github` oder `local`. Für `local` siehe [Lokaler Tracker](cli.md#lokaler-tracker) und [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
- `transitions.onStart`, `transitions.onPrOpen`, `transitions.onPrMerge`: wer jeden Ticket-Statusübergang schreibt: `worker`, `coordinator` oder `automatic` (die Tracker-Integration übernimmt das, zum Beispiel die GitHub-Integration von Linear beim Öffnen oder Mergen eines PR). Der Koordinator schreibt nie einen als `automatic` gekennzeichneten Übergang.
- `github.priorityLabels`: ordnet eine Prioritätsstufe (`"1"` = P0 höchste bis `"4"` = P3) einem GitHub-Label-Namen zu, zum Beispiel `{"1":"P0","2":"P1"}`. Ohne Angabe werden Tickets aufsteigend nach `createdAt` sortiert, und `emet doctor` weist darauf hin.
- `github.stateLabels`: ordnet einen Workflow-Status (`todo`, `in-progress`, `in-review`) einem GitHub-Label-Namen zu, zum Beispiel `{"todo":"status:todo"}`. `done` und `canceled` werden aus dem geschlossenen Zustand und dem `state_reason` des Issues abgeleitet.
- `linear`: Linear-spezifische Einstellungen (Team-Schlüssel, Namen der Workflow-Status). Wird nur vom Modell gelesen, das `docs/agents/issue-tracker.md` folgt, nie von der CLI.
- `local.idPrefix` (deprecated): lokale Ticket-IDs lauten jetzt `<feature-slug>-<NN>`.
- `readyLabel`, `triageLabels`, `prReference` (deprecated): Vorlagen für Labels und PR-Verweise, zum Beispiel `Closes #{number}` (github) oder `Refs: {id}` (linear).

## preflight

- `requiredFiles` (Standard keine): Dateien, die `emet preflight` im Repo-Stamm verlangt, bevor eine Welle dispatcht wird, jeweils `{ "path", "why" }`; `why` erscheint in der Fehlermeldung. Leer bedeutet, dass die Prüfung nicht läuft.
- `requiredCommands` (Standard keine): Binärdateien, die vor dem Dispatch im PATH auflösbar sein müssen. `emet preflight` scheitert mit Exit-Code 1 und nennt jede nicht auflösbare, und `emet doctor` meldet sie. Das ist die repo-eigene Liste, getrennt von den trackergesteuerten [Abhängigkeitsprüfungen](dependencies.md#was-was-prüft); `gh` hat bereits eine eigene Prüfung, die Aufnahme ist also optional. Häufige Ergänzungen: `rg` und `sg`.

## specs

- `dir` (Standard `docs/specs`): repo-relatives Verzeichnis der lebenden Specs, geschrieben von `emet spec-merge`.

## map

- `path` (Standard `docs/agents/codebase.md`): repo-relativer Pfad der von `emet map` erzeugten Karte.

## concurrency

- `waveSize` (Standard `4`, Minimum `1`): die meisten gemeinsam in einer Welle dispatchten Agent-Aufrufe.
- `maxLiveWorkers` (Standard `auto`): globale Obergrenze, die sich alle auf diesem Host laufenden `/emet`-Koordinatoren über alle Repos hinweg teilen. Der Slot-Pool liegt unter `~/.local/state/emet/slots`, nicht in einem einzelnen Repo. `auto` leitet die Obergrenze aus CPU-Anzahl und RAM des Hosts ab; eine positive ganze Zahl legt sie fest. Eine separate Speicherreserve-Prüfung (`EMET_MEM_RESERVE_GIB`, Standard 8 GiB) lehnt einen Acquire ab, wenn der verfügbare Speicher zu gering ist, unabhängig von dieser Obergrenze. Die Umgebungsvariable `EMET_MAX_LIVE_WORKERS` überschreibt dieses Feld und akzeptiert ebenfalls `auto`.
- `runIdleThresholdMs` (Standard `5400000`, 90 Minuten): wie lange ein Lauf ohne lebenden Anker allein anhand der Aktualität des Transkripts noch als untätig statt als tot eingestuft wird. Die Umgebungsvariable `EMET_RUN_IDLE_THRESHOLD_MS` überschreibt ihn.

Siehe [Umgebungsvariablen](cli.md#umgebungsvariablen).

## ticket

- `idPattern`: verankerter Regex-Quelltext, dem eine Ticket-ID entsprechen muss, zum Beispiel `^PROJ-\d+$`. Ein ungültiges Muster ist ein harter Konfigurationsfehler.
- `branchPrefix`: Präfix in Kleinbuchstaben (`^[a-z0-9-]+$`) für den lokalen Branch eines Workers. Branches heißen `<branchPrefix>-<number>-<slug>`, und `cleanup` durchsucht das Glob `<branchPrefix>-*`.
- `idExample` (deprecated, prose-only): eine Beispiel-ID, die zu `idPattern` passt.
- `branchPattern` (deprecated, prose-only): vollständige Vorlage für Branch-Namen.

## commands

Alle prose-only.

- `selfCheck`: Befehle, die ein Worker ausführt, bevor er seine Änderung als fertig betrachtet, zum Beispiel `["npm run check"]`. Unter `landing.mode` `merge` ersetzt er die CI.
- `workerScopedSuite`: Befehl, mit dem ein Worker nur den berührten Bereich testet. `emet verify` verlangt, dass er besteht.
- `fullSuite.run`: Befehl für die repoweite Suite, einmal auf dem Integrationsbranch ausgeführt, nachdem die Branches einer Welle gemergt wurden. Ein roter Lauf blockiert den PR und `autoChain`.
- `fullSuite.singleton`: `true`, wenn nur ein Worktree die Suite gleichzeitig ausführen darf.
- `fullSuite.runInBackground`, `fullSuite.reset` (deprecated): Hintergrund-Flag und Befehle zum Zurücksetzen des Zustands.

## worktree

- `lockReason`: Vorlage für den `git worktree lock`-Grund, den ein Worker beim Bootstrap schreibt, von `emet lock-reason` ausgefüllt. Der Standard ist `emet run={runId} ticket={ticket} anchor={anchorPid} slug={coordinatorSlug} at={iso}`. Nur überschreiben, um Felder hinzuzufügen: `emet lock-reason` lehnt eine Vorlage ab, der das Literal `emet` oder eines von `run=`, `ticket=`, `anchor=`, `at=` oder `slug=` fehlt.
- `copyFromMain` (prose-only): Pfade, die vor dem Bootstrap aus dem Trunk-Checkout in einen frischen Worktree kopiert werden, zum Beispiel nicht versionierte Env-Dateien.
- `bootstrap` (prose-only): Shell-Befehle, die einmal in einem frischen Worktree ausgeführt werden, bevor ein Worker startet, zum Beispiel `["npm ci"]`. Ausgeführt von `/emet` Phase 6, nie von der CLI.
- `stateDir` (deprecated, prose-only): Verzeichnis für lauflokale Logs, zum Beispiel `.emet`.

## usage

- `oversizedReadLines` (Standard `400`, Minimum `1`): Ein Read ohne Offset oder Limit auf eine Datei mit mehr Zeilen als diesem Wert gilt in `emet usage` als überdimensioniert.
- `stalledMinutes` (Standard `10`, Minimum `1`): Standardschwelle für `--minutes` bei `emet usage --stalled`.

## sizing

- `inlineMaxLines` (Standard `100`, Minimum `1`): der größte Ticket-Text, in Zeilen, der inline in einem Worker-Prompt bleibt.

## schema

Prose-only. Die Zuständigkeit dieses Repos für Datenschemata, verwendet von der Konfliktvermeidungsregel in Phase 3 beim Aufteilen von Tickets. Leer oder weggelassen überspringt die Regel.

- `ownedPaths`: Pfade, die ein gemeinsames Schema definieren, zum Beispiel `["prisma/schema.prisma"]`. Höchstens ein Worker pro Welle darf sie berühren.
- `sharedDatabase` (deprecated): `true`, wenn Worker eine physische Datenbank teilen.

## commit

Prose-only.

- `trailer`: Git-Trailer-Schlüssel, den ein Worker an Commits anhängt, die das Ticket referenzieren, zum Beispiel `Refs`.
- `trailerPosition`: `body` oder `footer`.

## repo

- `trunk`: der Branch, in den die Änderungen jedes Workers gemergt werden und der die Basis jedes Git-Vergleichs bei cleanup und preflight ist, zum Beispiel `main`.
- `remote` (Standard `origin`): das Git-Remote, auf dem `trunk` liegt.
- `integrationBranch` (deprecated, prose-only): optionaler langlebiger Branch, auf dem eine Welle vor dem Trunk integriert wird.
- `commitTypes` (deprecated, prose-only): erlaubte Conventional-Commit-Typen für Worker-Commits.

## design

Optional, prose-only. `null` oder weggelassen überspringt den Design-/UI-Review-Schritt.

- `canvasIndex` (deprecated): Pfad zu einer Design-Canvas-Datei, die Worker vor UI-Änderungen prüfen.
