---
title: Novidades
description: Notas de versão do emet: o que mudou em cada versão.
seoTitle: Novidades do emet: notas de versão
sourceHash: 2e828f2cf39020f5
---

## 0.22.2

2026-11-25

### Alterado

- As partes interativas do site (menus do cabeçalho, menu móvel, busca, menu de ações da página, FAQ, abas de instalação, página 404 e pílula de anúncio) são ilhas React sobre shadcn `base-nova`, hidratadas na primeira interação.
- `bun run lint` verifica os arquivos `.tsx` com `@shadcn/lint`, e o limite de cobertura e o knip ignoram a camada vendorizada `apps/site/src/components/ui`.
- A CLI do `emet` permanece inalterada, exceto pela versão.

### Corrigido

- O FAQ do site não dispara mais uma violação da Content-Security-Policy: os dois valores de estilo inline que ele renderiza são permitidos por hash.
- As perguntas do FAQ mantêm um contorno de foco visível no modo de cores forçadas.
- O menu de idioma continua funcionando sem script por meio de uma lista simples de links.

## 0.22.1

2026-11-25

### Corrigido

- `emet promote` abre o pull request de sincronização de `main` para `develop` somente quando `main` tem conteúdo que `develop` não tem, então um `develop` só com squash não acumula mais, após cada promote, um pull request de sincronização impossível de mesclar. Quando só os commits de merge diferem, nada é aberto e `syncReason` explica o motivo.
- O pull request de sincronização é mesclado com `pr.mergeMethod` em vez de um commit de merge.
- `emet promote --hold` grava seu marcador em `<git common dir>/.emet/runs/<id>/no-promote` em vez de em um diretório `promote hold marker`. Marcadores nos locais antigos continuam retendo o spec.

## 0.22.0

2026-11-24

### Adicionado

- O binário `emet` embute a árvore de instalação (comandos, agentes, prompts de referência, hooks, skills do Codex e manifestos de plugin), gerada no momento do build e verificada contra desvios por `bun run check`, de modo que um binário compilado não precisa de checkout.
- `emet self install [latest|X.Y.Z] [--dry-run] [--from <checkout>] [--force]` instala o binário standalone em `~/.local/share/emet/versions/<v>/` com o symlink `~/.local/bin/emet`, grava os arquivos do Claude Code e mescla os hooks do emet em `~/.claude/settings.json` após um backup, sem tocar nos hooks de terceiros. Recusa-se quando o plugin do emet está instalado, a menos que `--force` seja informado. `--from` reproduz a instalação a partir do código-fonte com Bun.
- O adaptador do Codex de `emet self install` grava as skills do emet em `~/.agents/skills` e acrescenta os hooks embutidos a `$CODEX_HOME/hooks.json`, sem nunca gravar `config.toml`, e imprime o passo único de confiança em `/hooks`. O overlay de worker do Codex omite as tabelas do plugin do emet quando detecta uma instalação standalone.
- `emet self update [latest|X.Y.Z]` e `emet self update --auto` baixam a versão, verificam `SHA256SUMS` (e a atestação quando `gh` está presente) e a preparam. A troca espera até que nenhum slot de worker esteja ocupado. `--auto` é executado a partir de um hook `SessionStart` no máximo uma vez por dia.
- `scripts/install-remote.sh`, anexado a cada versão como `install.sh`, baixa o binário, verifica seu checksum e executa `emet self install`: `curl -fsSL https://emet.andryore.dev/install.sh | sh`.
- `emet doctor` avisa quando a instalação standalone e o plugin coexistem, quando os arquivos instalados divergem da árvore embutida, quando um hook do Codex não tem entrada `trusted_hash` e quando há uma atualização pendente ou a atualização automática está desativada.
- `docs/reference/stability.md` é publicado, e `docs/specs/translations.md` é uma nova spec viva.

### Alterado

- A documentação é reestruturada em cinco grupos, Get started, Concepts, How-to, Reference e Help, nos dez idiomas. Toda rota publicada antes desta versão redireciona para a nova rota, e `/docs/` redireciona para `/docs/start/overview/`.
- `start/overview`, `start/install` e `start/first-run` contêm as únicas instruções de instalação. A instalação standalone vem primeiro e os plugins são marcados como opcionais.
- As páginas de Concepts explicam seu tema sem tabelas de configuração, `concepts/landing` afirma que uma spec é integrada como um único pull request por padrão, e `concepts/architecture` lista todos os módulos de `emet/src` que não são de teste. As páginas de How-to são passos de tarefa com pré-requisitos e uma verificação do resultado, e `reference/cli` tem um título por comando.
- A home do Website mostra um pull request por spec e cobre o modo rápido, a memória, a revisão dupla, os alertas de atenção e a instalação reversível.
- `emet uninstall` também remove os artefatos standalone: o diretório de versões, o symlink, o arquivo de estado da instalação, as skills e os hooks do Codex, e todo comando de hook do emet nos dois arquivos de hooks. Os arquivos editados e os hooks de terceiros são mantidos.
- Toda página publicada, exceto `whats-new`, tem uma tradução atual em cada um dos nove idiomas, incluindo a nova página `reference/stability`.

### Removido

- `install.sh` foi removido. `emet self install` e o comando `curl` o substituem, e as verificações de dependências e os remédios do doctor apontam para eles.

## 0.21.0

2026-11-23

### Adicionado

