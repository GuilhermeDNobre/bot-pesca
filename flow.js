const { sleep, waitForEvent, waitForMessage, findItemByName, describeReason } = require('./common');

const SERVER_SELECT_SLOT = 13; // "position 14" counted 1-indexed by a human = slot 13 (0-indexed)

// Logs a bot into the network and makes sure it has a Fishing Rod (via the RankUp
// server-select + /kit iniciante flow). Does NOT quit the bot - caller owns the connection.
// Resolves { success, reason, maintenance, disconnected }.
async function loginAndEnsureKit(bot, password) {
  // Track any disconnect that happens mid-flow so failures report the real cause
  // (e.g. an anti-cheat kick) instead of the downstream symptom.
  let endReason;
  let gotEndReason = false;
  const onEnd = (reason) => { endReason = reason; gotEndReason = true; };
  bot.once('end', onEnd);
  const fail = (reason) => {
    bot.removeListener('end', onEnd);
    if (gotEndReason) {
      return { success: false, reason: `desconectado: ${describeReason(endReason)}`, disconnected: true };
    }
    return { success: false, reason };
  };

  const initialSpawn = await waitForEvent(bot, 'spawn', 20000);
  if (!initialSpawn) return fail('no initial spawn');

  await sleep(1500);
  console.log(`  -> /logar ${password}`);
  bot.chat(`/logar ${password}`);

  const loginMsg = await waitForMessage(
    bot,
    (t) => t.includes('logou com sucesso') || t.toLowerCase().includes('senha incorreta'),
    10000
  );
  if (!loginMsg || !loginMsg.includes('logou com sucesso')) {
    return fail(`login failed: ${loginMsg || 'timeout'}`);
  }
  console.log(`  [ok] logado`);

  await waitForEvent(bot, 'spawn', 8000);
  await sleep(1500);
  if (gotEndReason) return fail();

  // The Fishing Rod only exists on the RankUp server, never in the hub - so there's no
  // point checking for it before the server-select click. Only check after switching.
  let windowOpened = null;
  for (let attempt = 1; attempt <= 5 && !windowOpened && !gotEndReason; attempt++) {
    bot.activateItem();
    windowOpened = await waitForEvent(bot, 'windowOpen', 4000);
    if (!windowOpened) console.log(`  [retry ${attempt}] janela de seleção não abriu, tentando de novo`);
  }
  if (!windowOpened) return fail('server-select window never opened');

  await sleep(500);
  bot.clickWindow(SERVER_SELECT_SLOT, 0, 0);
  await waitForEvent(bot, 'windowClose', 5000);
  if (gotEndReason) return fail();

  const maintenanceOrSwitch = await Promise.race([
    waitForMessage(bot, (t) => t.includes('manutenção'), 6000).then((t) => t && { maintenance: true, text: t }),
    waitForEvent(bot, 'spawn', 6000).then((r) => r && { maintenance: false, switched: true })
  ]);

  if (maintenanceOrSwitch && maintenanceOrSwitch.maintenance) {
    console.log(`  [blocked] servidor em manutenção: ${maintenanceOrSwitch.text}`);
    bot.removeListener('end', onEnd);
    return { success: false, reason: 'server maintenance', maintenance: true };
  }
  if (gotEndReason) return fail();

  await sleep(2000);

  let rod = findItemByName(bot, 'fishing_rod');
  if (!rod && !gotEndReason) {
    console.log(`  -> /kit iniciante`);
    bot.chat('/kit iniciante');
    await sleep(3000);
    rod = findItemByName(bot, 'fishing_rod');
  }

  if (!rod && !gotEndReason) {
    console.log(`  [retry] Fishing Rod não apareceu, tentando /kit iniciante de novo`);
    bot.chat('/kit iniciante');
    await sleep(3000);
    rod = findItemByName(bot, 'fishing_rod');
  }

  if (!rod) return fail('Fishing Rod not received after /kit iniciante');

  console.log(`  [ok] Fishing Rod recebida`);
  bot.removeListener('end', onEnd);
  return { success: true, reason: 'kit collected' };
}

// Parses "Você possui X Peixes." from a /peixes response. Handles both plain integers
// ("Você possui 850 Peixes.") and abbreviated counts once past 1000 ("Você possui 2.15K Peixes.").
// Returns null if not a match.
function parsePeixesCount(text) {
  const match = text.match(/possui\s+([\d.,]+)\s*([KMB]?)\s+Peixes/i);
  if (!match) return null;

  const num = parseFloat(match[1].replace(/,/g, ''));
  if (Number.isNaN(num)) return null;

  const multipliers = { K: 1e3, M: 1e6, B: 1e9 };
  const multiplier = multipliers[match[2].toUpperCase()] || 1;
  return Math.round(num * multiplier);
}

async function getPeixesCount(bot) {
  bot.chat('/peixes');
  const msg = await waitForMessage(bot, (t) => parsePeixesCount(t) !== null, 8000);
  return msg ? parsePeixesCount(msg) : null;
}

// Sends the bot to the fishing area, equips the rod and starts AFK fishing.
// Verifies via /peixes that the count is actually increasing before declaring success.
async function startAfkFishing(bot) {
  console.log(`  -> /pesca`);
  bot.chat('/pesca');
  await Promise.race([waitForEvent(bot, 'forcedMove', 6000), sleep(4000)]);
  await sleep(1000);

  const rod = findItemByName(bot, 'fishing_rod');
  if (!rod) return { success: false, reason: 'no Fishing Rod in inventory at fishing spot' };

  await bot.equip(rod, 'hand');
  await sleep(500);

  const baseline = await getPeixesCount(bot);
  if (baseline === null) return { success: false, reason: '/peixes did not return a parseable count' };
  console.log(`  [info] contagem inicial: ${baseline} peixes`);

  bot.activateItem();

  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(20000);
    const current = await getPeixesCount(bot);
    if (current === null) {
      console.log(`  [warn] não consegui ler /peixes na tentativa ${attempt}`);
      continue;
    }
    console.log(`  [check ${attempt}] ${current} peixes (era ${baseline})`);
    if (current > baseline) {
      console.log(`  [ok] pesca AFK confirmada funcionando`);
      return { success: true, reason: 'fishing confirmed', count: current };
    }
    console.log(`  [retry] contagem não aumentou, clicando na vara de novo`);
    bot.activateItem();
  }

  return { success: false, reason: 'fish count never increased after 3 attempts' };
}

module.exports = { loginAndEnsureKit, startAfkFishing, parsePeixesCount, getPeixesCount };
