---
title: Segurança
description: Como o emet limita o dano que uma execução sem supervisão pode causar.
seoTitle: Segurança do emet
sourceHash: 359a25043b1d24d9
---

Como o emet limita o dano que uma execução sem supervisão pode causar. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md). Para relatar uma vulnerabilidade, veja o [SECURITY.md](../../.github/SECURITY.md).

## Modelo de ameaças de uma execução sem supervisão

Depois da aprovação única, o `/emet:run` despacha workers que editam arquivos, executam comandos de shell e fazem commits sem ninguém olhando. Os riscos que decorrem disso:

- **Comandos destrutivos.** Um worker, ou um texto que ele leu, executa uma exclusão recursiva forçada, uma instrução SQL destrutiva ou um force push.
- **Escritas em branches protegidos.** Um worker faz push em `main` ou `develop` e pula a revisão.
- **Escapar do worktree.** Um worker edita o checkout principal ou o worktree de um irmão.
- **Aprovação forjada.** Um agente escreve ele mesmo o registro de aprovação em vez de esperar a pessoa.
- **Entrada não confiável.** Textos de tickets, comentários, páginas da web e a saída de ferramentas carregam instruções dirigidas ao agente.

Os controles são em camadas. Nenhuma camada sozinha é um sandbox, e nenhuma substitui a revisão do PR de aterrissagem.

## Modos de permissão

No Claude Code, os workers rodam com o modo de permissão de `handoff.permissionMode`, `bypassPermissions` por padrão, de modo que nenhum prompt interrompe uma onda sem supervisão. O hook `emet guard` é o controle que permanece nesse modo.

No Codex CLI, os workers rodam sem sandbox por padrão ([ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md)), porque o sandbox `workspace-write` bloqueia commits em um worktree vinculado e bloqueia o `emet dispatch` a partir de um coordenador Codex. A aprovação é uma decisão de hook, e escrever o `approval.json` à mão é negado. Veja o [guia do Codex](../how-to/use-codex.md).

Somente o coordenador escreve no tracker ([ADR-0005](../adr/0005-coordinator-is-the-single-tracker-writer.md)), e os workers fazem commit apenas em branches locais ([ADR-0004](../adr/0004-one-wave-one-dependency-layer-one-pr.md)).

## O que os guards cobrem

**`emet guard`** (`emet/src/guard-destructive.ts`) é um hook PreToolUse instalado no host. Ele nega comandos de shell e clientes SQL destrutivos, enxergando através de wrappers como `env`, `sudo`, `timeout` e `xargs`, e protege o diretório da execução.

**`rm-guard`** (`.claude/hooks/rm-guard.ts`) é o hook PreToolUse próprio deste repositório para Bash. Ele divide um comando em `;`, `&&`, `||`, pipes e quebras de linha, incluindo o texto dentro de `sh -c`, e nega qualquer `rm` recursivo forçado (`-rf`, `-fr`, `-r -f`, `--recursive --force`), a menos que todo alvo resolva estritamente abaixo de `/tmp` ou do diretório temporário do sistema. Nada dentro do repositório está na lista, então uma exclusão recursiva forçada sob `.emet/` também é negada. Alvos que usam `$`, crases ou `~` são negados porque não podem ser resolvidos.

**As negações de push** em `.claude/settings.json` bloqueiam `git push origin main` e `git push origin develop`, e as formas `HEAD:main` e `HEAD:develop`. O hook `pre-push` do Git recusa as mesmas refs e qualquer nome de branch fora dos padrões permitidos. Pushes de tags são permitidos.

**Rulesets** aplicam as mesmas regras no GitHub: sem exclusão nem non-fast-forward em `main` e `develop`, checks obrigatórios e tags `v*` protegidas. Veja o [development.md](../development.md#rulesets).

## O que eles não cobrem

- Um comando que os guards não reconhecem, por exemplo um script gravado em disco e executado depois.
- Acesso à rede: um worker ainda pode chamar qualquer API que suas credenciais permitam.
- Leituras de arquivos fora do worktree.
- Uma dependência maliciosa instalada pelo `bun install`.

Trate textos de tickets, comentários e páginas obtidas como dados. Revise o PR de aterrissagem antes de mesclar e mantenha segredos fora do ambiente que uma execução herda.
