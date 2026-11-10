---
title: Atualizar o emet
description: Leve um emet instalado para uma nova versão e ative a atualização automática do marketplace para os plugins.
seoTitle: Atualizar o emet
sourceHash: e9018d796fe23437
---

Como levar um emet instalado para uma nova versão. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md).

O emet e o plugin opcional `emet-mascot` vêm do mesmo marketplace, `emet-marketplace`. O Claude Code não atualiza marketplaces de terceiros por conta própria por padrão, e um marketplace não pode mudar esse padrão para seus usuários.

## Atualizar no Claude Code

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Pule a última linha se você não instalou o mascote. Reinicie o Claude Code depois, ou execute `/reload-plugins`. `claude plugin list` mostra as versões instaladas; a mais recente está no [CHANGELOG.md](../../CHANGELOG.md).

## Atualizar no Codex

Atualize o snapshot do marketplace e adicione o plugin de novo. Executar `codex plugin marketplace add` uma segunda vez não o atualiza:

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` mostra se `emet@emet-marketplace` está instalado e habilitado.

## Atualizar automaticamente

A atualização automática é um recurso do Claude Code; no Codex, atualize manualmente. No Claude Code, execute `/plugin`, abra a aba **Marketplaces**, selecione `emet-marketplace` e escolha **Enable auto-update**. O Claude Code então atualiza o marketplace e os dois plugins quando uma sessão começa, e a sessão seguinte carrega as novas versões. Cada usuário define isso na própria máquina.

## Instalado com install.sh

Faça pull da `main` mais recente no seu clone e execute `./install.sh` de novo.
