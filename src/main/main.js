'use strict';
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const config = require('./config');
const site = require('./site');
const microsoft = require('./microsoft');
const minecraft = require('./minecraft');
const { syncMods } = require('./mods');
const modrinth = require('./modrinth');
const { CATALOG, CATEGORIES, CATEGORY_INFO, PICKS } = require('./catalog');
const { secrets, settings, maxRamMb, recommendedRamMb, PERF_MODES } = require('./store');

const crypto = require('crypto');
const RENDERER = path.join(__dirname, '..', 'renderer', 'index.html');
const EXTERNAL = {
  register: `${config.SITE_ORIGIN}/register.html`,
  site: config.SITE_ORIGIN,
  forgot: `${config.SITE_ORIGIN}/login.html`,
};

let win = null;
let playing = false;
let gameProcess = null;
let updateState = { state: 'checking' };
const runtime = { mc: null };          // Minecraft access token: memory only, never written to disk

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

app.setAppUserModelId('tr.lumsmp.launcher');

// Dışarıdan müdahaleye kapalı: kurulu sürümde hata ayıklama / uzaktan kontrol bayraklarıyla açılırsa kapanır.
if (app.isPackaged) {
  const blocked = ['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk', 'js-flags', 'remote-allow-origins'];
  if (blocked.some((flag) => app.commandLine.hasSwitch(flag)) || process.argv.some((arg) => /^--(inspect|remote-debugging|js-flags)/.test(arg))) {
    app.exit(1);
  }
}

function gameDir() {
  return path.join(app.getPath('appData'), '.lumsmp');
}

// Launcher'ın içinde gelen, her zaman kurulan modlar (src/bundled/*.jar).
const BUNDLED_DIR = path.join(__dirname, '..', 'bundled');
let bundledCache = null;
async function bundledMods() {
  if (bundledCache) return bundledCache;
  const list = [];
  let names = [];
  try { names = fs.readdirSync(BUNDLED_DIR).filter((name) => /^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}\.jar$/.test(name)); } catch { /* yok */ }
  for (const name of names) {
    const file = path.join(BUNDLED_DIR, name);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    list.push({ name, file, sha256 });
  }
  bundledCache = list;
  return list;
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ---------------------------------------------------------------- hardening
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.on('will-navigate', (event, url) => {
    // The main window never navigates; the Microsoft login window handles its own navigation.
    if (contents === win?.webContents && !isRendererUrl(url)) event.preventDefault();
  });
});

function isRendererUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:' || parsed.search || parsed.hash) return false;
    return path.normalize(require('url').fileURLToPath(parsed)).toLowerCase() === path.normalize(RENDERER).toLowerCase();
  } catch {
    return false;
  }
}

function assertSender(event) {
  if (!win || event.sender !== win.webContents || !isRendererUrl(event.senderFrame?.url || '')) throw new Error('Yetkisiz istek.');
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertSender(event);
    try {
      return { ok: true, data: await fn(...args) };
    } catch (error) {
      return { ok: false, error: String(error?.message || error || 'Bilinmeyen hata') };
    }
  });
}

// ---------------------------------------------------------------- window
function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 680, resizable: false, maximizable: false, fullscreenable: false,
    frame: false, show: false, backgroundColor: '#0b0b16', title: 'LumSMP Launcher',
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      spellcheck: false, devTools: !app.isPackaged,
    },
  });
  win.setMenu(null);
  const logLine = (text) => {
    try { fs.appendFileSync(path.join(app.getPath('userData'), 'launcher.log'), `${new Date().toISOString()} ${text}\n`); } catch { /* ignore */ }
  };
  win.webContents.on('did-fail-load', (_e, code, desc, url) => logLine(`did-fail-load ${code} ${desc} ${url}`));
  win.webContents.on('render-process-gone', (_e, details) => logLine(`render-process-gone ${details.reason} ${details.exitCode}`));
  win.webContents.on('preload-error', (_e, file, error) => logLine(`preload-error ${file} ${error.message}`));
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') logLine(`console ${event.level} ${event.message} (${event.sourceId}:${event.lineNumber})`);
  });
  win.webContents.on('did-finish-load', () => logLine(`loaded ${win.webContents.getURL()}`));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
  win.loadFile(RENDERER);
}

