const mineflayer = require('mineflayer');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

const accountsFile = path.join(__dirname, 'accounts.json');
let accountsData = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));

const config = accountsData.server;
const password = accountsData.password;
const accounts = accountsData.accounts;

function resolveDNS(hostname) {
  return new Promise((resolve) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (!err && addresses.length > 0) {
        resolve(addresses[0]);
        return;
      }
      dns.setServers(['8.8.8.8', '8.8.4.4']);
      dns.resolve4(hostname, (err2, addresses2) => {
        if (!err2 && addresses2.length > 0) {
          resolve(addresses2[0]);
        } else {
          resolve(hostname);
        }
      });
    });
  });
}

async function processAccount(username) {
  return new Promise(async (resolve) => {
    console.log(`\n${'='.repeat(50)}\n🤖 Processando conta: ${username}\n${'='.repeat(50)}\n`);
    
    const resolvedHost = await resolveDNS(config.host);

    const bot = mineflayer.createBot({
      host: resolvedHost,
      port: config.port,
      username: username,
      version: config.version,
      enforceBelowMinVersion: true
    });

    let step = 1;
    let loggedIn = false;
    let loginSent = false;
    let serverClicked = false;
    let kitCommandSent = false;
    let kitObtained = false;
    let kitTimeoutHandle;
    let overallTimeoutHandle;

    function clearKitTimeout() {
      if (kitTimeoutHandle) {
        clearTimeout(kitTimeoutHandle);
        kitTimeoutHandle = null;
      }
    }

    function clearOverallTimeout() {
      if (overallTimeoutHandle) {
        clearTimeout(overallTimeoutHandle);
        overallTimeoutHandle = null;
      }
    }

    bot.on('spawn', () => {
      console.log(`[STEP ${step++}] ✅ Bot spawned`);

      if (!loginSent) {
        loginSent = true;
        setTimeout(() => {
          console.log(`[STEP ${step++}] 📤 Enviando /logar ${password}`);
          bot.chat(`/logar ${password}`);
          overallTimeoutHandle = setTimeout(() => {
            console.log('[TIMEOUT] Conta não terminou em 30 segundos, encerrando.');
            bot.quit();
          }, 30000);
        }, 2000);
        return;
      }

      if (serverClicked && !kitCommandSent && loggedIn) {
        kitCommandSent = true;
        setTimeout(() => {
          console.log(`[STEP ${step++}] 📤 Enviando /kit iniciante`);
          bot.chat('/kit iniciante');
        }, 5000);
      }
    });

    bot.on('message', (message) => {
      const msg = message.toString();
      console.log(`[MESSAGE]: ${msg}`);

      if (!loggedIn && msg.includes('Você logou com sucesso')) {
        loggedIn = true;
        console.log(`[LOGIN] ✅ Login bem-sucedido!`);

        setTimeout(() => {
          console.log(`[STEP ${step++}] 🖱️ Clicando com o direito na bussola "Servidores"`);
          bot.activateItem();
        }, 5000);
      }

      if (kitObtained === false && msg.toLowerCase().includes('recebeu') && msg.toLowerCase().includes('kit')) {
        kitObtained = true;
        console.log(`[KIT] ✅ Kit recebido!`);

        clearKitTimeout();
        clearOverallTimeout();
        kitTimeoutHandle = setTimeout(() => {
          console.log(`[INVENTÁRIO] Itens do kit:`);
          const items = bot.inventory.slots;
          items.forEach((item, index) => {
            if (item) {
              console.log(`  Slot ${index}: ${item.displayName || item.name} x${item.count}`);
            }
          });
          bot.quit();
        }, 1000);
      }
    });

    bot.on('login', () => {
      console.log(`[STEP ${step++}] ✅ Bot logado no servidor!`);
    });

    bot.on('windowOpen', (window) => {
      console.log(`[STEP ${step++}] 📂 JANELA ABERTA!`);
      console.log(`   Tipo: ${window.type}`);

      if (!serverClicked) {
        serverClicked = true;
        console.log(`[STEP ${step++}] 🖱️ Clicando no slot 14 (Servidor)`);
        bot.clickWindow(14, 0, 0);
      }
    });

    bot.on('spawn', () => {
      if (serverClicked && !kitCommandSent && loggedIn) {
        kitCommandSent = true;
        setTimeout(() => {
          console.log(`[STEP ${step++}] 📤 Enviando /kit iniciante`);
          bot.chat('/kit iniciante');
        }, 5000);
      }
    });

    bot.on('error', (err) => {
      console.error(`[ERRO] ${err.message}`);
      bot.quit();
    });

    bot.on('end', () => {
      clearKitTimeout();
      clearOverallTimeout();
      resolve();
    });
  });
}

async function processAllAccounts() {
  console.log(`\n🚀 Iniciando processamento de ${accounts.length} contas\n`);
  
  for (const account of accounts) {
    await processAccount(account.username);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log(`\n${'='.repeat(50)}\n✅ Todas as contas foram processadas!\n${'='.repeat(50)}\n`);
  process.exit(0);
}

processAllAccounts();
