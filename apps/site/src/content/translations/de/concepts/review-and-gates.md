---
title: Review und Gates
description: Wie das duale Review und die Gates entscheiden, ob Arbeit landen kann.
seoTitle: Review und Gates in emet
sourceHash: 6efa20526c00a453
---

Wie das duale Review und die Gates entscheiden, ob Arbeit landen kann. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md).

## Ein Reviewer prüft die Welle gegen die Spec

Nachdem die Branches einer Welle in den Integrations-Branch zusammengeführt wurden, liest ein **Reviewer** das Ergebnis in einem frischen Kontext und prüft es gegen die Spec. Der Reviewer ist ein eigener Agent, nie der Worker, der den Code geschrieben hat.

Wie viel Review eine Welle bekommt, hängt von ihrem Risiko ab. `emet assess` ordnet den Diff deterministisch einer von drei Stufen zu:

- `passive`: ein reiner Doku-Diff. Es läuft kein Reviewer.
- `medium`: eine gewöhnliche Quelltextänderung. Ein Reviewer läuft.
- `high`: der Diff berührt riskantes Terrain wie Authentifizierung, Zahlungen, CI, Migrationen oder gefährliche Senken. Diese Wellen bekommen das **Duale Review**.

## Duales Review in der Stufe high

Eine `high`-Welle wird von zwei Reviewern parallel über dasselbe Paket gelesen: dem Claude-Reviewer und einem Codex-Reviewer. Ein Modell teilt seine eigenen blinden Flecken, ein zweites, unabhängiges Lesen ist deshalb der Sinn der Sache.

Der Koordinator führt dann die beiden Befundmengen zusammen. Ein Befund, den beide Reviewer melden, bleibt als übereinstimmend offen. Ein Befund, den nur ein Reviewer gemeldet hat, wird vom Koordinator gesichtet, der ihn behält oder mit einer protokollierten Regel verwirft. Ein Befund, der einer Anforderung widerspricht, die du ausdrücklich gewählt hast, wird nie verworfen.

Das Duale Review läuft nur, wenn die Stufe `high` ist, der Host Claude Code ist, die Binärdatei `codex` im PATH liegt und `review.dual` nicht `off` ist. Andernfalls läuft ein Reviewer. Wellen der Stufen medium und passive kosten in beiden Fällen dasselbe, und die Reviewer-Tokens verdoppeln sich ungefähr nur in high-Wellen. Siehe [ADR-0040](../adr/0040-dual-review-in-the-high-tier.md).

## Befunde werden geprüft, nicht geglaubt

Die CLI verifiziert, was der Reviewer behauptet:

- **Abdeckungsurteile.** Für jede Anforderung sagt der Reviewer erfüllt, teilweise oder nicht erfüllt (`met`, `partial`, `unmet`). Ein `met` muss einen Test nennen. Ein `met`, dessen Testdatei oder Testname fehlt, oder eine Anforderung ohne Urteil wird zu einem offenen Befund `verification-gap`. Die CLI führt selbst keine Tests aus; das tut die vollständige Suite auf dem Integrations-Branch.
- **Bereits vorhandene Befunde.** Ein Befund in einer Zeile, die die Welle nicht hinzugefügt oder geändert hat, wird gemeldet, blockiert das Gate aber nie.
- **Nutzeroptionen.** Eine Anforderung, die du ausdrücklich gewählt hast, wird als Nutzeroption markiert. Ein Befund dagegen blockiert in jeder Stufe und Schwere, auch in einer unberührten Zeile, und bringt eine Fix-Runde, nicht von selbst einen Stopp.

## Das Gate entscheidet

Die Phasen entscheiden nie selbst, dass Arbeit weitergehen darf. `emet gate` liest den Verify-Eintrag, die offenen Befunde, die Risikostufe, die CI, die Integrations-Suite und die Budgets und gibt eine Entscheidung aus:

- `merge` oder `chain`: Die Arbeit darf weitergehen.
- `hold`: Es fehlt etwas, das emet selbst lösen kann, etwa behebbare Befunde oder eine noch laufende Prüfung.
- `stop`: Eine Person muss entscheiden, bevor der Lauf weitergeht.
- `defer`: Das Ticket ist zu oft gescheitert; es wird beiseitegelegt, und der Rest der Welle läuft weiter.

## Fix-Runden

Sind blockierende Befunde offen, hält das Gate und verlangt eine **Fix-Runde**: Der Koordinator behebt die offenen Befunde, und ein Reviewer prüft nur diese erneut, nicht den ganzen Diff. Fix-Runden haben ein eigenes Budget, getrennt von den Review-Runden.

Das Gate stoppt, wenn ein Befund zeigt, dass die Spec selbst falsch war, wenn die Fix-Runden aufgebraucht sind und Befunde offen bleiben, oder wenn die Integrations-Suite zum zweiten Mal fehlschlägt, nachdem ihre fehlgeschlagenen Specs erneut gelaufen sind. Eine CI, die wegen der Maschine oder des Anbieters nie lief, wird wiederholt, ohne einen Fix-Versuch zu verbrauchen, und beim zweiten Mal in Folge als Infrastrukturproblem gemeldet.

Die Schlüssel stehen unter [`review`](../reference/configuration.md#review), [`gate`](../reference/configuration.md#gate) und [`budgets`](../reference/configuration.md#budgets). Die Befehle stehen unter [`emet assess`, `emet review` und `emet gate`](../reference/cli.md#gates-and-records). Zur Wahl der Reviewer-Modelle siehe [Modelle und Aufwand](../how-to/choose-models.md).
