const fs = require('fs');
const path = require('path');
const { STATE_FILE } = require('./config');

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) || {};
  } catch (e) {
    return {};
  }
}

function saveState(next) {
  ensureDirForFile(STATE_FILE);
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
}

function updateState(patch) {
  const s = loadState();
  const n = { ...s, ...patch };
  // If caller explicitly clears mint (empty string or null), remove it from persisted state
  if (Object.prototype.hasOwnProperty.call(patch, 'mint')) {
    const v = patch.mint;
    if (v == null || (typeof v === 'string' && v.trim() === '')) {
      delete n.mint;
    }
  }
  saveState(n);
  return n;
}

module.exports = { loadState, saveState, updateState };
