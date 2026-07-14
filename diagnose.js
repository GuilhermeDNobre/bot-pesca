const mineflayer = require('mineflayer');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

const accountsFile = path.join(__dirname, 'accounts.json');
const accountsData = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
const config = accountsData.server;
const password = accountsData.password;

function resolveDNS(hostname) {
  return new Promise((resolve) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (!err && addresses.length > 0) return resolve(addresses[0]);
      dns.setServers(['8.8.8.8', '8.8.4.4']);
      dns.resolve4(hostname, (err2, addresses2) => {
        if (!err2 && addresses2.length > 0) resolve(addresses2[0]);
        else resolve(hostname);
      });
    });
  });
}

function dumpInventory(bot, label) {
  console.log(`\n[INVENTORY DUMP - ${label}]`);
  const slots = bot.inventory.slots;
  slots.forEach((item, idx) => {
    if (item) console.log(`  slot ${idx}: ${item.name} (${item.displayName}) x${item.count}`);
  });
  console.log(`  heldItem: ${bot.heldItem ? bot.heldItem.name : 'none'}`);
}

function waitForEvent(bot, event, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const handler = (...args) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve(args);
    };
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      bot.removeListener(event, handler);
      resolve(null); // timeout
    }, timeoutMs);
    bot.once(event, handler);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const resolvedHost = await resolveDNS(config.host);
  console.log(`Connecting to ${resolvedHost}:${config.port} as JuraPesca01, version ${config.version}`);

  const bot = mineflayer.createBot({
    host: resolvedHost,
    port: config.port,
    username: 'JuraPesca01',
    version: config.version,
    enforceBelowMinVersion: true
  });

  bot.on('message', (message) => console.log(`[MESSAGE] ${message.toString()}`));
  bot.on('error', (err) => console.error(`[ERROR] ${err.message}`));
  bot.on('kicked', (reason) => console.error(`[KICKED] ${reason}`));
  bot.on('end', (reason) => console.log(`[EVENT] end: ${reason}`));
  bot.on('windowOpen', (w) => console.log(`[EVENT] windowOpen id=${w.id} title=${JSON.stringify(w.title)}`));
  bot.on('windowClose', (w) => console.log(`[EVENT] windowClose id=${w ? w.id : '?'}`));

  await waitForEvent(bot, 'spawn', 20000);
  console.log('[STEP] initial spawn ok');

  await sleep(2000);
  console.log(`[ACTION] /logar ${password}`);
  bot.chat(`/logar ${password}`);

  // Wait for the post-login respawn (server sends a fresh spawn after successful login).
  const respawned = await waitForEvent(bot, 'spawn', 10000);
  console.log(`[STEP] post-login spawn: ${respawned ? 'received' : 'TIMEOUT - did not respawn'}`);

  await sleep(1500);
  dumpInventory(bot, 'after login, before activateItem');

  // Retry loop: right-click held item until the server-select window actually opens.
  let windowOpened = null;
  for (let attempt = 1; attempt <= 5 && !windowOpened; attempt++) {
    console.log(`[ACTION] activateItem attempt ${attempt}`);
    bot.activateItem();
    windowOpened = await waitForEvent(bot, 'windowOpen', 4000);
    if (!windowOpened) console.log(`[WARN] attempt ${attempt}: window did not open within 4s`);
  }

  if (!windowOpened) {
    console.log('[FAIL] Could not open server-select window after 5 attempts.');
    bot.quit();
    process.exit(1);
  }

  const window = windowOpened[0];
  console.log(`[STEP] window opened: title=${JSON.stringify(window.title)} type=${window.type}`);
  window.slots.slice(0, 27).forEach((item, idx) => {
    if (item) console.log(`  chest-slot ${idx}: ${item.name} (${item.displayName}) x${item.count}`);
  });

  await sleep(500);
  console.log('[ACTION] clickWindow slot 13 (server select)');
  bot.clickWindow(13, 0, 0);

  const closed = await waitForEvent(bot, 'windowClose', 5000);
  console.log(`[STEP] windowClose: ${closed ? 'received' : 'TIMEOUT - window did not close'}`);

  // Wait to see if a server switch / respawn happens.
  const switched = await waitForEvent(bot, 'spawn', 10000);
  console.log(`[STEP] spawn after server-select click: ${switched ? 'received (server switched!)' : 'no new spawn event'}`);

  await sleep(2000);
  dumpInventory(bot, 'after server select');
  console.log(`[STATE] bot.game: ${JSON.stringify(bot.game)}`);

  console.log('[ACTION] /kit iniciante');
  bot.chat('/kit iniciante');
  await sleep(3000);
  dumpInventory(bot, 'after /kit iniciante');

  console.log('\n[DONE]');
  bot.quit();
  process.exit(0);
}

run().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
