// Focused diagnostic for the /pesca + /peixes step. Logs EVERY raw chat/system message
// so we can see the real server response instead of guessing at a regex.
const { loadAccounts, sleep, waitForEvent, connectBot, findItemByName, describeReason } = require('./common');
const { loginAndEnsureKit } = require('./flow');

const USERNAME = process.argv[2] || 'JuraPesca01';

async function run() {
  const data = loadAccounts();
  const { server: config, password } = data;
  const account = data.accounts.find((a) => a.username === USERNAME);
  if (!account) {
    console.error(`Conta ${USERNAME} não encontrada em accounts.json`);
    process.exit(1);
  }

  const bot = await connectBot(USERNAME, config);
  bot.on('error', (err) => console.log(`[error] ${err.message}`));
  bot.on('kicked', (reason) => console.log(`[kicked] ${describeReason(reason)}`));
  bot.on('end', (reason) => console.log(`[end] ${describeReason(reason)}`));
  bot.on('message', (message) => console.log(`[MESSAGE] ${JSON.stringify(message.toString())}`));

  console.log(`\n[STEP] login + kit para ${USERNAME}`);
  const loginResult = await loginAndEnsureKit(bot, password);
  console.log(`[STEP] loginAndEnsureKit result: ${JSON.stringify(loginResult)}`);
  if (!loginResult.success) {
    bot.quit();
    process.exit(1);
  }

  console.log(`\n[ACTION] /pesca`);
  bot.chat('/pesca');
  const forcedMove = await waitForEvent(bot, 'forcedMove', 6000);
  console.log(`[STEP] forcedMove: ${forcedMove ? 'received' : 'timeout (using fixed wait instead)'}`);
  await sleep(4000);

  const rod = findItemByName(bot, 'fishing_rod');
  console.log(`[STEP] fishing_rod in inventory: ${rod ? 'yes' : 'no'}`);
  if (rod) {
    console.log(`[ACTION] equip fishing_rod`);
    await bot.equip(rod, 'hand');
    console.log(`[STEP] heldItem after equip: ${bot.heldItem ? bot.heldItem.name : 'none'}`);
  }

  await sleep(1000);
  console.log(`\n[ACTION] /peixes (1st call, right after /pesca+equip)`);
  bot.chat('/peixes');
  await sleep(8000);

  console.log(`\n[ACTION] /peixes (2nd call, 8s later - in case of cooldown)`);
  bot.chat('/peixes');
  await sleep(8000);

  console.log(`\n[ACTION] right-click (activateItem) to start fishing`);
  bot.activateItem();
  await sleep(3000);

  console.log(`\n[ACTION] /peixes (3rd call, after activateItem)`);
  bot.chat('/peixes');
  await sleep(8000);

  console.log('\n[DONE]');
  bot.quit();
  process.exit(0);
}

run().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
