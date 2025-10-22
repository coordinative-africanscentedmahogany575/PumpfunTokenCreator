const { PublicKey, SystemProgram, Transaction, VersionedTransaction, TransactionMessage, Keypair } = require('@solana/web3.js');
const {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getMint,
} = require('@solana/spl-token');
const { getConnection } = require('./pumpportal');

async function sendLegacyTx(connection, ixList, payer) {
  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: ixList,
  }).compileToLegacyMessage();
  const vtx = new VersionedTransaction(msg);
  vtx.sign([payer]);
  const sig = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: true });
  const conf = await connection.confirmTransaction(sig, 'confirmed');
  if (conf.value && conf.value.err) throw new Error('Tx failed: ' + JSON.stringify(conf.value.err));
  return sig;
}

async function sendLegacyTxWithSigners(connection, ixList, feePayer, additionalSigners = []) {
  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: feePayer.publicKey,
    recentBlockhash: blockhash,
    instructions: ixList,
  }).compileToLegacyMessage();
  const vtx = new VersionedTransaction(msg);
  vtx.sign([feePayer, ...additionalSigners]);
  const sig = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: true });
  const conf = await connection.confirmTransaction(sig, 'confirmed');
  if (conf.value && conf.value.err) throw new Error('Tx failed: ' + JSON.stringify(conf.value.err));
  return sig;
}

async function transferSol({ fromKeypair, toPubkey, amountSol }) {
  const connection = getConnection();
  const to = new PublicKey(toPubkey);
  const requestedLamports = Math.floor(Number(amountSol) * 1e9);

  // Fetch current balance to ensure we leave enough to pay fees
  const balanceLamports = await connection.getBalance(fromKeypair.publicKey, 'confirmed');

  // Build a dummy message to estimate the exact fee for this transfer
  const dummyIx = SystemProgram.transfer({ fromPubkey: fromKeypair.publicKey, toPubkey: to, lamports: 1 });
  const { blockhash } = await connection.getLatestBlockhash();
  const dummyMsg = new TransactionMessage({
    payerKey: fromKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [dummyIx],
  }).compileToLegacyMessage();

  let feeLamports = 5000; // sensible default (~0.000005 SOL)
  try {
    const feeRes = await connection.getFeeForMessage(dummyMsg, 'confirmed');
    // Handle both number and {value} shapes across web3 versions
    feeLamports = typeof feeRes === 'number' ? feeRes : (feeRes && typeof feeRes.value === 'number' ? feeRes.value : feeLamports);
  } catch (_) {
    // keep default if estimation fails
  }

  // Small safety buffer above the estimated fee
  const safetyLamports = 5000; // ~0.000005 SOL
  const maxSendLamports = Math.max(0, balanceLamports - feeLamports - safetyLamports);
  if (maxSendLamports <= 0) throw new Error('Insufficient SOL to cover network fee');

  const finalLamports = Math.min(requestedLamports, maxSendLamports);
  if (finalLamports <= 0) throw new Error('Transfer amount too low after fee reservation');

  const ix = SystemProgram.transfer({ fromPubkey: fromKeypair.publicKey, toPubkey: to, lamports: finalLamports });
  return await sendLegacyTx(connection, [ix], fromKeypair);
}

async function transferSpl({ fromKeypair, toPubkey, mint, amountTokens }) {
  const connection = getConnection();
  const mintPk = new PublicKey(mint);
  const to = new PublicKey(toPubkey);
  const fromAta = await getAssociatedTokenAddress(mintPk, fromKeypair.publicKey, false);
  const toAta = await getAssociatedTokenAddress(mintPk, to, false);
  const ixList = [];
  // ensure recipient ATA
  const toInfo = await connection.getAccountInfo(toAta);
  if (!toInfo) {
    ixList.push(createAssociatedTokenAccountInstruction(fromKeypair.publicKey, toAta, to, mintPk));
  }
  const mintInfo = await getMint(connection, mintPk);
  const decimals = mintInfo.decimals ?? 0;
  const amount = BigInt(Math.floor(Number(amountTokens) * 10 ** decimals));
  ixList.push(createTransferInstruction(fromAta, toAta, fromKeypair.publicKey, Number(amount)));
  return await sendLegacyTx(connection, ixList, fromKeypair);
}

module.exports = {
  transferSol,
  transferSpl,
  sendLegacyTxWithSigners,
};