- `emet setup --dry-run` (combinável com `--with`, `--yes` e `--json`) imprime os passos planejados de cada item escolhido, ou `already-present`, e não altera nada: não executa nenhum comando e não grava nenhum arquivo nem entrada do ledger.
- `emet setup` registra no ledger do setup, `setup-ledger.json` no diretório de estado, cada item que termina `installed`, com os registros de desfazer necessários para revertê-lo. As gravações do ledger são atômicas, e um ledger malformado é um erro que informa seu caminho.
- `emet setup --restore <id>` reverte `claude-settings` (o `model` anterior e as regras deny que o emet adicionou, depois de um backup com data e hora) ou `firecrawl-local` (a entrada MCP anterior de escopo de usuário). Qualquer outro id sai com 2, e um id sem entrada no ledger sai com 1.
- `emet uninstall [--dry-run] [--yes] [--purge] [--json]` remove uma instalação do `install.sh`: os arquivos do manifesto cujo hash ainda confere, o shim, cada hook `emet guard` em `~/.claude/settings.json` (depois de um backup com data e hora) e os extras do ledger do setup. Os arquivos editados são mantidos e listados. Para instalações globais de brew, bun e cargo, imprime o comando de remoção e nunca o executa.
- `./install.sh --uninstall [flags]` executa `emet uninstall`.
- `docs/reference/cli.md` e `README.md` documentam o ledger do setup, `--dry-run`, `--restore` e `emet uninstall`, nos nove idiomas.

## 0.20.0

2026-11-22

### Adicionado

- `emet guard` registra um evento `session.attention` no journal, `{sessionId, state, from, trigger}`, quando uma sessão pertencente ao emet muda de estado entre `working`, `idle`, `needs-decision` e `ended`. Um evento só é acrescentado quando o estado difere do último registrado da sessão. O journal nunca armazena texto de notificações, prompts nem entrada de ferramentas, e o registro nunca altera o veredito, o stdout ou o código de saída do guard.
- `hooks/hooks.json` e `install.sh` ligam os eventos de hook `Notification`, `PermissionRequest`, `SessionEnd` e `UserPromptSubmit` a `emet guard --event <Event>`. `install.sh` continua idempotente. `codex/hooks.json` não muda.
- O JSON de `emet status` ganha `sessions: [{sessionId, state, blocked, since, runId}]`, o último estado de cada sessão do repo nas últimas 24 horas, excluindo `ended`. Uma sessão bloqueada faz o estado geral virar `needs-decision` e é citada na linha de resumo e em `--brief`.
- `emet fleet status [--json]` imprime os últimos estados de sessão por repo a partir do journal global, com os repos bloqueados primeiro.
- Em uma transição para `needs-decision`, o emet dispara um único alerta: uma marca de não lido e um comentário no worktree do Orca do repo quando o Orca está acessível, ou `notify-send` quando ele está no PATH. `attention.alert` (booleano, padrão `true`) é adicionado aos schemas de configuração e o desativa.
- `docs/reference/cli.md`, `docs/reference/configuration.md` e `docs/guide/fleet.md` documentam os recursos de atenção de sessão, nos nove idiomas.

## 0.19.0

2026-11-22

### Adicionado

- `emet memory search --json <query> [--limit <n>]` e `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <outcome>` leem e gravam Lessons no Engram. `search` mantém as notas cuja topic key começa com `emet/<repo>/lessons/` e imprime o conteúdo completo delas, `save` acrescenta uma seção por run à nota do spec ou do quick run, com de 1 a 5 bullets no stdin. Ambos imprimem um objeto JSON, saem com 0 em qualquer problema do Engram e saem com 2 apenas em uso incorreto.
- `memory.enabled` (`auto` ou `off`, padrão `auto`) é adicionado aos esquemas de configuração. `off` nunca inicia o `engram`.
- A Phase 1 busca na memória Lessons anteriores antes da primeira rodada de entrevista e escreve as relevantes sob `## Prior lessons` no arquivo do plano. Os hand-offs da wave e do quick salvam as Lessons do run antes do relatório final. `--draft` não salva nada.
- `docs/reference/cli.md` e `docs/reference/configuration.md` documentam `emet memory` e `memory.enabled`, nos nove idiomas.

### Alterado

- O build do Codex rejeita `mcp__engram` em uma referência gerada, então os nomes das ferramentas do Engram nunca chegam ao plugin do Codex.
- Os prompts de `/emet:run` ganham os passos de memória acima; sem `engram` no PATH, ou com `memory.enabled: "off"`, cada passo é uma nota de uma linha e o run continua como na 0.18.0.

## 0.18.0

2026-11-22

### Adicionado

- `emet review --ticket <t> --coverage <file|-> [--expect S1,S3]` guarda Coverage verdicts no ledger. Um veredito `met` cujo teste não existe ou não é encontrado na árvore de trabalho, e um S# esperado sem veredito, abrem cada um um finding `VG-S<n>`.
- `emet review --base <ref>` guarda a base da revisão na primeira rodada e marca como `preexisting` um finding em uma linha que a wave não tocou. `emet gate` nunca conta um finding preexistente como bloqueante.
- Os findings aceitam os campos opcionais `s`, `userOption` e `agreement`. Um finding aberto com `userOption` bloqueia em todos os níveis e severidades, e o gate responde `hold` com `next: "fix-findings"`. A Phase 2 escreve como `(user option)` um S# que vem de uma opção escolhida pelo usuário.
- `emet review --merge <a.json> <b.json>` une dois arrays de findings em um. Dois findings formam um par quando compartilham `s`, ou compartilham `file` com linhas a no máximo 3 de distância, e recebem `agreement: "both"` ou `"single"`.
- `emet assess` imprime `dualReview: {run, reason}`, e `review.dual` (`auto` ou `off`, padrão `auto`) é adicionado aos esquemas de configuração. No host Claude com `codex` no PATH, uma wave `high` executa uma Dual review: `emet:emet-reviewer` e `emet review-run --tier high --coverage-out <file>` em paralelo, depois `emet review --merge`.
- `emet review-run --coverage-out <file>` grava os Coverage verdicts do revisor Codex, e seu esquema de saída aceita `s` e `userOption` anuláveis.
- `docs/reference/cli.md` e `docs/reference/configuration.md` documentam as mudanças de revisão, nos nove idiomas.

