---
title: Referência da CLI
description: Cada subcomando do emet, a tabela de gates e registros, os códigos de saída e as variáveis de ambiente.
seoTitle: Referência da CLI do emet
sourceHash: 8bb02104970da0a8
---

Cada subcomando do `emet`, a tabela de gates e registros, os códigos de saída e as variáveis de ambiente. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md). Voltar ao [README](../../README.md). Todo comando imprime seu uso com `--help`.

## Subcomandos

Três comandos de barra envolvem a CLI dentro do Claude Code: `/emet:run` (o pipeline), `/emet:init` (`emet init`) e `/emet:doctor` (`emet doctor .`). Um `emet` em um terminal comum exige o `install.sh`; caso contrário, execute `! emet <subcommand>` dentro de uma sessão.

`emet <command> [...args]`. `emet --version` imprime a versão.

### Configuração e auditoria

- `emet migrate [--dry-run]`: renomeia um repositório legado para os nomes do emet.
- `emet init [--tracker linear|github|local] [--force]`: detecta automaticamente o gerenciador de pacotes, a branch tronco e o tipo de tracker, e escreve o `emet.config.json` e os arquivos `docs/agents/*.md`. `--tracker local` configura o tracker local.
- `emet doctor [--all] [<path> ...]`: auditoria somente leitura de quantos repositórios você quiser de uma só vez; por padrão, o diretório atual.
- `emet preflight [--run <id>] [--post-dispatch]`: confirma que o repositório está pronto para despachar.
- `emet skill-path <name>`: imprime o caminho absoluto do `SKILL.md` de uma skill do mattpocock-skills. Termina com código 1 se a skill não for encontrada.
- `emet selftest`: executa os testes unitários da própria CLI. Somente em instalações a partir do código-fonte; um binário compilado termina com código 1 e manda você executar `emet doctor`.

Em qualquer repositório git:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

O `emet init` deixa um marcador `TODO(emet):` nos arquivos `docs/agents/*.md` gerados para tudo o que ele não consegue inferir sozinho (um lock compartilhado do banco de dados de testes, a propriedade do schema e assim por diante). Preencha-os; o `emet preflight` se recusa a despachar enquanto restar algum.

Depois, dentro do Claude Code:

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

#### Verificação de frota

O `emet doctor` audita vários repositórios de uma só vez, somente leitura:

```bash
emet doctor ~/code/*
```

