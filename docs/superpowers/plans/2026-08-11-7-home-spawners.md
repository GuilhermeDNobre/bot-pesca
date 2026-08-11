# 7-home-spawners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `npm run sethome-spawners` (`7-home-spawners.js`), which logs a
batch of accounts in one at a time, switches each to the RankUp server,
`/tpa`s to a fixed anchor player (`Jurinha06`) standing at the pig spawner,
waits, and sets a `spawner` home there — and strip the now-obsolete manual
pig detect/attack code that the server's new `/autoclick` command replaces.

**Architecture:** `pig.js` is trimmed down to just `equipDiamondSword`
(still needed for a later, out-of-scope phase 2 that equips the sword before
`/autoclick`); the pig detection/attack functions it used to export are
deleted along with `plot-jurapesca01.js`, their only consumer. A new leaf
script `7-home-spawners.js` follows the existing "single orchestrator script"
pattern (see `kit-all-accounts.js`, `plot-jurapesca01.js`), reusing
`common.js` and `flow.js`'s `loginAndSwitchServer` unmodified. It reads its
own account list from a new gitignored `spawners-accounts.json`, separate
from `accounts.json` (which still supplies `server` config and `password`).

**Tech Stack:** Node.js, mineflayer (already a dependency) — no new
dependencies.

## Global Constraints

- Reuse `common.js` and `flow.js` as-is — do not modify them.
- `pig.js` keeps only `equipDiamondSword`; `findNearestPig`,
  `attackPigUntilDead`, `computeHitLocation`, `sameHitLocation`,
  `angleDiff`, and the `POSITION_TOLERANCE`/`DISTANCE_TOLERANCE`/
  `ANGLE_TOLERANCE` constants are removed.
- `plot-jurapesca01.js` is deleted entirely (its only reason to exist was
  the pig detect/attack loop).
- New config `spawners-accounts.json` (gitignored) holds only the list of
  usernames to process for this phase; `server` config and `password` still
  come from the existing `accounts.json`.
