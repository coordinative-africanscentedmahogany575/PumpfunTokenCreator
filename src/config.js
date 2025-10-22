const path = require('path');
require('dotenv').config();

// RPC provider (prefer Helius env override, fall back to standard Solana mainnet)
const HELIUS_RPC_URL =
  process.env.HELIUS_RPC_URL ||
  process.env.RPC_PROVIDER ||
  'https://api.mainnet-beta.solana.com';

// PumpPortal endpoints 
const PUMP_IPFS_URL = 'https://pump.fun/api/ipfs';
const PUMP_TRADE_LOCAL_URL = 'https://pumpportal.fun/api/trade-local';

// Wallet files
const DEV_WALLET_FILE = process.env.DEV_WALLET_FILE || path.join('wallets', 'dev.json');
const BUYERS_FILE = process.env.BUYERS_FILE || path.join('wallets', 'buyers.json');

// Trading defaults
const DEFAULT_BUY_SOL = Number(process.env.DEFAULT_BUY_SOL || '0.02');
const FEE_BUFFER_SOL = Number(process.env.FEE_BUFFER_SOL || '0.03');
const DEFAULT_SLIPPAGE_PERCENT = Number(process.env.DEFAULT_SLIPPAGE_PERCENT || '10');
const DEFAULT_PRIORITY_FEE_SOL = Number(process.env.DEFAULT_PRIORITY_FEE_SOL || '0.00001');
const DEFAULT_POOL = process.env.DEFAULT_POOL || 'auto'; // create uses 'pump' explicitly

// Token creation defaults
const TOKEN_NAME = process.env.TOKEN_NAME || '';
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || '';
const TOKEN_DESCRIPTION = process.env.TOKEN_DESCRIPTION || '';
const TOKEN_IMAGE_PATH = process.env.TOKEN_IMAGE_PATH || '';
const TOKEN_TWITTER = process.env.TOKEN_TWITTER || '';
const TOKEN_TELEGRAM = process.env.TOKEN_TELEGRAM || '';
const TOKEN_WEBSITE = process.env.TOKEN_WEBSITE || '';

// State file for persistence
const STATE_FILE = process.env.STATE_FILE || path.join('data', 'state.json');

module.exports = {
  HELIUS_RPC_URL,
  PUMP_IPFS_URL,
  PUMP_TRADE_LOCAL_URL,
  DEV_WALLET_FILE,
  BUYERS_FILE,
  DEFAULT_BUY_SOL,
  FEE_BUFFER_SOL,
  DEFAULT_SLIPPAGE_PERCENT,
  DEFAULT_PRIORITY_FEE_SOL,
  DEFAULT_POOL,
  TOKEN_NAME,
  TOKEN_SYMBOL,
  TOKEN_DESCRIPTION,
  TOKEN_IMAGE_PATH,
  TOKEN_TWITTER,
  TOKEN_TELEGRAM,
  TOKEN_WEBSITE,
  STATE_FILE,
};
