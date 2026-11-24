---
title: Usar o mascote do emet (mod do Claude Code e pet do Orca)
description: Mostre o mascote do emet no Claude Code com o plugin e no Orca com o pet.
seoTitle: Usar o mascote do emet no Claude Code e no Orca
sourceHash: a6d2945308d1d44b
---

Mostre o **Mascot** do emet no Claude Code e no Orca. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md).

Há duas peças independentes: o plugin opcional `emet-mascot`, que desenha o mascote no Claude Code, e o pacote de pet do Orca, que dá ao Orca o mesmo personagem. O emet não precisa de nenhuma das duas.

## Pré-requisitos

- Claude Code, para o plugin.
- O emet instalado, para que uma execução grave o arquivo de fase que o mascote acompanha; veja [Instalação](../start/install.md).
- Orca, para o pet. A importação precisa da pasta `docs/brand/pet/emet/` na máquina em que o app do Orca roda.

## Instalar o plugin do mascote

:::steps

1. Adicione o marketplace e instale o plugin:

   ```bash
   claude plugin marketplace add andryorelabs/emet
   claude plugin install emet-mascot@emet-marketplace
   ```

2. Reinicie o Claude Code. O mascote acompanha a sua sessão (dormindo, trabalhando, esperando, concluído, erro). Enquanto uma **Run** está ativa, ele também lê o arquivo de fase e mostra um rótulo discreto como `emet · wave 2 · review`.
3. Opcionalmente, defina as opções do plugin:
   - `position`: `pane` (padrão), `band` ou `status`. `pane` encaixa o mascote ao lado da transcrição e exige o layout em tela cheia e um terminal com pelo menos 144 colunas de largura até que você abra o painel uma vez por conta própria (cerca de 110 depois disso); quando não consegue encaixar, o mascote aparece acima do prompt. `band` sempre o desenha acima do prompt. `status` mostra apenas o rótulo de texto como linha de status.
   - `size`: `small` (16 x 8 células, padrão) ou `medium` (24 x 12 células).
   - `showLabel`: mostra ou oculta o rótulo (padrão ligado).

:::

## Atualizar o plugin do mascote

Marketplaces que não sejam o da Anthropic têm a atualização automática desligada por padrão, então atualize à mão ou ligue-a uma vez.

:::steps

1. Atualize o marketplace e o plugin:

   ```bash
   claude plugin marketplace update emet-marketplace
   claude plugin update emet-mascot@emet-marketplace
   ```

2. Reinicie o Claude Code.
3. Para atualizar por conta própria, execute `/plugin`, abra a aba **Marketplaces**, selecione `emet-marketplace` e escolha **Enable auto-update**. Cada usuário faz isso uma vez na própria máquina. Veja [Atualizar o emet](update-emet.md) para o plugin principal.

:::

## Usar o pet no Orca

:::steps

1. Verifique que `docs/brand/pet/emet/` (`pet.json` e `spritesheet.webp`) está na máquina em que o Orca roda; copie a pasta para lá se o Orca rodar em outro lugar que não este repositório.
2. Nas configurações do Orca, escolha "Import .codex-pet bundle…" e selecione essa pasta.
3. Depois de alterar um SVG do mascote, gere o pacote de novo com `bun run brand:export` e faça commit do resultado.

:::

## Verificar

:::steps

1. Execute `claude plugin list` e confirme que `emet-mascot` está ativado; se o mascote não aparecer, reinicie o Claude Code.
2. Durante uma execução, confirme que `.emet/phase.json` existe e foi atualizado nos últimos segundos. O mascote o consulta a cada dois segundos, aproximadamente, e ignora um arquivo mais antigo que a sua janela de atualidade, de modo que uma execução que travou não deixa um rótulo obsoleto. Ele contém `phase` (`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done` ou `failed`), `wave`, `spec`, `runId`, `updatedAt` e um `outcome` opcional.
3. No Orca, confirme que o pet do emet aparece na lista de pets.

:::
