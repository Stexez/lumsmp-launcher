use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use sysinfo::System;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedAccount {
    pub username: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Secrets {
    pub site_token: Option<String>,
    #[serde(default)]
    pub site_user: Option<String>,
    #[serde(default)]
    pub saved_accounts: Vec<SavedAccount>,
    pub ms_refresh_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub ram_mb: u32,
    pub ram_auto: bool,
    pub perf_mode: String, // "auto" | "g1" | "zgc"
    pub profile: String,   // "balanced" | "ultra_fps" | "shader"
    pub mods: Vec<String>,
    pub mods_setup: bool,
    pub minimize_on_launch: bool,
    #[serde(default = "default_true")]
    pub discord_rpc: bool,
}

fn default_true() -> bool { true }

impl Default for Settings {
    fn default() -> Self {
        let mods = default_mods();
        let ram = recommended_ram_mb(mods.len());
        Self {
            ram_mb: ram,
            ram_auto: true,
            perf_mode: "auto".into(),
            profile: "balanced".into(),
            mods,
            mods_setup: false,
            minimize_on_launch: true,
            discord_rpc: true,
        }
    }
}

pub fn default_mods() -> Vec<String> {
    vec![
        "sodium".into(),
        "lithium".into(),
        "ferrite-core".into(),
        "entityculling".into(),
        "immediatelyfast".into(),
        "krypton".into(),
        "modmenu".into(),
    ]
}

pub fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("LumSMP Launcher")
}

pub fn game_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".lumsmp")
}

pub fn total_ram_mb() -> u32 {
    let mut sys = System::new();
    sys.refresh_memory();
    (sys.total_memory() / (1024 * 1024)) as u32
}

pub fn max_ram_mb() -> u32 {
    let total = total_ram_mb();
    total.saturating_sub(2048).clamp(2048, 16384)
}

pub fn recommended_ram_mb(mod_count: usize) -> u32 {
    let total = total_ram_mb();
    let mut mb = 3072u32;
    if total > 7 * 1024 { mb = 4096; }
    if total > 12 * 1024 { mb = 5120; }
    if total > 15 * 1024 { mb = 6144; }
    if total > 28 * 1024 { mb = 8192; }
    if mod_count >= 35 { mb += 1024; }
    let cap = max_ram_mb();
    mb.min(cap).min(8192).max(2048)
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| format!("Dosya yazılamadı: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("Dosya kaydedilemedi: {e}"))?;
    Ok(())
}

pub fn read_settings() -> Settings {
    let path = app_data_dir().join("settings.json");
    let mut s: Settings = fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    sanitize_settings(&mut s);
    s
}

pub fn write_settings(mut s: Settings) -> Result<Settings, String> {
    sanitize_settings(&mut s);
    let path = app_data_dir().join("settings.json");
    let json = serde_json::to_vec_pretty(&s).map_err(|e| e.to_string())?;
    write_atomic(&path, &json)?;
    Ok(s)
}

fn sanitize_settings(s: &mut Settings) {
    if !matches!(s.perf_mode.as_str(), "auto" | "g1" | "zgc") {
        s.perf_mode = "auto".into();
    }
    if !matches!(s.profile.as_str(), "balanced" | "ultra_fps" | "shader") {
        s.profile = "balanced".into();
    }
    let ram = if s.ram_auto {
        recommended_ram_mb(s.mods.len())
    } else {
        s.ram_mb
    };
    let rounded = ((ram + 256) / 512) * 512;
    s.ram_mb = rounded.clamp(2048, max_ram_mb());
}

// ------------------------------------------------------------------ Windows DPAPI Secrets
#[cfg(windows)]
fn dpapi_protect(plain: &[u8]) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::Security::Cryptography::{CryptProtectData, CRYPT_INTEGER_BLOB};
    use windows_sys::Win32::Foundation::LocalFree;
    unsafe {
        let input = CRYPT_INTEGER_BLOB {
            cbData: plain.len() as u32,
            pbData: plain.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = CryptProtectData(
            &input,
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            0,
            &mut output,
        );
        if ok == 0 {
            return Err("Windows DPAPI şifreleme başarısız.".into());
        }
        let slice = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
        let vec = slice.to_vec();
        LocalFree(output.pbData as _);
        Ok(vec)
    }
}

#[cfg(windows)]
fn dpapi_unprotect(cipher: &[u8]) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};
    use windows_sys::Win32::Foundation::LocalFree;
    unsafe {
        let input = CRYPT_INTEGER_BLOB {
            cbData: cipher.len() as u32,
            pbData: cipher.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = CryptUnprotectData(
            &input,
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            0,
            &mut output,
        );
        if ok == 0 {
            return Err("Windows DPAPI çözme başarısız.".into());
        }
        let slice = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
        let vec = slice.to_vec();
        LocalFree(output.pbData as _);
        Ok(vec)
    }
}

#[cfg(not(windows))]
fn dpapi_protect(plain: &[u8]) -> Result<Vec<u8>, String> { Ok(plain.to_vec()) }
#[cfg(not(windows))]
fn dpapi_unprotect(cipher: &[u8]) -> Result<Vec<u8>, String> { Ok(cipher.to_vec()) }

pub fn read_secrets() -> Secrets {
    let path = app_data_dir().join("secure_v2.bin");
    let Ok(raw) = fs::read(&path) else { return Secrets::default(); };
    let Ok(plain) = dpapi_unprotect(&raw) else { return Secrets::default(); };
    serde_json::from_slice(&plain).unwrap_or_default()
}

pub fn write_secrets(s: &Secrets) -> Result<(), String> {
    let path = app_data_dir().join("secure_v2.bin");
    let json = serde_json::to_vec(s).map_err(|e| e.to_string())?;
    let cipher = dpapi_protect(&json)?;
    write_atomic(&path, &cipher)
}
