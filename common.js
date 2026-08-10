const mineflayer = require('mineflayer');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');

function loadAccounts() {
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
}

function saveAccounts(data) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2));
}

function resolveDNS(hostname) {
  return new Promise((resolve) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (!err && addresses.length > 0) return resolve(addresses[0]);
      dns.setServers(['8.8.8.8', '8.8.4.4']);
      dns.resolve4(hostname, (err2, addresses2) => {
        if (!err2 && addresses2.length > 0) resolve(addresses2[0]);
        else resolve(hostname);
      });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Waits for the next occurrence of `event`, or null on timeout / early disconnect.
function waitForEvent(bot, event, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      bot.removeListener(event, handler);
      bot.removeListener('end', onEnd);
      resolve(value);
    };
    const handler = (...args) => finish(args);
    const onEnd = () => finish(null);
    const t = setTimeout(() => finish(null), timeoutMs);
    bot.once(event, handler);
    bot.once('end', onEnd);
  });
}

// Waits until `predicate(text)` is true for some chat/system message, or null on timeout / early disconnect.
// Registers its own 'message' listener and cleans it up regardless of outcome.
function waitForMessage(bot, predicate, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      bot.removeListener('message', handler);
      bot.removeListener('end', onEnd);
      resolve(value);
    };
    const handler = (message) => {
      const text = message.toString();
      if (predicate(text)) finish(text);
    };
    const onEnd = () => finish(null);
    const t = setTimeout(() => finish(null), timeoutMs);
    bot.on('message', handler);
    bot.once('end', onEnd);
  });
}

async function connectBot(username, config, extraOptions = {}) {
  const resolvedHost = await resolveDNS(config.host);
  return mineflayer.createBot({
    host: resolvedHost,
    port: config.port,
    username,
    version: config.version,
    enforceBelowMinVersion: true,
    ...extraOptions
  });
}

function findItemByName(bot, name) {
  return bot.inventory.slots.find((item) => item && item.name === name) || null;
}

// Turns a kick/end reason (string, JSON string, or Minecraft chat-component object)
// into readable text instead of "[object Object]".
function describeReason(reason) {
  if (reason === null || reason === undefined) return 'unknown';
  if (typeof reason === 'string') {
    try {
      return describeReason(JSON.parse(reason));
    } catch {
      return reason;
    }
  }
  if (typeof reason === 'object') {
    let text = typeof reason.text === 'string' ? reason.text : '';
    if (Array.isArray(reason.extra)) {
      text += reason.extra.map(describeReason).join('');
    }
    if (text) return text;
    try {
      return JSON.stringify(reason);
    } catch {
      return String(reason);
    }
  }
  return String(reason);
}

module.exports = {
  ACCOUNTS_FILE,
  loadAccounts,
  saveAccounts,
  resolveDNS,
  sleep,
  waitForEvent,
  waitForMessage,
  connectBot,
  findItemByName,
  describeReason
};
