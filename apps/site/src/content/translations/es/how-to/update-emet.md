---
title: Actualizar emet
description: Lleva un emet instalado a una versión nueva y activa la actualización automática del marketplace para los plugins.
seoTitle: Actualizar emet
sourceHash: 442bf243cbe7eadb
---

Cómo llevar un emet instalado a una versión nueva. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md).

emet y el plugin opcional `emet-mascot` provienen del mismo marketplace, `emet-marketplace`. Claude Code no actualiza por sí solo los marketplaces de terceros por defecto, y un marketplace no puede cambiar ese valor por defecto para sus usuarios.

## Actualizar a mano

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Omite la última línea si no instalaste la mascota. Reinicia Claude Code después, o ejecuta `/reload-plugins`. `claude plugin list` muestra las versiones instaladas; la más reciente está en [CHANGELOG.md](../../CHANGELOG.md).

## Actualizar en Codex

Actualiza la instantánea del marketplace y vuelve a añadir el plugin. Ejecutar `codex plugin marketplace add` por segunda vez no la actualiza:

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` muestra si `emet@emet-marketplace` está instalado y habilitado.

## Actualizar automáticamente

En Claude Code, ejecuta `/plugin`, abre la pestaña **Marketplaces**, selecciona `emet-marketplace` y elige **Enable auto-update**. Claude Code entonces actualiza el marketplace y ambos plugins cuando empieza una sesión, y la siguiente sesión carga las versiones nuevas. Cada usuario lo configura en su propia máquina.

## Instalado con install.sh

Trae el último `main` en tu clon y vuelve a ejecutar `./install.sh`.
