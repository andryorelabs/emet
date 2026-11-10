---
title: Dependências
description: O que o emet precisa na máquina e qual comando verifica cada item.
seoTitle: Dependências do emet
sourceHash: 1c97a7ccd5572ab4
---

O que o emet precisa na máquina e qual comando verifica cada item. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md). Voltar ao [README](../../README.md).

## Obrigatórias

Primeiro o que é comum aos dois hosts de agente, depois o que cada host acrescenta.

- **[bun](https://bun.sh)**: somente para instalações a partir do código-fonte. O binário independente não precisa de nenhum runtime.
- **`rsync`** e **`sha256sum` ou `shasum`**: exigidos pelo `install.sh`.
- **`git`**: obrigatório em tempo de execução. Quase todo subcomando o invoca.
- **CLI `gh`, autenticada**: obrigatória quando o tracker é `github` ou a aterrissagem é `pr`. Os PRs sempre a usam. Com `tracker.kind: "local"` e `landing.mode: "merge"`, o `gh` não é obrigatório.
- **O plugin `mattpocock-skills`**: as fases de entrevista, spec e tickets chamam skills que ficam lá. No Claude Code ele vem do marketplace `claude-plugins-official`; no Codex, veja [Host Codex](#host-codex).

  ```bash
  claude plugin marketplace add anthropics/claude-plugins-official
  claude plugin install mattpocock-skills@claude-plugins-official
  ```

- **A CLI `claude` e os comandos do plugin emet** (`/emet:run`, `/emet:init`, `/emet:doctor`): somente no host Claude Code.
- **Os agentes `emet-worker` e `emet-reviewer`** em `~/.claude/agents/`: somente no host Claude Code, instalados pelo `install.sh`. A fase 6 e a fase 8 despacham por `subagent_type`, então a ausência de qualquer um dos dois quebra o despacho. Veja [Models & effort](../../README.md#models--effort).
- **Um servidor MCP do Linear declarado em `.mcp.json` (ou no escopo de usuário)**: somente se o repositório usa o tracker `linear`. O emet verifica a declaração. Se a conexão está autenticada é algo que fica no armazenamento de credenciais do próprio host de agente e não pode ser verificado daqui. No Claude Code, se uma execução falhar ao ler os tickets, reinicie o Claude Code e aprove a conexão. O passo equivalente no Codex não foi verificado.

Nada do acima é instalado nem autenticado em seu nome. O que muda é quem verifica e com que rigor.

## Host Codex

Apenas quando `agentHost` é `"codex"`; veja o [guia do Codex](../guide/codex.md). Os agentes `emet-worker` e `emet-reviewer` não são usados ali.

- **A CLI `codex`**, com login feito, na versão `codex.minVersion` (padrão `0.167.0`) ou mais nova. O `emet doctor` verifica se `codex exec --help` lista `--json` e `--output-schema`.
- **O plugin `mattpocock-skills`** no Codex, verificado com `codex plugin list`:

  ```bash
  codex plugin marketplace add mattpocock/skills
  codex plugin add mattpocock-skills@mattpocock
  ```

- **O plugin do emet para Codex** (`.codex-plugin/plugin.json`), que traz as skills `$emet:run`, `$emet:init` e `$emet:doctor` e o hook de aprovação.

O emet nunca escreve em seu `~/.codex`: os workers rodam com um `CODEX_HOME` por execução que vincula sua autenticação e configuração.

## O que verifica o quê

|                                                                                           | `emet init`                     | `emet doctor`                        | `emet preflight`                                                                               |
| ----------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| plugin ausente/desabilitado                                                               | imprime o comando de instalação | informa (uma vez, para toda a frota) | **bloqueia o despacho**                                                                        |
| agente `emet-worker`/`emet-reviewer` ausente (somente host Claude Code)                   | —                               | informa (uma vez, para toda a frota) | **bloqueia o despacho**                                                                        |
| `gh` ausente/não autenticado (tracker: `github`)                                          | imprime o que executar          | informa                              | **bloqueia o despacho**                                                                        |
| servidor do Linear não declarado (tracker: `linear`)                                      | imprime uma nota                | informa                              | **bloqueia o despacho**                                                                        |
| a CLI do host (`claude` no Claude Code) fora do PATH, ou uma sondagem que estoura o tempo | imprime uma nota                | informa                              | **avisa, nunca bloqueia**: isto é "não foi possível verificar", não "verificado como quebrado" |
| uma flag da qual o emet depende ausente do `--help`                                       | —                               | informa                              | —                                                                                              |

### Verificação de flags

O `emet doctor` verifica as próprias flags, não apenas se os binários existem. Ele lê o `--help` de `gh issue view` e `gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`) e, por host, a CLI do próprio host de agente: no Claude Code `claude` (`--bg`) e `claude agents` (`--json`), no Codex `codex exec` (`--json`, `--output-schema`) em vez deles. Informa qualquer flag que uma CLI mais nova ou mais antiga não documente mais. Uma flag renomeada, caso contrário, faria uma onda falhar no meio do caminho.

### Timeouts e como ignorar um bloqueio

Cada sondagem é limitada a 5 s para que um `gh auth status` travado (sem rede) não possa pendurar uma onda. Se um bloqueio do `preflight` estiver errado para o seu ambiente, `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` o rebaixa a um aviso apenas naquela execução. Defina-a no seu próprio shell, não em nada que o coordenador do `/emet` execute sem supervisão. Veja [Variáveis de ambiente](cli.md#variáveis-de-ambiente).

### Binários do próprio repositório

O `preflight.requiredCommands` de um repositório (no `emet.config.json`) é uma lista à parte, de responsabilidade do repositório, de binários que o `emet preflight` e o `emet doctor` exigem no PATH. É útil para `rg` e `sg`, que os prompts dos workers oferecem como alternativas mais rápidas a ler um arquivo inteiro. O `gh` não precisa constar ali; a verificação acima já o cobre. Veja [`preflight`](configuration.md#preflight).

Para as falhas e suas correções, veja a [solução de problemas](../troubleshooting.md#uma-verificação-de-dependência-falha).
