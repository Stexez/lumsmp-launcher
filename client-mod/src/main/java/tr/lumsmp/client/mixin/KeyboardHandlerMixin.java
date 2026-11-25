package tr.lumsmp.client.mixin;

import net.minecraft.client.KeyboardHandler;
import net.minecraft.client.Minecraft;
import net.minecraft.client.input.KeyEvent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import tr.lumsmp.client.hud.HudConfigScreen;
import tr.lumsmp.client.hud.ZoomController;

/** Sağ Shift (344) ile HUD menüsünü açar/kapatır; C (67) ile akıcı yakınlaştırma yapar. */
@Mixin(KeyboardHandler.class)
public abstract class KeyboardHandlerMixin {
	private static final int GLFW_RELEASE = 0;
	private static final int GLFW_PRESS = 1;
	private static final int GLFW_KEY_RIGHT_SHIFT = 344;
	private static final int GLFW_KEY_C = 67;

	@Inject(method = "keyPress", at = @At("TAIL"))
	private void lumsmp$onKeyPress(long window, int action, KeyEvent event, CallbackInfo ci) {
		if (event == null) return;
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return;

		int key = event.key();
		if (key == GLFW_KEY_C) {
			if (action == GLFW_PRESS && mc.gui.screen() == null) {
				ZoomController.setZooming(true);
			} else if (action == GLFW_RELEASE) {
				ZoomController.setZooming(false);
			}
			return;
		}

		if (action == GLFW_PRESS && key == GLFW_KEY_RIGHT_SHIFT) {
			ZoomController.setZooming(false);
			if (mc.gui.screen() == null) {
				mc.gui.setScreen(new HudConfigScreen());
			} else if (mc.gui.screen() instanceof HudConfigScreen) {
				mc.gui.setScreen(null);
			}
		}
	}
}