// ---------------------------------------------------------------- auto update
function startUpdater() {
  if (!app.isPackaged) { updateState = { state: 'ready' }; send('update', updateState); return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  const set = (state) => { updateState = state; send('update', state); };
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => set({ state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', version: updateState.version, percent: Math.floor(p.percent || 0) }));
  autoUpdater.on('update-not-available', () => set({ state: 'ready' }));
  autoUpdater.on('error', () => { if (updateState.state !== 'installing') set({ state: 'ready', warning: 'Güncelleme kontrol edilemedi.' }); });
  autoUpdater.on('update-downloaded', (info) => {
    set({ state: 'installing', version: info.version });
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500);
  });
  // Never trap the player on the update screen if GitHub is unreachable.
  setTimeout(() => { if (updateState.state === 'checking') set({ state: 'ready', warning: 'Güncelleme kontrolü zaman aşımına uğradı.' }); }, 20000);
  autoUpdater.checkForUpdates().catch(() => {});
}

// ---------------------------------------------------------------- dev-only preview (never active in the installed app)
const DEMO = !app.isPackaged ? process.env.LUMSMP_DEMO || '' : '';
const SHOT = !app.isPackaged ? process.env.LUMSMP_SHOT || '' : '';

// ---------------------------------------------------------------- state
function publicState() {
  if (DEMO) {
    return {
      version: app.getVersion(), update: { state: 'ready' }, microsoftConfigured: true,
      site: DEMO === 'login' ? null : { username: 'Utku3' },
      microsoft: DEMO === 'home' || DEMO === 'settings' ? { name: 'Utku3', uuid: '069a79f444e94726a5befca90e38aaf5' } : null,
      settings: { ...settings.read(), modsSetup: DEMO !== 'onboard' }, maxRamMb: maxRamMb(), ramRecommendedMb: recommendedRamMb(20), playing: false,
    };
  }
  const stored = secrets.read();
  return {
    version: app.getVersion(),
    update: updateState,
    site: stored.siteToken ? { username: stored.siteUser } : null,
    microsoft: stored.msRefresh && stored.msProfile ? stored.msProfile : null,
    microsoftConfigured: microsoft.configured(),
    settings: settings.read(),
    maxRamMb: maxRamMb(),
    ramRecommendedMb: recommendedRamMb(settings.read().mods.length),
    playing,
  };
}

async function validateSiteSession() {
  const stored = secrets.read();
  if (!stored.siteToken) return;
  try {
    const me = await site.me(stored.siteToken);
    if (me.username !== stored.siteUser) secrets.update({ siteUser: me.username });
  } catch (error) {
    if (error.status === 401) secrets.update({ siteToken: null, siteUser: null });
  }
}

function offlineAuth(username) {
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + username).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { name: username, uuid: hex, uuidDash: uuid, accessToken: '0', xuid: '', expiresAt: Infinity };
}

async function minecraftAuth() {
  if (runtime.mc && runtime.mc.expiresAt > Date.now()) return runtime.mc;
  const stored = secrets.read();
  if (!stored.msRefresh) throw new Error('Önce Microsoft hesabını bağla.');
  try {
    const result = await microsoft.refresh(stored.msRefresh);
    secrets.update({ msRefresh: result.refreshToken, msProfile: { name: result.minecraft.name, uuid: result.minecraft.uuid } });
    runtime.mc = result.minecraft;
    return runtime.mc;
  } catch (error) {
    if (error.relogin) secrets.update({ msRefresh: null, msProfile: null });
    throw error;
  }
}

// ---------------------------------------------------------------- play
async function play() {
  if (playing) throw new Error('Oyun zaten açılıyor veya çalışıyor.');
  if (updateState.state === 'downloading' || updateState.state === 'installing') throw new Error('Önce güncelleme tamamlanmalı.');
  const stored = secrets.read();
  if (!stored.siteToken) throw new Error('Önce LumSMP hesabınla giriş yap.');
  playing = true;
  const progress = (stage, done, total) => send('progress', { stage, done, total });
  try {
    progress('auth', 0, 1);
    let auth;
    if (stored.msRefresh) {
      auth = await minecraftAuth();
      if (auth.name.toLowerCase() !== String(stored.siteUser || '').toLowerCase()) {
        throw new Error(`LumSMP hesabın '${stored.siteUser}', Minecraft adın '${auth.name}'. İkisi aynı olmalı: `
          + 'sitede Minecraft adınla hesap aç ya da doğru Microsoft hesabını bağla.');
      }
    } else {
      auth = offlineAuth(stored.siteUser);
    }
    const manifest = await site.manifest(stored.siteToken);
    const root = gameDir();
    fs.mkdirSync(root, { recursive: true });
    const installed = await minecraft.install(root, { minecraft: manifest.minecraft, fabricLoader: manifest.fabricLoader || '' }, progress);
    const opts = settings.read();
    await syncMods(root, {
      required: manifest.mods, bundled: await bundledMods(), selected: opts.mods,
      minecraft: manifest.minecraft, token: stored.siteToken,
    }, progress);
    progress('ticket', 0, 1);
    await site.play(stored.siteToken, auth.name);      // join ticket for the server's launcher check
    progress('launch', 1, 1);

    const started = Date.now();
    const game = minecraft.launch(root, installed, {
      auth, ramMb: opts.ramMb, perfMode: opts.perfMode,
      clientMod: (await bundledMods()).some((mod) => mod.name === 'lumsmp-client.jar'),
      server: { host: manifest.server?.host || 'lumcraft.com.tr', port: manifest.server?.port || 25565 },
    });
    gameProcess = game.child;
    const heartbeat = setInterval(() => { site.play(stored.siteToken, auth.name).catch(() => {}); }, 60000);
    send('game', { state: 'running' });
    setTimeout(() => { if (gameProcess && win) win.hide(); }, 4000);

    game.child.on('error', (error) => {
      clearInterval(heartbeat);
      gameProcess = null;
      playing = false;
      if (win) win.show();
      send('game', { state: 'error', message: `Oyun başlatılamadı: ${error.message}` });
    });
    game.child.on('exit', (code) => {
      clearInterval(heartbeat);
      gameProcess = null;
      playing = false;
      if (win) { win.show(); win.focus(); }
      const crashed = code !== 0 && code !== null;
      send('game', crashed
        ? { state: 'crashed', message: `Oyun beklenmedik şekilde kapandı (kod ${code}).`, tail: game.tail.slice(-15), quick: Date.now() - started < 60000 }
        : { state: 'exited' });
    });
    return { started: true };
  } catch (error) {
    playing = false;
    throw error;
  }
}

// ---------------------------------------------------------------- IPC
handle('state:get', async () => publicState());

handle('site:login', async (username, password) => {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(username.trim())) throw new Error('Kullanıcı adı 3-16 karakter; harf, rakam ve _ olabilir.');
  if (typeof password !== 'string' || password.length < 1 || password.length > 200) throw new Error('Parolanı yaz.');
  const result = await site.login(username.trim(), password);
  secrets.update({ siteToken: result.token, siteUser: result.account.username });
  return publicState();
});

