function withActionHeaders(init = {}, action, note = '') {
  const headers = new Headers(init.headers || {});
  if (!headers.has('X-Client-Action')) headers.set('X-Client-Action', action || 'unknown');
  if (note && !headers.has('X-Client-Note')) headers.set('X-Client-Note', String(note));
  return { ...init, headers };
}

const api = {
  async getState(note) {
    const r = await fetch('/api/state', withActionHeaders({}, 'getState', note));
    return r.json();
  },
  async setState(patch, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }, 'setState', note);
    const r = await fetch('/api/state', init);
    return r.json();
  },
  async getBalances(mint, note) {
    const qs = mint ? ('?mint=' + encodeURIComponent(mint)) : '';
    const r = await fetch('/api/balances' + qs, withActionHeaders({}, 'getBalances', note));
    return r.json();
  },
  async getWallets(note) {
    const r = await fetch('/api/wallets', withActionHeaders({}, 'getWallets', note));
    return r.json();
  },
  async initDevWallet(note) {
    const r = await fetch('/api/wallets/dev/init', withActionHeaders({ method: 'POST' }, 'initDevWallet', note));
    return r.json();
  },
  async assignDevWallet({ publicKey }, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicKey }) }, 'assignDevWallet', note);
    const r = await fetch('/api/wallets/dev/assign', init);
    return r.json();
  },
  async genWallets({ count, defaultBuySol, prefix }, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count, defaultBuySol, prefix }) }, 'genWallets', note);
    const r = await fetch('/api/wallets/gen', init);
    return r.json();
  },
  async updateBuyAmounts(updates, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }) }, 'updateBuyAmounts', note);
    const r = await fetch('/api/wallets/update-buy-amounts', init);
    return r.json();
  },
  async addWallet({ secretKey, name, buySol }, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secretKey, name, buySol }) }, 'addWallet', note);
    const r = await fetch('/api/wallets/add', init);
    return r.json();
  },
  async exportWallet({ publicKey }, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicKey }) }, 'exportWallet', note);
    const r = await fetch('/api/wallets/export', init);
    return r.json();
  },
  async exportDevWallet(note) {
    const init = withActionHeaders({ method: 'POST' }, 'exportDevWallet', note);
    const r = await fetch('/api/wallets/dev/export', init);
    return r.json();
  },
  async removeWallet({ publicKey }, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicKey }) }, 'removeWallet', note);
    const r = await fetch('/api/wallets/remove', init);
    return r.json();
  },
  async createToken(formData, note) {
    const init = withActionHeaders({ method: 'POST', body: formData }, 'createToken', note);
    const r = await fetch('/api/create', init);
    return r.json();
  },
  async buy(body, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'buy', note);
    const r = await fetch('/api/buy', init);
    return r.json();
  },
  async buyOne(body, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'buyOne', note);
    const r = await fetch('/api/wallets/buy-one', init);
    return r.json();
  },
  async sell(body, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'sell', note);
    const r = await fetch('/api/sell', init);
    return r.json();
  },
  async sellOne(body, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'sellOne', note);
    const r = await fetch('/api/wallets/sell-one', init);
    return r.json();
  },
  async collectFees(body, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'collectFees', note);
    const r = await fetch('/api/collect-fees', init);
    return r.json();
  },
  async transferSolOne(body, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'transferSolOne', note);
    const r = await fetch('/api/transfer/sol-one', init);
    return r.json();
  },
  async transferSplOne(body, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'transferSplOne', note);
    const r = await fetch('/api/transfer/spl-one', init);
    return r.json();
  },
  async sweepSol(body, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'sweepSol', note);
    const r = await fetch('/api/sweep/sol', init);
    return r.json();
  },
  async sweepSpl(body, note) {
    const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'sweepSpl', note);
    const r = await fetch('/api/sweep/spl', init);
    return r.json();
  },
  async emitLog(category, message, data) {
    try {
      const init = withActionHeaders({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, message, data }) }, 'emitLog');
      await fetch('/api/logs/emit', init);
    } catch {}
  },
  streamLogs(onEvent) {
    const es = new EventSource('/api/logs/stream');
    es.addEventListener('init', (e) => {
      try { onEvent({ type: 'init', data: JSON.parse(e.data) }); } catch {}
    });
    es.addEventListener('log', (e) => {
      try { onEvent({ type: 'log', data: JSON.parse(e.data) }); } catch {}
    });
    es.onerror = () => {};
    return () => es.close();
  },
};

export default api;
