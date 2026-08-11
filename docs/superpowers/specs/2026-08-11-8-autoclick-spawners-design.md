# 8-autoclick-spawners: design

## Contexto

Fase 1 (`7-home-spawners.js`, spec `2026-08-11-7-home-spawners-design.md`) foi
feita manualmente pelo usuário via TPA em vez de rodar o script — todas as
contas já têm o home `spawner` setado. Esta é a fase 2: logar cada conta,
mandar pro home `spawner`, equipar a Diamond Sword e ligar o `/autoclick`
(que mata mobs automaticamente a cada 60s enquanto a conta está online).

Diferente da fase 1 (sequencial, uma conta por vez, desconecta ao final),
aqui as contas devem ficar **conectadas indefinidamente** rodando
`/autoclick` — o processo não termina.

## Escopo

1. Novo script `8-autoclick-spawners.js`: loga cada conta de
   `accountspig.json`, troca pro servidor RankUp, dá `/home spawner`, equipa
   a Diamond Sword (se disponível) e dá `/autoclick`. As contas ficam
   conectadas depois disso.
2. Nova config `accountspig.json` (gitignored, sem arquivo `.example` —
   dispensado a pedido do usuário) com a lista de usernames desta fase.
   Senha e `host`/`port` continuam vindo do `accounts.json` existente.
3. Ajusta `package.json`: adiciona `"autoclick-spawners": "node
   8-autoclick-spawners.js"`.
4. `pig.js` e `plot-jurapesca01.js` não são tocados — fora de escopo.

## Config: `accountspig.json`

Mesmo formato usado em `spawners-accounts.json` (fase 1), gitignored (mesmo
tratamento de `accounts.json`):

```json
{
  "accounts": ["SuaConta01", "SuaConta02", "SuaConta03"]
}
```

## Fluxo de `8-autoclick-spawners.js`

Login **concorrente com lock no handshake** (padrão de `farm-all.js`): só um
login/troca de servidor por vez para não sobrecarregar o proxy, mas depois
do handshake as contas seguem em paralelo, todas ficando conectadas.

Para cada `username` em `accountspig.json`, disparado de forma independente
(erros de uma conta não afetam as outras):

1. **Login com retry infinito** — não desiste nunca, porque o requisito é
   "sempre precisa de todas as contas online":
   - `connectBot(username, config)` com listeners de `error`/`kicked`/`end`.
   - `loginAndSwitchServer(bot, password)` (reuso de `flow.js`, sem
     modificar), serializado por `withLoginLock()`.
   - Se falhar: `bot.quit()`, loga `[FAIL] tentativa N: motivo`.
     - Se o motivo for manutenção do servidor: espera 60s e tenta de novo
       (mesma conta — não aborta o lote, diferente do padrão da fase 1).
     - Qualquer outra falha (transitória): espera 8s e tenta de novo.
   - Repete até um `loginAndSwitchServer` bem-sucedido. Sem limite de
     tentativas.
2. Login OK:
   - `bot.chat('/home spawner')`
   - `sleep` de settle fixo (ex.: 3000ms) — sem checar mensagem de
     confirmação (formato desconhecido, mesma decisão da fase 1).
   - Tenta `equipDiamondSword(bot)` (reuso de `pig.js`, sem alterações).
     - Se achou e equipou: loga sucesso.
     - Se **não achou** a espada no inventário: loga aviso citando o
       `username` (para o usuário dropar a espada manualmente naquela
       conta), e liga um watchdog (`setInterval`, 5 minutos) que confere de
       novo o inventário; assim que achar a espada, equipa, loga sucesso e
       para o watchdog (`clearInterval`) — não fica checando pra sempre
       depois de resolvido.
   - `bot.chat('/autoclick')` — enviado sempre, com ou sem espada
     equipada (o comando liga o auto-kill do servidor; a espada só afeta
     o dano, não é pré-requisito pra ligar o autoclick).
3. Bot permanece conectado. Sem `bot.quit()` nesse fluxo (diferente da fase
   1) — o processo continua rodando com todas as contas online até ser
   interrompido manualmente (Ctrl+C), igual `farm-all.js`.

Sem abort de lote por manutenção (diferente da fase 1): cada conta trata sua
própria manutenção com o wait mais longo e continua tentando sozinha; as
demais contas não são afetadas.

## Fora de escopo

- Persistência de status em JSON (igual fase 1 — `accountspig.json` é só
  lista de entrada).
- Verificação periódica de que o `/autoclick` continua ativo (não pedido;
  diferente do watchdog de pesca do `farm-all.js`, que existe porque a vara
  de pesca precisa ser reativada manualmente).
- Alterações em `pig.js` / `plot-jurapesca01.js`.
