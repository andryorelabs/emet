---
title: Novidades
description: Notas de versão do emet: o que mudou em cada versão.
seoTitle: Novidades do emet: notas de versão
sourceHash: ffd419a534a47352
---

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
