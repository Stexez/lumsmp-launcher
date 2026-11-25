package tr.lumsmp.client.hud;

/**
 * C tuşuyla akıcı yakınlaştırma (Zoom) kontrolcüsü — harici mod gerektirmez.
 */
public final class ZoomController {
	private static volatile boolean zooming;
	private static float currentMult = 1.0f;
	private static long lastNanos = System.nanoTime();

	private ZoomController() {}

	public static void setZooming(boolean active) {
		zooming = active;
	}

	public static boolean isZooming() {
		return zooming && HudConfig.zoomEnabled;
	}

	public static float applyFov(float baseFov) {
		long now = System.nanoTime();
		float dt = Math.min(0.1f, (now - lastNanos) / 1_000_000_000f);
		lastNanos = now;

		float target = isZooming() ? 0.28f : 1.0f;
		float speed = 14.0f;
		currentMult += (target - currentMult) * Math.min(1.0f, dt * speed);
		if (Math.abs(currentMult - 1.0f) < 0.002f && target == 1.0f) {
			currentMult = 1.0f;
		}
		return baseFov * currentMult;
	}
}
