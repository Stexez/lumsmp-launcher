'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, safeStorage } = require('electron');
const { sanitizeSelection } = require('./catalog');

const DEFAULT_SETTINGS = Object.freeze({ ramMb: 4096 });

function userFile(name) {
  return path.join(app.getPath('userData'), name);
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, data, { mode: 0o600 });
  fs.renameSync(temp, file);
}

/** Secrets (site token, Microsoft refresh token) are encrypted with Windows DPAPI via safeStorage. */
const secrets = {
  read() {
    try {
      if (!safeStorage.isEncryptionAvailable()) return {};
      const blob = fs.readFileSync(userFile('secure.bin'));
      return JSON.parse(safeStorage.decryptString(blob));
    } catch {
      return {};
    }
  },
  write(values) {
    if (!safeStorage.isEncryptionAvailable()) return; // never store secrets in plain text
    writeAtomic(userFile('secure.bin'), safeStorage.encryptString(JSON.stringify(values)));
  },
  update(patch) {
    const next = { ...this.read(), ...patch };
    for (const key of Object.keys(next)) if (next[key] == null) delete next[key];
    this.write(next);
    return next;
  },
};

function maxRamMb() {
  const total = Math.floor(os.totalmem() / 1024 / 1024);
  return Math.max(2048, Math.min(16384, total - 2048));
}

const settings = {
  read() {
    let stored = {};
    try { stored = JSON.parse(fs.readFileSync(userFile('settings.json'), 'utf8')); } catch { /* defaults */ }
    return sanitize({ ...DEFAULT_SETTINGS, ...stored });
  },
  update(patch) {
    const next = sanitize({ ...this.read(), ...patch });
    writeAtomic(userFile('settings.json'), JSON.stringify(next, null, 2));
    return next;
  },
};

function sanitize(value) {
  const ram = Number.isInteger(value.ramMb) ? value.ramMb : DEFAULT_SETTINGS.ramMb;
  return {
    ramMb: Math.max(2048, Math.min(maxRamMb(), Math.round(ram / 512) * 512)),
    mods: sanitizeSelection(value.mods),
  };
}

module.exports = { secrets, settings, maxRamMb };
