const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const appWindow = window.__TAURI__.window.getCurrentWindow();

const state = {
  data: null,
  catalog: [],
  shaderCatalog: [],
  packCatalog: [],
  products: [],
  storeCat: 'all',
  suspectMod: null,
  modCat: 'all',
  modQuery: '',
  logErrorsOnly: false,
  rawLogs: '',
};

let toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function applyTheme(name) {
  const valid = ['gold', 'purple', 'emerald', 'crimson'].includes(name) ? name : 'gold';
  document.documentElement.dataset.theme = valid;
  localStorage.setItem('lumsmp_theme', valid);
  document.querySelectorAll('#themePicker .theme-swatch').forEach((b) => {
    b.classList.toggle('active', b.dataset.theme === valid);
  });
}

const CAT_LABELS = {
  all: 'Tümü',
  performance: 'Performans',
  visual: 'Görsel',
  animation: 'Animasyon',
  info: 'Harita & Bilgi',
  utility: 'Kolaylık',
};

const STORE_CATS = {
  all: 'Tümü',
  rank: 'VIP Rütbeler',
  lumin: 'Lumin Paketleri',
  cosmetic: 'Kozmetik',
  key: 'Anahtarlar',
};

const STAGE_LABELS = {
  meta: 'Sürüm bilgisi kontrol ediliyor',
  java: 'Java 25 hazırlanıyor',
  libraries: 'Fabric kütüphaneleri indiriliyor',
  assets: 'Oyun dosyaları doğrulanıyor',
  mods: 'Modlar senkronize ediliyor',
};

const PRESETS = {
  fps: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'krypton', 'moreculling', 'dynamic-fps', 'sodium-extra', 'reeses-sodium-options', 'modmenu'],
  vanilla: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'krypton', '3dskinlayers', 'not-enough-animations', 'appleskin', 'chat-heads', 'modmenu', 'zoomify'],
  shader: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'krypton', 'iris', 'continuity', 'lambdynamiclights', 'modmenu'],
  default: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'krypton', 'modmenu'],
};

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(msg) {
  const el = $('homeError');
  if (!msg) { el.hidden = true; return; }
  el.textContent = msg;
  el.hidden = false;
}

