package tr.lumsmp.client.mixin;

import net.minecraft.client.Minecraft;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.input.MouseButtonInfo;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import tr.lumsmp.client.hud.HudOverlay;

/** Sol/sağ tık CPS sayacı için tıklamaları kaydeder. */
@Mixin(MouseHandler.class)
public abstract class MouseHandlerMixin {
	@Inject(method = "onButton", at = @At("HEAD"))
	private void lumsmp$onMouseButton(long window, MouseButtonInfo info, int action, CallbackInfo ci) {
		if (action != 1 || info == null) return;
		Minecraft mc = Minecraft.getInstance();
		if (mc.level != null && mc.gui.screen() == null) {
			HudOverlay.recordClick(info.button());
		}
	}
}
