const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const appWindow = window.__TAURI__.window.getCurrentWindow();

const state = {
  data: null,
  catalog: [],
  shaderCatalog: [],
  modCat: 'all',
  modQuery: '',
};

const CAT_LABELS = {
  all: 'Tümü',
  performance: 'Performans',
  visual: 'Görsel',
  animation: 'Animasyon',
  info: 'Harita & Bilgi',
  utility: 'Kolaylık',
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

function showError(msg) {
  const el = $('homeError');
  if (!msg) { el.hidden = true; return; }
  el.textContent = msg;
  el.hidden = false;
}

function render() {
  const d = state.data;
  if (!d) return;
  $('verBadge').textContent = `v${d.version}`;

  if (d.announcement) {
    $('announcementBar').textContent = `✦ Duyuru: ${d.announcement}`;
    $('announcementBar').hidden = false;
  } else {
    $('announcementBar').hidden = true;
  }

  const siteName = d.siteUser?.minecraft_username || d.siteUser?.username || '';
  const mcName = d.mcProfile?.name || '';
  const lumin = d.siteUser?.lumin_balance ?? d.siteUser?.lumin ?? null;
  const rank = d.siteUser?.rank || d.siteUser?.vip || '';

  $('siteUserVal').textContent = siteName || 'Bağlı değil';
  $('siteStatsVal').textContent = siteName
    ? `${lumin != null ? `${lumin} Lumin` : 'Cüzdan bağlı'}${rank ? ` · ${rank}` : ''}`
    : 'Lumin & VIP bilgisi için giriş yap';
  $('btnSiteAuth').textContent = siteName ? 'Çıkış Yap' : 'Giriş Yap';

  $('msUserVal').textContent = mcName || 'Bağlı değil';
  $('msSubVal').textContent = mcName ? 'Microsoft oturumu aktif ✓' : 'Orijinal Minecraft hesabı gerekir';
  $('btnMsAuth').textContent = mcName ? 'Bağlantıyı Kes' : 'Microsoft Bağla';

  $('sideName').textContent = mcName || siteName || 'Giriş Yapılmadı';
  $('sideSub').textContent = siteName ? `lumcraft.com.tr · ${siteName}` : 'lumcraft.com.tr';
  if (mcName) {
    $('sideAvatar').src = `https://mc-heads.net/avatar/${encodeURIComponent(mcName)}/64`;
    $('sideAvatar').hidden = false;
  } else {
    $('sideAvatar').hidden = true;
  }

  const s = d.settings;
  $('setupSummary').textContent = `${s.mods.length} Mod · ${(s.ramMb / 1024).toFixed(1)} GB RAM`;
  $('setRamAuto').checked = s.ramAuto;
  $('setRamRange').max = String(d.maxRamMb);
  $('setRamRange').value = String(s.ramMb);
  $('ramLabel').textContent = `${s.ramMb} MB`;
  $('ramManualRow').style.opacity = s.ramAuto ? '0.45' : '1';
  $('setRamRange').disabled = s.ramAuto;
  $('setPerfMode').value = s.perfMode;
  $('setDiscordRpc').checked = s.discordRpc !== false;
  $('setMinLaunch').checked = s.minimizeOnLaunch;

  document.querySelectorAll('#profilePills .pill').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.profile === s.profile);
  });

  $('btnPlay').disabled = d.playing || !siteName || !mcName;
  $('btnPlay').textContent = d.playing ? 'OYUN AÇIK' : 'OYNA';

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
        <div class="mod-title">${m.name}</div>
        <div class="mod-desc">${m.desc}</div>
      </div>
      <label class="switch">
        <input type="checkbox" data-slug="${m.slug}" ${selected.has(m.slug) ? 'checked' : ''} />
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
        <div class="mod-title">${s.name} <span class="badge-engine">${s.tier}</span></div>
        <div class="mod-desc">${s.desc}</div>
      </div>
      <button class="btn primary" data-install-shader="${s.slug}">İndir</button>
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
    ? list.map((f) => `<div class="file-row"><span>${f.name} (${f.sizeKb} KB)</span><button class="btn ghost" data-del-shader="${f.name}">Sil</button></div>`).join('')
    : '<div class="muted">Henüz yüklü shader yok. Yukarıdan tek tıkla indirebilirsin.</div>';
  $('shaderList').querySelectorAll('[data-del-shader]').forEach((b) => {
    b.onclick = async () => {
      await invoke('delete_media', { sub: 'shaderpacks', name: b.dataset.delShader });
      await refreshInstalledShaders();
    };
  });
}

