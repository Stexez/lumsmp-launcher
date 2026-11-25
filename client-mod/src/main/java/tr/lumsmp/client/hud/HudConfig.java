package tr.lumsmp.client.hud;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;
import net.minecraft.client.Minecraft;
import tr.lumsmp.client.LumsmpClient;

/**
 * LumSMP oyun içi HUD, Keystrokes, ToggleSprint, C-Zoom, Crosshair ve Spotify ayarları.
 */
public final class HudConfig {
	public static boolean enabled = true;
	public static boolean showFps = true;
	public static boolean showPing = true;
	public static boolean showCps = true;
	public static boolean showCoords = true;
	public static boolean showDirection = true;
	public static boolean showClock = true;
	public static boolean showArmor = true;
	public static boolean showSpotify = true;
	public static boolean showKeystrokes = true;
	public static boolean toggleSprint = true;
	public static boolean zoomEnabled = true;
	public static boolean fullbright = false;
	/** 0 = Varsayılan, 1 = Nokta, 2 = İnce Artı, 3 = Çember, 4 = Kare */
	public static int crosshairStyle = 0;
	/** 0 = Beyaz, 1 = Altın, 2 = Mor, 3 = Yeşil, 4 = Kırmızı, 5 = Turkuaz */
	public static int crosshairColor = 0;
	/** 0 = Sol Üst, 1 = Sağ Üst, 2 = Sol Alt, 3 = Sağ Alt */
	public static int corner = 0;
	public static int hudX = -1;
	public static int hudY = -1;
	public static int spotifyX = -1;
	public static int spotifyY = -1;
	public static int keysX = -1;
	public static int keysY = -1;

	private static boolean loaded;
	private static double savedGamma = 1.0;

	private HudConfig() {}

	private static Path filePath() {
		Minecraft mc = Minecraft.getInstance();
		return mc.gameDirectory.toPath().resolve("config").resolve("lumsmp-hud.properties");
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
			showCps = Boolean.parseBoolean(props.getProperty("showCps", "true"));
			showCoords = Boolean.parseBoolean(props.getProperty("showCoords", "true"));
			showDirection = Boolean.parseBoolean(props.getProperty("showDirection", "true"));
			showClock = Boolean.parseBoolean(props.getProperty("showClock", "true"));
			showArmor = Boolean.parseBoolean(props.getProperty("showArmor", "true"));
			showSpotify = Boolean.parseBoolean(props.getProperty("showSpotify", "true"));
			showKeystrokes = Boolean.parseBoolean(props.getProperty("showKeystrokes", "true"));
			toggleSprint = Boolean.parseBoolean(props.getProperty("toggleSprint", "true"));
			zoomEnabled = Boolean.parseBoolean(props.getProperty("zoomEnabled", "true"));
			fullbright = Boolean.parseBoolean(props.getProperty("fullbright", "false"));
			crosshairStyle = Math.max(0, Math.min(4, Integer.parseInt(props.getProperty("crosshairStyle", "0"))));
			crosshairColor = Math.max(0, Math.min(5, Integer.parseInt(props.getProperty("crosshairColor", "0"))));
			corner = Math.max(0, Math.min(3, Integer.parseInt(props.getProperty("corner", "0"))));
			hudX = Integer.parseInt(props.getProperty("hudX", "-1"));
			hudY = Integer.parseInt(props.getProperty("hudY", "-1"));
			spotifyX = Integer.parseInt(props.getProperty("spotifyX", "-1"));
			spotifyY = Integer.parseInt(props.getProperty("spotifyY", "-1"));
			keysX = Integer.parseInt(props.getProperty("keysX", "-1"));
			keysY = Integer.parseInt(props.getProperty("keysY", "-1"));
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
		props.setProperty("showCps", String.valueOf(showCps));
		props.setProperty("showCoords", String.valueOf(showCoords));
		props.setProperty("showDirection", String.valueOf(showDirection));
		props.setProperty("showClock", String.valueOf(showClock));
		props.setProperty("showArmor", String.valueOf(showArmor));
		props.setProperty("showSpotify", String.valueOf(showSpotify));
		props.setProperty("showKeystrokes", String.valueOf(showKeystrokes));
		props.setProperty("toggleSprint", String.valueOf(toggleSprint));
		props.setProperty("zoomEnabled", String.valueOf(zoomEnabled));
		props.setProperty("fullbright", String.valueOf(fullbright));
		props.setProperty("crosshairStyle", String.valueOf(crosshairStyle));
		props.setProperty("crosshairColor", String.valueOf(crosshairColor));
		props.setProperty("corner", String.valueOf(corner));
		props.setProperty("hudX", String.valueOf(hudX));
		props.setProperty("hudY", String.valueOf(hudY));
		props.setProperty("spotifyX", String.valueOf(spotifyX));
		props.setProperty("spotifyY", String.valueOf(spotifyY));
		props.setProperty("keysX", String.valueOf(keysX));
		props.setProperty("keysY", String.valueOf(keysY));
		try {
			Files.createDirectories(path.getParent());
			try (OutputStream out = Files.newOutputStream(path)) {
				props.store(out, "LumSMP Client HUD Ayarlari");
			}
		} catch (Exception e) {
			LumsmpClient.LOG.warn("HUD ayarları kaydedilemedi: {}", e.getMessage());
		}
	}

	public static void resetPositions() {
		hudX = -1;
		hudY = -1;
		spotifyX = -1;
		spotifyY = -1;
		keysX = -1;
		keysY = -1;
		save();
	}

	public static void reset() {
		enabled = true;
		showFps = true;
		showPing = true;
		showCps = true;
		showCoords = true;
		showDirection = true;
		showClock = true;
		showArmor = true;
		showSpotify = true;
		showKeystrokes = true;
		toggleSprint = true;
		zoomEnabled = true;
		fullbright = false;
		crosshairStyle = 0;
		crosshairColor = 0;
		corner = 0;
		hudX = -1;
		hudY = -1;
		spotifyX = -1;
		spotifyY = -1;
		keysX = -1;
		keysY = -1;
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
			try {
				mc.options.gamma().set(fullbright ? 1.0 : savedGamma);
			} catch (Exception ignored2) {}
		}
	}

	public static String cornerLabel() {
		if (hudX >= 0 || hudY >= 0) return "Özel";
		return switch (corner) {
			case 1 -> "Sağ Üst";
			case 2 -> "Sol Alt";
			case 3 -> "Sağ Alt";
			default -> "Sol Üst";
		};
	}

	public static String crosshairStyleLabel() {
		return switch (crosshairStyle) {
			case 1 -> "Nokta";
			case 2 -> "İnce Artı";
			case 3 -> "Çember";
			case 4 -> "Kare";
			default -> "Varsayılan";
		};
	}

	public static String crosshairColorLabel() {
		return switch (crosshairColor) {
			case 1 -> "Altın";
			case 2 -> "Mor";
			case 3 -> "Yeşil";
			case 4 -> "Kırmızı";
			case 5 -> "Turkuaz";
			default -> "Beyaz";
		};
	}

	public static int crosshairArgb() {
		return switch (crosshairColor) {
			case 1 -> 0xFFF5C969;
			case 2 -> 0xFFC084FC;
			case 3 -> 0xFF4ADE80;
			case 4 -> 0xFFF87171;
			case 5 -> 0xFF38BDF8;
			default -> 0xFFFFFFFF;
		};
	}
}
