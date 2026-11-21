'use strict';
const { SITE_ORIGIN } = require('./config');
const { request } = require('./net');

/**
 * Site API. Requests are forced over IPv4 so the IP the site records for the join ticket is the
 * same one the Minecraft server (same host, IPv4) sees when the game connects.
 */
async function call(pathname, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' };
  let payload;
  if (body !== undefined) {
    payload = Buffer.from(JSON.stringify(body));
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(payload.length);
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await request(`${SITE_ORIGIN}${pathname}`, { method, headers, body: payload, family: 4, timeoutMs: 20000, maxBytes: 2 * 1024 * 1024 });
  } catch (error) {
    throw Object.assign(new Error('lumcraft.com.tr adresine ulaşılamadı. İnternet bağlantını kontrol et.'), { cause: error });
  }
  let data = {};
  try { data = JSON.parse(res.body.toString('utf8') || '{}'); } catch { /* non-JSON */ }
  if (res.status < 200 || res.status >= 300) {
    const error = new Error(typeof data.error === 'string' ? data.error : `Site hatası (HTTP ${res.status}).`);
    error.status = res.status;
    throw error;
  }
  return data;
}

module.exports = {
  login: (username, password) => call('/api/launcher/login', { method: 'POST', body: { username, password } }),
  me: (token) => call('/api/launcher/me', { token }),
  logout: (token) => call('/api/launcher/logout', { method: 'POST', body: {}, token }),
  manifest: (token) => call('/api/launcher/manifest', { token }),
  play: (token, minecraftName) => call('/api/launcher/play', { method: 'POST', body: { minecraft_name: minecraftName }, token }),
  serverStatus: () => call('/api/public/server-status'),
};
