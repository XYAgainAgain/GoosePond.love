import { COPY } from "../copy.ts";

type Permission = { requestPermission?: () => Promise<"granted" | "denied"> };

// window.orientation: Safari without screen.orientation.
const screenAngle = () =>
  ((screen.orientation?.angle ?? (globalThis as { orientation?: number }).orientation ?? 0) + 360) %
  360;

/** Smoothed offsets on screen right and down, each in [−1, 1]. */
export class Tilt {
  x = 0;
  y = 0;
  /** Screen-relative degrees; null before the first reading. */
  private raw: [number, number] | null = null;
  private rest: [number, number] | null = null;
  private angle = 0;
  /** Bumped to drop a stale permission answer. */
  private attempt = 0;
  private readonly read = (event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null) return;
    const b = event.beta, g = event.gamma, angle = screenAngle();
    if (angle !== this.angle) this.rest = null;
    this.angle = angle;
    switch (angle) {
      case 90:
        this.raw = [b, -g];
        break;
      case 180:
        this.raw = [-g, -b];
        break;
      case 270:
        this.raw = [-b, g];
        break;
      default:
        this.raw = [g, b];
    }
  };

  get sensing() {
    return this.raw !== null;
  }

  /** Call from a user gesture (iOS permission). Resolves to an error message, or "". */
  async enable() {
    const attempt = ++this.attempt;
    if (!isSecureContext) return COPY.pond.tilt.insecure;
    const gate = (globalThis as { DeviceOrientationEvent?: Permission }).DeviceOrientationEvent;
    if (!gate) return COPY.pond.tilt.noSensors;
    if (typeof gate.requestPermission === "function") {
      const answer = await gate.requestPermission().catch(() => "denied");
      if (attempt !== this.attempt) return "";
      if (answer !== "granted") return COPY.pond.tilt.refused;
    }
    addEventListener("deviceorientation", this.read);
    return "";
  }

  disable() {
    this.attempt++;
    removeEventListener("deviceorientation", this.read);
    this.raw = this.rest = null;
    this.x = this.y = 0;
  }

  update(dt: number) {
    let tx = 0, ty = 0;
    if (this.raw) {
      const rest = this.rest ??= [...this.raw];
      // The rest pose drifts to a newly held angle to recenter.
      const follow = 1 - Math.exp(-dt / 4);
      rest[0] += (this.raw[0] - rest[0]) * follow;
      rest[1] += (this.raw[1] - rest[1]) * follow;
      tx = Math.max(-1, Math.min(1, (this.raw[0] - rest[0]) / 20));
      ty = Math.max(-1, Math.min(1, (this.raw[1] - rest[1]) / 20));
    }
    const ease = 1 - Math.exp(-dt * 10);
    this.x += (tx - this.x) * ease;
    this.y += (ty - this.y) * ease;
  }
}