handle('site:logout', async () => {
  const stored = secrets.read();
  if (stored.siteToken) await site.logout(stored.siteToken).catch(() => {});
  secrets.update({ siteToken: null, siteUser: null });
  return publicState();
});

handle('ms:login', async () => {
  const result = await microsoft.login();
  runtime.mc = result.minecraft;
  secrets.update({ msRefresh: result.refreshToken, msProfile: { name: result.minecraft.name, uuid: result.minecraft.uuid } });
  return publicState();
});

handle('ms:logout', async () => {
  runtime.mc = null;
  secrets.update({ msRefresh: null, msProfile: null });
  return publicState();
});

handle('settings:update', async (patch) => {
  if (!patch || typeof patch !== 'object') throw new Error('Ayar geçersiz.');
  if (playing && patch.mods !== undefined) throw new Error('Oyun açıkken modlar değiştirilemez.');
  const clean = {};
  if (Number.isInteger(patch.ramMb)) { clean.ramMb = patch.ramMb; clean.ramAuto = false; }
  if (typeof patch.ramAuto === 'boolean') clean.ramAuto = patch.ramAuto;
  if (PERF_MODES.includes(patch.perfMode)) clean.perfMode = patch.perfMode;
  if (Array.isArray(patch.mods) && patch.mods.length <= CATALOG.length) clean.mods = patch.mods.filter((slug) => typeof slug === 'string');
  if (typeof patch.modsSetup === 'boolean') clean.modsSetup = patch.modsSetup;
  settings.update(clean);
  return publicState();
});

