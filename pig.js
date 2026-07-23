const { sleep } = require('./common');

// Makes sure the Diamond Sword is the item in hand. Returns false if it isn't in
// the inventory at all (caller decides how to handle that).
async function equipDiamondSword(bot) {
  if (bot.heldItem && bot.heldItem.name === 'diamond_sword') return true;

  const sword = bot.inventory.slots.find((item) => item && item.name === 'diamond_sword');
  if (!sword) return false;

  await bot.equip(sword, 'hand');
  return !!(bot.heldItem && bot.heldItem.name === 'diamond_sword');
}

function findNearestPig(bot) {
  return bot.nearestEntity((entity) => entity.name === 'pig');
}

// Swings at `pig` on a human-plausible cadence (matches a diamond sword's attack
// speed) until the server reports it dead, it disappears, or the bot disconnects.
async function attackPigUntilDead(bot, pig) {
  const targetId = pig.id;
  let dead = false;
  let gone = false;

  const onDead = (entity) => { if (entity.id === targetId) dead = true; };
  const onGone = (entity) => { if (entity.id === targetId) gone = true; };
  bot.on('entityDead', onDead);
  bot.on('entityGone', onGone);

  try {
    while (!dead && !gone) {
      const current = bot.entities[targetId];
      if (!current) break;

      // force:true faz a mira "colar" no porco instantaneamente. Sem isso, o mineflayer
      // rampeia o yaw/pitch em pequenos passos por tick (limitado a yawSpeed) até a mira
      // reportada alcançar o alvo, e só então a promise resolve - um giro grande pode levar
      // quase 1s. Se a água empurrar o bot durante essa rampa, a posição muda mas a mira já
      // calculada no início não é recalculada, e o hit sai no vento.
      await bot.lookAt(current.position.offset(0, current.height / 2, 0), true);
      // Com force:true o pacote de look só é enviado no próximo tick de física (updatePosition
      // roda a cada 50ms via setInterval), não na hora do await. Sem esperar esse tick, o
      // pacote de ataque pode sair primeiro e o servidor avalia o hit com a mira antiga.
      await bot.waitForTicks(1);
      bot.attack(current);
      await sleep(650);
    }
  } finally {
    bot.removeListener('entityDead', onDead);
    bot.removeListener('entityGone', onGone);
  }
}

module.exports = { equipDiamondSword, findNearestPig, attackPigUntilDead };
