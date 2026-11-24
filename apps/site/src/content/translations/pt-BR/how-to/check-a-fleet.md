---
title: Verificar uma frota de repositórios
description: Audite, altere e inicie o emet em vários repositórios de uma só vez e veja quais sessões estão bloqueadas.
seoTitle: Verificar uma frota de repositórios com o emet
sourceHash: 511c25889b2a8244
---

Audite, altere e inicie o emet em vários repositórios de uma só vez. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md).

## Pré-requisitos

- O emet instalado; veja [Instalação](../start/install.md).
- Cada repositório tem um `emet.config.json` e fica um nível abaixo de uma raiz (padrão `~/code`).
- `gh` no `PATH`, autenticado; veja a [referência de dependências](../reference/dependencies.md).

## Auditar os repositórios

:::steps

1. Execute a auditoria somente leitura em quantos repositórios quiser:

   ```bash
   emet doctor ~/code/*
   ```

2. Leia o relatório por repositório: um `emet.config.json` válido, os quatro arquivos `docs/agents/*.md`, nenhum marcador `TODO(emet):` restante, comandos de `commands.selfCheck` que sejam resolvidos e os achados de dependências do tracker daquele repositório.
3. Leia os achados de toda a varredura, impressos uma única vez: o plugin mattpocock-skills e as flags das CLIs externas, verificadas via `--help` (`gh` e, no Claude Code, `claude --bg` e `claude agents --json`; no Codex, `codex exec --json` e `--output-schema`). Uma flag renomeada é informada aqui antes de fazer uma onda falhar.

:::

## Alterar uma configuração em todos os repositórios

:::steps

1. Liste o que cada repositório tem agora:

   ```bash
   emet fleet list --root ~/code
   ```

   Ele imprime, por repositório, o caminho, `tracker.kind`, `handoff.autoChain` e `models.worker`; `--json` imprime como dados.

2. Visualize a alteração:

   ```bash
   emet fleet set handoff.autoChain false --dry-run
   ```

   `--dry-run` não escreve nada e imprime o valor antigo e o novo de cada repositório.

3. Aplique-a executando o mesmo comando sem `--dry-run`. O valor é validado antes pelo carregador de configuração; um valor inválido não modifica nenhum repositório e termina com código 1.

:::

## Iniciar uma funcionalidade em vários repositórios

```bash
emet fleet launch --feature "add dark mode" --repos app,site
```

Ele abre uma sessão `/emet:run --draft <text>` em cada repositório, após as mesmas verificações de prontidão do `emet chain`. `--repos` limita a uma lista separada por vírgulas.

## Ver sessões bloqueadas

```bash
emet fleet status
```

Ele imprime, por repositório, quantas sessões do emet estão bloqueadas esperando uma decisão, em andamento ou ociosas, com os repositórios bloqueados primeiro. Lê as últimas 24 horas do journal global e exclui as sessões encerradas; `--json` imprime as sessões. Dentro de um repositório, `emet status` as lista em `sessions`. Veja [Atenção e journal](../concepts/attention-and-journal.md) e a [referência de configuração](../reference/configuration.md#attention).

## Verificar

:::steps

1. Execute `emet doctor ~/code/*` de novo e confirme que nenhum repositório informa falha.
2. Execute `emet fleet list --root ~/code` e confirme que a chave alterada mostra o novo valor em todos os repositórios.
3. Execute `emet fleet status` e confirme que nenhum repositório está bloqueado inesperadamente.

:::

Cada sondagem é limitada a 5 s, de modo que um `gh auth status` travado não pode pendurar uma onda. `preflight.requiredCommands` é uma lista, de responsabilidade do repositório, de binários que `emet preflight` e `emet doctor` exigem; veja a [referência da CLI](../reference/cli.md#fleet-check) e a [referência de configuração](../reference/configuration.md#preflight).
