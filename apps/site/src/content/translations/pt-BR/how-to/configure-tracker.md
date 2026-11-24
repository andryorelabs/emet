---
title: Configurar o tracker e a aterrissagem
description: Onde ficam os tickets, como uma especificação aterrissa como pull request ou merge local, e como as ondas se encadeiam.
seoTitle: Configurar o tracker e a aterrissagem no emet
sourceHash: c79d8a04687b4620
---

Escolha onde os tickets ficam, como uma especificação aterrissa e se as ondas se encadeiam. Toda chave citada aqui está na [referência de configuração](../reference/configuration.md); todo subcomando está na [referência da CLI](../reference/cli.md). Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md).

<img src="../brand/mascot/mascot-work.svg" alt="mascote do emet, trabalhando" width="96" align="right">

## Pré-requisitos

- O emet instalado e um repositório com um `emet.config.json`; execute `emet init` se ele não tiver um.
- Para o tracker `github` ou a aterrissagem `pr`: `gh` no `PATH` e autenticado.
- Para o tracker `linear`: um servidor MCP do Linear declarado em `.mcp.json` (ou no escopo do usuário). Veja a [referência de dependências](../reference/dependencies.md).
- Para entender o que essas configurações mudam, leia [Aterrissagem](../concepts/landing.md) e [Execuções, ondas e especificações](../concepts/runs-waves-specs.md).

## Escolher o tracker

:::steps

1. Defina `tracker.kind` em `emet.config.json` como `"linear"`, `"github"` ou `"local"`.
2. Para um tracker local, execute `emet init --tracker local`. As especificações e os tickets passam a ser arquivos markdown em `.scratch/` do worktree principal (sem versionamento): `.scratch/<slug>/spec.md` e `.scratch/<slug>/issues/<NN>-<slug>.md`, cada um com linhas `Status:` e `Blocked by:` e comentários em `## Comments`. O coordenador os lê e escreve por meio de `emet tracker`. Veja o [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
3. Para os outros tipos, confirme o pré-requisito correspondente acima.

:::

## Escolher como uma especificação aterrissa

:::steps

1. Defina `landing.mode` como `"pr"` (padrão) ou `"merge"`. No modo `merge`, uma especificação aterrissa como um único merge local no trunk (`emet spec-branch land`, ou `emet land` por onda com `landing.unit: "wave"`), `commands.selfCheck` faz o papel do CI e nada é enviado com push. Veja o [ADR-0010](../adr/0010-local-merge-landing.md).
2. Defina `landing.unit` como `"spec"` (padrão, a especificação inteira aterrissa de uma vez) ou `"wave"` (cada onda aterrissa sozinha). Veja o [ADR-0037](../adr/0037-landing-per-spec.md).
3. Com `landing.unit: "spec"`, defina `worktree.baseRef: "head"` nas configurações do Claude Code para que os worktrees dos workers comecem a partir do branch `spec/<id>`. `emet preflight` e `emet doctor` verificam isso.
4. No modo `pr`, defina `landing.specMergeMethod` (um commit de merge por padrão) como um método que as configurações do repositório e o ruleset do trunk permitam; `emet doctor` avisa quando não permitem.
5. Para controlar o merge, defina `pr.autoMerge` (padrão `true`) e `pr.maxCiFixAttempts`. Defina `pr.mergeMethod` apenas com `landing.unit: "wave"`; um pull request de especificação usa `landing.specMergeMethod` do passo 4 e o ignora. Uma onda com qualquer item sinalizado nunca é mesclada automaticamente.

:::

Os comandos do branch da especificação (`emet spec-branch ensure`, `integrate`, `sync`, `land`, `abandon`) são conduzidos pelo coordenador; suas flags estão na [referência da CLI](../reference/cli.md).

## Encadear ondas

As ondas seguintes rodam em sessões próprias. O encadeamento vem desligado por padrão.

:::steps

1. Defina a seção `handoff` em `emet.config.json`:

   ```json
   {
     "handoff": {
       "autoChain": true,
       "launcher": "auto",
       "permissionMode": "bypassPermissions"
     }
   }
   ```

2. No Claude Code, garanta que `claude` está no `PATH` com suporte a `--bg`, que o workspace é confiável (abra o `claude` de forma interativa no repositório uma vez e aceite) e que o aviso de bypass foi aceito uma vez em uma sessão interativa (`skipDangerousModePermissionPrompt`).
3. No Codex, garanta que `codex` está no `PATH` em `codex.minVersion` ou mais recente, com `--json` e `--output-schema` em `codex exec`; a próxima onda começa como um `codex exec` desacoplado. Veja [Executar o emet no Codex](use-codex.md).
4. Defina `handoff.launcher` (somente Claude Code) como `auto`, `orca` ou `bg` para escolher se a onda também abre uma aba do Orca. `permissionMode` é somente do Claude Code; no Codex, a sessão encadeada usa `codex.sandbox`.
5. Para iniciar uma onda em outra sessão manualmente, execute `emet launch <spec-id> --wave <n>` em vez de um `claude --bg` simples. Ele imprime `{ name, id, attach, orcaTab: { opened, reason } }`.

:::

O encadeamento só inicia quando o PR foi mesclado e nada foi sinalizado, é ignorado quando uma sessão `emet-<spec-id>-*` já está ativa e, se o início falhar, recorre a imprimir `/emet:run --dispatch <spec-id>`. Inspecione uma onda encadeada com `claude agents` ou `claude attach emet-<spec-id>-w<n>`.

## Definir orçamentos e recursos opcionais

:::steps

1. Defina a seção `budgets` se os padrões não servirem:

   ```json
   { "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
   ```

   `workerAttempts` é quantas vezes um ticket pode falhar no `verify` antes de ser adiado; `reviewRounds` é quantas rodadas de revisão um ticket recebe antes de uma escalação (as rodadas de correção têm o próprio `budgets.fixRounds`, padrão 2); `stallNudgeCap` é quantas vezes um worker travado é cutucado. Veja [Revisão e gates](../concepts/review-and-gates.md).

2. Defina `specs.enabled` para manter [especificações vivas](../concepts/living-specs.md) em `docs/specs/` (`specs.dir`).
3. Execute `emet map` para escrever um mapa do código em `docs/agents/codebase.md` (`map.path`). `emet map --stale` termina com 1 quando o HEAD passou do carimbo.
4. Execute `emet metrics --run <id>` depois de uma execução para ver tokens, custo e tempo de relógio por ticket, onda e execução.

:::

Para uma mudança pequena de um único ticket, inicie `/emet:run --quick <request>` em vez do pipeline completo; ele sempre aterrissa por onda e para diante de um diff de alto risco.

## Verificar

:::steps

1. Execute `emet preflight`; ele valida as seções `tracker`, `landing`, `pr`, `handoff` e `budgets` e termina com 2 em uma configuração malformada.
2. Execute `emet doctor .` e confirme que nenhuma falha cita o tracker, o `gh`, o servidor MCP do Linear ou as configurações de aterrissagem.
3. Para um tracker local, execute `emet tracker frontier --spec <slug>` e confirme que ele lista os tickets esperados.

:::
