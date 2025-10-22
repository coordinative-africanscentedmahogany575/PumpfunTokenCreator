const fs = require('fs');
const path = require('path');
const bs58 = require('./lib/bs58');
const { Keypair, PublicKey } = require('@solana/web3.js');
const { BUYERS_FILE, DEV_WALLET_FILE } = require('./config');

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf-8');
  return JSON.parse(raw);
}

function writeJson(file, obj) {
  ensureDirForFile(file);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function keypairFromSecret(secret) {
  if (!secret) throw new Error('Missing secret');
  if (Array.isArray(secret)) return Keypair.fromSecretKey(Uint8Array.from(secret));
  if (typeof secret === 'string') return Keypair.fromSecretKey(bs58.decode(secret));
  throw new Error('Unsupported secret format');
}

function loadDevWallet() {
  const j = readJson(DEV_WALLET_FILE);
  if (!j || !j.secretKey) throw new Error(`Dev wallet not found or invalid at ${DEV_WALLET_FILE}`);
  const kp = keypairFromSecret(j.secretKey);
  const pub = kp.publicKey.toBase58();
  if (j.publicKey && j.publicKey !== pub) throw new Error('Dev wallet publicKey mismatch with secret');
  return { file: DEV_WALLET_FILE, keypair: kp, publicKey: pub };
}

function saveDevWalletFromKeypair(kp) {
  writeJson(DEV_WALLET_FILE, {
    publicKey: kp.publicKey.toBase58(),
    secretKey: bs58.encode(kp.secretKey),
  });
}

function initDevWalletIfMissing() {
  if (fs.existsSync(DEV_WALLET_FILE)) return loadDevWallet();
  const kp = Keypair.generate();
  saveDevWalletFromKeypair(kp);
  return loadDevWallet();
}

function tryLoadDevWallet() {
  try {
    return loadDevWallet();
  } catch (_) {
    return null;
  }
}

function loadBuyerWallets() {
  const j = readJson(BUYERS_FILE) || { wallets: [] };
  if (!Array.isArray(j.wallets)) throw new Error(`Invalid buyers file schema at ${BUYERS_FILE}`);
  const wallets = j.wallets.map((w, i) => {
    if (!w.secretKey) throw new Error(`Buyer at index ${i} missing secretKey`);
    const kp = keypairFromSecret(w.secretKey);
    const pk = kp.publicKey.toBase58();
    if (w.publicKey && w.publicKey !== pk) throw new Error(`Buyer #${i} publicKey mismatch with secret`);
    return {
      index: i,
      name: w.name || `buyer-${String(i + 1).padStart(4, '0')}`,
      publicKey: pk,
      buySol: Number(w.buySol || 0),
      buyPercent: Number(w.buyPercent || 0),
      sellPercent: Number(w.sellPercent || 0),
      keypair: kp,
    };
  });
  return wallets;
}

function saveBuyerWallets(wallets) {
  const toSave = wallets.map((w) => ({
    name: w.name,
    publicKey: w.publicKey || (w.keypair && w.keypair.publicKey ? w.keypair.publicKey.toBase58() : undefined),
    buySol: Number(w.buySol || 0),
    buyPercent: Number(w.buyPercent || 0),
    sellPercent: Number(w.sellPercent || 0),
    secretKey: w.secretKey || bs58.encode((w.keypair ? w.keypair.secretKey : bs58.decode(w.secretKey))),
  }));
  writeJson(BUYERS_FILE, { wallets: toSave });
}

function appendBuyerWallets({ count, defaultBuySol = 0, namePrefix = 'buyer' }) {
  const existing = readJson(BUYERS_FILE) || { wallets: [] };
  if (!Array.isArray(existing.wallets)) existing.wallets = [];
  const startIndex = existing.wallets.length;
  for (let i = 0; i < count; i++) {
    const kp = Keypair.generate();
    const name = `${namePrefix}-${String(startIndex + i + 1).padStart(4, '0')}`;
    existing.wallets.push({
      name,
      publicKey: kp.publicKey.toBase58(),
      buySol: Number(defaultBuySol),
      buyPercent: 0,
      sellPercent: 0,
      secretKey: bs58.encode(kp.secretKey),
    });
  }
  writeJson(BUYERS_FILE, existing);
  return existing.wallets.slice(startIndex);
}

module.exports = {
  loadDevWallet,
  initDevWalletIfMissing,
  tryLoadDevWallet,
  saveDevWalletFromKeypair,
  loadBuyerWallets,
  saveBuyerWallets,
  appendBuyerWallets,
};
