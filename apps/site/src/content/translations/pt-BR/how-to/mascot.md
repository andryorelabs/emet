---
title: Usar o mascote do emet (mod do Claude Code e pet do Orca)
description: Mostre o mascote do emet no Claude Code com o mod e no Orca com o pet.
seoTitle: Usar o mascote do emet no Claude Code e no Orca
sourceHash: caca9eb66e693e32
---

Como mostrar o **Mascot** do emet no Claude Code e no Orca. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md).

Há duas peças independentes: o plugin opcional `emet-mascot`, que desenha o mascote no Claude Code, e o pacote de pet do Orca, que dá ao Orca o mesmo personagem.

## Instalar o plugin do mascote

O plugin é distribuído no mesmo marketplace do emet e é opcional. O emet não precisa dele.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet-mascot@emet-marketplace
```

O mascote acompanha a sua sessão (dormindo, trabalhando, esperando, pronto, com erro). Enquanto um **Run** está ativo, ele também lê o **Phase file** e mostra um rótulo discreto como `emet · wave 2 · review`.

Opções do plugin:

- `position`: `pane` (o padrão), `band` ou `status`. O `pane` acopla o mascote ao lado da transcrição, o que exige o layout de tela cheia e um terminal com pelo menos 144 colunas de largura até você abrir o painel uma vez por conta própria (cerca de 110 depois disso); quando ele não consegue acoplar, ou o terminal estreita depois, o mascote aparece acima do prompt. O `band` sempre o desenha acima do prompt. O `status` mostra apenas o rótulo de texto como a linha de status do plugin, sem a arte do mascote.
- `size`: `small` (16 x 8 células, o padrão) ou `medium` (24 x 12 células).
- `showLabel`: mostrar ou ocultar o rótulo ao lado do mascote (ativado por padrão).

## Atualizar o plugin do mascote

Marketplaces que não são o da Anthropic têm a atualização automática desativada por padrão, e um marketplace não pode ativá-la para seus usuários. Atualize manualmente:

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Reinicie o Claude Code depois. Para atualizar por conta própria, execute `/plugin`, abra a aba **Marketplaces**, selecione `emet-marketplace` e escolha **Enable auto-update**. Cada usuário faz isso uma vez na própria máquina. Veja [Atualizar o emet](update-emet.md) para o plugin principal também.

## O arquivo de fase

A CLI do emet escreve `.emet/phase.json` no repositório conforme uma execução avança, e o mascote o consulta cerca de a cada dois segundos. Um arquivo mais antigo que a janela de atualidade é ignorado, de modo que uma execução que falhou não deixa um rótulo desatualizado.

O arquivo contém `phase` (`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done` ou `failed`), `wave`, `spec`, `runId`, `updatedAt` e um `outcome` opcional. Uma escrita que falha nunca faz falhar o subcomando que informou a fase.

## Usar o pet no Orca

O pacote do pet fica em `docs/brand/pet/emet/`: `pet.json` e `spritesheet.webp`. Nas configurações do Orca, use "Import .codex-pet bundle…" e escolha essa pasta. A importação precisa de `docs/brand/pet/emet/` na máquina em que o aplicativo Orca roda, então copie a pasta para lá se o Orca roda em outro lugar que não este repositório. Gere-o de novo com `bun run brand:export` depois de mudar um SVG do mascote, e faça commit do resultado.

## Solução de problemas

- Sem mascote: execute `claude plugin list`, verifique se `emet-mascot` está habilitado e reinicie o Claude Code.
- Sem rótulo: verifique se `.emet/phase.json` existe e foi atualizado recentemente.
