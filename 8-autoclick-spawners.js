// Fase 2 do fluxo de /autoclick: loga cada conta de accountspig.json, troca pro
// servidor RankUp, vai pro home "spawner" (já setado manualmente em cada conta),
// equipa a Diamond Sword (se disponível) e liga o /autoclick. As contas ficam
// conectadas indefinidamente depois disso - o processo não termina sozinho.
const fs = require('fs');
const path = require('path');
const { loadAccounts, sleep, connectBot, describeReason } = require('./common');
const { loginAndSwitchServer } = require('./flow');
const { equipDiamondSword } = require('./pig');

const ACCOUNTPIG_FILE = path.join(__dirname, 'accountspig.json');
const AFTER_HOME_SETTLE_MS = 3000;
const SWORD_WATCHDOG_INTERVAL_MS = 5 * 60 * 1000;
const TRANSIENT_RETRY_DELAY_MS = 8000;
const MAINTENANCE_RETRY_DELAY_MS = 60000;
const STAGGER_MS = 3000; // paces initial TCP connects/console output, not a safety net

function loadAccountpigUsernames() {
  const data = JSON.parse(fs.readFileSync(ACCOUNTPIG_FILE, 'utf8'));
  return data.accounts;
}

// Serializes only the fragile login/server-switch handshake so it's never attempted
// by more than one account at once (matches farm-all.js's proxy-safety pattern).
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
  bot.on('end', (reason) => console.log(`  [${username}] [end] ${describeReason(reason)}`));

  const result = await loginAndSwitchServer(bot, password);
  return { bot, result };
}

// Loga e troca pro RankUp com retry infinito - nunca desiste, porque todas as
// contas precisam ficar online. Falha por manutenção espera mais (60s) do que
// falha transitória (8s) antes de tentar de novo. Exceções lançadas durante a
// tentativa também causam retry (com delay transitório).
async function loginUntilOnline(username, config, password) {
  let attempt = 0;
  for (;;) {
    attempt++;
    let bot, result;
    try {
      ({ bot, result } = await withLoginLock(() => attemptLogin(username, config, password)));
    } catch (err) {
      console.log(`  [${username}] [FAIL] tentativa ${attempt}: ${err.message}`);
      console.log(`  [${username}] [retry] tentando de novo em ${TRANSIENT_RETRY_DELAY_MS / 1000}s`);
      await sleep(TRANSIENT_RETRY_DELAY_MS);
      continue;
    }

    if (result.success) return bot;

    bot.quit();
    console.log(`  [${username}] [FAIL] tentativa ${attempt}: ${result.reason}`);
    const delay = result.maintenance ? MAINTENANCE_RETRY_DELAY_MS : TRANSIENT_RETRY_DELAY_MS;
    console.log(`  [${username}] [retry] tentando de novo em ${delay / 1000}s`);
    await sleep(delay);
  }
}

// Confere o inventário a cada SWORD_WATCHDOG_INTERVAL_MS; assim que achar a Diamond
// Sword, equipa, loga sucesso e para de checar. Se o bot desconectar, limpa o interval
// para evitar promise rejections periódicas contra uma conexão morta.
function startSwordWatchdog(bot, username) {
  const interval = setInterval(async () => {
    const equipped = await equipDiamondSword(bot);
    if (equipped) {
      console.log(`  [${username}] [ok] espada encontrada e equipada`);
      clearInterval(interval);
    }
  }, SWORD_WATCHDOG_INTERVAL_MS);

  bot.once('end', () => {
    clearInterval(interval);
  });
}

async function processAccount(username, config, password) {
  const bot = await loginUntilOnline(username, config, password);
  console.log(`  [${username}] [ok] logado e no servidor RankUp`);

  console.log(`  [${username}] -> /home spawner`);
  bot.chat('/home spawner');
  await sleep(AFTER_HOME_SETTLE_MS);

  const equipped = await equipDiamondSword(bot);
  if (equipped) {
    console.log(`  [${username}] [ok] Diamond Sword equipada`);
  } else {
    console.log(`  [${username}] [aviso] sem Diamond Sword no inventário - dropar manualmente (checando de novo a cada 5min)`);
    startSwordWatchdog(bot, username);
  }

  console.log(`  [${username}] -> /autoclick`);
  bot.chat('/autoclick');
  console.log(`  [${username}] [ok] autoclick ligado, conta permanece online`);
}

async function main() {
  const data = loadAccounts();
  const { server: config, password } = data;
  const usernames = loadAccountpigUsernames();

  for (const username of usernames) {
    processAccount(username, config, password).catch((err) => {
      console.log(`  [${username}] [FATAL] ${err.message}`);
    });
    await sleep(STAGGER_MS);
  }

  console.log(`\nTodas as ${usernames.length} contas foram iniciadas. Processo permanece rodando (Ctrl+C para parar).`);
}

main().catch((err) => {
  console.error(`Erro fatal: ${err.message}`);
  process.exit(1);
});