handle('mods:catalog', async () => {
  const stored = secrets.read();
  const manifest = stored.siteToken ? await site.manifest(stored.siteToken).catch(() => null) : null;
  const minecraftVersion = typeof manifest?.minecraft === 'string' ? manifest.minecraft : (DEMO ? '26.3' : null);
  let info = null;
  let error = null;
  if (minecraftVersion) {
    try { info = await modrinth.catalogInfo(minecraftVersion); } catch { error = 'Modrinth\'e ulaşılamadı. Liste internet gelince yenilenir.'; }
  } else {
    error = 'Sunucu bilgisi alınamadı.';
  }
  const selected = new Set(settings.read().mods);
  return {
    minecraft: minecraftVersion,
    error,
    categories: CATEGORIES.map(([id, name]) => ({ id, name, desc: CATEGORY_INFO[id] || '', picks: PICKS[id] || [] })),
    required: Array.isArray(manifest?.mods) ? manifest.mods.map((mod) => String(mod.name || '').replace(/\.jar$/i, '')).slice(0, 100) : [],
    items: CATALOG.map((mod) => {
      const project = info?.get(mod.slug);
      return {
        slug: mod.slug, name: mod.name, desc: mod.desc, category: mod.category,
        conflicts: mod.conflicts || [],
        default: Boolean(mod.default),
        icon: project?.icon || null,
        downloads: project?.downloads || 0,
        available: info ? Boolean(project?.available) : null,
        selected: selected.has(mod.slug),
      };
    }),
  };
});

handle('home:data', async () => {
  const stored = secrets.read();
  const [status, manifest] = await Promise.all([
    site.serverStatus().catch(() => null),
    stored.siteToken ? site.manifest(stored.siteToken).catch(() => null) : null,
  ]);
  return {
    status: status ? { online: Boolean(status.online), players: Number(status.players) || 0, max: Number(status.max) || 0 } : null,
    news: typeof manifest?.news === 'string' ? manifest.news.slice(0, 500) : '',
    mods: Array.isArray(manifest?.mods) ? manifest.mods.length : null,
    minecraft: typeof manifest?.minecraft === 'string' ? manifest.minecraft : null,
  };
});

handle('game:play', play);

handle('open', async (kind) => {
  if (!Object.prototype.hasOwnProperty.call(EXTERNAL, kind)) throw new Error('Bilinmeyen bağlantı.');
  await shell.openExternal(EXTERNAL[kind]);
  return true;
});

handle('window:minimize', async () => { win?.minimize(); return true; });
handle('window:close', async () => {
  if (gameProcess) { win?.hide(); return true; }
  app.quit();
  return true;
});

// ---------------------------------------------------------------- lifecycle
app.whenReady().then(async () => {
  createWindow();
  win.webContents.once('did-finish-load', () => {
    if (SHOT) {
      if (DEMO === 'settings' || DEMO === 'mods') {
        setTimeout(() => win.webContents.executeJavaScript(`document.querySelector('[data-nav="${DEMO}"]').click()`), 1500);
      }
      setTimeout(async () => {
        const image = await win.webContents.capturePage();
        fs.writeFileSync(SHOT, image.toPNG());
        app.quit();
      }, 3500);
    }
    startUpdater();
    validateSiteSession().then(() => send('state', publicState())).catch(() => {});
  });
});

app.on('window-all-closed', () => {
  if (!gameProcess) app.quit();
});

process.on('uncaughtException', (error) => {
  try { dialog.showErrorBox('LumSMP Launcher', `Beklenmeyen hata: ${error.message}`); } catch { /* ignore */ }
});
