# 7-home-spawners: design

## Contexto

O servidor liberou o comando `/autoclick`, que mata automaticamente qualquer
mob a cada 60 segundos. Isso torna obsoleto o fluxo manual de detectar e
atacar o porco que `pig.js` e `plot-jurapesca01.js` implementavam (achar o
porco mais próximo, comparar posição/ângulo com uma referência salva, ficar
batendo até morrer).

Antes de usar `/autoclick`, cada conta precisa ter um home chamado `spawner`
setado no local do spawner de porco (perto do jogador `Jurinha06`, que fica
parado ali). Esta é a "fase 1": gerar esse home em um lote de contas. A fase
2 (dropar espada, equipar, `/autoclick`) fica para depois — fora de escopo
deste spec.

## Escopo

1. Novo script `7-home-spawners.js`: loga cada conta de uma lista, troca pro
   servidor RankUp, dá `/tpa Jurinha06`, espera 10s, e dá `/sethome spawner`.
2. Nova config `spawners-accounts.json` (gitignored) com a lista de usernames
   dessa fase, separada do `accounts.json` principal.
3. Restructure de `pig.js`: remove a lógica de detecção/ataque de porco
   (obsoleta com `/autoclick`), mantém só `equipDiamondSword` (necessária na
   fase 2, para equipar a espada antes do `/autoclick`).
4. Remove `plot-jurapesca01.js` (dependia das funções removidas de `pig.js`
   e implementava o fluxo antigo, obsoleto).
5. Ajusta `package.json`: remove o script `plot`, adiciona
   `sethome-spawners`.

## Config: `spawners-accounts.json`

Novo arquivo, gitignored (mesmo tratamento de `accounts.json`), contendo só
os usernames a processar nesta fase — senha e `host`/`port` continuam vindo
do `accounts.json` existente (`data.server`, `data.password`).

```json
{
  "accounts": ["SuaConta01", "SuaConta02", "SuaConta03"]
}
```

Um `spawners-accounts.json.example` (committed) serve de template, no mesmo
padrão de `accounts.json.example`. `spawners-accounts.json` entra no
`.gitignore`.

## Fluxo de `7-home-spawners.js`

Processamento **sequencial**, uma conta por vez (a próxima só começa depois
que a anterior desconecta) — evita sobrecarregar `/tpa` na Jurinha06 com
pedidos simultâneos e segue o padrão de `kit-all-accounts.js`.

Para cada `username` em `spawners-accounts.json`:

1. `connectBot(username, config)`, com listeners de `error`/`kicked`/`end`
   (mesmo padrão dos outros scripts).
2. `loginAndSwitchServer(bot, password)` (reuso de `flow.js`), com retry de
   até 3 tentativas para falhas transitórias — mesmo padrão de
   `kit-all-accounts.js`/`plot-jurapesca01.js` (`MAX_ATTEMPTS = 3`,
   8s entre tentativas).
   - Se falhar após todas as tentativas: loga `[FAIL FINAL]`, `bot.quit()`,
     segue para a próxima conta (não aborta o lote).
   - Se `result.maintenance`: aborta o lote inteiro (servidor em
     manutenção — não adianta tentar as próximas contas agora).
3. Se o login/troca deu certo:
   - `bot.chat('/tpa Jurinha06')`
   - `await sleep(10000)` — espera fixa, sem checar mensagem de confirmação
     de teleporte (formato da mensagem do servidor ainda não é conhecido;
     10s fixos é o que foi pedido).
   - `bot.chat('/sethome spawner')`
   - pequeno `sleep` de settle (ex.: 1500ms) antes de desconectar, pra dar
     tempo do servidor processar o `/sethome` antes do `quit`.
   - loga sucesso.
4. `bot.quit()`, pequeno `sleep` (ex.: 1000ms) antes de seguir pra próxima
   conta.

Ao final, imprime um resumo (quantas contas tiveram sucesso / falha) e
`process.exit(0)`.

Sem persistência de status em JSON — `spawners-accounts.json` é só a lista
de usernames de entrada, não um arquivo de estado (diferente de
`accounts.json`, que já tem campos de status usados por outros scripts).

## `pig.js`: o que sai, o que fica

Remove (obsoleto com `/autoclick`):
- `findNearestPig`
- `attackPigUntilDead`
- `computeHitLocation`
- `sameHitLocation`
- `angleDiff`
- constantes `POSITION_TOLERANCE`, `DISTANCE_TOLERANCE`, `ANGLE_TOLERANCE`

Mantém:
- `equipDiamondSword` — vai ser usada na fase 2 (fora de escopo aqui), para
  garantir a espada equipada antes de mandar `/autoclick`.

## Remoções

- `plot-jurapesca01.js` — implementava o hunt-loop manual de porco, que
  dependia das funções removidas de `pig.js`. Sem mais uso.
- `package.json`: remove `"plot": "node plot-jurapesca01.js"`, adiciona
  `"sethome-spawners": "node 7-home-spawners.js"`.

## Fora de escopo (fase 2, depois)

Dropar a espada pra cada conta, equipar (`equipDiamondSword`), e mandar
`/autoclick`. Não implementado neste spec.
