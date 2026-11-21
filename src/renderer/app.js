'use strict';
/* global lumsmp */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let state = null;
  let updateReady = false;
  let homeTimer = null;
  let playing = false;
  let page = 'home';

  // ------------------------------------------------------------- scene (gökyüzü, ay, arazi)
  function seeded(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
  function buildScene(el, seed) {
    const rand = seeded(seed);
    const stars = document.createElement('div');
    stars.className = 'scene__stars';
    for (let i = 0; i < 70; i++) {
      const star = document.createElement('i');
      star.style.left = `${Math.floor(rand() * 366) * 3}px`;
      star.style.top = `${Math.floor(rand() * 70) * 3}px`;
      star.style.animationDelay = `${(rand() * 3).toFixed(2)}s`;
      if (rand() > 0.9) star.className = 'big';
      stars.append(star);
    }
    const img = (cls, src) => { const i = document.createElement('img'); i.className = cls; i.src = src; i.alt = ''; return i; };
    const clouds = [0, 1].map((n) => {
      const cloud = img('scene__cloud', 'assets/px-cloud.svg');
      cloud.style.top = `${40 + n * 70}px`;
      cloud.style.animationDuration = `${110 + n * 40}s`;
      cloud.style.animationDelay = `${-n * 60}s`;
      return cloud;
    });
    const flies = document.createElement('div');
    flies.className = 'scene__flies';
    for (let i = 0; i < 10; i++) {
      const fly = document.createElement('i');
      fly.style.left = `${Math.floor(rand() * 1000)}px`;
      fly.style.bottom = `${20 + Math.floor(rand() * 90)}px`;
      fly.style.animationDelay = `${(rand() * 6).toFixed(2)}s`;
      flies.append(fly);
    }
    el.append(stars, img('scene__moon', 'assets/px-moon.svg'), ...clouds,
      img('scene__hills', 'assets/hills-far.svg'), img('scene__land', 'assets/landscape.svg'), flies);
  }
  $$('[data-scene]').forEach((el, i) => buildScene(el, 1337 + i * 7));

  // ------------------------------------------------------------- helpers
  function show(name) {
    $$('[data-screen]').forEach((screen) => { screen.hidden = screen.dataset.screen !== name; });
    document.body.dataset.view = name;
  }
  function setMsg(el, text, kind) {
    el.textContent = text || '';
    el.classList.toggle('is-error', kind === 'error');
  }
  let toastTimer;
  function toast(text) {
    const el = $('[data-toast]');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }
  function showError(title, text, tail) {
    $('[data-error-title]').textContent = title;
    $('[data-error-text]').textContent = text;
    const log = $('[data-error-log]');
    log.hidden = !tail || !tail.length;
    log.textContent = tail ? tail.join('\n') : '';
    $('[data-error]').hidden = false;
  }
  $('[data-close-error]').addEventListener('click', () => { $('[data-error]').hidden = true; });
  const gb = (mb) => `${(mb / 1024).toFixed(1).replace('.0', '')} GB`;

  // ------------------------------------------------------------- routing
  function route() {
    if (!updateReady || !state) { show('update'); return; }
    if (!state.site) { show('login'); stopHome(); return; }
    renderAccount();
    show('app');
    go(page);
    startHome();
  }

  function go(name) {
    page = name;
    $$('[data-page]').forEach((el) => { el.hidden = el.dataset.page !== name; });
    $$('.nav__item').forEach((el) => el.classList.toggle('is-active', el.dataset.nav === name));
    if (name === 'mods') loadMods();
    if (name === 'settings') renderSettings();
  }
  $$('[data-nav]').forEach((el) => el.addEventListener('click', () => go(el.dataset.nav)));

  async function refreshState() {
    state = await lumsmp.state();
    $$('[data-version]').forEach((el) => { el.textContent = `v${state.version}`; });
    playing = state.playing;
    route();
  }

  // ------------------------------------------------------------- update screen
  function applyUpdate(update) {
    const text = $('[data-update-text]');
    const bar = $('[data-update-bar]');
    if (update.state === 'checking') {
      text.textContent = 'Güncellemeler denetleniyor...';
      bar.classList.add('is-indeterminate');
    } else if (update.state === 'downloading') {
      text.textContent = `Yeni sürüm indiriliyor (v${update.version}) %${update.percent || 0}`;
      bar.classList.remove('is-indeterminate');
      bar.style.width = `calc(${update.percent || 0}% - 6px)`;
    } else if (update.state === 'installing') {
      text.textContent = `v${update.version} kuruluyor, launcher yeniden açılacak...`;
      bar.classList.remove('is-indeterminate');
      bar.style.width = 'calc(100% - 6px)';
    } else if (update.state === 'ready') {
      updateReady = true;
      if (update.warning) toast(update.warning);
    }
    if (update.state !== 'ready') updateReady = false;
    route();
  }

  // ------------------------------------------------------------- login / accounts
  $('[data-login-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('[data-login-submit]');
    const msg = $('[data-login-msg]');
    button.disabled = true;
    setMsg(msg, 'Giriş yapılıyor...');
    try {
      state = await lumsmp.siteLogin(form.elements.username.value, form.elements.password.value);
      form.reset();
      setMsg(msg, '');
      page = 'home';
      route();
    } catch (error) {
      setMsg(msg, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  function renderAccount() {
    const ms = state.microsoft;
    $('[data-player-name]').textContent = ms ? ms.name : state.site.username;
    const mode = $('[data-player-mode]');
    mode.textContent = ms ? 'Microsoft bağlı' : 'Çevrimdışı mod';
    mode.classList.toggle('is-ms', Boolean(ms));
    const avatar = $('[data-avatar]');
    if (ms && /^[0-9a-f]{32}$/i.test(ms.uuid)) {
      avatar.onerror = () => { avatar.onerror = null; avatar.src = 'assets/px-user.svg'; };
      avatar.src = `https://mc-heads.net/avatar/${ms.uuid}/64`;
    } else {
      avatar.src = 'assets/px-user.svg';
    }
    $$('[data-ms-link]').forEach((el) => { el.hidden = Boolean(ms); });
    $('[data-ms-logout]').hidden = !ms;
    $('[data-acc-site]').textContent = state.site.username;
    $('[data-acc-ms]').textContent = ms ? ms.name : 'Bağlı değil (isteğe bağlı)';
    $('[data-ram-summary]').textContent = gb(state.settings.ramMb);
    const count = state.settings.mods.length;
    $('[data-mod-badge]').textContent = count ? String(count) : '';
    setPlayButton();
  }

  $$('[data-ms-link]').forEach((button) => button.addEventListener('click', async () => {
    $$('[data-ms-link]').forEach((b) => { b.disabled = true; });
    try {
      state = await lumsmp.microsoftLogin();
      if (state.microsoft && state.microsoft.name.toLowerCase() !== state.site.username.toLowerCase()) {
        toast(`Dikkat: Minecraft adın (${state.microsoft.name}) LumSMP hesabınla aynı değil.`);
      }
      renderAccount();
    } catch (error) {
      toast(error.message);
    } finally {
      $$('[data-ms-link]').forEach((b) => { b.disabled = false; });
    }
  }));
  $('[data-ms-logout]').addEventListener('click', async () => {
    state = await lumsmp.microsoftLogout();
    renderAccount();
  });
  $('[data-site-logout]').addEventListener('click', async () => {
    state = await lumsmp.siteLogout();
    modsData = null;
    route();
  });

  $$('[data-open]').forEach((button) => button.addEventListener('click', () => {
    lumsmp.open(button.dataset.open).catch((error) => toast(error.message));
  }));
  $('[data-action="minimize"]').addEventListener('click', () => lumsmp.minimize());
  $('[data-action="close"]').addEventListener('click', () => lumsmp.close());

  // ------------------------------------------------------------- home
  async function loadHomeData() {
    try {
      const data = await lumsmp.homeData();
      const dot = $('[data-server-dot]');
      if (data.status) {
        dot.className = `dot ${data.status.online ? 'is-on' : 'is-off'}`;
        $('[data-server-state]').textContent = data.status.online ? 'Sunucu çevrimiçi' : 'Sunucu kapalı';
        $('[data-server-players]').textContent = data.status.online ? `${data.status.players} / ${data.status.max}` : '0';
      } else {
        dot.className = 'dot';
        $('[data-server-state]').textContent = 'Durum bilinmiyor';
        $('[data-server-players]').textContent = '—';
      }
      $('[data-server-meta]').textContent = data.minecraft ? `lumcraft.com.tr · ${data.minecraft}` : 'lumcraft.com.tr';
      const selected = state?.settings?.mods?.length || 0;
      $('[data-mod-summary]').textContent = data.mods == null ? `${selected} seçili` : `${data.mods} zorunlu · ${selected} seçili`;
      $('[data-news]').hidden = !data.news;
      $('[data-news-text]').textContent = data.news || '';
    } catch { /* son değerler kalsın */ }
  }
  function startHome() {
    if (homeTimer) return;
    loadHomeData();
    homeTimer = setInterval(loadHomeData, 30000);
  }
  function stopHome() { clearInterval(homeTimer); homeTimer = null; }

  // ------------------------------------------------------------- mods
  let modsData = null;
  let modsFilter = 'all';
  let saveTimer = null;
  const PX_ICON = 'assets/px-phone.svg';

  async function loadMods(force) {
    if (modsData && !force) { renderMods(); return; }
    try {
      modsData = await lumsmp.modsCatalog();
      renderChips();
      renderMods();
      if (modsData.error) toast(modsData.error);
    } catch (error) {
      $('[data-mods-list]').innerHTML = '';
      const p = document.createElement('p');
      p.className = 'mods__empty';
      p.textContent = error.message;
      $('[data-mods-list]').append(p);
    }
  }

  function selectedSet() { return new Set(state.settings.mods); }

  function renderChips() {
    const chips = $('[data-mods-chips]');
    chips.innerHTML = '';
    const make = (id, label, count) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `chip${modsFilter === id ? ' is-active' : ''}`;
      chip.dataset.filter = id;
      chip.textContent = label;
      if (count != null) { const s = document.createElement('span'); s.textContent = count; chip.append(s); }
      chip.addEventListener('click', () => { modsFilter = id; renderChips(); renderMods(); });
      chips.append(chip);
    };
    make('all', 'Tümü');
    make('on', 'Seçili', state.settings.mods.length);
    for (const cat of modsData.categories) make(cat.id, cat.name);
  }

  function renderMods() {
    if (!modsData) return;
    const list = $('[data-mods-list]');
    const term = $('[data-mods-search]').value.trim().toLocaleLowerCase('tr');
    const selected = selectedSet();
    const items = modsData.items.filter((mod) => {
      if (modsFilter === 'on' && !selected.has(mod.slug)) return false;
      if (!['all', 'on'].includes(modsFilter) && mod.category !== modsFilter) return false;
      if (term && !`${mod.name} ${mod.desc}`.toLocaleLowerCase('tr').includes(term)) return false;
      return true;
    });
    list.innerHTML = '';
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'mods__empty';
      p.textContent = modsFilter === 'on' && !term ? 'Hiç mod seçmedin. Oyun sadece sunucu modlarıyla açılır.' : 'Aramana uyan mod yok.';
      list.append(p);
    }
    const grouped = modsFilter === 'all' && !term;
    let lastCat = null;
    for (const mod of items) {
      if (grouped && mod.category !== lastCat) {
        lastCat = mod.category;
        const h = document.createElement('div');
        h.className = 'mods__group';
        h.textContent = modsData.categories.find((c) => c.id === mod.category)?.name || '';
        list.append(h);
      }
      list.append(modCard(mod, selected.has(mod.slug)));
    }
    const req = $('[data-required]');
    req.hidden = !modsData.required.length;
    $('[data-required-list]').textContent = modsData.required.join(', ');
    $('[data-mod-badge]').textContent = selected.size ? String(selected.size) : '';
    const on = $('.chip[data-filter="on"] span');
    if (on) on.textContent = selected.size;
  }

  function modCard(mod, isOn) {
    const label = document.createElement('label');
    const unavailable = mod.available === false;
    label.className = `mod${isOn ? ' is-on' : ''}${unavailable ? ' is-off-version' : ''}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = isOn;
    input.disabled = unavailable && !isOn;
    input.addEventListener('change', () => toggleMod(mod, input.checked));
    const icon = document.createElement('img');
    icon.className = 'mod__icon';
    icon.alt = '';
    icon.loading = 'lazy';
    if (mod.icon) {
      icon.src = mod.icon;
      icon.onerror = () => { icon.onerror = null; icon.src = PX_ICON; icon.classList.add('mod__icon--px'); };
    } else {
      icon.src = PX_ICON;
      icon.classList.add('mod__icon--px');
    }
    const body = document.createElement('div');
    body.className = 'mod__body';
    const name = document.createElement('div');
    name.className = 'mod__name';
    name.textContent = mod.name;
    if (unavailable) {
      const tag = document.createElement('span');
      tag.className = 'mod__tag mod__tag--warn';
      tag.textContent = `${modsData.minecraft} sürümü yok`;
      name.append(tag);
    }
    const desc = document.createElement('div');
    desc.className = 'mod__desc';
    desc.textContent = mod.desc;
    body.append(name, desc);
    const sw = document.createElement('span');
    sw.className = 'switch';
    label.append(input, icon, body, sw);
    return label;
  }

  function toggleMod(mod, on) {
    if (playing) { toast('Oyun açıkken modlar değiştirilemez.'); renderMods(); return; }
    let next = state.settings.mods.filter((slug) => slug !== mod.slug);
    if (on) {
      const clash = next.filter((slug) => mod.conflicts.includes(slug));
      if (clash.length) {
        next = next.filter((slug) => !clash.includes(slug));
        const names = clash.map((slug) => modsData.items.find((m) => m.slug === slug)?.name || slug).join(', ');
        toast(`${mod.name}, ${names} ile birlikte çalışmadığı için ${names} kapatıldı.`);
      }
      next.push(mod.slug);
    }
    setMods(next);
  }

  function setMods(next) {
    state.settings.mods = next;
    renderMods();
    renderAccount();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { state = await lumsmp.updateSettings({ mods: state.settings.mods }); renderMods(); } catch (error) { toast(error.message); }
    }, 300);
  }

  $('[data-mods-search]').addEventListener('input', renderMods);
  $('[data-mods-defaults]').addEventListener('click', () => {
    if (!modsData) return;
    setMods(modsData.items.filter((m) => m.default).map((m) => m.slug));
  });
  $('[data-mods-none]').addEventListener('click', () => setMods([]));

  // ------------------------------------------------------------- settings
  const ram = $('[data-ram]');
  function ramLabel() {
    $('[data-ram-value]').textContent = gb(Number(ram.value));
    const v = Number(ram.value);
    $('[data-ram-hint]').textContent = v < 4096 ? 'Az mod için yeterli' : v <= 6144 ? 'Önerilen' : 'Shader ve çok mod için';
  }
  function renderSettings() {
    ram.max = String(state.maxRamMb);
    ram.value = String(state.settings.ramMb);
    $('[data-ram-max]').textContent = gb(state.maxRamMb);
    ramLabel();
  }
  ram.addEventListener('input', ramLabel);
  ram.addEventListener('change', async () => {
    try {
      state = await lumsmp.updateSettings({ ramMb: Number(ram.value) });
      renderAccount();
      toast(`Oyuna ${gb(state.settings.ramMb)} RAM ayrılacak.`);
    } catch (error) { toast(error.message); }
  });

  // ------------------------------------------------------------- play
  const STAGES = {
    auth: ['Hesap doğrulanıyor', 0, 4],
    meta: ['Sürüm bilgisi alınıyor', 4, 8],
    java: ['Java kuruluyor', 8, 22],
    libraries: ['Kütüphaneler indiriliyor', 22, 38],
    assets: ['Oyun dosyaları indiriliyor', 38, 80],
    mods: ['Modlar hazırlanıyor', 80, 95],
    ticket: ['Sunucu bileti alınıyor', 95, 98],
    launch: ['Oyun başlatılıyor', 98, 100],
  };
  function setProgress(text, pct) {
    $('[data-progress-text]').textContent = text;
    $('[data-progress-pct]').textContent = pct == null ? '' : `%${pct}`;
    $('[data-progress-bar]').style.width = pct == null ? '0' : `calc(${pct}% - 6px)`;
  }
  function setPlayButton() {
    const button = $('[data-play]');
    button.disabled = playing;
    button.classList.toggle('is-busy', playing);
    $('[data-play-text]').textContent = playing ? 'AÇILIYOR' : 'OYNA';
  }

  $('[data-play]').addEventListener('click', async () => {
    if (playing) return;
    clearTimeout(saveTimer);
    try { state = await lumsmp.updateSettings({ mods: state.settings.mods }); } catch { /* kayıtlı hali kullanılır */ }
    playing = true;
    setPlayButton();
    setProgress('Hazırlanıyor', 0);
    try {
      await lumsmp.play();
    } catch (error) {
      playing = false;
      setPlayButton();
      setProgress('Hazır', null);
      if (/Microsoft oturumunun süresi doldu|Önce Microsoft/.test(error.message)) await refreshState();
      showError('Oyun açılamadı', error.message);
    }
  });

  lumsmp.on('progress', ({ stage, done, total }) => {
    const info = STAGES[stage];
    if (!info) return;
    const [label, from, to] = info;
    const ratio = total > 0 ? Math.min(1, done / total) : 0;
    const pct = Math.floor(from + (to - from) * ratio);
    const count = total > 1 ? ` (${done}/${total})` : '';
    setProgress(`${label}${count}`, pct);
  });

  lumsmp.on('game', (event) => {
    if (event.state === 'running') {
      setProgress('Oyun açık · iyi eğlenceler!', 100);
      $('[data-play-text]').textContent = 'OYUNDA';
      return;
    }
    playing = false;
    setPlayButton();
    setProgress('Hazır', null);
    if (event.state === 'crashed') {
      showError('Oyun kapandı', `${event.message}${event.quick ? ' Bir mod uyumsuz olabilir: Modlar sekmesinden son açtıklarını kapatıp tekrar dene.' : ''}`, event.tail || []);
    } else if (event.state === 'error') {
      showError('Oyun açılamadı', event.message);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') $('[data-error]').hidden = true;
  });

  // ------------------------------------------------------------- boot
  lumsmp.on('update', applyUpdate);
  lumsmp.on('state', (next) => { state = next; route(); });
  refreshState().then(() => applyUpdate(state.update)).catch((error) => showError('Launcher başlatılamadı', error.message));
})();
