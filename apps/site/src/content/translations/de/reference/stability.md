---
title: Stabilität
description: Was emet nicht zu brechen verspricht und was sich ändern darf.
seoTitle: Stabilität von emet
sourceHash: 5a596d218f43a27d
---

Was emet nicht zu brechen verspricht und was sich ändern darf. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md).

## Stabile Oberflächen

Eine Änderung an einer stabilen Oberfläche, die einen bestehenden Aufrufer bricht, ist ein Breaking Change. Sie wartet auf eine Major-Version und wird in [CHANGELOG.md](../../CHANGELOG.md) hervorgehoben.

- **CLI-Flags.** Die Unterbefehle und Flags, die in der [CLI-Referenz](cli.md) aufgeführt sind. Ein Flag wird nicht entfernt und erhält keine andere Bedeutung; neue Flags können hinzukommen.
- **Exit-Codes.** `0` sauber, `1` Befunde, auf die zu reagieren ist, `2` Konfigurations- oder Verwendungsfehler, `3` interner Fehler. Die Prompts und Skripte verlassen sich auf diese Zahlen. Siehe [Exit-Codes](cli.md#exit-codes).
- **Das Konfigurationsschema.** `emet.config.json`, wie es [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json) und die [Konfigurationsreferenz](configuration.md) beschreiben. Ein Schlüssel wird nicht ohne Erhöhung der Schema-`version` entfernt oder umbenannt; neue optionale Schlüssel können hinzukommen.
- **Der `--json`-Envelope.** Die Struktur der obersten Ebene des JSON, das ein Befehl mit `--json` ausgibt. Felder werden nicht entfernt oder in ihrem Typ geändert; neue Felder können hinzukommen, daher müssen Parser unbekannte Felder ignorieren.

## Interne Oberflächen

Diese können sich in jedem Release ändern, ohne einen Changelog-Eintrag über eine normale Notiz hinaus. Nicht davon abhängig machen.

- Die Module unter `emet/src/` und ihre exportierten Funktionen und Typen.
- Der Prompt-Wortlaut in `emet/reference/`, `commands/` und `agents/`, der sich nur in einem Ticket ändert, das die Absätze benennt ([ADR-0036](../adr/0036-prompt-wording-changes-under-an-explicit-ticket.md)).
- Form und Ort der Zustandsdateien, Ledger und Aufzeichnungen unter `.emet/` sowie des hostweiten Slot-Pools.
- Die erzeugten Codex-Dateien unter `codex/` und `.codex-plugin/`.
- Alles unter `tools/`, `apps/` und `docs/research/`.
- Der menschenlesbare Text von Meldungen, Berichten und der `--help`-Ausgabe.

## Veraltungen

Eine stabile Oberfläche wird mindestens ein Minor-Release lang als veraltet (deprecated) geführt, bevor sie in einer Major-Version entfernt wird. Die Veraltung wird im Changelog angekündigt und, wo die CLI sie erkennen kann, in einer Warnung auf stderr.

## Entscheidungen

Die Entscheidungsdokumente in [docs/adr](../adr/README.md) erklären, warum die Oberflächen so gezogen sind. Ist unklar, auf welche Seite etwas fällt, vor dem Verlassen darauf in einem Issue nachfragen.
