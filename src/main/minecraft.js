'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { getJson, download, pool, safeJoin } = require('./net');

const VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const JAVA_RUNTIMES = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';
const FABRIC_META = 'https://meta.fabricmc.net/v2';
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/;
const OS_NAME = 'windows';

// ---------------------------------------------------------------- rules / helpers
function osArch() {
  return process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'x86' : 'x86_64';
}

/** Mojang rule evaluation. `features` = which optional features are on. */
function allowed(rules, features = {}) {
  if (!Array.isArray(rules) || rules.length === 0) return true;
  let result = false;
  for (const rule of rules) {
    let match = true;
    if (rule.os) {
      if (rule.os.name && rule.os.name !== OS_NAME) match = false;
      if (rule.os.arch && rule.os.arch !== osArch() && !(rule.os.arch === 'x86' && osArch() === 'x86')) match = false;
    }
    if (rule.features) {
      for (const [key, value] of Object.entries(rule.features)) if (Boolean(features[key]) !== value) match = false;
    }
    if (match) result = rule.action === 'allow';
  }
  return result;
}

/** "group:artifact:version[:classifier]" → maven relative path. */
function mavenPath(name) {
  const parts = String(name).split(':');
  if (parts.length < 3 || parts.some((p) => !/^[A-Za-z0-9._+-]+$/.test(p))) throw new Error(`Geçersiz kütüphane adı: ${name}`);
  const [group, artifact, version, classifier] = parts;
  const file = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.jar`;
  return [...group.split('.'), artifact, version, file].join('/');
}

function libraryKey(name) {
  const [group, artifact, , classifier] = String(name).split(':');
  return `${group}:${artifact}${classifier ? `:${classifier}` : ''}`;
}

// ---------------------------------------------------------------- version metadata
async function vanillaVersion(root, id) {
  if (!VERSION_RE.test(id)) throw new Error('Minecraft sürümü geçersiz.');
  const manifest = await getJson(VERSION_MANIFEST);
  const entry = (manifest.versions || []).find((v) => v.id === id);
  if (!entry) throw new Error(`Minecraft ${id} sürümü bulunamadı.`);
  const file = safeJoin(root, `versions/${id}/${id}.json`);
  await download(entry.url, file, { sha1: entry.sha1 });
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

async function fabricProfile(root, minecraft, loader) {
  let loaderVersion = loader;
  if (!loaderVersion) {
    const list = await getJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(minecraft)}`);
    const stable = list.find((entry) => entry.loader && entry.loader.stable) || list[0];
    if (!stable) throw new Error(`Minecraft ${minecraft} için Fabric bulunamadı.`);
    loaderVersion = stable.loader.version;
  }
  if (!VERSION_RE.test(loaderVersion)) throw new Error('Fabric loader sürümü geçersiz.');
  const profile = await getJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(minecraft)}/${encodeURIComponent(loaderVersion)}/profile/json`);
  if (!profile.mainClass || !Array.isArray(profile.libraries)) throw new Error('Fabric profili okunamadı.');
  const id = `fabric-${minecraft}-${loaderVersion}`;
  await fsp.mkdir(safeJoin(root, `versions/${id}`), { recursive: true });
  await fsp.writeFile(safeJoin(root, `versions/${id}/${id}.json`), JSON.stringify(profile, null, 2));
  return { id, profile };
}

// ---------------------------------------------------------------- java runtime
async function ensureJava(root, component, progress) {
  if (!/^[a-z0-9-]{1,40}$/.test(component)) throw new Error('Java bileşeni geçersiz.');
  const platform = process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64';
  const all = await getJson(JAVA_RUNTIMES);
  const entry = all?.[platform]?.[component]?.[0];
  if (!entry) throw new Error(`Bu sistem için Java (${component}) bulunamadı.`);
  const manifest = await getJson(entry.manifest.url);
  const base = safeJoin(root, `runtime/${component}`);
  const files = Object.entries(manifest.files || {});
  const toFetch = [];
  for (const [rel, info] of files) {
    const target = safeJoin(base, rel);
    if (info.type === 'directory') await fsp.mkdir(target, { recursive: true });
    else if (info.type === 'file' && info.downloads?.raw) toFetch.push({ target, raw: info.downloads.raw });
  }
  let done = 0;
  await pool(toFetch, 8, async ({ target, raw }) => {
    await download(raw.url, target, { sha1: raw.sha1, size: raw.size });
    progress('java', ++done, toFetch.length);
  });
  const javaw = path.join(base, 'bin', 'javaw.exe');
  if (!fs.existsSync(javaw)) throw new Error('Java kurulumu tamamlanamadı.');
  return javaw;
}

// ---------------------------------------------------------------- install
async function install(root, { minecraft, fabricLoader }, progress) {
  progress('meta', 0, 1);
  const vanilla = await vanillaVersion(root, minecraft);
  const { id, profile } = await fabricProfile(root, minecraft, fabricLoader);
  progress('meta', 1, 1);

  const javaComponent = vanilla.javaVersion?.component || 'java-runtime-delta';
  const javaPath = await ensureJava(root, javaComponent, progress);

  // Client jar
  const client = vanilla.downloads?.client;
  if (!client) throw new Error('İstemci dosyası bilgisi yok.');
  const clientJar = safeJoin(root, `versions/${minecraft}/${minecraft}.jar`);
  await download(client.url, clientJar, { sha1: client.sha1, size: client.size });

  // Libraries: Fabric's take precedence over vanilla's with the same group:artifact.
  const libs = new Map();
  for (const lib of profile.libraries) {
    const rel = mavenPath(lib.name);
    const base = (lib.url || 'https://maven.fabricmc.net/').replace(/\/?$/, '/');
    libs.set(libraryKey(lib.name), { path: rel, url: base + rel, sha1: lib.sha1, size: lib.size });
  }
  for (const lib of vanilla.libraries || []) {
    if (!allowed(lib.rules)) continue;
    const artifact = lib.downloads?.artifact;
    if (!artifact || libs.has(libraryKey(lib.name))) continue;
    libs.set(libraryKey(lib.name), { path: artifact.path, url: artifact.url, sha1: artifact.sha1, size: artifact.size });
  }
  const libraries = [...libs.values()];
  let done = 0;
  await pool(libraries, 8, async (lib) => {
    await download(lib.url, safeJoin(root, `libraries/${lib.path}`), { sha1: lib.sha1, size: lib.size });
    progress('libraries', ++done, libraries.length);
  });

  // Assets
  const indexInfo = vanilla.assetIndex;
  const indexFile = safeJoin(root, `assets/indexes/${indexInfo.id}.json`);
  await download(indexInfo.url, indexFile, { sha1: indexInfo.sha1 });
  const index = JSON.parse(await fsp.readFile(indexFile, 'utf8'));
  const objects = Object.values(index.objects || {}).filter((o) => /^[0-9a-f]{40}$/.test(o.hash));
  done = 0;
  await pool(objects, 16, async (object) => {
    const sub = `${object.hash.slice(0, 2)}/${object.hash}`;
    await download(`https://resources.download.minecraft.net/${sub}`, safeJoin(root, `assets/objects/${sub}`),
      { sha1: object.hash, size: object.size, trustSize: true });
    progress('assets', ++done, objects.length);
  });

  // Logging config
  let logArg = null;
  const logging = vanilla.logging?.client;
  if (logging?.file?.url && /^[A-Za-z0-9._-]+$/.test(logging.file.id || '')) {
    const logFile = safeJoin(root, `assets/log_configs/${logging.file.id}`);
    await download(logging.file.url, logFile, { sha1: logging.file.sha1 });
    logArg = String(logging.argument || '').replace('${path}', logFile);
  }

  return { id, vanilla, profile, javaPath, clientJar, libraries, logArg };
}

