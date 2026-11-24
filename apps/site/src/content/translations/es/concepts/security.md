---
title: Seguridad
description: Cómo limita emet el daño que puede causar una ejecución desatendida.
seoTitle: Modelo de seguridad de emet
sourceHash: 359a25043b1d24d9
---

Cómo limita emet el daño que puede causar una ejecución desatendida. Los términos siguen [GLOSSARY.md](../../GLOSSARY.md). Para reportar una vulnerabilidad, consulta [SECURITY.md](../../.github/SECURITY.md).

## Modelo de amenazas de una ejecución desatendida

Tras la aprobación única, `/emet:run` despacha workers que editan archivos, ejecutan comandos de shell y hacen commits sin que nadie los vigile. Los riesgos que se derivan:

- **Comandos destructivos.** Un worker, o el texto que leyó, ejecuta un borrado recursivo forzado, una sentencia SQL destructiva o un force push.
- **Escrituras en ramas protegidas.** Un worker hace push a `main` o `develop` y se salta la revisión.
- **Escapar del worktree.** Un worker edita el checkout principal o el worktree de otro worker.
- **Aprobación falsificada.** Un agente escribe él mismo el registro de aprobación en lugar de esperar a la persona.
- **Entrada no confiable.** El texto de tickets, comentarios, páginas web y la salida de herramientas llevan instrucciones dirigidas al agente.

Los controles están en capas. Ninguna capa por sí sola es un sandbox, y ninguna sustituye la revisión del PR de aterrizaje.

## Modos de permisos

En Claude Code, los workers se ejecutan con el modo de permisos de `handoff.permissionMode`, `bypassPermissions` por defecto, así que ninguna solicitud detiene una oleada desatendida. El hook `emet guard` es el control que permanece en ese modo.

En Codex CLI, los workers se ejecutan sin sandbox por defecto ([ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md)), porque el sandbox `workspace-write` bloquea los commits en un worktree enlazado y bloquea `emet dispatch` desde un coordinador de Codex. La aprobación es una decisión de hook, y escribir `approval.json` a mano se deniega. Consulta la [guía de Codex](../how-to/use-codex.md).

Solo el coordinador escribe en el tracker ([ADR-0005](../adr/0005-coordinator-is-the-single-tracker-writer.md)), y los workers hacen commits solo en ramas locales ([ADR-0004](../adr/0004-one-wave-one-dependency-layer-one-pr.md)).

## Qué cubren los guards

**`emet guard`** (`emet/src/guard-destructive.ts`) es un hook PreToolUse instalado en el host. Deniega comandos de shell y clientes SQL destructivos, atravesando envoltorios como `env`, `sudo`, `timeout` y `xargs`, y protege el directorio de la ejecución.

**`rm-guard`** (`.claude/hooks/rm-guard.ts`) es el propio hook PreToolUse de este repo sobre Bash. Divide un comando en `;`, `&&`, `||`, tuberías y saltos de línea, incluido el texto dentro de `sh -c`, y deniega cualquier `rm` recursivo forzado (`-rf`, `-fr`, `-r -f`, `--recursive --force`) salvo que cada destino se resuelva estrictamente bajo `/tmp` o el directorio temporal del sistema. Nada dentro del repo está en la lista, así que un borrado recursivo forzado bajo `.emet/` también se deniega. Los destinos que usan `$`, comillas invertidas o `~` se deniegan porque no se pueden resolver.

**Las denegaciones de push** en `.claude/settings.json` bloquean `git push origin main` y `git push origin develop`, y las formas `HEAD:main` y `HEAD:develop`. El hook de Git `pre-push` rechaza las mismas refs y cualquier nombre de rama fuera de los patrones permitidos. Los push de tags están permitidos.

**Los rulesets** aplican las mismas reglas en GitHub: sin borrado ni non-fast-forward en `main` y `develop`, checks obligatorios y tags `v*` protegidos. Consulta [development.md](../development.md#rulesets).

## Qué no cubren

- Un comando que los guards no reconocen, por ejemplo un script escrito en disco y ejecutado después.
- El acceso a la red: un worker todavía puede llamar a cualquier API que sus credenciales permitan.
- Las lecturas de archivos fuera del worktree.
- Una dependencia maliciosa instalada por `bun install`.

Trata el texto de tickets, comentarios y páginas obtenidas como datos. Revisa el PR de aterrizaje antes de fusionarlo y mantén los secretos fuera del entorno que hereda una ejecución.
