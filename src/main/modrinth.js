'use strict';
const { getJson, request, pool } = require('./net');
const { CATALOG, BY_SLUG } = require('./catalog');

const API = 'https://api.modrinth.com/v2';
const ID_RE = /^[A-Za-z0-9]{8}$/;
const SHA1_RE = /^[0-9a-f]{40}$/;
const SHA512_RE = /^[0-9a-f]{128}$/;
const CATALOG_TTL = 10 * 60 * 1000;

// Seçilen bir modun "isteğe bağlı" (optional) bağımlılıkları arasında bunlar varsa onlar da kurulur:
// modların ayar ekranlarını ve Mod Menu entegrasyonunu açan hafif kütüphaneler. Bu sürümde yoksa
// sessizce atlanır, oyunu hiçbir zaman engellemez. (Modrinth proje kimlikleri.)
const OPTIONAL_COMPANIONS = new Map([
  ['9s6osm5g', 'Cloth Config API'],
  ['1eAoo2KR', 'YetAnotherConfigLib'],
  ['mOgUt4GM', 'Mod Menu'],
  ['codAaoxh', 'MidnightLib'],
  ['P7dR8mSH', 'Fabric API'],
  ['Ha28R6CL', 'Fabric Language Kotlin'],
  ['M1953qlQ', 'Resourceful Config'],
  ['QAGBst4M', 'Puzzles Lib'],
]);

let catalogCache = null;   // { minecraft, at, projects: Map(slug -> project) }

const q = (value) => encodeURIComponent(JSON.stringify(value));

/** Katalogdaki tüm projeleri tek istekte çeker: ikon, hangi sürümlerde var. */
async function catalogInfo(minecraft) {
  if (catalogCache && catalogCache.minecraft === minecraft && Date.now() - catalogCache.at < CATALOG_TTL) return catalogCache.projects;
  const list = await getJson(`${API}/projects?ids=${q(CATALOG.map((mod) => mod.slug))}`);
  const projects = new Map();
  for (const project of Array.isArray(list) ? list : []) {
    if (!BY_SLUG.has(project.slug)) continue;
    const icon = typeof project.icon_url === 'string' && /^https:\/\/cdn\.modrinth\.com\//.test(project.icon_url) ? project.icon_url : null;
    projects.set(project.slug, {
      id: project.id,
      icon,
      downloads: Number(project.downloads) || 0,
      available: Array.isArray(project.game_versions) && project.game_versions.includes(minecraft)
        && Array.isArray(project.loaders) && project.loaders.includes('fabric'),
    });
  }
  catalogCache = { minecraft, at: Date.now(), projects };
  return projects;
}

function pickFile(version) {
  const files = Array.isArray(version?.files) ? version.files : [];
  const file = files.find((f) => f.primary) || files[0];
  if (!file || !/^https:\/\/cdn\.modrinth\.com\//.test(file.url || '')) return null;
  if (!SHA1_RE.test(file.hashes?.sha1 || '') || !SHA512_RE.test(file.hashes?.sha512 || '') || !Number.isInteger(file.size)) return null;
  return file;
}

async function bestVersion(project, minecraft) {
  const versions = await getJson(`${API}/project/${encodeURIComponent(project)}/version?loaders=${q(['fabric'])}&game_versions=${q([minecraft])}`);
  if (!Array.isArray(versions) || !versions.length) return null;
  const usable = versions.filter((v) => pickFile(v));
  return usable.find((v) => v.version_type === 'release') || usable.find((v) => v.version_type === 'beta') || usable[0] || null;
}

function fileName(slug, version, file) {
  const original = String(file.filename || '');
  if (/^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}\.jar$/.test(original)) return original;
  const clean = `${slug}-${version.version_number || version.id}`.replace(/[^A-Za-z0-9._+-]/g, '_').slice(0, 90);
  return `${clean}.jar`;
}

