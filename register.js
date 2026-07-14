const mineflayer = require('mineflayer');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

const accountsFile = path.join(__dirname, 'accounts.json');
let accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));

const config = accounts.server;
const password = accounts.password;

// Start com JuraPesca02 (index 1)
const accountIndex = 1; // JuraPesca02
const account = accounts.accounts[accountIndex];

function resolveDNS(hostname) {
  return new Promise((resolve) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (!err && addresses.length > 0) {
        console.log(`✅ DNS resolvido para: ${addresses[0]}`);
        resolve(addresses[0]);
        return;
      }
      
      dns.setServers(['8.8.8.8', '8.8.4.4']);
      dns.resolve4(hostname, (err2, addresses2) => {
        if (!err2 && addresses2.length > 0) {
          console.log(`✅ Google DNS resolvido para: ${addresses2[0]}`);
          resolve(addresses2[0]);
        } else {
          console.log(`⚠️  Usando hostname direto...`);
          resolve(hostname);
        }
      });
    });
  });
}

async function start() {
  console.log(`\n🤖 Iniciando registro da conta: ${account.username}`);
  console.log(`📍 Servidor: ${config.host}:${config.port}`);
  console.log(`⏳ Conectando...\n`);

  const resolvedHost = await resolveDNS(config.host);

  const bot = mineflayer.createBot({
    host: resolvedHost,
    port: config.port,
    username: account.username,
    version: config.version,
    enforceBelowMinVersion: true
  });

  let registrationComplete = false;
  let chatTimeout;

  // Listener para mensagens do chat
  bot.on('chat', (username, message) => {
    console.log(`[${username}]: ${message}`);

    // Verificar se é a resposta de registro
    if (message.includes('registrado') || message.includes('Registrado') || message.includes('sucesso')) {
      console.log(`\n✅ Conta ${account.username} registrada com sucesso!`);
      registrationComplete = true;
      clearTimeout(chatTimeout);
      
      // Atualizar status na memória
      accounts.accounts[accountIndex].registered = true;
      accounts.accounts[accountIndex].status = 'registered';
      
      // Salvar arquivo
      fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
      console.log(`💾 Status atualizado em accounts.json\n`);
      
      setTimeout(() => {
        bot.quit();
        process.exit(0);
      }, 1000);
    }
    
    // Verificar se houve erro no registro
    if (message.includes('erro') || message.includes('Erro') || message.includes('already')) {
      console.error(`\n❌ ERRO ao registrar: ${message}`);
      console.error(`⚠️  Encerrando programa por erro no registro.`);
      bot.quit();
      process.exit(1);
    }
  });

  // Capturar TODAS as mensagens do sistema
  bot.on('systemChat', (message) => {
    console.log(`[SYSTEM]: ${message}`);
  });

  // Capturar mensagens gerais
  bot.on('message', (message) => {
    console.log(`[MESSAGE]: ${message.toString()}`);
  });

  bot.on('spawn', () => {
    console.log(`✅ Bot conectado!\n`);
    console.log(`📋 --- Mensagens do servidor ---\n`);
    
    // Aguardar 2s antes de enviar comando (dar tempo pro servidor processar)
    setTimeout(() => {
      console.log(`📤 Enviando comando: /registrar ${password} ${password}\n`);
      bot.chat(`/registrar ${password} ${password}`);
      
      // Timeout de 15s para resposta
      chatTimeout = setTimeout(() => {
        console.error(`\n❌ TIMEOUT: Nenhuma resposta do servidor após 15 segundos.`);
        console.error(`⚠️  Encerrando programa.`);
        bot.quit();
        process.exit(1);
      }, 15000);
    }, 2000);
  });

  bot.on('error', (err) => {
    console.error(`\n❌ ERRO DE CONEXÃO: ${err.message}`);
    console.error(`⚠️  Encerrando programa por erro de conexão.`);
    process.exit(1);
  });

  bot.on('end', () => {
    if (!registrationComplete) {
      console.error(`\n❌ Conexão encerrada sem completar o registro.`);
      console.error(`⚠️  Encerrando programa.`);
      process.exit(1);
    }
  });
}

start().catch(err => {
  console.error(`❌ Erro ao iniciar: ${err.message}`);
  process.exit(1);
});
