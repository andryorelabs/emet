---
title: Tracker und Landing
description: Wo Tickets liegen, wie eine Welle als Pull Request oder lokaler Merge landet und wie Wellen verkettet werden.
seoTitle: Tracker und Landing in emet
sourceHash: c79d8a04687b4620
---

Lege fest, wo Tickets liegen, wie eine Spec landet und ob Wellen verkettet werden. Jeder hier genannte Schlüssel steht in der [Konfigurationsreferenz](../reference/configuration.md); jeder Unterbefehl steht in der [CLI-Referenz](../reference/cli.md). Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md).

<img src="../brand/mascot/mascot-work.svg" alt="emet mascot, working" width="96" align="right">

## Voraussetzungen

- emet ist installiert und ein Repo hat eine `emet.config.json`; führe `emet init` aus, wenn es keine hat.
- Für den Tracker `github` oder das Landing `pr`: `gh` im `PATH` und angemeldet.
- Für den Tracker `linear`: ein Linear-MCP-Server, der in `.mcp.json` (oder im Nutzerbereich) deklariert ist. Siehe die [Referenz der Abhängigkeiten](../reference/dependencies.md).
- Um zu verstehen, was diese Einstellungen ändern, lies [Landing](../concepts/landing.md) und [Läufe, Wellen und Specs](../concepts/runs-waves-specs.md).

## Den Tracker wählen

:::steps

