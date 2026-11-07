---
title: Usar la mascota de emet (mod de Claude Code y pet de Orca)
description: Muestra la mascota de emet en Claude Code con el mod y en Orca con el pet.
seoTitle: Usar la mascota de emet en Claude Code y Orca
sourceHash: caca9eb66e693e32
---

Cómo mostrar la **Mascot** de emet en Claude Code y en Orca. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md).

Hay dos piezas independientes: el plugin opcional `emet-mascot`, que dibuja la mascota en Claude Code, y el paquete de pet de Orca, que le da a Orca el mismo personaje.

## Instalar el plugin de la mascota

El plugin se distribuye en el mismo marketplace que emet y es opcional. emet no lo necesita.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet-mascot@emet-marketplace
```

La mascota sigue tu sesión (durmiendo, trabajando, esperando, lista, con error). Mientras hay un **Run** activo, también lee el **Phase file** y muestra una etiqueta tenue como `emet · wave 2 · review`.

Opciones del plugin:

- `position`: `pane` (el valor por defecto), `band` o `status`. `pane` acopla la mascota junto a la transcripción, lo que requiere el diseño de pantalla completa y una terminal de al menos 144 columnas de ancho hasta que abras el panel una vez tú mismo (unas 110 después); cuando no puede acoplarse, o la terminal se estrecha más tarde, la mascota se muestra encima del prompt. `band` siempre la dibuja encima del prompt. `status` muestra solo la etiqueta de texto como línea de estado del plugin, sin el arte de la mascota.
- `size`: `small` (16 x 8 celdas, el valor por defecto) o `medium` (24 x 12 celdas).
- `showLabel`: mostrar u ocultar la etiqueta junto a la mascota (activada por defecto).

## Actualizar el plugin de la mascota

Los marketplaces que no son el de Anthropic tienen la actualización automática desactivada por defecto, y un marketplace no puede activarla para sus usuarios. Actualiza a mano:

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Reinicia Claude Code después. Para que se actualice por sí solo, ejecuta `/plugin`, abre la pestaña **Marketplaces**, selecciona `emet-marketplace` y elige **Enable auto-update**. Cada usuario lo hace una vez en su propia máquina. Consulta [Actualizar emet](update-emet.md) para el plugin principal también.

## El archivo de fase

La CLI de emet escribe `.emet/phase.json` en el repositorio a medida que avanza una ejecución, y la mascota lo consulta aproximadamente cada dos segundos. Un archivo más antiguo que la ventana de frescura se ignora, de modo que una ejecución que falló no deja una etiqueta obsoleta.

El archivo contiene `phase` (`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done` o `failed`), `wave`, `spec`, `runId`, `updatedAt` y un `outcome` opcional. Una escritura que falla nunca hace fallar el subcomando que informó la fase.

## Usar el pet en Orca

El paquete del pet vive en `docs/brand/pet/emet/`: `pet.json` y `spritesheet.webp`. En los ajustes de Orca, usa "Import .codex-pet bundle…" y elige esa carpeta. La importación necesita `docs/brand/pet/emet/` en la máquina donde se ejecuta la aplicación Orca, así que copia la carpeta allí si Orca se ejecuta en un lugar distinto de este repositorio. Regéneralo con `bun run brand:export` tras cambiar un SVG de la mascota, y haz commit del resultado.

## Solución de problemas

- No hay mascota: ejecuta `claude plugin list`, comprueba que `emet-mascot` esté habilitado y luego reinicia Claude Code.
- No hay etiqueta: comprueba que `.emet/phase.json` exista y se haya actualizado hace poco.
