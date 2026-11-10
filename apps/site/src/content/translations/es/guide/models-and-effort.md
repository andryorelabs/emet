---
title: Modelos y esfuerzo
description: Cómo emet elige un modelo y un esfuerzo de razonamiento para cada rol, y qué claves de configuración los cambian.
seoTitle: Modelos y esfuerzo en emet
sourceHash: a46d2e68a403f4f9
---

`/emet` elige automáticamente un modelo y un esfuerzo de razonamiento por rol; no hay nada que cambiar a mano durante una ejecución. Todas las claves están en la [referencia de configuración](../reference/configuration.md#models).

| Rol                                                    | Modelo                 | Esfuerzo             | Definido por                               |
| ------------------------------------------------------ | ---------------------- | -------------------- | ------------------------------------------ |
| Planificación (fases 1–4)                              | Opus, vía `opusplan`   | el de tu sesión      | tú, una sola vez                           |
| Coordinador, desde la fase 5                           | Sonnet, vía `opusplan` | el de tu sesión      | tú, una sola vez                           |
| Workers (fase 7)                                       | Sonnet                 | `medium`             | `agents/emet-worker.md`, o `models.worker` |
| Revisión, nivel `passive` (diff solo de documentación) | ninguno                | —                    | `emet assess`                              |
| Revisión, nivel `medium` (cambio de código habitual)   | Opus                   | `medium`             | `models.reviewer.medium`                   |
| Revisión, nivel `high` (rutas o puntos sensibles)      | Opus                   | `medium` por defecto | `models.reviewer.high`                     |
| Triaje de logs de CI (fase 8)                          | Haiku                  | —                    | `models.triage`                            |

Las dos definiciones de agente (instaladas por `install.sh` en `~/.claude/agents/`) fijan su propio `model`/`effort` en el frontmatter, de modo que la elección de modelo/esfuerzo del propio coordinador nunca se filtra a un worker ni al revisor. `emet doctor` informa (sin bloquear nunca) si falta alguno de los dos archivos. `emet preflight` sí bloquea el despacho cuando falta `emet-worker` o `emet-reviewer`, porque la fase 6 y la fase 8 despachan por `subagent_type`.

## Enrutamiento por nivel de riesgo

La fase 8 ejecuta `emet assess --base <trunk> --head <integration branch>`, que clasifica el diff de forma determinista e imprime JSON con el nivel, los motivos y el modelo/esfuerzo recomendados para el revisor:

- `passive`: diff solo de documentación; no se despacha ningún revisor.
- `medium`: el revisor se ejecuta con `models.reviewer.medium`.
- `high`: el diff toca autenticación, seguridad, pagos, webhooks, CI, el instalador, lockfiles, migraciones, un punto sensible peligroso (SQL sin procesar, pipe-to-shell y similares) o una ruta que coincide con `review.highRiskPaths`. El revisor se ejecuta con `models.reviewer.high`, y el auto-merge aterriza el PR solo con checks en verde y sin hallazgos de revisión abiertos.

Un ticket que toca rutas de alto riesgo puede llevar una línea `Model:` (por ejemplo `Model: opus` o `Model: opus/high`), que reemplaza a `models.worker` solo para ese worker.

## Triaje con Haiku

El coordinador nunca lee un log de CI completo. Un check que falla se entrega a un agente con `models.triage` (por defecto `haiku`), que devuelve como máximo unos 2k tokens con punteros `file:line` para la corrección.

## Configuración

Todas las claves son opcionales, y los valores por defecto reproducen la tabla anterior:

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

`review.highRiskPaths` es una lista de subcadenas de ruta adicionales, sin distinguir mayúsculas, que fuerzan el nivel `high`. Para obtener más escrutinio en las oleadas riesgosas, sube `models.reviewer.high.effort` (por ejemplo a `high`).

## Host de Codex

Con `agentHost` en `"codex"`, cada worker y revisor es su propio proceso `codex exec` con `-m` y `model_reasoning_effort` definidos por rol. Los valores por defecto de la sección [`codex`](../reference/configuration.md) son:

| Rol                           | Modelo        | Esfuerzo                             | Alternativas                  |
| ----------------------------- | ------------- | ------------------------------------ | ----------------------------- |
| Sesión (`$emet:run`)          | `gpt-6.1-sol` | `medium` (`high` mientras planifica) | ninguna                       |
| Worker                        | `gpt-6.1-sol` | `medium`                             | `gpt-6.1-terra`, `gpt-6-luna` |
| Worker con una línea `Model:` | `gpt-6.1-sol` | `xhigh`                              | `gpt-6-astra`                 |
| Revisor, nivel `medium`       | `gpt-6.1-sol` | `high`                               | ninguna                       |
| Revisor, nivel `high`         | `gpt-6-astra` | `high`                               | `gpt-6.1-sol`                 |
| Triaje                        | `gpt-6-luna`  | `medium`                             | `gpt-6.1-terra`               |

`emet dispatch` y `emet review-run` resuelven cada slug contra `models_cache.json`, que se lee del home de la superposición de la corrida y, si no está ahí, de tu home real de Codex (solo lectura). Conservan un slug que aparece ahí y admite el esfuerzo; si no, siguen la actualización del modelo, luego las alternativas, luego omiten `-m`, y registran cada sustitución; cuando nada se resuelve, `emet review-run` falla antes de la llamada al modelo y nombra el rol y los slugs listados. El `config.toml` de la superposición que genera la corrida también lleva el `model` y el `model_reasoning_effort` resueltos. El esfuerzo `ultra` nunca se envía. El nivel `passive` no inicia ningún revisor.

Reajusta tras unas cuantas olas reales cuando:

- los workers necesitan varias rondas de corrección: sube `codex.models.worker.effort` o pon una línea `Model:` en el ticket riesgoso;
- las revisiones de olas de nivel `high` pasan por alto hallazgos: sube `codex.models.reviewer.high.effort`;
- el registro muestra una sustitución: Codex renombró o retiró un slug, así que actualízalo.

La ejecución real de Codex del [informe de la sonda](../research/codex-probe-report.md) usó el esfuerzo `low` y el modelo resuelto más económico (`gpt-6-luna`), y el modelo del revisor se resolvió a través de la caché.

## Por qué un solo revisor

Por qué un único revisor de contexto limpio en lugar de un abanico de múltiples ángulos: ningún benchmark público compara ambos directamente, pero un abanico vuelve a leer todo el diff una vez por ángulo y se ha quedado colgado durante más de una hora en este repositorio, mientras que informes de Anthropic y de terceros sobre modelos de nivel Opus sugieren que la mejora del modelo aporta tanto como lo harían los ángulos adicionales. Para una oleada de alto riesgo, ejecuta `/code-review ultra` a mano después; `/emet` nunca lo despacha por su cuenta.

## Lo que configuras una vez, tú mismo

`/emet` no puede cambiar esto durante una ejecución:

- `model: "opusplan"` en `~/.claude/settings.json`: esto es lo que hace que las fases 1–4 se ejecuten en Opus y de la fase 5 en adelante en Sonnet, sin necesidad de `/model`. `emet doctor` avisa (sin editar nunca tu configuración) si no está definido.
- Un esfuerzo de sesión de `medium` o `high` en lugar de `xhigh`: los workers y el revisor ya llevan su propio esfuerzo sin importar el tuyo, y un valor global alto por defecto sobre todo añade costo a los turnos del propio coordinador (gestión de despachos, merges, informes) que no lo necesitan.
- Un `permissions.defaultMode` capaz de ejecutarse sin supervisión (`auto`, `acceptEdits` o `bypassPermissions`), más reglas `permissions.deny` que bloqueen `git push * main|master` y `git push --force *`. `emet doctor` avisa de ambos, porque una oleada que se detiene en una solicitud de permiso, o que puede forzar su camino más allá de la rama troncal, anula el sentido de ejecutar sin supervisión.

Son puntos de partida, no cifras definitivas. Opus 5.5 se lanzó el 2026-09-22, y la elección de esfuerzo y modelo para los agentes de programación sigue siendo un área activa; vuelve a ajustar tras unas cuantas oleadas reales en lugar de tratar esta tabla como final.
