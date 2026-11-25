mod config;
mod microsoft;
mod minecraft;
mod mods;
mod rpc;
mod site;
mod store;
mod updater;

use config::AppConfig;
use microsoft::MinecraftAuth;
use rpc::RpcManager;
use serde::Serialize;
use serde_json::{json, Value};
use site::SiteClient;
use std::path::PathBuf;
use std::sync::Mutex;
use store::{read_secrets, read_settings, write_secrets, write_settings, Settings};
use tauri::{AppHandle, Emitter, Manager, State};

struct AppState {
    cfg: AppConfig,
    mc_auth: Mutex<Option<MinecraftAuth>>,
    playing: Mutex<bool>,
    rpc: RpcManager,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapPayload {
    version: String,
    site_origin: String,
    ms_configured: bool,
    site_user: Option<Value>,
    mc_profile: Option<Value>,
    announcement: Option<String>,
    settings: Settings,
    max_ram_mb: u32,
    recommended_ram_mb: u32,
    playing: bool,
}

fn bundled_jars(app: &AppHandle) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut dirs_to_check = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        dirs_to_check.push(res.join("bundled"));
        dirs_to_check.push(res.join("src").join("bundled"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        dirs_to_check.push(cwd.join("src").join("bundled"));
        dirs_to_check.push(cwd.join("..").join("src").join("bundled"));
    }
    for dir in dirs_to_check {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                let p = e.path();
                if p.is_file() && p.extension().and_then(|s| s.to_str()) == Some("jar") {
                    out.push(p);
                }
            }
            if !out.is_empty() { break; }
        }
    }
    out
}

#[tauri::command]
async fn bootstrap(state: State<'_, AppState>) -> Result<BootstrapPayload, String> {
    let secrets = read_secrets();
    let settings = read_settings();
    let client = SiteClient::new(&state.cfg)?;
    let mut announcement = None;
    let site_user = match secrets.site_token.as_deref() {
        Some(tok) if !tok.is_empty() => {
            if let Ok(m) = client.manifest(tok).await {
                announcement = m.announcement;
            }
            match client.me(tok).await {
                Ok(me) => {
                    if let Some(u) = me.get("username").and_then(|v| v.as_str()) {
                        if secrets.site_user.as_deref() != Some(u) {
                            let mut next = secrets.clone();
                            next.site_user = Some(u.to_string());
                            let _ = write_secrets(&next);
                        }
                    }
                    Some(me)
                }
                Err(_) => secrets
                    .site_user
                    .as_ref()
                    .filter(|u| !u.is_empty())
                    .map(|u| json!({ "username": u })),
            }
        }
        _ => None,
    };
    let mut mc_profile = None;
    if let Some(ref rt) = secrets.ms_refresh_token {
        if !rt.is_empty() {
            if let Ok(res) = microsoft::refresh(&state.cfg, rt).await {
                let mut next = secrets.clone();
                next.ms_refresh_token = Some(res.refresh_token);
                let _ = write_secrets(&next);
                mc_profile = Some(json!({ "name": res.minecraft.name, "uuid": res.minecraft.uuid }));
                *state.mc_auth.lock().unwrap() = Some(res.minecraft);
            }
        }
    }
    let playing = *state.playing.lock().unwrap();
    state.rpc.set_status(
        settings.discord_rpc,
        if playing { "LumSMP Oynuyor" } else { "LumSMP Launcher" },
        if playing { "lumcraft.com.tr" } else { "Oyuna hazırlanıyor" },
    );
    Ok(BootstrapPayload {
        version: env!("CARGO_PKG_VERSION").into(),
        site_origin: state.cfg.site_origin.clone(),
        ms_configured: state.cfg.ms_configured(),
        site_user,
        mc_profile,
        announcement,
        max_ram_mb: store::max_ram_mb(),
        recommended_ram_mb: store::recommended_ram_mb(settings.mods.len()),
        settings,
        playing,
    })
}

#[tauri::command]
async fn site_login(state: State<'_, AppState>, username: String, password: String) -> Result<Value, String> {
    let trimmed = username.trim();
    if trimmed.len() < 3 || trimmed.len() > 16 || !trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("Kullanıcı adı 3-16 karakter; yalnızca harf, rakam ve _ olabilir.".into());
    }
    if password.is_empty() {
        return Err("Parolanı yaz.".into());
    }
    let client = SiteClient::new(&state.cfg)?;
    let res = client.login(trimmed, &password).await?;
    let token = res.get("token").and_then(|v| v.as_str()).ok_or("Oturum anahtarı alınamadı.")?;
    let account_name = res
        .pointer("/account/username")
        .and_then(|v| v.as_str())
        .unwrap_or(trimmed)
        .to_string();
    let mut sec = read_secrets();
    sec.site_token = Some(token.to_string());
    sec.site_user = Some(account_name);
    write_secrets(&sec)?;
    Ok(res)
}

