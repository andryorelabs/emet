---
title: Atención y el diario
description: Cómo pide atención emet y registra sus propios eventos en un diario global.
seoTitle: Alertas de atención y diario de eventos
sourceHash: 378e84638489f44f
---

emet registra sus propios eventos en un único diario global. Un tipo de evento te avisa cuando una sesión te está esperando. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md); las decisiones están en el [ADR-0030](../adr/0030-global-event-journal.md) y el [ADR-0042](../adr/0042-session-attention-state-in-the-journal.md).

## El diario

El diario es un único archivo de solo anexado de líneas JSON, un evento por línea, en el directorio de estado de todo el host que también contiene el pool de slots de workers. Como es global, un análisis posterior puede distinguir una ejecución que iniciaron `emet launch` o `emet chain` de una que una persona escribió a mano: cada evento lleva su repo, su host y un origen `human` o `auto`.

Los comandos existentes escriben los eventos: el inicio de una ejecución, una decisión de compuerta, una intervención humana en una oleada desatendida, el resultado de un launch, un ticket cerrado, una limpieza, una marca de línea base, y la integración, el aterrizaje o el abandono de una rama de spec.

### Qué nunca registra

Prompts, texto del asistente, entrada de hooks, variables de entorno, argv, tokens, diffs y cuerpos de issues. Un evento contiene solo ids, códigos, conteos, duraciones y un motivo breve. Un evento que superaría los 2 KiB pierde sus datos y se marca como truncado.

### Fallos y rotación

Un diario que no se puede escribir nunca cambia la salida ni el código de salida de un comando. Cuando el archivo supera unos 10 MiB, la siguiente escritura lo mueve a un segmento numerado y conserva los cinco más recientes. En un sistema de archivos de red las escrituras concurrentes pueden entremezclarse, así que `emet doctor` avisa, sin fallar, cuando el directorio de estado está en uno.

### Cómo leerlo

`emet insights` lee todos los segmentos e informa de ejecuciones por origen, decisiones de compuerta, intervenciones, resultados de launch, eventos de spec y tickets cerrados. Por defecto cubre los eventos desde la última línea base; `--mark-baseline` empieza a contar desde ahora. Omite las líneas que no puede analizar y las cuenta, e imprime un informe en cero cuando el diario está vacío. Como el archivo son líneas JSON simples, `jq` también funciona con él. Consulta la [referencia de la CLI](../reference/cli.md#runs-workers-and-slots).

## Atención

Una ejecución puede quedar bloqueada en una solicitud de permiso o en una pregunta mientras nadie mira. La atención responde a "¿una sesión me necesita?".

Cada sesión de una ejecución propia de emet está en uno de cuatro estados:

- **working**: el agente está actuando.
- **needs-decision**: el agente espera a una persona, por ejemplo en una solicitud de permiso o una pregunta. "Bloqueado" es otra forma de decirlo.
- **idle**: el agente se detuvo y espera el siguiente prompt.
- **ended**: la sesión terminó.

El hook `emet guard`, ya instalado en el host, detecta las transiciones y añade un evento `session.attention` al diario solo cuando cambia el estado, así que no hay un segundo almacén. Una sesión cuenta como propia de emet cuando se ejecuta en un worktree de worker de emet, o en un repo con configuración de emet y una ejecución sin terminar. En Codex no hay eventos de notificación, así que una detención es idle salvo que la ejecución tenga un resultado bloqueado, que es needs-decision.

El evento contiene el id de la sesión, el estado anterior y el nuevo, el disparador y el id de la ejecución. Nunca contiene el texto de la notificación, el nombre de la herramienta ni su entrada. El registro nunca bloquea: un fallo se descarta y el diálogo de permiso no cambia.

### La alerta

Entrar en needs-decision genera una alerta: una marca de no leído de Orca en el worktree cuando el runtime de Orca es accesible y, en caso contrario, una notificación de escritorio cuando hay una disponible. emet nunca la borra, y `attention.alert` la desactiva.

### Dónde la ves

`emet status` lista las sesiones y su estado, y una sesión bloqueada eleva el estado general a needs-decision incluso cuando no hay ninguna oleada en curso. `emet fleet status` muestra lo mismo en varios repos.

## Véase también

- [Ejecuciones, oleadas y specs](runs-waves-specs.md)
- [Seguridad](security.md)
- [Referencia de configuración](../reference/configuration.md) para `attention.alert`
