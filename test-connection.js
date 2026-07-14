const dns = require('dns');
const { exec } = require('child_process');
const mineflayer = require('mineflayer');

function resolveDNS(hostname) {
  return new Promise((resolve) => {
    // Tenta com DNS padrão primeiro
    dns.resolve4(hostname, (err, addresses) => {
      if (!err && addresses.length > 0) {
        console.log(`✅ DNS resolvido para: ${addresses[0]}`);
        resolve(addresses[0]);
        return;
      }
      
      // Se falhar, tenta com Google DNS (8.8.8.8)
      console.log(`⚠️  DNS padrão falhou, tentando com Google DNS...`);
      const dnsLookup = require('dns');
      dnsLookup.setServers(['8.8.8.8', '8.8.4.4']);
      
      dns.resolve4(hostname, (err2, addresses2) => {
        if (!err2 && addresses2.length > 0) {
          console.log(`✅ Google DNS resolvido para: ${addresses2[0]}`);
          resolve(addresses2[0]);
        } else {
          console.log(`⚠️  Ambos os DNS falharam, usando hostname direto...`);
          resolve(hostname);
        }
      });
    });
  });
}

async function test() {
  console.log('🧪 Testando conexão com nerdzone.gg...\n');

  const resolvedHost = await resolveDNS('nerdzone.gg');

  console.log(`\n2️⃣  Conectando com mineflayer...`);
  console.log(`   Host: ${resolvedHost}`);
  console.log(`   Port: 25565\n`);

  try {
    const bot = mineflayer.createBot({
      host: resolvedHost,
      port: 25565,
      username: 'TestBot',
      version: '1.21.11',
      enforceBelowMinVersion: true
    });

    bot.once('spawn', () => {
      console.log('✅ Conectado com sucesso!');
      bot.quit();
      process.exit(0);
    });

    bot.once('error', (err) => {
      console.error(`❌ Erro: ${err.message}`);
      console.error(`\n💡 Talvez o problema seja de DNS no seu ISP/rede.`);
      console.error(`   Tenta adicionar Google DNS no seu Windows:`);
      console.error(`   Configurações > Rede > WiFi > Editar DNS > 8.8.8.8`);
      process.exit(1);
    });

    setTimeout(() => {
      console.error('❌ Timeout após 15 segundos');
      bot.quit();
      process.exit(1);
    }, 15000);

  } catch (err) {
    console.error(`❌ Erro: ${err.message}`);
    process.exit(1);
  }
}

test();
