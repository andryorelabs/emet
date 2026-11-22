---
title: Trackers e aterrissagem
description: Onde ficam os tickets, como uma onda aterrissa como pull request ou merge local, e como as ondas se encadeiam.
seoTitle: Trackers e aterrissagem no emet
sourceHash: 1ebd20e303a5c747
---

Onde ficam os tickets, como uma onda aterrissa e como as ondas se encadeiam. Toda chave citada aqui está na [referência de configuração](../reference/configuration.md); todo subcomando está na [referência da CLI](../reference/cli.md).

<img src="../brand/mascot/mascot-work.svg" alt="mascote do emet, trabalhando" width="96" align="right">

## Trackers

O emet funciona com Linear, GitHub Issues ou arquivos locais, definidos por `tracker.kind`. O `gh` é obrigatório para o tracker `github`. Um servidor MCP do Linear precisa ser declarado em `.mcp.json` (ou no escopo de usuário) para o tracker `linear`; veja a [referência de dependências](../reference/dependencies.md).

### Tracker local

Com `tracker.kind: "local"`, specs e tickets são arquivos markdown em `.scratch/` do worktree principal (sem versionamento): `.scratch/<slug>/spec.md` e `.scratch/<slug>/issues/<NN>-<slug>.md`, cada um com linhas `Status:` e `Blocked by:` e comentários em `## Comments`. O coordenador os lê e escreve por meio de `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` configura isso. Veja o [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

## Aterrissagem

`landing.mode` é `"pr"` (padrão) ou `"merge"`, independente do tracker. No modo `merge`, uma onda aterrissa como um único merge local no tronco com `emet land`, com `commands.selfCheck` no lugar da CI e sem push. O `gh` só é obrigatório quando o tracker é `github` ou a aterrissagem é `pr`. Veja o [ADR-0010](../adr/0010-local-merge-landing.md).

`landing.unit` define o que aterrissa como uma unidade: `"spec"` (padrão) aterrissa o spec inteiro de uma vez, `"wave"` mantém a regra anterior em que cada onda aterrissa sozinha. Veja o [ADR-0037](../adr/0037-landing-per-spec.md), que substitui o [ADR-0004](../adr/0004-one-wave-one-dependency-layer-one-pr.md).

### Branch do spec

Com `landing.unit: "spec"`, o coordenador cria `spec/<id>` a partir do tronco com `emet spec-branch ensure --spec <id>`. Depois que uma onda passa na revisão e em `commands.selfCheck`, `emet spec-branch integrate` mescla a branch da onda em `spec/<id>` com `--no-ff` e um commit que carrega os trailers `Emet-Wave` e `Emet-Tickets`. Um ticket cuja branch está em `spec/<id>` está **Integrado**, não **Aterrissado**: conta como bloqueador fechado na fronteira da próxima onda, mas o tracker o mantém aberto até a aterrissagem final. As ondas seguintes partem da ponta de `spec/<id>`, então nenhuma onda espera pela CI de um PR.

`emet spec-branch sync` mescla o tronco em `spec/<id>` e nunca faz rebase; em caso de conflito, aborta, deixa a branch intacta e sai com código diferente de zero. `emet spec-branch land` executa o sync e depois aterrissa a branch uma única vez. No modo `pr`, faz push de `spec/<id>`, abre um PR com uma linha `Closes #N` por ticket de cada onda integrada, espera os checks dele e o mescla com `landing.specMergeMethod` (um commit de merge por padrão, ignorando `pr.mergeMethod`). No modo `merge`, mescla `spec/<id>` no tronco local com `--no-ff` e nunca faz push. `--partial` aterrissa apenas as ondas integradas até o momento. `emet spec-branch abandon --spec <id> --force` marca a branch com a tag `abandoned/spec-<id>`, a exclui e volta os tickets integrados de um tracker local para `ready-for-agent`.

O modo spec exige `worktree.baseRef: "head"` nas configurações do Claude Code para que os worktrees dos workers partam da branch do spec; `emet preflight` e `emet doctor` verificam isso. `emet doctor` também avisa quando o modo é `pr` e as configurações do repositório ou o ruleset do tronco não permitem o `landing.specMergeMethod` configurado.

### PRs de aterrissagem

Com `landing.unit: "spec"`, o PR é o do spec: um único PR para todas as ondas integradas, aberto por `emet spec-branch land` depois da última onda. Com `landing.unit: "wave"`, uma onda é um PR. O corpo traz uma linha `Closes #N` para cada ticket (a palavra-chave de fechamento do tracker), e o coordenador move os tickets para em revisão ao abrir o PR. Em seguida o PR é mesclado conforme `pr.autoMerge`, ou deixado aberto quando a onda foi sinalizada, `autoMerge` é `false` ou as correções de CI se esgotaram (o PR então recebe o rótulo de decisão humana). Depois de um merge, `emet tracker close` fecha os tickets em um tracker do GitHub, e `emet cleanup --run <runId>` libera as branches, as reivindicações de tickets e os slots de workers da onda. Ele também exclui cada branch local cujo PR foi mesclado no commit da ponta da branch, incluindo a branch de integração.

Depois que as branches de uma onda são mescladas, `commands.fullSuite` roda uma vez na branch de integração. Uma execução vermelha bloqueia o PR e o `autoChain`. O gate recebe o resultado como `--integration`. Em uma onda não final de uma aterrissagem de spec, o coordenador passa `--ci` a partir de `commands.selfCheck`, e somente a aterrissagem final espera pela CI com `emet ci --wait`; o gate então responde `chain` enquanto restarem ondas.

### Quick run

`/emet:run --quick <solicitação>` é o caminho curto para uma mudança pequena de um único ticket, como um erro de digitação ou uma correção de uma linha. Use-o quando a mudança não toca nenhuma tela e cabe em um ticket: superfície nova dentro de `sizing.inlineMaxLines` e sem alarme de orçamento de contexto.

Ele pula a entrevista e o planejamento longos: uma rodada de `grilling`, sem `domain-modeling`, sem canvas e sem rodadas de fronteira. O spec contém um ticket `folded` que cobre todos os `S#`, e você dá uma única aprovação. Depois roda um worker em um worktree, seguido de `emet verify`, a etapa de living specs quando `specs.enabled`, `emet assess --quick`, o revisor, a menos que o nível seja `passive`, e `emet gate`. Não há `emet chain`.

Uma **Quick run** tem uma única **onda**, então sempre aterrissa por onda, como PR ou como merge local, seja qual for o `landing.unit`: `emet approve --quick` registra `mode: "quick"`, e nenhuma branch de spec é criada ou esperada.

Um diff de alto risco a interrompe. `emet assess --quick` sai com código 1 quando o nível é `high`; o Gate trata isso como um **Stop**: nada é mesclado automaticamente, o PR continua aberto e o relatório final nomeia os motivos do alto risco.

Antes da aprovação, a execução para e recomenda `/emet:run` sem `--quick` quando a mudança toca uma tela ou não cabe em um ticket. `--quick` não pode ser combinado com `--draft` nem com `--dispatch`; `--no-promote` é aceito.

### Encadeando ondas

As ondas seguintes rodam em suas próprias sessões, nunca na que executou a onda 1. Duas seções opcionais do `emet.config.json` controlam o que acontece em seguida (ambas validadas pelo `emet preflight`):

```json
{
  "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 },
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `pr.autoMerge` (padrão `true`): espera os checks do PR e faz o merge; sem checks, faz o merge na hora. Um check que falha é corrigido e enviado, até `maxCiFixAttempts` vezes, e depois o PR é deixado aberto para uma pessoa. Uma onda com qualquer coisa sinalizada nunca recebe merge automático.
- `handoff.autoChain` (padrão `false`): depois de uma onda limpa e mesclada, com mais ondas pendentes, lança a próxima com `claude --bg` em vez de imprimir `/emet:run --dispatch <spec-id>`. Inspecione-a com `claude agents` / `claude attach emet-<spec-id>-w<n>`. Requisitos no Claude Code:
  1. `claude` no PATH, com suporte a `--bg`.
  2. Um workspace confiável. O `--bg` roda de forma não interativa, então o diálogo de confiança nunca aparece; abra o `claude` interativamente no repositório uma vez e aceite.
  3. O aviso de bypass aceito uma vez em uma sessão interativa (`skipDangerousModePermissionPrompt`), já que a próxima onda roda em `handoff.permissionMode` (abaixo), e não no modo da sessão que a lança.

  No host Codex, a próxima onda começa como um `codex exec` desacoplado (veja `handoff.launcher` abaixo), então o requisito é `codex` no PATH em `codex.minVersion` ou mais recente, com `--json` e `--output-schema` no `codex exec`; o `emet doctor` verifica as flags, não o número da versão. O diálogo de confiança e o aviso de bypass do Claude não se aplicam. Se o Codex precisa de um workspace confiável para uma execução desacoplada é algo não verificado na documentação deste repositório.

  Ela só é lançada quando o PR foi mesclado e nada foi sinalizado, e é ignorada se já houver uma sessão `emet-<spec-id>-*` ativa (`claude agents --json`). Se o lançamento falhar, recorre a imprimir `/emet:run --dispatch <spec-id>`.

- `handoff.launcher` (padrão `auto`): abre também a onda em uma aba do Orca executando `claude attach`. O `auto` consulta o runtime do Orca (`orca status`), portanto funciona também a partir de sessões `claude --bg`, que não têm `TERM_PROGRAM`; `orca` sempre tenta, `bg` nunca. O `launcher` se aplica apenas ao host Claude Code; no Codex, `emet launch` sempre se comporta como `bg`. A onda roda em segundo plano de qualquer forma, e uma aba que falha ao abrir nunca interrompe a cadeia.

  `emet launch <spec-id> --wave <n>` faz o lançamento completo (verificação de sessão duplicada, `claude --bg`, aba) e imprime `{ name, id, attach, orcaTab: { opened, reason } }`. Use-o, e não um `claude --bg` solto, sempre que quiser uma onda em outra sessão manualmente.

  No host de agente Codex, `emet launch` inicia um `codex exec` desacoplado que executa `$emet:run --dispatch <spec-id>` e registra o id da thread dele. Não abre aba do Orca, e `codex exec resume <id>` continua a sessão. Veja a [referência da CLI](../reference/cli.md#host-codex) e [Executando o emet no Codex](codex.md).

- `handoff.permissionMode` (padrão `bypassPermissions`): somente Claude Code; modo de permissão da sessão encadeada. No host Codex ele é ignorado e a sessão encadeada usa `codex.sandbox` (padrão `danger-full-access`; veja [Executando o emet no Codex](codex.md)). Não é herdado da sessão que a lança, porque o classificador do modo `auto` pode negar um passo como `gh pr merge` e deixar uma onda pela metade. Suas regras `permissions.deny` continuam valendo, mas o aviso de bypass precisa ter sido aceito uma vez de forma interativa (`skipDangerousModePermissionPrompt`).

## Gates, orçamentos e registros

As fases não decidem sozinhas quando um ticket está pronto, é mesclável ou vale a pena tentar de novo. Elas chamam um comando da CLI que lê um registro em disco e imprime a decisão. Os registros de execução ficam em `.emet/runs/<run-id>/` e o livro de revisão em `.emet/review/`, no checkout principal, não no worktree de um worker. Todo comando imprime seu uso com `--help`. A tabela de comandos e o que cada um faz cumprir está em [Gates e registros](../reference/cli.md#gates-e-registros).

**Orçamentos** (`emet.config.json`, todos opcionais):

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts`: quantas vezes um ticket pode falhar no `verify` antes de o gate responder `defer`. O ticket recebe o rótulo de adiado e o restante da onda continua. Uma falha de ambiente, como o comando de testes terminar com 126/127 ou uma queda do provedor, pausa a execução sem gastar uma tentativa.
- `reviewRounds`: quantas rodadas de revisão/correção um ticket recebe antes de uma escalada para o próximo nível de modelo. O que ainda estiver em aberto depois disso recebe um parecer.
- `stallNudgeCap`: quantas vezes um worker travado é cutucado. A contagem nunca é reiniciada.

## Specs vivas, mapa e métricas

**Specs vivas.** Ative com `specs.enabled`. Na última onda de uma spec, antes da sua revisão, o coordenador escreve os deltas de requisitos da spec, executa `emet spec-merge --spec <id>` uma vez para mesclá-los em `docs/specs/<area>.md` (`specs.dir`) e faz o commit do resultado, que assim é revisado e entra no mesmo PR. Ele verifica todas as áreas antes de escrever qualquer coisa. Um conflito, ou um requisito que perderia um cenário, termina com código 1 e deixa todos os arquivos intactos; o coordenador tenta mais uma vez e, se falhar, faz o landing sem a atualização e sinaliza o problema.

**Mapa do código.** `emet map` escreve um resumo de uma base de código existente (stack, estrutura, convenções, testes, pontos quentes) em `docs/agents/codebase.md` (`map.path`), carimbado com o SHA do commit a partir do qual foi gerado. O mesmo commit sempre produz o mesmo arquivo. `emet map --stale` termina com código 1 quando o HEAD passou do carimbo, e o `emet preflight` avisa nesse caso. `emet map --for <globs>` imprime apenas as seções que correspondem às superfícies de edição de um ticket. Essa saída é a única parte do mapa que o brief de um worker inclui.

**Métricas.** `emet metrics --run <id>` informa tokens, custo equivalente em API e tempo de relógio por ticket, por onda e por execução, lidos das transcrições de sessão. Também compara o orçamento de contexto estimado por ticket com o que cada worker realmente usou. Seu resumo vai no final do relatório final da execução.
