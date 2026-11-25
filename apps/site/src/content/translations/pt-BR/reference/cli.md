---
title: Referência da CLI
description: Cada subcomando do emet, os gates e registros, os códigos de saída e as variáveis de ambiente.
seoTitle: Referência da CLI do emet
sourceHash: cde063f67e8e54d7
---

Cada subcomando do `emet`, os gates e registros, os códigos de saída e as variáveis de ambiente. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md). Voltar ao [README](../../README.md). Todo comando imprime seu uso com `--help`.

## Subcomandos

Três comandos de barra envolvem a CLI dentro do Claude Code: `/emet:run` (o pipeline), `/emet:init` (`emet init`) e `/emet:doctor` (`emet doctor .`). No Codex, são as skills `$emet:run`, `$emet:init` e `$emet:doctor`. Um `emet` em um terminal comum exige o `emet self install`; caso contrário, execute `! emet <subcommand>` dentro de uma sessão.

`emet <command> [...args]`. `emet --version` imprime a versão.

Em qualquer repositório git:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

O `emet init` deixa um marcador `TODO(emet):` nos arquivos `docs/agents/*.md` gerados para tudo o que ele não consegue inferir sozinho (um lock compartilhado do banco de dados de testes, a propriedade do schema e assim por diante). Preencha-os; o `emet preflight` se recusa a despachar enquanto restar algum.

Depois, dentro do Claude Code (no Codex, use `$emet:run` com os mesmos argumentos):

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## Configuração e auditoria

### `emet migrate`

Renomeia um repositório legado para os nomes do emet.

- `--dry-run`

### `emet init`

