use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

// Public Discord Application ID for LumSMP Launcher Rich Presence (safe to be public)
const DISCORD_APP_ID: &str = "1352345678901234567";

pub struct RpcManager {
    client: Mutex<Option<DiscordIpcClient>>,
}

impl RpcManager {
    pub fn new() -> Self {
        Self {
            client: Mutex::new(None),
        }
    }

    pub fn set_status(&self, enabled: bool, details: &str, state: &str) {
        let mut guard = self.client.lock().unwrap();
        if !enabled {
            if let Some(mut c) = guard.take() {
                let _ = c.close();
            }
            return;
        }
        if guard.is_none() {
            if let Ok(mut c) = DiscordIpcClient::new(DISCORD_APP_ID) {
                if c.connect().is_ok() {
                    *guard = Some(c);
                }
            }
        }
        if let Some(c) = guard.as_mut() {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            let payload = activity::Activity::new()
                .details(details)
                .state(state)
                .timestamps(activity::Timestamps::new().start(now));
            if c.set_activity(payload).is_err() {
                *guard = None;
            }
        }
    }
}