Informa, por repositório: um `emet.config.json` válido, os quatro arquivos `docs/agents/*.md` presentes, zero marcadores `TODO(emet):` restantes, se os comandos de `commands.selfCheck` realmente são resolvidos e os achados de dependências específicos do tracker daquele repositório (`gh`, Linear; veja [dependências](dependencies.md#o-que-verifica-o-quê)). O plugin mattpocock-skills e as flags das CLIs externas (`gh`, `claude --bg`, `claude agents --json`, verificadas via `--help`) são checados uma única vez para toda a varredura, não por repositório.

### Execuções, workers e slots

- `emet claims --reserve <ticket> --run <id> --anchor <pid>`: reserva um ticket para uma execução. `--release <ticket>`, `--list` e `--prune [--dry-run]` liberam uma reivindicação, listam as reivindicações ou removem as obsoletas.
- `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`: pega um slot de worker do pool de todo o host em `~/.local/state/emet/slots`. `--release --run <id>`, `--release-index <index>` e `--list` liberam slots ou os listam.
- `emet cleanup [--run <id> | --all] [--dry-run] [--force]`: sem argumentos, recupera execuções encerradas ou mortas cujo trabalho já aterrissou; `--run` limpa esta execução; `--all` é uma varredura de branches em todo o repositório. Depois de um merge, `emet cleanup --run <runId>` libera as branches, as reivindicações de tickets e os slots de workers da onda.
- `emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]`: imprime o motivo do `git worktree lock` que um worker escreve no bootstrap.
- `emet launch <spec-id> --wave <n>`: inicia uma onda como uma sessão `claude --bg` e abre sua aba do Orca conforme `handoff.launcher`. Faz o lançamento completo (verificação de sessão duplicada, `claude --bg`, aba) e imprime `{ name, id, attach, orcaTab: { opened, reason } }`. Use-o, e não um `claude --bg` solto, sempre que quiser uma onda em outra sessão manualmente.
- `emet status [--spec <id>]`: Working / Checking / Ready / Needs-decision por onda como JSON mais uma linha de resumo. `emet status --help` documenta o JSON.
- `emet usage [--session <id> | --file <path>] [--stalled [--minutes N]] [--project-dir <path>]`: informa o uso da sessão; `--stalled` lista workers travados.
- `emet handoff --check <path> | --render <path>`: valida ou renderiza a nota `.emet/handoff-<ticket>.md` de um worker.
- `emet metrics [--run <id>]`: informa tokens, custo equivalente em API e tempo de relógio por ticket, por onda e por execução, lidos das transcrições de sessão. Também compara o orçamento de contexto estimado por ticket com o que cada worker realmente usou. Seu resumo vai no final do relatório final da execução.

### Planejamento, revisão e aterrissagem

- `emet validate --spec <id> | --file <path>`: validação do plano; veja [Gates e registros](#gates-e-registros).
- `emet surfaces --check <file.json | ->`: rejeita globs de superfícies permitidas que se sobreponham entre os tickets de uma onda.
- `emet approve --run <id>`, `emet materialize-log`, `emet results`, `emet verify`, `emet review-package`, `emet review`, `emet gate`: veja [Gates e registros](#gates-e-registros).
- `emet assess --base <ref> --head <ref>`: classifica um diff como `passive`, `medium` ou `high` e imprime JSON com o nível, os motivos e o modelo e esforço recomendados para o revisor. Veja [Models & effort](../../README.md#models--effort) e [`review`](configuration.md#review).
- `emet land --spec <s> --branch <integration> --tickets <id,...>`: mescla uma branch de integração no tronco local (`landing.mode` `merge`). `commands.selfCheck` faz as vezes da CI e nada é enviado com push.
- `emet spec-merge --spec <id>`: depois que uma onda recebe merge automático, mescla os deltas de requisitos `ADDED`/`MODIFIED`/`REMOVED` da spec em `docs/specs/<area>.md` (`specs.dir`). Verifica todas as áreas antes de escrever qualquer coisa. Um conflito, ou um requisito que perderia um cenário, termina com código 1 e deixa todos os arquivos intactos.
- `emet map [--refresh]`: escreve um resumo de uma base de código existente (stack, estrutura, convenções, testes, pontos quentes) em `docs/agents/codebase.md` (`map.path`), carimbado com o SHA do commit a partir do qual foi gerado. O mesmo commit sempre produz o mesmo arquivo. `emet map --stale` termina com código 1 quando o HEAD passou do carimbo, e o `emet preflight` avisa nesse caso. `emet map --for <globs>` imprime apenas as seções que correspondem às superfícies de edição de um ticket; essa saída é a única parte do mapa que o brief de um worker inclui.
- `emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close`: o tracker local sobre `.scratch/`, JSON no stdout. Veja [Tracker local](#tracker-local).
- `emet guard`: o hook `PreToolUse` do Claude Code; lê o JSON do hook no stdin. O `install.sh` o conecta em `~/.claude/settings.json`. Bloqueia um punhado de gatilhos conhecidos de falhas em execuções sem supervisão (veja `emet/src/guard.ts`).

### Tracker local

Com `tracker.kind: "local"`, specs e tickets são arquivos markdown em `.scratch/` do worktree principal (sem versionamento): `.scratch/<slug>/spec.md` e `.scratch/<slug>/issues/<NN>-<slug>.md`, cada um com linhas `Status:` e `Blocked by:` e comentários em `## Comments`. O coordenador os lê e escreve por meio de `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` configura isso. Veja o [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

`landing.mode` é `"pr"` (padrão) ou `"merge"`, independente do tracker. No modo `merge`, uma onda aterrissa como um único merge local no tronco com `emet land`, com `commands.selfCheck` no lugar da CI e sem push. O `gh` só é obrigatório quando o tracker é `github` ou a aterrissagem é `pr`. Veja o [ADR-0010](../adr/0010-local-merge-landing.md) e [`landing`](configuration.md#landing).

### PRs de aterrissagem e encadeamento de ondas

Uma onda é um PR. Seu corpo traz `Closes #N` para cada ticket (a palavra-chave de fechamento do tracker), e o coordenador move os tickets para em revisão ao abrir o PR. Em seguida o PR é mesclado conforme `pr.autoMerge`, ou deixado aberto quando a onda foi sinalizada, `autoMerge` é `false` ou as correções de CI se esgotaram (o PR então recebe o rótulo de decisão humana). As ondas seguintes rodam em suas próprias sessões, nunca na que executou a onda 1. As seções `pr` e `handoff` controlam o que acontece em seguida; veja [`pr`](configuration.md#pr) e [`handoff`](configuration.md#handoff).

### Host Codex

Estes comandos atendem o host de agente Codex (`agentHost` `"codex"`); veja o [guia do Codex](../guide/codex.md).

- `emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: depois de verificar a reserva e o slot, cria `.emet/worktrees/agent-<ticket>`, monta uma camada `CODEX_HOME` por execução e inicia o worker como um `codex exec` desacoplado. `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]` espera o término e imprime o status de resultado registrado.
- `emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive>`: executa o revisor como um `codex exec` somente leitura sobre um pacote do `emet review-package` e imprime o JSON de achados para `emet review --findings`. O nível `passive` não inicia nenhum processo.
- `emet launch <spec-id> --wave <n>`: neste host, inicia um `codex exec` desacoplado que executa `$emet:run --dispatch <spec>` e registra seu id de thread. Nenhuma aba do Orca é aberta, e `codex exec resume <id>` continua a sessão.
- `emet guard`: com `EMET_AGENT_HOST=codex` lê a entrada de hooks do Codex, confere os caminhos de `apply_patch` contra `.emet/surface.json` e mantém o portão de aprovação fechado até uma linha de prompt `approve <id>`.

## Gates e registros

As fases não decidem sozinhas quando um ticket está pronto, é mesclável ou vale a pena tentar de novo. Elas chamam um comando da CLI que lê um registro em disco e imprime a decisão. Os registros de execução ficam em `.emet/runs/<run-id>/` e o livro de revisão em `.emet/review/`, no checkout principal, não no worktree de um worker.

| Etapa                 | Comando                                              | O que faz cumprir                                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Antes da aprovação    | `emet validate --file <plan.json>`                   | Cada `S#` é coberto por pelo menos um ticket e tem um cenário de aceitação. Cada ticket cobre pelo menos um `S#`. As superfícies de edição são disjuntas dentro de uma onda. Não há ciclos de dependência. O `emet preflight` executa isso de novo sobre o plano aprovado.                |
| Aprovação             | `emet approve --run <id> --spec <file>`              | Escreve `approval.json` com os hashes da spec e da lista de tickets. O despacho se recusa se algum deles mudar depois (`--check`).                                                                                                                                                        |
| Criação de tickets    | `emet materialize-log --run <id> --record/--lookup`  | Salva o ID de cada ticket criado assim que ele existe, de modo que uma execução interrompida nunca cria duplicatas.                                                                                                                                                                       |
| Worker concluído      | `emet results --run <id> --write/--read <ticket>`    | Os workers escrevem um arquivo de resultado local (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` ou `NEEDS_CONTEXT`, mais uma linha `Risk:`). Somente o coordenador escreve no tracker.                                                                                                         |
| Após cada worker      | `emet verify <ticket> --run <id>`                    | Verifica se existem commits além da base do despacho, se cada caminho alterado está dentro das superfícies de edição do ticket, se a nota de handoff passa em `handoff --check` e se `commands.workerScopedSuite` passa. A revisão e o merge recusam um ticket sem registro de aprovação. |
| Entrada da revisão    | `emet review-package <base> <head> --out <file>`     | Empacota o diff para o revisor, que o recebe como um caminho de arquivo. Termina com código 3 se o intervalo estiver vazio ou não for descendente da base.                                                                                                                                |
| Revisão               | `emet review --ticket <t> --findings <file>`         | Mantém o livro de achados e faz cumprir a ordem de triagem (`intent_gap` → `bad_plan` → `patch` → `defer`) e o limite de rodadas. `--escalate` passa para o próximo nível de modelo. `--rule`/`--rulings` registram e listam os "Rulings I made" para o relatório e o corpo do PR.        |
| Merge ou encadeamento | `emet gate <ticket> --tier … --ci … --integration …` | Imprime `merge`, `hold`, `chain`, `stop` ou `defer` como JSON com seus motivos. Lê o registro de verify, os achados em aberto, o nível de risco, a CI, a suíte de integração e os orçamentos.                                                                                             |

Depois que as branches de uma onda são mescladas, `commands.fullSuite` roda uma vez na branch de integração. Uma execução vermelha bloqueia o PR e o `autoChain`. O gate recebe o resultado como `--integration`. Para os orçamentos que o gate lê, veja [`budgets`](configuration.md#budgets).

## Códigos de saída

Os códigos de saída têm o mesmo significado em todos os subcomandos.

| Código | Significado                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------- |
| `0`    | Limpo.                                                                                                |
| `1`    | Achados sobre os quais agir.                                                                          |
| `2`    | Erro de configuração ou de uso; a ferramenta nunca chegou a executar. Também um comando desconhecido. |
| `3`    | Erro interno.                                                                                         |

## Variáveis de ambiente

Variáveis voltadas ao usuário. Uma variável, quando definida, substitui o valor de configuração correspondente.

| Variável                      | Efeito                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` rebaixa um bloqueio por dependências a um aviso apenas naquela execução. Defina-a no seu próprio shell, não em nada que o coordenador execute sem supervisão. |
| `EMET_MAX_LIVE_WORKERS`       | Substitui [`concurrency.maxLiveWorkers`](configuration.md#concurrency); aceita um inteiro positivo ou `auto`.                                                                                                |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | Substitui [`concurrency.runIdleThresholdMs`](configuration.md#concurrency), em milissegundos.                                                                                                                |
| `EMET_STATE_DIR`              | Diretório de estado de todo o host, que guarda o pool de slots de workers. Ordem de resolução: `$EMET_STATE_DIR`, depois `$XDG_STATE_HOME/emet`, depois `~/.local/state/emet`.                               |
| `EMET_MEM_RESERVE_GIB`        | Folga de memória em GiB que deve continuar livre; uma aquisição é negada quando a memória disponível está abaixo disso. Padrão 8. Também alimenta o limite `auto` de workers.                                |
| `EMET_MEM_PER_WORKER_GIB`     | Memória em GiB presumida por worker quando `maxLiveWorkers` é `auto`. Padrão 2. Aumente para um stack mais pesado por worker, como uma suíte E2E com navegador por worktree.                                 |
| `EMET_CPU_OVERSUBSCRIBE`      | Multiplicador de CPU para o limite `auto` de workers. Padrão 1.                                                                                                                                              |
| `EMET_AGENT_HOST`             | `codex` faz o `emet guard` ler a entrada de hooks do Codex. É definida pelos hooks do Codex; deixe sem definir no Claude Code.                                                                               |

O limite `auto` é `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`. Os nomes legados `FORGE_*` ainda são lidos; `EMET_*` vence quando ambos estão definidos.
