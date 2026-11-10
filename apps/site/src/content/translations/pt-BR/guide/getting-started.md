---
title: Primeiros passos
description: Instale o emet como plugin do Claude Code, confirme que ele funciona com emet doctor e execute-o pela primeira vez.
seoTitle: Primeiros passos com o emet
sourceHash: 7a918962dca60c10
---

Instale o emet, confirme que ele funciona e execute-o pela primeira vez.

<img src="../brand/mascot/mascot-done.svg" alt="mascote do emet, pronto" width="96" align="right">

## Requisitos

Claude Code ou a CLI do Codex, `git`, `gh` (autenticado) e o plugin `mattpocock-skills`, em Linux ou macOS. O Bun só é necessário para uma instalação a partir do código-fonte; o Windows nativo não é suportado (use o WSL). A lista completa, com o que verifica cada item, está na [referência de dependências](../reference/dependencies.md).

## Instalar

Há dois caminhos de instalação.

**Plugin** (sem Bun). Adicione este repositório como marketplace e instale o plugin `emet`. O que ele inclui depende do host do agente. No Claude Code ele traz o `/emet:run`, os agentes, os hooks de proteção e um shim `emet` que baixa um binário independente com checksum verificado no primeiro uso.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

No Codex, instale o plugin com `codex plugin`; os passos estão em [Executando o emet no Codex](codex.md#instalação). O plugin do Codex traz as skills `$emet:run`, `$emet:init` e `$emet:doctor` e um hook, mas nenhum agente e nenhum shim `emet`, então o `emet` do terminal vem do `install.sh`.

**`install.sh`** (funciona com ou sem Bun):

```bash
git clone git@github.com:andryorelabs/emet.git
cd emet
./install.sh
```

Com o `bun` no PATH, ele copia o código-fonte da CLI para `~/.claude/emet` e um wrapper `emet` para `~/.local/bin/emet`. Sem o `bun`, instala em vez disso o shim do binário independente (`~/.local/bin/emet`, ligado a `~/.claude/emet/bin/emet`), que baixa e verifica o checksum do binário na primeira execução (precisa do `curl`). Em ambos os casos os comandos vão para `~/.claude/commands/emet/` e os agentes para `~/.claude/agents/`; os marcadores de posição do plugin nos prompts são reescritos como caminhos simples de `~/.claude`. Executá-lo de novo é seguro, e um arquivo que você editou é mantido, com a nova versão gravada ao lado como `<file>.new`.

As duas instalações dão a você três pontos de entrada. No Claude Code são os comandos de barra `/emet:run`, `/emet:init` e `/emet:doctor`; no Codex são as skills `$emet:run`, `$emet:init` e `$emet:doctor`, que só o plugin do Codex traz (o `install.sh` instala os comandos do Claude Code). O comando `emet` em um terminal comum só funciona depois do `install.sh`; caso contrário, use os comandos de barra, ou `! emet <subcommand>` dentro de uma sessão do Claude Code ou do Codex. No Claude Code, os nomes dos agentes diferem: `emet:emet-worker` no plugin, `emet-worker` na instalação independente. O Codex não tem agentes do emet, porque cada worker é seu próprio processo `codex exec`.

Ordem recomendada, em cada repositório: execute primeiro a skill `setup-matt-pocock-skills` (`/setup-matt-pocock-skills` no Claude Code; no Codex, a mesma skill do plugin `mattpocock-skills`, com a sintaxe `$` do Codex) e depois `emet init`.

Verifique se funcionou com `/emet:doctor` dentro do Claude Code (`$emet:doctor` no Codex), ou `emet doctor .` em um terminal depois do `install.sh` (o `selftest` precisa de uma instalação a partir do código-fonte).

Se o `doctor` ou o `preflight` relatar um problema, veja a [solução de problemas](../troubleshooting.md). Nada é instalado nem autenticado em seu nome; veja a [referência de dependências](../reference/dependencies.md) para saber quem verifica o quê e para `EMET_SKIP_DEPENDENCY_CHECKS`.

## Primeira execução

Em qualquer repositório git:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

Dentro de uma sessão, `/emet:init` faz o mesmo que `emet init`. Depois, dentro do Claude Code (no Codex, use `$emet:run` em vez de `/emet:run`):

```
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

O `emet init` deixa um marcador `TODO(emet):` nos arquivos `docs/agents/*.md` gerados para tudo o que ele não consegue inferir sozinho (um lock compartilhado do banco de dados de testes, a propriedade do schema etc.); preencha-os. O `emet preflight` se recusa a despachar enquanto restar algum.

## Próximos passos

- [Trackers e aterrissagem](trackers-and-landing.md): tickets do GitHub, do Linear ou locais, e como uma onda aterrissa.
- [Executando o emet no Codex](codex.md): instalação, a aprovação única e os limites do host de agente Codex.
- [Modelos e esforço](models-and-effort.md): qual modelo e qual esforço cada papel usa.
- [Verificação de frota](fleet.md): audite vários repositórios de uma só vez.
- [Referência de configuração](../reference/configuration.md) e [referência da CLI](../reference/cli.md): cada chave e subcomando.
