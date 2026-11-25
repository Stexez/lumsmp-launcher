package tr.lumsmp.client.hud;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

/**
 * Fare ile sürükle-bırak HUD ve Spotify konum düzenleyicisi.
 */
public final class HudDragScreen extends Screen {
	private final Screen parent;
	private int draggingTarget = 0; // 0 = yok, 1 = ana HUD, 2 = Spotify
	private int offsetX;
	private int offsetY;

	public HudDragScreen(Screen parent) {
		super(Component.literal("HUD Konumu Düzenle"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		int y = height - 30;
		addRenderableWidget(Button.builder(Component.literal("Köşeye Sıfırla"), b -> HudConfig.resetPositions())
			.bounds(width / 2 - 124, y, 118, 20).build());
		addRenderableWidget(Button.builder(Component.literal("Kaydet ve Dön"), b -> {
			HudConfig.save();
			minecraft.gui.setScreen(parent);
		}).bounds(width / 2 + 6, y, 118, 20).build());
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (super.mouseClicked(event, doubleClick)) return true;
		int mx = (int) event.x();
		int my = (int) event.y();
		if (HudOverlay.lastSpVisible && inside(mx, my, HudOverlay.lastSpX, HudOverlay.lastSpY, HudOverlay.lastSpW, HudOverlay.lastSpH)) {
			draggingTarget = 2;
			offsetX = mx - HudOverlay.lastSpX;
			offsetY = my - HudOverlay.lastSpY;
			return true;
		}
		if (inside(mx, my, HudOverlay.lastHudX, HudOverlay.lastHudY, HudOverlay.lastHudW, HudOverlay.lastHudH)) {
			draggingTarget = 1;
			offsetX = mx - HudOverlay.lastHudX;
			offsetY = my - HudOverlay.lastHudY;
			return true;
		}
		return false;
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
		if (draggingTarget == 1) {
			HudConfig.hudX = Math.max(2, Math.min(width - HudOverlay.lastHudW - 2, (int) event.x() - offsetX));
			HudConfig.hudY = Math.max(2, Math.min(height - HudOverlay.lastHudH - 2, (int) event.y() - offsetY));
			return true;
		}
		if (draggingTarget == 2) {
			HudConfig.spotifyX = Math.max(2, Math.min(width - HudOverlay.lastSpW - 2, (int) event.x() - offsetX));
			HudConfig.spotifyY = Math.max(2, Math.min(height - HudOverlay.lastSpH - 2, (int) event.y() - offsetY));
			return true;
		}
		return super.mouseDragged(event, dx, dy);
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent event) {
		if (draggingTarget != 0) {
			draggingTarget = 0;
			HudConfig.save();
			return true;
		}
		return super.mouseReleased(event);
	}

	private static boolean inside(int mx, int my, int x, int y, int w, int h) {
		return mx >= x && mx <= x + w && my >= y && my <= y + h;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
		graphics.fill(0, 0, width, height, 0x55080912);
		// İnce merkez kılavuz çizgileri
		graphics.fill(width / 2, 0, width / 2 + 1, height, 0x22FFFFFF);
		graphics.fill(0, height / 2, width, height / 2 + 1, 0x22FFFFFF);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
		super.extractRenderState(graphics, mouseX, mouseY, partialTick);
		graphics.centeredText(font, Component.literal("§6HUD ve Spotify kartlarını fareyle istediğin yere sürükle"), width / 2, 14, 0xFFF8FAFC);
	}
}
