---
title: Referência de configuração
description: Cada chave do emet.config.json com seu valor padrão e seu significado.
seoTitle: Referência de configuração do emet
sourceHash: 23bd286ba357cde6
---

Cada chave do `emet.config.json`, com seu valor padrão e seu significado. A fonte da verdade é [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json). Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md). Voltar ao [README](../../README.md).

O `emet init` escreve o arquivo com `$schema` definido para a URL pública `https://emet.andryore.dev/schema/emet.config.schema.json`, que o site serve idêntica byte a byte à fonte da verdade, de modo que os editores oferecem autocompletar em qualquer lugar. O `emet preflight` e o `emet doctor` o validam. Uma chave marcada como somente prosa é lida pelos prompts do `/emet` (as skills `$emet:*` no Codex), não pela CLI. Uma chave marcada como obsoleta ainda é aceita. O schema também permite uma chave de texto livre `"//"` para notas (nunca lida por nenhuma ferramenta) e `"version"`, que é sempre `1`.

## language

- `conversation` (padrão `"en"`): tag BCP 47 do idioma em que o agente responde ao usuário.
- `artifacts` (padrão `"en"`): tag BCP 47 do idioma do código, comentários, mensagens de commit, texto de PRs, tickets e documentação.

Ambas devem ser strings não vazias. Uma configuração sem seção `language` é carregada com ambas em `"en"`, e `emet init` escreve ambas. Os prompts instalados as leem.

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
- `autoChain` (padrão `false`): depois de uma onda limpa e mesclada, com mais ondas pendentes, lança a próxima em vez de imprimir `/emet:run --dispatch <spec-id>` (`$emet:run --dispatch <spec-id>` no Codex). No Claude Code o lançamento é `claude --bg`; no host Codex é um `codex exec` desacoplado, que precisa do `codex` em `codex.minVersion` ou mais recente. Os requisitos abaixo são os do Claude Code. Inspecione-a com `claude agents` ou `claude attach emet-<spec-id>-w<n>`. Requisitos:
  1. `claude` no PATH, com suporte a `--bg`.
  2. Um workspace confiável. O `--bg` roda de forma não interativa, então o diálogo de confiança nunca aparece; abra o `claude` interativamente no repositório uma vez e aceite.
  3. O aviso de bypass aceito uma vez em uma sessão interativa (`skipDangerousModePermissionPrompt`), já que a próxima onda roda em `handoff.permissionMode`, e não no modo da sessão que a lança.

  Ela só é lançada quando o PR foi mesclado e nada foi sinalizado, e é ignorada se já houver uma sessão `emet-<spec-id>-*` ativa (`claude agents --json`). Se o lançamento falhar, recorre a imprimir `/emet:run --dispatch <spec-id>`.

- `afterSpec` (padrão `"none"`, um entre `release`, `promote`, `none`): o que `/emet:run` faz quando a última onda de uma spec foi mesclada sem problemas. `promote` executa `emet promote`: um pull request de `develop` para `main` mesclado com um commit de merge assim que a CI está em `pass`, e depois um pull request de sincronização de volta apenas se `develop` estiver atrás de `main`. `release` abre o pull request de release pelos passos do skill `cut-release` e para, à espera de uma pessoa. `none` não faz nada. `emet init` o detecta (`release` com uma tag `v*` e um arquivo de workflow cujo nome contém `release`; `promote` com um branch `develop` e sem essa tag; caso contrário `none`), e `emet init --after-spec <mode>` o força. Uma configuração sem ele é carregada como `none`. `--no-promote`, passado a `/emet:run` ou a `emet promote`, faz o passo valer `none` naquela execução.

  `afterSpec` também aceita uma lista ordenada não vazia de regras, `{ "paths"?: string[], "mode": "release|promote|none" }`, de modo que um mesmo repositório possa lançar uma CLI e promover um site. O modo é escolhido a partir dos caminhos que promover `develop` levaria para `main`: vence a primeira regra cujos `paths` correspondem a todos os caminhos alterados; caso contrário, vale a regra sem `paths` (só a última regra pode omiti-lo); caso contrário, `none`. Nenhum caminho alterado também cai nessa regra de reserva. Os globs usam o comparador do guard de edição, então segmentos `[locale]` e `(group)` são literais. Os caminhos alterados vêm de `git fetch origin main develop` e `git diff --name-only --no-renames -z origin/main...origin/develop`, de modo que uma renomeação conta o caminho antigo e o novo. Eles só são lidos quando `afterSpec` é uma lista de regras ou `deploy.check.paths` está definido, e só quando `repo.trunk` é `develop`; caso contrário, a lista fica vazia. Uma falha do git faz `emet promote` sair com 1 sem abrir nada. A forma em string nunca olha os caminhos.

  ```json
  {
    "handoff": {
      "afterSpec": [
        { "paths": ["apps/site/**", "docs/**"], "mode": "promote" },
        { "mode": "release" }
      ]
    }
  }
  ```

  Aqui, uma spec que só toca o site ou a documentação é promovida, e qualquer spec que toque a CLI para em um pull request de release.

