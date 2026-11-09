---
title: Executando o emet no Codex
description: Como instalar o lado do Codex, escolher o host do agente, a aprovação única e os limites conhecidos.
seoTitle: Executando o emet no Codex
sourceHash: a64f64be24588f52
---

O emet pode rodar no Codex CLI, além do Claude Code. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md); o produto em que uma execução roda é o **host do agente**. Esta página cobre a instalação do lado do Codex, a escolha do host, a aprovação única e os limites conhecidos. Volte ao [índice da documentação](../README.md).

No host Codex o pipeline é o mesmo: entrevista, especificação, tickets, uma aprovação, workers paralelos em worktrees, uma revisão por onda e, por fim, o pouso. O que muda é a infraestrutura. Cada worker e cada revisor é um processo `codex exec` próprio, iniciado por `emet dispatch` e `emet review-run`, e os comandos de barra viram as skills `$emet:run`, `$emet:init` e `$emet:doctor`. O caminho do Claude Code permanece intacto.

## Instalação

1. Instale o `codex` CLI na versão de `codex.minVersion` (padrão `0.167.0`) ou mais recente e faça login.
2. Instale o plugin `mattpocock-skills` no Codex:

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

3. Instale o plugin do emet. O repositório inclui `.codex-plugin/plugin.json` e as skills e hooks gerados em `codex/`:

   ```bash
   codex plugin marketplace add andryorelabs/emet
   codex plugin add emet@emet-marketplace
   ```

4. Instale o `emet` CLI como descrito em [Primeiros passos](getting-started.md) e execute `emet doctor .`. No host Codex ele informa um `codex` mais antigo que `codex.minVersion`, a falta da flag `--json` ou `--output-schema` em `codex exec` e a ausência do `mattpocock-skills`, indicando os dois comandos acima.

Os dois comandos de plugin do passo 3 seguem o padrão que o spike verificou para um marketplace local; a grafia exata deles para este repositório é `unverified` até o primeiro release.

## Escolher o host do agente

Defina `agentHost` em `emet.config.json`:

```json
{ "agentHost": "codex" }
```

O padrão é `"claude"`. A seção `codex` define os modelos, o esforço, a versão mínima e o sandbox; veja a [referência de configuração](../reference/configuration.md#codex) e [Modelos e esforço](models-and-effort.md). Inicie uma execução a partir do Codex com `$emet:run`. `emet launch <spec> --wave <n>` inicia uma onda em um `codex exec` desacoplado e registra o id da thread, de modo que `codex exec resume <id>` a continua; nenhuma aba do Orca é aberta.

## A aprovação única

O emet pede uma única aprovação, depois do plano. No Claude Code ela é um prompt. No Codex é um hook:

- Até que `.emet/runs/spec<id>/approval.json` exista, `emet guard` nega toda mutação (`apply_patch`, `Bash`), exceto escritas em `.emet/runs/**/draft/**`, com o motivo `not approved: send approve <id>`. O bloqueio vale assim que existe um diretório `.emet/runs/spec<id>/` sem o seu `approval.json`, que é o estado em que `/emet:run` deixa a execução depois que a Fase 4 materializa a especificação.
- Você aprova enviando uma linha de prompt que seja exatamente `approve <id>`. O hook `UserPromptSubmit` então grava o arquivo de aprovação com o mesmo hash de `emet approve`. As mesmas palavras na saída de uma ferramenta ou no texto do modelo não fazem nada.
- A alternativa é `/plan $emet:run`: aprove o plano no modo de plano do próprio Codex, em vez de usar o hook.

Quando esse diretório existe, o bloqueio falha de forma fechada: um arquivo de aprovação ausente ou ilegível mantém as mutações negadas. O guard também confere cada caminho de um `apply_patch` com o `.emet/surface.json` do ticket.

## Como uma onda roda

- `emet dispatch --role worker` verifica a reivindicação e o slot, cria `.emet/worktrees/agent-<ticket>`, monta um overlay de `CODEX_HOME` por execução em `.emet/runs/<run>/codex-home/` que faz link da sua autenticação e configuração em vez de copiá-las, e inicia `codex exec` com o modelo e o esforço resolvidos, o modo `codex.sandbox` (`workspace-write` por padrão), `--json` e `--output-schema`. Os eventos são capturados em `.emet/runs/<run>/codex/<ticket>.jsonl`.
- As regras do overlay permitem `git add` e `git commit` e proíbem `git push`. Seu `~/.codex` nunca é escrito.
- `emet review-run` executa o revisor somente leitura sobre um pacote de `emet review-package`; o nível `passive` não inicia nenhum processo.
- A detecção de uso e de travamento lê o JSONL capturado: o uso de tokens vem dos eventos `turn.completed` e a atividade vem do processo `codex` e do horário de modificação do arquivo.

## Limites e pontos `unverified`

- O esforço `ultra` nunca é enviado e é rejeitado na configuração.
- `danger-full-access` só está disponível se você definir `codex.sandbox` para ele; nada o ativa por padrão.
- Não há equivalentes de `ScheduleWakeup`, `TaskStop` ou `LSP`. Em vez disso, o emet consulta a própria CLI por polling.
- Os arquivos de rollout em `~/.codex/sessions` não têm formato estável, então o emet lê a saída de `exec --json` que ele mesmo capturou.
- A pesquisa marca estes comportamentos como `unverified`, e cada um fica atrás de uma pequena função para que uma mudança no Codex afete um único lugar: um `CODEX_HOME` por execução com autenticação linkada, a localização do arquivo de regras no overlay, `--dangerously-bypass-hook-trust`, o alias `CLAUDE_PLUGIN_ROOT` nos comandos de hook, o formato de saída de `codex plugin list`, um modelo carregando uma skill pelo nome e `emet dispatch` dentro de um sandbox aninhado. Veja [a pesquisa de viabilidade](../research/codex-viability.md).
- Nunca se observou um modelo tentando forjar `approval.json`. O bloqueio negaria a tentativa, mas isso é `unverified`.
- Rodar o Codex a partir de um supervisor sem acompanhamento (systemd, um contêiner) depois que a sessão que o iniciou termina é `unverified`.
- Os nomes e os preços dos modelos do Codex mudam; a tabela de preços precisa ser conferida de novo depois que ondas reais rodarem.
