package tr.lumsmp.client.mixin;

import com.mojang.renderpearl.api.pipeline.RenderPipeline;
import java.util.function.IntSupplier;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.LoadingOverlay;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.texture.TextureManager;
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import tr.lumsmp.client.LumsmpClient;
import tr.lumsmp.client.LumsmpLogoTexture;

/** Oyunun açılış (Mojang) yükleme ekranı: LumSMP renkleri ve logosu. */
@Mixin(LoadingOverlay.class)
public abstract class LoadingOverlayMixin {
	private static final String BLIT = "Lnet/minecraft/client/gui/GuiGraphicsExtractor;blit(Lcom/mojang/renderpearl/api/pipeline/RenderPipeline;Lnet/minecraft/resources/Identifier;IIFFIIIIIII)V";

	@Inject(method = "registerTextures", at = @At("TAIL"))
	private static void lumsmp$registerLogo(TextureManager textures, CallbackInfo ci) {
		if (LumsmpClient.active()) textures.registerAndLoad(LumsmpClient.LOGO, new LumsmpLogoTexture());
	}

	@Redirect(method = "extractRenderState", at = @At(value = "INVOKE", target = "Ljava/util/function/IntSupplier;getAsInt()I"))
	private int lumsmp$backgroundColor(IntSupplier original) {
		return LumsmpClient.active() ? LumsmpClient.BACKGROUND : original.getAsInt();
	}

	// Mojang logosu iki yarım halinde çizilir: ilk yarının yerine bütün LumSMP logosunu, ikincinin yerine hiçbir şey çizeriz.
	@Redirect(method = "extractRenderState", at = @At(value = "INVOKE", ordinal = 0, target = BLIT))
	private void lumsmp$logoLeft(GuiGraphicsExtractor graphics, RenderPipeline pipeline, Identifier texture, int x, int y, float u, float v,
			int width, int height, int regionWidth, int regionHeight, int textureWidth, int textureHeight, int color) {
		if (!LumsmpClient.active()) {
			graphics.blit(pipeline, texture, x, y, u, v, width, height, regionWidth, regionHeight, textureWidth, textureHeight, color);
			return;
		}
		graphics.blit(RenderPipelines.GUI_TEXTURED, LumsmpClient.LOGO, x, y, 0f, 0f, width * 2, height, 256, 64, 256, 64, color);
	}

	@Redirect(method = "extractRenderState", at = @At(value = "INVOKE", ordinal = 1, target = BLIT))
	private void lumsmp$logoRight(GuiGraphicsExtractor graphics, RenderPipeline pipeline, Identifier texture, int x, int y, float u, float v,
			int width, int height, int regionWidth, int regionHeight, int textureWidth, int textureHeight, int color) {
		if (!LumsmpClient.active()) {
			graphics.blit(pipeline, texture, x, y, u, v, width, height, regionWidth, regionHeight, textureWidth, textureHeight, color);
		}
	}
}
