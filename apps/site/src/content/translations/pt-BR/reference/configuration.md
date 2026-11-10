---
title: Referência de configuração
description: Cada chave do emet.config.json com seu valor padrão e seu significado.
seoTitle: Referência de configuração do emet
sourceHash: e234cb9ad3468e98
---

Cada chave do `emet.config.json`, com seu valor padrão e seu significado. A fonte da verdade é [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json). Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md). Voltar ao [README](../../README.md).

O `emet init` escreve o arquivo. O `emet preflight` e o `emet doctor` o validam. Uma chave marcada como somente prosa é lida pelos prompts do `/emet`, não pela CLI. Uma chave marcada como obsoleta ainda é aceita. O schema também permite uma chave de texto livre `"//"` para notas (nunca lida por nenhuma ferramenta) e `"version"`, que é sempre `1`.

## pr

Como o PR de uma onda é mesclado.

```json
{ "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 } }
```

- `autoMerge` (padrão `true`): espera os checks do PR e faz o merge; sem checks, faz o merge na hora. Um check que falha é corrigido e enviado, até `maxCiFixAttempts` vezes, e depois o PR é deixado aberto para uma pessoa. Uma onda com qualquer coisa sinalizada nunca recebe merge automático.
- `mergeMethod` (padrão `squash`): `squash`, `merge` ou `rebase`, repassado ao `gh pr merge`.
- `maxCiFixAttempts` (padrão `2`, mínimo `0`): quantas vezes o coordenador pode tentar corrigir um check que falha antes de deixar o PR aberto para uma pessoa.

## handoff

O que acontece depois que uma onda se fecha, e os limites de tamanho da nota de handoff de um worker. Validado pelo `emet preflight`.

```json
{
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `maxLines` (padrão `60`): máximo de linhas que uma nota `.emet/handoff-<ticket>.md` pode ter antes de o `emet handoff --check` reprová-la.
- `maxChars` (padrão `8000`, cerca de 2k tokens): máximo de caracteres que uma nota de handoff pode ter.
- `autoChain` (padrão `false`): depois de uma onda limpa e mesclada, com mais ondas pendentes, lança a próxima com `claude --bg` em vez de imprimir `/emet:run --dispatch <spec-id>`. Inspecione-a com `claude agents` ou `claude attach emet-<spec-id>-w<n>`. Requisitos:
  1. `claude` no PATH, com suporte a `--bg`.
  2. Um workspace confiável. O `--bg` roda de forma não interativa, então o diálogo de confiança nunca aparece; abra o `claude` interativamente no repositório uma vez e aceite.
  3. O aviso de bypass aceito uma vez em uma sessão interativa (`skipDangerousModePermissionPrompt`), já que a próxima onda roda em `handoff.permissionMode`, e não no modo da sessão que a lança.

  Ela só é lançada quando o PR foi mesclado e nada foi sinalizado, e é ignorada se já houver uma sessão `emet-<spec-id>-*` ativa (`claude agents --json`). Se o lançamento falhar, recorre a imprimir `/emet:run --dispatch <spec-id>`.

- `launcher` (padrão `auto`, um entre `auto`, `orca`, `bg`): abre também a onda em uma aba do Orca executando `claude attach`. O `auto` consulta o runtime do Orca (`orca status`), portanto funciona também a partir de sessões `claude --bg`, que não têm `TERM_PROGRAM`; `orca` sempre tenta; `bg` nunca. A onda roda em segundo plano de qualquer forma, e uma aba que falha ao abrir nunca interrompe a cadeia. `emet launch <spec-id> --wave <n>` faz o lançamento completo; veja [`emet launch`](cli.md#execuções-workers-e-slots).
- `permissionMode` (padrão `bypassPermissions`, um entre `bypassPermissions`, `auto`, `acceptEdits`): modo de permissão da sessão encadeada. Não é herdado da sessão que a lança, porque o classificador do modo `auto` pode negar um passo como `gh pr merge` e deixar uma onda pela metade. Suas regras `permissions.deny` continuam valendo, mas o aviso de bypass precisa ter sido aceito uma vez de forma interativa (`skipDangerousModePermissionPrompt`).

## budgets

Todos opcionais.

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts` (padrão `2`, mínimo `1`): quantas vezes um ticket pode falhar no `verify` antes de o gate responder `defer`. O ticket recebe o rótulo de adiado e o restante da onda continua. Uma falha de ambiente, como o comando de testes terminar com 126/127 ou uma queda do provedor, pausa a execução sem gastar uma tentativa.
- `reviewRounds` (padrão `2`, mínimo `1`): quantas rodadas de revisão/correção um ticket recebe antes de uma escalada para o próximo nível de modelo. O que ainda estiver em aberto depois disso recebe um parecer.
- `stallNudgeCap` (padrão `6`, mínimo `1`): quantas vezes um worker travado é cutucado. A contagem nunca é reiniciada.

