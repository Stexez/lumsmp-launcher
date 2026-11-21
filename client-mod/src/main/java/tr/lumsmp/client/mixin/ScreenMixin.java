package tr.lumsmp.client.mixin;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import tr.lumsmp.client.LumsmpClient;

/** Bağlanma ve bekleme ekranlarının arkasına LumSMP zemini. */
@Mixin(Screen.class)
public abstract class ScreenMixin {
	@Inject(method = "extractBackground", at = @At("HEAD"), cancellable = true)
	private void lumsmp$background(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick, CallbackInfo ci) {
		Screen self = (Screen) (Object) this;
		if (LumsmpClient.active() && self instanceof ConnectScreen) {
			LumsmpClient.drawBackground(graphics, self.width, self.height);
			ci.cancel();
		}
	}
}
