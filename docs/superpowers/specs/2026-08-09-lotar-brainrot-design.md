# lotar-brainrot.js — orquestrador multi-conta para lotar instâncias do BrainRot

## Contexto

`brainrot.js` (spec anterior: `2026-08-09-brainhot-design.md`) já validou, contra o
servidor real, que:

- `bot.players` é a tab list da rede inteira via proxy (1000+ nomes), inútil
  pra saber quem está na instância atual.
- O sinal confiável de ocupação é visual/físico: cada uma das 8 bases da
  arena BrainRot só ganha um bloco de `cut_sandstone` (no primeiro bloco
  acima do chão, coordenadas fixas) quando um jogador ocupa aquele slot.
  Slot vazio = `air`.
- Kicks transitórios do proxy (`BadPacketException`) durante o handshake de
  login/troca de servidor acontecem e precisam de retry (já implementado em
  `brainrot.js` com `MAX_ATTEMPTS = 3`).

Objetivo desta fase: usar esse sinal de ocupação pra **lotar propositalmente**
uma instância do BrainRot com contas "isca" (todas de `accounts.json`,
sequencialmente), até ela ficar cheia. O objetivo final (fora de escopo
aqui) é que, depois disso, uma conta separada ("alvo") ao entrar em
`/brainrot` seja automaticamente roteada pelo próprio servidor para uma
instância nova e vazia, já que a anterior está cheia.

As 9 contas de `accounts.json` (JuraPesca01-09) são as mesmas usadas por
`npm run farm` pra pescar AFK — enquanto estiverem conectadas lotando o
BrainRot, não estão pescando (uma conta só aguenta uma conexão por vez). O
usuário está ciente disso e decidiu usar essas contas mesmo assim.

O usuário sinalizou que vai pedir mudanças adicionais depois de ver este
primeiro incremento funcionando — este documento cobre só o que foi
acordado até agora.

## Escopo

- Extrai a lógica de entrar+detectar do `brainrot.js` (enviar `/brainrot`,
  clicar no slot do ender pearl, escanear as 8 bases) para um módulo
  compartilhado novo: `brainrot-flow.js`. Mesmo padrão de `flow.js`/`pig.js`
  já usado no projeto (módulo compartilhado + scripts orquestradores).
- `brainrot.js` passa a consumir esse módulo em vez de ter a lógica
  duplicada — comportamento externo dele (smoke test de 1 conta, loga e
  desliga) não muda.
- Novo script `lotar-brainrot.js` (`npm run lotar`), que usa
  `brainrot-flow.js` pra logar N contas de `accounts.json` sequencialmente,
  uma de cada vez, mantendo as que entraram certo conectadas/AFK.
- `FILLER_ACCOUNT_COUNT = 1` como constante no topo do arquivo — processa só
  a primeira conta de `accounts.json` nesta fase de teste. Fácil de
  aumentar (até 9) depois de validar o comportamento com 1.

## `brainrot-flow.js` (módulo compartilhado)

Exporta:

- `BRAINROT_JOIN_SLOT`, `BASE_SLOT_COORDS`, `OCCUPIED_BASE_BLOCK` (as
  mesmas constantes já existentes em `brainrot.js`, só movidas).
- `joinBrainrot(bot, log)` — mesma função já existente em `brainrot.js`
  (envia `/brainrot`, espera janela, dump da janela/inventário, clica no
  slot, espera fechar/spawn, dump de estado). Recebe uma função `log`
  injetada pelo caller (cada script tem seu próprio prefixo/formato de log;
  `brainrot.js` já usa timestamp relativo, `lotar-brainrot.js` vai
  prefixar por conta — ver abaixo).
- `countOccupiedBases(bot)` — versão que **retorna** a contagem (e a lista
  de resultados por slot) sem logar nada, pra quem chama decidir como/se
  loga. `logOccupiedBases(bot, label, log)` (usado pelo `brainrot.js`) fica
  como uma casca fina em cima dela, só pra log.
- `dumpInventory(bot, log)`, `dumpWindow(window, log)` — idem, recebendo
  `log` como parâmetro em vez de fechar sobre um `log` global do módulo
  (necessário porque `lotar-brainrot.js` roda várias contas ao mesmo tempo
  no mesmo processo — cada uma precisa do seu próprio prefixo de log,
  diferente do `brainrot.js` que só tem uma conta por execução).

