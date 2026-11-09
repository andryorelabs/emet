---
title: Modelle und Aufwand
description: Wie emet für jede Rolle ein Modell und einen Denkaufwand wählt und welche Konfigurationsschlüssel sie ändern.
seoTitle: Modelle und Aufwand in emet
sourceHash: 7ab8a2e10ec9cae7
---

`/emet` wählt für jede Rolle automatisch ein Modell und einen Denkaufwand; mitten im Lauf muss nichts von Hand umgestellt werden. Jeder Schlüssel steht in der [Konfigurationsreferenz](../reference/configuration.md#models).

| Rolle                                              | Modell                  | Aufwand                | Festgelegt durch                             |
| -------------------------------------------------- | ----------------------- | ---------------------- | -------------------------------------------- |
| Planung (Phasen 1–4)                               | Opus, über `opusplan`   | der deiner Sitzung     | einmalig durch dich                          |
| Koordinator, ab Phase 5                            | Sonnet, über `opusplan` | der deiner Sitzung     | einmalig durch dich                          |
| Worker (Phase 7)                                   | Sonnet                  | `medium`               | `agents/emet-worker.md` oder `models.worker` |
| Review, Stufe `passive` (Diff nur mit Doku)        | keines                  | —                      | `emet assess`                                |
| Review, Stufe `medium` (gewöhnliche Quelländerung) | Opus                    | `medium`               | `models.reviewer.medium`                     |
| Review, Stufe `high` (riskante Pfade oder Senken)  | Opus                    | standardmäßig `medium` | `models.reviewer.high`                       |
| CI-Log-Triage (Phase 8)                            | Haiku                   | —                      | `models.triage`                              |

Die beiden Agent-Definitionen (von `install.sh` nach `~/.claude/agents/` installiert) legen `model`/`effort` selbst im Frontmatter fest, sodass die Modell- und Aufwandswahl des Koordinators nie in einen Worker oder den Reviewer durchsickert. `emet doctor` meldet (blockiert aber nie), wenn eine der beiden Dateien fehlt. `emet preflight` blockiert den Dispatch, wenn `emet-worker` oder `emet-reviewer` fehlt, weil Phase 6 und Phase 8 über `subagent_type` dispatchen.

## Routing nach Risikostufe

Phase 8 führt `emet assess --base <trunk> --head <integration branch>` aus, das den Diff deterministisch klassifiziert und JSON mit der Stufe, den Gründen und dem empfohlenen Reviewer-Modell samt Aufwand ausgibt:

- `passive`: Diff nur mit Doku; es wird kein Reviewer dispatcht.
- `medium`: Der Reviewer läuft mit `models.reviewer.medium`.
- `high`: Der Diff berührt Authentifizierung, Sicherheit, Zahlungen, Webhooks, CI, den Installer, Lockfiles, Migrationen, eine gefährliche Senke (rohes SQL, Pipe-to-Shell und Ähnliches) oder einen Pfad, der zu `review.highRiskPaths` passt. Der Reviewer läuft mit `models.reviewer.high`, und Auto-Merge landet den PR nur bei grünen Prüfungen und ohne offenen Review-Befund.

Ein Ticket, das riskante Pfade berührt, kann eine `Model:`-Zeile tragen (zum Beispiel `Model: opus` oder `Model: opus/high`), die `models.worker` nur für diesen Worker überschreibt.

## Haiku-Triage

Der Koordinator liest nie ein vollständiges CI-Log. Eine fehlgeschlagene Prüfung geht an einen Agent mit `models.triage` (Standard `haiku`), der höchstens etwa 2k Tokens mit `file:line`-Verweisen für die Korrektur zurückgibt.

## Konfiguration

Jeder Schlüssel ist optional, und die Standardwerte entsprechen der Tabelle oben:

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  },
  "review": { "highRiskPaths": [] }
}
```

`review.highRiskPaths` ist eine Liste zusätzlicher, nicht zwischen Groß- und Kleinschreibung unterscheidender Pfad-Teilstrings, die die Stufe `high` erzwingen. Für mehr Sorgfalt bei riskanten Wellen `models.reviewer.high.effort` erhöhen (zum Beispiel auf `high`).

## Codex-Host

Mit `agentHost` auf `"codex"` ist jeder Worker und Reviewer ein eigener `codex exec`-Prozess, bei dem `-m` und `model_reasoning_effort` je Rolle gesetzt werden. Die Standardwerte des Abschnitts [`codex`](../reference/configuration.md) sind:

| Rolle                           | Modell        | Aufwand                               | Ausweichmodelle               |
| ------------------------------- | ------------- | ------------------------------------- | ----------------------------- |
| Sitzung (`$emet:run`)           | `gpt-6.1-sol` | `medium` (`high` während der Planung) | keine                         |
| Worker                          | `gpt-6.1-sol` | `medium`                              | `gpt-6.1-terra`, `gpt-6-luna` |
| Worker mit einer `Model:`-Zeile | `gpt-6.1-sol` | `xhigh`                               | `gpt-6-astra`                 |
| Reviewer, Stufe `medium`        | `gpt-6.1-sol` | `high`                                | keine                         |
| Reviewer, Stufe `high`          | `gpt-6-astra` | `high`                                | `gpt-6.1-sol`                 |
| Triage                          | `gpt-6-luna`  | `medium`                              | `gpt-6.1-terra`               |

`emet dispatch` löst jeden Slug gegen den Modell-Cache von Codex auf. Er behält einen Slug, der dort gelistet ist und den Aufwand unterstützt, folgt sonst dem Upgrade des Modells, dann den Ausweichmodellen, lässt dann `-m` weg und protokolliert jede Ersetzung. Der Aufwand `ultra` wird nie gesendet. Die Stufe `passive` startet keinen Reviewer.

Stelle nach einigen echten Wellen neu ein, wenn:

- Worker wiederholt Korrekturrunden brauchen: erhöhe `codex.models.worker.effort` oder setze eine `Model:`-Zeile auf das riskante Ticket;
- Reviews von Wellen der Stufe `high` Befunde übersehen: erhöhe `codex.models.reviewer.high.effort`;
- das Protokoll eine Ersetzung zeigt: Codex hat einen Slug umbenannt oder abgeschafft, also aktualisiere den Slug.

## Warum ein einzelner Reviewer

Warum ein einzelner Reviewer mit frischem Kontext statt eines Fächers aus mehreren Blickwinkeln: Kein öffentlicher Benchmark vergleicht beide direkt, aber ein Fächer liest den gesamten Diff einmal pro Blickwinkel neu und hat in diesem Repo über eine Stunde lang gehangen, während Berichte von Anthropic und Dritten zu Modellen der Opus-Klasse nahelegen, dass das Modell-Upgrade so viel bringt wie die zusätzlichen Blickwinkel. Für eine Welle mit hohem Einsatz danach `/code-review ultra` von Hand ausführen; `/emet` dispatcht das nie von sich aus.

## Was du einmalig selbst festlegst

`/emet` kann diese Einstellungen nicht mitten im Lauf umstellen:

- `model: "opusplan"` in `~/.claude/settings.json`: Damit laufen die Phasen 1–4 auf Opus und ab Phase 5 auf Sonnet, ohne dass `/model` nötig wäre. `emet doctor` warnt (und ändert nie deine Einstellungen), wenn es nicht gesetzt ist.
- Ein Sitzungsaufwand von `medium` oder `high` statt `xhigh`: Die Worker und der Reviewer tragen ihren eigenen Aufwand unabhängig von deinem, und ein hoher globaler Standard verursacht vor allem Kosten bei den eigenen Zügen des Koordinators (Dispatch-Buchhaltung, Merges, Berichte), die ihn nicht brauchen.
- Ein `permissions.defaultMode`, der unbeaufsichtigt laufen kann (`auto`, `acceptEdits` oder `bypassPermissions`), plus `permissions.deny`-Regeln, die `git push * main|master` und `git push --force *` blockieren. `emet doctor` warnt bei beiden, denn eine Welle, die an einer Berechtigungsabfrage hängt oder sich am Trunk-Branch vorbeizwingen kann, verfehlt den Sinn des unbeaufsichtigten Laufs.

Das sind Ausgangspunkte, keine endgültigen Zahlen. Opus 5.5 erschien am 2026-09-22, und die Wahl von Aufwand und Modell für Coding-Agents ist weiterhin ein aktives Feld; nach einigen echten Wellen neu abstimmen, statt diese Tabelle als endgültig zu behandeln.