### Alterado

- O prompt do revisor e `agents/emet-reviewer.md` pedem um arquivo de Coverage verdicts, `.emet/coverage-<run>.json`, em vez de uma linha em prosa `S<n>: met | partial | unmet`. A Phase 8 registra os vereditos com `emet review --coverage` e lista os findings preexistentes no relatório da wave sem corrigi-los.
- Sem `--base`, `--coverage`, `--merge` nem Dual review, todo comando se comporta como na 0.17.0.

## 0.17.0

2026-11-22

### Adicionado

- `/emet:run --quick <mudança>` executa uma Quick run para uma mudança que cabe em um ticket: uma rodada de entrevista, uma spec com um ticket folded, uma aprovação, um worker, revisão e o Landing dessa única Wave como pull request (ou merge local), sem `emet chain`. Ela para antes da aprovação e recomenda `/emet:run` sem `--quick` quando a mudança toca uma tela ou não cabe em um ticket, e é rejeitada junto com `--draft` ou `--dispatch`. Aceita `--no-promote`. Os passos ficam no novo `emet/reference/phases-quick.md`. Veja ADR-0039.
- `emet assess --quick` imprime o JSON de sempre mais `"quickRejected"` e termina com código `1` quando o nível é `high`. Uma Quick run trata isso como um Stop do Gate: sem auto-merge, o pull request continua aberto e o relatório final nomeia os motivos de alto risco. Sem `--quick`, a saída e os códigos de saída não mudam.
- `emet approve --quick` grava `"mode": "quick"` em `approval.json`. Os registros gravados antes desta mudança continuam passando em `--check`.
- `resolveLandingUnit(config, runId, root)` retorna `wave` para uma execução aprovada com `--quick` e `config.landing.unit` nos demais casos. `emet landed`, `emet status` e `emet preflight` leem a unidade de landing por ela, de modo que uma Quick run nunca espera uma branch de spec.
- `emet validate` informa um erro `no-tickets` quando um plano não tem tickets e orienta a escrever um ticket folded.
- `docs/reference/cli.md` e `docs/guide/trackers-and-landing.md` documentam a Quick run, nos nove idiomas.

### Alterado

- A frase do caminho rápido em `phases-1-5.md` agora diz para escrever um ticket marcado como `folded` para um pedido abaixo do limite, em vez de não escrever nenhum ticket.
- `emet preflight --approval <run>` resolve a unidade de landing a partir do registro de aprovação dessa execução quando `--run` está ausente.

## 0.16.0

2026-11-21

### Adicionado

- Specs vivas, desativadas por padrão. Com `specs.enabled: true`, na última wave de uma spec o coordenador escreve os deltas de requisitos `ADDED`/`MODIFIED`/`REMOVED` da spec, executa `emet spec-merge --spec <id>` uma única vez na branch de integração dessa wave antes da revisão e faz o commit do `docs/specs/<area>.md` atualizado, de modo que a mudança é revisada e pousa no mesmo pull request. Uma nova referência, `living-specs.md`, descreve o formato dos deltas e a regra de nova tentativa. Veja o ADR-0038.
- `specs.enabled` (padrão `false`) na configuração e nas duas cópias do schema. `emet init` escreve `"specs": { "dir": "docs/specs", "enabled": false }`.
- `emet doctor` avisa, somente quando `specs.enabled` é `true`, se `specs.dir` está no gitignore ou é um arquivo. Um `specs.dir` ausente não gera aviso.
- `emet spec-merge --spec <id> --deltas-dir` cria e imprime o diretório compartilhado de deltas, `<git common dir>/.emet/runs/<id>/spec-deltas`, e termina com código `0` sem fazer merge.
- `landing.specMergeMethod` aceita `merge` (padrão), `squash` e `rebase`, para que uma spec pouse em um trunk que permite apenas merges squash. `emet doctor` avisa quando as configurações do repositório ou o ruleset do trunk não permitem o método configurado. Veja o ADR-0037.
- `bun run check:codex` falha para um arquivo em um diretório `codex/` gerado que não tem fonte.

### Alterado

- Com `specs.enabled` desativado, `emet spec-merge` imprime `specs.enabled is false; nothing merged` e termina com código `0`. Ele lê os deltas do diretório de execução compartilhado sob o git common dir, recorrendo ao `.emet/runs/<id>/spec-deltas/` de cada checkout.
- Os prompts da Fase 8 não executam mais `emet spec-merge` depois que uma wave ou spec pousa; em vez disso, `phases-8-review.md` carrega `living-specs.md` na última wave.
- `emet spec-branch land` espera os checks do pull request com o mesmo poller de `emet ci`, continuando a consultar um pull request que ainda não tem checks, e faz o merge com `landing.specMergeMethod`.