// ---------------------------------------------------------------- launch
function expand(args, vars, features) {
  const out = [];
  for (const arg of args || []) {
    if (typeof arg === 'string') out.push(arg);
    else if (arg && allowed(arg.rules, features)) out.push(...[].concat(arg.value));
  }
  return out
    .map((value) => String(value).replace(/\$\{([a-zA-Z_]+)\}/g, (_, key) => (key in vars ? vars[key] : '\u0000')))
    .filter((value) => !value.includes('\u0000'));
}

/**
 * Java bellek ve çöp toplayıcı ayarları (Modrinth App / OneClient'in kullandığı istemci ayarlarına benzer).
 *  - g1:  ayarlanmış G1, her bilgisayarda güvenli ve dengeli.
 *  - zgc: ZGC (Java 21+ nesilli), duraklamalar 1 ms'nin altında; bol RAM ve çok çekirdek ister.
 *  - auto: 8 GB+ RAM ayrıldıysa ve 8+ çekirdek varsa zgc, değilse g1.
 */
function jvmFlags(ramMb, mode = 'auto', cores = os.cpus().length) {
  const gc = mode === 'zgc' || mode === 'g1' ? mode : (ramMb >= 8192 && cores >= 8 ? 'zgc' : 'g1');
  const xms = Math.min(ramMb, Math.max(1024, Math.round(ramMb / 2 / 512) * 512));
  const common = [`-Xmx${ramMb}M`, `-Xms${xms}M`, '-XX:+UnlockExperimentalVMOptions', '-XX:+DisableExplicitGC',
    '-XX:+PerfDisableSharedMem'];
  if (gc === 'zgc') return { gc, flags: [...common, '-XX:+UseZGC'] };
  return {
    gc,
    flags: [...common, '-XX:+UseG1GC', '-XX:G1NewSizePercent=20', '-XX:G1ReservePercent=20', '-XX:MaxGCPauseMillis=50',
      `-XX:G1HeapRegionSize=${ramMb >= 8192 ? 32 : 16}M`, '-XX:G1MixedGCCountTarget=4', '-XX:+UseStringDeduplication'],
  };
}

