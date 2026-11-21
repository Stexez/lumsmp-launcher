package tr.lumsmp.client.mixin;

import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.game.ClientboundLoginPacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import tr.lumsmp.client.LumsmpClient;

@Mixin(ClientPacketListener.class)
public abstract class ClientPacketListenerMixin {
	@Inject(method = "handleLogin", at = @At("TAIL"))
	private void lumsmp$joined(ClientboundLoginPacket packet, CallbackInfo ci) {
		LumsmpClient.joined = true;
	}
}
