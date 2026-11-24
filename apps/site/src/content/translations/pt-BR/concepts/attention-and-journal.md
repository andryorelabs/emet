---
title: Atenção e o journal
description: Como o emet registra seus eventos em um journal global e avisa quando uma sessão está esperando por você.
seoTitle: Atenção e journal no emet
sourceHash: 378e84638489f44f
---

O emet registra seus próprios eventos em um único journal global. Um tipo de evento avisa quando uma sessão está esperando por você. Os termos seguem o [GLOSSARY.md](../../GLOSSARY.md); as decisões estão no [ADR-0030](../adr/0030-global-event-journal.md) e no [ADR-0042](../adr/0042-session-attention-state-in-the-journal.md).

## O journal

O journal é um único arquivo somente de acréscimo de linhas JSON, um evento por linha, no diretório de estado do host que também guarda o pool de slots de workers. Como é global, uma análise posterior consegue distinguir uma execução iniciada por `emet launch` ou `emet chain` de uma digitada à mão por uma pessoa: todo evento carrega seu repositório, seu host e uma origem `human` ou `auto`.

Os comandos existentes escrevem os eventos: o início de uma execução, uma decisão de gate, uma intervenção humana em uma onda sem supervisão, o resultado de um launch, um ticket fechado, uma limpeza, uma marca de baseline, e a integração, a aterrissagem ou o abandono de um branch de spec.

### O que ele nunca registra

Prompts, texto do assistente, entrada de hooks, variáveis de ambiente, argv, tokens, diffs e corpos de issues. Um evento guarda apenas ids, códigos, contagens, durações e um motivo curto. Um evento que passaria de 2 KiB perde seus dados e é marcado como truncado.

### Falhas e rotação

Um journal que não pode ser gravado nunca altera a saída nem o código de saída de um comando. Quando o arquivo passa de cerca de 10 MiB, o próximo acréscimo o move para um segmento numerado e mantém os cinco mais recentes. Em um sistema de arquivos de rede, gravações concorrentes podem se intercalar, então o `emet doctor` avisa, sem falhar, quando o diretório de estado está em um.

### Lendo o journal

O `emet insights` lê todos os segmentos e informa execuções por origem, decisões de gate, intervenções, resultados de launch, eventos de spec e tickets fechados. Por padrão cobre os eventos desde a última baseline; `--mark-baseline` começa a contar a partir de agora. Ele ignora as linhas que não consegue interpretar e as conta, e imprime um relatório zerado quando o journal está vazio. Como o arquivo é de linhas JSON simples, o `jq` também funciona nele. Veja a [referência da CLI](../reference/cli.md#runs-workers-and-slots).

## Atenção

Uma execução pode ficar bloqueada em um prompt de permissão ou em uma pergunta enquanto ninguém olha. A atenção responde à pergunta "alguma sessão precisa de mim?".

Cada sessão de uma execução do emet está em um de quatro estados:

- **working**: o agente está agindo.
- **needs-decision**: o agente espera por uma pessoa, por exemplo em um prompt de permissão ou em uma pergunta. "Bloqueado" é outra palavra para isso.
- **idle**: o agente parou e espera o próximo prompt.
- **ended**: a sessão terminou.

O hook `emet guard`, já instalado no host, percebe as transições e acrescenta um evento `session.attention` ao journal somente quando o estado muda, então não há um segundo armazenamento. Uma sessão conta como do emet quando roda em um worktree de worker do emet, ou em um repositório com uma configuração do emet e uma execução inacabada. No Codex não há eventos de notificação, então uma parada é idle, a menos que a execução tenha um resultado bloqueado, que é needs-decision.

O evento guarda o id da sessão, o estado antigo e o novo, o gatilho e o id da execução. Nunca guarda o texto da notificação, o nome da ferramenta nem a entrada da ferramenta. O registro nunca bloqueia: uma falha é engolida e o diálogo de permissão permanece inalterado.

### O alerta

Entrar em needs-decision dispara um alerta: uma marca de não lido do Orca no worktree quando o runtime do Orca está acessível, ou, caso contrário, uma notificação de desktop quando houver uma disponível. O emet nunca a limpa, e `attention.alert` a desativa.

### Onde você a vê

O `emet status` lista as sessões e seu estado, e uma sessão bloqueada eleva o estado geral para needs-decision mesmo quando nenhuma onda está em execução. O `emet fleet status` mostra o mesmo entre repositórios.

## Veja também

- [Execuções, ondas e specs](runs-waves-specs.md)
- [Segurança](security.md)
- [Referência de configuração](../reference/configuration.md) para `attention.alert`
