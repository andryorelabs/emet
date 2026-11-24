---
title: Atualizar o emet
description: Leve um emet instalado para uma nova versão com emet self update, a atualização automática e a atualização dos plugins.
seoTitle: Atualizar o emet
sourceHash: 380b07ed5a10474f
---

Como levar um emet instalado para uma nova versão. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md).

## Atualizar a instalação independente

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

A versão é baixada, verificada com o `SHA256SUMS` (e a atestação quando o `gh` está presente) e preparada. A troca do link simbólico e dos arquivos instalados só acontece quando nenhum slot de worker está ocupado; caso contrário a atualização fica pendente e é aplicada no próximo início de sessão. Uma falha deixa a versão atual intacta e é registrada no journal. A versão anterior é mantida para rollback e as mais antigas são removidas. O `emet doctor` avisa quando há uma atualização pendente.

## Atualizar automaticamente

Um hook `SessionStart` executa `emet self update --auto` no máximo uma vez por dia, em segundo plano e em silêncio quando está offline. Para desativá-lo, defina `EMET_AUTO_UPDATE=0` ou execute:

```bash
emet self update --auto off
```

`emet self update --auto on` o ativa de novo. A atualização automática não faz nada em instalações por plugin.

## Opcional: plugins

O emet e o plugin opcional `emet-mascot` vêm do mesmo marketplace, `emet-marketplace`. O Claude Code não atualiza marketplaces de terceiros por conta própria por padrão, e um marketplace não pode mudar esse padrão para seus usuários.

### Claude Code

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Pule a última linha se você não instalou o mascote. Reinicie o Claude Code depois, ou execute `/reload-plugins`. `claude plugin list` mostra as versões instaladas; a mais recente está no [CHANGELOG.md](../../CHANGELOG.md).

Para atualizar automaticamente, execute `/plugin` no Claude Code, abra a aba **Marketplaces**, selecione `emet-marketplace` e escolha **Enable auto-update**. O Claude Code então atualiza o marketplace e os dois plugins quando uma sessão começa. Cada usuário define isso na própria máquina.

### Codex

Atualize o snapshot do marketplace e adicione o plugin de novo. Executar `codex plugin marketplace add` uma segunda vez não o atualiza:

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` mostra se `emet@emet-marketplace` está instalado e habilitado. A atualização automática é um recurso do Claude Code; no Codex, atualize manualmente.
