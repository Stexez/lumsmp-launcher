package tr.lumsmp.client.hud;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * Sağ Shift ile açılan LumSMP Client HUD, Sürükle-Bırak & Spotify Kontrol Menüsü.
 */
public final class HudConfigScreen extends Screen {
	private static final int CARD_W = 356;
	private static final int CARD_H = 316;

	public HudConfigScreen() {
		super(Component.literal("LumSMP Client"));
	}

	@Override
	protected void init() {
		HudConfig.load();
		int left = (width - CARD_W) / 2;
		int top = (height - CARD_H) / 2;
		int col1 = left + 16;
		int col2 = left + 182;
		int btnW = 158;
		int btnH = 20;
		int y = top + 42;

		addRenderableWidget(Button.builder(toggleLabel("HUD Gösterimi", HudConfig.enabled), b -> {
			HudConfig.enabled = !HudConfig.enabled;
			HudConfig.save();
			b.setMessage(toggleLabel("HUD Gösterimi", HudConfig.enabled));
		}).bounds(col1, y, btnW, btnH).build());

		addRenderableWidget(Button.builder(Component.literal("Konum: " + HudConfig.cornerLabel()), b -> {
			HudConfig.hudX = -1;
			HudConfig.hudY = -1;
			HudConfig.spotifyX = -1;
			HudConfig.spotifyY = -1;
			HudConfig.corner = (HudConfig.corner + 1) % 4;
			HudConfig.save();
			b.setMessage(Component.literal("Konum: " + HudConfig.cornerLabel()));
		}).bounds(col2, y, btnW, btnH).build());

		y += 23;
		addRenderableWidget(Button.builder(toggleLabel("FPS Sayacı", HudConfig.showFps), b -> {
			HudConfig.showFps = !HudConfig.showFps;
			HudConfig.save();
			b.setMessage(toggleLabel("FPS Sayacı", HudConfig.showFps));
		}).bounds(col1, y, btnW, btnH).build());

		addRenderableWidget(Button.builder(toggleLabel("Ping (ms)", HudConfig.showPing), b -> {
			HudConfig.showPing = !HudConfig.showPing;
			HudConfig.save();
			b.setMessage(toggleLabel("Ping (ms)", HudConfig.showPing));
		}).bounds(col2, y, btnW, btnH).build());

		y += 23;
		addRenderableWidget(Button.builder(toggleLabel("CPS Sayacı", HudConfig.showCps), b -> {
			HudConfig.showCps = !HudConfig.showCps;
			HudConfig.save();
			b.setMessage(toggleLabel("CPS Sayacı", HudConfig.showCps));
		}).bounds(col1, y, btnW, btnH).build());

		addRenderableWidget(Button.builder(toggleLabel("Koordinatlar", HudConfig.showCoords), b -> {
			HudConfig.showCoords = !HudConfig.showCoords;
			HudConfig.save();
			b.setMessage(toggleLabel("Koordinatlar", HudConfig.showCoords));
		}).bounds(col2, y, btnW, btnH).build());

		y += 23;
		addRenderableWidget(Button.builder(toggleLabel("Pusula / Yön", HudConfig.showDirection), b -> {
			HudConfig.showDirection = !HudConfig.showDirection;
			HudConfig.save();
			b.setMessage(toggleLabel("Pusula / Yön", HudConfig.showDirection));
		}).bounds(col1, y, btnW, btnH).build());

		addRenderableWidget(Button.builder(toggleLabel("Gerçek Saat", HudConfig.showClock), b -> {
			HudConfig.showClock = !HudConfig.showClock;
			HudConfig.save();
			b.setMessage(toggleLabel("Gerçek Saat", HudConfig.showClock));
		}).bounds(col2, y, btnW, btnH).build());

		y += 23;
		addRenderableWidget(Button.builder(toggleLabel("Zırh Durumu", HudConfig.showArmor), b -> {
			HudConfig.showArmor = !HudConfig.showArmor;
			HudConfig.save();
			b.setMessage(toggleLabel("Zırh Durumu", HudConfig.showArmor));
		}).bounds(col1, y, btnW, btnH).build());

		addRenderableWidget(Button.builder(toggleLabel("Fullbright", HudConfig.fullbright), b -> {
			HudConfig.toggleFullbright();
			b.setMessage(toggleLabel("Fullbright", HudConfig.fullbright));
		}).bounds(col2, y, btnW, btnH).build());

		y += 23;
		addRenderableWidget(Button.builder(toggleLabel("Spotify HUD", HudConfig.showSpotify), b -> {
			HudConfig.showSpotify = !HudConfig.showSpotify;
			HudConfig.save();
			b.setMessage(toggleLabel("Spotify HUD", HudConfig.showSpotify));
		}).bounds(col1, y, btnW, btnH).build());

		addRenderableWidget(Button.builder(Component.literal("§6✦ Konumu Sürükle"), b ->
			minecraft.gui.setScreen(new HudDragScreen(this))
		).bounds(col2, y, btnW, btnH).build());

		// Spotify Medya Kontrol Bölümü
		int spBtnY = top + 240;
		int spW = 102;
		addRenderableWidget(Button.builder(Component.literal("⏮ Önceki"), b -> SpotifyController.prevTrack())
			.bounds(col1, spBtnY, spW, 20).build());
		addRenderableWidget(Button.builder(Component.literal("⏯ Oynat/Dur"), b -> SpotifyController.playPause())
			.bounds(col1 + 111, spBtnY, spW, 20).build());
		addRenderableWidget(Button.builder(Component.literal("Sonraki ⏭"), b -> SpotifyController.nextTrack())
			.bounds(col1 + 222, spBtnY, spW, 20).build());

		// Alt butonlar
		int footY = top + 280;
		addRenderableWidget(Button.builder(Component.literal("Sıfırla"), b -> {
			HudConfig.reset();
			clearWidgets();
			init();
		}).bounds(col1, footY, 102, 20).build());

		addRenderableWidget(Button.builder(Component.literal("Kaydet ve Kapat"), b -> onClose())
			.bounds(col2, footY, btnW, 20).build());
	}

