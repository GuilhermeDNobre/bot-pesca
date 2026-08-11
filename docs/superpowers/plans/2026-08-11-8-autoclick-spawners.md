# 8-autoclick-spawners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `npm run autoclick-spawners` (`8-autoclick-spawners.js`), which
logs a batch of accounts in concurrently, sends each to `/home spawner`,
equips the Diamond Sword when available, and turns on `/autoclick` — then
keeps every account connected indefinitely.

**Architecture:** A new leaf script `8-autoclick-spawners.js` follows
`farm-all.js`'s concurrent pattern: a `withLoginLock()` serializes only the
fragile login/server-switch handshake, then each account's post-login flow
(`/home spawner`, equip, `/autoclick`) runs independently and the bot stays
connected. It reuses `common.js`, `flow.js`'s `loginAndSwitchServer`, and
`pig.js`'s `equipDiamondSword` unmodified. Unlike every existing batch
script, login retries are **unbounded** — the requirement is that every
account must eventually be online, so failures never give up, they just
wait (8s for a transient failure, 60s if the server reports maintenance)
and try the same account again. It reads its own account list from a new
gitignored `accountspig.json` (no `.example` template — explicitly skipped
per user request), separate from `accounts.json` (which still supplies
`server` config and `password`).

**Tech Stack:** Node.js, mineflayer (already a dependency) — no new
dependencies.

## Global Constraints

- Reuse `common.js`, `flow.js`, and `pig.js` as-is — do not modify them.
- Do not touch `plot-jurapesca01.js` — out of scope.
- New config `accountspig.json` (gitignored) holds only the list of
  usernames to process; `server` config and `password` still come from the
  existing `accounts.json`. No `.example` template file for it.
- Login retry is unbounded per account: 8s wait before retrying a transient
  failure, 60s wait before retrying after a maintenance failure. Never
  aborts the whole batch, never gives up on an account.
- After `/home spawner`, fixed settle wait of 3000ms — no chat-message
  confirmation check (server's exact teleport-confirmation text isn't known).
- `/autoclick` is sent unconditionally after the settle wait, regardless of
  whether the Diamond Sword was found — the sword only affects damage, it's
  not a precondition for turning autoclick on.
- If the Diamond Sword isn't found in inventory: log a warning naming the
  account (so the user can drop the sword in manually), then poll the
  inventory every 5 minutes (`setInterval`) until it appears; equip it,
  log success, and stop polling (`clearInterval`) — don't keep polling
  forever once resolved.
- No status persistence to any JSON file — `accountspig.json` is just the
  input list, not a state file.
- Bots are never `bot.quit()`'d in the success path — the process stays
  alive with every account connected until manually stopped (Ctrl+C), same
  as `farm-all.js`.

---

### Task 1: Create `8-autoclick-spawners.js` and wire `npm run autoclick-spawners`

**Files:**
- Modify: `.gitignore` (add `accountspig.json`)
- Create: `8-autoclick-spawners.js`
- Modify: `package.json` (add `"autoclick-spawners": "node
  8-autoclick-spawners.js"` to `scripts`)

**Interfaces:**
- Consumes from `common.js`: `loadAccounts()` → `{ server, password,
  accounts }`; `sleep(ms)` → `Promise<void>`; `connectBot(username, config)`
  → `Promise<Bot>`; `describeReason(reason)` → `string`.
- Consumes from `flow.js`: `loginAndSwitchServer(bot, password)` →
  `Promise<{ success, reason, maintenance, disconnected }>`.
- Consumes from `pig.js`: `equipDiamondSword(bot)` → `Promise<boolean>`.
- Consumes from disk: `accountspig.json` (`{ accounts: string[] }`), read
  directly with `fs`/`path` (not through `common.js`'s `loadAccounts`,
  which is hardcoded to `accounts.json`).
- Produces: nothing consumed by other files — leaf script run via
  `npm run autoclick-spawners`.

- [ ] **Step 1: Add `accountspig.json` to `.gitignore`**

Append this line to `.gitignore` (which currently has `accounts.json`,
`node_modules/`, `.superpowers/`):
```
accountspig.json
```

- [ ] **Step 2: Write `8-autoclick-spawners.js`**

