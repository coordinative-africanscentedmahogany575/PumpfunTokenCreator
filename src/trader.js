const { getConnection, buildBuyTx, buildSellTx, signAndSendPortalTx } = require('./pumpportal');
const { FEE_BUFFER_SOL, DEFAULT_SLIPPAGE_PERCENT, DEFAULT_PRIORITY_FEE_SOL, DEFAULT_POOL } = require('./config');

// Pace RPC calls to ~6 tps globally for this module
let LAST_RPC_AT = 0;
const MIN_RPC_GAP_MS = 170;
async function rpcPace() {
  const now = Date.now();
  const wait = Math.max(0, LAST_RPC_AT + MIN_RPC_GAP_MS - now);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  LAST_RPC_AT = Date.now();
}

async function fetchSolBalance(pubkey) {
  const conn = getConnection();
  await rpcPace();
  const lamports = await conn.getBalance(new (require('@solana/web3.js').PublicKey)(pubkey), 'confirmed');
  return lamports / 1e9;
}

async function buyMany({ wallets, mint, overrideBuySol = null, slippagePercent = DEFAULT_SLIPPAGE_PERCENT, priorityFeeSol = DEFAULT_PRIORITY_FEE_SOL, pool = DEFAULT_POOL, concurrency = 4, retries = 2, onProgress = null }) {
  concurrency = Math.min(6, Math.max(1, Number(concurrency) || 4));
  const queue = wallets.slice();
  const results = [];
  let active = 0;
  let index = 0;
  let done = 0, okCount = 0, failCount = 0;

  return await new Promise((resolve) => {
    const runNext = async () => {
      if (queue.length === 0 && active === 0) return resolve(results);
      while (active < concurrency && queue.length) {
        const item = queue.shift();
        const thisIndex = index++;
        active++;
        (async () => {
          const pub = item.publicKey;
          try {
            const balanceSol = await fetchSolBalance(pub);
            const desired = overrideBuySol != null ? Number(overrideBuySol) : Number(item.buySol || 0);
            const maxBuy = Math.max(0, balanceSol - FEE_BUFFER_SOL);
            const amount = Math.min(desired, maxBuy);
            if (amount <= 0) throw new Error(`Insufficient SOL (balance ${balanceSol.toFixed(4)} < buffer ${FEE_BUFFER_SOL})`);

            let lastErr = null; let sig = null;
            for (let attempt = 0; attempt <= retries; attempt++) {
              try {
                const buf = await buildBuyTx({ pubkey: pub, mint, amount, denominatedInSol: true, slippagePercent, priorityFeeSol, pool });
                sig = await signAndSendPortalTx(buf, item.keypair);
                break;
              } catch (e) {
                lastErr = e;
                await new Promise(r => setTimeout(r, 100 + attempt * 200));
              }
            }
            if (!sig) throw lastErr || new Error('Unknown buy error');
            results[thisIndex] = { ok: true, buyer: pub, signature: sig, boughtSol: amount };
          } catch (e) {
            results[thisIndex] = { ok: false, buyer: pub, error: e && e.message ? e.message : String(e) };
          } finally {
            done++;
            if (results[thisIndex] && results[thisIndex].ok) okCount++; else failCount++;
            if (onProgress) try { onProgress({ done, total: wallets.length, ok: okCount, fail: failCount }); } catch {}
            active--;
            setTimeout(runNext, Math.floor(Math.random() * 60) + 20);
          }
        })();
      }
    };
    runNext();
  });
}

async function sellManyTokens({ wallets, mint, amountTokensPerWallet = null, percentPerWallet = null, perWalletPercentMap = null, slippagePercent = DEFAULT_SLIPPAGE_PERCENT, priorityFeeSol = DEFAULT_PRIORITY_FEE_SOL, pool = DEFAULT_POOL, concurrency = 4, retries = 2, sequential = false, onProgress = null }) {
  concurrency = Math.min(6, Math.max(1, Number(concurrency) || 4));
  const conn = getConnection();
  const queue = wallets.slice();
  const results = [];
  let active = 0;
  let index = 0;
  let done = 0, okCount = 0, failCount = 0;

  async function getTokenUiBalance(owner) {
    const ownerPk = new (require('@solana/web3.js').PublicKey)(owner);
    await rpcPace();
    const res = await conn.getParsedTokenAccountsByOwner(ownerPk, { mint: new (require('@solana/web3.js').PublicKey)(mint) });
    let total = 0;
    for (const it of res.value) {
      const info = it.account.data.parsed.info;
      total += Number(info.tokenAmount.uiAmount || 0);
    }
    return total;
  }

  return await new Promise((resolve) => {
    const runNext = async () => {
      if (queue.length === 0 && active === 0) return resolve(results);
      const limit = sequential ? 1 : concurrency;
      while (active < limit && queue.length) {
        const item = queue.shift();
        const thisIndex = index++;
        active++;
        (async () => {
          const pub = item.publicKey;
          try {
            let tokensToSell = amountTokensPerWallet != null ? Number(amountTokensPerWallet) : null;
            // Per-wallet percent override takes precedence
            const thisPct = perWalletPercentMap && perWalletPercentMap.get ? perWalletPercentMap.get(pub) : null;
            if (tokensToSell == null && thisPct != null) {
              const bal = await getTokenUiBalance(pub);
              tokensToSell = (Number(thisPct) / 100) * bal;
            }
            if (tokensToSell == null && percentPerWallet != null) {
              const bal = await getTokenUiBalance(pub);
              tokensToSell = (Number(percentPerWallet) / 100) * bal;
            }
            if (!tokensToSell || tokensToSell <= 0) throw new Error('No tokens to sell for this wallet');

            let lastErr = null; let sig = null;
            for (let attempt = 0; attempt <= retries; attempt++) {
              try {
                const buf = await buildSellTx({ pubkey: pub, mint, amountTokens: tokensToSell, slippagePercent, priorityFeeSol, pool });
                sig = await signAndSendPortalTx(buf, item.keypair);
                break;
              } catch (e) {
                lastErr = e;
                await new Promise(r => setTimeout(r, 120 + attempt * 220));
              }
            }
            if (!sig) throw lastErr || new Error('Unknown sell error');
            results[thisIndex] = { ok: true, seller: pub, signature: sig, soldTokens: tokensToSell };
          } catch (e) {
            results[thisIndex] = { ok: false, seller: pub, error: e && e.message ? e.message : String(e) };
          } finally {
            done++;
            if (results[thisIndex] && results[thisIndex].ok) okCount++; else failCount++;
            if (onProgress) try { onProgress({ done, total: wallets.length, ok: okCount, fail: failCount }); } catch {}
            active--;
            setTimeout(runNext, Math.floor(Math.random() * 60) + 20);
          }
        })();
      }
    };
    runNext();
  });
}

module.exports = {
  buyMany,
  sellManyTokens,
};