### Corrigido

- `emet spec-branch land` não faz mais merge antes de o GitHub ter registrado qualquer check.
- `emet setup` lista os plugins do Claude uma vez em vez de até três, e suas sondagens silenciosas expiram em vez de travar.
- `emet doctor` lista os plugins instalados uma vez por execução.
- `bun run lint` e `bun run fix` geram primeiro os tipos do Astro do site, então passam em um checkout novo.

## 0.15.0

2026-11-21

### Alterado

- `landing.unit` é `spec` por padrão: as waves de uma spec são integradas na branch `spec/<id>` com `emet spec-branch` e a spec pousa uma única vez, como um pull request (ou um merge local com `landing.mode: merge`), em vez de um pull request por wave. Use `"landing": { "unit": "wave" }` para manter o comportamento anterior. O modo `spec` precisa de `worktree.baseRef: "head"` nas configurações do Claude Code. Veja o ADR-0037.
- O journal ganha os tipos `spec.integrate`, `spec.land` e `spec.abandon`, e `emet status` ganha `specBranch`.

## 0.14.5

2026-11-21

### Adicionado

- `emet handoff --check` analisa uma seção `skills:` na nota de passagem de um worker (`none`, ou `loaded: a, b; missing: c`). Ela é obrigatória quando `state` é `done`. `--expect-skills a,b` faz a verificação falhar para cada skill indicada que não esteja em nenhuma das duas listas e imprime as que faltam.
- O registro de despacho traz um array opcional `skills`, e `emet verify` o repassa a `emet handoff --check` como `--expect-skills`. Um registro sem `skills` continua sendo lido.
- O ADR-0036 permite que um ticket mude a redação de um prompt instalado quando nomeia os parágrafos, e o mesmo pull request aumenta os limites de bytes.

### Alterado

- O prompt da Fase 8 foi dividido em `phases-8-review.md` e `phases-8-landing.md`. O `install.sh` aposenta o antigo `phases-8-closeout.md`: uma cópia editada ou anterior ao manifesto é movida para `phases-8-closeout.md.retired`, e uma cópia sem edição é apagada.
- O prompt do worker o instrui a escrever a linha `skills:` antes da passagem final.
- A página de arquitetura, a referência da CLI e suas nove traduções descrevem os dois arquivos da Fase 8 e `--expect-skills`.

## 0.14.4

2026-11-20

### Adicionado

- `emet doctor` no host Codex avisa quando o plugin do emet está habilitado em `$CODEX_HOME/config.toml`, mas o Codex não confiou em nenhum dos seus hooks, de modo que o guard do emet não é executado. O aviso não altera o código de saída.

### Corrigido

- Quando o asset do release para a versão do plugin ainda não pode ser baixado, `bin/emet` executa o binário em cache mais recente para qualquer comando, não apenas para `emet guard`, e imprime um aviso de que o release pode ainda estar sendo publicado. Com `EMET_PREFETCH=1`, imprime o aviso e termina com `0` sem executá-lo. Uma divergência de checksum ou um `SHA256SUMS` ausente continuam nunca recorrendo ao cache, e o diretório temporário do download é removido antes do recurso.

## 0.14.3

2026-11-20

### Adicionado

- `emet fleet launch --dry-run` executa as verificações de prontidão e imprime `would launch <name>` para cada repositório sem iniciar uma sessão.

### Corrigido

- `emet migrate` remove os arquivos de execução legados de `.forge/` que não estão rastreados e diferem da cópia em `.emet/`, mantendo a de `.emet/`, e assim termina em repositórios com logs remanescentes. Cada conflito que não consegue resolver é listado junto com o passo manual, e uma falha do git dentro de um repositório é tratada como conflito em vez de apagar o arquivo.
- O preload dos testes remove seu diretório `emet-test-state-*` quando a execução termina, então `bun test` não deixa mais um diretório temporário por execução.

## 0.14.2

2026-11-20

### Corrigido

- `emet promote` espera os checks do pull request de sincronização e só o mescla quando eles passam, em vez de mesclá-lo de imediato. Um pull request de sincronização que falha, expira ou é rejeitado permanece aberto sem fazer o promote falhar, e o resultado e o evento do journal incluem `syncMerged` e `syncReason`.

## 0.14.1

2026-11-20

### Adicionado

- `emet tracker close` fecha a issue de especificação pai de um ticket do GitHub quando seu último sub-issue é fechado, e informa cada especificação em um novo campo `specs`. Uma leitura ou um fechamento de especificação que falhe termina com `1`.
- A especificação é fechada mesmo quando o resumo de sub-issues do GitHub ainda não foi atualizado: os sub-issues da especificação são contados um a um, incluindo os tickets fechados na mesma chamada.

## 0.14.0

2026-11-20

### Adicionado

- `emet init` define `schema.ownedPaths` quando encontra um schema Prisma (`prisma/schema.prisma` ou `prisma/schema/`) ou uma pasta de migrations do Drizzle, e remove o marcador `TODO(emet):` de propriedade do schema.
- O item de setup `agent-browser` grava `~/.agent-browser/config.json` (`contentBoundaries` e `maxOutput`) quando ele não existe, e executa `agent-browser doctor` após a instalação. Veja ADR-0035.
- `emet setup` imprime um perfil do AppArmor para o Chrome baixado pelo `agent-browser`, junto com os comandos `sudo` para carregá-lo, quando o host restringe namespaces de usuário sem privilégios. Ele nunca executa `sudo`.

