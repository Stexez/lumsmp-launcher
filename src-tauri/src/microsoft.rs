use crate::config::AppConfig;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;
use url::Url;

const AUTHORIZE: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const SCOPE: &str = "XboxLive.signin offline_access";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftAuth {
    pub access_token: String,
    pub expires_at: u64,
    pub uuid: String,
    pub name: String,
    pub xuid: String,
}

#[derive(Debug, Clone)]
pub struct MsLoginResult {
    pub refresh_token: String,
    pub minecraft: MinecraftAuth,
}

/// Offline / site-account authentication (exact Minecraft OfflinePlayer:<name> v3 UUID).
pub fn offline_auth(username: &str) -> MinecraftAuth {
    use md5::{Digest as Md5Digest, Md5};
    let mut hash = Md5::digest(format!("OfflinePlayer:{username}").as_bytes());
    hash[6] = (hash[6] & 0x0f) | 0x30;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    MinecraftAuth {
        access_token: "0".into(),
        expires_at: u64::MAX,
        uuid: hex::encode(hash),
        name: username.to_string(),
        xuid: "0".into(),
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn random_b64url(len: usize) -> String {
    let mut buf = vec![0u8; len];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("LumSMP-Launcher/2.0")
        .build()
        .map_err(|e| format!("HTTP hatası: {e}"))
}

async fn interactive_code(app: &AppHandle, cfg: &AppConfig) -> Result<(String, String), String> {
    let verifier = random_b64url(48);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_b64url(16);

    let mut auth_url = Url::parse(AUTHORIZE).map_err(|e| e.to_string())?;
    auth_url
        .query_pairs_mut()
        .append_pair("client_id", &cfg.ms_client_id)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", &cfg.ms_redirect)
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state)
        .append_pair("prompt", "select_account");

    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    let tx_nav = Arc::new(Mutex::new(Some(tx)));
    let tx_close = Arc::clone(&tx_nav);
    let redirect_prefix = cfg.ms_redirect.clone();
    let expected_state = state.clone();
    let label = format!("ms-login-{}", random_b64url(6));
    let app_clone = app.clone();
    let label_clone = label.clone();

    let win = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(auth_url))
        .title("Microsoft ile Giriş · LumSMP")
        .inner_size(520.0, 680.0)
        .center()
        .on_navigation(move |target| {
            let s = target.as_str();
            if s.starts_with(&redirect_prefix) {
                let res = (|| {
                    let params: std::collections::HashMap<_, _> = target.query_pairs().into_owned().collect();
                    if params.get("state").map(|v| v.as_str()) != Some(expected_state.as_str()) {
                        return Err("Microsoft girişi doğrulanamadı (state).".into());
                    }
                    if let Some(err) = params.get("error") {
                        return Err(params
                            .get("error_description")
                            .cloned()
                            .unwrap_or_else(|| format!("Microsoft girişi iptal edildi ({err}).")));
                    }
                    params
                        .get("code")
                        .cloned()
                        .ok_or_else(|| "Microsoft giriş kodu alınamadı.".to_string())
                })();
                if let Some(sender) = tx_nav.lock().unwrap().take() {
                    let _ = sender.send(res);
                }
                if let Some(w) = app_clone.get_webview_window(&label_clone) {
                    let _ = w.destroy();
                }
                return false;
            }
            true
        })
        .build()
        .map_err(|e| format!("Microsoft giriş penceresi açılamadı: {e}"))?;

    win.on_window_event(move |ev| {
        if matches!(ev, tauri::WindowEvent::Destroyed | tauri::WindowEvent::CloseRequested { .. }) {
            if let Some(sender) = tx_close.lock().unwrap().take() {
                let _ = sender.send(Err("Microsoft girişi kapatıldı.".into()));
            }
        }
    });

    let code = rx
        .await
        .map_err(|_| "Microsoft girişi tamamlanamadı.".to_string())??;
    Ok((code, verifier))
}

