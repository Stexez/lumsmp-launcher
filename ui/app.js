const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const appWindow = window.__TAURI__.window.getCurrentWindow();

const state = {
  data: null,
  catalog: [],
  shaderCatalog: [],
  packCatalog: [],
  suspectMod: null,
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
  if ($('settingsVerBadge')) $('settingsVerBadge').textContent = `v${d.version}`;

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
    ? `${lumin != null ? `${lumin} Lumin` : 'Hesap aktif ✓'}${rank ? ` · ${rank}` : ''}`
    : 'Oyuna girmek için lumcraft.com.tr hesabınla giriş yap';
  $('btnSiteAuth').textContent = siteName ? 'Çıkış Yap' : 'Giriş Yap';
  $('btnSiteAuth').className = siteName ? 'btn ghost' : 'btn primary';
  if ($('siteBadge')) {
    $('siteBadge').textContent = siteName ? 'Bağlı ✓' : 'Gerekli';
    $('siteBadge').className = siteName ? 'mini-badge green-badge' : 'mini-badge';
  }

  if (mcName) {
    $('msUserVal').textContent = mcName;
    $('msSubVal').textContent = 'Premium Microsoft oturumu ve skin aktif ✓';
    $('btnMsAuth').textContent = 'Bağlantıyı Kes';
    $('btnMsAuth').disabled = false;
    if ($('msBadge')) { $('msBadge').textContent = 'Premium ✓'; $('msBadge').className = 'mini-badge green-badge'; }
  } else if (d.msConfigured) {
    $('msUserVal').textContent = 'İsteğe bağlı';
    $('msSubVal').textContent = 'Premium skin için Microsoft hesabını bağlayabilirsin';
    $('btnMsAuth').textContent = 'Microsoft Bağla';
    $('btnMsAuth').disabled = false;
    if ($('msBadge')) { $('msBadge').textContent = 'İsteğe Bağlı'; $('msBadge').className = 'mini-badge muted-badge'; }
  } else {
    $('msUserVal').textContent = siteName ? `${siteName} (Site)` : 'İsteğe bağlı';
    $('msSubVal').textContent = 'Microsoft gerekmeden site hesabınla direkt oynayabilirsin';
    $('btnMsAuth').textContent = 'Gerekmiyor';
    $('btnMsAuth').disabled = true;
    if ($('msBadge')) { $('msBadge').textContent = 'Site Modu'; $('msBadge').className = 'mini-badge muted-badge'; }
  }

  const displayName = mcName || siteName;
  $('sideName').textContent = displayName || 'Giriş Yapılmadı';
  $('sideSub').textContent = siteName ? `lumcraft.com.tr · ${siteName}` : 'lumcraft.com.tr';
  if (displayName) {
    $('sideAvatar').src = `https://mc-heads.net/avatar/${encodeURIComponent(displayName)}/64`;
    $('sideAvatar').hidden = false;
    if ($('sideAvatarFallback')) $('sideAvatarFallback').hidden = true;
    if ($('heroSkinImg')) {
      $('heroSkinImg').src = `https://mc-heads.net/body/${encodeURIComponent(displayName)}/150`;
      $('heroSkinImg').hidden = false;
    }
    if ($('heroSkinFallback')) $('heroSkinFallback').hidden = true;
    if ($('heroSkinTag')) $('heroSkinTag').textContent = displayName;
  } else {
    $('sideAvatar').hidden = true;
    if ($('sideAvatarFallback')) $('sideAvatarFallback').hidden = false;
    if ($('heroSkinImg')) $('heroSkinImg').hidden = true;
    if ($('heroSkinFallback')) $('heroSkinFallback').hidden = false;
    if ($('heroSkinTag')) $('heroSkinTag').textContent = 'LumSMP';
  }

  const s = d.settings;
  $('setupSummary').textContent = `${s.mods.length} Mod · ${(s.ramMb / 1024).toFixed(1)} GB RAM`;
  $('setRamAuto').checked = s.ramAuto;
  $('setRamRange').max = String(d.maxRamMb);
  $('setRamRange').value = String(s.ramMb);
  $('ramLabel').textContent = `${(s.ramMb / 1024).toFixed(1)} GB (${s.ramMb} MB)`;
  if ($('ramRecMark')) $('ramRecMark').textContent = `Önerilen: ${(d.recommendedRamMb / 1024).toFixed(1)} GB`;
  if ($('ramMaxMark')) $('ramMaxMark').textContent = `${Math.round(d.maxRamMb / 1024)} GB`;
  $('ramManualRow').style.opacity = s.ramAuto ? '0.42' : '1';
  $('setRamRange').disabled = s.ramAuto;
  $('setPerfMode').value = s.perfMode;
  document.querySelectorAll('#gcCards .gc-option').forEach((b) => {
    b.classList.toggle('active', b.dataset.gc === s.perfMode);
  });
  $('setDiscordRpc').checked = s.discordRpc !== false;
  $('setMinLaunch').checked = s.minimizeOnLaunch;

  document.querySelectorAll('#profilePills .pill').forEach((btn) => {
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

async function renderPacks() {
  $('packStore').innerHTML = state.packCatalog.map((s) => `
    <div class="mod-card">
      <div>
        <div class="mod-title">${s.name} <span class="mini-badge">${s.tier}</span></div>
        <div class="mod-desc">${s.desc}</div>
      </div>
      <button class="btn primary" data-install-pack="${s.slug}">İndir</button>
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
    ? list.map((f) => `<div class="file-row"><span>${f.name} (${f.sizeKb} KB)</span><button class="btn ghost" data-del-pack="${f.name}">Sil</button></div>`).join('')
    : '<div class="muted">Henüz yüklü kaynak paketi yok. Yukarıdan tek tıkla indirebilirsin.</div>';
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
          <span><strong>${u}</strong> ${isAct ? '<span class="mini-badge green-badge">Aktif</span>' : ''}</span>
          <div class="row-gap">
            ${isAct ? '' : `<button class="btn primary" data-switch-acc="${u}">Geç</button>`}
            <button class="btn ghost" data-rem-acc="${u}">Sil</button>
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
  $('logBox').textContent = await invoke('read_game_log');
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
      else if (btn.dataset.tab === 'packs') renderPacks();
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
  $('setRamRange').oninput = (e) => {
    const v = Number(e.target.value);
    $('ramLabel').textContent = `${(v / 1024).toFixed(1)} GB (${v} MB)`;
  };
  $('setRamRange').onchange = (e) => updateSettings({ ramMb: Number(e.target.value) });
  $('setPerfMode').onchange = (e) => updateSettings({ perfMode: e.target.value });
  document.querySelectorAll('#gcCards .gc-option').forEach((b) => {
    b.onclick = () => updateSettings({ perfMode: b.dataset.gc });
  });
  $('setDiscordRpc').onchange = (e) => updateSettings({ discordRpc: e.target.checked });
  $('setMinLaunch').onchange = (e) => updateSettings({ minimizeOnLaunch: e.target.checked });

  $('btnOpenGameDir').onclick = () => invoke('open_folder', { sub: '' });
  if ($('btnSetOpenGame')) $('btnSetOpenGame').onclick = () => invoke('open_folder', { sub: '' });
  if ($('btnSetOpenMods')) $('btnSetOpenMods').onclick = () => invoke('open_folder', { sub: 'mods' });
  if ($('btnSetOpenBackups')) $('btnSetOpenBackups').onclick = () => invoke('open_folder', { sub: 'lumsmp-backups' });
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

  if ($('btnBackupProfile')) {
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
  }

  if ($('btnCloudSave')) {
    $('btnCloudSave').onclick = async () => {
      const btn = $('btnCloudSave');
      btn.disabled = true;
      btn.textContent = 'Kaydediliyor…';
      try {
        await invoke('cloud_backup_settings');
        $('updateStatusText').textContent = '✓ Mod, RAM ve oyun içi HUD ayarların lumcraft.com.tr bulutuna kaydedildi!';
      } catch (e) {
        $('updateStatusText').textContent = `Bulut hatası: ${e}`;
      } finally {
        btn.disabled = false;
        btn.textContent = '☁ Buluta Kaydet';
      }
    };
  }

  if ($('btnCloudRestore')) {
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
  }

  const stage = $('skinStage');
  const skinImg = $('heroSkinImg');
  if (stage && skinImg) {
    stage.addEventListener('mousemove', (e) => {
      const r = stage.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width - 0.5) * 26;
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
  setInterval(refreshStatus, 30000);
}

init();