	private static Component toggleLabel(String name, boolean on) {
		return Component.literal(name + ": " + (on ? "§aAçık" : "§cKapalı"));
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
		graphics.fill(0, 0, width, height, 0x8C070812);
		int left = (width - CARD_W) / 2;
		int top = (height - CARD_H) / 2;
		graphics.fill(left, top, left + CARD_W, top + CARD_H, 0xF2121322);
		graphics.outline(left, top, CARD_W, CARD_H, 0xAA8B5CF6);
		graphics.fill(left + 1, top + 1, left + CARD_W - 1, top + 3, 0xFFF5C969);

		int spTop = top + 196;
		graphics.fill(left + 14, spTop, left + CARD_W - 14, spTop + 72, 0xC00B1514);
		graphics.outline(left + 14, spTop, CARD_W - 28, 72, 0x771DB954);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
		super.extractRenderState(graphics, mouseX, mouseY, partialTick);
		int centerX = width / 2;
		int left = (width - CARD_W) / 2;
		int top = (height - CARD_H) / 2;
		graphics.centeredText(font, Component.literal("§6LUM§fSMP §7• §dİstemci HUD & Spotify"), centerX, top + 11, 0xFFF3F2FB);
		graphics.centeredText(font, Component.literal("Sağ Shift ile aç/kapat • Konumu Sürükle ile serbestçe taşı"), centerX, top + 24, 0xFF9CA3AF);

		String spTitle = SpotifyController.isRunning()
			? ("♫ " + SpotifyController.currentTrack())
			: "♫ Spotify algılanmadı (Masaüstü Spotify uygulamasını aç)";
		if (spTitle.length() > 48) spTitle = spTitle.substring(0, 47) + "…";
		graphics.text(font, "SPOTIFY KONTROLÜ", left + 24, top + 205, 0xFF1DB954, true);
		graphics.text(font, spTitle, left + 24, top + 219, 0xFFE2E8F0, true);
	}
}
