use crate::config::AppConfig;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::net::{IpAddr, Ipv4Addr};
use std::time::Duration;

pub struct SiteClient {
    http: Client,
    origin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteMod {
    pub name: String,
    pub sha256: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestServer {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LauncherManifest {
    pub minecraft: String,
    #[serde(default, alias = "fabricLoader")]
    pub fabric_loader: Option<String>,
    pub server: ManifestServer,
    #[serde(default, alias = "news")]
    pub announcement: Option<String>,
    #[serde(default)]
    pub mods: Vec<SiteMod>,
}

impl SiteClient {
    pub fn new(cfg: &AppConfig) -> Result<Self, String> {
        // Force IPv4 so the IP recorded for the LuminLauncherGate join ticket matches the Minecraft server IPv4.
        let http = Client::builder()
            .local_address(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
            .timeout(Duration::from_secs(20))
            .user_agent("LumSMP-Launcher/2.0")
            .build()
            .map_err(|e| format!("HTTP istemcisi kurulamadı: {e}"))?;
        Ok(Self {
            http,
            origin: cfg.site_origin.clone(),
        })
    }

    async fn call(&self, path: &str, method: &str, body: Option<Value>, token: Option<&str>) -> Result<Value, String> {
        let url = format!("{}{}", self.origin, path);
        let mut req = match method {
            "POST" => self.http.post(&url),
            _ => self.http.get(&url),
        }
        .header("Accept", "application/json");
        if let Some(t) = token {
            req = req.bearer_auth(t);
        }
        if let Some(b) = body {
            req = req.json(&b);
        }
        let resp = req
            .send()
            .await
            .map_err(|_| "lumcraft.com.tr adresine ulaşılamadı. İnternet bağlantını kontrol et.".to_string())?;
        let status = resp.status().as_u16();
        let data: Value = resp.json().await.unwrap_or_else(|_| json!({}));
        if !(200..300).contains(&status) {
            let msg = data
                .get("error")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("Site hatası (HTTP {status})."));
            return Err(msg);
        }
        Ok(data)
    }

    pub async fn login(&self, username: &str, password: &str) -> Result<Value, String> {
        self.call(
            "/api/launcher/login",
            "POST",
            Some(json!({ "username": username, "password": password })),
            None,
        )
        .await
    }

    pub async fn me(&self, token: &str) -> Result<Value, String> {
        self.call("/api/launcher/me", "GET", None, Some(token)).await
    }

    pub async fn logout(&self, token: &str) -> Result<Value, String> {
        self.call("/api/launcher/logout", "POST", Some(json!({})), Some(token)).await
    }

    pub async fn manifest(&self, token: &str) -> Result<LauncherManifest, String> {
        let val = self.call("/api/launcher/manifest", "GET", None, Some(token)).await?;
        serde_json::from_value(val).map_err(|e| format!("Manifest okunamadı: {e}"))
    }

    pub async fn play_ticket(&self, token: &str, minecraft_name: &str) -> Result<Value, String> {
        self.call(
            "/api/launcher/play",
            "POST",
            Some(json!({ "minecraft_name": minecraft_name })),
            Some(token),
        )
        .await
    }

    pub async fn server_status(&self) -> Result<Value, String> {
        self.call("/api/public/server-status", "GET", None, None).await
    }

    pub async fn public_news(&self) -> Option<String> {
        let val = self.call("/api/public/launcher-news", "GET", None, None).await.ok()?;
        val.get("news")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    }

    pub async fn cloud_get(&self, token: &str) -> Result<Value, String> {
        self.call("/api/launcher/cloud-settings", "GET", None, Some(token)).await
    }

    pub async fn cloud_save(&self, token: &str, payload: Value) -> Result<Value, String> {
        self.call(
            "/api/launcher/cloud-settings",
            "POST",
            Some(json!({ "payload": payload })),
            Some(token),
        )
        .await
    }
}