`brainrot.js` mantém seu próprio `log()`/`elapsed()` com timestamp relativo
(comportamento atual, não muda) e passa essa função pras funções do módulo.

## `lotar-brainrot.js` — fluxo

1. Carrega `accounts.json`. Usa `data.accounts.slice(0, FILLER_ACCOUNT_COUNT)`
   como lista de contas isca.
2. Processa a lista **sequencialmente** (`for...of` com `await`, nunca em
   paralelo) — só avança pra próxima conta depois que a atual confirmou (ou
   falhou) sua entrada. Isso evita duas contas entrando ao mesmo tempo e
   caindo em instâncias diferentes por causa de timing, e também evita o
   proxy kickar por handshakes simultâneos (mesmo motivo documentado no
   `farm-all.js` pro `withLoginLock`).
3. Por conta, com prefixo de log `[username]`:
   - Conecta e loga + troca pra RankUp, com retry em kick/desconexão
     (`MAX_ATTEMPTS = 3`, mesmo padrão do `brainrot.js`).
   - Se falhar todas as tentativas: loga `[FAIL FINAL]`, desconecta essa
     conta, **continua** pra próxima da lista (uma conta falhar no login não
     deve travar as outras).
   - Chama `joinBrainrot` do módulo compartilhado.
   - Se falhar: loga `[FAIL]`, desconecta essa conta, continua pra próxima.
   - Se entrou: chama `countOccupiedBases`.
4. **Detecção de instância errada:** mantém `lastKnownOccupiedCount` (inicia
   em `0`, é atualizado a cada conta que entra com sucesso). Pra qualquer
   conta que não seja a primeira a entrar com sucesso no lote: se a
   contagem lida for `<= lastKnownOccupiedCount`, significa que essa conta
   não caiu na mesma instância que as anteriores (não lotou junto). Loga
   `[MISMATCH]` de forma bem visível, desconecta **só essa conta** (ela não
   está segurando slot útil) e **para de processar o restante da lista**
   (não tenta mais contas depois de um mismatch) — mesma filosofia do
   `handleLocationMismatch` em `pig.js`: parar e sinalizar pra investigação
   humana em vez de tentar adivinhar e continuar.
5. Conta que entrou certo (sem mismatch) **fica conectada/AFK**, sem
   desconectar sozinha.
6. Depois de processar toda a lista (ou parar por mismatch), o processo
   **continua rodando** (não dá `process.exit`) — as conexões dos bots bem
   sucedidos mantêm o event loop vivo. Loga uma linha final tipo "N contas
   ativas, Ctrl+C pra parar", igual ao padrão do `farm-all.js`.

## Fora de escopo (não implementar agora)

- Testar/logar a conta-alvo (a que deve cair na instância nova vazia) —
  isso é um passo manual/separado por enquanto.
- Persistir estado em `accounts.json` (esse fluxo não marca nada como
  concluído lá).
- Rodar mais de 1 conta de isca (fica pra depois de validar com 1 — só a
  constante `FILLER_ACCOUNT_COUNT` muda, a lógica de sequência/mismatch já
  cobre N>1).
- Qualquer mudança adicional que o usuário ainda vai detalhar depois de ver
  este incremento funcionando.

## Verificação

- `node -c lotar-brainrot.js` e `node -c brainrot-flow.js` (sintaxe).
- `node -c brainrot.js` continua passando depois da extração (sem
  regressão no smoke test existente).
- Rodar `npm run brainrot` (smoke test de 1 conta) de novo depois da
  extração, comparar o log com o comportamento anterior — deve ser
  idêntico (só a organização do código mudou, não o comportamento).
- Rodar `npm run lotar` manualmente com `FILLER_ACCOUNT_COUNT = 1`: deve
  logar a conta, confirmar entrada no BrainRot, mostrar a contagem de bases
  ocupadas, e manter o processo rodando (Ctrl+C pra parar) em vez de sair
  sozinho — essa é a mudança de comportamento chave em relação ao
  `brainrot.js` (que desliga em 2s).
