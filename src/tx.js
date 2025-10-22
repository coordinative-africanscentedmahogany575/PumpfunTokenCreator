const { Connection, VersionedTransaction, Transaction } = require('@solana/web3.js');

async function sendAndConfirm(connection, tx, opts = { skipPreflight: true, commitment: 'confirmed' }) {
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: opts.skipPreflight });
  const conf = await connection.confirmTransaction(sig, opts.commitment);
  if (conf.value && conf.value.err) {
    throw new Error('Transaction failed: ' + JSON.stringify(conf.value.err));
  }
  return sig;
}

function deserializeVersioned(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  return VersionedTransaction.deserialize(bytes);
}

module.exports = {
  sendAndConfirm,
  deserializeVersioned,
};

