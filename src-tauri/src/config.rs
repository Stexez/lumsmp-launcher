use serde::Deserialize;
use std::collections::HashSet;
use std::path::PathBuf;
use url::Url;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawConfig {
    pub site_url: String,
    #[serde(default)]
    pub microsoft_client_id: String,
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub site_origin: String,
    pub site_host: String,
    pub ms_client_id: String,
    pub ms_redirect: String,
    pub allowed_hosts: HashSet<String>,
}

impl AppConfig {
    pub fn load(resource_dir: Option<PathBuf>) -> Result<Self, String> {
        let mut candidates = Vec::new();
        if let Some(dir) = resource_dir {
            candidates.push(dir.join("launcher.config.json"));
            candidates.push(dir.join("_up_").join("launcher.config.json"));
        }
        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(cwd.join("launcher.config.json"));
            candidates.push(cwd.join("..").join("launcher.config.json"));
        }

        let raw_text = candidates
            .iter()
            .find_map(|p| std::fs::read_to_string(p).ok())
            .unwrap_or_else(|| {
                r#"{"siteUrl":"https://lumcraft.com.tr","microsoftClientId":""}"#.to_string()
            });

        let raw: RawConfig =
            serde_json::from_str(&raw_text).map_err(|e| format!("launcher.config.json okunamadı: {e}"))?;
        let parsed = Url::parse(&raw.site_url).map_err(|e| format!("siteUrl geçersiz: {e}"))?;
        if parsed.scheme() != "https" {
            return Err("launcher.config.json: siteUrl https olmalı.".into());
        }
        let host = parsed
            .host_str()
            .ok_or_else(|| "siteUrl host bulunamadı.".to_string())?
            .to_lowercase();

        let mut allowed: HashSet<String> = [
            host.clone(),
            "piston-meta.mojang.com".into(),
            "piston-data.mojang.com".into(),
            "launchermeta.mojang.com".into(),
            "launcher.mojang.com".into(),
            "libraries.minecraft.net".into(),
            "resources.download.minecraft.net".into(),
            "meta.fabricmc.net".into(),
            "maven.fabricmc.net".into(),
            "login.microsoftonline.com".into(),
            "user.auth.xboxlive.com".into(),
            "xsts.auth.xboxlive.com".into(),
            "api.minecraftservices.com".into(),
            "api.modrinth.com".into(),
            "cdn.modrinth.com".into(),
        ]
        .into_iter()
        .collect();
        allowed.insert(host.clone());

        Ok(Self {
            site_origin: parsed.origin().ascii_serialization(),
            site_host: host,
            ms_client_id: raw.microsoft_client_id.trim().to_string(),
            ms_redirect: "https://login.microsoftonline.com/common/oauth2/nativeclient".to_string(),
            allowed_hosts: allowed,
        })
    }

    pub fn validate_url(&self, raw: &str) -> Result<Url, String> {
        let parsed = Url::parse(raw).map_err(|_| "Geçersiz URL.".to_string())?;
        if parsed.scheme() != "https" {
            return Err("Yalnızca HTTPS bağlantılarına izin verilir.".into());
        }
        let host = parsed.host_str().unwrap_or("").to_lowercase();
        if !self.allowed_hosts.contains(&host) {
            return Err(format!("İzin verilmeyen adres engellendi: {host}"));
        }
        Ok(parsed)
    }

    pub fn ms_configured(&self) -> bool {
        let s = &self.ms_client_id;
        s.len() == 36
            && s.chars().enumerate().all(|(i, c)| match i {
                8 | 13 | 18 | 23 => c == '-',
                _ => c.is_ascii_hexdigit(),
            })
    }
}
