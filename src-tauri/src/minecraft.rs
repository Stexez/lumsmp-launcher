use crate::config::AppConfig;
use crate::microsoft::MinecraftAuth;
use crate::site::ManifestServer;
use futures_util::stream::{self, StreamExt};
use reqwest::Client;
use serde_json::Value;
use sha1::{Digest as Sha1Digest, Sha1};
use sha2::Sha256;
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

const VERSION_MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const JAVA_RUNTIMES: &str = "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";
const FABRIC_META: &str = "https://meta.fabricmc.net/v2";

pub fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let mut out = root.to_path_buf();
    for comp in Path::new(rel).components() {
        match comp {
            Component::Normal(p) => out.push(p),
            Component::CurDir => {}
            _ => return Err(format!("Güvensiz dosya yolu engellendi: {rel}")),
        }
    }
    Ok(out)
}

pub fn file_sha1(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    Some(hex::encode(Sha1::digest(&bytes)))
}

pub fn file_sha256(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    Some(hex::encode(Sha256::digest(&bytes)))
}

pub async fn download_file(
    http: &Client,
    cfg: &AppConfig,
    url: &str,
    target: &Path,
    expected_sha1: Option<&str>,
    expected_sha256: Option<&str>,
    expected_size: Option<u64>,
    bearer: Option<&str>,
) -> Result<(), String> {
    cfg.validate_url(url)?;
    if target.is_file() {
        let size_ok = expected_size
            .map(|sz| fs::metadata(target).map(|m| m.len() == sz).unwrap_or(false))
            .unwrap_or(true);
        let hash_ok = if let Some(h256) = expected_sha256 {
            file_sha256(target).as_deref() == Some(h256)
        } else if let Some(h1) = expected_sha1 {
            file_sha1(target).as_deref() == Some(h1)
        } else {
            size_ok
        };
        if size_ok && hash_ok {
            return Ok(());
        }
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
    }
    let mut req = http.get(url);
    if let Some(tok) = bearer {
        req = req.bearer_auth(tok);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("İndirme başarısız ({url}): {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("İndirme hatası HTTP {} ({url})", resp.status().as_u16()));
    }
    let bytes = resp.bytes().await.map_err(|e| format!("Veri okunamadı: {e}"))?;
    if let Some(h256) = expected_sha256 {
        if hex::encode(Sha256::digest(&bytes)) != h256 {
            return Err(format!("SHA-256 doğrulama hatası: {}", target.display()));
        }
    }
    if let Some(h1) = expected_sha1 {
        if hex::encode(Sha1::digest(&bytes)) != h1 {
            return Err(format!("SHA-1 doğrulama hatası: {}", target.display()));
        }
    }
    let tmp = target.with_extension("part");
    fs::write(&tmp, &bytes).map_err(|e| format!("Yazma hatası: {e}"))?;
    fs::rename(&tmp, target).map_err(|e| format!("Taşıma hatası: {e}"))?;
    Ok(())
}

fn maven_path(name: &str) -> Result<String, String> {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return Err(format!("Geçersiz kütüphane adı: {name}"));
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let file = if parts.len() >= 4 {
        format!("{artifact}-{version}-{}.jar", parts[3])
    } else {
        format!("{artifact}-{version}.jar")
    };
    Ok(format!("{group}/{artifact}/{version}/{file}"))
}

fn lib_key(name: &str) -> String {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() >= 4 {
        format!("{}:{}:{}", parts[0], parts[1], parts[3])
    } else if parts.len() >= 2 {
        format!("{}:{}", parts[0], parts[1])
    } else {
        name.to_string()
    }
}

fn rule_allowed(rules: Option<&Vec<Value>>) -> bool {
    let Some(rules) = rules else { return true; };
    if rules.is_empty() { return true; }
    let mut allowed = false;
    for r in rules {
        let mut matched = true;
        if let Some(os) = r.get("os") {
            if let Some(name) = os.get("name").and_then(|v| v.as_str()) {
                if name != "windows" { matched = false; }
            }
        }
        if r.get("features").is_some() {
            matched = false;
        }
        if matched {
            allowed = r.get("action").and_then(|v| v.as_str()) == Some("allow");
        }
    }
    allowed
}

pub struct InstalledGame {
    pub id: String,
    pub main_class: String,
    pub java_path: PathBuf,
    pub client_jar: PathBuf,
    pub library_paths: Vec<PathBuf>,
    pub asset_index_id: String,
}

pub async fn install_game<F>(
    root: &Path,
    cfg: &AppConfig,
    mc_version: &str,
    fabric_loader: Option<&str>,
    on_progress: F,
) -> Result<InstalledGame, String>
where
    F: Fn(&str, usize, usize) + Send + Sync + 'static,
{
    let http = Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent("LumSMP-Launcher/2.0")
        .build()
        .map_err(|e| format!("HTTP hatası: {e}"))?;
    let progress = Arc::new(on_progress);

    // 1. Vanilla & Fabric metadata
    progress("meta", 0, 2);
    let manifest: Value = http.get(VERSION_MANIFEST).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    let entry = manifest
        .get("versions")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.iter().find(|v| v.get("id").and_then(|s| s.as_str()) == Some(mc_version)))
        .ok_or_else(|| format!("Minecraft {mc_version} sürümü bulunamadı."))?;
    let v_url = entry.get("url").and_then(|v| v.as_str()).ok_or("Sürüm URL yok.")?;
    let v_sha1 = entry.get("sha1").and_then(|v| v.as_str());
    let v_json_path = safe_join(root, &format!("versions/{mc_version}/{mc_version}.json"))?;
    download_file(&http, cfg, v_url, &v_json_path, v_sha1, None, None, None).await?;
    let vanilla: Value = serde_json::from_str(&fs::read_to_string(&v_json_path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;

    let loader_ver = match fabric_loader {
        Some(v) if !v.trim().is_empty() => v.trim().to_string(),
        _ => {
            let list: Value = http
                .get(format!("{FABRIC_META}/versions/loader/{mc_version}"))
                .send()
                .await
                .map_err(|e| e.to_string())?
                .json()
                .await
                .map_err(|e| e.to_string())?;
            list.as_array()
                .and_then(|arr| arr.iter().find(|e| e.pointer("/loader/stable").and_then(|b| b.as_bool()) == Some(true)).or_else(|| arr.first()))
                .and_then(|e| e.pointer("/loader/version").and_then(|s| s.as_str()))
                .ok_or_else(|| format!("Minecraft {mc_version} için Fabric bulunamadı."))?
                .to_string()
        }
    };
    let profile: Value = http
        .get(format!("{FABRIC_META}/versions/loader/{mc_version}/{loader_ver}/profile/json"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let main_class = profile.get("mainClass").and_then(|v| v.as_str()).ok_or("Fabric mainClass yok.")?.to_string();
    let id = format!("fabric-{mc_version}-{loader_ver}");
    progress("meta", 2, 2);

    // 2. Mojang Java Runtime (parallel 12x)
    let java_comp = vanilla.pointer("/javaVersion/component").and_then(|v| v.as_str()).unwrap_or("java-runtime-delta");
    let all_java: Value = http.get(JAVA_RUNTIMES).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    let java_manifest_url = all_java
        .pointer(&format!("/windows-x64/{java_comp}/0/manifest/url"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("Java ({java_comp}) bulunamadı."))?;
    let java_manifest: Value = http.get(java_manifest_url).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    let java_base = safe_join(root, &format!("runtime/{java_comp}"))?;
    let mut java_files = Vec::new();
    if let Some(map) = java_manifest.get("files").and_then(|v| v.as_object()) {
        for (rel, info) in map {
            let target = safe_join(&java_base, rel)?;
            if info.get("type").and_then(|v| v.as_str()) == Some("directory") {
                let _ = fs::create_dir_all(&target);
            } else if let Some(raw) = info.pointer("/downloads/raw") {
                if let Some(u) = raw.get("url").and_then(|v| v.as_str()) {
                    java_files.push((
                        target,
                        u.to_string(),
                        raw.get("sha1").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        raw.get("size").and_then(|v| v.as_u64()),
                    ));
                }
            }
        }
    }
    let j_total = java_files.len().max(1);
    let j_done = Arc::new(AtomicUsize::new(0));
    let mut j_stream = stream::iter(java_files)
        .map(|(target, url, sha1, size)| {
            let http = http.clone();
            let cfg = cfg.clone();
            let done = Arc::clone(&j_done);
            let prog = Arc::clone(&progress);
            async move {
                download_file(&http, &cfg, &url, &target, sha1.as_deref(), None, size, None).await?;
                let c = done.fetch_add(1, Ordering::Relaxed) + 1;
                prog("java", c, j_total);
                Ok::<(), String>(())
            }
        })
        .buffer_unordered(12);
    while let Some(res) = j_stream.next().await {
        res?;
    }
    let java_path = java_base.join("bin").join("javaw.exe");

    // 3. Client jar
    let client_url = vanilla.pointer("/downloads/client/url").and_then(|v| v.as_str()).ok_or("Client URL yok.")?;
    let client_sha1 = vanilla.pointer("/downloads/client/sha1").and_then(|v| v.as_str());
    let client_size = vanilla.pointer("/downloads/client/size").and_then(|v| v.as_u64());
    let client_jar = safe_join(root, &format!("versions/{mc_version}/{mc_version}.jar"))?;
    download_file(&http, cfg, client_url, &client_jar, client_sha1, None, client_size, None).await?;

    // 4. Libraries (Fabric + Vanilla, parallel 12x)
    let mut libs: HashMap<String, (String, String, Option<String>, Option<u64>)> = HashMap::new();
    if let Some(arr) = profile.get("libraries").and_then(|v| v.as_array()) {
        for lib in arr {
            if let Some(name) = lib.get("name").and_then(|v| v.as_str()) {
                let rel = maven_path(name)?;
                let base = lib.get("url").and_then(|v| v.as_str()).unwrap_or("https://maven.fabricmc.net/");
                let url = format!("{}{}", base.trim_end_matches('/'), format!("/{rel}"));
                libs.insert(
                    lib_key(name),
                    (
                        rel,
                        url,
                        lib.get("sha1").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        lib.get("size").and_then(|v| v.as_u64()),
                    ),
                );
            }
        }
    }
    if let Some(arr) = vanilla.get("libraries").and_then(|v| v.as_array()) {
        for lib in arr {
            if !rule_allowed(lib.get("rules").and_then(|v| v.as_array())) { continue; }
            let Some(name) = lib.get("name").and_then(|v| v.as_str()) else { continue; };
            let key = lib_key(name);
            if libs.contains_key(&key) { continue; }
            if let Some(art) = lib.pointer("/downloads/artifact") {
                if let (Some(p), Some(u)) = (art.get("path").and_then(|v| v.as_str()), art.get("url").and_then(|v| v.as_str())) {
                    libs.insert(
                        key,
                        (
                            p.to_string(),
                            u.to_string(),
                            art.get("sha1").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            art.get("size").and_then(|v| v.as_u64()),
                        ),
                    );
                }
            }
        }
    }
    let lib_list: Vec<_> = libs.into_values().collect();
    let mut library_paths = Vec::with_capacity(lib_list.len());
    for (rel, _, _, _) in &lib_list {
        library_paths.push(safe_join(root, &format!("libraries/{rel}"))?);
    }
    let l_total = lib_list.len().max(1);
    let l_done = Arc::new(AtomicUsize::new(0));
    let mut l_stream = stream::iter(lib_list)
        .map(|(rel, url, sha1, size)| {
            let http = http.clone();
            let cfg = cfg.clone();
            let root = root.to_path_buf();
            let done = Arc::clone(&l_done);
            let prog = Arc::clone(&progress);
            async move {
                let target = safe_join(&root, &format!("libraries/{rel}"))?;
                download_file(&http, &cfg, &url, &target, sha1.as_deref(), None, size, None).await?;
                let c = done.fetch_add(1, Ordering::Relaxed) + 1;
                prog("libraries", c, l_total);
                Ok::<(), String>(())
            }
        })
        .buffer_unordered(12);
    while let Some(res) = l_stream.next().await {
        res?;
    }

    // 5. Assets (parallel 16x)
    let asset_index_id = vanilla.pointer("/assetIndex/id").and_then(|v| v.as_str()).ok_or("Asset index yok.")?.to_string();
    let asset_url = vanilla.pointer("/assetIndex/url").and_then(|v| v.as_str()).ok_or("Asset index URL yok.")?;
    let asset_sha1 = vanilla.pointer("/assetIndex/sha1").and_then(|v| v.as_str());
    let idx_path = safe_join(root, &format!("assets/indexes/{asset_index_id}.json"))?;
    download_file(&http, cfg, asset_url, &idx_path, asset_sha1, None, None, None).await?;
    let idx: Value = serde_json::from_str(&fs::read_to_string(&idx_path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let mut assets = Vec::new();
    if let Some(objs) = idx.get("objects").and_then(|v| v.as_object()) {
        for obj in objs.values() {
            if let Some(h) = obj.get("hash").and_then(|v| v.as_str()) {
                if h.len() == 40 {
                    assets.push((h.to_string(), obj.get("size").and_then(|v| v.as_u64())));
                }
            }
        }
    }
    let a_total = assets.len().max(1);
    let a_done = Arc::new(AtomicUsize::new(0));
    let mut a_stream = stream::iter(assets)
        .map(|(hash, size)| {
            let http = http.clone();
            let cfg = cfg.clone();
            let root = root.to_path_buf();
            let done = Arc::clone(&a_done);
            let prog = Arc::clone(&progress);
            async move {
                let sub = format!("{}/{}", &hash[..2], hash);
                let target = safe_join(&root, &format!("assets/objects/{sub}"))?;
                let url = format!("https://resources.download.minecraft.net/{sub}");
                download_file(&http, &cfg, &url, &target, None, None, size, None).await?;
                let c = done.fetch_add(1, Ordering::Relaxed) + 1;
                prog("assets", c, a_total);
                Ok::<(), String>(())
            }
        })
        .buffer_unordered(16);
    while let Some(res) = a_stream.next().await {
        res?;
    }

    Ok(InstalledGame {
        id,
        main_class,
        java_path,
        client_jar,
        library_paths,
        asset_index_id,
    })
}

fn seed_options(root: &Path, profile: &str) {
    let Ok(file) = safe_join(root, "options.txt") else { return; };
    if file.exists() { return; }
    let render = if profile == "ultra_fps" { 8 } else { 10 };
    let lines = [
        "lang:tr_tr",
        "enableVsync:false",
        "maxFps:260",
        &format!("renderDistance:{render}"),
        "simulationDistance:8",
        "biomeBlendRadius:1",
        "entityShadows:false",
        "particles:1",
        "mipmapLevels:2",
        "autoJump:false",
    ];
    let _ = fs::write(file, format!("{}\n", lines.join("\n")));
}

pub fn spawn_game(
    root: &Path,
    installed: &InstalledGame,
    auth: &MinecraftAuth,
    ram_mb: u32,
    perf_mode: &str,
    profile: &str,
    server: &ManifestServer,
    has_client_mod: bool,
) -> Result<std::process::Child, String> {
    seed_options(root, profile);
    let natives_dir = safe_join(root, &format!("versions/{}/natives", installed.id))?;
    fs::create_dir_all(&natives_dir).map_err(|e| e.to_string())?;

    let mut cp_parts: Vec<String> = installed.library_paths.iter().map(|p| p.to_string_lossy().to_string()).collect();
    cp_parts.push(installed.client_jar.to_string_lossy().to_string());
    let classpath = cp_parts.join(";");

    let xms = ((ram_mb / 2 + 256) / 512 * 512).clamp(1024, ram_mb);
    let mut args = vec![
        format!("-Xmx{ram_mb}M"),
        format!("-Xms{xms}M"),
        "-XX:+UnlockExperimentalVMOptions".into(),
        "-XX:+DisableExplicitGC".into(),
        "-XX:+PerfDisableSharedMem".into(),
    ];
    if perf_mode == "zgc" {
        args.push("-XX:+UseZGC".into());
    } else {
        args.extend([
            "-XX:+UseG1GC".into(),
            "-XX:G1NewSizePercent=20".into(),
            "-XX:G1ReservePercent=20".into(),
            "-XX:MaxGCPauseMillis=50".into(),
            format!("-XX:G1HeapRegionSize={}M", if ram_mb >= 8192 { 32 } else { 16 }),
            "-XX:G1MixedGCCountTarget=4".into(),
            "-XX:+UseStringDeduplication".into(),
        ]);
    }
    if has_client_mod {
        args.push(format!("-Dlumsmp.server={}:{}", server.host, server.port));
    }
    args.push(format!("-Djava.library.path={}", natives_dir.to_string_lossy()));
    args.push("-cp".into());
    args.push(classpath);
    args.push(installed.main_class.clone());
    args.extend([
        "--username".into(), auth.name.clone(),
        "--version".into(), installed.id.clone(),
        "--gameDir".into(), root.to_string_lossy().to_string(),
        "--assetsDir".into(), safe_join(root, "assets")?.to_string_lossy().to_string(),
        "--assetIndex".into(), installed.asset_index_id.clone(),
        "--uuid".into(), auth.uuid.clone(),
        "--accessToken".into(), auth.access_token.clone(),
        "--xuid".into(), auth.xuid.clone(),
        "--userType".into(), (if auth.access_token == "0" { "legacy" } else { "msa" }).into(),
        "--versionType".into(), "release".into(),
    ]);
    if !has_client_mod {
        args.push("--quickPlayMultiplayer".into());
        args.push(format!("{}:{}", server.host, server.port));
    }

    let log_dir = safe_join(root, "logs")?;
    let _ = fs::create_dir_all(&log_dir);
    let log_file = fs::File::create(log_dir.join("launcher-game.log")).map_err(|e| e.to_string())?;
    let log_err = log_file.try_clone().map_err(|e| e.to_string())?;

    Command::new(&installed.java_path)
        .args(&args)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_err))
        .spawn()
        .map_err(|e| format!("Minecraft başlatılamadı: {e}"))
}

pub struct CrashAnalysis {
    pub hint: String,
    pub suspect_mod: Option<String>,
}

pub fn analyze_crash(root: &Path, enabled_slugs: &[String]) -> Option<CrashAnalysis> {
    let text = fs::read_to_string(root.join("logs").join("launcher-game.log")).ok()?;
    let lower = text.to_lowercase();
    let suspect = enabled_slugs.iter().find(|slug| {
        let s = slug.to_lowercase();
        let compact = s.replace('-', "");
        (lower.contains(&s) || lower.contains(&compact))
            && (lower.contains("mixin") || lower.contains("exception") || lower.contains("incompatible") || lower.contains("crash"))
    }).cloned();

    if text.contains("OutOfMemoryError") {
        return Some(CrashAnalysis {
            hint: "Oyun yetersiz RAM nedeniyle kapandı. Ayarlardan RAM miktarını artırabilirsin.".into(),
            suspect_mod: None,
        });
    }
    if text.contains("Incompatible mod set") || text.contains("ModResolutionException") || suspect.is_some() {
        let hint = match &suspect {
            Some(m) => format!("Mod hatası tespit edildi ('{m}'). Tek tıkla bu modu kapatıp tekrar deneyebilirsin."),
            None => "Mod uyumsuzluğu tespit edildi. Modlar sekmesinden son eklediğin modu kapatıp tekrar dene.".into(),
        };
        return Some(CrashAnalysis { hint, suspect_mod: suspect });
    }
    if text.contains("GLFW error") || text.contains("OpenGL") {
        return Some(CrashAnalysis {
            hint: "Ekran kartı sürücüsü (OpenGL) hatası. Ekran kartı sürücünü güncellemeyi dene.".into(),
            suspect_mod: None,
        });
    }
    None
}
