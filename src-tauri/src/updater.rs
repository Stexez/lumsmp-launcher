use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const RELEASES_API: &str = "https://api.github.com/repos/Stexez/lumsmp-launcher/releases/latest";
static CHECKING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEvent {
    pub state: String,
    pub version: Option<String>,
    pub percent: Option<u8>,
    pub message: Option<String>,
}

#[derive(Deserialize)]
struct GhRelease {
    tag_name: String,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    assets: Vec<GhAsset>,
}

#[derive(Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    size: u64,
}

fn parse_semver(raw: &str) -> Option<(u32, u32, u32)> {
    let trimmed = raw.trim().trim_start_matches(['v', 'V']);
    let core = trimmed.split('-').next().unwrap_or(trimmed);
    let mut parts = core.split('.');
    let major = parts.next()?.parse::<u32>().ok()?;
    let minor = parts.next().unwrap_or("0").parse::<u32>().ok()?;
    let patch = parts.next().unwrap_or("0").parse::<u32>().ok()?;
    Some((major, minor, patch))
}

fn emit_state(app: &AppHandle, state: &str, version: Option<String>, percent: Option<u8>, message: Option<String>) {
    let _ = app.emit(
        "update-state",
        UpdateEvent {
            state: state.to_string(),
            version,
            percent,
            message,
        },
    );
}

pub fn start_background_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Açılışın hemen ardından arayüzün oturması için kısa bekleme
        tokio::time::sleep(Duration::from_secs(2)).await;
        let _ = run_check(&app, false).await;
    });
}

pub async fn run_check(app: &AppHandle, manual: bool) -> Result<UpdateEvent, String> {
    if CHECKING.swap(true, Ordering::SeqCst) {
        return Ok(UpdateEvent {
            state: "checking".into(),
            version: None,
            percent: None,
            message: Some("Güncelleme kontrolü zaten devam ediyor.".into()),
        });
    }

    let result = check_inner(app, manual).await;
    CHECKING.store(false, Ordering::SeqCst);
    result
}

