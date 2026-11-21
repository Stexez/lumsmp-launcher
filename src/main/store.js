'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, safeStorage } = require('electron');
const { sanitizeSelection } = require('./catalog');

const DEFAULT_SETTINGS = Object.freeze({ ramMb: 4096, ramAuto: true, perfMode: 'auto' });
const PERF_MODES = Object.freeze(['auto', 'g1', 'zgc']);

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

/**
 * Önerilen RAM: bilgisayarın belleğine ve seçili mod sayısına göre. Çok fazla RAM vermek de
 * takılma yapar (çöp toplama uzar), o yüzden üst sınır 8 GB.
 */
function recommendedRamMb(modCount = 0, totalMb = Math.floor(os.totalmem() / 1024 / 1024)) {
  let mb = 3072;
  if (totalMb > 7 * 1024) mb = 4096;
  if (totalMb > 12 * 1024) mb = 5120;
  if (totalMb > 15 * 1024) mb = 6144;
  if (totalMb > 28 * 1024) mb = 8192;
  if (modCount >= 35) mb += 1024;
  const cap = Math.max(2048, Math.min(16384, totalMb - 2048));
  return Math.max(2048, Math.min(cap, 8192, mb));
}

const settings = {
  read() {
    let stored = {};
    try { stored = JSON.parse(fs.readFileSync(userFile('settings.json'), 'utf8')); } catch { /* defaults */ }
    // 1.1.3 öncesi: RAM'i elle değiştirmiş oyuncunun seçimi otomatik ayarla ezilmesin.
    if (stored && !('ramAuto' in stored) && Number.isInteger(stored.ramMb) && stored.ramMb !== DEFAULT_SETTINGS.ramMb) stored.ramAuto = false;
    return sanitize({ ...DEFAULT_SETTINGS, ...stored });
  },
  update(patch) {
    const next = sanitize({ ...this.read(), ...patch });
    writeAtomic(userFile('settings.json'), JSON.stringify(next, null, 2));
    return next;
  },
};

function sanitize(value) {
  const mods = sanitizeSelection(value.mods);
  const ramAuto = value.ramAuto !== false;
  const ram = ramAuto ? recommendedRamMb(mods.length) : (Number.isInteger(value.ramMb) ? value.ramMb : DEFAULT_SETTINGS.ramMb);
  return {
    ramMb: Math.max(2048, Math.min(maxRamMb(), Math.round(ram / 512) * 512)),
    ramAuto,
    perfMode: PERF_MODES.includes(value.perfMode) ? value.perfMode : 'auto',
    mods,
    // İlk açılıştaki "mod paketlerini seç" ekranı bir kez gösterilir.
    modsSetup: value.modsSetup === true,
  };
}

module.exports = { secrets, settings, maxRamMb, recommendedRamMb, PERF_MODES };