### Alterado

- O item de setup `firecrawl-local` registra o servidor MCP com `FIRECRAWL_CLOUD=search` em vez de `off`, substitui um registro anterior e passa o Chrome mais recente do `agent-browser` como `FIRECRAWL_CHROME_PATH`. Veja ADR-0035.

### Corrigido

- `emet setup` registra o servidor MCP `firecrawl-local` com o nome do servidor primeiro, de modo que o registro seja interpretado corretamente.
- `emet --help` lista todos os comandos do registro (setup, fleet, insights, chain, promote, whats-new, deploy-check, ci, run).
- Os testes não gravam mais no journal real em `~/.local/state/emet`.

## 0.13.0

2026-11-20

### Adicionado

- `emet setup` oferece os itens `context7` e `firecrawl-local` (ambos desativados por padrão). `context7` instala a CLI `ctx7` e a sua skill `find-docs`. `firecrawl-local` compila o Firecrawl Local com `cargo` e o registra como servidor MCP somente local (`FIRECRAWL_CLOUD=off`, `--public-only`). Veja o ADR-0034.
- `emet review-run --browser-verify true|false` repassa o eixo de navegador ao revisor do Codex.
- `validate.coupledSurfaces` em `emet.config.json` e o erro `coupled-surface-split` de `emet validate` mantêm uma página e as suas traduções na mesma onda. Veja o ADR-0033.

## 0.12.0

2026-11-20

### Adicionado

- `verify.browser` em `emet.config.json` (`startCommand`, `url` e, opcionalmente, `paths`) habilita em um repositório a verificação no navegador das mudanças de interface com `agent-browser`. O esquema de configuração e seu parser validam cada campo.
- `emet assess` imprime `browserVerify: { run, reason }`. O eixo de navegador só é executado quando a onda tem um revisor, `verify.browser` está configurado, `agent-browser` está no PATH e um caminho alterado corresponde a `paths`.
- `emet setup` oferece um item `agent-browser` (desativado por padrão) que instala a versão mais recente e o respectivo navegador.
- `emet doctor` relata um achado opcional sobre o agent-browser para um repositório que configura `verify.browser`. Um binário ausente ou um `agent-browser doctor` com falha é uma nota ou um aviso e nunca altera o código de saída.
- O prompt do revisor ganha um eixo de navegador, preenchido apenas quando `browserVerify.run` é verdadeiro, e o prompt do worker ganha uma linha opcional para as verificações no navegador. Veja a ADR-0032.

## 0.11.1

2026-11-19

### Corrigido

- No Windows nativo (Git Bash) e em qualquer SO ou arquitetura sem suporte, `bin/emet` sai com 0 em vez de falhar, então o guard de PreToolUse não bloqueia mais todas as chamadas de ferramenta. Apenas o prefetch do início da sessão imprime um único aviso.
- `install.sh` se recusa a executar em `MINGW*`, `MSYS*` e `CYGWIN*` antes de gravar qualquer coisa.
- Os hooks do Codex trazem uma substituição `commandWindows`, então o Codex no Windows (PowerShell) não gera mais erro a cada evento.

## 0.11.0

2026-11-19

### Adicionado

- `emet whats-new` imprime um aviso de uma linha com um link para as notas de versão na primeira vez que o emet é executado após uma atualização e, em seguida, registra a versão em execução. Com `--hook`, emite a linha como um objeto JSON `systemMessage` para hooks de sessão.

## 0.10.0

2026-11-19

### Adicionado

- `handoff.afterSpec` aceita uma lista ordenada de regras `{ paths?, mode }`, para que um repositório com uma CLI e um site possa lançar a CLI e promover o site. O modo é escolhido a partir dos caminhos que a promoção de `develop` levaria para `main`.
- `deploy.check.paths` limita a verificação de deploy às promoções que tocaram os globs listados.
- `emet promote` imprime e registra no journal `rule` e `reason`, e imprime `deployCheck: { run, reason }`.

### Alterado

- A verificação de deploy não depende mais de `afterSpec`: ela roda após uma última wave limpa no trunk `main` e após uma promoção mesclada em `develop`. O coordenador executa `emet promote` após cada spec, também com `afterSpec` em `none`.

## 0.9.1

2026-11-19

### Corrigido

- `emet setup` aceita `--data-dir`, então o hook SessionStart do plugin não falha mais com `unknown flag --data-dir`.

## 0.9.0

2026-11-19

### Adicionado

