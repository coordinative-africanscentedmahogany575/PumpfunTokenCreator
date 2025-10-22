const fs = require('fs');
const path = require('path');
const { Connection, Keypair } = require('@solana/web3.js');
const { log } = require('./logs');
const { PUMP_IPFS_URL, PUMP_TRADE_LOCAL_URL, HELIUS_RPC_URL } = require('./config');
const { deserializeVersioned, sendAndConfirm } = require('./tx');

// Simple rate limiter + retry for PumpPortal API to avoid 429s
let lastTradeCallAt = 0;
const MIN_GAP_MS = 300; // space out trade requests
let lastTxSendAt = 0;
const MIN_TX_GAP_MS = 170; // ~6 tx/s pacing for RPC send

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function postTradeWithRetry(url, body, wantArrayBuffer = true) {
  // Ensure a small delay between trade calls
  const now = Date.now();
  const waitMs = Math.max(0, lastTradeCallAt + MIN_GAP_MS - now);
  if (waitMs > 0) await sleep(waitMs);

  const payload = JSON.stringify(body);
  const headers = { 'Content-Type': 'application/json' };

  const backoff = [500, 1000, 2000, 3000, 5000];
  let attempt = 0;
  while (true) {
    lastTradeCallAt = Date.now();
    const res = await fetch(url, { method: 'POST', headers, body: payload });
    if (res.ok) {
      const out = wantArrayBuffer ? await res.arrayBuffer() : await res.json();
      try { log('net', 'trade ok', { action: body && body.action, status: res.status }); } catch {}
      return out;
    }
    const status = res.status;
    // Retry on 429 and transient 5xx
    if (status === 429 || (status >= 500 && status < 600)) {
      const ra = parseInt(res.headers.get('retry-after') || '0', 10);
      const delay = ra > 0 ? ra * 1000 : (backoff[Math.min(attempt, backoff.length - 1)]);
      try { log('net', 'trade retry', { action: body && body.action, status, delay }); } catch {}
      console.warn(`Server responded with ${status} ${res.statusText}.  Retrying after ${delay}ms delay...`);
      await sleep(delay);
      attempt++;
      continue;
    }
    const text = await res.text().catch(()=> '');
    throw new Error(`${url} fetch failed: ${status} ${res.statusText} ${text}`);
  }
}

function getConnection() {
  return new (require('@solana/web3.js').Connection)(HELIUS_RPC_URL, 'confirmed');
}