// İlk kurulumda (options.txt yokken) performans dostu oyun ayarları. Oyuncunun kendi ayarlarına asla dokunulmaz.
const DEFAULT_OPTIONS = [
  'lang:tr_tr', 'enableVsync:false', 'maxFps:260', 'renderDistance:10', 'simulationDistance:8',
  'biomeBlendRadius:1', 'entityShadows:false', 'particles:1', 'mipmapLevels:2', 'autoJump:false',
];

function seedOptions(root) {
  const file = safeJoin(root, 'options.txt');
  if (fs.existsSync(file)) return false;
  fs.writeFileSync(file, `${DEFAULT_OPTIONS.join('\n')}\n`, 'utf8');
  return true;
}

function buildArgs(root, installed, { auth, ramMb, perfMode, server, clientMod }) {
  const { vanilla, profile, libraries, clientJar, logArg, id } = installed;
  const nativesDir = safeJoin(root, `versions/${id}/natives`);
  fs.mkdirSync(nativesDir, { recursive: true });
  const classpath = [...libraries.map((lib) => safeJoin(root, `libraries/${lib.path}`)), clientJar].join(path.delimiter);
  const vars = {
    auth_player_name: auth.name,
    version_name: id,
    game_directory: root,
    assets_root: safeJoin(root, 'assets'),
    assets_index_name: vanilla.assetIndex.id,
    auth_uuid: auth.uuid,
    auth_access_token: auth.accessToken,
    clientid: '',
    auth_xuid: auth.xuid,
    user_type: 'msa',
    version_type: 'release',
    natives_directory: nativesDir,
    launcher_name: 'LumSMP',
    launcher_version: '1',
    classpath,
    classpath_separator: path.delimiter,
    library_directory: safeJoin(root, 'libraries'),
    quickPlayMultiplayer: `${server.host}:${server.port}`,
    user_properties: '{}',
  };
  // LumSMP Client modu varsa sunucuya o bağlanır (LumSMP ekranı + çıkınca oyunu kapatma); yoksa Minecraft'ın quick play'i.
  const features = { is_quick_play_multiplayer: !clientMod };
  const jvm = [
    ...jvmFlags(ramMb, perfMode).flags,
    ...(clientMod ? [`-Dlumsmp.server=${server.host}:${server.port}`] : []),
    ...expand(vanilla.arguments?.jvm || ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'], vars, features),
    ...expand(profile.arguments?.jvm, vars, features),
  ];
  if (logArg) jvm.push(logArg);
  const game = [
    ...expand(vanilla.arguments?.game, vars, features),
    ...expand(profile.arguments?.game, vars, features),
  ];
  if (!clientMod && !game.includes('--quickPlayMultiplayer')) game.push('--quickPlayMultiplayer', vars.quickPlayMultiplayer);
  return [...jvm, profile.mainClass, ...game];
}

/** Starts the game. Output goes to logs/launcher-game.log (no tokens are written). */
function launch(root, installed, options) {
  seedOptions(root);
  const args = buildArgs(root, installed, options);
  const logDir = safeJoin(root, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, 'launcher-game.log');
  const log = fs.createWriteStream(logFile, { flags: 'w' });
  const child = spawn(installed.javaPath, args, { cwd: root, windowsHide: false, detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
  // Oyuna arka plan programlarından önce işlemci zamanı verilsin (Windows: "Normalin üstünde").
  try { os.setPriority(child.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL); } catch { /* izin yoksa normal kalır */ }
  const tail = [];
  const collect = (chunk) => {
    const token = String(options.auth.accessToken || '');
    const raw = chunk.toString('utf8');
    const text = token.length >= 16 ? raw.split(token).join('***') : raw;
    log.write(text);
    for (const line of text.split(/\r?\n/)) if (line.trim()) { tail.push(line); if (tail.length > 40) tail.shift(); }
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.on('close', () => log.end());
  return { child, tail, logFile };
}

module.exports = { install, launch, allowed, mavenPath, expand, jvmFlags, seedOptions, DEFAULT_OPTIONS };
