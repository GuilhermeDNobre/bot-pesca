# brainhot.js — teste de viabilidade do minigame BrainHot

## Contexto

O objetivo de longo prazo é conseguir "lotar" instâncias do minigame BrainHot
(que no servidor `nerdzone.gg` comporta exatamente 8 players por instância;
quando uma instância enche, o servidor cria uma nova instância vazia para o
próximo player que entrar). Para isso, o bot precisa ser capaz de ler
corretamente, via mineflayer, quantos e quais players estão na instância em
que a conta atual caiu — essa é a premissa que toda a fase seguinte (lotar
propositalmente com contas descartáveis, mandar contas "boas" para instâncias
vazias) depende.

Esta primeira iteração (`npm run brainhot`) não tenta lotar nada ainda. É um
smoke test com uma única conta: login, entra no BrainHot, lê a lista de
players da instância e desliga. O output serve para validar/depurar o fluxo
real do minigame (janela, slot, timing) antes de escalar para múltiplas
contas.

## Escopo

- Novo arquivo `brainhot.js` na raiz do projeto (mesmo padrão de arquivo único
  usado por `plot-jurapesca01.js`).
- Novo script `"brainhot": "node brainhot.js"` em `package.json`.
- Reaproveita `common.js` (`loadAccounts`, `sleep`, `connectBot`,
  `describeReason`, `waitForEvent`) e `flow.js` (`loginAndSwitchServer`) sem
  modificá-los.
- Sem persistência em arquivo — todo o output vai para o console (stdout),
  para ser copiado/colado e iterado em conversa.

## Fluxo

1. Carrega `accounts.json`, usa `data.accounts[0]` + `data.password`.
2. Conecta e loga (`loginAndSwitchServer`), que já cuida de `/logar` e da
   troca para o servidor de RankUp via o menu da bússola (slot 13 desse menu,
   já implementado em `flow.js` — não confundir com o slot 13 do menu do
   `/brainhot`, que é uma janela diferente).
3. Envia `/brainhot` no chat.
4. Espera o evento `windowOpen`; loga id/type/title da janela e o conteúdo de
   **todos** os slots preenchidos.
5. Clica no slot 13 (0-indexed) — item esperado: ender pearl.
6. Espera `windowClose`, depois corre `Promise.race` entre um novo `spawn` e
   um `sleep` de fallback, seguido de um settle fixo — o protocolo exato da
   troca de instância (se dispara `spawn` ou não) ainda não é conhecido, então
   o fluxo não trava nisso.
7. Loga o estado da tab list (`bot.players`, objeto bruto — username, uuid,
   ping) e as entidades tipo player carregadas (`bot.entities`), em 3
   checkpoints: logo após fechar a janela, após o settle, e logo antes de
   desligar.
8. Espera 2s.
9. `bot.quit()` e `process.exit(0)`.

Em qualquer etapa que falhar (janela não abre, timeout, kick, erro), loga o
motivo e sai com `process.exit(1)`. Sem retries — é um teste único e linear
(escala de robustez fica para quando o fluxo básico estiver confirmado).

## Logging (máximo detalhe, só console)

Segue o padrão já usado em `diagnose.js`/`diagnose-pesca.js`:

- Prefixo com timestamp relativo desde o início do script (`[+0.4s]`) em toda
  linha, para medir timing entre passos.
- `bot.on('message')`: dump cru de toda mensagem de chat/system
  (`JSON.stringify(message.toString())`).
- `bot.on('windowOpen')`: id, type, title, dump de todos os slots preenchidos
  (nome, displayName, count).
- `bot.on('windowClose')`, `bot.on('spawn')` (com posição/dimensão),
  `bot.on('health')`, `bot.on('respawn')`.
- `bot.on('error')`, `bot.on('kicked')`, `bot.on('end')` — sempre com
  `describeReason`.
- Dump de inventário completo (slot, nome, displayName, count, heldItem)
  antes e depois do clique no slot 13 — reaproveitando o padrão de
  `dumpInventory` de `diagnose.js`.
- `bot.game` logado após a troca para RankUp e após entrar no BrainHot.
- `bot.players` (objeto bruto completo) e contagem de entidades tipo player
  em `bot.entities`, nos 3 checkpoints do passo 7.

## Fora de escopo (fases futuras, não implementar agora)

- Orquestração multi-conta / lógica de "lotar" instâncias.
- Detecção de instância cheia vs vazia.
- Redirecionamento de contas "boas" para instâncias vazias.
- Persistência de estado em `accounts.json` (este script não marca nada como
  concluído).

## Verificação

- Rodar `npm run brainhot` manualmente com a rede e a conta reais, observar o
  console e confirmar visualmente: (a) a janela do `/brainhot` abre e o slot
  13 realmente é um ender pearl; (b) o bot entra na instância (via spawn/log
  de estado); (c) `bot.players` reflete os players que estão de fato na
  instância.
- Iteração esperada: como o comportamento real do servidor (timing, se
  `spawn` dispara, layout exato da janela) não é conhecido de antemão, o
  output de uma rodada real vai guiar ajustes no código antes de considerar
  este smoke test "funcionando".
