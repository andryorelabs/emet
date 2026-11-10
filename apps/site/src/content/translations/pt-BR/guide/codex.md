---
title: Executando o emet no Codex
description: Como instalar o lado do Codex, escolher o host do agente, a aprovação única e os limites conhecidos.
seoTitle: Executando o emet no Codex
sourceHash: fedf7f4694193076
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

4. Instale o `emet` CLI como descrito em [Primeiros passos](getting-started.md) e execute `emet doctor .`. O `install.sh` também instala os comandos e agentes do Claude Code em `~/.claude`; isso é inofensivo no Codex, e `emet doctor` não avisa sobre o plugin do Codex junto com o `install.sh`. No host Codex ele informa um `codex` mais antigo que `codex.minVersion`, a falta da flag `--json` ou `--output-schema` em `codex exec` e a ausência do `mattpocock-skills`, indicando os dois comandos acima.

Os dois comandos de plugin do passo 3 foram executados no `codex` real (0.167.0): em um `CODEX_HOME` novo eles terminam com código 0 e `codex plugin list` mostra `emet@emet-marketplace installed, enabled`. A forma com caminho local, `codex plugin marketplace add <repo>`, dá o mesmo resultado.

## Escolher o host do agente

Defina `agentHost` em `emet.config.json`:

```json
{ "agentHost": "codex" }
```

