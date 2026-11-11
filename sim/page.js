// Loads the playtest page's script into a Node vm so the sim runs the exact same rules code.
// Rendering is stubbed out; every prompt the page shows goes through globalThis.__ask instead of a modal.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPage(config = {}, file = path.resolve(__dirname, '../playtest/index.html')) {
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no <script> in ' + file);
  const el = () => ({ innerHTML: '', value: '', hidden: true, dataset: {}, querySelector: () => el(), querySelectorAll: () => [], addEventListener() {}, focus() {} });
  const ctx = vm.createContext({
    console,
    document: { querySelector: () => el(), querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    claude: { hot: { ready() {}, snapshot() {} } }, // ready() never calls boot, so nothing renders
    __rng: Math.random,
    MADK_CONFIG: config,
  });
  ctx.window = ctx;
  vm.runInContext(m[1], ctx, { filename: 'index.html' });
  vm.runInContext(`
    Math.random = () => globalThis.__rng();
    ask = o => globalThis.__ask(o);
    const __origLog = log;
    log = t => { __origLog(t); if (globalThis.__onLog) globalThis.__onLog(t); };
    globalThis.__api = {
      get S(){ return S; },
      ACT, newGame, startGame, activeClaim, capSweep, slaveSoulSweep, checkWin, nextTurn, topInt, eligibility, baseRole, roleOfCombo,
      countColor, countCard, isArch, archLimit, tokenRound, canSpend, slavesOf, free, keyOf,
      COMBOS, NAME_OF, NAME_LIST, ROLES, MARQUIS_KILL, TRADE_FEE, RANDOM_TOKEN_COST, SPEND_CAP, CFG, DECK_COUNTS, CONSUME_BONUS, SLAVE_INCOME,
    };
  `, ctx);
  return { ctx, api: ctx.__api };
}

module.exports = { loadPage };
