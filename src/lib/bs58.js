// Unified bs58 import for CJS/ESM
const mod = require('bs58');
const bs58 = mod && typeof mod.encode === 'function' ? mod : mod.default;
module.exports = bs58;

