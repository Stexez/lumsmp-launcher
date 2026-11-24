'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { ALLOWED_HOSTS } = require('./config');

// Modrinth API'si istemciyi tanıtan bir User-Agent istiyor.
const USER_AGENT = 'Stexez/lumsmp-launcher';

function checkUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error(`İzin verilmeyen adres: ${parsed.hostname}`);
  }
  return parsed;
}

/** Resolves `relative` under `base` and refuses anything that would escape it (path traversal). */
function safeJoin(base, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0')) throw new Error('Geçersiz dosya yolu.');
  const root = path.resolve(base);
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`Güvensiz dosya yolu: ${relative}`);
  return target;
}

/**
 * Minimal HTTPS client (no redirects to other hosts, size and time limits).
 * options: { method, headers, body (Buffer|string), family, timeoutMs, maxBytes }
 */
function request(url, options = {}, redirects = 0) {
  const parsed = checkUrl(url);
  return new Promise((resolve, reject) => {
    const req = https.request(parsed, {
      method: options.method || 'GET',
      headers: { 'User-Agent': USER_AGENT, ...(options.headers || {}) },
      family: options.family,
      timeout: options.timeoutMs || 30000,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects >= 5) return reject(new Error('Çok fazla yönlendirme.'));
        const nextUrl = new URL(res.headers.location, parsed);
        let nextOptions = options;
        if (nextUrl.hostname !== parsed.hostname && options.headers) {
          const filtered = {};
          for (const [k, v] of Object.entries(options.headers)) {
            if (!['authorization', 'cookie'].includes(k.toLowerCase())) filtered[k] = v;
          }
          nextOptions = { ...options, headers: filtered };
        }
        return request(nextUrl.toString(), nextOptions, redirects + 1).then(resolve, reject);
      }
      const chunks = [];
      let total = 0;
      const limit = options.maxBytes || 32 * 1024 * 1024;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > limit) { req.destroy(new Error('Yanıt çok büyük.')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Bağlantı zaman aşımına uğradı.')));
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function getJson(url, options = {}) {
  const res = await request(url, options);
  if (res.status < 200 || res.status >= 300) throw new Error(`${new URL(url).hostname} yanıtı: HTTP ${res.status}`);
  try { return JSON.parse(res.body.toString('utf8')); } catch { throw new Error(`${new URL(url).hostname} geçersiz JSON döndürdü.`); }
}

async function fileHash(file, algorithm) {
  const hash = crypto.createHash(algorithm);
  await new Promise((resolve, reject) => {
    fs.createReadStream(file).on('data', (d) => hash.update(d)).on('end', resolve).on('error', reject);
  });
  return hash.digest('hex');
}

/**
 * Downloads `url` to `dest`, verifying sha1 / sha256 / size when given.
 * An existing file that already matches is kept. Partial files never replace good ones.
 * expect: { sha1, sha256, size, trustSize }  (trustSize: skip re-hashing an existing file of the right size)
 */
async function download(url, dest, expect = {}, headers = {}, onBytes = () => {}) {
  checkUrl(url);
  const existing = await fsp.stat(dest).catch(() => null);
  if (existing && existing.isFile() && (expect.size == null || existing.size === expect.size)) {
    if (expect.trustSize && expect.size != null) return false;
    const checks = [
      expect.sha512 ? ['sha512', expect.sha512] : null,
      expect.sha256 ? ['sha256', expect.sha256] : null,
      expect.sha1 ? ['sha1', expect.sha1] : null,
    ].filter(Boolean);
    if (checks.length > 0) {
      let allMatch = true;
      for (const [alg, expected] of checks) {
        if (await fileHash(dest, alg) !== expected) { allMatch = false; break; }
      }
      if (allMatch) return false;
    } else if (expect.size != null) {
      return false;
    }
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const maxBytes = expect.size != null ? expect.size : (expect.maxBytes || 512 * 1024 * 1024);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const part = `${dest}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.part`;
    try {
      await streamTo(url, part, headers, onBytes, 0, maxBytes);
      const stat = await fsp.stat(part);
      if (expect.size != null && stat.size !== expect.size) throw new Error('Dosya boyutu tutmuyor.');
      if (expect.sha1 && await fileHash(part, 'sha1') !== expect.sha1) throw new Error('SHA-1 doğrulaması başarısız.');
      if (expect.sha256 && await fileHash(part, 'sha256') !== expect.sha256) throw new Error('SHA-256 doğrulaması başarısız.');
      if (expect.sha512 && await fileHash(part, 'sha512') !== expect.sha512) throw new Error('SHA-512 doğrulaması başarısız.');
      await fsp.rename(part, dest);
      return true;
    } catch (error) {
      lastError = error;
      await fsp.rm(part, { force: true });
      if (attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  throw new Error(`${path.basename(dest)} indirilemedi: ${lastError.message}`);
}

function streamTo(url, file, headers, onBytes, redirects = 0, maxBytes = 512 * 1024 * 1024) {
  const parsed = checkUrl(url);
  return new Promise((resolve, reject) => {
    const req = https.get(parsed, { headers: { 'User-Agent': USER_AGENT, ...headers }, timeout: 60000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects >= 5) return reject(new Error('Çok fazla yönlendirme.'));
        // Auth headers are only ever sent to the original host.
        const next = new URL(res.headers.location, parsed);
        const nextHeaders = next.hostname === parsed.hostname ? headers : {};
        return streamTo(next.toString(), file, nextHeaders, onBytes, redirects + 1, maxBytes).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const out = fs.createWriteStream(file);
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          req.destroy(new Error('İndirilen dosya izin verilen boyutu aşıyor.'));
          out.destroy();
          return;
        }
        onBytes(chunk.length);
      });
      res.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('İndirme zaman aşımına uğradı.')));
    req.on('error', reject);
  });
}

/** Runs async jobs with a concurrency limit; rejects on the first failure. */
async function pool(items, limit, worker) {
  let index = 0;
  let failed = null;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && index < items.length) {
      const item = items[index++];
      try { await worker(item); } catch (error) { failed = failed || error; }
    }
  });
  await Promise.all(runners);
  if (failed) throw failed;
}

module.exports = { request, getJson, download, fileHash, pool, safeJoin, checkUrl };