- `launcher` (padrão `auto`, um entre `auto`, `orca`, `bg`): somente Claude Code; ignorado no host Codex, onde `emet launch` não abre aba do Orca. Abre também a onda em uma aba do Orca executando `claude attach`. O `auto` consulta o runtime do Orca (`orca status`), portanto funciona também a partir de sessões `claude --bg`, que não têm `TERM_PROGRAM`; `orca` sempre tenta; `bg` nunca. A onda roda em segundo plano de qualquer forma, e uma aba que falha ao abrir nunca interrompe a cadeia. `emet launch <spec-id> --wave <n>` faz o lançamento completo; veja [`emet launch`](cli.md#runs-workers-and-slots).
- `permissionMode` (padrão `bypassPermissions`, um entre `bypassPermissions`, `auto`, `acceptEdits`): somente Claude Code; ignorado no host Codex, onde a sessão encadeada usa [`codex.sandbox`](#codex). Modo de permissão da sessão encadeada. Não é herdado da sessão que a lança, porque o classificador do modo `auto` pode negar um passo como `gh pr merge` e deixar uma onda pela metade. Suas regras `permissions.deny` continuam valendo, mas o aviso de bypass precisa ter sido aceito uma vez de forma interativa (`skipDangerousModePermissionPrompt`).

## deploy

Opcional. Se ausente, não há verificação de deploy.

```json
{
  "deploy": {
    "check": {
      "command": "curl -fsS https://example.com/health",
      "retries": 10,
      "intervalSeconds": 15,
      "timeoutSeconds": 300,
      "paths": ["apps/site/**"]
    }
  }
}
```

- `check.command`: comando de shell que termina com 0 quando o deploy está saudável.
- `check.retries`, `check.intervalSeconds`, `check.timeoutSeconds`: inteiros positivos; o máximo de tentativas, a espera entre elas e o limite de tempo total. `emet deploy-check` imprime `ok`, `failed` ou `timeout` e termina com 0, 1 ou 3.
- `check.paths` (opcional): uma lista não vazia de globs não vazios. Com ela, um promote mesclado executa a verificação apenas quando um caminho alterado corresponde; sem ela, todo promote mesclado a executa.

A verificação não depende mais de `afterSpec`. `emet promote` imprime `deployCheck: { run, reason }` e o coordenador executa `emet deploy-check` somente quando `run` é true: nunca sem um `deploy.check` nem após uma última onda que não esteja limpa; em `repo.trunk` `main`, onde todo merge faz deploy, após uma última onda limpa qualquer que seja o modo (também com `--no-promote` ou uma spec retida, e ignorando `paths`); em `develop`, somente no modo `promote` após um promote mesclado que corresponda a `paths`. No modo `release`, o deploy espera por uma pessoa.

## verify

Opcional. Ausente significa nenhuma verificação no navegador, e todo comando se comporta como antes.

```json
{
  "verify": {
    "browser": {
      "startCommand": "bun run dev",
      "url": "http://localhost:4321",
      "paths": ["apps/site/**"]
    }
  }
}
```

- `browser.startCommand`: comando de shell não vazio que inicia o servidor de desenvolvimento do app. O revisor o executa e o encerra ao terminar.
- `browser.url`: URL não vazia em que o app em execução responde.
- `browser.paths` (opcional): lista não vazia de globs não vazios. Com ele, a verificação no navegador só roda quando um caminho alterado corresponde; sem ele, todo diff revisado qualifica. Os globs usam o mesmo matcher de `deploy.check.paths`.
- Chaves desconhecidas em `verify` ou `verify.browser` são rejeitadas.

O `emet assess` imprime `browserVerify: { run, reason }`, e o coordenador só preenche o eixo Browser do revisor quando `run` é true: o nível tem revisor (não é `passive`), `verify.browser` está configurado, o binário opcional [`agent-browser`](cli.md#setup-and-audit) está no PATH e, quando `paths` está definido, um caminho alterado corresponde. Caso contrário, `reason` nomeia a primeira condição que falhou e a revisão roda como antes. Um diff somente de documentação é `passive`, então uma mudança só de conteúdo não é verificada no navegador. Um revisor cujos comandos de navegador falham duas vezes recorre ao Chrome DevTools MCP ou reporta um achado `verification-gap`; nunca bloqueia a onda.

## validate

Opcional. Ausente significa nenhuma verificação de superfícies acopladas, e todo comando se comporta como antes.

```json
{
  "validate": {
    "coupledSurfaces": [
      {
        "source": "docs/{guide,reference,how-to}/**/*.md",
        "dependents": "apps/site/src/content/translations/**"
      }
    ]
  }
}
```

- `coupledSurfaces`: uma lista não vazia de pares. Cada par tem um glob `source` e um glob `dependents`, ambos strings não vazias; `source` aceita brace globs como `docs/{guide,reference}/**/*.md`.
- Chaves desconhecidas em `validate` ou em um par são rejeitadas, e uma entrada malformada faz o carregamento falhar com uma mensagem que nomeia `validate.coupledSurfaces[<n>]`.

`emet validate` (`--file` e `--spec`) e o gate de execução do `emet preflight` reportam um erro `coupled-surface-split` quando um ticket cujas superfícies se sobrepõem ao `source` de um par está em uma onda anterior à de um ticket cujas superfícies se sobrepõem aos `dependents` desse par. As edições de uma página-fonte e os tickets que atualizam o que depende dela, como as traduções, devem ser entregues na mesma onda. A mesma onda, ou nenhum ticket de dependents, passa. Veja [ADR-0033](../adr/0033-coupled-surfaces-ship-in-one-wave.md).

## interview

- `research` (padrão `true`): com `true`, a Fase 1 de `/emet:run` faz o agente procurar a resposta no repositório, na documentação ou em fontes primárias, e explicar por que recomenda uma opção, antes de fazer uma pergunta técnica que oferece opções. O usuário continua respondendo. `false` desativa.

## gate

O que `emet gate` faz com achados bloqueantes em aberto.

```json
{ "gate": { "onHold": "fix-and-continue" } }
```

- `onHold` (padrão `fix-and-continue`): com `fix-and-continue`, achados bloqueantes em aberto respondem `hold` com `next: "fix-findings"` enquanto [`budgets.fixRounds`](#budgets) ainda tiver rodadas. O gate responde `stop` apenas quando um achado em aberto é do tipo `intent_gap`, as rodadas de correção se esgotam com achados em aberto, ou a suíte de integração falha pela segunda vez depois de suas specs com falha serem reexecutadas (uma primeira falha responde `hold` com `next: "rerun-failed-specs"`). `stop` mantém o comportamento anterior. Uma CI que nunca rodou (`--ci env-fault`) responde `hold` com `next: "rerun-ci"` sem consumir `pr.maxCiFixAttempts`, e depois `next: "report-infrastructure"` na segunda vez seguida.

## budgets

Todos opcionais.

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "fixRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts` (padrão `2`, mínimo `1`): quantas vezes um ticket pode falhar no `verify` antes de o gate responder `defer`. O ticket recebe o rótulo de adiado e o restante da onda continua. Uma falha de ambiente, como o comando de testes terminar com 126/127 ou uma queda do provedor, pausa a execução sem gastar uma tentativa.
- `reviewRounds` (padrão `2`, mínimo `1`): quantas rodadas de revisão/correção um ticket recebe antes de uma escalada para o próximo nível de modelo. O que ainda estiver em aberto depois disso recebe um parecer.
- `fixRounds` (padrão `2`): quantas rodadas de correção uma onda recebe sob [`gate.onHold`](#gate) `fix-and-continue`. Cada uma termina com `emet review --recheck` e conta aqui, nunca contra `reviewRounds`. Sem rodadas restantes e com um achado bloqueante em aberto, o gate responde `stop`. Um ledger escrito sem este campo é lido como `0` usadas.
- `stallNudgeCap` (padrão `6`, mínimo `1`): quantas vezes um worker travado é cutucado. A contagem nunca é reiniciada.

## models

Modelo e esforço por papel para o host Claude Code; o host Codex lê [`codex.models`](#codex) em vez disso. Todas as chaves são opcionais; omitir a seção mantém o worker em `sonnet`/`medium` e o revisor em `opus`/`medium`. O esforço é um entre `low`, `medium`, `high`, `xhigh`, `max`.

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

`agentHost` (padrão `"claude"`): o host do agente em que uma execução roda, `"claude"` ou `"codex"`. Veja o [guia do Codex](../how-to/use-codex.md).

## codex

Lido apenas quando `agentHost` é `"codex"`. Todas as chaves são opcionais. O esforço é um entre `low`, `medium`, `high`, `xhigh`, `max`; `ultra` nunca é aceito.

- `models.worker`, `models.workerOverride`, `models.reviewer.medium`, `models.reviewer.high`, `models.triage`: cada uma é `{ "model", "effort", "fallback" }`. `fallback` lista os slugs tentados em ordem quando `model` não está no cache de modelos do Codex. Os padrões estão em [Modelos e esforço](../how-to/choose-models.md).
- `models.session`: `{ "model", "effort", "planEffort", "fallback" }` para a sessão que executa `$emet:run`. `planEffort` vale até a primeira aprovação.
- `effort`: quando definido, substitui o esforço de todos os papéis.
- `minVersion` (padrão `0.167.0`): a versão mais antiga da CLI `codex` que o emet suporta. O `emet doctor` não compara a versão instalada com ela.
- `sandbox` (padrão `danger-full-access`): o modo de sandbox passado como `-s` por `emet dispatch`, `emet review-run` e por um `emet launch` do Codex. `workspace-write` também é aceito, mas deixa `.git` somente leitura, então os workers não conseguem fazer commit. Seja qual for o valor, `emet guard` nega `git push` no Codex, e o `config.toml` do overlay gerado contém apenas o marketplace e o plugin do emet, tabelas trusted para os diretórios da própria execução e o modelo e o esforço resolvidos (nunca as suas próprias tabelas). Veja o [guia do Codex](../how-to/use-codex.md) e o [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md).

## review

```json
{ "review": { "highRiskPaths": [], "dual": "auto" } }
```

- `highRiskPaths` (padrão `[]`): trechos de caminho adicionais, sem diferenciar maiúsculas de minúsculas, que forçam o nível de revisão `high` no `emet assess`, além do conjunto embutido (autenticação, segurança, pagamentos, webhooks, CI, o instalador, lockfiles, migrações e pontos sensíveis perigosos, como SQL bruto ou pipe-to-shell).
- `dual` (`"auto"` ou `"off"`, padrão `"auto"`; o `emet init` não o grava): controla o Dual review. Com `auto`, uma onda `high` no host Claude Code com o binário `codex` no PATH executa dois revisores em paralelo sobre o mesmo pacote, o revisor Claude e `emet review-run`. O coordenador mescla os achados deles com `emet review --merge`, faz a triagem de cada achado de um único revisor (mantê-lo ou descartá-lo com `emet review --rule`) e registra apenas os Coverage verdicts do revisor Claude. `off` executa sempre um único revisor. O `emet assess` imprime a decisão como `dualReview: { run, reason }`.

## memory

```json
{ "memory": { "enabled": "auto" } }
```

- `enabled` (`"auto"` ou `"off"`, padrão `"auto"`): controla o [`emet memory`](cli.md#runs-workers-and-slots). Com `auto`, o comando usa o Engram quando o binário `engram` está no PATH e seu handshake tem êxito. `off` faz `emet memory search` e `emet memory save` imprimirem `{available: false, reason: "memory.enabled is off"}` e saírem com 0 sem iniciar o `engram`. Qualquer outro valor falha ao carregar com `"memory.enabled" must be one of auto|off`.

## landing

- `mode` (padrão `pr`): `pr` abre um pull request (requer `gh`). `merge` mescla a branch de integração no tronco local com `emet land` e nunca faz push, com `commands.selfCheck` no lugar da CI. Independente do tracker. Veja o [ADR-0010](../adr/0010-local-merge-landing.md).
- `unit` (padrão `spec`): `spec` integra cada onda na branch `spec/<id>` com `emet spec-branch integrate` e aterrissa o spec uma única vez com `emet spec-branch land`; `wave` aterrissa cada onda sozinha, como antes. Qualquer outro valor falha ao carregar com `"landing.unit" must be one of spec|wave`. `spec` exige `worktree.baseRef: "head"` nas configurações do Claude Code (uma configuração do harness, não uma chave do emet), que `emet preflight` e `emet doctor` verificam. Veja o [ADR-0037](../adr/0037-landing-per-spec.md).
- `specMergeMethod` (padrão `merge`): como o PR do spec é mesclado: `merge`, `squash` ou `rebase`. `merge` mantém um commit de merge por onda, então uma onda pode ser revertida; `squash` e `rebase` servem para um tronco que não permite commits de merge, ao custo dessa reversão. Ele ignora `pr.mergeMethod`. `emet doctor` avisa quando as configurações do repositório ou o ruleset do tronco não permitem o método escolhido.
- `pushSpecBranch` (padrão `true`): faz push de `spec/<id>` após cada `emet spec-branch integrate`, sem abrir um PR. Defina `false` para manter a branch local até a aterrissagem final.

## tracker

Com qual issue tracker o `/emet` (ou `$emet` no Codex) conversa. A CLI lê `kind` para decidir quais verificações de dependências se aplicam; o restante documenta o adaptador que o comando `/emet` segue (veja [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md)).

- `kind` (obrigatório): `linear`, `github` ou `local`. Para `local`, veja [Tracker local](cli.md#local-tracker) e o [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
- `transitions.onStart`, `transitions.onPrOpen`, `transitions.onPrMerge`: quem escreve cada transição de estado do ticket: `worker`, `coordinator` ou `automatic` (a integração do tracker faz isso, por exemplo a integração do Linear com o GitHub ao abrir ou mesclar um PR). O coordenador nunca escreve uma transição marcada como `automatic`.
- `github.priorityLabels`: mapeia um nível de prioridade (`"1"` = P0 a mais alta até `"4"` = P3) para um nome de rótulo do GitHub, por exemplo `{"1":"P0","2":"P1"}`. Sem nenhum declarado, os tickets são ordenados por `createdAt` ascendente e o `emet doctor` avisa.
- `github.stateLabels`: mapeia um estado do fluxo de trabalho (`todo`, `in-progress`, `in-review`) para um nome de rótulo do GitHub, por exemplo `{"todo":"status:todo"}`. `done` e `canceled` são inferidos do estado fechado da issue e de `state_reason`.
- `linear`: configurações específicas do Linear (chave do time, nomes dos estados do fluxo). Lidas apenas pelo modelo que segue `docs/agents/issue-tracker.md`, nunca pela CLI.
- `local.idPrefix` (obsoleto): os ids de tickets locais agora são `<feature-slug>-<NN>`.
- `readyLabel`, `triageLabels`, `prReference` (obsoletos): modelos de rótulos e de referência ao PR, por exemplo `Closes #{number}` (github) ou `Refs: {id}` (linear).

## preflight

- `requiredFiles` (padrão nenhum): arquivos que o `emet preflight` exige na raiz do repositório antes de despachar uma onda, cada um `{ "path", "why" }`; `why` aparece na mensagem de falha. Vazio significa que a verificação não roda.
- `requiredCommands` (padrão nenhum): binários que precisam ser resolvidos no PATH antes do despacho. O `emet preflight` falha com código 1 nomeando os que não são, e o `emet doctor` os informa. É a lista do próprio repositório, separada das [verificações de dependências](dependencies.md#what-checks-what) guiadas pelo tracker; o `gh` já tem uma verificação dedicada, então listá-lo é opcional. Adições comuns: `rg` e `sg`.

## specs

- `dir` (padrão `docs/specs`): diretório, relativo ao repositório, das specs vivas, escrito por `emet spec-merge` quando `enabled` é true.
- `enabled` (padrão `false`): ativa as specs vivas. Na última onda de uma spec, o coordenador escreve os deltas de requisitos a partir dos itens S# da spec, executa `emet spec-merge` e faz o commit de `specs.dir` junto com essa onda, de modo que a atualização é revisada e entra com ela.

## map

- `path` (padrão `docs/agents/codebase.md`): caminho, relativo ao repositório, do mapa que o `emet map` gera.

## concurrency

- `waveSize` (padrão `4`, mínimo `1`): máximo de chamadas ao Agent despachadas juntas em uma onda.
- `maxLiveWorkers` (padrão `auto`): limite global compartilhado por todos os coordenadores `/emet` rodando neste host, em todos os repositórios. O pool de slots fica em `~/.local/state/emet/slots`, não em nenhum repositório específico. O `auto` deriva o limite da contagem de CPUs e da RAM do host; um inteiro positivo o fixa. Uma verificação separada de folga de memória (`EMET_MEM_RESERVE_GIB`, padrão 8 GiB) nega uma aquisição quando a memória disponível é baixa demais, independentemente desse limite. A variável de ambiente `EMET_MAX_LIVE_WORKERS` substitui este campo e também aceita `auto`.
- `runIdleThresholdMs` (padrão `5400000`, 90 minutos): por quanto tempo uma execução sem âncora viva ainda é classificada como ociosa em vez de morta, com base apenas na atualidade da transcrição. A variável de ambiente `EMET_RUN_IDLE_THRESHOLD_MS` a substitui.

Veja [Variáveis de ambiente](cli.md#environment-variables).

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

## attention

- `alert` (padrão `true`, booleano): quando uma sessão entra em `needs-decision`, o emet levanta um único alerta. Ele marca o worktree como não lido no Orca quando `orca status --json` informa um runtime acessível, caso contrário executa `notify-send` quando ele está no PATH, caso contrário não faz nada. Cada chamada tem um timeout de 3 s e uma falha nunca altera o resultado de um hook. Sair de `needs-decision` não limpa a marca de não lido do Orca. Defina `false` para desativar o alerta.

```json
{ "attention": { "alert": true } }
```

Veja [`emet fleet status`](cli.md#setup-and-audit).

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

## Variáveis de ambiente

A CLI lê estas variáveis, todas por meio de `emet/src/env.ts`. Uma variável com grafia `FORGE_` ainda funciona como alternativa ao seu nome `EMET_` e imprime um aviso uma única vez. Valores vazios contam como não definidos. `tools/env-docs.test.ts` mantém esta tabela e o código em sincronia.

| Variável                      | Alternativa legada             | Significado                                                                                                                                         |
| ----------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_MAX_LIVE_WORKERS`       | `FORGE_MAX_LIVE_WORKERS`       | Limite de workers ativos ao mesmo tempo: um número positivo ou `auto`. Substitui `concurrency.maxLiveWorkers`.                                      |
| `EMET_STATE_DIR`              | `FORGE_STATE_DIR`              | Diretório de estado de todo o host, que contém o pool de slots de workers.                                                                          |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `FORGE_SKIP_DEPENDENCY_CHECKS` | Defina como `1` para rebaixar a avisos as verificações de dependências bloqueantes no `emet preflight`.                                             |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | `FORGE_RUN_IDLE_THRESHOLD_MS`  | Milissegundos que a transcrição de uma execução pode ficar em silêncio antes de ser considerada ociosa. Substitui `concurrency.runIdleThresholdMs`. |
| `EMET_CPU_OVERSUBSCRIBE`      | `FORGE_CPU_OVERSUBSCRIBE`      | Fator de sobreassinatura de CPU para o limite automático de workers.                                                                                |
| `EMET_MEM_RESERVE_GIB`        | `FORGE_MEM_RESERVE_GIB`        | GiB de memória mantidos livres antes de conceder um slot de worker.                                                                                 |
| `EMET_MEM_PER_WORKER_GIB`     | `FORGE_MEM_PER_WORKER_GIB`     | GiB de memória presumidos por worker pelo limite automático de workers.                                                                             |
| `EMET_AGENT_HOST`             |                                | Defina como `codex` ao executar sob o host de agente Codex; qualquer outro valor significa Claude.                                                  |
| `EMET_AUTO_UPDATE`            |                                | Defina como `0` para desativar `emet self update --auto` em uma instalação standalone.                                                              |
| `EMET_RELEASE_BASE_URL`       |                                | Raiz de download de `emet self update`: os recursos são lidos de `<root>/vX.Y.Z` ou `<root>/latest`.                                                |
| `CODEX_HOME`                  |                                | O diretório home do Codex; o padrão é `~/.codex`. Apenas lido.                                                                                      |
| `XDG_STATE_HOME`              |                                | Base do diretório de estado quando `EMET_STATE_DIR` não está definida.                                                                              |
| `NO_COLOR`                    |                                | Quando definida, o banner é impresso sem cor.                                                                                                       |
| `FORCE_COLOR`                 |                                | Qualquer valor exceto vazio ou `0` força um banner colorido, mesmo sem TTY.                                                                         |
| `TERM`                        |                                | `dumb` desativa a cor do banner.                                                                                                                    |
