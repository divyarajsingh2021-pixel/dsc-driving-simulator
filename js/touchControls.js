const STEER_MAX_TILT_DEG = 30; // device left/right tilt for full steering lock
const STEER_SMOOTHING = 0.25;
const THROTTLE_SMOOTHING = 0.3;

/**
 * Mobile control scheme: tilt the device left/right to steer (via the
 * DeviceOrientation API's gamma angle), and hold a big on-screen button to
 * accelerate. Exposes the same { steerNormalized, throttleNormalized,
 * handsDetected } shape as HandTracking's `latest` object so main.js can
 * treat it as a drop-in input source.
 */
export class TouchControls {
  constructor({ onUpdate } = {}) {
    this.onUpdate = onUpdate || (() => {});
    this.latest = { steerNormalized: 0, throttleNormalized: 0, handsDetected: 0 };

    this.baselineGamma = 0;
    this._pendingCalibration = true; // auto-calibrate on the first reading
    this.throttleActive = false;
    this._running = false;

    this._handleOrientation = this._handleOrientation.bind(this);
    this._tick = this._tick.bind(this);
  }

  /**
   * Requests device-orientation permission (required on iOS 13+, must be
   * called from a user gesture), wires up the throttle button, and starts
   * the update loop.
   */
  async start(throttleButtonEl) {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response !== 'granted') {
          console.warn('[TouchControls] Device orientation permission denied — steering will stay centered. Only the throttle button will work.');
        }
      } catch (err) {
        console.warn('[TouchControls] Device orientation permission request failed.', err);
      }
    }

    window.addEventListener('deviceorientation', this._handleOrientation);

    if (throttleButtonEl) {
      const activate = (event) => {
        event.preventDefault();
        this.throttleActive = true;
      };
      const deactivate = (event) => {
        event.preventDefault();
        this.throttleActive = false;
      };
      throttleButtonEl.addEventListener('touchstart', activate, { passive: false });
      throttleButtonEl.addEventListener('touchend', deactivate);
      throttleButtonEl.addEventListener('touchcancel', deactivate);
      // Mouse events too, so this also works when testing in a desktop
      // browser's device-emulation mode.
      throttleButtonEl.addEventListener('mousedown', activate);
      throttleButtonEl.addEventListener('mouseup', deactivate);
      throttleButtonEl.addEventListener('mouseleave', deactivate);
    }

    this._running = true;
    this._tick();
  }

  stop() {
    this._running = false;
    window.removeEventListener('deviceorientation', this._handleOrientation);
  }

  /**
   * Re-zeroes steering to the device's current tilt. Called automatically
   * on the first orientation reading, and can be wired to a "recenter"
   * button so players don't have to hold the phone perfectly flat.
   */
  calibrate() {
    this._pendingCalibration = true;
  }

  _handleOrientation(event) {
    if (event.gamma === null || event.gamma === undefined) return;

    if (this._pendingCalibration) {
      this.baselineGamma = event.gamma;
      this._pendingCalibration = false;
    }

    const relativeTilt = event.gamma - this.baselineGamma;
    const normalized = clamp(relativeTilt / STEER_MAX_TILT_DEG, -1, 1);
    this.latest.steerNormalized = lerp(this.latest.steerNormalized, normalized, STEER_SMOOTHING);
  }

  _tick() {
    if (!this._running) return;
    this.latest.throttleNormalized = lerp(this.latest.throttleNormalized, this.throttleActive ? 1 : 0, THROTTLE_SMOOTHING);
    this.onUpdate(this.latest);
    requestAnimationFrame(this._tick);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}