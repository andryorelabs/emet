---
title: Executar o emet no Codex
description: Como instalar o lado do Codex, escolher o host do agente, a aprovação única e os limites conhecidos.
seoTitle: Executar o emet no Codex
sourceHash: 71c6c7d0686a6725
---

Execute o pipeline do emet no Codex CLI em vez do Claude Code. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md); o produto em que uma execução roda é o **host do agente**. Volte ao [índice da documentação](../README.md).

Como uma onda roda no Codex, o guard e os trade-offs do sandbox estão explicados em [Segurança](../concepts/security.md) e em [Execuções, ondas e especificações](../concepts/runs-waves-specs.md).

## Pré-requisitos

- O `codex` CLI na versão de `codex.minVersion` (padrão `0.167.0`) ou mais recente, com login feito.
- `git` e `gh` no `PATH`; veja a [referência de dependências](../reference/dependencies.md).
- Um repositório com um `emet.config.json` (execute `emet init` se ele não tiver um).

## Instalar

:::steps

1. Instale o plugin `mattpocock-skills` no Codex:

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

2. Instale o emet com a instalação independente de [Instalação](../start/install.md). Ela grava as skills do emet em `~/.agents/skills/emet/` e acrescenta os hooks do emet a `$CODEX_HOME/hooks.json` (padrão `~/.codex`), e nunca escreve o `config.toml`. Ela também instala o `emet` do terminal e os comandos e agentes do Claude Code em `~/.claude`; isso é inofensivo no Codex.

3. Confie nos hooks. O Codex não executa um hook até você confiar nele: abra `/hooks` e pressione `t` na página de eventos, ou aprove o aviso "Hooks need review" na inicialização.

:::

### Opcional: o plugin do Codex

Em vez da instalação independente, você pode instalar o plugin do emet:

```bash
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

O plugin não traz shim `emet`, então o `emet` do terminal ainda precisa da instalação independente. O `emet self install` se recusa enquanto o plugin estiver instalado, a menos que você passe `--force`, e o `emet doctor` avisa quando os dois coexistem.

## Escolher o host do agente

:::steps

1. Defina `agentHost` em `emet.config.json` (o padrão é `"claude"`):

   ```json
   { "agentHost": "codex" }
   ```

2. Defina modelos, esforço, versão mínima e sandbox na seção `codex` se os padrões não servirem; veja a [referência de configuração](../reference/configuration.md#codex) e [Escolher modelos](choose-models.md).
3. Inicie uma execução a partir do Codex com `$emet:run`. Para iniciar uma onda a partir de um terminal, execute `emet launch <spec> --wave <n>`; ele inicia um `codex exec` desacoplado e registra o id da thread, de modo que `codex exec resume <id>` o continua. Nenhuma aba do Orca é aberta.

:::

## Aprovar o plano

O emet pede uma única aprovação, depois do plano. No Codex ela é um hook.

:::steps

1. Aguarde o `$emet:run` materializar a especificação. Até que `.emet/runs/spec<id>/approval.json` exista, o `emet guard` nega toda mutação com o motivo `not approved: send approve <id>`.
2. Envie uma linha de prompt que seja exatamente `approve <id>`. O hook `UserPromptSubmit` grava o arquivo de aprovação. As mesmas palavras na saída de uma ferramenta ou no texto do modelo não fazem nada.
3. Como alternativa, comece com `/plan $emet:run` e aprove o plano no modo de plano do próprio Codex.

:::

## Depois de uma atualização do emet

Com a instalação independente, os hooks são entradas comuns em `hooks.json` e continuam confiáveis. Com o plugin, o Codex pede de novo que você confie nos hooks do plugin após cada atualização.

:::steps

1. Abra `/hooks` e pressione `t` na página de eventos, ou aprove o aviso "Hooks need review" na inicialização. Até lá, o emet guard e a aprovação única não rodam.
2. Se o shim imprimir `release v<version> has no downloadable asset yet`, ele está rodando a versão em cache. Tente de novo em alguns minutos.

:::

## Verificar

:::steps

1. Execute `emet doctor .`. No host Codex ele informa um `codex` mais antigo que `codex.minVersion`, a falta da flag `--json` ou `--output-schema` em `codex exec`, hooks sem confiança e a ausência do `mattpocock-skills`.
2. Corrija o que ele informar usando a entrada correspondente em [Solução de problemas](../troubleshooting.md#codex-host) e execute-o de novo até que não informe falhas.

:::

Limites conhecidos: o esforço `ultra` nunca é enviado e é rejeitado na configuração, e `codex.sandbox` tem como padrão `danger-full-access` para que os workers possam fazer commit; defina-o como `"workspace-write"` para manter o sandbox, e os workers então não conseguem fazer commit. Veja o [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) e o [relatório de sondagem](../research/codex-probe-report.md).