- `emet gate` aplica uma política de corrigir e continuar: uma wave retida executa rodadas de correção até que os achados sejam resolvidos ou `budgets.fixRounds` (2 por padrão) se esgote, e então para. `gate.onHold` escolhe `fix-and-continue` (padrão) ou `stop`. `emet review --recheck` resolve um achado apenas pelo veredito de um revisor.
- `emet ci --wait` consulta as verificações de um pull request, reexecuta jobs instáveis e informa `pass`, `fail`, `env-fault` ou `timeout`. `emet tracker close` fecha tickets do GitHub de forma idempotente, e `emet chain` executa gate, readiness, launch e verify como um único passo.
- Um diário de eventos registra decisões do gate, intervenções, lançamentos, fechamentos de tickets e limpezas, com rotação por tamanho. `emet insights` o resume (`--mark-baseline` reinicia a linha de base), `emet run current` mostra o spec e a wave ativos, e `emet status --brief` imprime o estado em uma linha.
- As chaves de configuração `language.conversation` e `language.artifacts`.
- As chaves de configuração `handoff.afterSpec` (`release`, `promote` ou `none`, detectada por `emet init` ou definida com `emet init --after-spec`), `deploy.check` e `interview.research`.
- `emet promote` abre o pull request de `develop` para `main` quando a última wave está ociosa, faz o merge se as verificações passarem e sincroniza `main` de volta quando `develop` fica para trás. `--no-promote` retém um spec em todas as suas sessões.
- `emet deploy-check` repete um comando de verificação de deploy e encerra comandos travados.
- `emet fleet list | set | launch` executa specs em vários repositórios.
- `emet setup` e `/emet:setup` instalam complementos opcionais de um catálogo depois de fazer backup das configurações do Claude. Um hook SessionStart mostra um aviso uma única vez, e `install.sh` executa o setup em um TTY.
- `emet doctor` e `emet init` recomendam o Engram sem nunca contá-lo como dependência não atendida.

### Alterado

- Os prompts e a documentação instalados descrevem a política do gate, `emet ci`, `emet chain`, o diário, a etapa pós-spec, fleet e setup. A fase 8 adiciona um resumo da wave e uma notificação push, e `emet insights` substitui a referência a `/retro`.

### Corrigido

- `--no-promote` é salvo como um marcador no diretório comum do git, de modo que uma sessão encadeada de `/emet:run --dispatch` para a última wave não promove mais `develop` para `main`.

## 0.8.6

2026-11-17

### Corrigido

- O workflow de release instala o Chromium antes de executar novamente as verificações no tag, como faz o job de testes da CI, de modo que a verificação não para mais no mínimo de cobertura de `tools/`. A v0.8.5 foi etiquetada, mas nunca publicada por causa disso; suas mudanças saem nesta versão.

## 0.8.5

2026-11-17

### Alterado

- O gate de cobertura exige um mínimo por arquivo de 97 % das linhas e 98 % das funções para `emet/`, `apps/site` e `tools/`, com exceções justificadas em `tools/coverage-exceptions.ts`. O manifesto de cobertura percorre `emet/src` de forma recursiva, `tools/` passa pelo gate e os totais de `tools/coverage-floors.json` sobem para os valores medidos.
- O guard de PreToolUse falha fechado: quando `bin/emet` não consegue resolver o binário do emet, o hook sai com 2 e bloqueia a chamada da ferramenta, com uma mensagem que explica como se recuperar. Os hooks Stop e SubagentStop continuam saindo com 1.
- Os manifestos do plugin trazem e-mail do autor, licença, página inicial, repositório e URL de bugs, e as descrições das skills do Codex dizem quando usar cada uma.

### Corrigido

- `emet doctor` sai com o código 3 quando um erro inesperado escapa, em vez de 0. Um código de saída diferente de zero definido antes é mantido.
- `emet cleanup --all --force` recupera o worktree e as branches do worker de uma execução morta, inclusive os worktrees em `.claude/worktrees/`. Um dono vivo ou ocioso, e um bloqueio que não nomeia nenhuma execução, continuam protegidos.
- O guard de edição reconhece uma superfície escrita de forma literal, como `src/app/[locale]/page.tsx`. `[` e `]` em uma superfície deixam de ser uma classe de caracteres.
- `emet preflight --post-dispatch` falha quando um ticket que ainda mantém uma reserva ou um slot perdeu o seu worktree de worker, e orienta o coordenador a redespachá-lo em vez de retomá-lo.
- O binário compilado do `emet` não carrega mais um arquivo `.env` do diretório atual.
- O site remove os atributos de estilo inline da página inicial, dá contraste AA aos rótulos da página inicial no modo claro e nomeia o botão de busca com o seu texto visível desde a primeira renderização. As imagens da documentação são servidas da origem própria do site em `repo-assets` em vez de `raw.githubusercontent.com`, e o `astro dev` também as serve.

## 0.8.4

2026-11-15

### Alterado

- O cabeçalho da página inicial agora tem dois grupos nas extremidades: a marca e Docs à esquerda; busca, estrelas do GitHub, tema e idioma à direita. Seus controles e a etiqueta de versão são de vidro translúcido sobre o céu, e o link duplicado para Novidades saiu do cabeçalho e do menu da página inicial.

## 0.8.3

2026-11-15

### Corrigido

- `/docs/` e o `/docs/` de cada idioma agora respondem com um 301 para a página de primeiros passos, em vez de uma página meta-refresh que piscava sem estilos.

## 0.8.2

2026-11-11

### Corrigido

- `emet cleanup` mantém uma branch scaffold `worktree-<name>` enquanto o worktree `<name>` ainda existir, para que uma sessão que trabalha ali em outra branch conserve a branch que o host dela espera.

## 0.8.1

2026-11-11

### Adicionado

- `emet cleanup` exclui as branches scaffold `worktree-<name>` que o Agent host deixa para trás, quando nada as tem em uso e o trunk já contém a ponta delas.

### Corrigido

- O guard recusa uma exclusão forçada de branch em qualquer forma que combine um flag de exclusão com um flag de força, não só com o flag em maiúscula.

## 0.8.0

2026-11-11

### Adicionado

- `emet cleanup` exclui, em todos os modos, cada branch local cujo pull request foi mesclado no commit da ponta da branch, junto com o worktree de agente limpo e desbloqueado que a contém. As branches de integração, de release e de correção não esperam mais uma exclusão manual.
- `bun run translations:status` lista as traduções do Website que estão atrasadas em relação à fonte.