## models

Modelo e esforço por papel. Todas as chaves são opcionais; omitir a seção mantém o worker em `sonnet`/`medium` e o revisor em `opus`/`medium`. O esforço é um entre `low`, `medium`, `high`, `xhigh`, `max`.

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  }
}
```

- `worker.model` (padrão `sonnet`), `worker.effort` (padrão `medium`): o worker. A linha `Model:` de um ticket substitui `worker` apenas para aquele worker.
- `reviewer.medium` e `reviewer.high` (padrão `opus`, `medium` cada um): o revisor de cada nível de risco retornado pelo `emet assess`. Aumente `reviewer.high.effort` (por exemplo para `high`) para mais rigor em ondas arriscadas.
- `triage` (padrão `haiku`): o modelo econômico para a triagem de logs de CI e a revisão de nível passivo. Um check que falha é entregue a um agente nesse modelo, que devolve no máximo cerca de 2k tokens com ponteiros `file:line`.
- `escalation` (padrão `{ "sonnet": "opus" }`): o próximo nível de modelo por nome de modelo, usado quando um ticket atinge seu limite de correções.

## agentHost

`agentHost` (padrão `"claude"`): o host do agente em que uma execução roda, `"claude"` ou `"codex"`. Veja o [guia do Codex](../guide/codex.md).

## codex

Lido apenas quando `agentHost` é `"codex"`. Todas as chaves são opcionais. O esforço é um entre `low`, `medium`, `high`, `xhigh`, `max`; `ultra` nunca é aceito.

- `models.worker`, `models.workerOverride`, `models.reviewer.medium`, `models.reviewer.high`, `models.triage`: cada uma é `{ "model", "effort", "fallback" }`. `fallback` lista os slugs tentados em ordem quando `model` não está no cache de modelos do Codex. Os padrões estão em [Modelos e esforço](../guide/models-and-effort.md).
- `models.session`: `{ "model", "effort", "planEffort", "fallback" }` para a sessão que executa `$emet:run`. `planEffort` vale até a primeira aprovação.
- `effort`: quando definido, substitui o esforço de todos os papéis.
- `minVersion` (padrão `0.167.0`): a versão mais antiga da CLI `codex` que o `emet doctor` aceita.
- `sandbox` (padrão `danger-full-access`): o modo de sandbox passado como `-s` por `emet dispatch`, `emet review-run` e por um `emet launch` do Codex. `workspace-write` também é aceito, mas deixa `.git` somente leitura, então os workers não conseguem fazer commit. Seja qual for o valor, `emet guard` nega `git push` no Codex, e o `config.toml` do overlay gerado contém apenas o marketplace e o plugin do emet, tabelas trusted para os diretórios da própria execução e o modelo e o esforço resolvidos (nunca as suas próprias tabelas). Veja o [guia do Codex](../guide/codex.md) e o [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md).

## review

```json
{ "review": { "highRiskPaths": [] } }
```

- `highRiskPaths` (padrão `[]`): trechos de caminho adicionais, sem diferenciar maiúsculas de minúsculas, que forçam o nível de revisão `high` no `emet assess`, além do conjunto embutido (autenticação, segurança, pagamentos, webhooks, CI, o instalador, lockfiles, migrações e pontos sensíveis perigosos, como SQL bruto ou pipe-to-shell).

## landing

- `mode` (padrão `pr`): `pr` abre um pull request (requer `gh`). `merge` mescla a branch de integração no tronco local com `emet land` e nunca faz push, com `commands.selfCheck` no lugar da CI. Independente do tracker. Veja o [ADR-0010](../adr/0010-local-merge-landing.md).

## tracker

Com qual issue tracker o `/emet` conversa. A CLI lê `kind` para decidir quais verificações de dependências se aplicam; o restante documenta o adaptador que o comando `/emet` segue (veja [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md)).

- `kind` (obrigatório): `linear`, `github` ou `local`. Para `local`, veja [Tracker local](cli.md#tracker-local) e o [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
- `transitions.onStart`, `transitions.onPrOpen`, `transitions.onPrMerge`: quem escreve cada transição de estado do ticket: `worker`, `coordinator` ou `automatic` (a integração do tracker faz isso, por exemplo a integração do Linear com o GitHub ao abrir ou mesclar um PR). O coordenador nunca escreve uma transição marcada como `automatic`.
- `github.priorityLabels`: mapeia um nível de prioridade (`"1"` = P0 a mais alta até `"4"` = P3) para um nome de rótulo do GitHub, por exemplo `{"1":"P0","2":"P1"}`. Sem nenhum declarado, os tickets são ordenados por `createdAt` ascendente e o `emet doctor` avisa.
- `github.stateLabels`: mapeia um estado do fluxo de trabalho (`todo`, `in-progress`, `in-review`) para um nome de rótulo do GitHub, por exemplo `{"todo":"status:todo"}`. `done` e `canceled` são inferidos do estado fechado da issue e de `state_reason`.
- `linear`: configurações específicas do Linear (chave do time, nomes dos estados do fluxo). Lidas apenas pelo modelo que segue `docs/agents/issue-tracker.md`, nunca pela CLI.
- `local.idPrefix` (obsoleto): os ids de tickets locais agora são `<feature-slug>-<NN>`.
- `readyLabel`, `triageLabels`, `prReference` (obsoletos): modelos de rótulos e de referência ao PR, por exemplo `Closes #{number}` (github) ou `Refs: {id}` (linear).

