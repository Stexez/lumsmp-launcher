package tr.lumsmp.client;

import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;

/**
 * LumSMP Launcher'ın oyun içi modu. Launcher oyunu -Dlumsmp.server=host:port ile açar; bu değer yoksa
 * (ör. başka bir launcher) mod hiçbir şeye dokunmaz.
 */
public final class LumsmpClient implements ClientModInitializer {
	public static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger("LumSMP");
	public static final Identifier LOGO =Identifier.fromNamespaceAndPath("lumsmp", "textures/gui/logo.png");
	public static final int BACKGROUND = 0xFF0D0D17;
	private static final String SERVER = System.getProperty("lumsmp.server", "").trim();

	/** Oyuncu bu oturumda sunucuya en az bir kez girdi mi? Girdikten sonra ana menü isteği = oyundan çıkış. */
	public static volatile boolean joined;
	/** Açılışta otomatik bağlantı yalnızca bir kez yapılır. */
	public static boolean autoConnectDone;

	@Override
	public void onInitializeClient() {
	}

	public static boolean active() {
		return !SERVER.isEmpty() && ServerAddress.isValidAddress(SERVER);
	}

	public static void connect(Screen parent) {
		LOG.info("Sunucuya bağlanılıyor: {}", SERVER);
		Minecraft minecraft = Minecraft.getInstance();
		ConnectScreen.startConnecting(parent, minecraft, ServerAddress.parseString(SERVER),
			new ServerData("LumSMP", SERVER, ServerData.Type.OTHER), false, null);
	}

	/** Logoyu açılış ekranındaki Mojang logosuyla aynı yere ve boyuta çizer (geçişte logo yerinde kalır). */
	public static int drawCenteredLogo(GuiGraphicsExtractor graphics, int width, int height) {
		graphics.fill(0, 0, width, height, BACKGROUND);
		int logoHeight = (int) (Math.min(width * 0.75, height) * 0.25);
		int halfWidth = logoHeight * 2;
		int top = height / 2 - logoHeight / 2;
		graphics.blit(RenderPipelines.GUI_TEXTURED, LOGO, width / 2 - halfWidth, top, 0f, 0f,
			halfWidth * 2, logoHeight, 256, 64, 256, 64, 0xFFFFFFFF);
		return top + logoHeight;
	}

	/** Bağlanma / yükleme ekranlarının arkasındaki LumSMP zemini; logo yazıların üstünde durur. */
	public static void drawBackground(GuiGraphicsExtractor graphics, int width, int height) {
		graphics.fill(0, 0, width, height, BACKGROUND);
		int logoWidth = Math.min(256, width - 40);
		int logoHeight = logoWidth / 4;
		int top = Math.max(10, height / 2 - 70 - logoHeight);
		graphics.blit(RenderPipelines.GUI_TEXTURED, LOGO, (width - logoWidth) / 2, top, 0f, 0f,
			logoWidth, logoHeight, 256, 64, 256, 64, 0xFFFFFFFF);
	}
}
