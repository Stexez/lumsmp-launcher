use crate::config::AppConfig;
use crate::minecraft::{download_file, file_sha256, safe_join};
use crate::site::SiteMod;
use futures_util::stream::{self, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogMod {
    pub slug: String,
    pub name: String,
    pub category: String,
    pub desc: String,
    pub default_on: bool,
    pub conflicts: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaEntry {
    pub name: String,
    pub path: String,
    pub size_kb: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ShaderItem {
    pub slug: String,
    pub name: String,
    pub desc: String,
    pub tier: String,
}

pub fn shader_catalog() -> Vec<ShaderItem> {
    let s = |slug: &str, name: &str, desc: &str, tier: &str| ShaderItem {
        slug: slug.into(),
        name: name.into(),
        desc: desc.into(),
        tier: tier.into(),
    };
    vec![
        s("makeup-ultra-fast-shaders", "MakeUp - Ultra Fast", "Düşük sistemlerde bile akıcı çalışan hafif shader.", "Hafif"),
        s("complementary-unbound", "Complementary Unbound", "En popüler, net ve gerçekçi su/bulut shader paketi.", "Dengeli"),
        s("complementary-reimagined", "Complementary Reimagined", "Vanilla atmosferini koruyan yüksek kaliteli shader.", "Dengeli"),
        s("bsl-shaders", "BSL Shaders", "Sıcak ışıklandırma ve yumuşak gölgeler.", "Dengeli"),
        s("solas-shader", "Solas Shaders", "Sinematik gökyüzü, aurora ve hacimsel ışık.", "Yüksek"),
        s("sildurs-vibrant-shaders", "Sildur's Vibrant", "Canlı renkler ve dinamik gölgeler.", "Orta"),
    ]
}

pub async fn install_shader(root: &Path, cfg: &AppConfig, slug: &str) -> Result<String, String> {
    let http = Client::builder()
        .timeout(Duration::from_secs(45))
        .user_agent("LumSMP-Launcher/2.0")
        .build()
        .map_err(|e| format!("HTTP hatası: {e}"))?;
    let url = format!("https://api.modrinth.com/v2/project/{slug}/version?loaders=%5B%22iris%22%5D");
    let resp = http.get(&url).send().await.map_err(|e| format!("Modrinth bağlantısı başarısız: {e}"))?;
    if !resp.status().is_success() {
        return Err("Shader paketi Modrinth'te bulunamadı.".into());
    }
    let arr: Vec<Value> = resp.json().await.map_err(|_| "Shader listesi okunamadı.".to_string())?;
    let ver = arr.first().ok_or("Bu shader için uygun sürüm yok.")?;
    let files = ver.get("files").and_then(|v| v.as_array()).ok_or("Shader dosyası bulunamadı.")?;
    let primary = files.iter().find(|f| f.get("primary").and_then(|b| b.as_bool()) == Some(true)).or_else(|| files.first()).ok_or("Dosya yok.")?;
    let fname = primary.get("filename").and_then(|v| v.as_str()).ok_or("Dosya adı yok.")?;
    let furl = primary.get("url").and_then(|v| v.as_str()).ok_or("İndirme linki yok.")?;
    let size = primary.get("size").and_then(|v| v.as_u64());
    let dir = safe_join(root, "shaderpacks")?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = safe_join(&dir, fname)?;
    download_file(&http, cfg, furl, &target, None, None, size, None).await?;
    Ok(fname.to_string())
}

pub fn read_screenshot_data_url(root: &Path, name: &str) -> Result<String, String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    let target = safe_join(root, &format!("screenshots/{name}"))?;
    let bytes = fs::read(&target).map_err(|e| format!("Görüntü okunamadı: {e}"))?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("Dosya çok büyük.".into());
    }
    let mime = if name.to_lowercase().ends_with(".jpg") || name.to_lowercase().ends_with(".jpeg") {
        "image/jpeg"
    } else {
        "image/png"
    };
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

pub fn delete_media_file(root: &Path, sub: &str, name: &str) -> Result<(), String> {
    if !matches!(sub, "shaderpacks" | "screenshots") {
        return Err("İzin verilmeyen klasör.".into());
    }
    let target = safe_join(root, &format!("{sub}/{name}"))?;
    if target.is_file() {
        fs::remove_file(&target).map_err(|e| format!("Silinemedi: {e}"))?;
    }
    Ok(())
}

pub fn read_game_log_tail(root: &Path) -> String {
    let path = root.join("logs").join("launcher-game.log");
    let Ok(text) = fs::read_to_string(&path) else {
        return "Henüz oyun kaydı yok. Oyunu başlattığında loglar burada canlı görünür.".into();
    };
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(140);
    lines[start..].join("\n")
}

pub fn catalog() -> Vec<CatalogMod> {
    let m = |slug: &str, name: &str, category: &str, desc: &str, default_on: bool, conflicts: &[&str]| CatalogMod {
        slug: slug.into(),
        name: name.into(),
        category: category.into(),
        desc: desc.into(),
        default_on,
        conflicts: conflicts.iter().map(|s| s.to_string()).collect(),
    };
    vec![
        m("sodium", "Sodium", "performance", "FPS'i katlayan modern render motoru.", true, &[]),
        m("lithium", "Lithium", "performance", "Oyun mantığını hızlandırır, takılmaları azaltır.", true, &[]),
        m("ferrite-core", "FerriteCore", "performance", "RAM kullanımını ciddi ölçüde düşürür.", true, &[]),
        m("entityculling", "Entity Culling", "performance", "Görünmeyen varlıkları ve sandıkları çizmez.", true, &[]),
        m("immediatelyfast", "ImmediatelyFast", "performance", "Arayüz, yazı ve harita çizimini hızlandırır.", true, &[]),
        m("krypton", "Krypton", "performance", "Ağ kodunu hızlandırır, gecikmeyi azaltır.", true, &[]),
        m("moreculling", "More Culling", "performance", "Yaprak ve blok yüzlerini akıllıca gizler.", false, &["cull-leaves"]),
        m("dynamic-fps", "Dynamic FPS", "performance", "Arka plandayken FPS'i düşürüp PC'yi rahatlatır.", false, &[]),
        m("sodium-extra", "Sodium Extra", "performance", "Parçacık, animasyon ve FPS göstergesi ayarları.", false, &[]),
        m("reeses-sodium-options", "Reese's Sodium Options", "performance", "Sodium ayar ekranını sekmeli ve düzenli yapar.", false, &[]),
        m("iris", "Iris Shaders", "visual", "Shader paketleri (BSL, Complementary) desteği.", false, &[]),
        m("continuity", "Continuity", "visual", "Cam ve kitaplıkta bağlantılı dokular.", false, &[]),
        m("lambdynamiclights", "LambDynamicLights", "visual", "Elindeki meşale etrafı aydınlatır.", false, &[]),
        m("3dskinlayers", "3D Skin Layers", "visual", "Skin dış katmanını 3 boyutlu gösterir.", false, &[]),
        m("bobby", "Bobby", "visual", "Sunucu görüş sınırından uzağı da gösterir.", false, &[]),
        m("visuality", "Visuality", "visual", "Kristal parıltısı ve su damlası parçacıkları.", false, &[]),
        m("cubes-without-borders", "Cubes Without Borders", "visual", "Kenarlıksız tam ekran, anında Alt-Tab.", false, &[]),
        m("not-enough-animations", "Not Enough Animations", "animation", "Harita tutma, yeme, merdiven animasyonları.", false, &[]),
        m("xaeros-minimap", "Xaero's Minimap", "info", "Köşede mini harita ve yol noktaları.", false, &["journeymap"]),
        m("xaeros-world-map", "Xaero's World Map", "info", "M tuşuyla tam ekran dünya haritası.", false, &["journeymap"]),
        m("jade", "Jade", "info", "Baktığın bloğun ve yaratığın bilgisi.", false, &[]),
        m("appleskin", "AppleSkin", "info", "Yemeklerin doyuruculuk ve doygunluk bilgisi.", false, &[]),
        m("jei", "Just Enough Items", "info", "Tüm eşya ve tarifler envanterde.", false, &["rei"]),
        m("shulkerboxtooltip", "Shulker Box Tooltip", "info", "Shulker kutusunun içini açmadan gösterir.", false, &[]),
        m("chat-heads", "Chat Heads", "info", "Sohbette oyuncu kafalarını gösterir.", false, &[]),
        m("modmenu", "Mod Menu", "utility", "Oyun içinden modları görüp ayarlarını aç.", true, &[]),
        m("mouse-tweaks", "Mouse Tweaks", "utility", "Envanterde sürükleyerek hızlı eşya taşıma.", false, &[]),
        m("zoomify", "Zoomify", "utility", "Akıcı yakınlaştırma (Zoom) özelliği.", false, &[]),
    ]
}

async fn resolve_modrinth(http: &Client, slugs: &[String], mc_version: &str) -> Result<Vec<(String, String, u64)>, String> {
    if slugs.is_empty() {
        return Ok(Vec::new());
    }
    let mut resolved: HashMap<String, (String, String, u64)> = HashMap::new();
    let mut queue: Vec<String> = slugs.to_vec();
    let mut visited: HashSet<String> = HashSet::new();

    while let Some(slug) = queue.pop() {
        if !visited.insert(slug.clone()) { continue; }
        let url = format!(
            "https://api.modrinth.com/v2/project/{slug}/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%22{mc_version}%22%5D"
        );
        let Ok(resp) = http.get(&url).send().await else { continue; };
        if !resp.status().is_success() { continue; }
        let Ok(arr) = resp.json::<Vec<Value>>().await else { continue; };
        let Some(ver) = arr.first() else { continue; };
        if let Some(files) = ver.get("files").and_then(|v| v.as_array()) {
            let primary = files.iter().find(|f| f.get("primary").and_then(|b| b.as_bool()) == Some(true)).or_else(|| files.first());
            if let Some(f) = primary {
                if let (Some(fname), Some(furl)) = (f.get("filename").and_then(|v| v.as_str()), f.get("url").and_then(|v| v.as_str())) {
                    let size = f.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                    resolved.insert(fname.to_lowercase(), (fname.to_string(), furl.to_string(), size));
                }
            }
        }
        if let Some(deps) = ver.get("dependencies").and_then(|v| v.as_array()) {
            for dep in deps {
                if dep.get("dependency_type").and_then(|v| v.as_str()) == Some("required") {
                    if let Some(pid) = dep.get("project_id").and_then(|v| v.as_str()) {
                        if !visited.contains(pid) {
                            queue.push(pid.to_string());
                        }
                    }
                }
            }
        }
    }
    Ok(resolved.into_values().collect())
}

pub async fn sync_mods<F>(
    root: &Path,
    cfg: &AppConfig,
    required: &[SiteMod],
    bundled_jars: &[PathBuf],
    selected_slugs: &[String],
    mc_version: &str,
    site_token: &str,
    on_progress: F,
) -> Result<(usize, usize), String>
where
    F: Fn(&str, usize, usize) + Send + Sync + 'static,
{
    let http = Client::builder()
        .timeout(Duration::from_secs(45))
        .user_agent("LumSMP-Launcher/2.0")
        .build()
        .map_err(|e| format!("HTTP hatası: {e}"))?;
    let mods_dir = safe_join(root, "mods")?;
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    let progress = Arc::new(on_progress);
    progress("mods", 0, 1);

    let mut wanted: HashSet<String> = HashSet::new();

    // 1. Required site mods (SHA-256 verified)
    for m in required {
        let full_url = if m.url.starts_with("http") {
            m.url.clone()
        } else {
            format!("{}{}", cfg.site_origin, m.url)
        };
        let target = safe_join(&mods_dir, &m.name)?;
        download_file(&http, cfg, &full_url, &target, None, Some(&m.sha256), Some(m.size), Some(site_token)).await?;
        wanted.insert(m.name.to_lowercase());
    }

    // 2. Bundled client mod (lumsmp-client.jar)
    for src in bundled_jars {
        if let Some(name) = src.file_name().and_then(|n| n.to_str()) {
            let target = safe_join(&mods_dir, name)?;
            if file_sha256(&target) != file_sha256(src) {
                fs::copy(src, &target).map_err(|e| format!("Dahili mod kopyalanamadı: {e}"))?;
            }
            wanted.insert(name.to_lowercase());
        }
    }

    // 3. Optional Modrinth mods
    let optional = resolve_modrinth(&http, selected_slugs, mc_version).await.unwrap_or_default();
    let opt_filtered: Vec<_> = optional
        .into_iter()
        .filter(|(fname, _, _)| !wanted.contains(&fname.to_lowercase()))
        .collect();
    for (fname, _, _) in &opt_filtered {
        wanted.insert(fname.to_lowercase());
    }

    // 4. Clean unauthorized / removed mods from <game>/mods
    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_lowercase();
            if !entry.path().is_file() || !wanted.contains(&fname) {
                let _ = if entry.path().is_dir() {
                    fs::remove_dir_all(entry.path())
                } else {
                    fs::remove_file(entry.path())
                };
            }
        }
    }

    // 5. Download optional mods in parallel
    let total = opt_filtered.len().max(1);
    let done = Arc::new(AtomicUsize::new(0));
    let opt_count = opt_filtered.len();
    let mut s = stream::iter(opt_filtered)
        .map(|(fname, url, size)| {
            let http = http.clone();
            let cfg = cfg.clone();
            let dir = mods_dir.clone();
            let done = Arc::clone(&done);
            let prog = Arc::clone(&progress);
            async move {
                let target = safe_join(&dir, &fname)?;
                download_file(&http, &cfg, &url, &target, None, None, if size > 0 { Some(size) } else { None }, None).await?;
                let c = done.fetch_add(1, Ordering::Relaxed) + 1;
                prog("mods", c, total);
                Ok::<(), String>(())
            }
        })
        .buffer_unordered(6);
    while let Some(res) = s.next().await {
        res?;
    }
    progress("mods", 1, 1);
    Ok((required.len() + bundled_jars.len(), opt_count))
}

pub fn list_folder_files(root: &Path, sub: &str, exts: &[&str]) -> Vec<MediaEntry> {
    let Ok(dir) = safe_join(root, sub) else { return Vec::new(); };
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new(); };
    let mut list = Vec::new();
    for e in entries.flatten() {
        let p = e.path();
        if !p.is_file() { continue; }
        let name = e.file_name().to_string_lossy().to_string();
        let lower = name.to_lowercase();
        if !exts.iter().any(|ext| lower.ends_with(ext)) { continue; }
        let size_kb = fs::metadata(&p).map(|m| (m.len() + 1023) / 1024).unwrap_or(0);
        list.push(MediaEntry {
            name,
            path: p.to_string_lossy().to_string(),
            size_kb,
        });
    }
    list.sort_by(|a, b| b.name.cmp(&a.name));
    list
}
