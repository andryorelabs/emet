---
title: emet aktualisieren
description: Ein installiertes emet auf ein neues Release bringen und die automatische Marketplace-Aktualisierung für die Plugins einschalten.
seoTitle: emet aktualisieren
sourceHash: e9018d796fe23437
---

So wird ein installiertes emet auf ein neues Release gebracht. Die Begriffe folgen [GLOSSARY.md](../../GLOSSARY.md).

emet und das optionale Plugin `emet-mascot` stammen aus demselben Marketplace, `emet-marketplace`. Claude Code aktualisiert Marketplaces von Drittanbietern standardmäßig nicht von selbst, und ein Marketplace kann diese Voreinstellung für seine Nutzer nicht ändern.

## Unter Claude Code aktualisieren

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Die letzte Zeile entfällt, wenn das Maskottchen nicht installiert wurde. Anschließend Claude Code neu starten oder `/reload-plugins` ausführen. `claude plugin list` zeigt die installierten Versionen; die neueste steht in [CHANGELOG.md](../../CHANGELOG.md).

## Unter Codex aktualisieren

Die Marketplace-Momentaufnahme aktualisieren und das Plugin erneut hinzufügen. Ein zweites `codex plugin marketplace add` aktualisiert sie nicht:

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` zeigt, ob `emet@emet-marketplace` installiert und aktiviert ist.

## Automatisch aktualisieren

Die automatische Aktualisierung ist ein Claude-Code-Feature; unter Codex manuell aktualisieren. In Claude Code `/plugin` ausführen, den Tab **Marketplaces** öffnen, `emet-marketplace` auswählen und **Enable auto-update** wählen. Claude Code aktualisiert dann beim Start einer Sitzung den Marketplace und beide Plugins, und die nächste Sitzung lädt die neuen Versionen. Das wird auf jedem Rechner einzeln eingestellt.

## Mit install.sh installiert

Das neueste `main` im eigenen Klon ziehen und `./install.sh` erneut ausführen.
