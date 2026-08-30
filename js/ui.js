const GAUGE_SWEEP_DEGREES = 130; // total sweep of the needle, centered
const MAX_STEER_DEGREES_FOR_BAR = 32; // matches physics.js MAX_STEER_ANGLE

/**
 * Handles all HUD DOM updates: speedometer needle + digital readout,
 * steering angle text + indicator bar, and acceleration status text.
 * Caches element references once at construction to avoid repeated
 * getElementById calls in the render loop.
 */
export class UI {
  constructor() {
    this.speedValueEl = document.getElementById('hud-speed-value');
    this.steerValueEl = document.getElementById('hud-steer-value');
    this.statusValueEl = document.getElementById('hud-status-value');
    this.handsValueEl = document.getElementById('hud-hands-value');
    this.statusPanelEl = document.getElementById('hud-status-panel');
    this.gaugeNeedleEl = document.getElementById('gauge-needle');
    this.steerBarFillEl = document.getElementById('steer-bar-fill');
    this.scoreValueEl = document.getElementById('hud-score-value');
    this.distanceValueEl = document.getElementById('hud-distance-value');
    this.playerNameEl = document.getElementById('hud-player-name');
  }

  /** Sets the driver name shown in the top-right HUD panel. Call once at start. */
  setPlayerName(name) {
    if (this.playerNameEl) {
      this.playerNameEl.textContent = name;
    }
  }

  /**
   * @param {Object} state
   * @param {number} state.speedKmh - Signed speed in km/h.
   * @param {number} state.steerDegrees - Signed steering angle in degrees.
   * @param {boolean} state.accelerating - Whether throttle is currently applied.
   * @param {number} state.handsDetected - Number of hands MediaPipe currently sees.
   * @param {number} state.speedRatio - Absolute speed normalized 0..1.
   * @param {number} [state.score] - Accumulated score.
   * @param {number} [state.distanceMeters] - Total forward distance driven, in meters.
   * @param {boolean} [state.collided] - Whether a collision flash is currently active.
   * @param {boolean} [state.usingTouchControls] - Whether mobile tilt/tap controls are active.
   */
  update({
    speedKmh,
    steerDegrees,
    accelerating,
    handsDetected,
    speedRatio,
    score,
    distanceMeters,
    collided,
    usingTouchControls,
  }) {
    if (this.speedValueEl) {
      this.speedValueEl.textContent = Math.round(Math.abs(speedKmh)).toString().padStart(3, '0');
    }

    if (this.steerValueEl) {
      const sign = steerDegrees >= 0 ? '+' : '';
      this.steerValueEl.textContent = `${sign}${steerDegrees.toFixed(0)}°`;
    }

    if (this.statusValueEl) {
      this.statusValueEl.textContent = collided ? 'COLLISION!' : accelerating ? 'ACCELERATING' : 'IDLE';
    }

    if (this.statusPanelEl) {
      this.statusPanelEl.classList.toggle('is-active', !!accelerating && !collided);
      this.statusPanelEl.classList.toggle('is-collision', !!collided);
    }

    if (this.handsValueEl) {
      if (usingTouchControls) {
        this.handsValueEl.textContent = 'TILT TO STEER · HOLD TO DRIVE';
      } else {
        this.handsValueEl.textContent =
          handsDetected > 0
            ? `${handsDetected} HAND${handsDetected > 1 ? 'S' : ''} TRACKED`
            : 'NO HANDS DETECTED';
      }
    }

    if (this.gaugeNeedleEl) {
      const ratio = clamp(speedRatio, 0, 1);
      const rotation = -GAUGE_SWEEP_DEGREES / 2 + ratio * GAUGE_SWEEP_DEGREES;
      this.gaugeNeedleEl.style.transform = `rotate(${rotation}deg)`;
    }

    if (this.steerBarFillEl) {
      const pct = clamp(steerDegrees / MAX_STEER_DEGREES_FOR_BAR, -1, 1) * 50;
      this.steerBarFillEl.style.transform = `translateX(${pct}%)`;
    }

    if (this.scoreValueEl && typeof score === 'number') {
      this.scoreValueEl.textContent = Math.floor(score).toLocaleString();
    }

    if (this.distanceValueEl && typeof distanceMeters === 'number') {
      this.distanceValueEl.textContent = `${Math.floor(distanceMeters)} M`;
    }
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}