async function refreshGallery() {
  const shots = await invoke('list_screenshots');
  const grid = $('shotGrid');
  if (!shots.length) {
    grid.innerHTML = '<div class="muted">Henüz ekran görüntüsü yok (oyunda F2 ile çek).</div>';
    return;
  }
  grid.innerHTML = shots.slice(0, 18).map((f) => `
    <div class="shot-card">
      <img class="shot-thumb" data-shot-img="${f.name}" alt="${f.name}" />
      <div class="shot-foot">
        <span>${f.name.slice(0, 18)}</span>
        <button class="btn ghost" data-del-shot="${f.name}">Sil</button>
      </div>
    </div>
  `).join('');

  for (const f of shots.slice(0, 18)) {
    const img = grid.querySelector(`[data-shot-img="${CSS.escape(f.name)}"]`);
    if (!img) continue;
    invoke('read_screenshot_data', { name: f.name }).then((src) => {
      img.src = src;
      img.onclick = () => {
        $('shotModalTitle').textContent = f.name;
        $('shotModalImg').src = src;
        $('shotModal').hidden = false;
      };
    }).catch(() => {});
  }
  grid.querySelectorAll('[data-del-shot]').forEach((b) => {
    b.onclick = async () => {
      await invoke('delete_media', { sub: 'screenshots', name: b.dataset.delShot });
      await refreshGallery();
    };
  });
}

async function refreshLogs() {
  $('logBox').textContent = await invoke('read_game_log');
  $('logBox').scrollTop = $('logBox').scrollHeight;
}

async function updateSettings(patch) {
  const next = { ...state.data.settings, ...patch };
  state.data.settings = await invoke('save_settings', { next });
  render();
}

async function refreshStatus() {
  try {
    const st = await invoke('get_server_status');
    const online = st?.players?.online ?? st?.online ?? 0;
    const max = st?.players?.max ?? st?.max ?? 100;
    $('serverStatusText').textContent = st?.online === false
      ? 'Sunucu bakımda'
      : `LumSMP Çevrimiçi · ${online} / ${max} Oyuncu`;
  } catch {
    $('serverStatusText').textContent = 'LumSMP · Bağlantı bekleniyor';
  }
}

async function init() {
  $('btnMin').onclick = () => appWindow.minimize();
  $('btnClose').onclick = () => appWindow.close();

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'shaders') renderShaders();
      else if (btn.dataset.tab === 'gallery') refreshGallery();
      else if (btn.dataset.tab === 'logs') refreshLogs();
    };
  });

  document.querySelectorAll('#profilePills .pill').forEach((btn) => {
    btn.onclick = () => updateSettings({ profile: btn.dataset.profile });
  });

  $('presetFps').onclick = () => updateSettings({ mods: PRESETS.fps, profile: 'ultra_fps' });
  $('presetVanilla').onclick = () => updateSettings({ mods: PRESETS.vanilla, profile: 'balanced' });
  $('presetShader').onclick = () => updateSettings({ mods: PRESETS.shader, profile: 'shader' });
  $('presetReset').onclick = () => updateSettings({ mods: PRESETS.default, profile: 'balanced' });

  $('modSearch').oninput = (e) => { state.modQuery = e.target.value; renderMods(); };
  $('setRamAuto').onchange = (e) => updateSettings({ ramAuto: e.target.checked });
  $('setRamRange').oninput = (e) => { $('ramLabel').textContent = `${e.target.value} MB`; };
  $('setRamRange').onchange = (e) => updateSettings({ ramMb: Number(e.target.value) });
  $('setPerfMode').onchange = (e) => updateSettings({ perfMode: e.target.value });
  $('setDiscordRpc').onchange = (e) => updateSettings({ discordRpc: e.target.checked });
  $('setMinLaunch').onchange = (e) => updateSettings({ minimizeOnLaunch: e.target.checked });

  $('btnOpenGameDir').onclick = () => invoke('open_folder', { sub: '' });
  $('btnOpenShaders').onclick = () => invoke('open_folder', { sub: 'shaderpacks' });
  $('btnOpenShots').onclick = () => invoke('open_folder', { sub: 'screenshots' });
  $('btnShotClose').onclick = () => { $('shotModal').hidden = true; };
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
  $('btnLoginSubmit').onclick = async () => {
    $('loginErr').hidden = true;
    try {
      await invoke('site_login', { username: $('loginUser').value, password: $('loginPass').value });
      $('loginModal').hidden = true;
      $('loginPass').value = '';
      state.data = await invoke('bootstrap');
      render();
    } catch (err) {
      $('loginErr').textContent = String(err);
      $('loginErr').hidden = false;
    }
  };

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
    render();
  });

  state.catalog = await invoke('get_catalog');
  state.shaderCatalog = await invoke('get_shader_catalog');
  state.data = await invoke('bootstrap');
  render();
  refreshStatus();
  setInterval(refreshStatus, 30000);
}

init();
