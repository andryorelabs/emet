---
title: Tracker und Landing
description: Wo Tickets liegen, wie eine Welle als Pull Request oder lokaler Merge landet und wie Wellen verkettet werden.
seoTitle: Tracker und Landing in emet
sourceHash: c9ae0940af5cfbad
---

Wo Tickets liegen, wie eine Welle landet und wie Wellen verkettet werden. Jeder hier genannte Schlüssel steht in der [Konfigurationsreferenz](../reference/configuration.md); jeder Unterbefehl steht in der [CLI-Referenz](../reference/cli.md).

<img src="../brand/mascot/mascot-work.svg" alt="emet mascot, working" width="96" align="right">

## Tracker

emet arbeitet mit Linear, GitHub Issues oder lokalen Dateien, festgelegt durch `tracker.kind`. Für den Tracker `github` ist `gh` erforderlich. Für den Tracker `linear` muss ein Linear-MCP-Server in `.mcp.json` (oder im Nutzerbereich) deklariert sein; siehe die [Referenz der Abhängigkeiten](../reference/dependencies.md).

### Lokaler Tracker

Mit `tracker.kind: "local"` sind Specs und Tickets Markdown-Dateien unter `.scratch/` des Haupt-Worktrees (nicht versioniert): `.scratch/<slug>/spec.md` und `.scratch/<slug>/issues/<NN>-<slug>.md`, jeweils mit den Zeilen `Status:` und `Blocked by:` und Kommentaren unter `## Comments`. Der Koordinator liest und schreibt sie über `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` richtet das ein. Siehe [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

## Landing

`landing.mode` ist `"pr"` (Standard) oder `"merge"`, unabhängig vom Tracker. Im Modus `merge` landet eine Welle mit `emet land` als ein lokaler Merge in den Trunk, wobei `commands.selfCheck` die CI ersetzt und nichts gepusht wird. `gh` ist nur erforderlich, wenn der Tracker `github` ist oder das Landing `pr` verwendet. Siehe [ADR-0010](../adr/0010-local-merge-landing.md).

### Landing-PRs

Eine Welle ist ein PR. Sein Text enthält für jedes Ticket `Closes #N` (das Schließ-Schlüsselwort des Trackers), und der Koordinator setzt die Tickets auf in-review, sobald er den PR öffnet. Der PR wird dann gemäß `pr.autoMerge` gemergt oder bleibt offen, wenn die Welle markiert wurde, `autoMerge` den Wert `false` hat oder die CI-Korrekturen aufgebraucht sind (der PR erhält dann das Label human-decision). Nach einem Merge gibt `emet cleanup --run <runId>` die Branches, Ticket-Claims und Worker-Slots der Welle frei.

Nachdem die Branches einer Welle zusammengeführt wurden, läuft `commands.fullSuite` einmal auf dem Integrationsbranch. Ein roter Lauf blockiert den PR und `autoChain`. Das Gate erhält das Ergebnis als `--integration`.

### Wellen verketten

Spätere Wellen laufen in eigenen Sitzungen, nie in der, die Welle 1 ausgeführt hat. Zwei optionale Abschnitte von `emet.config.json` steuern, was als Nächstes geschieht (beide werden von `emet preflight` validiert):

```json
{
  "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 },
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `pr.autoMerge` (Standard `true`): auf die Prüfungen des PR warten und mergen; ohne Prüfungen sofort mergen. Eine fehlgeschlagene Prüfung wird korrigiert und gepusht, bis zu `maxCiFixAttempts`-mal, danach bleibt der PR für einen Menschen offen. Eine Welle mit irgendeiner Markierung wird nie automatisch gemergt.
- `handoff.autoChain` (Standard `false`): Nach einer sauberen, gemergten Welle mit weiteren offenen Wellen die nächste mit `claude --bg` starten, statt `/emet:run --dispatch <spec-id>` auszugeben. Mit `claude agents` / `claude attach emet-<spec-id>-w<n>` einsehbar. Voraussetzungen:
  1. `claude` im PATH, mit `--bg`-Unterstützung.
  2. Ein vertrauenswürdiger Arbeitsbereich. `--bg` läuft nicht interaktiv, daher erscheint der Vertrauensdialog nie; `claude` einmal interaktiv im Repo öffnen und bestätigen.
  3. Die Bypass-Warnung einmal in einer interaktiven Sitzung akzeptiert (`skipDangerousModePermissionPrompt`), da die nächste Welle im `handoff.permissionMode` (unten) läuft, nicht im Modus der startenden Sitzung.

  Der Start erfolgt nur, wenn der PR gemergt wurde und nichts markiert war, und wird übersprungen, wenn bereits eine Sitzung `emet-<spec-id>-*` läuft (`claude agents --json`). Schlägt der Start fehl, wird stattdessen `/emet:run --dispatch <spec-id>` ausgegeben.

- `handoff.launcher` (Standard `auto`): die Welle zusätzlich in einem Orca-Tab öffnen, der `claude attach` ausführt. `auto` fragt die Orca-Runtime (`orca status`) und funktioniert daher auch aus `claude --bg`-Sitzungen, die kein `TERM_PROGRAM` haben; `orca` versucht es immer, `bg` nie. Die Welle läuft in beiden Fällen im Hintergrund, und ein Tab, der sich nicht öffnen lässt, stoppt die Kette nie.

  `emet launch <spec-id> --wave <n>` erledigt den gesamten Start (Prüfung auf doppelte Sitzungen, `claude --bg`, Tab) und gibt `{ name, id, attach, orcaTab: { opened, reason } }` aus. Dieses statt eines bloßen `claude --bg` verwenden, wenn eine Welle von Hand in einer anderen Sitzung laufen soll.

  Auf dem Agent host Codex startet `emet launch` ein abgekoppeltes `codex exec`, das `$emet:run --dispatch <spec-id>` ausführt, und speichert dessen Thread-ID. Es öffnet keinen Orca-Tab, und `codex exec resume <id>` setzt die Sitzung fort. Siehe die [CLI-Referenz](../reference/cli.md#codex-host) und [emet mit Codex ausführen](codex.md).

- `handoff.permissionMode` (Standard `bypassPermissions`): Berechtigungsmodus der verketteten Sitzung. Er wird nicht von der startenden Sitzung geerbt, weil der Klassifikator des Modus `auto` einen Schritt wie `gh pr merge` ablehnen und eine Welle halb fertig zurücklassen kann. Deine `permissions.deny`-Regeln gelten weiterhin, aber die Bypass-Warnung muss einmal interaktiv akzeptiert worden sein (`skipDangerousModePermissionPrompt`).

## Gates, Budgets und Aufzeichnungen

Die Phasen entscheiden nicht selbst, wann ein Ticket fertig, mergebar oder einen weiteren Versuch wert ist. Sie rufen einen CLI-Befehl auf, der eine Aufzeichnung auf der Festplatte liest und die Entscheidung ausgibt. Lauf-Aufzeichnungen liegen unter `.emet/runs/<run-id>/` und das Review-Ledger unter `.emet/review/`, im Haupt-Checkout, nicht im Worktree eines Workers. Jeder Befehl gibt seine Verwendung mit `--help` aus. Die Tabelle der Befehle und dessen, was jeder durchsetzt, steht unter [Gates und Aufzeichnungen](../reference/cli.md#gates-und-aufzeichnungen).

**Budgets** (`emet.config.json`, alle optional):

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts`: Wie oft ein Ticket `verify` nicht bestehen darf, bevor das Gate mit `defer` antwortet. Das Ticket erhält das Label deferred, und der Rest der Welle läuft weiter. Ein Umgebungsfehler, etwa ein Testbefehl, der mit 126/127 endet, oder ein Anbieterausfall, pausiert den Lauf, ohne einen Versuch zu verbrauchen.
- `reviewRounds`: Wie viele Review-/Fix-Runden ein Ticket erhält, bevor einmal auf die nächste Modellstufe eskaliert wird. Was danach noch offen ist, bekommt eine Entscheidung.
- `stallNudgeCap`: Wie oft ein festgefahrener Worker angestoßen wird. Der Zähler wird nie zurückgesetzt.

## Lebende Specs, Karte und Metriken

**Lebende Specs.** Nachdem eine Welle automatisch gemergt wurde, führt `emet spec-merge --spec <id>` die Anforderungs-Deltas `ADDED`/`MODIFIED`/`REMOVED` der Spec in `docs/specs/<area>.md` (`specs.dir`) zusammen. Es prüft jeden Bereich, bevor es etwas schreibt. Ein Konflikt oder eine Anforderung, die ein Szenario verlieren würde, endet mit Exit-Code 1 und lässt jede Datei unberührt.

**Codebase-Karte.** `emet map` schreibt eine Kurzbeschreibung einer bestehenden Codebase (Stack, Struktur, Konventionen, Tests, Hotspots) nach `docs/agents/codebase.md` (`map.path`), versehen mit dem Commit-SHA, aus dem sie erstellt wurde. Derselbe Commit erzeugt immer dieselbe Datei. `emet map --stale` endet mit Exit-Code 1, sobald HEAD über den Stempel hinausgewandert ist, und `emet preflight` warnt in diesem Fall. `emet map --for <globs>` gibt nur die Abschnitte aus, die zu den Bearbeitungsflächen eines Tickets passen. Diese Ausgabe ist der einzige Teil der Karte, den ein Worker-Briefing enthält.

**Metriken.** `emet metrics --run <id>` berichtet Tokens, API-äquivalente Kosten und Laufzeit pro Ticket, pro Welle und pro Lauf, gelesen aus den Sitzungsprotokollen. Es vergleicht außerdem das pro Ticket geschätzte Kontextbudget mit dem, was jeder Worker tatsächlich verbraucht hat. Die Zusammenfassung steht am Ende des Abschlussberichts des Laufs.