Detecta automaticamente o gerenciador de pacotes, a branch tronco, o tipo de tracker e o modo after-spec (veja [`handoff.afterSpec`](configuration.md#handoff)). Define [`schema.ownedPaths`](configuration.md#schema) quando encontra um schema do Prisma (`prisma/schema.prisma` ou uma pasta `prisma/schema/`) ou uma pasta de migrations do Drizzle (`drizzle/` ao lado de um `drizzle.config.*`), e escreve o `emet.config.json` e os arquivos `docs/agents/*.md`.

- `--tracker linear|github|local`: `--tracker local` configura o tracker local.
- `--after-spec release|promote|none`
- `--force`

### `emet doctor`

Auditoria somente leitura de quantos repositórios você quiser de uma só vez; por padrão, o diretório atual.

- `--all`
- `<path> ...`: os repositórios a auditar.

Para um repositório que configura [`verify.browser`](configuration.md#verify), também informa um achado opcional sobre o `agent-browser`: um binário ausente é `indeterminate` (uma linha `optional:` com o remédio de instalação) e, quando o binário existe, um `agent-browser doctor` que falha aparece como aviso. Nenhum dos dois é jamais um erro, e nenhum altera o código de saída. Um repositório sem `verify.browser` não mostra nada.

#### Verificação de frota

O `emet doctor` audita vários repositórios de uma só vez, somente leitura:

```bash
emet doctor ~/code/*
```

Informa, por repositório: um `emet.config.json` válido, os quatro arquivos `docs/agents/*.md` presentes, zero marcadores `TODO(emet):` restantes, se os comandos de `commands.selfCheck` realmente são resolvidos e os achados de dependências específicos do tracker daquele repositório (`gh`, Linear; veja [dependências](dependencies.md#o-que-verifica-o-quê)).

O plugin mattpocock-skills e as flags das CLIs externas são verificados uma única vez para toda a varredura, não por repositório. São o `gh` e, do host de agente, `claude --bg` e `claude agents --json` no Claude Code, `codex exec --json` e `--output-schema` no Codex, verificados via `--help`.

### `emet setup`

Oferece as instalações opcionais com prompts do readline.

- `--yes`
- `--with <ids>`
- `--list`
- `--json`
- `--dry-run`: combinável com `--with`, `--yes` e `--json`. Imprime, para cada item escolhido, os passos planejados ou `already-present`, e não altera nada: não executa nenhum comando, não escreve nenhum arquivo nem entrada do ledger e sai com código 0.
- `--restore <id>`: desfaz um dos dois itens que podem ser restaurados; veja [Ledger do setup e restauração](#ledger-do-setup-e-restauração).

Sem TTY, ou com `--yes` ou `--with`, não pergunta nada e instala exatamente os itens nomeados; sem TTY e sem `--with` não instala nada e imprime o catálogo de `--list`. Cada etapa informa `installed`, `already-present`, `skipped` ou `failed`; uma falha não interrompe as demais, e o código de saída é 1 se alguma falhou. `/emet:setup` é a entrada do plugin e faz as mesmas perguntas com `AskUserQuestion`. Todo item `installed` é registrado no ledger do Setup.

Os itens:

- `mattpocock-skills` (ligado por padrão), `engram`, `mascot`, `orca-pet` e `gh-auth`.
- `agent-browser` (desligado por padrão): executa `bun add -g agent-browser@latest` e depois `agent-browser install`, e escreve `~/.agent-browser/config.json` com `contentBoundaries: true` e `maxOutput: 50000` somente quando esse arquivo não existe. Depois executa `agent-browser doctor` e imprime um aviso se ele falhar. Nunca fixa uma versão e nunca passa `--with-deps`, então, quando faltam bibliotecas do sistema, imprime o comando para você executar.
- `context7` (desligado por padrão): executa `bun add -g ctx7@latest`, depois `ctx7 setup --cli --claude --yes`, e `ctx7 setup --cli --codex --yes` somente quando `codex` está no PATH. Instala a CLI `ctx7` e sua skill `find-docs`, não o servidor MCP, nunca fixa uma versão e imprime o comando para executar manualmente quando uma etapa de `ctx7 setup` falha. O `ctx7` envia eventos de uso anônimos, a menos que `CTX7_TELEMETRY_DISABLED=1` esteja definido, e um `CONTEXT7_API_KEY` no ambiente tem precedência sobre a conta salva por `ctx7 login`.
- `firecrawl-local` (desligado por padrão): requer `cargo` e executa `cargo install firecrawl-local` quando o binário não existe. Depois registra um servidor MCP do Claude Code no escopo do usuário com `FIRECRAWL_CLOUD=search` e `--public-only`, substituindo um registro anterior com outras configurações. Scrape, crawl e map rodam na máquina, só a busca na web vai para o Firecrawl Cloud e endereços privados são bloqueados.
  - Passa o Chrome mais recente baixado pelo `agent-browser` como `FIRECRAWL_CHROME_PATH`.
  - No Linux, onde o AppArmor restringe namespaces de usuário sem privilégio, imprime um perfil do AppArmor e os comandos `sudo` para carregá-lo, porque o Firecrawl Local nunca executa o Chrome sem seu sandbox.
  - Sem um Chrome utilizável, páginas renderizadas com JavaScript voltam vazias.
- `claude-settings`: as configurações recomendadas do Claude Code, aplicadas só quando escolhidas, após um backup com timestamp do `settings.json`.

#### Ledger do setup e restauração

O `emet setup` registra todo item que termina `installed` em `setup-ledger.json`, no diretório de estado, como `{ id, at, undo }`. Um item `already-present` não registra nada, e um segundo `installed` do mesmo id mantém o estado anterior da primeira entrada. As gravações no ledger são atômicas, e um ledger malformado é um erro que informa o seu caminho, nunca é lido como vazio.

Os registros de desfazer guardam o necessário para reverter:

- `claude-settings`: o `model` anterior (ou nenhum), as regras deny que realmente adicionou e o caminho do backup.
- `firecrawl-local`: a entrada MCP anterior no escopo do usuário (lida de `~/.claude.json` antes de `claude mcp remove` executar) e se o emet rodou `cargo install`.
- Plugins: o id do plugin.
- `orca-pet`: os arquivos escritos.
- `agent-browser`: o pacote global do bun (e o arquivo de configuração, quando o emet o criou).
- `context7`: o pacote global do bun.
- `engram`: a fórmula do brew e o plugin.

`emet setup --restore <id>` aceita apenas `claude-settings` e `firecrawl-local`; qualquer outro id sai com código 2.

- `claude-settings` restaura o `model` anterior (ou apaga a chave quando não havia) e remove somente as regras deny que o emet adicionou, depois de um backup com timestamp. Quando o `model` atual não é o que o setup definiu, ele o mantém e imprime um aviso.
- `firecrawl-local` executa `claude mcp remove firecrawl-local -s user` e, se havia uma entrada registrada, `claude mcp add-json firecrawl-local '<previous json>' -s user`.

Uma restauração bem-sucedida remove a entrada do ledger; um id sem entrada imprime `nothing to restore for <id>` e sai com código 1.

O `emet uninstall` reverte todas as entradas do ledger da mesma forma: `claude-settings` e `firecrawl-local` como em `--restore`, plugins com `claude plugin uninstall <id>`, e os arquivos do `orca-pet` e a configuração do agent-browser criada pelo emet apagando-os. Para os globais de brew, bun e cargo, imprime o comando de remoção (por exemplo `bun remove -g ctx7`) e nunca o executa, e nunca toca em `gh auth`. Cada entrada revertida sai do ledger, e um extra que falha não interrompe os demais.

### `emet self install`

A instalação independente: `emet self install [latest|X.Y.Z]`.

- `--dry-run`: lista cada escrita e não grava nada.
- `--force`: prossegue mesmo com o plugin do emet instalado; sem ele, o comando se recusa enquanto o plugin estiver instalado.
- `--from <checkout>`: reproduz uma instalação a partir do código-fonte com Bun. O código-fonte da CLI é copiado para `~/.claude/emet` e `~/.local/bin/emet` vira um wrapper que executa o `bun` sobre ele, de modo que `emet selftest` funciona; falha sem o `bun`. Quem contribui usa `emet self install --from .`.

Coloca o binário em `~/.local/share/emet/versions/<v>/emet` com o link simbólico `~/.local/bin/emet`, grava os prompts de referência e o `.install-manifest.json` em `~/.claude/emet/`, os comandos em `~/.claude/commands/emet/` e os agentes em `~/.claude/agents/`.

Mescla os hooks do emet em `~/.claude/settings.json` (com backup, sem tocar em hooks de terceiros) e, quando o Codex está presente, grava as skills em `~/.agents/skills` e acrescenta os hooks a `$CODEX_HOME/hooks.json` (padrão `~/.codex`; o `config.toml` nunca é escrito, então aprove os hooks uma vez com `/hooks`).

Uma segunda execução não altera nada; um arquivo editado é mantido e a nova versão fica ao lado como `<file>.new`. O script de instalação de uma linha de [Instalação](../start/install.md) baixa o binário da release, verifica o `SHA256SUMS` e executa este comando.

### `emet self update`

`emet self update [latest|X.Y.Z]` baixa a release, verifica o `SHA256SUMS` (e a atestação quando o `gh` está presente) e a prepara. A troca do link simbólico e dos arquivos instalados só acontece quando nenhum slot de worker está ocupado; caso contrário fica pendente até o próximo início de sessão. Uma falha deixa a versão atual intacta e é registrada no journal. A versão anterior é mantida para rollback e as mais antigas são removidas. Não faz nada em instalações por plugin.

- `--auto [off|on]`: o que o hook `SessionStart` executa. Roda no máximo uma vez por dia, em segundo plano e em silêncio quando está offline; `off` ou `on` o alterna. `EMET_AUTO_UPDATE=0` também o desativa.

### `emet uninstall`

Remove uma instalação feita por `emet self install` e o que o `emet setup` adicionou. Primeiro monta o plano completo e depois o executa.

- `--dry-run`: imprime o plano e não altera nada.
- `--yes`: dispensa a confirmação. Com TTY e sem `--yes`, pede confirmação uma vez, e sem TTY e sem `--yes`, imprime o plano, não altera nada e sai com código 0.
- `--purge`: remove também o diretório de estado (`EMET_STATE_DIR`, senão `XDG_STATE_HOME/emet`) e `~/.emet`; sem ele, ambos permanecem.
- `--json`: imprime o resultado como JSON.

O que ele remove:

- Todo arquivo do manifesto de instalação cujo hash atual coincide com o registrado, mais o seu irmão `.new`; os arquivos editados permanecem e são listados.
- O shim `~/.local/bin/emet`, apenas quando ele é o wrapper da instalação ou um link simbólico para `~/.claude/emet` ou `~/.local/share/emet/versions`, depois o manifesto e os diretórios que ficaram vazios.
- De `~/.claude/settings.json` e de `$CODEX_HOME/hooks.json` (padrão `~/.codex`), todo comando de hook do emet em qualquer evento (`emet guard`, `emet setup --notice`, `emet whats-new --hook` e `emet self update --auto`). Mantém todos os outros hooks e descarta grupos e eventos que ficam vazios.
- As skills do Codex em `~/.agents/skills/emet/` que ainda coincidem com este emet (as editadas permanecem e são listadas), o diretório de versões `~/.local/share/emet/versions` e o estado da instalação `~/.local/share/emet/install.json`.
- Os extras do ledger do Setup (veja [Ledger do setup e restauração](#ledger-do-setup-e-restauração)).

Quando um backup da instalação (`.pre-emet-guard-backup.`) contém exatamente o que sobra, seus bytes são restaurados; quando não sobra nada, o arquivo é removido; caso contrário, um backup com timestamp é gravado antes.

Sem manifesto ou estado de instalação (instalação por plugin), pula os arquivos e imprime `claude plugin uninstall emet@emet-marketplace`; quando `codex` está no PATH, também imprime como remover o plugin do Codex. Sai com código 1 quando algum passo falhou ou um arquivo que precisa ler (manifesto, settings, ledger) está ilegível, e informa o caminho dele.

### `emet whats-new`

Imprime um aviso único depois que o emet é atualizado.

- `--hook`: a forma que o hook `SessionStart` executa.

### `emet fleet`

Trabalha em todos os repositórios git com um `emet.config.json` um nível abaixo de `--root` (padrão `~/code`). Veja o [guia de fleet](../how-to/check-a-fleet.md).

- `emet fleet list [--root <dir>] [--json]`: lista os repositórios com `tracker.kind`, `handoff.autoChain` e `models.worker`.
- `emet fleet set <key> <value> [--root <dir>] [--dry-run]`: altera uma chave de configuração em cada repositório listado, validando antes pelo carregador de configuração (um valor inválido não altera nada e sai com 1).
- `emet fleet launch --feature <text> [--root <dir>] [--repos <a,b>] [--dry-run]`: abre uma sessão `/emet:run --draft <text>` em cada repositório após as verificações de prontidão do `emet chain`. `--dry-run` imprime os lançamentos planejados sem iniciar uma sessão.
- `emet fleet status [--json]`: lê o journal global e imprime, por repositório, o último estado de cada sessão nas últimas 24 horas (excluindo `ended`).

`fleet status` imprime uma linha `<repo>: <b> blocked, <w> working, <i> idle` por repositório, com os repositórios bloqueados primeiro. `--json` imprime `{repos: [{repo, sessions: [{sessionId, state, blocked, since, runId}]}], blocked: <count>}`. Sai com 0 também quando não há sessões.

### `emet preflight`

Confirma que o repositório está pronto para despachar.

- `--run <id>`
- `--post-dispatch`

### `emet skill-path`

`emet skill-path <name>` imprime o caminho absoluto do `SKILL.md` de uma skill do mattpocock-skills. Termina com código 1 se a skill não for encontrada.

### `emet selftest`

Executa os testes unitários da própria CLI. Somente em instalações a partir do código-fonte; um binário compilado termina com código 1 e manda você executar `emet doctor`.

## Execuções, workers e slots

### `emet claims`

Reserva um ticket para uma execução: `emet claims --reserve <ticket> --run <id> --anchor <pid>`.

- `--release <ticket>`: libera uma reivindicação.
- `--list`: lista as reivindicações.
- `--prune [--dry-run]`: remove as reivindicações obsoletas.

### `emet slots`

Pega um slot de worker do pool de todo o host em `~/.local/state/emet/slots`: `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`.

- `--release --run <id>`: libera os slots da execução.
- `--release-index <index>`: libera um slot.
- `--list`: lista os slots.

### `emet cleanup`

`emet cleanup [--run <id> | --all] [--dry-run] [--force]`. Sem argumentos, recupera execuções encerradas ou mortas cujo trabalho já aterrissou. Depois de um merge, `emet cleanup --run <runId>` libera as branches, as reivindicações de tickets e os slots de workers da onda.

- `--run <id>`: limpa esta execução.
- `--all`: uma varredura de branches em todo o repositório.
- `--dry-run`
- `--force`

Em todos os modos ele também exclui cada branch local cujo PR foi mesclado no commit da ponta da branch, junto com o worktree de agente limpo e desbloqueado que a contém.

### `emet lock-reason`

`emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]` imprime o motivo do `git worktree lock` que um worker escreve no bootstrap.

### `emet launch`

`emet launch <spec-id> --wave <n>`: no Claude Code, inicia uma onda como uma sessão `claude --bg` e abre sua aba do Orca conforme `handoff.launcher` (no Codex, veja [Host Codex](#host-codex)). Faz o lançamento completo (verificação de sessão duplicada, `claude --bg`, aba) e imprime `{ name, id, attach, orcaTab: { opened, reason } }`. Use-o, e não um `claude --bg` solto, sempre que quiser uma onda em outra sessão manualmente.

### `emet chain`

`emet chain --ticket <id> --spec <id> --wave <n> [gate flags]` executa `emet gate` com as flags do gate recebidas e só inicia a próxima onda quando a decisão é `chain`.

Antes de lançar, verifica a prontidão (folga de memória do host, disco e inodes livres no repositório e em `/tmp`, a CLI `orca`) e depois confirma que a sessão filha aparece na listagem. Qualquer outra decisão, um problema de prontidão bloqueante (`low-memory`, `low-disk`, `low-inodes`, `orca-unavailable`) ou uma sessão existente para a mesma spec e onda termina com saída 1 com os motivos e não lança nada.

### `emet status`

`emet status [--spec <id>] [--brief]` imprime Working / Checking / Ready / Needs-decision por onda como JSON mais uma linha de resumo. `emet status --help` documenta o JSON.

- `--spec <id>`
- `--brief`: imprime, em vez disso, no máximo três linhas: o estado geral, o que está esperando uma pessoa (se houver) e a próxima ação.

O JSON também traz `sessions: [{sessionId, state, blocked, since, runId}]`: o último estado de atenção de cada sessão do emet deste repositório nas últimas 24 horas, excluindo as sessões `ended`. `blocked` é verdadeiro quando `state` é `needs-decision`, e `since` é o momento desse estado. Qualquer sessão bloqueada torna o `state` geral `needs-decision`, também quando não há onda ativa; a linha de resumo diz quantas sessões estão bloqueadas e `--brief` as lista na linha do que espera uma pessoa.

### `emet run`

`emet run current [--json]` imprime a execução ativa do repositório (id da execução, spec, onda, fase e última atualização), lida de `.emet/phase.json`. Sem execução ativa, imprime `no active run` e sai com 0.

### `emet memory`

Busca e salva lições no [Engram](https://github.com/Gentleman-Programming/engram).

- `emet memory search --json <query> [--limit <n>]`: busca lições de execuções anteriores. Busca com `match_mode: "any"` (`--limit` tem padrão 5, máximo 20), mantém apenas as notas cuja topic key começa com `emet/<repo>/lessons/` e imprime `{available: true, results: [{id, topicKey, title, content}]}` com `content` truncado em 2000 caracteres. `<repo>` é o último segmento do caminho de `git remote get-url <repo.remote>` sem `.git`, senão o basename do worktree principal.
- `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <landed|chained|hold|stop|blocked>`: lê de 1 a 5 bullets de lição (linhas `- ` de no máximo 300 caracteres cada) da entrada padrão e os acrescenta, como uma seção `## <runId> — <outcome> (<date>)`, à nota com a topic key `emet/<repo>/lessons/<key>`, ou inicia essa nota. Uma nota com mais de 20000 caracteres descarta suas seções mais antigas. Imprime `{available: true, saved: true, topicKey}`.

Os dois subcomandos falam com o Engram iniciando `engram mcp --tools=agent` na raiz do repositório; o plugin do Engram não é necessário. Nunca passam um `project` ao Engram.

Códigos de saída: `2` para uso incorreto (nenhum subcomando, uma consulta ausente, nenhum bullet, mais de 5 bullets, um bullet com mais de 300 caracteres, um outcome desconhecido, uma key inválida). Todo problema do Engram (fora do PATH, um handshake que falhou, um erro de ferramenta, um timeout, JSON malformado) sai com `0`.

- Antes de um handshake bem-sucedido, a saída é `{available: false, reason}`.
- Depois dele, a saída é `{available: true, results: [], reason}` para `search` ou `{available: true, saved: false, reason}` para `save`.
- `memory.enabled: "off"` imprime `{available: false, reason: "memory.enabled is off"}` e não inicia nada. Veja [`memory`](configuration.md#memory).

### `emet insights`

Lê o [journal de eventos](../concepts/attention-and-journal.md) e informa as execuções por origem (humana ou automática), as decisões do gate por decisão e motivo, as intervenções humanas por execução, os resultados de lançamento e os tickets fechados. Linhas ilegíveis são puladas e contadas. Um journal vazio ou ausente imprime um relatório zerado e sai com 0.

- `--since <iso|7d|30d>`
- `--repo <path>`
- `--all`
- `--json`
- `--mark-baseline`: acrescenta uma linha de base; os relatórios seguintes cobrem apenas os eventos posteriores a ela, a menos que `--all` seja dado.

### `emet usage`

Informa o uso da sessão.

- `--session <id>` ou `--file <path>`
- `--stalled [--minutes N]`: lista os workers parados.
- `--project-dir <path>`

### `emet handoff`

`emet handoff --check <path> [--expect-skills a,b] | --render <path>` valida ou renderiza a nota `.emet/handoff-<ticket>.md` de um worker.

- `--check <path>`: valida a nota. Uma verificação aprovada imprime `missing skills: …` quando a lista `missing` não está vazia.
- `--expect-skills a,b` (somente com check): reprova a verificação para cada skill nomeada que não esteja nem na lista `loaded` nem na `missing`.
- `--render <path>`: renderiza a nota.

A nota pode trazer uma seção `skills:`, escrita `skills: none` ou `skills: loaded: a, b; missing: c`. Ela é exigida somente quando `state` é `done`, e qualquer outro valor reprova a verificação.

### `emet metrics`

`emet metrics [--run <id>]` informa tokens, custo equivalente em API e tempo de relógio por ticket, por onda e por execução, lidos das transcrições das sessões. Também compara o orçamento de contexto estimado por ticket com o que cada worker realmente usou. Seu resumo vai ao final do relatório final da execução.

### `emet ask`

A caixa de mensagens do worker: pergunta ao coordenador ou espera a resposta.

- `--run <id>`
- `--ticket <ticket>`
- `--body <text>`: envia a pergunta.
- `--wait <n>`: espera a resposta.
- `--slice <seconds>`

Com `--wait`, a saída `0` é uma resposta, `3` um timeout de fatia e `4` expirado.

### `emet inbox`

`emet inbox --run <id>` lista as perguntas de workers em aberto como JSON.

### `emet reply`

`emet reply --run <id> --ticket <ticket> --id <n> --body <text>` responde a uma pergunta de worker.

## Planejamento, revisão e aterrissagem

### `emet promote`

`emet promote --spec <id> [--dry-run] [--no-promote] [--hold]` é a etapa after-spec, conforme [`handoff.afterSpec`](configuration.md#handoff).

- `--dry-run`: não abre nenhum pull request.
- `--no-promote`: pula a etapa.
- `--hold`: escreve o marcador `<run dir>/runs/<id>/no-promote` e imprime `{"held":true}`. Enquanto ele existir, `emet promote --spec <id>` sai com 0 com uma nota `skipped` e não abre nenhum pull request, de modo que `--no-promote` vale entre as sessões de uma spec.

No modo `promote`, abre um pull request de `develop` para `main` com o título `chore: 🔖 promote develop`, espera com `emet ci --pr <n> --wait` e o mescla com um merge commit somente quando o estado é `pass`. Depois, somente se `main` traz conteúdo que `develop` não tem (a comparação `develop...main` lista ao menos um arquivo alterado; merge commits sozinhos não contam), abre um pull request de sincronização de `main` para `develop`, espera suas verificações do mesmo modo e o mescla com [`pr.mergeMethod`](configuration.md#pr) somente quando o estado é `pass`. Quando `main` traz apenas merge commits, nenhum pull request de sincronização é aberto e `syncReason` diz por quê. Um pull request de sincronização cujo estado é `fail`, `timeout` ou `env-fault`, ou cujo merge é rejeitado, permanece aberto e nunca altera o resultado do promote.

Acrescenta ao journal um evento `promote` com o número do pull request, `merged`, `syncPrNumber`, `syncMerged`, `syncReason`, `rule` e `reason`. `afterSpec` pode ser uma lista de regras; o modo é então escolhido a partir dos caminhos que a promoção de `develop` levaria (veja [`handoff.afterSpec`](configuration.md#handoff)), e um `git fetch` ou `git diff` que falhe faz o comando sair com 1 antes de qualquer pull request ser aberto.

O resultado impresso traz:

- `rule`: o índice da regra que coincidiu, ou `null` para a forma de string ou nenhuma coincidência.
- `reason`.
- `syncPrNumber`: `null` quando nenhum pull request de sincronização foi aberto.
- `syncMerged` e `syncReason`: uma frase dizendo por que um pull request de sincronização foi deixado aberto, senão `null`.
- `deployCheck: { run, reason }`: diz se o coordenador deve executar `emet deploy-check`.

No modo `release`, não mescla nada e deixa o pull request da release para uma pessoa. Com `afterSpec` `none`, com `--no-promote`, com uma spec em hold, ou quando a última onda da spec foi deixada aberta ou sinalizada, sai com 0 com uma nota `skipped`. Ainda executa depois de uma última onda limpa, para que o resultado traga a decisão de `deployCheck` (no tronco `main`, a verificação de deploy roda qualquer que seja o modo). Um CI que não seja `pass` não mescla nada e sai com 1.

### `emet deploy-check`

Executa `deploy.check.command` até ele sair com 0, em até `retries` tentativas ou `timeoutSeconds`, esperando `intervalSeconds` entre elas, e imprime `state: ok | failed | timeout` com `attempts`.

- `--json`

Saída `0` ok, `1` failed, `3` timeout. Sem `deploy.check` configurado, sai com 0 com `skipped: "no deploy check configured"`. O coordenador o executa somente quando o resultado do `emet promote` tem `deployCheck.run` verdadeiro. Veja [`deploy`](configuration.md#deploy).

### `emet surfaces`

`emet surfaces --check <file.json | ->` rejeita globs de superfícies permitidas que se sobrepõem entre os tickets de uma onda.

### `emet assess`

`emet assess --base <ref> --head <ref>` classifica um diff como `passive`, `medium` ou `high` e imprime JSON com o nível, os motivos e o modelo e o esforço de revisor recomendados. Veja [Models & effort](../../README.md#models--effort) e [`review`](configuration.md#review).

- `--quick`: o JSON também traz `"quickRejected": true|false` e o comando sai com 1 quando o nível é `high` (um **Stop** para uma **Quick run**: sem auto-merge, o PR permanece aberto) e com 0 nos demais casos. Sem `--quick`, a saída e os códigos de saída não mudam.

O JSON também traz duas decisões:

- `browserVerify: { run, reason }`: `run` é `true` somente quando o nível tem um revisor, [`verify.browser`](configuration.md#verify) está configurado, o binário `agent-browser` está no PATH e, quando `paths` está definido, um caminho alterado coincide. Caso contrário, `reason` nomeia a primeira condição que falhou.
- `dualReview: { run, reason }`: `run` é `true` somente quando o nível é `high`, `agentHost` é `claude`, [`review.dual`](configuration.md#review) não é `off` e o binário `codex` está no PATH. Caso contrário, `reason` nomeia a primeira condição que falhou.

### `emet land`

`emet land --spec <s> --branch <integration> --tickets <id,...>` mescla uma branch de integração no tronco local (`landing.mode` `merge`). `commands.selfCheck` faz as vezes do CI e nada é enviado por push.

### `emet spec-branch`

`emet spec-branch ensure|integrate|status|sync|land|abandon --spec <id>` gerencia a branch da spec `spec/<id>` de `landing.unit: spec` (veja [`landing`](configuration.md#landing)). Todos imprimem JSON.

- `ensure`: cria a branch a partir do tronco (idempotente), escreve `.emet/specs/<id>/branch.json` e se recusa quando a branch de outra spec está com checkout.
- `integrate --wave <n> --branch <integration> --tickets a,b`: mescla a branch da onda em `spec/<id>` com `--no-ff` e os trailers `Emet-Wave` e `Emet-Tickets`, registra a onda, acrescenta `spec.integrate` e, quando `landing.pushSpecBranch` é true, envia a branch por push sem abrir um PR.
- `status`: imprime `branch`, `tip`, as ondas e os tickets integrados e `behindTrunk`, e reconstrói o `branch.json` a partir dos trailers quando falta uma onda.
- `sync`: mescla o tronco na branch, nunca faz rebase e, em caso de conflito, aborta, lista os caminhos e sai com código diferente de zero.
- `land [--partial]`: sincroniza e, no modo `pr`, envia a branch por push, abre um PR com uma linha `Closes` por ticket, espera suas verificações e o mescla com `landing.specMergeMethod` (um merge commit por padrão, ignorando `pr.mergeMethod`). No modo `merge`, mescla no tronco local com `--no-ff` e nunca faz push. Acrescenta `spec.land`.
- `abandon --force`: cria a tag `abandoned/spec-<id>`, apaga a branch, acrescenta `spec.abandon` e redefine os tickets integrados de um tracker local para `ready-for-agent`; sem `--force`, se recusa.

`emet tracker frontier` conta os tickets listados em `branch.json` como bloqueadores fechados, e `emet status` ganha `specBranch` (`branch`, `tip`, `integratedWaves`).

### `emet spec-merge`

`emet spec-merge --spec <id>` mescla os deltas de requisitos `ADDED`/`MODIFIED`/`REMOVED` da spec em `docs/specs/<area>.md` (`specs.dir`).

- `--deltas-dir`: imprime o diretório onde os deltas ficam.

Com `specs.enabled` ligado, o coordenador escreve os deltas e o executa uma vez por spec, na branch de integração da última onda antes da sua revisão, e depois faz o commit do resultado. Verifica todas as áreas antes de escrever qualquer coisa. Um conflito, ou um requisito que perderia um cenário, sai com 1 e deixa todos os arquivos intactos. Com `specs.enabled` desligado, não mescla nada e sai com 0.

### `emet map`

`emet map [--refresh]` escreve um resumo de uma base de código existente (stack, estrutura, convenções, testes, hotspots) em `docs/agents/codebase.md` (`map.path`), carimbado com o SHA do commit a partir do qual foi construído. O mesmo commit sempre produz o mesmo arquivo.

- `--refresh`
- `--stale`: sai com 1 quando o HEAD passou do carimbo, e o `emet preflight` avisa nesse caso.
- `--for <globs>`: imprime apenas as seções que coincidem com as superfícies de edição de um ticket; essa saída é a única parte do mapa que um brief de worker inclui.

### `emet guard`

O hook `PreToolUse` do Claude Code; lê o JSON do hook na entrada padrão (a forma do Codex está em [Host Codex](#host-codex)). O `emet self install` o conecta em `~/.claude/settings.json`. Bloqueia um punhado de gatilhos conhecidos de falhas em execuções sem supervisão (veja `emet/src/guard.ts`).

## Tracker local

Com `tracker.kind: "local"`, specs e tickets são arquivos markdown em `.scratch/` no worktree principal (sem versionamento): `.scratch/<slug>/spec.md` e `.scratch/<slug>/issues/<NN>-<slug>.md`, cada um com linhas `Status:` e `Blocked by:` e comentários em `## Comments`. O `emet init --tracker local` configura isso. Veja [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

`landing.mode` é `"pr"` (padrão) ou `"merge"`, independente do tracker. No modo `merge`, uma onda aterrissa como um merge local no tronco com `emet land`, com `commands.selfCheck` fazendo as vezes do CI e sem push. Com `landing.unit: "spec"` (padrão), a spec inteira aterrissa de uma vez por `emet spec-branch land`. O `gh` só é exigido quando o tracker é `github` ou a aterrissagem é `pr`. Veja [ADR-0010](../adr/0010-local-merge-landing.md) e [`landing`](configuration.md#landing).

### `emet tracker`

`emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close` é o tracker local sobre `.scratch/`, com JSON na saída padrão. O coordenador lê e escreve specs e tickets por meio dele.

#### `emet tracker close`

Com `tracker.kind: "github"`, `emet tracker close <ticket>... [--pr <n>]` fecha cada ticket (`CLA-<n>`, `#<n>` ou um número puro) com `gh issue close --reason completed`, verifica seu estado e informa `closed` ou `already-closed`.

- `--pr <n>`: adiciona o comentário "Landed in #<n>".

Para cada pai distinto de um ticket `closed` ou `already-closed`, lê em seguida `gh issue view <spec> --json state,subIssuesSummary`. Quando a spec está aberta e `subIssuesSummary.completed` é igual a um `total` diferente de zero, fecha a spec com `gh issue close --reason completed` e o comentário "All <total> tickets landed.", e depois a verifica.

A saída ganha `specs`, um `{ spec, outcome, detail? }` por pai distinto com outcome `closed`, `open`, `already-closed` ou `failed`. Um ticket sem pai não adiciona nenhum, e uma leitura ou um fechamento de spec que falhe nunca altera o resultado de um ticket. Sai com `1` se algum ticket ou spec falhou, depois de processar o restante. Os tickets do Linear são confirmados como Done pelo coordenador por meio do MCP do Linear.

## PRs de aterrissagem e encadeamento de ondas

Com `landing.unit: "wave"`, uma onda é um PR; com `"spec"`, um PR cobre todas as ondas integradas. Seu corpo traz uma linha `Closes #N` por ticket (a palavra-chave de fechamento do tracker), e o coordenador move os tickets para in-review ao abrir o PR. O PR é então mesclado conforme `pr.autoMerge`, ou deixado aberto quando a onda foi sinalizada, `autoMerge` é `false` ou as correções de CI se esgotaram (o PR recebe então o rótulo de decisão humana). As ondas seguintes rodam em suas próprias sessões, nunca na que rodou a onda 1. As seções `pr` e `handoff` controlam o que acontece depois; veja [`pr`](configuration.md#pr) e [`handoff`](configuration.md#handoff).

### `emet ci`

`emet ci --pr <n> --wait [--rerun-flakes] [--timeout-minutes <m>]` consulta as verificações do PR até elas terminarem ou o timeout (padrão 30) passar. Imprime `state: pass | fail | env-fault | timeout`, as verificações que falharam e `flakeReruns`, e nunca mescla.

- `--rerun-flakes`: reexecuta cada verificação que falhou uma vez com `gh run rerun --failed`; uma verificação que passa na reexecução é um Flake.
- `--timeout-minutes <m>`

Um PR sem verificações é `pass` com `noChecks: true`. Saída `0` pass, `1` fail ou env-fault, `3` timeout. `env-fault` significa verificações que terminaram em `STARTUP_FAILURE` ou ficaram na fila por tempo demais: um CI que nunca rodou, não uma falha de código.

## Host Codex

Estes comandos atendem o host de agente Codex (`agentHost` `"codex"`); veja o [guia do Codex](../how-to/use-codex.md).

### `emet dispatch`

`emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: depois de verificar a reivindicação e o slot, cria `.emet/worktrees/agent-<ticket>`, monta uma sobreposição de `CODEX_HOME` por execução e inicia o worker como um `codex exec` desacoplado.

- `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]`: bloqueia até ele terminar e imprime o status de resultado registrado.

### `emet review-run`

`emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive> [--browser-verify true|false]` executa o revisor como um `codex exec` somente leitura sobre um pacote de `emet review-package` e imprime o JSON de achados para `emet review --findings`. O nível `passive` não inicia nenhum processo.

- `--browser-verify true|false`: o padrão é `false`. Com `true`, o prompt termina com o eixo Browser, com `--session review-<run>` preenchido a partir de `--run`, para que o revisor do Codex verifique a UI como o revisor do Claude faz (passe-o quando `emet assess` imprimiu `browserVerify.run: true`; veja [`verify`](configuration.md#verify)). Sem a flag, o prompt não muda, e um valor diferente de `true` ou `false` sai com 2 com a linha de uso.
- `--coverage-out <file>`: também escreve os veredictos de Coverage do revisor do Codex em `<file>` como um array JSON (a saída padrão continua imprimindo apenas os achados); use-o no host Codex, onde roda um único revisor.

Os achados podem trazer os campos opcionais `s` e `userOption` descritos em `emet review`.

### `emet launch` no Codex

`emet launch <spec-id> --wave <n>` inicia um `codex exec` desacoplado que executa `$emet:run --dispatch <spec>` e registra seu id de thread. Nenhuma aba do Orca é aberta, e `codex exec resume <id>` continua a sessão.

### `emet guard` no Codex

Com `EMET_AGENT_HOST=codex`, o `emet guard` lê a entrada de hook do Codex, verifica os caminhos de `apply_patch` contra `.emet/surface.json` e mantém o gate de aprovação fechado até uma linha de prompt `approve <id>`.

## Gates e registros

As fases não decidem sozinhas quando um ticket está pronto, é mesclável ou vale uma nova tentativa. Elas chamam um comando da CLI que lê um registro em disco e imprime a decisão. Os registros de execução ficam em `.emet/runs/<run-id>/` e o ledger de revisão em `.emet/review/`, no checkout principal, não no worktree de um worker. Os comandos abaixo estão listados na ordem do pipeline.

### `emet validate`

Antes da aprovação: `emet validate --spec <id> | --file <plan.json>` executa a validação do plano.

- Todo `S#` é coberto por pelo menos um ticket e tem um cenário de aceitação.
- Todo ticket cobre pelo menos um `S#`.
- As superfícies de edição são disjuntas dentro de uma onda.
- Não há ciclos de dependência.
- Com [`validate.coupledSurfaces`](configuration.md#validate), um erro `coupled-surface-split` quando um ticket que toca o `source` de um par está em uma onda anterior à de um ticket que toca seus `dependents` (saída 1).
- Uma lista de tickets vazia é um erro `no-tickets` (saída 1, "plan has no tickets; write one folded ticket"), com ou sem itens `S#`. Um plano com um ticket marcado `folded: true` que cobre todo `S#` passa.

O `emet preflight` o executa de novo sobre o plano aprovado.

### `emet approve`

Aprovação: `emet approve --run <id> --spec <file>` escreve `approval.json` com os hashes da spec e da lista de tickets. O despacho se recusa se qualquer um dos dois mudar depois (`--check`).

- `--quick`: também escreve `"mode": "quick"`, o que torna a unidade de aterrissagem `wave` para essa execução. Sem ele, o campo fica ausente e registros mais antigos ainda passam em `--check`.

### `emet materialize-log`

Criação de tickets: `emet materialize-log --run <id> --record/--lookup` salva o ID de cada ticket criado assim que ele existe, para que uma execução interrompida nunca crie duplicatas.

### `emet results`

Worker concluído: `emet results --run <id> --write/--read <ticket>`. Os workers escrevem um arquivo de resultado local (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` ou `NEEDS_CONTEXT`, mais uma linha `Risk:`). Somente o coordenador escreve no tracker.

### `emet verify`

Depois de cada worker: `emet verify <ticket> --run <id>` verifica que existem commits além da linha de base do despacho, que todo caminho alterado está dentro das superfícies de edição do ticket, que a nota de handoff passa em `handoff --check` e que `commands.workerScopedSuite` passa. Revisão e merge se recusam a aceitar um ticket sem um registro de aprovação.

### `emet review-package`

Entrada da revisão: `emet review-package <base> <head> --out <file>` empacota o diff para o revisor, que o recebe como um caminho de arquivo. Sai com 3 se o intervalo está vazio ou não é descendente de base.

### `emet review`

Revisão: `emet review --ticket <t> --findings <file>` mantém o ledger de achados e aplica a ordem de triagem (`intent_gap` → `bad_plan` → `patch` → `defer`) e o limite de rodadas.

- `--base <ref>`: resolve `<ref>` para um sha na primeira rodada e o armazena; as rodadas seguintes o reutilizam, e um sha diferente sai com 2 nomeando o armazenado. Um achado em uma linha que o diff `<base>..HEAD` não adicionou nem alterou é armazenado com `preexisting: true`, e o `emet gate` não o conta como bloqueante.
- `--findings <file>`: os achados aceitam os campos opcionais `s: "S<n>"` (o requisito em questão), `userOption: "S<n>"` e `agreement: "both"` ou `"single"`. Um achado `userOption` contradiz um requisito `(user option)`: é sempre bloqueante, mesmo quando preexistente, e com `gate.onHold: fix-and-continue` ele fica em hold com `next: fix-findings`. Um `userOption` que não seja string sai com 2.
- `--coverage <file or -> [--expect S1,S3]`: armazena um array JSON de veredictos de Coverage `{s, verdict, test:{file,name}}` (`verdict`: `met`, `partial`, `unmet`) como o `coverage` do ledger, substituindo o anterior, e não usa nenhuma rodada de revisão. Abre um achado `VG-S<n>` (major, `patch`) para cada `met` cujo `test` está ausente, cujo arquivo não existe ou não contém `test.name`, e para cada S# de `--expect` sem veredicto. Um achado `VG-` só é fechado quando um `--coverage` posterior deixa de produzi-lo ou um veredicto de recheck o resolve, nunca por estar ausente de uma rodada de `--findings`. Imprime `{coverage, open}` e sai com 1 enquanto houver algum achado aberto; não executa testes.
- `--merge <a.json> <b.json>` (sem `--ticket`): imprime um único array de achados mesclado para `--findings -`. Dois achados formam um par quando compartilham `s` ou compartilham `file` com linhas a no máximo 3 de distância, e um par mantém o `id` do primeiro arquivo, a maior severidade e `agreement: "both"`. Um achado sem par recebe `agreement: "single"`, com um id em colisão do segundo arquivo prefixado com `X-`; um achado `userOption` nunca é descartado.
- `--recheck --verdicts <file>`: encerra uma rodada de correção. Somente os achados abertos quando ela começou são avaliados, um achado só se torna `resolved` por um veredicto, e o recheck conta contra `budgets.fixRounds` (saída 1 nomeando o limite quando esgotado).
- `--escalate`: passa para o próximo nível de modelo.
- `--rule` e `--rulings`: registram e listam as "Rulings I made" para o relatório e o corpo do PR.

### `emet gate`

Merge ou encadeamento: `emet gate <ticket> --tier … --ci … --integration …` imprime `merge`, `hold`, `chain`, `stop` ou `defer` como JSON com seus motivos. Lê o registro de verificação, os achados abertos, o nível de risco, o CI, a suíte de integração e os orçamentos. Um `hold` traz `next`: `fix-findings`, `rerun-failed-specs`, `rerun-ci` ou `report-infrastructure`. Veja [`gate`](configuration.md#gate).

- `--no-record`: mantém a decisão fora do journal.

Depois que as branches de uma onda são mescladas entre si, `commands.fullSuite` roda uma vez na branch de integração. Uma execução vermelha bloqueia o PR e o `autoChain`. O gate recebe o resultado como `--integration`. Para os orçamentos que o gate lê, veja [`budgets`](configuration.md#budgets).

## Códigos de saída

Os códigos de saída têm significado em todos os subcomandos.

| Código | Significado                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------- |
| `0`    | Limpo.                                                                                             |
| `1`    | Achados que exigem ação.                                                                           |
| `2`    | Erro de configuração ou de uso; a ferramenta nunca chegou a rodar. Também um comando desconhecido. |
| `3`    | Erro interno.                                                                                      |

Uma flag desconhecida também sai com `2` e nomeia a flag. Ctrl-C sai com `130`.

## Flags globais

Todo comando aceita estas; as flags próprias de cada comando são listadas por `emet <command> --help`.

| Flag         | Efeito                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `--json`     | Imprime um envelope `{ok, data, error: {code, message, fix}}` na saída padrão, também para `--help` e `--version`. |
| `--no-color` | Desativa a cor ANSI. A cor também respeita `NO_COLOR`, `FORCE_COLOR`, `TERM=dumb` e se a saída é um TTY.           |
| `--verbose`  | Imprime a stack de um erro inesperado. Sem ela, o catch de nível superior imprime um erro de uma linha.            |
| `--help`     | Imprime o uso do comando.                                                                                          |

`emet --version` imprime a versão; `emet --version --json` imprime `{"ok": true, "data": {"version": ...}, "error": null}`. Com `--json`, um comando que falha sai com seu código habitual e imprime `ok: false` com um `code` de erro entre `findings`, `usage`, `internal`, `slice-timeout`, `expired`, `bad-range` ou `exit-<n>`; o que o comando imprimiu na saída padrão é o `data` do envelope.

Em um TTY, o `emet` imprime um aviso de uma linha no stderr quando uma release mais nova é conhecida. Ele verifica no máximo uma vez por dia, guarda a resposta em cache, nunca espera pela rede e fica em silêncio com `--json` ou sem um TTY.

## Variáveis de ambiente

Variáveis voltadas ao usuário. Uma variável, quando definida, substitui o valor de configuração correspondente.

| Variável                      | Efeito                                                                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` rebaixa um bloqueio de dependência a um aviso apenas naquela execução. Defina-a no seu próprio shell, não em nada que o coordenador execute sem supervisão. |
| `EMET_MAX_LIVE_WORKERS`       | Substitui [`concurrency.maxLiveWorkers`](configuration.md#concurrency); aceita um inteiro positivo ou `auto`.                                                                                              |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | Substitui [`concurrency.runIdleThresholdMs`](configuration.md#concurrency), em milissegundos.                                                                                                              |
| `EMET_STATE_DIR`              | Diretório de estado de todo o host, que guarda o pool de slots de workers. Ordem de resolução: `$EMET_STATE_DIR`, depois `$XDG_STATE_HOME/emet`, depois `~/.local/state/emet`.                             |
| `EMET_MEM_RESERVE_GIB`        | Folga de memória em GiB que deve permanecer livre; uma aquisição é negada quando a memória disponível está abaixo dela. Padrão 8. Também alimenta o limite de workers `auto`.                              |
| `EMET_MEM_PER_WORKER_GIB`     | Memória em GiB presumida por worker quando `maxLiveWorkers` é `auto`. Padrão 2. Aumente-a para uma stack mais pesada por worker, como uma suíte E2E guiada por navegador por worktree.                     |
| `EMET_CPU_OVERSUBSCRIBE`      | Multiplicador de CPU para o limite de workers `auto`. Padrão 1.                                                                                                                                            |
| `EMET_AUTO_UPDATE`            | `EMET_AUTO_UPDATE=0` desativa `emet self update --auto`: sai com 0 sem nenhuma chamada de rede. O mesmo que `emet self update --auto off`.                                                                 |
| `EMET_AGENT_HOST`             | `codex` faz o `emet guard` ler a entrada de hook do Codex. Definida pelos hooks do Codex; deixe-a sem definir no Claude Code.                                                                              |

O limite `auto` é `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`. Os nomes legados `FORGE_*` ainda são lidos; `EMET_*` vence quando ambos estão definidos.
