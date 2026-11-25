package tr.lumsmp.client.hud;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Windows üzerinde açık olan Spotify uygulamasından çalan şarkıyı okur ve
 * medya tuşlarıyla (Önceki / Oynat-Duraklat / Sonraki) kontrol sağlar.
 * Harici API anahtarı veya giriş gerektirmez.
 */
public final class SpotifyController {
	private static final boolean IS_WINDOWS = System.getProperty("os.name", "")
		.toLowerCase(Locale.ROOT).contains("win");

	private static volatile boolean started;
	private static volatile boolean running;
	private static volatile boolean playing;
	private static volatile String currentTrack = "";

	private SpotifyController() {}

	public static void start() {
		if (!IS_WINDOWS || started) return;
		started = true;
		Thread poller = new Thread(() -> {
			while (true) {
				try {
					if (HudConfig.enabled && HudConfig.showSpotify) {
						pollOnce();
					}
					Thread.sleep(3000);
				} catch (InterruptedException ignored) {
					return;
				} catch (Exception ignored) {}
			}
		}, "LumSMP-Spotify-Poller");
		poller.setDaemon(true);
		poller.start();
	}

	public static boolean isRunning() {
		return running;
	}

	public static boolean isPlaying() {
		return playing;
	}

	public static String currentTrack() {
		return currentTrack;
	}

	public static void playPause() {
		sendMediaKey(179); // VK_MEDIA_PLAY_PAUSE
	}

	public static void nextTrack() {
		sendMediaKey(176); // VK_MEDIA_NEXT_TRACK
	}

	public static void prevTrack() {
		sendMediaKey(177); // VK_MEDIA_PREV_TRACK
	}

	private static void sendMediaKey(int keyCode) {
		if (!IS_WINDOWS) return;
		Thread t = new Thread(() -> {
			try {
				new ProcessBuilder(
					"powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
					"-Command", "(New-Object -ComObject WScript.Shell).SendKeys([char]" + keyCode + ")"
				).start().waitFor();
				Thread.sleep(450);
				pollOnce();
			} catch (Exception ignored) {}
		}, "LumSMP-Spotify-Key");
		t.setDaemon(true);
		t.start();
	}

	private static void pollOnce() {
		try {
			Process p = new ProcessBuilder(
				"powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
				"-Command",
				"[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;"
					+ "$t=(Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -First 1).MainWindowTitle;"
					+ "if($t){Write-Output $t}"
			).redirectErrorStream(true).start();

			StringBuilder sb = new StringBuilder();
			try (BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
				String line = br.readLine();
				if (line != null) sb.append(line.trim());
			}
			p.waitFor();
			String title = sb.toString().trim();
			if (title.isEmpty()) {
				running = false;
				playing = false;
				currentTrack = "";
			} else if (title.equalsIgnoreCase("Spotify") || title.equalsIgnoreCase("Spotify Free") || title.equalsIgnoreCase("Spotify Premium")) {
				running = true;
				playing = false;
				currentTrack = "Duraklatıldı";
			} else {
				running = true;
				playing = true;
				currentTrack = title;
			}
		} catch (Exception ignored) {}
	}
}
