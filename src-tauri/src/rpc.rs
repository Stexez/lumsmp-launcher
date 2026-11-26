use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::mpsc::{self, Sender};
use std::time::{SystemTime, UNIX_EPOCH};

// LumSMP Resmi Discord Uygulama Kimliği (herkese açık Application ID)
const DISCORD_APP_ID: &str = "1558297344070656110";

struct RpcCommand {
    enabled: bool,
    details: String,
    state: String,
}

pub struct RpcManager {
    tx: Sender<RpcCommand>,
}

impl RpcManager {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<RpcCommand>();
        std::thread::spawn(move || {
            let mut client: Option<DiscordIpcClient> = None;
            let start_epoch = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;

            while let Ok(cmd) = rx.recv() {
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    if !cmd.enabled {
                        if let Some(mut c) = client.take() {
                            let _ = c.close();
                        }
                        return;
                    }
                    if client.is_none() {
                        match DiscordIpcClient::new(DISCORD_APP_ID) {
                            Ok(mut c) => {
                                if c.connect().is_ok() {
                                    client = Some(c);
                                } else {
                                    return;
                                }
                            }
                            Err(_) => return,
                        }
                    }
                    if let Some(c) = client.as_mut() {
                        let payload = activity::Activity::new()
                            .details(&cmd.details)
                            .state(&cmd.state)
                            .timestamps(activity::Timestamps::new().start(start_epoch))
                            .buttons(vec![activity::Button::new("LumSMP Site", "https://lumcraft.com.tr")]);
                        if c.set_activity(payload).is_err() {
                            let _ = c.close();
                            client = None;
                        }
                    }
                }));
            }
        });
        Self { tx }
    }

    pub fn set_status(&self, enabled: bool, details: &str, state: &str) {
        let _ = self.tx.send(RpcCommand {
            enabled,
            details: details.to_string(),
            state: state.to_string(),
        });
    }
}
