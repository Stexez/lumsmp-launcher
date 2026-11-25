package tr.lumsmp.client.mixin;

import net.minecraft.client.Minecraft;
import net.minecraft.client.KeyboardHandler;
import net.minecraft.client.input.KeyEvent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import tr.lumsmp.client.hud.HudConfigScreen;

/** Sağ Shift (GLFW 344) ile OneClient tarzı LumSMP HUD ayar menüsünü açar/kapatır. */
@Mixin(KeyboardHandler.class)
public abstract class KeyboardHandlerMixin {
	private static final int GLFW_PRESS = 1;
	private static final int GLFW_KEY_RIGHT_SHIFT = 344;

	@Inject(method = "keyPress", at = @At("TAIL"))
	private void lumsmp$onKeyPress(long window, int action, KeyEvent event, CallbackInfo ci) {
		if (action != GLFW_PRESS || event == null || event.key() != GLFW_KEY_RIGHT_SHIFT) return;
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return;
		if (mc.gui.screen() == null) {
			mc.gui.setScreen(new HudConfigScreen());
		} else if (mc.gui.screen() instanceof HudConfigScreen) {
			mc.gui.setScreen(null);
		}
	}
}
