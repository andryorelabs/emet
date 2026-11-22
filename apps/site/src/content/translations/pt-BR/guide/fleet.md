---
title: Verificação de frota
description: Audite vários repositórios de uma só vez com emet doctor, somente leitura, e veja quais precisam de atenção.
seoTitle: Verificação de frota com emet doctor
sourceHash: 7b3c5a56abfffcc1
---

Já usa o emet em vários repositórios? O `emet doctor` audita quantos você quiser de uma só vez, somente leitura:

```bash
emet doctor ~/code/*
```

Informa, por repositório: um `emet.config.json` válido, os quatro arquivos `docs/agents/*.md` presentes, zero marcadores `TODO(emet):` restantes, se os comandos de `commands.selfCheck` realmente são resolvidos e os achados de dependências específicos do tracker daquele repositório (`gh`, Linear; veja a [referência de dependências](../reference/dependencies.md)). O plugin mattpocock-skills e as flags das CLIs externas (`gh`, mais as flags da CLI do próprio host de agente: no Claude Code `claude --bg` e `claude agents --json`, no Codex `codex exec --json` e `--output-schema`, todas verificadas via `--help`) são checados uma única vez para toda a varredura, não por repositório.

O `emet doctor` verifica as próprias flags, não apenas se os binários existem. Ele lê o `--help` de `gh issue view`/`gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`) e, no Claude Code, `claude` (`--bg`) e `claude agents` (`--json`), e informa qualquer flag que uma CLI mais nova ou mais antiga não documente mais. Uma flag renomeada, caso contrário, faria uma onda falhar no meio do caminho. As verificações de `claude` e `claude agents` são as do host Claude Code. No host Codex, as verificações de flags do host as substituem em vez de se somarem a elas: o `emet doctor` verifica o `codex exec` quanto a `--json` e `--output-schema` (`hostCliFlagRequirements` em `emet/src/doctor.ts`). Ele não compara a versão do `codex` com `codex.minVersion`; veja [Executando o emet no Codex](codex.md).

## Alterando e iniciando em vários repositórios

O `emet fleet` trabalha nos repositórios que têm um `emet.config.json` um nível abaixo de uma raiz (padrão `~/code`):

```bash
emet fleet list --root ~/code
emet fleet set handoff.autoChain false --dry-run
emet fleet launch --feature "add dark mode" --repos app,site
```

- `list` imprime, por repositório, o caminho, `tracker.kind`, `handoff.autoChain` e `models.worker`. `--json` imprime como dados.
- `set <key> <value>` altera uma chave de configuração em cada repositório listado. Cada valor é validado pelo carregador de configuração antes de qualquer escrita; um valor inválido não modifica nenhum repositório e termina com código 1. `--dry-run` não escreve nada e imprime o valor antigo e o novo de cada repositório.
- `launch --feature <text>` abre uma sessão `/emet:run --draft <text>` em cada repositório, após as mesmas verificações de prontidão do `emet chain`. `--repos` limita a uma lista separada por vírgulas.

Cada sondagem é limitada a 5 s para que um `gh auth status` travado (sem rede) não possa pendurar uma onda. O `preflight.requiredCommands` de um repositório é uma lista, de responsabilidade do repositório, de binários que `emet preflight` e `emet doctor` exigem no PATH. Veja a [referência da CLI](../reference/cli.md#verificação-de-frota) e a [referência de configuração](../reference/configuration.md#preflight).

## Ver sessões bloqueadas

Uma sessão que espera uma decisão sua fica parada em silêncio. O `emet fleet status` lê o journal global e mostra, por repositório, quantas sessões estão bloqueadas, em andamento ou ociosas nas últimas 24 horas, com os repositórios bloqueados primeiro:

```bash
emet fleet status
emet fleet status --json
```

`--json` imprime `{ repos: [{ repo, sessions }], blocked }`, onde `blocked` é o total de sessões bloqueadas. Para um único repositório, `emet status` lista as sessões em `sessions[]`. Quando uma sessão entra em `needs-decision`, o emet também levanta um alerta, a menos que [`attention.alert`](../reference/configuration.md#attention) seja `false`.
