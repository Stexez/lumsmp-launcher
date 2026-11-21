package tr.lumsmp.client;

import java.util.List;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.packs.PackSelectionScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

/**
 * Ana menünün yerine geçen ekran. Açılışta otomatik olarak sunucuya bağlanır; atılınca sebebi gösterir.
 * Buradan yalnızca ayarlara ve kaynak paketlerine gidilebilir.
 */
public final class LumsmpScreen extends Screen {
	private final Component reason;

	public LumsmpScreen(Component reason) {
		super(Component.literal("LumSMP"));
		this.reason = reason;
	}

	private boolean waitingForAutoConnect() {
		return reason == null && !LumsmpClient.autoConnectDone;
	}

	@Override
	protected void init() {
		if (waitingForAutoConnect()) return;
		int x = width / 2 - 100;
		int y = height / 2 + 6;
		addRenderableWidget(Button.builder(Component.literal(reason == null ? "Sunucuya bağlan" : "Tekrar bağlan"),
			b -> LumsmpClient.connect(this)).bounds(x, y, 200, 20).build());
		y += 24;
		addRenderableWidget(Button.builder(Component.literal("Ayarlar"),
			b -> minecraft.gui.setScreen(new OptionsScreen(this, minecraft.options))).bounds(x, y, 98, 20).build());
		addRenderableWidget(Button.builder(Component.literal("Kaynak paketleri"), b -> openPacks()).bounds(x + 102, y, 98, 20).build());
		y += 24;
		addRenderableWidget(Button.builder(Component.literal("Oyunu kapat"), b -> { LumsmpClient.LOG.info("Oyunu kapat'a basıldı"); minecraft.stop(); }).bounds(x, y, 200, 20).build());
	}

	private void openPacks() {
		minecraft.gui.setScreen(new PackSelectionScreen(minecraft.getResourcePackRepository(), repository -> {
			minecraft.options.updateResourcePacks(repository);
			minecraft.gui.setScreen(this);
		}, minecraft.getResourcePackDirectory(), Component.translatable("resourcePack.title")));
	}

	@Override
	public void tick() {
		if (waitingForAutoConnect() && minecraft.isGameLoadFinished() && minecraft.gui.overlay() == null) {
			LumsmpClient.autoConnectDone = true;
			LumsmpClient.connect(this);
		}
	}

	@Override
	public boolean shouldCloseOnEsc() {
		return false;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
		if (waitingForAutoConnect()) {
			int below = LumsmpClient.drawCenteredLogo(graphics, width, height);
			graphics.centeredText(font, Component.literal("Sunucuya bağlanılıyor..."), width / 2, below + 14, 0xFFA9A6B8);
		} else {
			LumsmpClient.drawBackground(graphics, width, height);
		}
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
		super.extractRenderState(graphics, mouseX, mouseY, partialTick);
		if (waitingForAutoConnect()) return;
		int centerX = width / 2;
		if (reason != null) {
			graphics.centeredText(font, Component.literal("Sunucuyla bağlantı kesildi"), centerX, height / 2 - 52, 0xFFFF5D50);
			List<FormattedCharSequence> lines = font.split(reason, Math.min(320, width - 40));
			int y = height / 2 - 38;
			for (int i = 0; i < Math.min(3, lines.size()); i++) {
				graphics.centeredText(font, lines.get(i), centerX, y, 0xFFE3E0EE);
				y += font.lineHeight + 2;
			}
		} else {
			graphics.centeredText(font, Component.literal("lumcraft.com.tr"), centerX, height / 2 - 30, 0xFFA9A6B8);
		}
	}
}