- `TPA_TARGET = 'Jurinha06'`, fixed wait of `10000`ms between `/tpa` and
  `/sethome spawner` — no chat-message confirmation check (server's exact
  teleport-confirmation text isn't known yet).
- Sequential processing: one account online at a time; the next account's
  login only starts after the previous one has `bot.quit()`'d.
- Login/switch retry: up to 3 attempts per account (matches the
  `MAX_ATTEMPTS` pattern in `kit-all-accounts.js`/`plot-jurapesca01.js`), 8s
  between attempts.
- On failure after retries: log it and continue to the next account (don't
  abort the whole batch) — except on `maintenance`, which aborts the
  remaining batch (matches `kit-all-accounts.js`).
- No status persistence to any JSON file from this new script — the input
  list is just usernames, not a state file.

---

### Task 1: Strip pig.js down to `equipDiamondSword`

**Files:**
- Modify: `pig.js` (full rewrite)

**Interfaces:**
- Consumes: nothing new.
- Produces: `equipDiamondSword(bot)` → `Promise<boolean>` (unchanged
  signature/behavior from the current file) — this is the only export other
  code may still rely on going forward.

- [ ] **Step 1: Rewrite `pig.js`**

Replace the entire file content with:

```js
// Garante a Diamond Sword equipada. Usado antes de mandar /autoclick, que
// ataca automaticamente com o item que estiver na mão do bot.
async function equipDiamondSword(bot) {
  if (bot.heldItem && bot.heldItem.name === 'diamond_sword') return true;

  const sword = bot.inventory.slots.find((item) => item && item.name === 'diamond_sword');
  if (!sword) return false;

  await bot.equip(sword, 'hand');
  return !!(bot.heldItem && bot.heldItem.name === 'diamond_sword');
}

module.exports = {
  equipDiamondSword
};
```

- [ ] **Step 2: Syntax-check the file**

Run: `node -c pig.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Confirm what still references the removed exports**

Run (from repo root, PowerShell):
```powershell
Get-ChildItem -Recurse -Filter *.js -Exclude node_modules | Select-String -Pattern "findNearestPig|attackPigUntilDead|computeHitLocation|sameHitLocation|angleDiff"
```
Expected: matches only inside `plot-jurapesca01.js` (Task 2 deletes that
file next — this is the expected, temporary state after this task alone).

- [ ] **Step 4: Commit**

```bash
git add pig.js
git commit -m "Remove detecção/ataque manual de porco de pig.js (obsoleto com /autoclick)"
```

---

### Task 2: Delete `plot-jurapesca01.js` and its npm script

**Files:**
- Delete: `plot-jurapesca01.js`
- Modify: `package.json:6-13` (remove the `"plot"` entry from `scripts`)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing — this task only removes dead code now that Task 1 has
  removed the functions it depended on.

- [ ] **Step 1: Delete the file**

```bash
git rm plot-jurapesca01.js
```

- [ ] **Step 2: Remove the npm script entry**

In `package.json`, remove this line from `"scripts"`:
```json
"plot": "node plot-jurapesca01.js"
```
(Keep every other entry as-is.)

- [ ] **Step 3: Verify no leftover references**

Run (PowerShell):
```powershell
Get-ChildItem -Recurse -Filter *.js -Exclude node_modules | Select-String -Pattern "findNearestPig|attackPigUntilDead|computeHitLocation|sameHitLocation|angleDiff"
```
Expected: no matches anywhere.

Run:
```powershell
node -e "console.log(require('./package.json').scripts)"
```
Expected: printed object has no `plot` key.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "Remove plot-jurapesca01.js e o script npm plot (fluxo antigo de caçar porco manualmente)"
```

---

### Task 3: Add `spawners-accounts.json.example` and gitignore the real file

**Files:**
- Create: `spawners-accounts.json.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: the on-disk shape `{ "accounts": string[] }` that Task 4's
  `loadSpawnerUsernames()` reads from the real (gitignored)
  `spawners-accounts.json`.

- [ ] **Step 1: Write `spawners-accounts.json.example`**

```json
{
  "accounts": [
    "SuaConta01",
    "SuaConta02",
    "SuaConta03",
    "SuaConta04",
    "SuaConta05",
    "SuaConta06",
    "SuaConta07"
  ]
}
```

- [ ] **Step 2: Add the real file to `.gitignore`**

Append this line to `.gitignore` (which currently has `accounts.json`,
`node_modules/`, `.superpowers/`):
```
spawners-accounts.json
```

- [ ] **Step 3: Verify the example file parses as valid JSON**

Run:
```powershell
node -e "console.log(JSON.parse(require('fs').readFileSync('spawners-accounts.json.example','utf8')).accounts.length)"
```
Expected: `7`

- [ ] **Step 4: Commit**

```bash
git add spawners-accounts.json.example .gitignore
git commit -m "Adiciona template spawners-accounts.json.example e ignora o arquivo real"
```

---

### Task 4: Create `7-home-spawners.js` and wire `npm run sethome-spawners`

**Files:**
- Create: `7-home-spawners.js`
- Modify: `package.json` (add `"sethome-spawners": "node 7-home-spawners.js"`
  to `scripts`)

**Interfaces:**
- Consumes from `common.js`: `loadAccounts()` → `{ server, password,
  accounts }`; `sleep(ms)` → `Promise<void>`; `connectBot(username, config)`
  → `Promise<Bot>`; `describeReason(reason)` → `string`.
- Consumes from `flow.js`: `loginAndSwitchServer(bot, password)` →
  `Promise<{ success, reason, maintenance, disconnected }>`.
- Consumes from disk: `spawners-accounts.json` (shape from Task 3:
  `{ accounts: string[] }`), read directly with `fs`/`path` (not through
  `common.js`'s `loadAccounts`, which is hardcoded to `accounts.json`).
- Produces: nothing consumed by other files — leaf script run via
  `npm run sethome-spawners`.

- [ ] **Step 1: Write `7-home-spawners.js`**

```js
// Fase 1 do fluxo de /autoclick no porco: loga cada conta de
// spawners-accounts.json, troca pro servidor RankUp, dá /tpa pra Jurinha06
// (que fica parada no spawner) e seta o home "spawner" ali. Fase 2 (dropar
// espada, equipar e /autoclick) fica pra depois, fora deste script.
const fs = require('fs');
const path = require('path');
const { loadAccounts, sleep, connectBot, describeReason } = require('./common');
const { loginAndSwitchServer } = require('./flow');

const SPAWNERS_FILE = path.join(__dirname, 'spawners-accounts.json');
const TPA_TARGET = 'Jurinha06';
const TPA_WAIT_MS = 10000;
const AFTER_SETHOME_SETTLE_MS = 1500;
const BETWEEN_ACCOUNTS_DELAY_MS = 1000;
const MAX_LOGIN_ATTEMPTS = 3; // transient disconnects/proxy hiccups get a couple of automatic retries

function loadSpawnerUsernames() {
  const data = JSON.parse(fs.readFileSync(SPAWNERS_FILE, 'utf8'));
  return data.accounts;
}

async function attemptLogin(username, config, password) {
  const bot = await connectBot(username, config);
  bot.on('error', (err) => console.log(`  [error] ${err.message}`));
  bot.on('kicked', (reason) => console.log(`  [kicked] ${describeReason(reason)}`));

  const result = await loginAndSwitchServer(bot, password);
  return { bot, result };
}

// Loga (com retry) e troca pro RankUp. Retorna { bot, result } - bot é null se
// todas as tentativas falharem.
async function loginWithRetry(username, config, password) {
  let bot;
  let result;
  for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt++) {
    ({ bot, result } = await attemptLogin(username, config, password));
    if (result.success || result.maintenance) return { bot, result };

    bot.quit();
    console.log(`  [FAIL] tentativa ${attempt}/${MAX_LOGIN_ATTEMPTS}: ${result.reason}`);
    if (attempt < MAX_LOGIN_ATTEMPTS) {
      console.log(`  [retry] provável falha transitória, tentando de novo em 8s`);
      await sleep(8000);
    }
  }
  return { bot: null, result };
}