async fn check_inner(app: &AppHandle, manual: bool) -> Result<UpdateEvent, String> {
    let current_ver = env!("CARGO_PKG_VERSION");
    let current_tuple = parse_semver(current_ver).unwrap_or((2, 0, 0));

    if manual {
        emit_state(app, "checking", None, None, Some("Güncellemeler kontrol ediliyor…".into()));
    }

    let client = reqwest::Client::builder()
        .user_agent(format!("LumSMP-Launcher/{}", current_ver))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = match client.get(RELEASES_API).send().await {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            let msg = format!("Güncelleme sunucusu yanıt vermedi (HTTP {}).", r.status().as_u16());
            emit_state(app, "ready", None, None, if manual { Some(msg.clone()) } else { None });
            return Ok(UpdateEvent { state: "ready".into(), version: None, percent: None, message: Some(msg) });
        }
        Err(_) => {
            let msg = "Güncelleme kontrol edilemedi (internet bağlantısı yok).".to_string();
            emit_state(app, "ready", None, None, if manual { Some(msg.clone()) } else { None });
            return Ok(UpdateEvent { state: "ready".into(), version: None, percent: None, message: Some(msg) });
        }
    };

    let release: GhRelease = match resp.json().await {
        Ok(rel) => rel,
        Err(_) => {
            emit_state(app, "ready", None, None, None);
            return Ok(UpdateEvent {
                state: "ready".into(),
                version: None,
                percent: None,
                message: Some("Güncelleme bilgisi okunamadı.".into()),
            });
        }
    };

    if release.draft || release.prerelease {
        emit_state(app, "ready", None, None, None);
        return Ok(UpdateEvent {
            state: "ready".into(),
            version: Some(current_ver.into()),
            percent: None,
            message: Some("Launcher güncel.".into()),
        });
    }

    let remote_ver = release.tag_name.trim().trim_start_matches(['v', 'V']).to_string();
    let Some(remote_tuple) = parse_semver(&remote_ver) else {
        emit_state(app, "ready", None, None, None);
        return Ok(UpdateEvent {
            state: "ready".into(),
            version: Some(current_ver.into()),
            percent: None,
            message: Some("Launcher güncel.".into()),
        });
    };

    if remote_tuple <= current_tuple {
        let ev = UpdateEvent {
            state: "ready".into(),
            version: Some(current_ver.into()),
            percent: None,
            message: Some(format!("Launcher güncel (v{}).", current_ver)),
        };
        if manual {
            emit_state(app, "ready", ev.version.clone(), None, ev.message.clone());
        }
        return Ok(ev);
    }

    // Windows NSIS kurulum dosyasını bul
    let exe_asset = release
        .assets
        .iter()
        .find(|a| a.name.eq_ignore_ascii_case("LumSMP-Launcher-Setup.exe"))
        .or_else(|| release.assets.iter().find(|a| a.name.to_lowercase().ends_with(".exe")));

    let Some(asset) = exe_asset else {
        let msg = format!("v{} bulundu ama kurulum dosyası henüz hazır değil.", remote_ver);
        emit_state(app, "ready", Some(remote_ver), None, Some(msg.clone()));
        return Ok(UpdateEvent { state: "ready".into(), version: None, percent: None, message: Some(msg) });
    };

    // İsteğe bağlı sha256.txt doğrulaması
    let mut expected_sha256: Option<String> = None;
    if let Some(sha_asset) = release.assets.iter().find(|a| a.name.eq_ignore_ascii_case("sha256.txt")) {
        if let Ok(resp) = client.get(&sha_asset.browser_download_url).send().await {
            if resp.status().is_success() {
                if let Ok(txt) = resp.text().await {
                    expected_sha256 = txt
                        .split_whitespace()
                        .next()
                        .map(|s| s.trim().to_lowercase())
                        .filter(|s| s.len() == 64);
                }
            }
        }
    }

    emit_state(
        app,
        "downloading",
        Some(remote_ver.clone()),
        Some(0),
        Some(format!("Yeni sürüm indiriliyor (v{})…", remote_ver)),
    );

    let dl_client = reqwest::Client::builder()
        .user_agent(format!("LumSMP-Launcher/{}", current_ver))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let dl_resp = dl_client
        .get(&asset.browser_download_url)
        .send()
        .await
        .map_err(|e| format!("Güncelleme indirilemedi: {}", e))?;

    if !dl_resp.status().is_success() {
        return Err(format!("Güncelleme indirilemedi (HTTP {}).", dl_resp.status().as_u16()));
    }

    let total = dl_resp.content_length().unwrap_or(asset.size);
    let temp_path = std::env::temp_dir().join(format!("LumSMP-Launcher-Update-{}.exe", remote_ver));
    let mut file = std::fs::File::create(&temp_path).map_err(|e| format!("Geçici dosya açılamadı: {}", e))?;

    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut last_pct: u8 = 0;
    let mut stream = dl_resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("İndirme kesildi: {}", e))?;
        file.write_all(&bytes).map_err(|e| format!("Yazma hatası: {}", e))?;
        hasher.update(&bytes);
        downloaded += bytes.len() as u64;
        if total > 0 {
            let pct = ((downloaded.saturating_mul(100)) / total).min(100) as u8;
            if pct >= last_pct.saturating_add(3) || pct == 100 {
                last_pct = pct;
                emit_state(
                    app,
                    "downloading",
                    Some(remote_ver.clone()),
                    Some(pct),
                    Some(format!("Yeni sürüm indiriliyor (v{}) — %{}", remote_ver, pct)),
                );
            }
        }
    }
    let _ = file.flush();
    drop(file);

    if let Some(expected) = expected_sha256 {
        let actual = hex::encode(hasher.finalize());
        if actual != expected {
            let _ = std::fs::remove_file(&temp_path);
            let msg = "Güncelleme doğrulaması (SHA-256) başarısız oldu.".to_string();
            emit_state(app, "ready", None, None, Some(msg.clone()));
            return Err(msg);
        }
    }

    emit_state(
        app,
        "installing",
        Some(remote_ver.clone()),
        Some(100),
        Some(format!("v{} kuruluyor, launcher yeniden başlatılıyor…", remote_ver)),
    );

    tokio::time::sleep(Duration::from_millis(1200)).await;

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let current_exe = std::env::current_exe()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let installer_str = temp_path.to_string_lossy().to_string();
        let helper_cmd = std::env::temp_dir().join("lumsmp-update-relaunch.cmd");
        let script = format!(
            "@echo off\r\n\
             timeout /t 2 /nobreak >nul\r\n\
             start /wait \"\" \"{installer_str}\" /S\r\n\
             timeout /t 1 /nobreak >nul\r\n\
             if exist \"{current_exe}\" start \"\" \"{current_exe}\"\r\n\
             del /q \"{installer_str}\" >nul 2>&1\r\n\
             del /q \"%~f0\" >nul 2>&1\r\n"
        );
        if std::fs::write(&helper_cmd, script).is_ok() {
            Command::new("cmd.exe")
                .args(["/C", &helper_cmd.to_string_lossy()])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Güncelleme yardımcısı başlatılamadı: {}", e))?;
        } else {
            Command::new(&temp_path)
                .arg("/S")
                .spawn()
                .map_err(|e| format!("Güncelleme kurulumu başlatılamadı: {}", e))?;
        }
    }

    #[cfg(not(windows))]
    {
        Command::new(&temp_path)
            .arg("/S")
            .spawn()
            .map_err(|e| format!("Güncelleme kurulumu başlatılamadı: {}", e))?;
    }

    app.exit(0);
    Ok(UpdateEvent {
        state: "installing".into(),
        version: Some(remote_ver),
        percent: Some(100),
        message: Some("Kurulum başlatıldı.".into()),
    })
}
