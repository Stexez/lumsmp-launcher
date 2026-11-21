'use strict';
const fsp = require('fs/promises');
const path = require('path');
const { SITE_ORIGIN } = require('./config');
const { download, fileHash, safeJoin, pool } = require('./net');
const modrinth = require('./modrinth');

const MOD_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}\.jar$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

function checkRequired(mods) {
  if (!Array.isArray(mods)) throw new Error('Mod listesi okunamadı.');
  return mods.map((mod) => {
    if (!MOD_NAME_RE.test(mod.name || '') || !SHA256_RE.test(mod.sha256 || '') || !Number.isInteger(mod.size)) {
      throw new Error('Siteden gelen mod listesi geçersiz.');
    }
    const url = new URL(mod.url, SITE_ORIGIN);
    if (url.origin !== SITE_ORIGIN || url.pathname !== `/api/launcher/mods/${mod.sha256}.jar`) throw new Error('Mod adresi geçersiz.');
    return { ...mod, url: url.toString() };
  });
}

/**
 * <game>/mods klasörünü tam olarak şuna eşitler: sitedeki zorunlu modlar + launcher'ın kendi modu
 * + oyuncunun tiklediği modlar (ve onların gerektirdiği kütüphaneler). Başka her şey silinir.
 * options: { required, bundled: [{ name, file, sha256 }], selected: [slug], minecraft, token }
 */
async function syncMods(root, { required, bundled = [], selected = [], minecraft, token }, progress) {
  const dir = safeJoin(root, 'mods');
  await fsp.mkdir(dir, { recursive: true });
  const siteMods = checkRequired(required);

  progress('mods', 0, 1);
  // 1) Zorunlu site modları
  for (const mod of siteMods) {
    const target = safeJoin(dir, mod.name);
    await download(mod.url, target, { sha256: mod.sha256, size: mod.size }, { Authorization: `Bearer ${token}` });
    if (await fileHash(target, 'sha256') !== mod.sha256) throw new Error(`${mod.name} doğrulanamadı.`);
  }

  // 2) Launcher içinde gelen mod(lar)
  for (const mod of bundled) {
    const target = safeJoin(dir, mod.name);
    const current = await fileHash(target, 'sha256').catch(() => null);
    if (current !== mod.sha256) await fsp.copyFile(mod.file, target);
  }

  // 3) Seçmeli modlar (Modrinth). Sitede zaten olan bir modu ikinci kez kurmayız.
  let optional = [];
  if (selected.length) {
    let skip = new Set();
    try {
      const hashes = await Promise.all(siteMods.map((mod) => fileHash(safeJoin(dir, mod.name), 'sha1')));
      skip = await modrinth.projectsOf(hashes);
    } catch { /* eşleşme bulunamazsa hepsi kurulur */ }
    try {
      optional = await modrinth.resolve(selected, minecraft, skip);
    } catch (error) {
      if (/sürümü yok|birlikte çalışmıyor/.test(error.message)) throw error;
      throw new Error(`Seçtiğin modlar Modrinth'ten alınamadı (${error.message}). İnternetini kontrol et ya da Modlar sekmesinden seçimleri kapat.`);
    }
  }
  const taken = new Set([...siteMods, ...bundled].map((mod) => mod.name.toLowerCase()));
  optional = optional.filter((mod) => !taken.has(mod.name.toLowerCase()));

  // 4) Listede olmayan her şeyi sil (kapatılan modlar, elle atılan dosyalar).
  const wanted = new Set([...taken, ...optional.map((mod) => mod.name.toLowerCase())]);
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    if (!(entry.isFile() && wanted.has(entry.name.toLowerCase()))) {
      await fsp.rm(path.join(dir, entry.name), { recursive: true, force: true });
    }
  }

  // 5) Seçmeli modları indir
  let done = 0;
  progress('mods', 0, optional.length || 1);
  await pool(optional, 4, async (mod) => {
    await download(mod.url, safeJoin(dir, mod.name), { sha512: mod.sha512, size: mod.size });
    progress('mods', ++done, optional.length);
  });
  progress('mods', 1, 1);
  return { required: siteMods.length + bundled.length, optional: optional.length };
}

module.exports = { syncMods, MOD_NAME_RE };
