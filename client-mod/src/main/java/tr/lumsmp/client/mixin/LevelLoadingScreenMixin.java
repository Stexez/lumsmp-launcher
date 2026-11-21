package tr.lumsmp.client.mixin;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.GenericMessageScreen;
import net.minecraft.client.gui.screens.LevelLoadingScreen;
import net.minecraft.client.gui.screens.Screen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import tr.lumsmp.client.LumsmpClient;

/** Dünya yükleniyor / bekleme mesajı ekranları kendi arka planlarını çizer; onları da LumSMP zeminiyle değiştiririz. */
@Mixin({ LevelLoadingScreen.class, GenericMessageScreen.class })
public abstract class LevelLoadingScreenMixin {
	@Inject(method = "extractBackground", at = @At("HEAD"), cancellable = true)
	private void lumsmp$background(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick, CallbackInfo ci) {
		if (!LumsmpClient.active()) return;
		Screen self = (Screen) (Object) this;
		LumsmpClient.drawBackground(graphics, self.width, self.height);
		ci.cancel();
	}
}
