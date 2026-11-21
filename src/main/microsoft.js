'use strict';
const crypto = require('crypto');
const { BrowserWindow, session } = require('electron');
const { MS_CLIENT_ID, MS_REDIRECT } = require('./config');
const { request } = require('./net');

const AUTHORIZE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
const TOKEN = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const SCOPE = 'XboxLive.signin offline_access';

function configured() {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(MS_CLIENT_ID);
}

async function postForm(url, fields) {
  const body = Buffer.from(new URLSearchParams(fields).toString());
  const res = await request(url, {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(body.length), Accept: 'application/json' },
  });
  const data = JSON.parse(res.body.toString('utf8') || '{}');
  if (res.status !== 200) throw Object.assign(new Error(data.error_description || data.error || `HTTP ${res.status}`), { code: data.error });
  return data;
}

async function postJson(url, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  const res = await request(url, {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': String(body.length), ...headers },
  });
  let data = {};
  try { data = JSON.parse(res.body.toString('utf8') || '{}'); } catch { /* empty */ }
  return { status: res.status, data };
}

/** Opens the Microsoft sign-in page in an isolated window and returns the authorization code. */
function interactiveCode() {
  return new Promise((resolve, reject) => {
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');
    const url = `${AUTHORIZE}?${new URLSearchParams({
      client_id: MS_CLIENT_ID, response_type: 'code', redirect_uri: MS_REDIRECT, scope: SCOPE,
      code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'select_account',
    })}`;
    const partition = `ms-login-${crypto.randomBytes(6).toString('hex')}`;
    const win = new BrowserWindow({
      width: 520, height: 700, title: 'Microsoft ile giriş', autoHideMenuBar: true, backgroundColor: '#ffffff',
      webPreferences: { partition, nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    let done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      if (!win.isDestroyed()) win.destroy();
      session.fromPartition(partition).clearStorageData().catch(() => {});
      error ? reject(error) : resolve(value);
    };
    const inspect = (event, target) => {
      if (!target.startsWith(MS_REDIRECT)) return;
      if (event && event.preventDefault) event.preventDefault();
      const params = new URL(target).searchParams;
      if (params.get('state') !== state) return finish(new Error('Microsoft girişi doğrulanamadı (state).'));
      if (params.get('error')) return finish(new Error(params.get('error_description') || 'Microsoft girişi iptal edildi.'));
      const code = params.get('code');
      if (!code) return finish(new Error('Microsoft giriş kodu alınamadı.'));
      finish(null, { code, verifier });
    };
    win.webContents.on('will-redirect', (event, target) => inspect(event, target));
    win.webContents.on('will-navigate', (event, target) => inspect(event, target));
    win.webContents.on('did-redirect-navigation', (event, target) => inspect(null, target));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('closed', () => finish(new Error('Microsoft girişi kapatıldı.')));
    win.loadURL(url).catch(() => {});
  });
}

const XSTS_ERRORS = {
  2148916233: 'Bu Microsoft hesabının Xbox profili yok. xbox.com\'a bir kez giriş yapıp profil oluştur.',
  2148916235: 'Xbox Live bu ülkede kullanılamıyor.',
  2148916236: 'Hesabın yetişkin doğrulaması gerektiriyor (Güney Kore).',
  2148916237: 'Hesabın yetişkin doğrulaması gerektiriyor (Güney Kore).',
  2148916238: 'Bu bir çocuk hesabı; bir aileye eklenmesi gerekiyor.',
};

/** Microsoft token → Xbox Live → XSTS → Minecraft token + profile. */
async function minecraftFromMicrosoft(msAccessToken) {
  const xbl = await postJson('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
    RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT',
  });
  if (xbl.status !== 200 || !xbl.data.Token) throw new Error('Xbox Live girişi başarısız.');
  const uhs = xbl.data.DisplayClaims?.xui?.[0]?.uhs;
  const xsts = await postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.data.Token] },
    RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT',
  });
  if (xsts.status !== 200) throw new Error(XSTS_ERRORS[xsts.data.XErr] || 'Xbox (XSTS) doğrulaması başarısız.');
  const mc = await postJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
    identityToken: `XBL3.0 x=${uhs};${xsts.data.Token}`,
  });
  if (mc.status !== 200 || !mc.data.access_token) {
    throw new Error(mc.status === 403
      ? 'Bu launcher\'ın Microsoft uygulaması henüz Mojang tarafından onaylanmadı.'
      : 'Minecraft girişi başarısız.');
  }
  const profileRes = await request('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mc.data.access_token}`, Accept: 'application/json' },
  });
  if (profileRes.status === 404) throw new Error('Bu Microsoft hesabında Minecraft: Java Edition yok.');
  if (profileRes.status !== 200) throw new Error('Minecraft profili alınamadı.');
  const profile = JSON.parse(profileRes.body.toString('utf8'));
  if (!/^[0-9a-f]{32}$/i.test(profile.id || '') || !/^[A-Za-z0-9_]{3,16}$/.test(profile.name || '')) {
    throw new Error('Minecraft profili geçersiz.');
  }
  const xuid = (() => {
    try { return JSON.parse(Buffer.from(mc.data.access_token.split('.')[1], 'base64url').toString()).xuid || '0'; }
    catch { return '0'; }
  })();
  return {
    accessToken: mc.data.access_token,
    expiresAt: Date.now() + (Number(mc.data.expires_in) || 3600) * 1000 - 60000,
    uuid: profile.id.toLowerCase(),
    name: profile.name,
    xuid: String(xuid).replace(/[^0-9]/g, '') || '0',
  };
}

async function login() {
  if (!configured()) throw new Error('Microsoft girişi henüz yapılandırılmadı (launcher.config.json → microsoftClientId).');
  const { code, verifier } = await interactiveCode();
  const tokens = await postForm(TOKEN, {
    client_id: MS_CLIENT_ID, grant_type: 'authorization_code', code, redirect_uri: MS_REDIRECT,
    code_verifier: verifier, scope: SCOPE,
  });
  const minecraft = await minecraftFromMicrosoft(tokens.access_token);
  return { refreshToken: tokens.refresh_token, minecraft };
}

/** Silent re-login with the stored refresh token. Returns a new refresh token too (rotation). */
async function refresh(refreshToken) {
  if (!configured()) throw new Error('Microsoft girişi yapılandırılmadı.');
  let tokens;
  try {
    tokens = await postForm(TOKEN, { client_id: MS_CLIENT_ID, grant_type: 'refresh_token', refresh_token: refreshToken, scope: SCOPE });
  } catch (error) {
    if (error.code === 'invalid_grant') throw Object.assign(new Error('Microsoft oturumunun süresi doldu, yeniden bağlan.'), { relogin: true });
    throw error;
  }
  const minecraft = await minecraftFromMicrosoft(tokens.access_token);
  return { refreshToken: tokens.refresh_token || refreshToken, minecraft };
}

module.exports = { login, refresh, configured };
