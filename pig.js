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

      bot.attack(current);
      await sleep(650);
    }
  } finally {
    bot.removeListener('entityDead', onDead);
    bot.removeListener('entityGone', onGone);
  }
}

// Distância angular mínima entre dois ângulos em radianos, considerando o wraparound de ±π.
function angleDiff(a, b) {
  let diff = Math.abs(a - b) % (2 * Math.PI);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return diff;
}

// Calcula posição do porco, a distância/ângulos que o bot precisaria mirar para
// atacá-lo (sem de fato rotacionar a câmera) e a rotação atual do bot (view
// yaw/pitch, ou seja: para onde o "player" está de fato olhando). Serve para
// comparação com a localização de referência salva no primeiro encontro.
function computeHitLocation(bot, pig) {
  const from = bot.entity.position.offset(0, bot.entity.height, 0);
  const to = pig.position.offset(0, pig.height / 2, 0);
  const delta = to.minus(from);
  const distance = delta.norm();
  const yaw = Math.atan2(-delta.x, -delta.z);
  const pitch = Math.atan2(delta.y, Math.sqrt(delta.x * delta.x + delta.z * delta.z));
  return {
    position: pig.position.clone(),
    distance,
    yaw,
    pitch,
    viewYaw: bot.entity.yaw,
    viewPitch: bot.entity.pitch
  };
}

const POSITION_TOLERANCE = 0.5; // blocos
const DISTANCE_TOLERANCE = 0.5; // blocos
const ANGLE_TOLERANCE = 0.05; // radianos (~3°)

// Considera "a mesma" situação só se posição, distância, ângulos de mira e a
// rotação atual do bot (view yaw/pitch) baterem com a referência dentro da
// tolerância. A rotação muda mesmo sem o bot se mover (ex: alguém/algo girando
// a câmera do player), por isso é comparada separadamente da mira geométrica.
function sameHitLocation(reference, current) {
  if (!reference || !current) return false;
  const posDiff = reference.position.distanceTo(current.position);
  const distDiff = Math.abs(reference.distance - current.distance);
  const yawDiff = angleDiff(reference.yaw, current.yaw);
  const pitchDiff = angleDiff(reference.pitch, current.pitch);
  const viewYawDiff = angleDiff(reference.viewYaw, current.viewYaw);
  const viewPitchDiff = angleDiff(reference.viewPitch, current.viewPitch);
  return (
    posDiff <= POSITION_TOLERANCE &&
    distDiff <= DISTANCE_TOLERANCE &&
    yawDiff <= ANGLE_TOLERANCE &&
    pitchDiff <= ANGLE_TOLERANCE &&
    viewYawDiff <= ANGLE_TOLERANCE &&
    viewPitchDiff <= ANGLE_TOLERANCE
  );
}

module.exports = {
  equipDiamondSword,
  findNearestPig,
  attackPigUntilDead,
  computeHitLocation,
  sameHitLocation
};
