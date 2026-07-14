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

async function loginAndCollectKit(accountIndex) {
  const account = accounts.accounts[accountIndex];
  
  console.log(`\n🤖 Processando: ${account.username} (${accountIndex + 1}/10)`);
  
  return new Promise(async (resolve) => {
    const resolvedHost = await resolveDNS(config.host);

    const bot = mineflayer.createBot({
      host: resolvedHost,
      port: config.port,
      username: account.username,
      version: config.version,
      enforceBelowMinVersion: true
    });

    let phase = 'login'; // login -> select_server -> kit -> completed
    let timeout;

    bot.on('spawn', () => {
      console.log(`✅ ${account.username} conectado`);
      
      setTimeout(() => {
        console.log(`📤 Enviando /logar`);
        bot.chat(`/logar ${password}`);
        phase = 'login';
        
        // Esperar confirmação de login
        timeout = setTimeout(() => {
          console.error(`❌ TIMEOUT no login`);
          bot.quit();
          resolve(false);
        }, 8000);
      }, 2000);
    });

    bot.on('message', async (message) => {
      const msg = message.toString();

      // Após login bem-sucedido, clica com direito no item
      if (phase === 'login' && (msg.includes('bem-vindo') || msg.includes('logou') || msg.includes('segundos'))) {
        clearTimeout(timeout);
        phase = 'select_server';
        console.log(`✅ ${account.username} logado`);
        
        // Aguarda um pouco e clica com direito para abrir o baú
        setTimeout(() => {
          console.log(`🖱️  Clicando direito no item (slot 0)`);
          bot.activateItem(); // Click direito mantendo o item na mão
          
          timeout = setTimeout(() => {
            console.error(`❌ TIMEOUT ao abrir servidor`);
            bot.quit();
            resolve(false);
          }, 6000);
        }, 1000);
      }

      // Detecta abertura de window (baú do servidor)
      if (phase === 'select_server' && bot.currentWindow) {
        clearTimeout(timeout);
        console.log(`📦 Janela aberta, total de slots: ${bot.currentWindow.inventoryEnd}`);
        
        // Clica no slot 14 (opção RankUp)
        setTimeout(() => {
          console.log(`🖱️  Clicando no slot 14 (RankUp)`);
          bot.clickWindow(14, 0, 0); // slot 14
          
          timeout = setTimeout(() => {
            console.error(`❌ TIMEOUT ao selecionar servidor`);
            bot.quit();
            resolve(false);
          }, 6000);
        }, 500);
        
        phase = 'kit';
      }

      // Após selecionar servidor, usa /kit
      if (phase === 'kit' && msg.includes('servidor') || msg.includes('welcome')) {
        clearTimeout(timeout);
        console.log(`✅ Servidor selecionado`);
        
        setTimeout(() => {
          console.log(`📤 Enviando /kit`);
          bot.chat('/kit');
          
          timeout = setTimeout(() => {
            console.error(`❌ TIMEOUT ao abrir kit`);
            bot.quit();
            resolve(false);
          }, 6000);
        }, 1000);
      }

      // Quando a janela do kit abre
      if (phase === 'kit' && bot.currentWindow && msg.includes('kit')) {
        clearTimeout(timeout);
        console.log(`📦 Janela de kit aberta`);
        
        setTimeout(() => {
          console.log(`🖱️  Clicando no slot 22 (Kit Iniciante)`);
          bot.clickWindow(22, 0, 0);
          
          timeout = setTimeout(() => {
            console.error(`❌ TIMEOUT ao clicar kit`);
            bot.quit();
            resolve(false);
          }, 6000);
        }, 500);
      }
    });

    bot.on('windowOpen', (window) => {
      console.log(`📂 Janela aberta: ${window.title || 'Window'}`);
    });

    bot.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`❌ Erro: ${err.message}`);
      resolve(false);
    });

    bot.on('end', () => {
      clearTimeout(timeout);
      if (phase === 'completed' || phase === 'kit') {
        accounts.accounts[accountIndex].logged_in = true;
        accounts.accounts[accountIndex].kit_collected = true;
        accounts.accounts[accountIndex].status = 'kit_collected';
        console.log(`✅ ${account.username} - Kit coletado!`);
        resolve(true);
      }
    });
  });
}

async function start() {
  console.log(`\n📋 Iniciando login e coleta de kit...\n`);

  for (let i = 0; i < accounts.accounts.length; i++) {
    const success = await loginAndCollectKit(i);
    
    if (!success) {
      console.error(`\n❌ Falha em ${accounts.accounts[i].username}`);
      console.error(`⚠️  Encerrando.`);
      fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
      process.exit(1);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
  console.log(`\n✅ TODOS OS KITS COLETADOS!`);
  process.exit(0);
}

start();
