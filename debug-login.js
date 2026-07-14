const mineflayer = require('mineflayer');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

const accountsFile = path.join(__dirname, 'accounts.json');
let accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));

const config = accounts.server;
const password = accounts.password;

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

async function testLoginFlow() {
  console.log(`\n🤖 Testando fluxo de login com JuraPesca01\n`);
  
  const resolvedHost = await resolveDNS(config.host);

  const bot = mineflayer.createBot({
    host: resolvedHost,
    port: config.port,
    username: 'JuraPesca01',
    version: config.version,
    enforceBelowMinVersion: true
  });

  let step = 1;
  let isLoggedIn = false;

  bot.on('spawn', () => {
    console.log(`\n[STEP ${step++}] ✅ Bot spawned\n`);
    console.log(`[DEBUG] isLoggedIn: ${isLoggedIn}, isInServer: ${isInServer}\n`);
    
    if (!isLoggedIn) {
      setTimeout(() => {
        console.log(`[STEP ${step++}] 📤 Enviando /logar ${password}\n`);
        bot.chat(`/logar ${password}`);
      }, 2000);
    } else if (isInServer && !kitObtained) {
      setTimeout(() => {
        console.log(`[STEP ${step++}] 📦 Enviando comando /kit\n`);
        bot.chat('/kit');
      }, 2000);
    } else if (!isInServer) {
      setTimeout(() => {
        console.log(`[STEP ${step++}] 🖱️ Clicando com o direito na bussola "Servidores"\n`);
        bot.activateItem();
      }, 3000);
    }
  });

  bot.on('message', (message) => {
    const msg = message.toString();
    console.log(`[MESSAGE]: ${msg}`);
    
    if (msg.includes('Você logou com sucesso')) {
      isLoggedIn = true;
      console.log(`[LOGIN] ✅ Login bem-sucedido! Aguardando próximos passos...\n`);
    }
    
    if (msg.includes('recebeu') || msg.includes('kit') || msg.includes('iniciante')) {
      console.log(`[KIT] ✅ Kit recebido!\n`);
      kitObtained = true;
      
      setTimeout(() => {
        console.log(`[INVENTÁRIO] Verificando itens do kit:\n`);
        const items = bot.inventory.slots;
        items.forEach((item, index) => {
          if (item) {
            console.log(`  Slot ${index}: ${item.displayName || item.name} x${item.count}`);
          }
        });
        console.log('');
      }, 1000);
    }
  });

  bot.on('windowOpen', (window) => {
    console.log(`\n[STEP ${step++}] 📂 JANELA ABERTA!`);
    console.log(`   Title: ${window.title}`);
    console.log(`   Tipo: ${window.type}`);
    console.log(`   Slots: ${window.inventoryEnd}\n`);
    
    if (!isInServer) {
      setTimeout(() => {
        console.log(`[STEP ${step++}] 🖱️ Clicando no slot 14 (Servidor)\n`);
        bot.clickWindow(14, 0, 0);
        
        setTimeout(() => {
          console.log(`[STEP ${step++}] 📦 Enviando comando /kit iniciante\n`);
          bot.chat('/kit iniciante');
        }, 5000);
      }, 500);
    }
  });

  bot.on('windowClose', () => {
    console.log(`\n[STEP ${step++}] 📂 Janela fechada\n`);
    
    if (!kitObtained && isLoggedIn) {
      isInServer = true;
      console.log(`[INFO] ✅ Entrou no servidor! Próximo: /kit\n`);
    }
    
    if (kitObtained) {
      console.log(`[INFO] 🎣 Vara de pesca disponível no slot 8 do inventário\n`);
    }
  });

  let kitObtained = false;
  let isInServer = false;

  bot.on('login', () => {
    console.log(`\n[STEP ${step++}] ✅ Bot logado no servidor!\n`);
  });

  bot.on('end', (reason) => {
    console.log(`\n[STEP ${step++}] 🔌 Bot desconectado: ${reason}\n`);
  });

  bot.on('error', (err) => {
    console.error(`\n❌ ERRO: ${err.message}\n`);
    bot.quit();
    process.exit(1);
  });

  setTimeout(() => {
    console.log(`\n[TIMEOUT] Encerrando após 20 segundos`);
    bot.quit();
    process.exit(0);
  }, 20000);
}

testLoginFlow();
