---
title: Specs vivas
description: Cómo se mantiene al día una spec mientras aterrizan sus tickets.
seoTitle: Specs vivas en emet
sourceHash: d2468b14b371c04b
---

Una spec en el tracker es un plan: sus requisitos, sus tickets y sus oleadas. Cuando los tickets se cierran, el tracker ya no dice qué hace el sistema. Una spec viva llena ese vacío: un archivo por área bajo `docs/specs/` que describe el comportamiento actual, mantenido al día por el mismo pull request que lo cambia. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md); la decisión está en el [ADR-0038](../adr/0038-living-specs-hold-current-behaviour.md).

## Qué contiene una spec viva

Cada área tiene un archivo. Es una lista de requisitos, y cada requisito tiene un nombre descriptivo, una línea `Source: #<spec> S<n>` que apunta al elemento de la spec que lo introdujo, y uno o más escenarios en forma WHEN y THEN. La línea de origen importa porque los números S son locales a una spec, así que el nombre nunca usa uno.

Una spec viva describe comportamiento, no trabajo: nada en ella dice qué está planificado ni quién lo hace. Eso queda en el tracker.

## Cómo la actualiza una spec

Las specs vivas son opcionales, mediante `specs.enabled`. Cuando está activado, la actualización ocurre una vez por spec, en la última oleada de la spec:

1. El coordinador lee la spec viva actual de cada área afectada.
2. Para cada requisito que toca la spec, decide si el requisito se añade, se modifica o se elimina, y escribe el resultado como un delta de spec en un directorio compartido por todos los worktrees del repo.
3. `emet spec-merge` incorpora los deltas en los archivos de `docs/specs/`. Nunca ejecuta git; el coordinador hace el commit del resultado.
4. El commit forma parte de la última oleada, así que la revisión y las compuertas ven el cambio de la spec viva como cualquier otro cambio.

Una fusión que entra en conflicto, o que perdería un escenario existente, no escribe nada y termina con un error. El coordinador corrige el delta una vez; si falla de nuevo, la oleada aterriza sin la actualización y el informe lo dice.

## Por qué decide el coordinador

A qué área pertenece un requisito, y si es nuevo o cambia uno existente, es un juicio que necesita el archivo actual y la intención de la spec. Una herramienta que generara deltas de forma mecánica no podría saber ninguna de las dos cosas, así que el juicio queda con el coordinador y la fusión sigue siendo mecánica.

## Dónde aterriza

Con el aterrizaje por defecto, el commit de la spec viva viaja dentro de la rama de spec y llega a la rama troncal con el único pull request. Consulta [Aterrizaje](landing.md). Con una oleada como unidad de aterrizaje, forma parte del pull request de la última oleada.

## Véase también

- [Ejecuciones, oleadas y specs](runs-waves-specs.md)
- [Revisión y compuertas](review-and-gates.md)
- [Referencia de configuración](../reference/configuration.md) para `specs.enabled` y `specs.dir`
