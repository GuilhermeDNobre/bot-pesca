const { loadAccounts, saveAccounts, sleep, connectBot, describeReason } = require('./common');
const { loginAndEnsureKit } = require('./flow');

async function processAccount(account, config, password) {
  console.log(`\n${'='.repeat(60)}\n${account.username}\n${'='.repeat(60)}`);

  const bot = await connectBot(account.username, config);
  bot.on('error', (err) => console.log(`  [error] ${err.message}`));
  bot.on('kicked', (reason) => console.log(`  [kicked] ${describeReason(reason)}`));

  try {
    return await loginAndEnsureKit(bot, password);
  } finally {
    bot.quit();
    await sleep(1000);
  }
}

const MAX_ATTEMPTS = 3; // transient disconnects/proxy hiccups get a couple of automatic retries

async function main() {
  const data = loadAccounts();
  const { server: config, password } = data;

  for (const account of data.accounts) {
    if (account.kit_collected) {
      console.log(`\n${account.username}: já marcado como kit_collected, pulando.`);
      continue;
    }

    let result;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      result = await processAccount(account, config, password);
      if (result.success || result.maintenance) break;

      console.log(`  [FAIL] ${account.username} (tentativa ${attempt}/${MAX_ATTEMPTS}): ${result.reason}`);
      if (attempt < MAX_ATTEMPTS) {
        console.log(`  [retry] provável falha transitória, tentando de novo em 8s`);
        await sleep(8000);
      }
    }

    if (result.success) {
      account.logged_in = true;
      account.kit_collected = true;
      account.status = 'kit_collected';
    } else {
      account.status = result.maintenance ? 'blocked_maintenance' : 'error';
      console.log(`  [FAIL FINAL] ${account.username}: ${result.reason}`);
    }
    saveAccounts(data);

    if (result.maintenance) {
      console.log(`\nServidor em manutenção — abortando o restante do lote. Rode de novo mais tarde.`);
      break;
    }

    await sleep(3000);
  }

  console.log('\nProcessamento finalizado.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`Erro fatal: ${err.message}`);
  process.exit(1);
});