1. Setze `tracker.kind` in `emet.config.json` auf `"linear"`, `"github"` oder `"local"`.
2. Für einen lokalen Tracker führe `emet init --tracker local` aus. Specs und Tickets sind dann Markdown-Dateien unter `.scratch/` des Haupt-Worktrees (nicht versioniert): `.scratch/<slug>/spec.md` und `.scratch/<slug>/issues/<NN>-<slug>.md`, jeweils mit den Zeilen `Status:` und `Blocked by:` und Kommentaren unter `## Comments`. Der Koordinator liest und schreibt sie über `emet tracker`. Siehe [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
3. Bei den anderen Arten prüfe die passende Voraussetzung oben.

:::

## Wählen, wie eine Spec landet

:::steps

1. Setze `landing.mode` auf `"pr"` (Standard) oder `"merge"`. Im Modus `merge` landet eine Spec als ein lokaler Merge in den Trunk (`emet spec-branch land`, oder `emet land` pro Welle mit `landing.unit: "wave"`), `commands.selfCheck` ersetzt die CI, und nichts wird gepusht. Siehe [ADR-0010](../adr/0010-local-merge-landing.md).
2. Setze `landing.unit` auf `"spec"` (Standard, die ganze Spec landet auf einmal) oder `"wave"` (jede Welle landet allein). Siehe [ADR-0037](../adr/0037-landing-per-spec.md).
3. Setze bei `landing.unit: "spec"` in den Claude-Code-Einstellungen `worktree.baseRef: "head"`, damit Worker-Worktrees vom Branch `spec/<id>` starten. `emet preflight` und `emet doctor` prüfen das.
4. Setze im Modus `pr` `landing.specMergeMethod` (standardmäßig ein Merge-Commit) auf eine Methode, die die Repository-Einstellungen und das Trunk-Ruleset erlauben; `emet doctor` warnt, wenn sie sie nicht erlauben.
5. Um das Mergen zu steuern, setze `pr.autoMerge` (Standard `true`) und `pr.maxCiFixAttempts`. Setze `pr.mergeMethod` nur mit `landing.unit: "wave"`; ein Spec-Pull-Request nutzt `landing.specMergeMethod` aus Schritt 4 und ignoriert es. Eine Welle mit irgendeiner Markierung wird nie automatisch gemergt.

:::

Die Befehle für den Spec-Branch (`emet spec-branch ensure`, `integrate`, `sync`, `land`, `abandon`) werden vom Koordinator gesteuert; ihre Flags stehen in der [CLI-Referenz](../reference/cli.md).

## Wellen verketten

Spätere Wellen laufen in eigenen Sitzungen. Das Verketten ist standardmäßig aus.

:::steps

1. Setze den Abschnitt `handoff` in `emet.config.json`:

   ```json
   {
     "handoff": {
       "autoChain": true,
       "launcher": "auto",
       "permissionMode": "bypassPermissions"
     }
   }
   ```

2. Stelle unter Claude Code sicher, dass `claude` mit `--bg`-Unterstützung im `PATH` ist, der Arbeitsbereich vertrauenswürdig ist (öffne `claude` einmal interaktiv im Repo und bestätige es) und die Bypass-Warnung einmal in einer interaktiven Sitzung akzeptiert wurde (`skipDangerousModePermissionPrompt`).
3. Stelle unter Codex sicher, dass `codex` im `PATH` in Version `codex.minVersion` oder neuer ist, mit `--json` und `--output-schema` bei `codex exec`; die nächste Welle startet als abgekoppeltes `codex exec`. Siehe [emet mit Codex ausführen](use-codex.md).
4. Setze `handoff.launcher` (nur Claude Code) auf `auto`, `orca` oder `bg`, um zu wählen, ob die Welle zusätzlich einen Orca-Tab öffnet. `permissionMode` gilt nur für Claude Code; unter Codex nutzt die verkettete Sitzung `codex.sandbox`.
5. Um eine Welle von Hand in einer anderen Sitzung zu starten, führe `emet launch <spec-id> --wave <n>` aus statt eines bloßen `claude --bg`. Es gibt `{ name, id, attach, orcaTab: { opened, reason } }` aus.

:::

Das Verketten startet nur, wenn der PR gemergt wurde und nichts markiert war, wird übersprungen, wenn bereits eine Sitzung `emet-<spec-id>-*` läuft, und gibt stattdessen `/emet:run --dispatch <spec-id>` aus, wenn der Start fehlschlägt. Eine verkettete Welle lässt sich mit `claude agents` oder `claude attach emet-<spec-id>-w<n>` einsehen.

## Budgets und optionale Funktionen setzen

:::steps

1. Setze den Abschnitt `budgets`, wenn die Standardwerte nicht passen:

   ```json
   { "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
   ```

   `workerAttempts` ist, wie oft ein Ticket `verify` nicht bestehen darf, bevor es zurückgestellt wird; `reviewRounds` ist, wie viele Review-Runden ein Ticket erhält, bevor einmal eskaliert wird (Korrekturrunden haben mit `budgets.fixRounds` ein eigenes Budget, Standard 2); `stallNudgeCap` ist, wie oft ein festgefahrener Worker angestoßen wird. Siehe [Review und Gates](../concepts/review-and-gates.md).

2. Setze `specs.enabled`, um [Living specs](../concepts/living-specs.md) in `docs/specs/` (`specs.dir`) zu führen.
3. Führe `emet map` aus, um eine Codebase-Karte nach `docs/agents/codebase.md` (`map.path`) zu schreiben. `emet map --stale` endet mit Exit-Code 1, sobald HEAD über den Stempel hinausgewandert ist.
4. Führe nach einem Lauf `emet metrics --run <id>` aus, um Tokens, Kosten und Laufzeit pro Ticket, Welle und Lauf zu sehen.

:::

Für eine kleine Änderung mit einem einzigen Ticket starte `/emet:run --quick <Anfrage>` statt der vollständigen Pipeline; es landet immer pro Welle und stoppt bei einem Diff mit hohem Risiko.

## Prüfen

:::steps

1. Führe `emet preflight` aus; es validiert die Abschnitte `tracker`, `landing`, `pr`, `handoff` und `budgets` und endet bei einer fehlerhaften Konfiguration mit Exit-Code 2.
2. Führe `emet doctor .` aus und prüfe, dass kein Fehler den Tracker, `gh`, den Linear-MCP-Server oder die Landing-Einstellungen nennt.
3. Führe bei einem lokalen Tracker `emet tracker frontier --spec <slug>` aus und prüfe, dass es die erwarteten Tickets auflistet.

:::
