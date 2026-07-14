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

async function registerAccount(accountIndex) {
  const account = accounts.accounts[accountIndex];
  
  console.log(`\n🤖 Registrando: ${account.username} (${accountIndex + 1}/15)`);
  
  return new Promise(async (resolve) => {
    const resolvedHost = await resolveDNS(config.host);

    const bot = mineflayer.createBot({
      host: resolvedHost,
      port: config.port,
      username: account.username,
      version: config.version,
      enforceBelowMinVersion: true
    });

    let timeout;
    let registered = false;

    bot.on('spawn', () => {
      setTimeout(() => {
        bot.chat(`/registrar ${password} ${password}`);
        
        timeout = setTimeout(() => {
          if (!registered) {
            console.error(`❌ TIMEOUT na conta ${account.username}`);
            registered = true;
            bot.quit();
            resolve(false);
          }
        }, 12000);
      }, 3000);
    });

    bot.on('message', (message) => {
      const msg = message.toString();
      
      if (!registered && (msg.includes('já foi registrado') || msg.includes('already'))) {
        registered = true;
        clearTimeout(timeout);
        accounts.accounts[accountIndex].registered = true;
        accounts.accounts[accountIndex].status = 'registered';
        console.log(`✅ ${account.username} - Registrada`);
        bot.quit();
        resolve(true);
      }
    });

    bot.on('error', (err) => {
      if (!registered) {
        registered = true;
        clearTimeout(timeout);
        console.error(`❌ Erro na conta ${account.username}: ${err.message}`);
        resolve(false);
      }
    });

    bot.on('end', () => {
      clearTimeout(timeout);
    });
  });
}

async function start() {
  console.log(`\n📋 Iniciando registro em lote...\n`);
  console.log(`Servidor: ${config.host}:${config.port}`);
  console.log(`Começando da conta: JuraPesca02\n`);

  // Começar do índice 1 (JuraPesca02) pois JuraPesca01 já está registrada
  for (let i = 1; i < accounts.accounts.length; i++) {
    const success = await registerAccount(i);
    
    if (!success) {
      console.error(`\n❌ FALHA ao registrar ${accounts.accounts[i].username}`);
      console.error(`⚠️  Encerrando. Tente novamente depois.`);
      fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
      process.exit(1);
    }
    
    // Delay MAIOR entre contas para evitar conflitos
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Salvar progresso
  fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
  
  console.log(`\n✅ TODAS AS CONTAS REGISTRADAS COM SUCESSO!`);
  console.log(`💾 accounts.json atualizado\n`);
  process.exit(0);
}

start().catch(err => {
  console.error(`❌ Erro: ${err.message}`);
  process.exit(1);
});
