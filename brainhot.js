// Smoke test para o minigame BrainHot: loga com a primeira conta de
// accounts.json, entra no RankUp, digita /brainhot, clica no slot do ender
// pearl e faz dump máximo de estado (mensagens, janelas, inventário, tab
// list) no console para depurar o fluxo real do minigame.
const { loadAccounts, sleep, connectBot, describeReason, waitForEvent } = require('./common');
const { loginAndSwitchServer } = require('./flow');

// Slot 0-indexed do item de ender pearl na janela do /brainhot. Confirmado
// via contagem por linha (9 slots por linha, contando 1-9 em cada linha):
// linha 2, 5ª posição = 9 + (5-1) = 13.
const BRAINHOT_JOIN_SLOT = 13;

const WINDOW_OPEN_TIMEOUT_MS = 6000;
const WINDOW_CLOSE_TIMEOUT_MS = 5000;
const POST_CLICK_SPAWN_TIMEOUT_MS = 5000;
const AFTER_JOIN_SETTLE_MS = 3000;
const BEFORE_QUIT_DELAY_MS = 2000;

const START_TIME = Date.now();
function elapsed() {
  return ((Date.now() - START_TIME) / 1000).toFixed(1);
}
function log(msg) {
  console.log(`[+${elapsed()}s] ${msg}`);
}

function dumpInventory(bot, label) {
  log(`[INVENTORY - ${label}]`);
  bot.inventory.slots.forEach((item, idx) => {
    if (item) log(`  slot ${idx}: ${item.name} (${item.displayName}) x${item.count}`);
  });
  log(`  heldItem: ${bot.heldItem ? bot.heldItem.name : 'none'}`);
}

function dumpWindow(window) {
  log(`[WINDOW] id=${window.id} type=${window.type} title=${JSON.stringify(window.title)}`);
  window.slots.forEach((item, idx) => {
    if (item) log(`  window-slot ${idx}: ${item.name} (${item.displayName}) x${item.count}`);
  });
}

function logPlayers(bot, label) {
  const players = bot.players;
  const names = Object.keys(players);
  log(`[PLAYERS - ${label}] count=${names.length}`);
  names.forEach((name) => {
    const p = players[name];
    log(`  ${name} uuid=${p.uuid} ping=${p.ping} gamemode=${p.gamemode} displayName=${JSON.stringify(p.displayName ? p.displayName.toString() : null)} entityId=${p.entity ? p.entity.id : 'none'}`);
  });
  const playerEntities = Object.values(bot.entities).filter((e) => e.type === 'player');
  log(`[ENTITIES - ${label}] player-type entities loaded: ${playerEntities.length}`);
}

// Envia /brainhot, espera a janela abrir, faz dump dela, clica no slot do
// ender pearl e faz dump do estado pós-clique. Não faz settle aqui — os
// checkpoints de bot.players ficam a cargo do caller (main), pra poder medir
// a tab list em vários momentos.
async function joinBrainHot(bot) {
  log('-> /brainhot');
  bot.chat('/brainhot');

  const windowOpenedArgs = await waitForEvent(bot, 'windowOpen', WINDOW_OPEN_TIMEOUT_MS);
  if (!windowOpenedArgs) return { success: false, reason: 'janela do /brainhot não abriu' };

  const window = windowOpenedArgs[0];
  dumpWindow(window);

  const slotItem = window.slots[BRAINHOT_JOIN_SLOT];
  log(`[CHECK] slot ${BRAINHOT_JOIN_SLOT} contém: ${slotItem ? slotItem.name : '(vazio)'}`);

  dumpInventory(bot, 'antes do clique no slot do ender pearl');

  log(`-> clickWindow(${BRAINHOT_JOIN_SLOT})`);
  bot.clickWindow(BRAINHOT_JOIN_SLOT, 0, 0);

  const closed = await waitForEvent(bot, 'windowClose', WINDOW_CLOSE_TIMEOUT_MS);
  log(`[STEP] windowClose: ${closed ? 'recebido' : 'TIMEOUT - janela não fechou'}`);

  const spawned = await waitForEvent(bot, 'spawn', POST_CLICK_SPAWN_TIMEOUT_MS);
  log(`[STEP] spawn após clique: ${spawned ? 'recebido' : 'não recebeu novo spawn (pode ser normal)'}`);

  dumpInventory(bot, 'depois de entrar no brainhot');
  log(`[STATE] bot.game: ${JSON.stringify(bot.game)}`);
  const pos = bot.entity ? bot.entity.position : null;
  log(`[STATE] posição: ${pos ? `x=${pos.x.toFixed(1)} y=${pos.y.toFixed(1)} z=${pos.z.toFixed(1)}` : 'desconhecida'}`);

  return { success: true };
}

async function main() {
  const data = loadAccounts();
  const { server: config, password } = data;
  const account = data.accounts[0];

  log('='.repeat(60));
  log(account.username);
  log('='.repeat(60));

  const bot = await connectBot(account.username, config);
  bot.on('error', (err) => log(`[error] ${err.message}`));
  bot.on('kicked', (reason) => log(`[kicked] ${describeReason(reason)}`));
  bot.on('end', (reason) => log(`[end] ${describeReason(reason)}`));
  bot.on('message', (message) => log(`[MESSAGE] ${JSON.stringify(message.toString())}`));
  bot.on('windowOpen', (w) => log(`[EVENT windowOpen] id=${w.id} type=${w.type} title=${JSON.stringify(w.title)}`));
  bot.on('windowClose', (w) => log(`[EVENT windowClose] id=${w ? w.id : '?'}`));
  bot.on('spawn', () => {
    const pos = bot.entity ? bot.entity.position : null;
    log(`[EVENT spawn] dimension=${bot.game ? bot.game.dimension : 'unknown'} pos=${pos ? `x=${pos.x.toFixed(1)} y=${pos.y.toFixed(1)} z=${pos.z.toFixed(1)}` : 'unknown'}`);
  });
  bot.on('health', () => log(`[EVENT health] health=${bot.health} food=${bot.food}`));
  bot.on('respawn', () => log('[EVENT respawn]'));

  log('[STEP] login + troca para RankUp');
  const loginResult = await loginAndSwitchServer(bot, password);
  log(`[STEP] loginAndSwitchServer result: ${JSON.stringify(loginResult)}`);
  if (!loginResult.success) {
    bot.quit();
    process.exit(1);
  }

  log(`[STATE] bot.game após troca para RankUp: ${JSON.stringify(bot.game)}`);

  const joinResult = await joinBrainHot(bot);
  if (!joinResult.success) {
    log(`[FAIL] ${joinResult.reason}`);
    bot.quit();
    process.exit(1);
  }

  logPlayers(bot, 'logo após fechar a janela');

  await sleep(AFTER_JOIN_SETTLE_MS);
  log(`[STEP] settle de ${AFTER_JOIN_SETTLE_MS}ms concluído`);
  logPlayers(bot, 'após settle adicional');

  log(`[STEP] aguardando ${BEFORE_QUIT_DELAY_MS}ms antes de desligar`);
  await sleep(BEFORE_QUIT_DELAY_MS);
  logPlayers(bot, 'logo antes de desligar');

  log('[ENCERRANDO] desligando o bot');
  bot.quit();
  process.exit(0);
}

main().catch((err) => {
  console.error(`Erro fatal: ${err.message}`);
  process.exit(1);
});
