package tr.lumsmp.client.mixin;

import net.minecraft.client.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import tr.lumsmp.client.hud.ZoomController;

/** C tuşuyla akıcı FOV yakınlaştırması sağlar. */
@Mixin(Camera.class)
public abstract class CameraMixin {
	@Inject(method = "calculateFov", at = @At("RETURN"), cancellable = true)
	private void lumsmp$applyZoom(float partialTick, CallbackInfoReturnable<Float> cir) {
		cir.setReturnValue(ZoomController.applyFov(cir.getReturnValueF()));
	}
}