### Alterado

- A recusa do guard a uma exclusão forçada de branch aponta para `emet cleanup`.
- O runbook de release cobre as traduções de `whats-new`.

## 0.7.0

2026-11-11

### Adicionado

- O Website serve o esquema de configuração em `https://emet.andryore.dev/schema/emet.config.schema.json`.
- `docs/development.md` e `docs/security.md`.
- Um piso de cobertura por workspace, que `bun run test` faz cumprir.

### Alterado

- `emet init` grava a URL pública de `$schema` em `emet.config.json` em vez de um caminho local.
- As tags de versão são assinadas, e o workflow Release falha quando a seção do CHANGELOG para a tag está ausente ou vazia.
- O repositório segue o padrão andryorelabs v1: rulesets como código, arquivos de comunidade, estrutura do README e nomes de scripts padrão (`format:write`, `lint:commits`).

## 0.6.1

2026-11-10

### Corrigido

- Dois processos que recuperam ao mesmo tempo o mesmo lock obsoleto não podem mais entrar ambos na seção crítica; os claims, a Mailbox, o tracker e `acquireLock` compartilham uma única recuperação protegida.
- Chamadas concorrentes a `emet tracker create-ticket` não falham mais de forma intermitente.

## 0.6.0

2026-11-10

### Adicionado

- Uma Mailbox para os workers do Codex: `emet ask` registra uma pergunta (e consulta a resposta com `--wait`), `emet inbox` lista as perguntas abertas e `emet reply` responde a uma, de modo que um worker não precisa mais escalar por uma nota de passagem.
- `emet dispatch --wait` imprime `question <ticket> <id>` enquanto um worker ativo tem uma pergunta aberta, e nunca classifica esse worker como parado.
- `emet claims --reserve` armazena as superfícies de edição do ticket e nega uma reserva que se sobreponha às superfícies de outra execução.

### Corrigido

- `emet dispatch --wait` lê os resultados do diretório de execução do git-common-dir, onde `emet results --write` os grava.

## 0.5.2

2026-11-10

### Alterado

- O aviso de não afiliação cita a OpenAI além da Anthropic.
- As abas de instalação da página inicial dizem Claude Code, e o comando de execução tem uma aba Codex com `$emet:run`.
- Os guias indicam quais passos valem para cada Agent host: Claude Code ou Codex.

### Corrigido

- `emet doctor`, `emet init`, `emet dependencies` e `emet preflight` não dão mais conselhos só do Claude Code no host Codex.
- `emet init --force` mantém `agentHost` e a seção `codex` da configuração existente.

## 0.5.1

2026-11-10

### Alterado

- O README, a landing, o banner, os guias e as imagens de compartilhamento citam o Codex ao lado do Claude Code.

## 0.5.0

2026-11-10

### Adicionado

- A página inicial do Website: hero pintado, como funciona, recursos, sobre,
  painel de encerramento, cabeçalho e rodapé, com as strings em inglês em
  `apps/site/src/i18n/ui/en.ts`.
- A documentação do Website em `/docs/`: páginas do Starlight geradas a partir de
  uma lista de permissão de docs do repositório e deste changelog, com busca
  Pagefind, reescrita de links para páginas do site ou o GitHub e um aviso de
  fallback em inglês para traduções ausentes ou desatualizadas.
- `docs/how-to/update-emet.md`: como atualizar os plugins e ativar a atualização
  automática do marketplace.
- Codex como Agent host: `agentHost` em `emet.config.json`; `emet dispatch` e
  `emet review-run` iniciam cada worker e revisor como um processo `codex exec`,
  além das skills `$emet:run`, `$emet:init` e `$emet:doctor`, do manifesto de plugin
  do Codex e do teste ponta a ponta opcional (`EMET_CODEX_E2E=1`).
- `docs/guide/codex.md`, o guia do Codex, publicado no Website.

### Alterado

- O padrão de `codex.sandbox` do Codex é `danger-full-access` (`workspace-write`
  continua aceito), repassado por `emet dispatch`, `emet review-run` e por um
  `emet launch` do Codex; `emet guard` no Codex nega todas as formas de push.
- O overlay do Codex por execução grava seu próprio `config.toml` mínimo em vez de
  vincular o seu, e suas regras permitem as formas `-C` e os subcomandos de
  coordenação, enquanto o push continua proibido.
- Os workers do Codex são identificados por seu `threadId` e pelo caminho do JSONL,
  não por seu pid.
- O guia do Codex relata os resultados reais com o Codex: toda linha antes
  `failed` agora é `verified`, a lista `unverified` encolhe para a supervisão sem
  acompanhamento, e o relatório de sondagem lista os acompanhamentos restantes.

### Corrigido

- `emet cleanup` recupera worktrees integrados e sem dono.
- O Agent host Codex agora é resolvido por padrão, então `emet preflight`,
  `doctor`, `cleanup`, `status` e `usage` aceitam `agentHost: "codex"`.
- A resolução de modelos do Codex lê `models_cache.json` da home da execução ou da
  sua home real do Codex.

## 0.4.0

2026-11-06

### Adicionado

- Opção `position` do `emet-mascot` (`pane`, `band` ou `status`); `pane` é o
  padrão e recorre à faixa quando não consegue acoplar.
- Uma seção "Mascot (optional)" no README.

### Alterado