// Dá /tpa pro alvo fixo, espera o teleporte processar e seta o home "spawner"
// na posição atual do bot.
async function setSpawnerHome(bot) {
  console.log(`  -> /tpa ${TPA_TARGET}`);
  bot.chat(`/tpa ${TPA_TARGET}`);

  console.log(`  [aguardando] ${TPA_WAIT_MS / 1000}s para o teleporte processar`);
  await sleep(TPA_WAIT_MS);

  console.log(`  -> /sethome spawner`);
  bot.chat('/sethome spawner');

  await sleep(AFTER_SETHOME_SETTLE_MS);
}

async function processAccount(username, config, password) {
  console.log(`\n${'='.repeat(60)}\n${username}\n${'='.repeat(60)}`);

  const { bot, result: loginResult } = await loginWithRetry(username, config, password);
  if (!bot) {
    console.log(`  [FAIL FINAL] ${username}: ${loginResult.reason}`);
    return { username, success: false, maintenance: !!loginResult.maintenance };
  }

  await setSpawnerHome(bot);
  console.log(`  [ok] home "spawner" setado`);

  bot.quit();
  return { username, success: true, maintenance: false };
}

async function main() {
  const data = loadAccounts();
  const { server: config, password } = data;
  const usernames = loadSpawnerUsernames();

  const results = [];
  for (const username of usernames) {
    const result = await processAccount(username, config, password);
    results.push(result);

    if (result.maintenance) {
      console.log(`\nServidor em manutenção — abortando o restante do lote. Rode de novo mais tarde.`);
      break;
    }

    await sleep(BETWEEN_ACCOUNTS_DELAY_MS);
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;
  console.log(`\n${'='.repeat(60)}\nResumo: ${succeeded} ok, ${failed} falha(s), de ${usernames.length} contas\n${'='.repeat(60)}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(`Erro fatal: ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Syntax-check the file**

Run: `node -c 7-home-spawners.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Wire the npm script**

In `package.json`, inside `"scripts"`, add:
```json
"sethome-spawners": "node 7-home-spawners.js"
```

- [ ] **Step 4: Verify the script is registered**

Run:
```powershell
node -e "console.log(require('./package.json').scripts['sethome-spawners'])"
```
Expected output: `node 7-home-spawners.js`

- [ ] **Step 5: Manual live verification (requires real credentials/network)**

Copy `spawners-accounts.json.example` to `spawners-accounts.json` and fill
in the real usernames for this batch (this file is gitignored, so it's safe
to put real data in it). Make sure `Jurinha06` is online and standing at the
spawner in-game, then run:

`npm run sethome-spawners`

Expected: for each account, console shows the login/switch result, then
`-> /tpa Jurinha06`, a 10s wait log, `-> /sethome spawner`, and `[ok] home
"spawner" setado`; accounts disconnect one at a time (never more than one
connected simultaneously); a final `Resumo: X ok, Y falha(s), de Z contas`
line prints before the process exits. This is the point where real server
behavior gets shared back for iteration — if `/tpa`'s actual acceptance flow
turns out to need more than a fixed 10s wait, or `/sethome` fails silently,
the constants/flow above are expected to be adjusted based on that output.

- [ ] **Step 6: Commit**

```bash
git add 7-home-spawners.js package.json
git commit -m "Adiciona npm run sethome-spawners: seta home spawner em lote via /tpa Jurinha06"
```
