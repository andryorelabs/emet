---
title: Novidades
description: Notas de versão do emet: o que mudou em cada versão.
seoTitle: Novidades do emet: notas de versão
sourceHash: d31beb683db0a11e
---

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