- Os quadros do `emet-mascot` são ajustados às seis cores do mascote em vez de
  borrados por um redimensionamento, de modo que o pixel art fica nítido no
  terminal.
- `emet-mascot` 0.2.0: o `size` padrão agora é `small`.
- `docs/how-to/orca-pet.md` agora é `docs/how-to/mascot.md`, cobrindo o mod e
  o pet do Orca.

## 0.3.0

2026-11-05

### Adicionado

- Os comandos de plugin `/emet:init` e `/emet:doctor` executam `emet init` e
  `emet doctor .` dentro do Claude Code e resumem o resultado.
- O `emet doctor` avisa sobre hooks `forge guard` e `emet guard` em
  `~/.claude/settings.json` cujo binário não existe mais, e imprime um comando
  de backup seguido de `jq` para removê-los. Ele nunca edita o arquivo.
- Fundamentos do mascote: um arquivo de fase, o pacote do pet, uma máquina de
  estados do mod, os demais escritores de fase e quadros rasterizados.
- `emet-mascot`, um plugin opcional que mostra um mascote em pixels acima do
  prompt e espelha a sessão e a fase da execução do `emet`. Ele está listado
  no marketplace, com um guia prático para o pet do Orca e o ADR-0016.

### Corrigido

- O plugin não expõe mais um comando `/emet:emet` duplicado e quebrado;
  `commands/` fica fixado em `run.md`, `init.md` e `doctor.md`.
- A próxima onda agora é lançada com `/emet:run`, o comando que o plugin
  registra.

### Alterado

- O repositório foi movido para a organização `andryorelabs` do GitHub. Os
  downloads de versões, os selos do README e a URL de clone agora apontam para
  `andryorelabs/emet`; as antigas URLs `AndryOre/emet` continuam
  redirecionando.
- As instalações independentes renomeiam `/emet` para `/emet:run`, como o
  plugin. O `install.sh` agora instala `commands/run.md`, `init.md` e
  `doctor.md` em `~/.claude/commands/emet/`, de modo que `/emet:run`,
  `/emet:init` e `/emet:doctor` ficam disponíveis sem o plugin. O antigo
  `~/.claude/commands/emet.md` é removido quando não foi editado; uma cópia
  editada é mantida e listada no resumo da instalação.

## 0.2.0

2026-11-05

### Alterado

- O projeto foi renomeado de claude-forge para emet: a CLI é `emet`, o comando
  é `/emet`, os agentes são `emet-worker` e `emet-reviewer`, e o README traz a
  nova marca. Instalações e repositórios existentes continuam funcionando: os
  nomes legados (`forge.config.json`, `.forge/`, `docs/agents/forge.md`,
  `FORGE_*`) ainda são lidos com um aviso, e o `emet migrate` leva um
  repositório para os novos nomes.

### Adicionado

- O `install.sh` funciona sem Bun: instala o shim do binário independente como
  `~/.local/bin/emet`, reescreve os marcadores de posição do plugin nos
  prompts que copia, instala `commands/run.md` como
  `~/.claude/commands/emet.md` e aceita `shasum -a 256` no lugar de
  `sha256sum`.
- O README informa os requisitos reais, os dois caminhos de instalação e a
  ordem `/setup-matt-pocock-skills` e depois `emet init`.
- Guia para agentes (`AGENTS.md`), glossário do domínio (`GLOSSARY.md`) e
  registros de decisões de arquitetura em `docs/adr/`.
- Tracker local em markdown seguindo a convenção `.scratch/`, com uma CLI
  `emet tracker` (`create-spec`, `create-ticket`, `frontier`, `set-state`,
  `comment`, `close`) e `emet validate`, `preflight` e `doctor` cientes do
  tracker local.
- `landing.mode` (`pr` ou `merge`) e `emet land`, que aterrissa uma onda como
  um único merge local sem PR; `emet cleanup` e `emet status` comparam com o
  tronco local no modo merge.
- Binários independentes do `emet`, `emet --version`, suporte a macOS na CI e
  na árvore de processos e no freio de memória, e manifestos de plugin com um
  shim `bin/emet`.
- Contrato de skills com `emet skill-path`, e um `emet doctor` mais amplo que
  cobre skills, glossário, obsolescências e instalações duplas.
- `emet init` e `emet map` neutros quanto à linguagem para repositórios JS, Go,
  Rust e Python.
- ADR-0007 a ADR-0011.
- Índice da documentação, mapa de código da arquitetura, solução de problemas
  por sintoma, um template de PR mais completo e `emet/AGENTS.md` com as regras
  exclusivas do runtime.

### Alterado

- O `gh` só é obrigatório quando `tracker.kind` é `github` ou `landing.mode` é
  `pr`.
- O `emet init` não seleciona mais o tracker local por padrão.
- O ADR-0004 foi emendado: uma onda aterrissa como um PR ou como um merge
  local.

## 0.1.0

2026-11-03

### Adicionado

- O comando global `/forge`: entrevista, spec, tickets, uma única aprovação e
  depois agentes de worktree em paralelo que implementam, testam e mesclam uma
  funcionalidade sem supervisão.
- A CLI `forge` com os subcomandos `init`, `doctor`, `preflight`, `selftest`,
  claims, slots, gates, verificações de handoff, results e metrics.
- Os agentes `forge-worker` e `forge-reviewer`.
- Trackers para Linear e GitHub Issues.
- Configuração por repositório por meio de `forge.config.json`.
- `install.sh`, que instala a CLI, o comando e os agentes.
