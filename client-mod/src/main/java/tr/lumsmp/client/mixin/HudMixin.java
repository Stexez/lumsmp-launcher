package tr.lumsmp.client.mixin;

import net.minecraft.client.DeltaTracker;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.Hud;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import tr.lumsmp.client.hud.HudConfig;
import tr.lumsmp.client.hud.HudOverlay;

/** Oyun içi LumSMP HUD, Keystrokes, Spotify ve özel Crosshair katmanlarını çizer. */
@Mixin(Hud.class)
public abstract class HudMixin {
	@Inject(method = "extractRenderState", at = @At("TAIL"))
	private void lumsmp$renderHud(GuiGraphicsExtractor graphics, DeltaTracker deltaTracker, CallbackInfo ci) {
		HudOverlay.render(graphics);
	}

	@Inject(method = "extractCrosshair", at = @At("HEAD"), cancellable = true)
	private void lumsmp$customCrosshair(GuiGraphicsExtractor graphics, DeltaTracker deltaTracker, CallbackInfo ci) {
		HudConfig.load();
		if (HudConfig.crosshairStyle > 0) {
			ci.cancel();
			HudOverlay.renderCrosshair(graphics);
		}
	}
}
