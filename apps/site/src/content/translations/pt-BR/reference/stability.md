---
title: Estabilidade
description: O que o emet promete não quebrar e o que ele se reserva o direito de mudar.
seoTitle: Estabilidade do emet
sourceHash: 5a596d218f43a27d
---

O que o emet promete não quebrar e o que ele se reserva o direito de mudar. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md).

## Superfícies estáveis

Uma mudança em uma superfície estável que quebre um chamador existente é uma mudança incompatível. Ela espera por uma versão major e é destacada no [CHANGELOG.md](../../CHANGELOG.md).

- **Flags da CLI.** Os subcomandos e as flags listados na [referência da CLI](cli.md). Uma flag não é removida nem recebe outro significado; novas flags podem ser adicionadas.
- **Códigos de saída.** `0` limpo, `1` achados que exigem ação, `2` erro de configuração ou de uso, `3` erro interno. Os prompts e os scripts dependem desses números. Veja [códigos de saída](cli.md#códigos-de-saída).
- **O schema de configuração.** O `emet.config.json` conforme descrito por [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json) e pela [referência de configuração](configuration.md). Uma chave não é removida nem renomeada sem um aumento do `version` do schema; novas chaves opcionais podem ser adicionadas.
- **O envelope do `--json`.** O formato de nível superior do JSON que um comando imprime com `--json`. Os campos não são removidos nem mudam de tipo; novos campos podem ser adicionados, então os parsers devem ignorar os campos que não conhecem.

## Superfícies internas

Estas podem mudar em qualquer release, sem outra entrada no changelog além de uma nota normal. Não dependa delas.

- Os módulos em `emet/src/` e suas funções e tipos exportados.
- A redação dos prompts em `emet/reference/`, `commands/` e `agents/`, que só muda em um ticket que nomeie os parágrafos ([ADR-0036](../adr/0036-prompt-wording-changes-under-an-explicit-ticket.md)).
- O formato e a localização dos arquivos de estado, ledgers e registros em `.emet/`, e o pool de slots de todo o host.
- Os arquivos gerados do Codex em `codex/` e `.codex-plugin/`.
- Qualquer coisa em `tools/`, `apps/` e `docs/research/`.
- O texto legível por humanos de mensagens, relatórios e da saída de `--help`.

## Descontinuações

Uma superfície estável é descontinuada por pelo menos uma release minor antes de ser removida em uma major. A descontinuação é anunciada no changelog e, quando a CLI consegue detectá-la, em um aviso no stderr.

## Decisões

Os registros de decisão em [docs/adr](../adr/README.md) explicam por que as superfícies são traçadas assim. Se você não tem certeza de qual lado algo fica, pergunte em uma issue antes de depender disso.