```js
// Fase 2 do fluxo de /autoclick: loga cada conta de accountspig.json, troca pro
// servidor RankUp, vai pro home "spawner" (já setado manualmente em cada conta),
// equipa a Diamond Sword (se disponível) e liga o /autoclick. As contas ficam
// conectadas indefinidamente depois disso - o processo não termina sozinho.
const fs = require('fs');
const path = require('path');
const { loadAccounts, sleep, connectBot, describeReason } = require('./common');
const { loginAndSwitchServer } = require('./flow');
const { equipDiamondSword } = require('./pig');

const ACCOUNTPIG_FILE = path.join(__dirname, 'accountspig.json');
const AFTER_HOME_SETTLE_MS = 3000;
const SWORD_WATCHDOG_INTERVAL_MS = 5 * 60 * 1000;
const TRANSIENT_RETRY_DELAY_MS = 8000;
const MAINTENANCE_RETRY_DELAY_MS = 60000;
const STAGGER_MS = 3000; // paces initial TCP connects/console output, not a safety net

function loadAccountpigUsernames() {
  const data = JSON.parse(fs.readFileSync(ACCOUNTPIG_FILE, 'utf8'));
  return data.accounts;
}

// Serializes only the fragile login/server-switch handshake so it's never attempted
// by more than one account at once (matches farm-all.js's proxy-safety pattern).
let loginQueue = Promise.resolve();
function withLoginLock(fn) {
  const run = loginQueue.then(fn, fn);
  loginQueue = run.then(() => {}, () => {});
  return run;
}

async function attemptLogin(username, config, password) {
  const bot = await connectBot(username, config);
  bot.on('error', (err) => console.log(`  [${username}] [error] ${err.message}`));
  bot.on('kicked', (reason) => console.log(`  [${username}] [kicked] ${describeReason(reason)}`));
  bot.on('end', (reason) => console.log(`  [${username}] [end] ${describeReason(reason)}`));

  const result = await loginAndSwitchServer(bot, password);
  return { bot, result };
}

// Loga e troca pro RankUp com retry infinito - nunca desiste, porque todas as
// contas precisam ficar online. Falha por manutenção espera mais (60s) do que
// falha transitória (8s) antes de tentar de novo.
async function loginUntilOnline(username, config, password) {
  let attempt = 0;
  for (;;) {
    attempt++;
    const { bot, result } = await withLoginLock(() => attemptLogin(username, config, password));
    if (result.success) return bot;

    bot.quit();
    console.log(`  [${username}] [FAIL] tentativa ${attempt}: ${result.reason}`);
    const delay = result.maintenance ? MAINTENANCE_RETRY_DELAY_MS : TRANSIENT_RETRY_DELAY_MS;
    console.log(`  [${username}] [retry] tentando de novo em ${delay / 1000}s`);
    await sleep(delay);
  }
}

// Confere o inventário a cada SWORD_WATCHDOG_INTERVAL_MS; assim que achar a Diamond
// Sword, equipa, loga sucesso e para de checar.
function startSwordWatchdog(bot, username) {
  const interval = setInterval(async () => {
    const equipped = await equipDiamondSword(bot);
    if (equipped) {
      console.log(`  [${username}] [ok] espada encontrada e equipada`);
      clearInterval(interval);
    }
  }, SWORD_WATCHDOG_INTERVAL_MS);
}

async function processAccount(username, config, password) {
  const bot = await loginUntilOnline(username, config, password);
  console.log(`  [${username}] [ok] logado e no servidor RankUp`);

  console.log(`  [${username}] -> /home spawner`);
  bot.chat('/home spawner');
  await sleep(AFTER_HOME_SETTLE_MS);

  const equipped = await equipDiamondSword(bot);
  if (equipped) {
    console.log(`  [${username}] [ok] Diamond Sword equipada`);
  } else {
    console.log(`  [${username}] [aviso] sem Diamond Sword no inventário - dropar manualmente (checando de novo a cada 5min)`);
    startSwordWatchdog(bot, username);
  }

  console.log(`  [${username}] -> /autoclick`);
  bot.chat('/autoclick');
  console.log(`  [${username}] [ok] autoclick ligado, conta permanece online`);
}

async function main() {
  const data = loadAccounts();
  const { server: config, password } = data;
  const usernames = loadAccountpigUsernames();

  for (const username of usernames) {
    processAccount(username, config, password).catch((err) => {
      console.log(`  [${username}] [FATAL] ${err.message}`);
    });
    await sleep(STAGGER_MS);
  }

  console.log(`\nTodas as ${usernames.length} contas foram iniciadas. Processo permanece rodando (Ctrl+C para parar).`);
}

main().catch((err) => {
  console.error(`Erro fatal: ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 3: Syntax-check the file**

Run: `node -c 8-autoclick-spawners.js`
Expected: no output, exit code 0.

- [ ] **Step 4: Wire the npm script**

In `package.json`, inside `"scripts"`, add:
```json
"autoclick-spawners": "node 8-autoclick-spawners.js"
```

- [ ] **Step 5: Verify the script is registered**

Run:
```powershell
node -e "console.log(require('./package.json').scripts['autoclick-spawners'])"
```
Expected output: `node 8-autoclick-spawners.js`

- [ ] **Step 6: Manual live verification (requires real credentials/network)**

Create `accountspig.json` (gitignored, no template needed) with the real
usernames for this batch:
```json
{
  "accounts": ["Usuario01", "Usuario02"]
}
```

Make sure each account already has the `spawner` home set (done manually
per the fase 1 spec) and, ideally, a Diamond Sword in inventory for at
least one test account (to exercise the equip-success path) and none for
another (to exercise the watchdog path). Then run:

`npm run autoclick-spawners`

Expected: for each account, console shows login/switch progress, `[ok]
logado e no servidor RankUp`, `-> /home spawner`, then either `[ok] Diamond
Sword equipada` or the `[aviso] ... dropar manualmente` warning, then `->
/autoclick` and `[ok] autoclick ligado`. All accounts stay connected
simultaneously (unlike `7-home-spawners.js`, nothing disconnects). A final
`Todas as N contas foram iniciadas.` line prints while bots remain online.
For the no-sword test account, drop a Diamond Sword into its inventory
in-game and confirm within 5 minutes the console logs `[ok] espada
encontrada e equipada` and stops polling after that. This is the point
where real server behavior gets shared back for iteration — if `/home`'s
actual teleport timing needs more than the fixed 3s wait, or `/autoclick`'s
confirmation text turns out to be checkable, the constants/flow above are
expected to be adjusted based on that output.

- [ ] **Step 7: Commit**

```bash
git add .gitignore 8-autoclick-spawners.js package.json
git commit -m "Adiciona npm run autoclick-spawners: home spawner + espada + /autoclick em lote, contas ficam online"
```