/** Sitedeki zorunlu modların Modrinth proje kimlikleri (aynı mod iki kez kurulmasın). */
async function projectsOf(sha1List) {
  const hashes = sha1List.filter((h) => SHA1_RE.test(h));
  if (!hashes.length) return new Set();
  const body = Buffer.from(JSON.stringify({ hashes, algorithm: 'sha1' }));
  const res = await request(`${API}/version_files`, {
    method: 'POST', body, timeoutMs: 20000, maxBytes: 4 * 1024 * 1024,
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(body.length), Accept: 'application/json' },
  });
  if (res.status !== 200) return new Set();
  let data = {};
  try { data = JSON.parse(res.body.toString('utf8')); } catch { /* ignore */ }
  return new Set(Object.values(data).map((v) => v?.project_id).filter((id) => ID_RE.test(id || '')));
}

/**
 * Seçilen modları + zorunlu bağımlılıklarını bu Minecraft sürümü için çözer.
 * Dönen liste: [{ name, url, sha1, sha512, size, title }]
 */
async function resolve(selected, minecraft, skipProjects = new Set()) {
  const info = await catalogInfo(minecraft);
  const plan = new Map();          // project id -> entry
  const titles = new Map();
  const queue = [];
  for (const slug of selected) {
    const project = info.get(slug);
    if (!project) continue;
    if (!project.available) throw new Error(`${BY_SLUG.get(slug).name} modunun Minecraft ${minecraft} sürümü yok. Modlar sekmesinden kapat.`);
    titles.set(project.id, BY_SLUG.get(slug).name);
    queue.push({ project: project.id, slug, title: BY_SLUG.get(slug).name, requiredBy: null });
  }
  const incompatible = [];
  while (queue.length) {
    const batch = queue.splice(0).filter((job) => !plan.has(job.project) && !skipProjects.has(job.project));
    const unique = [...new Map(batch.map((job) => [job.project, job])).values()];
    await pool(unique, 6, async (job) => {
      if (plan.has(job.project)) return;
      const version = await bestVersion(job.project, minecraft);
      if (!version && job.optional) return;
      if (!version && job.requiredBy) {
        // Bazı modlar yanlışlıkla Forge/kaynak paketi kütüphanelerini "gerekli" diye işaretliyor; Fabric'te zaten yüklenemezler.
        const project = await getJson(`${API}/project/${encodeURIComponent(job.project)}`).catch(() => null);
        if (project && Array.isArray(project.loaders) && !project.loaders.includes('fabric') && !project.loaders.includes('quilt')) return;
      }
      if (!version) {
        throw new Error(job.requiredBy
          ? `${job.requiredBy} için gereken bir kütüphanenin Minecraft ${minecraft} sürümü yok. ${job.requiredBy} modunu kapat.`
          : `${job.title} modunun Minecraft ${minecraft} sürümü yok. Modlar sekmesinden kapat.`);
      }
      const file = pickFile(version);
      plan.set(job.project, {
        project: job.project,
        title: job.title || version.name || job.project,
        name: fileName(job.slug || job.project, version, file),
        url: file.url, sha1: file.hashes.sha1, sha512: file.hashes.sha512, size: file.size,
      });
      for (const dep of Array.isArray(version.dependencies) ? version.dependencies : []) {
        if (!ID_RE.test(dep.project_id || '')) continue;
        if (dep.dependency_type === 'required') {
          queue.push({ project: dep.project_id, slug: null, title: null, requiredBy: job.title || job.requiredBy });
        } else if (dep.dependency_type === 'optional' && OPTIONAL_COMPANIONS.has(dep.project_id)) {
          queue.push({ project: dep.project_id, slug: null, title: OPTIONAL_COMPANIONS.get(dep.project_id),
            requiredBy: job.title || job.requiredBy, optional: true });
        } else if (dep.dependency_type === 'incompatible') {
          incompatible.push({ a: job.project, b: dep.project_id });
        }
      }
    });
  }
  for (const { a, b } of incompatible) {
    if (plan.has(b)) {
      throw new Error(`${titles.get(a) || plan.get(a).title} ile ${titles.get(b) || plan.get(b).title} birlikte çalışmıyor. Birini kapat.`);
    }
  }
  // Aynı dosya adı iki kez olmasın.
  const seen = new Set();
  return [...plan.values()].filter((mod) => {
    const key = mod.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { catalogInfo, resolve, projectsOf, OPTIONAL_COMPANIONS };
