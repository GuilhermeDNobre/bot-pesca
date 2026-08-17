// Manutenção pontual: loga cada conta de accountspig.json, troca pro servidor RankUp,
// vai pro home "spawner" e dropa todo o inventário, exceto a Diamond Sword (usada pra
// matar os spawners). Ao contrário do 8-autoclick-spawners.js, este processo termina
// sozinho depois que todas as contas passam por isso - rode "npm run autoclick" de novo
// em seguida pra religar o /autoclick.
const fs = require('fs');
const path = require('path');
const { loadAccounts, sleep, connectBot, describeReason } = require('./common');
const { loginAndSwitchServer } = require('./flow');

process.on('unhandledRejection', (err) => {
  console.log(`[unhandledRejection] ${err && err.message ? err.message : err}`);
});

const ACCOUNTPIG_FILE = path.join(__dirname, 'accountspig.json');
const AFTER_HOME_SETTLE_MS = 3000;
const AFTER_DROP_DELAY_MS = 300;
const TRANSIENT_RETRY_DELAY_MS = 8000;
const MAINTENANCE_RETRY_DELAY_MS = 60000;
const STAGGER_MS = 3000; // paces initial TCP connects/console output, not a safety net
const MAX_LOGIN_ATTEMPTS = 5; // one-shot maintenance run, doesn't retry forever like autoclick's phase 2

function loadAccountpigData() {
  const data = JSON.parse(fs.readFileSync(ACCOUNTPIG_FILE, 'utf8'));
  return { usernames: data.accounts, password: data.password };
}

// Serializes only the fragile login/server-switch handshake so it's never attempted
// by more than one account at once (matches farm-all.js / autoclick's proxy-safety pattern).
let loginQueue = Promise.resolve();
function withLoginLock(fn) {
  const run = loginQueue.then(fn, fn);
  loginQueue = run.then(() => {}, () => {});
  return run;
}

async function attemptLogin(username, config, password) {
  const bot = await connectBot(username, config);
  bot.on('error', (err) => console.log(`  [${username}] [error] ${err.message}`));
  bot.on('kicked', (reason) => console.log(`  [${username}] [kicked] ${describeReason(reason)}`));

  try {
    const result = await loginAndSwitchServer(bot, password);
    return { bot, result };
  } catch (err) {
    bot.quit();
    throw err;
  }
}

// Loga e troca pro RankUp com retry limitado (ao contrário do autoclick, que retenta pra
// sempre) - se não conseguir em MAX_LOGIN_ATTEMPTS, desiste dessa conta e segue pras outras.
async function loginUntilOnline(username, config, password) {
  for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt++) {
    let bot, result;
    try {
      ({ bot, result } = await withLoginLock(() => attemptLogin(username, config, password)));
    } catch (err) {
      console.log(`  [${username}] [FAIL] tentativa ${attempt}: ${err.message}`);
      if (attempt === MAX_LOGIN_ATTEMPTS) return null;
      console.log(`  [${username}] [retry] tentando de novo em ${TRANSIENT_RETRY_DELAY_MS / 1000}s`);
      await sleep(TRANSIENT_RETRY_DELAY_MS);
      continue;
    }

    if (result.success) return bot;

    bot.quit();
    console.log(`  [${username}] [FAIL] tentativa ${attempt}: ${result.reason}`);
    if (attempt === MAX_LOGIN_ATTEMPTS) return null;
    const delay = result.maintenance ? MAINTENANCE_RETRY_DELAY_MS : TRANSIENT_RETRY_DELAY_MS;
    console.log(`  [${username}] [retry] tentando de novo em ${delay / 1000}s`);
    await sleep(delay);
  }
  return null;
}

// Dropa todos os itens do inventário, exceto a Diamond Sword.
async function dropInventoryExceptSword(bot, username) {
  const items = bot.inventory.slots.filter((item) => item && item.name !== 'diamond_sword');
  if (items.length === 0) {
    console.log(`  [${username}] [ok] inventário já vazio (fora a espada)`);
    return;
  }

  for (const item of items) {
    await bot.tossStack(item);
    console.log(`  [${username}] [drop] ${item.count}x ${item.name}`);
    await sleep(AFTER_DROP_DELAY_MS);
  }
  console.log(`  [${username}] [ok] inventário dropado`);
}

async function processAccount(username, config, password) {
  const bot = await loginUntilOnline(username, config, password);
  if (!bot) {
    console.log(`  [${username}] [FATAL] não foi possível logar após ${MAX_LOGIN_ATTEMPTS} tentativas`);
    return;
  }
  console.log(`  [${username}] [ok] logado e no servidor RankUp`);

  console.log(`  [${username}] -> /home spawner`);
  bot.chat('/home spawner');
  await sleep(AFTER_HOME_SETTLE_MS);

  await dropInventoryExceptSword(bot, username);

  bot.quit();
  console.log(`  [${username}] [ok] desconectado`);
}

async function main() {
  const { server: config } = loadAccounts();
  const { usernames, password } = loadAccountpigData();

  const tasks = [];
  for (const username of usernames) {
    tasks.push(
      processAccount(username, config, password).catch((err) => {
        console.log(`  [${username}] [FATAL] ${err.message}`);
      })
    );
    await sleep(STAGGER_MS);
  }

  await Promise.all(tasks);
  console.log(`\nTodas as ${usernames.length} contas processadas. Rode "npm run autoclick" pra religar.`);
}

main().catch((err) => {
  console.error(`Erro fatal: ${err.message}`);
  process.exit(1);
});
