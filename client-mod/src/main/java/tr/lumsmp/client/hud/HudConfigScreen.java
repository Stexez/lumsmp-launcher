package tr.lumsmp.client.hud;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * Sağ Shift ile açılan OneClient tarzı LumSMP Client HUD & Mod ayar menüsü.
 */
public final class HudConfigScreen extends Screen {
	private static final int CARD_W = 336;
	private static final int CARD_H = 224;

	public HudConfigScreen() {
		super(Component.literal("LumSMP Client HUD"));
	}

	@Override
	protected void init() {
		HudConfig.load();
		int left = (width - CARD_W) / 2;
		int top = (height - CARD_H) / 2;
		int col1 = left + 16;
		int col2 = left + 172;
		int btnW = 148;
		int btnH = 20;
		int y = top + 44;

		addRenderableWidget(Button.builder(toggleLabel("HUD Gösterimi", HudConfig.enabled), b -> {
			HudConfig.enabled = !HudConfig.enabled;
			HudConfig.save();
			b.setMessage(toggleLabel("HUD Gösterimi", HudConfig.enabled));
		}).bounds(col1, y, btnW, btnH).build());

		addRenderableWidget(Button.builder(Component.literal("Konum: " + HudConfig.cornerLabel()), b -> {
			HudConfig.corner = (HudConfig.corner + 1) % 4;
			HudConfig.save();
			b.setMessage(Component.literal("Konum: " + HudConfig.cornerLabel()));
		}).bounds(col2, y, btnW, btnH).build());

		y += 26;
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

		y += 26;
		addRenderableWidget(Button.builder(toggleLabel("Koordinatlar", HudConfig.showCoords), b -> {
			HudConfig.showCoords = !HudConfig.showCoords;
			HudConfig.save();
			b.setMessage(toggleLabel("Koordinatlar", HudConfig.showCoords));
		}).bounds(col1, y, btnW, btnH).build());

		addRenderableWidget(Button.builder(toggleLabel("Pusula / Yön", HudConfig.showDirection), b -> {
			HudConfig.showDirection = !HudConfig.showDirection;
			HudConfig.save();
			b.setMessage(toggleLabel("Pusula / Yön", HudConfig.showDirection));
		}).bounds(col2, y, btnW, btnH).build());

		y += 26;
		addRenderableWidget(Button.builder(toggleLabel("Gerçek Saat", HudConfig.showClock), b -> {
			HudConfig.showClock = !HudConfig.showClock;
			HudConfig.save();
			b.setMessage(toggleLabel("Gerçek Saat", HudConfig.showClock));
		}).bounds(col1, y, btnW, btnH).build());

		addRenderableWidget(Button.builder(toggleLabel("Zırh Durumu", HudConfig.showArmor), b -> {
			HudConfig.showArmor = !HudConfig.showArmor;
			HudConfig.save();
			b.setMessage(toggleLabel("Zırh Durumu", HudConfig.showArmor));
		}).bounds(col2, y, btnW, btnH).build());

		y += 26;
		addRenderableWidget(Button.builder(toggleLabel("Fullbright", HudConfig.fullbright), b -> {
			HudConfig.toggleFullbright();
			b.setMessage(toggleLabel("Fullbright", HudConfig.fullbright));
		}).bounds(col1, y, btnW, btnH).build());

		addRenderableWidget(Button.builder(Component.literal("Varsayılana Sıfırla"), b -> {
			HudConfig.reset();
			clearWidgets();
			init();
		}).bounds(col2, y, btnW, btnH).build());

		y += 32;
		addRenderableWidget(Button.builder(Component.literal("Kaydet ve Kapat"), b -> onClose())
			.bounds(left + (CARD_W - 160) / 2, y, 160, 20).build());
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
		graphics.fill(0, 0, width, height, 0x88080812);
		int left = (width - CARD_W) / 2;
		int top = (height - CARD_H) / 2;
		graphics.fill(left, top, left + CARD_W, top + CARD_H, 0xF0121220);
		graphics.outline(left, top, CARD_W, CARD_H, 0xAA8B5CF6);
		graphics.fill(left + 1, top + 1, left + CARD_W - 1, top + 3, 0xFF8B5CF6);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
		super.extractRenderState(graphics, mouseX, mouseY, partialTick);
		int centerX = width / 2;
		int top = (height - CARD_H) / 2;
		graphics.centeredText(font, Component.literal("LumSMP Client • HUD Ayarları"), centerX, top + 12, 0xFFE9D5FF);
		graphics.centeredText(font, Component.literal("Sağ Shift ile aç/kapat • Değişiklikler anında kaydedilir"), centerX, top + 25, 0xFF9CA3AF);
	}
}