O padrão é `"claude"`. A seção `codex` define os modelos, o esforço, a versão mínima e o sandbox; veja a [referência de configuração](../reference/configuration.md#codex) e [Modelos e esforço](models-and-effort.md). Inicie uma execução a partir do Codex com `$emet:run`. `emet launch <spec> --wave <n>` inicia uma onda em um `codex exec` desacoplado e registra o id da thread, de modo que `codex exec resume <id>` a continua; nenhuma aba do Orca é aberta.

## A aprovação única

O emet pede uma única aprovação, depois do plano. No Claude Code ela é um prompt. No Codex é um hook:

- Até que `.emet/runs/spec<id>/approval.json` exista, `emet guard` nega toda mutação (`apply_patch`, `Bash`), exceto escritas em `.emet/runs/**/draft/**`, com o motivo `not approved: send approve <id>`. O bloqueio vale assim que existe um diretório `.emet/runs/spec<id>/` sem o seu `approval.json`, que é o estado em que `$emet:run` deixa a execução depois que a Fase 4 materializa a especificação.
- Você aprova enviando uma linha de prompt que seja exatamente `approve <id>`. O hook `UserPromptSubmit` então grava o arquivo de aprovação com o mesmo hash de `emet approve`. As mesmas palavras na saída de uma ferramenta ou no texto do modelo não fazem nada.
- A alternativa é `/plan $emet:run`: aprove o plano no modo de plano do próprio Codex, em vez de usar o hook.

Quando esse diretório existe, o bloqueio falha de forma fechada: um arquivo de aprovação ausente ou ilegível mantém as mutações negadas. O guard também confere cada caminho de um `apply_patch` com o `.emet/surface.json` do ticket.

## Como uma onda roda

- `emet dispatch --role worker` verifica a reivindicação e o slot, cria `.emet/worktrees/agent-<ticket>`, monta um overlay de `CODEX_HOME` por execução em `.emet/runs/<run>/codex-home/` e inicia `codex exec` com o modelo e o esforço resolvidos, o modo `codex.sandbox` (`danger-full-access` por padrão), `--json` e `--output-schema`. Os eventos são capturados em `.emet/runs/<run>/codex/<ticket>.jsonl`. O worker é identificado pelo `threadId` do evento `thread.started` e por esse caminho JSONL; o id do processo é apenas um campo auxiliar.
- O overlay é gerado, não linkado. Seu `auth.json` recebe um link simbólico (nunca é copiado), o cache do plugin do emet é linkado a partir do seu Codex home quando ele existe, e o overlay escreve seu próprio `config.toml` mínimo: o marketplace local e `[plugins."emet@emet-marketplace"] enabled = true`, uma tabela `[projects."<dir>"]` `trusted` apenas para os diretórios da própria execução, e o `model` e o `model_reasoning_effort` resolvidos. Nenhuma das suas tabelas `[projects]` nem outras configurações são copiadas, e seu `~/.codex` nunca é escrito.
- O `rules/default.rules` do overlay permite `git add`, `git commit`, `git status`, `git worktree`, `git -C <dir> ...` e os subcomandos `dispatch`, `review-run`, `launch`, `claims`, `slots`, `results`, `handoff` e `ask` do `emet`, e proíbe `git push`. Como o sandbox padrão não bloqueia mais as escritas, o `emet guard` também nega qualquer comando `Bash` cujo argv execute `git push`, inclusive `git -C <dir> push` e `git --git-dir=<dir> push`, seja qual for o sandbox.
- Um worker nunca tem um canal paralelo com o coordenador. Ele escala pela caixa de correio da execução: `emet ask --run <run> --ticket <ticket> --body <text>` registra uma pergunta e imprime seu id, e `emet ask ... --wait <n>` consulta a resposta (o código de saída 0 a imprime, 3 significa que a janela terminou, 4 significa que `budgets.askWaitMinutes` se esgotou, então o worker escreve um resultado BLOCKED e encerra). Enquanto um worker ativo tem uma pergunta aberta, `emet dispatch --wait` imprime `question <ticket> <id>` em vez de um status de resultado e nunca classifica o worker como travado; o coordenador lê `emet inbox --run <run>`, responde com `emet reply --run <run> --ticket <ticket> --id <n> --body <text>` e retoma `emet dispatch --wait`. Um resultado registrado sempre prevalece sobre uma pergunta aberta. Veja [ADR-0023](../adr/0023-cli-owned-mailbox-for-codex-workers.md).
- Os resultados são lidos de `<git-common-dir>/.emet/runs/<run>/results/`, o mesmo lugar em que `emet results --write` escreve, de modo que um worker em seu próprio worktree é encontrado.
- `emet review-run` executa o revisor somente leitura sobre um pacote de `emet review-package`; o nível `passive` não inicia nenhum processo.
- Os modelos são resolvidos no `models_cache.json` do home da execução ou, na falta dele, no do seu Codex home real (somente leitura). Um slug configurado que não esteja listado é substituído e a substituição é registrada; se nada for resolvido, `emet review-run` falha antes da chamada ao modelo, informando o papel e os slugs listados.
- A detecção de uso e de travamento lê o JSONL capturado: o uso de tokens vem dos eventos `turn.completed` e a atividade vem do crescimento do arquivo, de modo que um worker em outro namespace de pid ainda é lido como ativo. `emet preflight` e `emet cleanup` compartilham uma única regra para um worktree sem dono recuperável (branch de worker, ticket integrado, árvore limpa, nenhum lock de terceiros), então o preflight só diz para rodar `emet cleanup` quando o cleanup realmente agiria.

## O que a execução real no Codex mostrou

O [relatório de sondagem](../research/codex-probe-report.md) refez todas as verificações contra o `codex-cli 0.167.0` (plano gratuito do ChatGPT, Linux) depois dessas mudanças. Todas as linhas `failed` anteriores agora são `verified`:

- Um fluxo de 2 ondas integrou commits reais de workers do Codex no trunk: a onda 1 a partir de `emet dispatch`, a onda 2 a partir de uma sessão iniciada por `emet launch <spec> --wave 2` que carregou `$emet:run` do cache de plugin do overlay. `emet review-run` rodou em todos os fluxos.
- O e2e opcional (`EMET_CODEX_E2E=1`) passa: o worker faz commit sob `danger-full-access`, e `codex execpolicy check` responde `forbidden` para `git push origin develop` e `allow` para `git -C <dir> commit`.
- `~/.codex/config.toml` manteve o mesmo sha256 durante a sondagem, o e2e e sete fluxos.

## Limites e pontos `unverified`

- O esforço `ultra` nunca é enviado e é rejeitado na configuração.
- `danger-full-access` é o `codex.sandbox` padrão para os workers do Codex e para `emet launch`, porque o sandbox `workspace-write` deixa `.git` somente leitura e um worker não conseguiria fazer commit. Defina `codex.sandbox` como `"workspace-write"` para manter o sandbox; os workers então não conseguem fazer commit. O [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) registra o trade-off. O caminho do Claude nunca o usa. Sem sandbox, a negação de push no `emet guard` e o arquivo de regras são as proteções.
- Não há equivalentes de `ScheduleWakeup`, `TaskStop` ou `LSP`. Em vez disso, o emet consulta a própria CLI por polling.
- Os arquivos de rollout em `~/.codex/sessions` não têm formato estável, então o emet lê a saída de `exec --json` que ele mesmo capturou.
- Verificados contra a CLI real, e ainda atrás de pequenas funções para que uma mudança no Codex afete um único lugar: um `CODEX_HOME` por execução com autenticação linkada, o arquivo de regras em `rules/default.rules`, `--dangerously-bypass-hook-trust`, o alias `CLAUDE_PLUGIN_ROOT` nos comandos de hook, o formato de saída de `codex plugin list`, um modelo carregando uma skill pelo nome, `emet dispatch` dentro de uma sessão aninhada, um modelo tentando forjar `approval.json` (negado) e as duas formas de `codex plugin marketplace add`. Veja [a pesquisa de viabilidade](../research/codex-viability.md).
- Ainda `unverified`: rodar o Codex a partir de um supervisor sem acompanhamento, sob systemd ou em um contêiner (só um processo desacoplado foi testado).
- Acompanhamentos conhecidos do relatório de sondagem: `emet init` escreve nomes de modelos do Claude em `models` para `agentHost: "codex"`, um `emet dispatch --model` explícito não é resolvido contra o cache, `emet lock-reason` procura um ancestral `claude`, e um ticket cujo worker morreu não pode ser redespachado para o mesmo worktree.
- Os nomes e os preços dos modelos do Codex mudam; a tabela de preços precisa ser conferida de novo depois que ondas reais rodarem.