#[tauri::command]
async fn site_logout(state: State<'_, AppState>) -> Result<(), String> {
    let mut sec = read_secrets();
    if let Some(tok) = sec.site_token.take() {
        if let Ok(client) = SiteClient::new(&state.cfg) {
            let _ = client.logout(&tok).await;
        }
    }
    sec.site_user = None;
    write_secrets(&sec)
}

#[tauri::command]
async fn ms_login(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    let res = microsoft::login(&app, &state.cfg).await?;
    let mut sec = read_secrets();
    sec.ms_refresh_token = Some(res.refresh_token);
    write_secrets(&sec)?;
    let profile = json!({ "name": res.minecraft.name, "uuid": res.minecraft.uuid });
    *state.mc_auth.lock().unwrap() = Some(res.minecraft);
    Ok(profile)
}

#[tauri::command]
async fn ms_logout(state: State<'_, AppState>) -> Result<(), String> {
    let mut sec = read_secrets();
    sec.ms_refresh_token = None;
    write_secrets(&sec)?;
    *state.mc_auth.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
async fn get_server_status(state: State<'_, AppState>) -> Result<Value, String> {
    let client = SiteClient::new(&state.cfg)?;
    client.server_status().await
}

#[tauri::command]
fn get_catalog() -> Vec<mods::CatalogMod> {
    mods::catalog()
}

#[tauri::command]
fn get_shader_catalog() -> Vec<mods::ShaderItem> {
    mods::shader_catalog()
}

#[tauri::command]
async fn install_shader(state: State<'_, AppState>, slug: String) -> Result<String, String> {
    mods::install_shader(&store::game_dir(), &state.cfg, &slug).await
}

#[tauri::command]
fn read_screenshot_data(name: String) -> Result<String, String> {
    mods::read_screenshot_data_url(&store::game_dir(), &name)
}

#[tauri::command]
fn delete_media(sub: String, name: String) -> Result<(), String> {
    mods::delete_media_file(&store::game_dir(), &sub, &name)
}

#[tauri::command]
fn read_game_log() -> String {
    mods::read_game_log_tail(&store::game_dir())
}

#[tauri::command]
fn save_settings(state: State<'_, AppState>, next: Settings) -> Result<Settings, String> {
    let saved = write_settings(next)?;
    let playing = *state.playing.lock().unwrap();
    state.rpc.set_status(
        saved.discord_rpc,
        if playing { "LumSMP Oynuyor" } else { "LumSMP Launcher" },
        if playing { "lumcraft.com.tr" } else { "Oyuna hazırlanıyor" },
    );
    Ok(saved)
}

#[tauri::command]
fn list_screenshots() -> Vec<mods::MediaEntry> {
    mods::list_folder_files(&store::game_dir(), "screenshots", &[".png", ".jpg", ".jpeg"])
}

#[tauri::command]
fn list_shaders() -> Vec<mods::MediaEntry> {
    mods::list_folder_files(&store::game_dir(), "shaderpacks", &[".zip"])
}

#[tauri::command]
fn open_folder(sub: String) -> Result<(), String> {
    let target = if sub.is_empty() {
        store::game_dir()
    } else {
        minecraft::safe_join(&store::game_dir(), &sub)?
    };
    let _ = std::fs::create_dir_all(&target);
    #[cfg(windows)]
    {
        std::process::Command::new("explorer").arg(&target).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn launch_game(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    {
        let mut p = state.playing.lock().unwrap();
        if *p {
            return Err("Oyun zaten çalışıyor.".into());
        }
        *p = true;
    }

    let result: Result<Value, String> = async {
        let secrets = read_secrets();
        let site_token = secrets.site_token.clone().ok_or("Önce lumcraft.com.tr hesabınla giriş yap.")?;
        let client = SiteClient::new(&state.cfg)?;
        let site_username = match secrets.site_user.clone().filter(|u| !u.is_empty()) {
            Some(u) => u,
            None => client
                .me(&site_token)
                .await?
                .get("username")
                .and_then(|v| v.as_str())
                .ok_or("Site kullanıcı adı okunamadı. Tekrar giriş yap.")?
                .to_string(),
        };

        let mc_auth = match state.mc_auth.lock().unwrap().clone() {
            Some(ms) => {
                if !ms.name.eq_ignore_ascii_case(&site_username) {
                    return Err(format!(
                        "LumSMP hesabın '{}', Microsoft adın '{}'. İkisi aynı olmalı.",
                        site_username, ms.name
                    ));
                }
                ms
            }
            None => microsoft::offline_auth(&site_username),
        };

        let manifest = client.manifest(&site_token).await?;
        let root = store::game_dir();
        let settings = read_settings();

        let app_prog = app.clone();
        let emit_progress = move |stage: &str, done: usize, total: usize| {
            let _ = app_prog.emit(
                "launch-progress",
                json!({ "stage": stage, "done": done, "total": total }),
            );
        };

        let installed = minecraft::install_game(
            &root,
            &state.cfg,
            &manifest.minecraft,
            manifest.fabric_loader.as_deref(),
            emit_progress.clone(),
        )
        .await?;

        let bundled = bundled_jars(&app);
        let has_client_mod = !bundled.is_empty();
        mods::sync_mods(
            &root,
            &state.cfg,
            &manifest.mods,
            &bundled,
            &settings.mods,
            &manifest.minecraft,
            &site_token,
            emit_progress,
        )
        .await?;

        // Issue single-use LuminLauncherGate join ticket right before launching
        client.play_ticket(&site_token, &mc_auth.name).await?;

        let mut child = minecraft::spawn_game(
            &root,
            &installed,
            &mc_auth,
            settings.ram_mb,
            &settings.perf_mode,
            &settings.profile,
            &manifest.server,
            has_client_mod,
        )?;

        state.rpc.set_status(
            settings.discord_rpc,
            &format!("LumSMP Oynuyor · {}", mc_auth.name),
            "lumcraft.com.tr",
        );

        if settings.minimize_on_launch {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.minimize();
            }
        }

        let app_exit = app.clone();
        let root_exit = root.clone();
        let rpc_enabled = settings.discord_rpc;
        let running_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true));
        let hb_flag = std::sync::Arc::clone(&running_flag);
        let hb_cfg = state.cfg.clone();
        let hb_token = site_token.clone();
        let hb_name = mc_auth.name.clone();
        tauri::async_runtime::spawn(async move {
            while hb_flag.load(std::sync::atomic::Ordering::Relaxed) {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                if !hb_flag.load(std::sync::atomic::Ordering::Relaxed) {
                    break;
                }
                if let Ok(c) = SiteClient::new(&hb_cfg) {
                    let _ = c.play_ticket(&hb_token, &hb_name).await;
                }
            }
        });
        std::thread::spawn(move || {
            let code = child.wait().ok().and_then(|s| s.code()).unwrap_or(-1);
            running_flag.store(false, std::sync::atomic::Ordering::Relaxed);
            let crash_hint = if code != 0 { minecraft::analyze_crash(&root_exit) } else { None };
            if let Some(st) = app_exit.try_state::<AppState>() {
                *st.playing.lock().unwrap() = false;
                st.rpc.set_status(rpc_enabled, "LumSMP Launcher", "Oyuna hazırlanıyor");
            }
            if let Some(w) = app_exit.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            let _ = app_exit.emit("game-exit", json!({ "code": code, "crashHint": crash_hint }));
        });

        Ok(json!({ "started": true, "server": format!("{}:{}", manifest.server.host, manifest.server.port) }))
    }
    .await;

    if result.is_err() {
        *state.playing.lock().unwrap() = false;
    }
    result
}

#[tauri::command]
async fn check_for_updates(app: AppHandle) -> Result<updater::UpdateEvent, String> {
    updater::run_check(&app, true).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let res_dir = app.path().resource_dir().ok();
            let cfg = AppConfig::load(res_dir).expect("launcher.config.json yüklenemedi");
            app.manage(AppState {
                cfg,
                mc_auth: Mutex::new(None),
                playing: Mutex::new(false),
                rpc: RpcManager::new(),
            });
            updater::start_background_check(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            check_for_updates,
            site_login,
            site_logout,
            ms_login,
            ms_logout,
            get_server_status,
            get_catalog,
            get_shader_catalog,
            install_shader,
            read_screenshot_data,
            delete_media,
            read_game_log,
            save_settings,
            list_screenshots,
            list_shaders,
            open_folder,
            launch_game
        ])
        .run(tauri::generate_context!())
        .expect("LumSMP Launcher başlatılamadı");
}