## preflight

- `requiredFiles` (padrão nenhum): arquivos que o `emet preflight` exige na raiz do repositório antes de despachar uma onda, cada um `{ "path", "why" }`; `why` aparece na mensagem de falha. Vazio significa que a verificação não roda.
- `requiredCommands` (padrão nenhum): binários que precisam ser resolvidos no PATH antes do despacho. O `emet preflight` falha com código 1 nomeando os que não são, e o `emet doctor` os informa. É a lista do próprio repositório, separada das [verificações de dependências](dependencies.md#o-que-verifica-o-quê) guiadas pelo tracker; o `gh` já tem uma verificação dedicada, então listá-lo é opcional. Adições comuns: `rg` e `sg`.

## specs

- `dir` (padrão `docs/specs`): diretório, relativo ao repositório, das specs vivas, escrito por `emet spec-merge`.

## map

- `path` (padrão `docs/agents/codebase.md`): caminho, relativo ao repositório, do mapa que o `emet map` gera.

## concurrency

- `waveSize` (padrão `4`, mínimo `1`): máximo de chamadas ao Agent despachadas juntas em uma onda.
- `maxLiveWorkers` (padrão `auto`): limite global compartilhado por todos os coordenadores `/emet` rodando neste host, em todos os repositórios. O pool de slots fica em `~/.local/state/emet/slots`, não em nenhum repositório específico. O `auto` deriva o limite da contagem de CPUs e da RAM do host; um inteiro positivo o fixa. Uma verificação separada de folga de memória (`EMET_MEM_RESERVE_GIB`, padrão 8 GiB) nega uma aquisição quando a memória disponível é baixa demais, independentemente desse limite. A variável de ambiente `EMET_MAX_LIVE_WORKERS` substitui este campo e também aceita `auto`.
- `runIdleThresholdMs` (padrão `5400000`, 90 minutos): por quanto tempo uma execução sem âncora viva ainda é classificada como ociosa em vez de morta, com base apenas na atualidade da transcrição. A variável de ambiente `EMET_RUN_IDLE_THRESHOLD_MS` a substitui.

Veja [Variáveis de ambiente](cli.md#variáveis-de-ambiente).

## ticket

- `idPattern`: fonte de uma regex ancorada que o id de um ticket deve cumprir, por exemplo `^PROJ-\d+$`. Um padrão inválido é um erro de configuração grave.
- `branchPrefix`: prefixo em minúsculas (`^[a-z0-9-]+$`) para a branch local de um worker. As branches são `<branchPrefix>-<number>-<slug>`, e o `cleanup` varre o glob `<branchPrefix>-*`.
- `idExample` (obsoleto, somente prosa): um id de exemplo que cumpre `idPattern`.
- `branchPattern` (obsoleto, somente prosa): modelo completo do nome da branch.

## commands

Todos somente prosa.

- `selfCheck`: comandos que um worker executa antes de considerar sua mudança pronta, por exemplo `["npm run check"]`. Com `landing.mode` em `merge`, faz as vezes da CI.
- `workerScopedSuite`: comando que um worker executa para testar apenas a área que tocou. O `emet verify` exige que passe.
- `fullSuite.run`: comando da suíte de todo o repositório, executado uma vez na branch de integração depois que as branches de uma onda são mescladas. Uma execução vermelha bloqueia o PR e o `autoChain`.
- `fullSuite.singleton`: `true` se apenas um worktree pode executar a suíte por vez.
- `fullSuite.runInBackground`, `fullSuite.reset` (obsoletos): flag de segundo plano e comandos de redefinição de estado.

## worktree

- `lockReason`: modelo do motivo do `git worktree lock` que um worker escreve no bootstrap, preenchido por `emet lock-reason`. O padrão é `emet run={runId} ticket={ticket} anchor={anchorPid} slug={coordinatorSlug} at={iso}`. Substitua somente para acrescentar campos: o `emet lock-reason` recusa um modelo que omita o token literal `emet`, ou qualquer um de `run=`, `ticket=`, `anchor=`, `at=` ou `slug=`.
- `copyFromMain` (somente prosa): caminhos copiados do checkout do tronco para um worktree novo antes do bootstrap, por exemplo arquivos de ambiente não versionados.
- `bootstrap` (somente prosa): comandos de shell executados uma vez em um worktree novo antes de um worker começar, por exemplo `["npm ci"]`. Executados pela fase 6 do `/emet`, nunca pela CLI.
- `stateDir` (obsoleto, somente prosa): diretório para os logs locais da execução, por exemplo `.emet`.

## usage

- `oversizedReadLines` (padrão `400`, mínimo `1`): um Read sem offset nem limite sobre um arquivo com mais do que essa quantidade de linhas conta como superdimensionado no `emet usage`.
- `stalledMinutes` (padrão `10`, mínimo `1`): limite `--minutes` padrão do `emet usage --stalled`.

## sizing

- `inlineMaxLines` (padrão `100`, mínimo `1`): o maior corpo de ticket, em linhas, mantido inline no prompt de um worker.

## schema

Somente prosa. A propriedade do schema de dados deste repositório, usada pela regra de evitação de conflitos da fase 3 ao dividir tickets. Vazio ou omitido ignora a regra.

- `ownedPaths`: caminhos que definem o schema compartilhado, por exemplo `["prisma/schema.prisma"]`. No máximo um worker por onda pode tocá-los.
- `sharedDatabase` (obsoleto): `true` se os workers compartilham um mesmo banco de dados físico.

## commit

Somente prosa.

- `trailer`: chave do trailer do git que um worker acrescenta aos commits que referenciam o ticket, por exemplo `Refs`.
- `trailerPosition`: `body` ou `footer`.

## repo

- `trunk`: a branch para a qual as mudanças de todos os workers são mescladas, e a base de toda comparação de git de cleanup e preflight, por exemplo `main`.
- `remote` (padrão `origin`): o remoto do git em que `trunk` está.
- `integrationBranch` (obsoleto, somente prosa): branch opcional de longa duração na qual uma onda se integra antes do tronco.
- `commitTypes` (obsoleto, somente prosa): tipos de Conventional Commit permitidos para os commits dos workers.

## design

Opcional, somente prosa. `null` ou omitido ignora a etapa de design/revisão de UI.

- `canvasIndex` (obsoleto): caminho para um arquivo de canvas de design que os workers consultam antes de mudanças de UI.