async function uploadIpfsMetadata({ imagePath, name, symbol, description, twitter, telegram, website, showName = true, fileBuffer = null, fileName = null, fileType = null }) {
  // Build FormData using Blob for Node's undici
  const formData = new FormData();
  let blob;
  if (fileBuffer) {
    blob = new Blob([fileBuffer], { type: fileType || 'application/octet-stream' });
    formData.append('file', blob, fileName || 'image');
  } else {
    if (!fs.existsSync(imagePath)) throw new Error(`Image not found at ${imagePath}`);
    const buf = fs.readFileSync(imagePath);
    const inferredType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : imagePath.toLowerCase().endsWith('.jpg') || imagePath.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'application/octet-stream';
    blob = new Blob([buf], { type: inferredType });
    formData.append('file', blob, path.basename(imagePath));
  }
  formData.append('name', name);
  formData.append('symbol', symbol);
  formData.append('description', description);
  if (twitter) formData.append('twitter', twitter);
  if (telegram) formData.append('telegram', telegram);
  if (website) formData.append('website', website);
  formData.append('showName', String(showName));

  const res = await fetch(PUMP_IPFS_URL, { method: 'POST', body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IPFS upload failed: ${res.status} ${res.statusText} ${text}`);
  }
  const json = await res.json();
  if (!json || !json.metadataUri || !json.metadata) throw new Error('Invalid IPFS response');
  return json;
}

async function buildCreateTx({ devPubkey, mintPubkey, tokenMetadata, amountSol, slippagePercent, priorityFeeSol, pool = 'pump' }) {
  const body = {
    publicKey: devPubkey,
    action: 'create',
    tokenMetadata: {
      name: tokenMetadata.name,
      symbol: tokenMetadata.symbol,
      uri: tokenMetadata.uri,
    },
    mint: mintPubkey,
    denominatedInSol: 'true',
    amount: Number(amountSol),
    slippage: Number(slippagePercent),
    priorityFee: Number(priorityFeeSol),
    pool,
  };
  return await postTradeWithRetry(PUMP_TRADE_LOCAL_URL, body, true);
}

async function buildBuyTx({ pubkey, mint, amount, denominatedInSol = true, slippagePercent, priorityFeeSol, pool = 'auto' }) {
  const body = {
    publicKey: pubkey,
    action: 'buy',
    mint,
    denominatedInSol: denominatedInSol ? 'true' : 'false',
    amount: Number(amount),
    slippage: Number(slippagePercent),
    priorityFee: Number(priorityFeeSol),
    pool,
  };
  return await postTradeWithRetry(PUMP_TRADE_LOCAL_URL, body, true);
}

async function buildSellTx({ pubkey, mint, amountTokens, slippagePercent, priorityFeeSol, pool = 'auto' }) {
  const body = {
    publicKey: pubkey,
    action: 'sell',
    mint,
    denominatedInSol: 'false',
    amount: Number(amountTokens),
    slippage: Number(slippagePercent),
    priorityFee: Number(priorityFeeSol),
    pool,
  };
  return await postTradeWithRetry(PUMP_TRADE_LOCAL_URL, body, true);
}

async function buildCollectFeesTx({ devPubkey, priorityFeeSol }) {
  const body = {
    publicKey: devPubkey,
    action: 'collectCreatorFee',
    priorityFee: Number(priorityFeeSol),
  };
  return await postTradeWithRetry(PUMP_TRADE_LOCAL_URL, body, true);
}

async function createTokenAndDevBuy({ devKeypair, imagePath, name, symbol, description, twitter, telegram, website, devBuySol, slippagePercent, priorityFeeSol, fileBuffer = null, fileName = null, fileType = null }) {
  const connection = getConnection();
  const mintKeypair = Keypair.generate();

  const ipfs = await uploadIpfsMetadata({ imagePath, name, symbol, description, twitter, telegram, website, showName: true, fileBuffer, fileName, fileType });

  const buf = await buildCreateTx({
    devPubkey: devKeypair.publicKey.toBase58(),
    mintPubkey: mintKeypair.publicKey.toBase58(),
    tokenMetadata: { name: ipfs.metadata.name, symbol: ipfs.metadata.symbol, uri: ipfs.metadataUri },
    amountSol: devBuySol,
    slippagePercent,
    priorityFeeSol,
    pool: 'pump',
  });

  const vtx = deserializeVersioned(buf);
  vtx.sign([mintKeypair, devKeypair]);
  const sig = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: true });
  const conf = await connection.confirmTransaction(sig, 'confirmed');
  if (conf.value && conf.value.err) throw new Error('Create transaction failed: ' + JSON.stringify(conf.value.err));

  return { signature: sig, mint: mintKeypair.publicKey.toBase58() };
}

async function waitForConfirmation(connection, signature, timeoutMs = 90000) {
  const start = Date.now();
  while (true) {
    const st = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true }).catch(() => null);
    const v = st && st.value ? st.value[0] : null;
    if (v) {
      if (v.err) throw new Error('Transaction failed: ' + JSON.stringify(v.err));
      const status = v.confirmationStatus || (typeof v.confirmations === 'number' ? (v.confirmations > 0 ? 'confirmed' : 'processed') : null);
      if (status === 'confirmed' || status === 'finalized') return true;
    }
    if (Date.now() - start > timeoutMs) return false; // give up but do not throw
    await sleep(1200);
  }
}

async function signAndSendPortalTx(arrayBuffer, signerKeypair) {
  const connection = getConnection();
  const vtx = deserializeVersioned(arrayBuffer);
  vtx.sign([signerKeypair]);
  // Pace raw transaction sends to ~6 tps globally
  const now = Date.now();
  const wait = Math.max(0, lastTxSendAt + MIN_TX_GAP_MS - now);
  if (wait > 0) await sleep(wait);
  lastTxSendAt = Date.now();

  let lastErr = null;
  const backoff = [500, 1000, 2000];
  for (let attempt = 0; attempt < backoff.length + 1; attempt++) {
    try {
      const sig = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: true, maxRetries: 3 });
      const ok = await waitForConfirmation(connection, sig, 90000);
      if (!ok) {
        // Timed out waiting; return signature (pending) instead of throwing
        return sig;
      }
      return sig;
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      lastErr = e;
      if (msg.includes('429') || msg.includes('rate limited')) {
        const d = backoff[Math.min(attempt, backoff.length - 1)];
        await sleep(d);
        continue;
      }
      break;
    }
  }
  throw lastErr || new Error('sendRawTransaction failed');
}

module.exports = {
  getConnection,
  uploadIpfsMetadata,
  buildCreateTx,
  buildBuyTx,
  buildSellTx,
  buildCollectFeesTx,
  createTokenAndDevBuy,
  signAndSendPortalTx,
};
