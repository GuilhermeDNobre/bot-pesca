// Loga a conta JuraPesca01, troca para o servidor de RankUp (mesmo fluxo de login
// das outras contas), vai para /home porco e fica batendo no porco que reaparece lá.
const { loadAccounts, sleep, connectBot, describeReason, waitForMessage } = require('./common');
const { loginAndSwitchServer } = require('./flow');
const { equipDiamondSword, findNearestPig, attackPigUntilDead, computeHitLocation, sameHitLocation } = require('./pig');

const USERNAME = 'messigoat';
const PASSWORD = '';
const MAX_ATTEMPTS = 3; // transient disconnects/proxy hiccups get a couple of automatic retries
const AFTER_KILL_DELAY_MS = 5000;
const INITIAL_CHECK_DELAY_MS = 3000;
const PIG_CHECK_MIN_MS = 13000;
const PIG_CHECK_MAX_MS = 20000;
const RUBIS_WAIT_MS = 5000;
const MISMATCH_QUIT_MIN_MS = 3 * 60 * 1000;
const MISMATCH_QUIT_MAX_MS = 5 * 60 * 1000;

function randomPigCheckDelay() {
  return PIG_CHECK_MIN_MS + Math.random() * (PIG_CHECK_MAX_MS - PIG_CHECK_MIN_MS);
}

function randomMismatchQuitDelay() {
  return MISMATCH_QUIT_MIN_MS + Math.random() * (MISMATCH_QUIT_MAX_MS - MISMATCH_QUIT_MIN_MS);
}

async function attemptLogin(config, password) {
  const bot = await connectBot(USERNAME, config);
  bot.on('error', (err) => console.log(`  [error] ${err.message}`));
  bot.on('kicked', (reason) => console.log(`  [kicked] ${describeReason(reason)}`));

  const result = await loginAndSwitchServer(bot, password);
  return { bot, result };
}

// Garante a Diamond Sword equipada, tentando de novo a cada 5s até conseguir.
async function ensureSwordEquipped(bot) {
  for (;;) {
    const equipped = await equipDiamondSword(bot);
    if (equipped) return;
    console.log(`  [warn] Diamond Sword não encontrada no inventário, tentando de novo em 5s`);
    await sleep(AFTER_KILL_DELAY_MS);
  }
}

// Verifica se há um porco por perto. Se a localização (posição/distância/ângulo) bater
// com a referência salva no primeiro encontro, bate nele até morrer, manda /rubis e mostra
// a resposta. Se divergir da referência, sinaliza mismatch sem atacar. Retorna
// { killed, mismatch, location } — location é a localização do porco encontrado nesta
// verificação (null se nenhum porco foi achado).
async function checkAndKillPig(bot, referenceLocation) {
  await ensureSwordEquipped(bot);

  const pig = findNearestPig(bot);
  if (!pig) return { killed: false, mismatch: false, location: null };

  const location = computeHitLocation(bot, pig);

  if (referenceLocation && !sameHitLocation(referenceLocation, location)) {
    console.log(`  [alerta] localização do porco (posição/distância/ângulo) diferente da referência`);
    return { killed: false, mismatch: true, location };
  }

  console.log(`  [porco] encontrado, atacando...`);
  await attackPigUntilDead(bot, pig);
  console.log(`  [porco] morto`);

  console.log(`  -> /rubis`);
  bot.chat('/rubis');
  const response = await waitForMessage(bot, () => true, RUBIS_WAIT_MS);
  console.log(`  [rubis] ${response !== null ? response : '(sem resposta)'}`);

  return { killed: true, mismatch: false, location };
}

// Porco apareceu em posição/distância/ângulo diferente da referência salva no primeiro
// encontro (possível armadilha/troca de local). Espera um tempo aleatório entre 3 e 5min
// antes de fechar a conta, para não desconectar imediatamente após a divergência.
async function handleLocationMismatch(bot) {
  const delay = randomMismatchQuitDelay();
  console.log(`  [alerta] aguardando ${Math.round(delay / 1000)}s antes de fechar a conta`);
  await sleep(delay);
  console.log(`  [encerrando] fechando a conta e finalizando o programa`);
  bot.quit();
  process.exit(0);
}

// Espera 3s (settle do teleporte), faz a primeira verificação de porco (sem encerrar
// o programa se não achar nada) e salva a localização do porco como referência. Daí em
// diante alterna espera aleatória (40-70s) + verificação, comparando sempre com a
// referência. Se uma verificação pós-espera não achar porco, encerra o programa; se achar
// um porco em localização divergente, encerra via handleLocationMismatch.
async function huntPigsForever(bot) {
  console.log(`  [aguardando] primeira verificação de porco em ${INITIAL_CHECK_DELAY_MS / 1000}s`);
  await sleep(INITIAL_CHECK_DELAY_MS);

  let referenceLocation = null;
  const first = await checkAndKillPig(bot, referenceLocation);
  if (first.mismatch) {
    await handleLocationMismatch(bot);
    return;
  }
  if (first.killed) {
    referenceLocation = first.location;
    console.log(`  [ref] localização de referência do porco salva`);
  }

  for (;;) {
    const delay = randomPigCheckDelay();
    console.log(`  [aguardando] próxima verificação de porco em ${Math.round(delay / 1000)}s`);
    await sleep(delay);

    const result = await checkAndKillPig(bot, referenceLocation);

    if (result.mismatch) {
      await handleLocationMismatch(bot);
      return;
    }

    if (!result.killed) {
      console.log(`  [FIM] nenhum porco encontrado após a espera, encerrando o programa`);
      process.exit(0);
    }

    if (!referenceLocation) {
      referenceLocation = result.location;
      console.log(`  [ref] localização de referência do porco salva`);
    }
  }
}

async function main() {
  const data = loadAccounts();
  const { server: config } = data;

  console.log(`\n${'='.repeat(60)}\n${USERNAME}\n${'='.repeat(60)}`);

  let bot;
  let result;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    ({ bot, result } = await attemptLogin(config, PASSWORD));
    if (result.success || result.maintenance) break;

    bot.quit();
    console.log(`  [FAIL] tentativa ${attempt}/${MAX_ATTEMPTS}: ${result.reason}`);
    if (attempt < MAX_ATTEMPTS) {
      console.log(`  [retry] provável falha transitória, tentando de novo em 8s`);
      await sleep(8000);
    }
  }

  if (!result.success) {
    console.log(`  [FAIL FINAL] ${result.reason}`);
    process.exit(1);
  }

  console.log(`  -> /home porco`);
  bot.chat('/home porco');

  console.log(`\nIniciando caça aos porcos (Ctrl+C para parar).`);
  await huntPigsForever(bot);
}

main().catch((err) => {
  console.error(`Erro fatal: ${err.message}`);
  process.exit(1);
});