async fn minecraft_from_ms(http: &Client, ms_access_token: &str) -> Result<MinecraftAuth, String> {
    let xbl: Value = http
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={ms_access_token}")
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }))
        .send()
        .await
        .map_err(|e| format!("Xbox Live bağlantısı başarısız: {e}"))?
        .json()
        .await
        .map_err(|_| "Xbox Live yanıtı okunamadı.".to_string())?;

    let xbl_token = xbl
        .get("Token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Xbox Live girişi başarısız.".to_string())?;
    let uhs = xbl
        .pointer("/DisplayClaims/xui/0/uhs")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Xbox UHS alınamadı.".to_string())?;

    let xsts_resp = http
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .json(&json!({
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbl_token]
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .send()
        .await
        .map_err(|e| format!("XSTS bağlantısı başarısız: {e}"))?;
    let xsts_status = xsts_resp.status().as_u16();
    let xsts: Value = xsts_resp.json().await.unwrap_or_else(|_| json!({}));
    if xsts_status != 200 {
        let err_code = xsts.get("XErr").and_then(|v| v.as_u64()).unwrap_or(0);
        let msg = match err_code {
            2148916233 => "Bu Microsoft hesabının Xbox profili yok. xbox.com'a bir kez giriş yapıp profil oluştur.",
            2148916235 => "Xbox Live bu ülkede kullanılamıyor.",
            2148916238 => "Bu bir çocuk hesabı; bir aileye eklenmesi gerekiyor.",
            _ => "Xbox (XSTS) doğrulaması başarısız.",
        };
        return Err(msg.into());
    }
    let xsts_token = xsts
        .get("Token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "XSTS token alınamadı.".to_string())?;

    let mc_resp = http
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&json!({ "identityToken": format!("XBL3.0 x={uhs};{xsts_token}") }))
        .send()
        .await
        .map_err(|e| format!("Minecraft servisine bağlanılamadı: {e}"))?;
    let mc_status = mc_resp.status().as_u16();
    let mc: Value = mc_resp.json().await.unwrap_or_else(|_| json!({}));
    if mc_status == 403 {
        return Err("Bu launcher'ın Microsoft uygulaması henüz Mojang tarafından onaylanmadı.".into());
    }
    let mc_token = mc
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Minecraft girişi başarısız.".to_string())?;
    let expires_in = mc.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(3600);

    let prof_resp = http
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(mc_token)
        .send()
        .await
        .map_err(|e| format!("Minecraft profili alınamadı: {e}"))?;
    if prof_resp.status().as_u16() == 404 {
        return Err("Bu Microsoft hesabında Minecraft: Java Edition yok.".into());
    }
    if !prof_resp.status().is_success() {
        return Err("Minecraft profili alınamadı.".into());
    }
    let prof: Value = prof_resp.json().await.map_err(|_| "Profil okunamadı.".to_string())?;
    let uuid = prof
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Minecraft UUID geçersiz.".to_string())?
        .to_lowercase();
    let name = prof
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Minecraft adı geçersiz.".to_string())?
        .to_string();

    Ok(MinecraftAuth {
        access_token: mc_token.to_string(),
        expires_at: now_ms() + expires_in.saturating_sub(60) * 1000,
        uuid,
        name,
        xuid: "0".into(),
    })
}

pub async fn login(app: &AppHandle, cfg: &AppConfig) -> Result<MsLoginResult, String> {
    if !cfg.ms_configured() {
        return Err("Microsoft girişi henüz yapılandırılmadı (launcher.config.json → microsoftClientId).".into());
    }
    let (code, verifier) = interactive_code(app, cfg).await?;
    let http = http_client()?;
    let resp = http
        .post(TOKEN)
        .form(&[
            ("client_id", cfg.ms_client_id.as_str()),
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", cfg.ms_redirect.as_str()),
            ("code_verifier", verifier.as_str()),
            ("scope", SCOPE),
        ])
        .send()
        .await
        .map_err(|e| format!("Microsoft token alınamadı: {e}"))?;
    let data: Value = resp.json().await.unwrap_or_else(|_| json!({}));
    let ms_access = data
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Microsoft erişim anahtarı alınamadı.".to_string())?;
    let refresh_token = data
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let minecraft = minecraft_from_ms(&http, ms_access).await?;
    Ok(MsLoginResult { refresh_token, minecraft })
}

pub async fn refresh(cfg: &AppConfig, refresh_token: &str) -> Result<MsLoginResult, String> {
    if !cfg.ms_configured() {
        return Err("Microsoft girişi yapılandırılmadı.".into());
    }
    let http = http_client()?;
    let resp = http
        .post(TOKEN)
        .form(&[
            ("client_id", cfg.ms_client_id.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("scope", SCOPE),
        ])
        .send()
        .await
        .map_err(|e| format!("Microsoft yenileme hatası: {e}"))?;
    let data: Value = resp.json().await.unwrap_or_else(|_| json!({}));
    let ms_access = data
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Microsoft oturumunun süresi doldu, yeniden bağlan.".to_string())?;
    let next_refresh = data
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .unwrap_or(refresh_token)
        .to_string();
    let minecraft = minecraft_from_ms(&http, ms_access).await?;
    Ok(MsLoginResult { refresh_token: next_refresh, minecraft })
}