function switchTab(tabId) {
  document.querySelectorAll('.rail-btn[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  const target = $(`tab-${tabId}`);
  if (target) target.classList.add('active');
  if (tabId === 'store') renderStore();
  else if (tabId === 'shaders') renderShaders();
  else if (tabId === 'packs') renderPacks();
  else if (tabId === 'logs') refreshLogs();
}

function renderNews(rawText) {
  const feed = $('newsFeed');
  const text = (rawText || '').trim();
  if (!text) {
    feed.innerHTML = `
      <div class="news-item highlight"><strong>LumSMP 26.3</strong> — Oyun içi <strong>Sağ Shift</strong> menüsüyle HUD, Keystrokes, Crosshair, C-Zoom ve Spotify kontrolü aktif.</div>
      <div class="news-item"><strong>Canlı Mağaza</strong> — Sol menüdeki Mağaza sekmesinden VIP rütbeleri ve Lumin paketlerini inceleyebilirsin.</div>
      <div class="news-item"><strong>Bulut Senkronizasyon</strong> — Ayarlar sekmesinden mod ve HUD konumlarını hesabına yedekleyebilirsin.</div>
    `;
    return;
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  feed.innerHTML = lines.map((line, i) => `
    <div class="news-item ${i === 0 ? 'highlight' : ''}">${escapeHtml(line)}</div>
  `).join('');
}

function renderStore() {
  const cats = Object.keys(STORE_CATS);
  $('storeCats').innerHTML = cats
    .map((c) => `<button class="cat-btn ${state.storeCat === c ? 'active' : ''}" data-scat="${c}">${STORE_CATS[c]}</button>`)
    .join('');
  $('storeCats').querySelectorAll('.cat-btn').forEach((b) => {
    b.onclick = () => { state.storeCat = b.dataset.scat; renderStore(); };
  });

  const list = state.products.filter((p) => state.storeCat === 'all' || p.category === state.storeCat);
  if (!list.length) {
    $('storeGrid').innerHTML = '<div class="muted">Bu kategoride aktif ürün bulunamadı.</div>';
    return;
  }
  $('storeGrid').innerHTML = list.map((p) => `
    <div class="store-card">
      <div class="store-card-top">
        <div class="prod-sym">${escapeHtml(p.symbol || '★')}</div>
        <span class="ver-tag">${escapeHtml(p.tag || STORE_CATS[p.category] || 'Ürün')}</span>
      </div>
      <h3 class="store-card-title">${escapeHtml(p.name)}</h3>
      <p class="store-card-desc">${escapeHtml(p.description || '')}</p>
      <div class="store-card-foot">
        <span class="store-price">${escapeHtml(p.price)} ₺</span>
        <button class="btn primary sm" data-buy-prod="${escapeHtml(p.id)}">Satın Al ↗</button>
      </div>
    </div>
  `).join('');
  $('storeGrid').querySelectorAll('[data-buy-prod]').forEach((btn) => {
    btn.onclick = () => invoke('open_external_url', { url: 'https://lumcraft.com.tr/marketplace.html' });
  });
}

function render() {
  const d = state.data;
  if (!d) return;
  $('verBadge').textContent = `v${d.version}`;
  $('settingsVerBadge').textContent = `v${d.version}`;

  renderNews(d.announcement);

  const siteName = d.siteUser?.minecraft_username || d.siteUser?.username || '';
  const mcName = d.mcProfile?.name || '';
  const lumin = d.siteUser?.lumin_balance ?? d.siteUser?.lumin ?? null;
  const rank = d.siteUser?.rank || d.siteUser?.vip || '';

  $('siteUserVal').textContent = siteName || 'Bağlı değil';
  $('siteStatsVal').textContent = siteName
    ? `${lumin != null ? `${lumin} Lumin` : 'Oturum aktif ✓'}${rank ? ` · ${rank}` : ''}`
    : 'Oyuna girmek için lumcraft.com.tr ile giriş yap';
  $('btnSiteAuth').textContent = siteName ? 'Çıkış' : 'Giriş Yap';
  $('btnSiteAuth').className = siteName ? 'btn ghost sm' : 'btn primary sm';

  if (mcName) {
    $('msUserVal').textContent = `${mcName} ✓`;
    $('btnMsAuth').textContent = 'Kes';
    $('btnMsAuth').disabled = false;
  } else if (d.msConfigured) {
    $('msUserVal').textContent = 'İsteğe bağlı';
    $('btnMsAuth').textContent = 'Bağla';
    $('btnMsAuth').disabled = false;
  } else {
    $('msUserVal').textContent = siteName ? `${siteName} (Site)` : 'İsteğe bağlı';
    $('btnMsAuth').textContent = 'Gerekmiyor';
    $('btnMsAuth').disabled = true;
  }

  $('premiumWarnBar').hidden = Boolean(mcName);

  const displayName = mcName || siteName;
  if ($('heroNameTag')) $('heroNameTag').textContent = displayName || 'LumSMP';
  if (displayName) {
    $('sideAvatar').src = `https://mc-heads.net/avatar/${encodeURIComponent(displayName)}/64`;
    $('sideAvatar').hidden = false;
    $('sideAvatarFallback').hidden = true;
    $('heroSkinImg').src = `https://mc-heads.net/body/${encodeURIComponent(displayName)}/200`;
    $('heroSkinImg').hidden = false;
    $('heroSkinFallback').hidden = true;
  } else {
    $('sideAvatar').hidden = true;
    $('sideAvatarFallback').hidden = false;
    $('heroSkinImg').hidden = true;
    $('heroSkinFallback').hidden = false;
  }

  const s = d.settings;
  $('setupSummary').textContent = `${s.mods.length} Mod · ${(s.ramMb / 1024).toFixed(1)} GB RAM`;
  if ($('qstatModsVal')) $('qstatModsVal').textContent = `${s.mods.length} Mod`;
  if ($('qstatRamVal')) $('qstatRamVal').textContent = `${(s.ramMb / 1024).toFixed(1)} GB`;
  $('setRamAuto').checked = s.ramAuto;
  $('setRamRange').max = String(d.maxRamMb);
  $('setRamRange').value = String(s.ramMb);
  $('ramLabel').textContent = `${(s.ramMb / 1024).toFixed(1)} GB (${s.ramMb} MB)`;
  $('ramRecMark').textContent = `Önerilen: ${(d.recommendedRamMb / 1024).toFixed(1)} GB`;
  $('ramMaxMark').textContent = `${Math.round(d.maxRamMb / 1024)} GB`;
  $('ramManualRow').style.opacity = s.ramAuto ? '0.42' : '1';
  $('setRamRange').disabled = s.ramAuto;
  $('setPerfMode').value = s.perfMode;
  document.querySelectorAll('#gcCards .gc-opt').forEach((b) => {
    b.classList.toggle('active', b.dataset.gc === s.perfMode);
  });
  $('setDiscordRpc').checked = s.discordRpc !== false;
  $('setMinLaunch').checked = s.minimizeOnLaunch;

  document.querySelectorAll('#profilePills .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.profile === s.profile);
  });

  $('btnPlay').disabled = d.playing || !siteName;
  $('btnPlay').textContent = d.playing ? 'OYUN AÇIK' : (siteName ? 'OYNA' : 'GİRİŞ YAP');

  renderMods();
}

function renderMods() {
  const cats = Object.keys(CAT_LABELS);
  $('modCats').innerHTML = cats
    .map((c) => `<button class="cat-btn ${state.modCat === c ? 'active' : ''}" data-cat="${c}">${CAT_LABELS[c]}</button>`)
    .join('');
  $('modCats').querySelectorAll('.cat-btn').forEach((b) => {
    b.onclick = () => { state.modCat = b.dataset.cat; renderMods(); };
  });

  const selected = new Set(state.data?.settings?.mods || []);
  const q = state.modQuery.trim().toLowerCase();
  const list = state.catalog.filter((m) => {
    if (state.modCat !== 'all' && m.category !== state.modCat) return false;
    if (q && !m.name.toLowerCase().includes(q) && !m.desc.toLowerCase().includes(q)) return false;
    return true;
  });

  $('modGrid').innerHTML = list.map((m) => `
    <div class="mod-card">
      <div>
        <div class="mod-title">${escapeHtml(m.name)}</div>
        <div class="mod-desc">${escapeHtml(m.desc)}</div>
      </div>
      <label class="switch">
        <input type="checkbox" data-slug="${escapeHtml(m.slug)}" ${selected.has(m.slug) ? 'checked' : ''} />
        <span></span>
      </label>
    </div>
  `).join('');

  $('modGrid').querySelectorAll('input[data-slug]').forEach((inp) => {
    inp.onchange = async () => {
      const slug = inp.dataset.slug;
      const cur = new Set(state.data.settings.mods);
      if (inp.checked) {
        cur.add(slug);
        const modDef = state.catalog.find((x) => x.slug === slug);
        (modDef?.conflicts || []).forEach((c) => cur.delete(c));
      } else {
        cur.delete(slug);
      }
      await updateSettings({ mods: [...cur] });
    };
  });
}

async function renderShaders() {
  $('shaderStore').innerHTML = state.shaderCatalog.map((s) => `
    <div class="mod-card">
      <div>
        <div class="mod-title">${escapeHtml(s.name)} <span class="ver-tag">${escapeHtml(s.tier)}</span></div>
        <div class="mod-desc">${escapeHtml(s.desc)}</div>
      </div>
      <button class="btn primary sm" data-install-shader="${escapeHtml(s.slug)}">İndir</button>
    </div>
  `).join('');

  $('shaderStore').querySelectorAll('[data-install-shader]').forEach((btn) => {
    btn.onclick = async () => {
      const slug = btn.dataset.installShader;
      btn.disabled = true;
      btn.textContent = 'İniyor…';
      const notice = $('shaderNotice');
      try {
        const fname = await invoke('install_shader', { slug });
        notice.textContent = `✓ ${fname} indirildi! (Iris Shaders ile oyunda aktif edebilirsin)`;
        notice.hidden = false;
        await refreshInstalledShaders();
      } catch (err) {
        notice.textContent = `Hata: ${err}`;
        notice.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = 'İndir';
      }
    };
  });
  await refreshInstalledShaders();
}

async function refreshInstalledShaders() {
  const list = await invoke('list_shaders');
  $('shaderList').innerHTML = list.length
    ? list.map((f) => `<div class="file-row"><span>${escapeHtml(f.name)} (${f.sizeKb} KB)</span><button class="btn ghost sm" data-del-shader="${escapeHtml(f.name)}">Sil</button></div>`).join('')
    : '<div class="muted">Henüz yüklü shader yok.</div>';
  $('shaderList').querySelectorAll('[data-del-shader]').forEach((b) => {
    b.onclick = async () => {
      await invoke('delete_media', { sub: 'shaderpacks', name: b.dataset.delShader });
      await refreshInstalledShaders();
    };
  });
}

async function renderPacks() {
  $('packStore').innerHTML = state.packCatalog.map((s) => `
    <div class="mod-card">
      <div>
        <div class="mod-title">${escapeHtml(s.name)} <span class="ver-tag">${escapeHtml(s.tier)}</span></div>
        <div class="mod-desc">${escapeHtml(s.desc)}</div>
      </div>
      <button class="btn primary sm" data-install-pack="${escapeHtml(s.slug)}">İndir</button>
    </div>
  `).join('');

  $('packStore').querySelectorAll('[data-install-pack]').forEach((btn) => {
    btn.onclick = async () => {
      const slug = btn.dataset.installPack;
      btn.disabled = true;
      btn.textContent = 'İniyor…';
      const notice = $('packNotice');
      try {
        const fname = await invoke('install_resourcepack', { slug });
        notice.textContent = `✓ ${fname} indirildi! Oyunda Kaynak Paketleri menüsünden aktif edebilirsin.`;
        notice.hidden = false;
        await refreshInstalledPacks();
      } catch (err) {
        notice.textContent = `Hata: ${err}`;
        notice.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = 'İndir';
      }
    };
  });
  await refreshInstalledPacks();
}

async function refreshInstalledPacks() {
  const list = await invoke('list_resourcepacks');
  $('packList').innerHTML = list.length
    ? list.map((f) => `<div class="file-row"><span>${escapeHtml(f.name)} (${f.sizeKb} KB)</span><button class="btn ghost sm" data-del-pack="${escapeHtml(f.name)}">Sil</button></div>`).join('')
    : '<div class="muted">Henüz yüklü kaynak paketi yok.</div>';
  $('packList').querySelectorAll('[data-del-pack]').forEach((b) => {
    b.onclick = async () => {
      await invoke('delete_media', { sub: 'resourcepacks', name: b.dataset.delPack });
      await refreshInstalledPacks();
    };
  });
}

function renderAccountsModal() {
  const active = state.data?.siteUser?.minecraft_username || state.data?.siteUser?.username || '';
  const list = state.data?.savedAccounts || [];
  $('accountsList').innerHTML = list.length
    ? list.map((u) => {
        const isAct = active && u.toLowerCase() === active.toLowerCase();
        return `<div class="file-row">
          <span><strong>${escapeHtml(u)}</strong> ${isAct ? '<span class="green-chip">Aktif</span>' : ''}</span>
          <div class="row-gap">
            ${isAct ? '' : `<button class="btn primary sm" data-switch-acc="${escapeHtml(u)}">Geç</button>`}
            <button class="btn ghost sm" data-rem-acc="${escapeHtml(u)}">Sil</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="muted">Kayıtlı hesap yok. Aşağıdan yeni hesap ekleyebilirsin.</div>';

  $('accountsList').querySelectorAll('[data-switch-acc]').forEach((b) => {
    b.onclick = async () => {
      await invoke('switch_account', { username: b.dataset.switchAcc });
      $('accountsModal').hidden = true;
      state.data = await invoke('bootstrap');
      render();
    };
  });
  $('accountsList').querySelectorAll('[data-rem-acc]').forEach((b) => {
    b.onclick = async () => {
      await invoke('remove_saved_account', { username: b.dataset.remAcc });
      state.data = await invoke('bootstrap');
      render();
      renderAccountsModal();
    };
  });
}

async function refreshLogs() {
  state.rawLogs = await invoke('read_game_log');
  renderLogs();
}

function renderLogs() {
  const txt = state.rawLogs || '';
  if (!state.logErrorsOnly) {
    $('logBox').textContent = txt;
  } else {
    const filtered = txt.split(/\r?\n/).filter((l) => /error|exception|fatal|crash|warn|caused by/i.test(l)).join('\n');
    $('logBox').textContent = filtered || 'Log dosyasında hata veya uyarı bulunamadı ✓';
  }
  $('logBox').scrollTop = $('logBox').scrollHeight;
}

async function updateSettings(patch) {
  if (!state.data?.settings) return;
  try {
    const next = { ...state.data.settings, ...patch };
    state.data.settings = await invoke('save_settings', { next });
    render();
  } catch (err) {
    showError(`Ayarlar kaydedilemedi: ${err}`);
  }
}

async function refreshStatus() {
  try {
    const st = await invoke('get_server_status');
    const online = typeof st?.players === 'number' ? st.players : (st?.players?.online ?? 0);
    const max = typeof st?.max === 'number' ? st.max : (st?.players?.max ?? 100);
    $('serverStatusText').textContent = st?.online === false
      ? 'Sunucu bakımda'
      : `${online} / ${max} Çevrimiçi`;
  } catch {
    $('serverStatusText').textContent = 'Bağlantı bekleniyor';
  }
}

async function loadStoreProducts() {
  try {
    const res = await invoke('get_store_products');
    state.products = Array.isArray(res?.products) ? res.products : [];
  } catch {
    state.products = [];
  }
  if ($('tab-store').classList.contains('active')) renderStore();
}

async function init() {
  applyTheme(localStorage.getItem('lumsmp_theme') || 'gold');
  document.querySelectorAll('#themePicker .theme-swatch').forEach((b) => {
    b.onclick = () => { applyTheme(b.dataset.theme); showToast('Tema güncellendi ✓'); };
  });

  $('btnMin').onclick = () => appWindow.minimize();
  $('btnClose').onclick = () => appWindow.close();

  if ($('btnCopyIp')) {
    $('btnCopyIp').onclick = async () => {
      await navigator.clipboard.writeText('lumcraft.com.tr');
      $('ipCopyHint').textContent = 'Kopyalandı ✓';
      showToast('lumcraft.com.tr panoya kopyalandı!');
      setTimeout(() => { $('ipCopyHint').textContent = 'Kopyala'; }, 1600);
    };
  }
  if ($('qstatMods')) $('qstatMods').onclick = () => switchTab('mods');
  if ($('qstatRam')) $('qstatRam').onclick = () => switchTab('settings');
  if ($('qstatStore')) $('qstatStore').onclick = () => switchTab('store');
  if ($('btnLogErrorsOnly')) {
    $('btnLogErrorsOnly').onclick = () => {
      state.logErrorsOnly = !state.logErrorsOnly;
      $('btnLogErrorsOnly').className = state.logErrorsOnly ? 'btn primary' : 'btn ghost';
      renderLogs();
    };
  }

  document.querySelectorAll('.rail-btn[data-tab]').forEach((btn) => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  $('btnOpenSite').onclick = () => invoke('open_external_url', { url: 'https://lumcraft.com.tr' });
  $('btnOpenWebStore').onclick = () => invoke('open_external_url', { url: 'https://lumcraft.com.tr/marketplace.html' });
  $('btnRefreshStore').onclick = loadStoreProducts;

  $('btnRefreshNews').onclick = async () => {
    const btn = $('btnRefreshNews');
    btn.disabled = true;
    try {
      const fresh = await invoke('refresh_news');
      if (state.data) state.data.announcement = fresh;
      renderNews(fresh);
    } finally {
      btn.disabled = false;
    }
  };

  document.querySelectorAll('#profilePills .seg-btn').forEach((btn) => {
    btn.onclick = () => updateSettings({ profile: btn.dataset.profile });
  });

  $('presetFps').onclick = () => updateSettings({ mods: PRESETS.fps, profile: 'ultra_fps' });
  $('presetVanilla').onclick = () => updateSettings({ mods: PRESETS.vanilla, profile: 'balanced' });
  $('presetShader').onclick = () => updateSettings({ mods: PRESETS.shader, profile: 'shader' });
  $('presetReset').onclick = () => updateSettings({ mods: PRESETS.default, profile: 'balanced' });

  $('modSearch').oninput = (e) => { state.modQuery = e.target.value; renderMods(); };
  $('setRamAuto').onchange = (e) => updateSettings({ ramAuto: e.target.checked });
  $('setRamRange').oninput = (e) => {
    const v = Number(e.target.value);
    $('ramLabel').textContent = `${(v / 1024).toFixed(1)} GB (${v} MB)`;
  };
  $('setRamRange').onchange = (e) => updateSettings({ ramMb: Number(e.target.value) });
  $('setPerfMode').onchange = (e) => updateSettings({ perfMode: e.target.value });
  document.querySelectorAll('#gcCards .gc-opt').forEach((b) => {
    b.onclick = () => updateSettings({ perfMode: b.dataset.gc });
  });
  $('setDiscordRpc').onchange = (e) => updateSettings({ discordRpc: e.target.checked });
  $('setMinLaunch').onchange = (e) => updateSettings({ minimizeOnLaunch: e.target.checked });

  $('btnSetOpenGame').onclick = () => invoke('open_folder', { sub: '' });
  $('btnSetOpenMods').onclick = () => invoke('open_folder', { sub: 'mods' });
  $('btnSetOpenBackups').onclick = () => invoke('open_folder', { sub: 'lumsmp-backups' });
  $('btnOpenShaders').onclick = () => invoke('open_folder', { sub: 'shaderpacks' });
  $('btnOpenPacks').onclick = () => invoke('open_folder', { sub: 'resourcepacks' });

  const openAccounts = () => { renderAccountsModal(); $('accountsModal').hidden = false; };
  $('btnAccounts').onclick = openAccounts;
  $('btnSwitchAccount').onclick = openAccounts;
  $('btnAccountsClose').onclick = () => { $('accountsModal').hidden = true; };
  $('accountsModal').addEventListener('click', (e) => { if (e.target === $('accountsModal')) $('accountsModal').hidden = true; });
  $('btnAddAccount').onclick = () => {
    $('accountsModal').hidden = true;
    $('loginErr').hidden = true;
    $('loginModal').hidden = false;
    $('loginUser').focus();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('accountsModal').hidden = true; $('loginModal').hidden = true; }
  });

  $('btnBackupProfile').onclick = async () => {
    const btn = $('btnBackupProfile');
    btn.disabled = true;
    btn.textContent = 'Yedekleniyor…';
    try {
      const res = await invoke('backup_profile');
      $('updateStatusText').textContent = `✓ Yerel yedek alındı: ${res.folder} (${res.count} dosya).`;
    } catch (e) {
      $('updateStatusText').textContent = `Yedekleme hatası: ${e}`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Yerel Yedek Al';
    }
  };

  $('btnCloudSave').onclick = async () => {
    const btn = $('btnCloudSave');
    btn.disabled = true;
    btn.textContent = 'Kaydediliyor…';
    try {
      await invoke('cloud_backup_settings');
      $('updateStatusText').textContent = '✓ Mod, RAM ve oyun içi HUD ayarların buluta kaydedildi!';
    } catch (e) {
      $('updateStatusText').textContent = `Bulut hatası: ${e}`;
    } finally {
      btn.disabled = false;
      btn.textContent = '☁ Buluta Kaydet';
    }
  };

  $('btnCloudRestore').onclick = async () => {
    const btn = $('btnCloudRestore');
    btn.disabled = true;
    btn.textContent = 'Yükleniyor…';
    try {
      const res = await invoke('cloud_restore_settings');
      if (res && res.settings) state.data.settings = res.settings;
      render();
      $('updateStatusText').textContent = '✓ Buluttaki mod ve HUD ayarların başarıyla geri yüklendi!';
    } catch (e) {
      $('updateStatusText').textContent = `Bulut hatası: ${e}`;
    } finally {
      btn.disabled = false;
      btn.textContent = '☁ Buluttan Yükle';
    }
  };

  const stage = $('skinStage');
  const skinImg = $('heroSkinImg');
  if (stage && skinImg) {
    stage.addEventListener('mousemove', (e) => {
      const r = stage.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width - 0.5) * 28;
      const ny = ((e.clientY - r.top) / r.height - 0.5) * -14;
      skinImg.style.transform = `rotateY(${nx}deg) rotateX(${ny}deg) scale(1.04)`;
    });
    stage.addEventListener('mouseleave', () => {
      skinImg.style.transform = 'rotateY(0deg) rotateX(0deg) scale(1)';
    });
  }

  $('btnCrashRecover').onclick = async () => {
    if (!state.suspectMod || !state.data?.settings) return;
    const modToDisable = state.suspectMod;
    state.suspectMod = null;
    $('crashRecoveryBar').hidden = true;
    showError('');
    const nextMods = (state.data.settings.mods || []).filter((m) => m !== modToDisable);
    await updateSettings({ mods: nextMods });
    $('btnPlay').click();
  };

  $('btnRefreshLogs').onclick = refreshLogs;
  $('btnCopyLogs').onclick = async () => {
    await navigator.clipboard.writeText($('logBox').textContent);
    $('btnCopyLogs').textContent = 'Kopyalandı ✓';
    setTimeout(() => { $('btnCopyLogs').textContent = 'Logu Kopyala'; }, 1500);
  };

  $('btnSiteAuth').onclick = async () => {
    if (state.data?.siteUser) {
      await invoke('site_logout');
      state.data = await invoke('bootstrap');
      render();
    } else {
      $('loginErr').hidden = true;
      $('loginModal').hidden = false;
      $('loginUser').focus();
    }
  };
  $('btnLoginCancel').onclick = () => { $('loginModal').hidden = true; };
  $('loginModal').addEventListener('click', (e) => { if (e.target === $('loginModal')) $('loginModal').hidden = true; });
  const submitLogin = async () => {
    const btn = $('btnLoginSubmit');
    if (btn.disabled) return;
    $('loginErr').hidden = true;
    btn.disabled = true;
    btn.textContent = 'Giriş yapılıyor…';
    try {
      await invoke('site_login', { username: $('loginUser').value.trim(), password: $('loginPass').value });
      $('loginModal').hidden = true;
      $('loginPass').value = '';
      state.data = await invoke('bootstrap');
      render();
    } catch (err) {
      $('loginErr').textContent = String(err);
      $('loginErr').hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Giriş Yap';
    }
  };
  $('btnLoginSubmit').onclick = submitLogin;
  $('loginUser').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginPass').focus(); });
  $('loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(); });

  $('btnMsAuth').onclick = async () => {
    showError('');
    try {
      if (state.data?.mcProfile) await invoke('ms_logout');
      else await invoke('ms_login');
      state.data = await invoke('bootstrap');
      render();
    } catch (err) {
      showError(String(err));
    }
  };

  $('btnPlay').onclick = async () => {
    showError('');
    $('btnPlay').disabled = true;
    $('btnPlay').textContent = 'HAZIRLANIYOR…';
    $('progressLabel').textContent = 'Oyun hazırlanıyor…';
    $('progressFill').style.width = '5%';
    try {
      await invoke('launch_game');
      state.data.playing = true;
      $('progressLabel').textContent = 'Minecraft başlatıldı! İyi oyunlar.';
      $('progressFill').style.width = '100%';
      render();
    } catch (err) {
      showError(String(err));
      $('progressLabel').textContent = 'Başlatma başarısız.';
      $('progressFill').style.width = '0%';
      state.data.playing = false;
      render();
    }
  };

  await listen('launch-progress', ({ payload }) => {
    const pct = payload.total > 0 ? Math.min(100, Math.round((payload.done / payload.total) * 100)) : 0;
    const label = STAGE_LABELS[payload.stage] || payload.stage;
    $('progressLabel').textContent = `${label} (${payload.done}/${payload.total})`;
    $('progressFill').style.width = `${pct}%`;
  });

  await listen('game-exit', ({ payload }) => {
    state.data.playing = false;
    $('progressFill').style.width = '0%';
    $('progressLabel').textContent = payload.code === 0 ? 'Oyun kapatıldı.' : `Oyun hata ile kapandı (kod ${payload.code}).`;
    if (payload.crashHint) showError(payload.crashHint);
    if (payload.suspectMod) {
      state.suspectMod = payload.suspectMod;
      $('crashRecoveryText').textContent = `Şüpheli mod: ${payload.suspectMod}`;
      $('crashRecoveryBar').hidden = false;
    } else {
      state.suspectMod = null;
      $('crashRecoveryBar').hidden = true;
    }
    render();
  });

  await listen('update-state', ({ payload }) => {
    const bar = $('updateBar');
    const st = $('updateStatusText');
    if (payload.state === 'downloading' || payload.state === 'installing') {
      bar.hidden = false;
      bar.textContent = `⬆ ${payload.message || 'Güncelleniyor…'}`;
      if (st) st.textContent = payload.message || 'Güncelleniyor…';
    } else if (payload.message) {
      if (st) st.textContent = payload.message;
      bar.hidden = true;
    } else {
      bar.hidden = true;
    }
  });

  $('btnCheckUpdate').onclick = async () => {
    const btn = $('btnCheckUpdate');
    btn.disabled = true;
    btn.textContent = 'Kontrol ediliyor…';
    try {
      const res = await invoke('check_for_updates');
      if (res && res.message) $('updateStatusText').textContent = res.message;
    } catch (e) {
      $('updateStatusText').textContent = String(e);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Güncelleme Kontrol Et';
    }
  };

  state.catalog = await invoke('get_catalog');
  state.shaderCatalog = await invoke('get_shader_catalog');
  state.packCatalog = await invoke('get_resourcepack_catalog');
  state.data = await invoke('bootstrap');
  render();
  refreshStatus();
  loadStoreProducts();
  setInterval(refreshStatus, 30000);
}

init();
