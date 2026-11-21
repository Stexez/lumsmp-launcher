package tr.lumsmp.client.mixin;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.DisconnectedScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import tr.lumsmp.client.LumsmpClient;
import tr.lumsmp.client.LumsmpScreen;

/** Ana menü, tek oyunculu ve sunucu listesi asla açılmaz. */
@Mixin(Gui.class)
public abstract class GuiMixin {
	@Inject(method = "setScreen", at = @At("HEAD"), cancellable = true)
	private void lumsmp$setScreen(Screen screen, CallbackInfo ci) {
		if (!LumsmpClient.active()) return;
		Minecraft minecraft = Minecraft.getInstance();
		Gui gui = (Gui) (Object) this;

		if (screen instanceof DisconnectedScreen disconnected) {
			LumsmpClient.LOG.info("Bağlantı kesildi, LumSMP ekranı açılıyor");
			ci.cancel();
			gui.setScreen(new LumsmpScreen(((DisconnectedScreenAccessor) disconnected).lumsmp$details().reason()));
			return;
		}

		// setScreen(null) dünya yokken kendi içinde ana menüyü açar; onu da yakalıyoruz.
		boolean menu = screen instanceof TitleScreen || screen instanceof JoinMultiplayerScreen
			|| screen instanceof SelectWorldScreen || (screen == null && minecraft.level == null);
		if (!menu) return;
		ci.cancel();
		if (LumsmpClient.joined) {
			// Oyuncu sunucudan kendi isteğiyle çıktı: oyun kapanır.
			LumsmpClient.LOG.info("Oyuncu sunucudan çıktı, oyun kapatılıyor");
			minecraft.stop();
			return;
		}
		Screen current = gui.screen();
		if (current instanceof LumsmpScreen || current instanceof ConnectScreen) return;
		gui.setScreen(new LumsmpScreen(null));
	}
}
