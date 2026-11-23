---
title: Primeiros passos
description: Instale o emet com a instalação independente, confirme que ele funciona com emet doctor e execute-o pela primeira vez.
seoTitle: Primeiros passos com o emet
sourceHash: ce83e38591b3de64
---

Instale o emet, confirme que ele funciona e execute-o pela primeira vez.

<img src="../brand/mascot/mascot-done.svg" alt="mascote do emet, pronto" width="96" align="right">

## Requisitos

Claude Code ou a CLI do Codex, `git`, `gh` (autenticado) e o plugin `mattpocock-skills`, em Linux ou macOS. O Bun só é necessário para `emet self install --from`; o Windows nativo não é suportado (use o WSL). A lista completa, com o que verifica cada item, está na [referência de dependências](../reference/dependencies.md).

## Instalar

Execute o script de bootstrap em um terminal. Não são necessários Bun, clone nem sudo:

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh
```

O script se recusa a rodar sob sudo, baixa o binário independente e o `SHA256SUMS` da sua plataforma para um diretório temporário, verifica o checksum (e a atestação quando o `gh` está presente) e só então passa o controle ao `emet self install`. Nada é gravado se uma verificação falhar. Ele não edita o perfil do seu shell; se `~/.local/bin` não estiver no seu `PATH`, adicione-o.

O `emet self install` coloca o binário em `~/.local/share/emet/versions/<version>/emet` e o liga a partir de `~/.local/bin/emet`. Em seguida grava os arquivos do Claude Code: os prompts de referência em `~/.claude/emet/`, os comandos em `~/.claude/commands/emet/` e os agentes em `~/.claude/agents/`, com os marcadores de posição do plugin reescritos como caminhos simples de `~/.claude`. Ele mescla os hooks do emet em `~/.claude/settings.json` depois de um backup e deixa os hooks de terceiros intactos. Quando o Codex está presente, também grava as skills do emet em `~/.agents/skills/emet/` e acrescenta os hooks do emet a `$CODEX_HOME/hooks.json` (padrão `~/.codex`); ele nunca escreve o `config.toml`. Executá-lo de novo é seguro, e um arquivo que você editou é mantido, com a nova versão gravada ao lado como `<file>.new`.

Para visualizar todas as escritas sem fazer nenhuma, passe `--dry-run`. Os argumentos depois de `sh -s --` chegam ao `emet self install`:

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh -s -- --dry-run
```

Você também pode fixar uma versão, como em `sh -s -- 1.2.3`; o padrão é `latest`. Para instalar a partir de um checkout, execute `emet self install --from <checkout>`; ele precisa do `bun` e mantém o `emet selftest` funcionando.

### Codex

Quando o Codex está presente, o `emet self install` imprime um passo único: abra `/hooks` no Codex e pressione `t` na página de eventos para confiar nos hooks do emet (ou aprove o aviso "Hooks need review" na inicialização). Até lá, o emet guard não roda. Veja [Executando o emet no Codex](codex.md#instalação).

### Atualização automática

Um hook `SessionStart` executa `emet self update --auto` no máximo uma vez por dia, em segundo plano e em silêncio quando está offline. Ele verifica o checksum, prepara a nova versão e troca o link simbólico só quando nenhum slot de worker está ocupado; caso contrário a atualização fica pendente até o próximo início de sessão. A versão anterior é mantida para rollback. Para desativá-la, defina `EMET_AUTO_UPDATE=0` ou execute `emet self update --auto off`; `emet self update --auto on` a ativa de novo. Veja [Atualizar o emet](../how-to/update-emet.md).

### Desinstalar

```bash
emet uninstall --dry-run     # list what would be removed
emet uninstall
```

Ele remove o diretório de versões, o link simbólico `~/.local/bin/emet`, o arquivo de estado da instalação, as skills do Codex e todo hook do emet nos dois arquivos de hooks, e reverte os extras que o `emet setup` registrou. Um arquivo de comando que você editou e quaisquer hooks de terceiros são mantidos. Veja a [referência da CLI](../reference/cli.md#subcomandos).

### Opcional: plugins

Em vez da instalação independente, ou para o opcional `emet-mascot`, você pode instalar o emet como plugin. O `emet self install` se recusa enquanto o plugin do emet estiver instalado e explica como removê-lo; `--force` prossegue mesmo assim, e o `emet doctor` avisa quando os dois coexistem. O que um plugin inclui depende do host do agente. No Claude Code ele traz o `/emet:run`, os agentes, os hooks de proteção e um shim `emet` que baixa um binário independente com checksum verificado no primeiro uso. O plugin do Codex traz as skills `$emet:run`, `$emet:init` e `$emet:doctor` e um hook, mas nenhum agente e nenhum shim `emet`.

:::install-tabs

```bash tab="Claude Code"
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

```bash tab="Codex"
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

:::

Toda instalação dá a você os mesmos três pontos de entrada. No Claude Code são os comandos de barra `/emet:run`, `/emet:init` e `/emet:doctor`; no Codex são as skills `$emet:run`, `$emet:init` e `$emet:doctor`. A instalação independente também coloca o `emet` no seu `PATH`, então `emet init` e `emet doctor .` funcionam em um terminal comum; com apenas um plugin, use os comandos de barra, ou `! emet <subcommand>` dentro de uma sessão do Claude Code ou do Codex. No Claude Code, os nomes dos agentes diferem: `emet:emet-worker` no plugin, `emet-worker` na instalação independente. O Codex não tem agentes do emet, porque cada worker é seu próprio processo `codex exec`.

Ordem recomendada, em cada repositório: execute primeiro a skill `setup-matt-pocock-skills` (`/setup-matt-pocock-skills` no Claude Code; no Codex, a mesma skill do plugin `mattpocock-skills`, com a sintaxe `$` do Codex) e depois `emet init`.

Verifique se funcionou com `/emet:doctor` dentro do Claude Code (`$emet:doctor` no Codex), ou `emet doctor .` em um terminal (o `selftest` precisa de uma instalação `--from` a partir do código-fonte).

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
