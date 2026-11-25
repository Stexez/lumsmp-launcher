package tr.lumsmp.client.hud;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

/**
 * Oyun içi LumSMP HUD, Keystrokes, ToggleSprint, Spotify ve özel Crosshair çizicisi.
 */
public final class HudOverlay {
	private static final DateTimeFormatter CLOCK_FMT = DateTimeFormatter.ofPattern("HH:mm");
	private static final int BG_COLOR = 0xB80E0E1A;
	private static final int BORDER_COLOR = 0x668B5CF6;
	private static final int ACCENT_COLOR = 0xFFF5C969;
	private static final int LABEL_COLOR = 0xFF9CA3AF;
	private static final int VALUE_COLOR = 0xFFF8FAFC;

	private static final EquipmentSlot[] ARMOR_SLOTS = {
		EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET
	};

	private static final Deque<Long> LEFT_CLICKS = new ArrayDeque<>();
	private static final Deque<Long> RIGHT_CLICKS = new ArrayDeque<>();

	public static int lastHudX, lastHudY, lastHudW, lastHudH;
	public static int lastSpX, lastSpY, lastSpW, lastSpH;
	public static boolean lastSpVisible;
	public static int lastKeysX, lastKeysY, lastKeysW, lastKeysH;
	public static boolean lastKeysVisible;

	private HudOverlay() {}

	private record HudLine(String label, String value, int valueColor) {}

	public static synchronized void recordClick(int button) {
		long now = System.currentTimeMillis();
		if (button == 0) LEFT_CLICKS.addLast(now);
		else if (button == 1) RIGHT_CLICKS.addLast(now);
	}

	private static synchronized int[] currentCps() {
		long cutoff = System.currentTimeMillis() - 1000L;
		while (!LEFT_CLICKS.isEmpty() && LEFT_CLICKS.peekFirst() < cutoff) LEFT_CLICKS.pollFirst();
		while (!RIGHT_CLICKS.isEmpty() && RIGHT_CLICKS.peekFirst() < cutoff) RIGHT_CLICKS.pollFirst();
		return new int[] { LEFT_CLICKS.size(), RIGHT_CLICKS.size() };
	}

