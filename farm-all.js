// Connects all accounts concurrently, logs in, ensures each has a Fishing Rod,
// sends them to /pesca and keeps them AFK-fishing indefinitely.
const { loadAccounts, saveAccounts, sleep, connectBot, describeReason } = require('./common');
const { loginAndEnsureKit, startAfkFishing, getPeixesCount } = require('./flow');

// Each login flow (spawn wait, /logar, server-select window, /kit) takes 60s+ and sends several
// bursts of packets (activateItem/clickWindow). At 8s stagger, 4-5 accounts end up mid-flow at
// once, and the proxy starts dropping/kicking with BadPacketException under that concurrent load.
const STAGGER_MS = 20000; // space out connections so fewer bots are mid-login at the same time
const MAX_LOGIN_ATTEMPTS = 3; // transient proxy kicks (BadPacketException) get a couple of retries

// Connects (or reconnects) until loginAndEnsureKit succeeds or attempts run out.
// Returns { bot, result } - bot is null if every attempt failed.
async function connectWithRetry(account, config, password) {
  let result;
  for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt++) {
    const bot = await connectBot(account.username, config);
    bot.on('error', (err) => console.log(`  [${account.username}] [error] ${err.message}`));
    bot.on('kicked', (reason) => console.log(`  [${account.username}] [kicked] ${describeReason(reason)}`));
    bot.on('end', (reason) => console.log(`  [${account.username}] [end] ${describeReason(reason)}`));

    result = await loginAndEnsureKit(bot, password);
    if (result.success) return { bot, result };

    bot.quit();
    console.log(`  [${account.username}] [FAIL] login/kit tentativa ${attempt}/${MAX_LOGIN_ATTEMPTS}: ${result.reason}`);
    if (result.maintenance) return { bot: null, result };
    if (attempt < MAX_LOGIN_ATTEMPTS) {
      console.log(`  [${account.username}] [retry] provável falha transitória, reconectando em 5s`);
      await sleep(5000);
    }
  }
  return { bot: null, result };
}

async function runAccount(account, config, password) {
  console.log(`\n${'='.repeat(60)}\n${account.username}: iniciando\n${'='.repeat(60)}`);

  const { bot, result: loginResult } = await connectWithRetry(account, config, password);
  if (!bot) {
    account.status = loginResult.maintenance ? 'blocked_maintenance' : 'error';
    console.log(`  [${account.username}] [FAIL FINAL] login/kit: ${loginResult.reason}`);
    return;
  }

  account.logged_in = true;
  account.kit_collected = true;

  const fishResult = await startAfkFishing(bot);
  if (!fishResult.success) {
    console.log(`  [${account.username}] [FAIL] pesca: ${fishResult.reason}`);
    account.status = 'fishing_failed';
    // Keep the bot connected even if the initial verification failed - better AFK than disconnected.
    return;
  }

  account.fishing_started = true;
  account.status = 'fishing';
  console.log(`  [${account.username}] [OK] pescando AFK (${fishResult.count} peixes)`);

  // Watchdog: every 5 minutes, make sure the fish count is still climbing; re-click if stuck.
  let lastCount = fishResult.count;
  setInterval(async () => {
    const current = await getPeixesCount(bot);
    if (current === null) return;
    if (current <= lastCount) {
      console.log(`  [${account.username}] [watchdog] contagem parada em ${current}, reativando vara`);
      bot.activateItem();
    } else {
      console.log(`  [${account.username}] [watchdog] ok, ${current} peixes`);
    }
    lastCount = current;
  }, 5 * 60 * 1000);
}

async function main() {
  const data = loadAccounts();
  const { server: config, password } = data;

  for (const account of data.accounts) {
    runAccount(account, config, password).catch((err) => {
      console.log(`  [${account.username}] [FATAL] ${err.message}`);
    });
    await sleep(STAGGER_MS);
  }

  // Periodically persist status snapshots; process stays alive to keep all bots connected.
  setInterval(() => saveAccounts(data), 30000);

  console.log(`\nTodas as ${data.accounts.length} contas foram iniciadas. Processo permanece rodando (Ctrl+C para parar).`);
}

main().catch((err) => {
  console.error(`Erro fatal: ${err.message}`);
  process.exit(1);
});
