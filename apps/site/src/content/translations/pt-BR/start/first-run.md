---
title: Primeira execução
description: Confirme a instalação com emet doctor e execute o emet pela primeira vez.
seoTitle: Primeira execução do emet
sourceHash: 7daec76e45f50b8c
---

Confirme a instalação com `emet doctor` e execute o emet pela primeira vez. Instale o emet antes; veja [Instalar](install.md).

## Pré-requisitos

- emet instalado, com o `emet` no seu `PATH`.
- Um repositório git com o `gh` autenticado.
- No Claude Code ou no Codex, o plugin `mattpocock-skills`.

## Passos

Em cada repositório, execute primeiro a skill `setup-matt-pocock-skills` (`/setup-matt-pocock-skills` no Claude Code; no Codex, a mesma skill do plugin `mattpocock-skills`, com a sintaxe `$` do Codex). Depois, em qualquer repositório git:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight     # confirms the repo is dispatch-ready
```

Dentro de uma sessão, `/emet:init` faz o mesmo que `emet init` (`$emet:init` no Codex). O `emet init` deixa um marcador `TODO(emet):` nos arquivos `docs/agents/*.md` gerados para tudo o que ele não consegue inferir sozinho, como um lock compartilhado do banco de dados de testes ou a propriedade do schema; preencha-os. O `emet preflight` se recusa a despachar enquanto restar algum.

Depois, execute o emet dentro do Claude Code (no Codex, use `$emet:run` em vez de `/emet:run`):

```
/emet:run <describe the feature>              # interview, then wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## Verifique o resultado

Execute `emet doctor .` em um terminal, ou `/emet:doctor` dentro do Claude Code (`$emet:doctor` no Codex). Ele informa as falhas primeiro. Se o `doctor` ou o `preflight` relatar um problema, veja a [solução de problemas](../troubleshooting.md). Nada é instalado nem autenticado em seu nome; a [referência de dependências](../reference/dependencies.md) diz quem verifica o quê e documenta `EMET_SKIP_DEPENDENCY_CHECKS`.

## Próximos passos

- [Trackers e aterrissagem](../how-to/configure-tracker.md): GitHub, Linear ou tickets locais, e como uma spec aterrissa.
- [Executando o emet no Codex](../how-to/use-codex.md): a aprovação única e os limites do host de agente Codex.
- [Modelos e esforço](../how-to/choose-models.md): qual modelo e qual esforço cada papel usa.
- [Verificação de frota](../how-to/check-a-fleet.md): audite vários repositórios de uma só vez.
- [Referência de configuração](../reference/configuration.md) e [referência da CLI](../reference/cli.md): cada chave e subcomando.