	public static void renderCrosshair(GuiGraphicsExtractor graphics) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.gui.screen() != null) return;
		int cx = graphics.guiWidth() / 2;
		int cy = graphics.guiHeight() / 2;
		int col = HudConfig.crosshairArgb();
		int sh = 0xAA000000;

		switch (HudConfig.crosshairStyle) {
			case 1 -> { // Nokta
				graphics.fill(cx - 2, cy - 2, cx + 2, cy + 2, sh);
				graphics.fill(cx - 1, cy - 1, cx + 1, cy + 1, col);
			}
			case 2 -> { // İnce Artı
				graphics.fill(cx - 5, cy, cx - 1, cy + 1, col);
				graphics.fill(cx + 2, cy, cx + 6, cy + 1, col);
				graphics.fill(cx, cy - 5, cx + 1, cy - 1, col);
				graphics.fill(cx, cy + 2, cx + 1, cy + 6, col);
				graphics.fill(cx, cy, cx + 1, cy + 1, col);
			}
			case 3 -> { // Çember + Nokta
				graphics.outline(cx - 4, cy - 4, 9, 9, col);
				graphics.fill(cx, cy, cx + 1, cy + 1, col);
			}
			case 4 -> { // Kare
				graphics.outline(cx - 3, cy - 3, 7, 7, sh);
				graphics.outline(cx - 2, cy - 2, 5, 5, col);
			}
			default -> {}
		}
	}

	public static void render(GuiGraphicsExtractor graphics) {
		HudConfig.load();
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.level == null) return;

		LocalPlayer player = mc.player;
		// ToggleSprint: ileri yürürken eğilmiyorsa otomatik koş
		if (HudConfig.toggleSprint && mc.gui.screen() == null && mc.options.keyUp.isDown() && !player.isShiftKeyDown()) {
			player.setSprinting(true);
		}
		if (HudConfig.fullbright) {
			HudConfig.applyFullbright();
		}

		if (!HudConfig.enabled) return;
		boolean dragging = mc.gui.screen() instanceof HudDragScreen;
		if (mc.gui.screen() != null && !(mc.gui.screen() instanceof HudConfigScreen) && !dragging) return;

		Font font = mc.font;
		List<HudLine> lines = new ArrayList<>();

		if (HudConfig.showFps) {
			int fps = mc.getFps();
			int color = fps >= 60 ? 0xFF4ADE80 : (fps >= 30 ? 0xFFFACC15 : 0xFFF87171);
			lines.add(new HudLine("FPS", String.valueOf(fps), color));
		}
		if (HudConfig.showPing) {
			int ping = readPing(mc, player);
			int color = ping < 0 ? LABEL_COLOR : (ping <= 60 ? 0xFF4ADE80 : (ping <= 130 ? 0xFFFACC15 : 0xFFF87171));
			lines.add(new HudLine("PING", ping >= 0 ? ping + " ms" : "—", color));
		}
		if (HudConfig.showCps) {
			int[] cps = currentCps();
			lines.add(new HudLine("CPS", cps[0] + " | " + cps[1], 0xFFFDE68A));
		}
		if (HudConfig.showCoords) {
			int x = (int) Math.floor(player.getX());
			int y = (int) Math.floor(player.getY());
			int z = (int) Math.floor(player.getZ());
			lines.add(new HudLine("XYZ", x + "  " + y + "  " + z, VALUE_COLOR));
		}
		if (HudConfig.showDirection) {
			lines.add(new HudLine("YÖN", cardinalDirection(player.getYRot()), 0xFFC4B5FD));
		}
		if (HudConfig.showClock) {
			lines.add(new HudLine("SAAT", LocalTime.now().format(CLOCK_FMT), VALUE_COLOR));
		}
		if (HudConfig.toggleSprint) {
			lines.add(new HudLine("KOŞU", player.isSprinting() ? "Aktif" : "Hazır", player.isSprinting() ? 0xFF4ADE80 : LABEL_COLOR));
		}

		List<ItemStack> armor = new ArrayList<>();
		if (HudConfig.showArmor) {
			for (EquipmentSlot slot : ARMOR_SLOTS) {
				ItemStack stack = player.getItemBySlot(slot);
				if (stack != null && !stack.isEmpty()) armor.add(stack);
			}
		}

		int screenW = graphics.guiWidth();
		int screenH = graphics.guiHeight();
		int margin = 8;

		// 1. Ana HUD Kartı
		if (!lines.isEmpty() || !armor.isEmpty() || dragging) {
			int padX = 7;
			int padY = 5;
			int lineH = 11;
			int headerH = 12;

			int boxW = font.width("LUMSMP  [RShift]") + padX * 2;
			for (HudLine line : lines) {
				int w = font.width(line.label + "  " + line.value) + padX * 2;
				if (w > boxW) boxW = w;
			}
			if (!armor.isEmpty()) {
				int armorW = armor.size() * 22 + padX * 2;
				if (armorW > boxW) boxW = armorW;
			}
			int boxH = padY * 2 + headerH + lines.size() * lineH + (armor.isEmpty() ? 0 : 28);

			int x = (HudConfig.hudX >= 0)
				? Math.max(2, Math.min(screenW - boxW - 2, HudConfig.hudX))
				: switch (HudConfig.corner) { case 1, 3 -> screenW - boxW - margin; default -> margin; };
			int y = (HudConfig.hudY >= 0)
				? Math.max(2, Math.min(screenH - boxH - 2, HudConfig.hudY))
				: switch (HudConfig.corner) { case 2, 3 -> screenH - boxH - margin; default -> margin; };

			lastHudX = x; lastHudY = y; lastHudW = boxW; lastHudH = boxH;

			graphics.fill(x, y, x + boxW, y + boxH, BG_COLOR);
			graphics.outline(x, y, boxW, boxH, dragging ? 0xFFF5C969 : BORDER_COLOR);
			graphics.fill(x + 1, y + 1, x + boxW - 1, y + 2, 0xCCF5C969);

			int curY = y + padY;
			graphics.text(font, "LUMSMP", x + padX, curY, ACCENT_COLOR, true);
			String hint = dragging ? "[SÜRÜKLE]" : "[RShift]";
			graphics.text(font, hint, x + boxW - padX - font.width(hint), curY, dragging ? 0xFFF5C969 : 0xFF6B7280, false);
			curY += headerH;

			for (HudLine line : lines) {
				graphics.text(font, line.label, x + padX, curY, LABEL_COLOR, true);
				int valW = font.width(line.value);
				graphics.text(font, line.value, x + boxW - padX - valW, curY, line.valueColor, true);
				curY += lineH;
			}

			if (!armor.isEmpty()) {
				curY += 2;
				int ix = x + padX;
				for (ItemStack stack : armor) {
					graphics.item(stack, ix, curY);
					if (stack.isDamageableItem() && stack.getMaxDamage() > 0) {
						int pct = Math.max(0, Math.round(100f * (stack.getMaxDamage() - stack.getDamageValue()) / stack.getMaxDamage()));
						int pColor = pct > 50 ? 0xFF4ADE80 : (pct > 20 ? 0xFFFACC15 : 0xFFF87171);
						String pctStr = pct + "%";
						graphics.text(font, pctStr, ix + 8 - font.width(pctStr) / 2, curY + 17, pColor, true);
					}
					ix += 22;
				}
			}

			// 2. Spotify Now Playing Kartı
			boolean showSp = HudConfig.showSpotify && (SpotifyController.isRunning() || dragging);
			lastSpVisible = showSp;
			if (showSp) {
				String raw = SpotifyController.isRunning() ? SpotifyController.currentTrack() : "Spotify Önizleme — Sürükle";
				if (raw.length() > 30) raw = raw.substring(0, 29) + "…";
				String header = SpotifyController.isPlaying() ? "♫ SPOTIFY • ÇALIYOR" : "♫ SPOTIFY";
				int spW = Math.max(boxW, Math.max(font.width(header), font.width(raw)) + padX * 2 + 4);
				int spH = 29;
				int spX = (HudConfig.spotifyX >= 0)
					? Math.max(2, Math.min(screenW - spW - 2, HudConfig.spotifyX))
					: ((HudConfig.corner == 1 || HudConfig.corner == 3) ? (screenW - spW - margin) : x);
				int spY = (HudConfig.spotifyY >= 0)
					? Math.max(2, Math.min(screenH - spH - 2, HudConfig.spotifyY))
					: ((HudConfig.corner == 2 || HudConfig.corner == 3) ? (y - spH - 5) : (y + boxH + 5));

				lastSpX = spX; lastSpY = spY; lastSpW = spW; lastSpH = spH;

				graphics.fill(spX, spY, spX + spW, spY + spH, 0xC40C1414);
				graphics.outline(spX, spY, spW, spH, dragging ? 0xFF1DB954 : 0x661DB954);
				graphics.fill(spX + 1, spY + 1, spX + 3, spY + spH - 1, 0xFF1DB954);
				graphics.text(font, header, spX + padX + 2, spY + 5, 0xFF1DB954, true);
				graphics.text(font, raw, spX + padX + 2, spY + 16, 0xFFF1F5F9, true);
			}
		}

		// 3. Keystrokes (WASD + SPACE + LMB/RMB) Kartı
		boolean showKs = HudConfig.showKeystrokes;
		lastKeysVisible = showKs;
		if (showKs) {
			int k = 22;
			int gap = 3;
			int ksW = k * 3 + gap * 2;
			int ksH = k * 2 + gap * 3 + 16 + 14;
			int kx = (HudConfig.keysX >= 0)
				? Math.max(2, Math.min(screenW - ksW - 2, HudConfig.keysX))
				: (screenW - ksW - margin);
			int ky = (HudConfig.keysY >= 0)
				? Math.max(2, Math.min(screenH - ksH - 2, HudConfig.keysY))
				: (screenH - ksH - margin);

			lastKeysX = kx; lastKeysY = ky; lastKeysW = ksW; lastKeysH = ksH;

			drawKey(graphics, font, kx + k + gap, ky, k, k, "W", mc.options.keyUp.isDown(), dragging);
			drawKey(graphics, font, kx, ky + k + gap, k, k, "A", mc.options.keyLeft.isDown(), dragging);
			drawKey(graphics, font, kx + k + gap, ky + k + gap, k, k, "S", mc.options.keyDown.isDown(), dragging);
			drawKey(graphics, font, kx + (k + gap) * 2, ky + k + gap, k, k, "D", mc.options.keyRight.isDown(), dragging);

			int mouseY = ky + (k + gap) * 2;
			int halfW = (ksW - gap) / 2;
			drawKey(graphics, font, kx, mouseY, halfW, 16, "LMB", mc.options.keyAttack.isDown(), dragging);
			drawKey(graphics, font, kx + halfW + gap, mouseY, ksW - halfW - gap, 16, "RMB", mc.options.keyUse.isDown(), dragging);

			int spaceY = mouseY + 16 + gap;
			drawKey(graphics, font, kx, spaceY, ksW, 14, "───", mc.options.keyJump.isDown(), dragging);
		}
	}

	private static void drawKey(GuiGraphicsExtractor g, Font font, int x, int y, int w, int h, String label, boolean down, boolean dragging) {
		int bg = down ? 0xD8A774FF : 0xA80E0E1A;
		int border = dragging ? 0xFFF5C969 : (down ? 0xFFF5C969 : 0x558B5CF6);
		int textCol = down ? 0xFF120C1E : 0xFFE2E8F0;
		g.fill(x, y, x + w, y + h, bg);
		g.outline(x, y, w, h, border);
		int tx = x + (w - font.width(label)) / 2;
		int ty = y + (h - font.lineHeight) / 2 + 1;
		g.text(font, label, tx, ty, textCol, !down);
	}

	private static int readPing(Minecraft mc, LocalPlayer player) {
		ClientPacketListener conn = mc.getConnection();
		if (conn == null) return -1;
		PlayerInfo info = conn.getPlayerInfo(player.getUUID());
		return info != null ? info.getLatency() : -1;
	}

	private static String cardinalDirection(float yRot) {
		float yaw = ((yRot % 360f) + 360f) % 360f;
		if (yaw >= 337.5f || yaw < 22.5f) return "Güney (Z+)";
		if (yaw < 67.5f) return "Güneybatı";
		if (yaw < 112.5f) return "Batı (X-)";
		if (yaw < 157.5f) return "Kuzeybatı";
		if (yaw < 202.5f) return "Kuzey (Z-)";
		if (yaw < 247.5f) return "Kuzeydoğu";
		if (yaw < 292.5f) return "Doğu (X+)";
		return "Güneydoğu";
	}
}
