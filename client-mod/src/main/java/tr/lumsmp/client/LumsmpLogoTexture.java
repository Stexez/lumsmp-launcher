package tr.lumsmp.client;

import com.mojang.blaze3d.platform.NativeImage;
import java.io.IOException;
import java.io.InputStream;
import net.minecraft.client.renderer.texture.MipmapStrategy;
import net.minecraft.client.renderer.texture.ReloadableTexture;
import net.minecraft.client.renderer.texture.TextureContents;
import net.minecraft.client.resources.metadata.texture.TextureMetadataSection;
import net.minecraft.server.packs.resources.ResourceManager;

/** Yükleme ekranı, kaynaklar henüz yüklenmeden çizildiği için logo doğrudan mod dosyasından okunur. */
public final class LumsmpLogoTexture extends ReloadableTexture {
	public LumsmpLogoTexture() {
		super(LumsmpClient.LOGO);
	}

	@Override
	public TextureContents loadContents(ResourceManager resourceManager) throws IOException {
		try (InputStream in = LumsmpLogoTexture.class.getResourceAsStream("/assets/lumsmp/textures/gui/logo.png")) {
			if (in == null) throw new IOException("LumSMP logosu bulunamadı");
			return new TextureContents(NativeImage.read(in), new TextureMetadataSection(false, true, MipmapStrategy.MEAN,
				TextureMetadataSection.DEFAULT_ALPHA_CUTOFF_BIAS));
		}
	}
}
