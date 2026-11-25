const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const appWindow = window.__TAURI__.window.getCurrentWindow();

const state = {
  data: null,
  catalog: [],
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

  const siteName = d.siteUser?.minecraft_username || d.siteUser?.username || '';
  const mcName = d.mcProfile?.name || '';

  $('siteUserVal').textContent = siteName || 'Bağlı değil';
  $('btnSiteAuth').textContent = siteName ? 'Çıkış Yap' : 'Giriş Yap';

  $('msUserVal').textContent = mcName || 'Bağlı değil';
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

async function refreshMedia() {
  const shaders = await invoke('list_shaders');
  const shots = await invoke('list_screenshots');
  $('shaderList').innerHTML = shaders.length
    ? shaders.map((f) => `<div class="file-row"><span>${f.name}</span><span class="muted">${f.sizeKb} KB</span></div>`).join('')
    : '<div class="muted">Henüz shader paketi yok. Klasöre .zip ekleyebilirsin.</div>';
  $('shotList').innerHTML = shots.length
    ? shots.slice(0, 30).map((f) => `<div class="file-row"><span>${f.name}</span><span class="muted">${f.sizeKb} KB</span></div>`).join('')
    : '<div class="muted">Henüz ekran görüntüsü yok (oyunda F2 ile çek).</div>';
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
      if (btn.dataset.tab === 'media') refreshMedia();
    };
  });

  document.querySelectorAll('#profilePills .pill').forEach((btn) => {
    btn.onclick = () => updateSettings({ profile: btn.dataset.profile });
  });

  $('modSearch').oninput = (e) => { state.modQuery = e.target.value; renderMods(); };
  $('setRamAuto').onchange = (e) => updateSettings({ ramAuto: e.target.checked });
  $('setRamRange').oninput = (e) => { $('ramLabel').textContent = `${e.target.value} MB`; };
  $('setRamRange').onchange = (e) => updateSettings({ ramMb: Number(e.target.value) });
  $('setPerfMode').onchange = (e) => updateSettings({ perfMode: e.target.value });
  $('setMinLaunch').onchange = (e) => updateSettings({ minimizeOnLaunch: e.target.checked });

  $('btnOpenGameDir').onclick = () => invoke('open_folder', { sub: '' });
  $('btnOpenShaders').onclick = () => invoke('open_folder', { sub: 'shaderpacks' });
  $('btnOpenShots').onclick = () => invoke('open_folder', { sub: 'screenshots' });

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
      if (state.data?.mcProfile) {
        await invoke('ms_logout');
      } else {
        await invoke('ms_login');
      }
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
  state.data = await invoke('bootstrap');
  render();
  refreshStatus();
  setInterval(refreshStatus, 30000);
}

init();
