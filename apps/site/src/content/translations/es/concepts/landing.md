---
title: Aterrizaje
description: Cómo aterriza una spec, como un solo pull request por defecto, o oleada por oleada con landing.unit en wave.
seoTitle: Aterrizaje en emet
sourceHash: 11d51c9132097b57
---

Cómo aterriza una spec, por defecto como un solo pull request. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md).

Aquí, **Aterrizaje** significa cómo llega el trabajo terminado a la rama troncal. No tiene nada que ver con la página de inicio del Website.

## Un pull request por spec

Por defecto una spec aterriza como un solo pull request. Cada oleada sigue teniendo su propia revisión, compuerta y autocomprobación, pero una oleada que pasa no aterriza. El coordinador fusiona su rama de integración con `--no-ff` en una **Rama de spec** local, `spec/<id>`, y los tickets de la oleada pasan a estar **Integrated**. La siguiente oleada parte de la punta de esa rama, de modo que las oleadas posteriores se construyen sobre las anteriores sin esperar a la CI de un pull request.

Tras la última oleada, el coordinador sincroniza la rama troncal en la rama de spec con una fusión, nunca con un rebase, y la aterriza una sola vez: un pull request, o una fusión local cuando el modo de aterrizaje es `merge`, que nunca hace push. Cada oleada sigue siendo un commit de fusión separado en el historial de la rama troncal, así que se puede revertir una oleada.

Un ticket **Integrated** cuenta como bloqueador cerrado para la **Frontera**, pero permanece abierto hasta que el aterrizaje final lo cierra. **Landed** conserva su significado llano: en la rama troncal.

## Una oleada aterriza sola solo si lo pides

Con `landing.unit: wave`, cada oleada aterriza por sí sola: un pull request y una espera de CI por oleada, y la siguiente oleada empieza solo después de que ese pull request se fusione. Una spec con tres oleadas cuesta entonces tres pull requests. Este es el comportamiento anterior al [ADR-0037](../adr/0037-landing-per-spec.md), y sigue disponible.

Una **Ejecución rápida** siempre aterriza por oleada, porque tiene exactamente una oleada. Consulta el [ADR-0039](../adr/0039-quick-mode-lands-per-wave.md).

## Pull request o fusión local

Independientemente de la unidad, `landing.mode` elige cómo llega el trabajo a la rama troncal. `pr` abre un pull request y necesita `gh`. `merge` fusiona localmente con `emet land` o `emet spec-branch land` y nunca hace push, con el comando de autocomprobación del repositorio en lugar de la CI. Consulta el [ADR-0010](../adr/0010-local-merge-landing.md).

## Qué esperar

- Un defecto que solo detecta la CI aparece en el aterrizaje final, después de que oleadas posteriores se hayan construido sobre él.
- Un conflicto con la rama troncal aparece en la sincronización, donde el coordinador se detiene y lista las rutas.
- El checkout queda ligado a una spec a la vez; una segunda spec en paralelo necesita otro worktree.
- `spec/<id>` se sube con push tras cada oleada integrada por defecto, sin abrir un pull request, de modo que perder el disco cuesta como máximo una oleada.
- Fusionar el pull request de la spec con un commit de fusión conserva la reversión por oleada. Una rama troncal que solo permite fusiones squash aterriza la spec como un solo commit y pierde esa reversión.

Para las claves, consulta [`landing`](../reference/configuration.md#landing). Para los comandos, consulta [`emet spec-branch` y `emet land`](../reference/cli.md#planning-review-and-landing). Para la decisión, consulta el [ADR-0037](../adr/0037-landing-per-spec.md).
