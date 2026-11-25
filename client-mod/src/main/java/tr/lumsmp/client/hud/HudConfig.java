package tr.lumsmp.client.hud;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;
import net.minecraft.client.Minecraft;
import tr.lumsmp.client.LumsmpClient;

/**
 * OneClient tarzı oyun içi HUD ve istemci ayarları.
 * Ayarlar <oyun>/config/lumsmp-hud.properties dosyasında saklanır.
 */
public final class HudConfig {
	public static boolean enabled = true;
	public static boolean showFps = true;
	public static boolean showPing = true;
	public static boolean showCoords = true;
	public static boolean showDirection = true;
	public static boolean showClock = true;
	public static boolean showArmor = true;
	public static boolean showSpotify = true;
	public static boolean fullbright = false;
	/** 0 = Sol Üst, 1 = Sağ Üst, 2 = Sol Alt, 3 = Sağ Alt */
	public static int corner = 0;

	private static boolean loaded;
	private static double savedGamma = 1.0;

	private HudConfig() {}

	private static Path filePath() {
		Minecraft mc = Minecraft.getInstance();
		Path dir = mc.gameDirectory.toPath().resolve("config");
		return dir.resolve("lumsmp-hud.properties");
	}

	public static void load() {
		if (loaded) return;
		loaded = true;
		Path path = filePath();
		if (!Files.exists(path)) return;
		Properties props = new Properties();
		try (InputStream in = Files.newInputStream(path)) {
			props.load(in);
			enabled = Boolean.parseBoolean(props.getProperty("enabled", "true"));
			showFps = Boolean.parseBoolean(props.getProperty("showFps", "true"));
			showPing = Boolean.parseBoolean(props.getProperty("showPing", "true"));
			showCoords = Boolean.parseBoolean(props.getProperty("showCoords", "true"));
			showDirection = Boolean.parseBoolean(props.getProperty("showDirection", "true"));
			showClock = Boolean.parseBoolean(props.getProperty("showClock", "true"));
			showArmor = Boolean.parseBoolean(props.getProperty("showArmor", "true"));
			showSpotify = Boolean.parseBoolean(props.getProperty("showSpotify", "true"));
			fullbright = Boolean.parseBoolean(props.getProperty("fullbright", "false"));
			corner = Math.max(0, Math.min(3, Integer.parseInt(props.getProperty("corner", "0"))));
		} catch (Exception e) {
			LumsmpClient.LOG.warn("HUD ayarları okunamadı: {}", e.getMessage());
		}
	}

	public static void save() {
		Path path = filePath();
		Properties props = new Properties();
		props.setProperty("enabled", String.valueOf(enabled));
		props.setProperty("showFps", String.valueOf(showFps));
		props.setProperty("showPing", String.valueOf(showPing));
		props.setProperty("showCoords", String.valueOf(showCoords));
		props.setProperty("showDirection", String.valueOf(showDirection));
		props.setProperty("showClock", String.valueOf(showClock));
		props.setProperty("showArmor", String.valueOf(showArmor));
		props.setProperty("showSpotify", String.valueOf(showSpotify));
		props.setProperty("fullbright", String.valueOf(fullbright));
		props.setProperty("corner", String.valueOf(corner));
		try {
			Files.createDirectories(path.getParent());
			try (OutputStream out = Files.newOutputStream(path)) {
				props.store(out, "LumSMP Client HUD Ayarlari");
			}
		} catch (Exception e) {
			LumsmpClient.LOG.warn("HUD ayarları kaydedilemedi: {}", e.getMessage());
		}
	}

	public static void reset() {
		enabled = true;
		showFps = true;
		showPing = true;
		showCoords = true;
		showDirection = true;
		showClock = true;
		showArmor = true;
		showSpotify = true;
		fullbright = false;
		corner = 0;
		applyFullbright();
		save();
	}

	public static void toggleFullbright() {
		fullbright = !fullbright;
		applyFullbright();
		save();
	}

	public static void applyFullbright() {
		Minecraft mc = Minecraft.getInstance();
		if (mc == null || mc.options == null) return;
		try {
			double current = mc.options.gamma().get();
			if (fullbright) {
				if (current <= 1.0) savedGamma = current;
				mc.options.gamma().set(15.0);
			} else if (current > 1.0) {
				mc.options.gamma().set(savedGamma);
			}
		} catch (Exception ignored) {
			// Bazı sürümlerde gamma 0..1 ile sınırlıysa en yüksek değeri uygula
			try {
				mc.options.gamma().set(fullbright ? 1.0 : savedGamma);
			} catch (Exception ignored2) {}
		}
	}

	public static String cornerLabel() {
		return switch (corner) {
			case 1 -> "Sağ Üst";
			case 2 -> "Sol Alt";
			case 3 -> "Sağ Alt";
			default -> "Sol Üst";
		};
	}
}
