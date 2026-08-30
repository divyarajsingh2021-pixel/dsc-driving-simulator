import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

// Landmark indices (MediaPipe Hands topology)
const WRIST = 0;
const INDEX_PIP = 6;
const INDEX_TIP = 8;
const MIDDLE_PIP = 10;
const MIDDLE_TIP = 12;
const RING_PIP = 14;
const RING_TIP = 16;
const PINKY_PIP = 18;
const PINKY_TIP = 20;

// A finger counts as "extended" when its tip sits meaningfully farther
// from the wrist than its PIP joint does. This distance-based test (vs.
// comparing raw y-coordinates) keeps working even as the hand tilts to
// steer, instead of only working when the hand is held perfectly upright.
const EXTENSION_RATIO = 1.15;

// How much the pointing finger needs to tilt to reach full steering lock.
const FULL_LOCK_RAD = (60 * Math.PI) / 180;

// Exponential smoothing factors (0..1). Higher = snappier, lower = smoother
// but laggier. Steering is deliberately calmer than throttle so small hand
// jitter doesn't swing the car side to side.
const STEER_SMOOTHING = 0.22;
const THROTTLE_SMOOTHING = 0.35;

/**
 * Wraps @mediapipe/hands + @mediapipe/camera_utils to derive driving
 * controls from a single gesture: point with your index finger (other
 * fingers curled) to accelerate, and tilt that pointing finger left/right
 * to steer in that direction. Dropping the gesture (open hand, fist, no
 * hand visible) smoothly releases the throttle and straightens the wheel.
 */
export class HandTracking {
  constructor(videoElement, { onResults } = {}) {
    this.videoElement = videoElement;
    this.onResultsCallback = onResults || (() => {});

    this.latest = {
      steerNormalized: 0,
      throttleNormalized: 0,
      handsDetected: 0,
      pointing: false,
      ready: false,
    };

    this.hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0, // "lite" model — noticeably faster inference per frame
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    this.hands.onResults((results) => this._handleResults(results));

    // Guards against frame backlog: if inference on the previous frame
    // hasn't finished yet, skip sending the new one instead of queuing it,
    // which is what actually causes input lag to build up over time.
    this._sending = false;

    this.camera = new Camera(this.videoElement, {
      onFrame: async () => {
        if (this._sending) return;
        this._sending = true;
        try {
          await this.hands.send({ image: this.videoElement });
        } finally {
          this._sending = false;
        }
      },
      width: 480,
      height: 360,
    });
  }

  /** Requests webcam access and begins sending frames to MediaPipe. */
  async start() {
    await this.camera.start();
    this.latest.ready = true;
  }

  /** Stops the webcam capture loop. */
  stop() {
    this.camera.stop();
    this.latest.ready = false;
  }

  _handleResults(results) {
    const landmarksList = results.multiHandLandmarks || [];
    this.latest.handsDetected = landmarksList.length;

    const pointingHand = landmarksList.find((hand) => this._isPointingGesture(hand));

    if (pointingHand) {
      this.latest.pointing = true;
      this._computeSteerFromFingerTilt(pointingHand);
      this.latest.throttleNormalized = lerp(this.latest.throttleNormalized, 1, THROTTLE_SMOOTHING);
    } else {
      this.latest.pointing = false;
      // No pointing gesture: release the throttle and straighten out
      // rather than snapping instantly, so a brief tracking drop doesn't
      // feel like slamming the brakes or yanking the wheel.
      this.latest.throttleNormalized = lerp(this.latest.throttleNormalized, 0, THROTTLE_SMOOTHING);
      this.latest.steerNormalized = lerp(this.latest.steerNormalized, 0, STEER_SMOOTHING);
    }

    this.onResultsCallback(this.latest, results);
  }

  /**
   * True when the index finger is extended and the middle, ring, and
   * pinky fingers are curled — a single-finger "point" gesture. Thumb
   * position is intentionally ignored since it varies a lot between
   * people's grips and isn't needed to distinguish this gesture.
   */
  _isPointingGesture(hand) {
    const indexExtended = this._isFingerExtended(hand, INDEX_TIP, INDEX_PIP);
    const middleCurled = !this._isFingerExtended(hand, MIDDLE_TIP, MIDDLE_PIP);
    const ringCurled = !this._isFingerExtended(hand, RING_TIP, RING_PIP);
    const pinkyCurled = !this._isFingerExtended(hand, PINKY_TIP, PINKY_PIP);
    return indexExtended && middleCurled && ringCurled && pinkyCurled;
  }

  _isFingerExtended(hand, tipIndex, pipIndex) {
    const wrist = hand[WRIST];
    const tipDistance = _distance(wrist, hand[tipIndex]);
    const pipDistance = _distance(wrist, hand[pipIndex]);
    return tipDistance > pipDistance * EXTENSION_RATIO;
  }

  /**
   * Steering from the pointing finger's tilt: the angle of the vector from
   * the index MCP-adjacent PIP joint to the fingertip, relative to
   * straight up. Tilting the fingertip toward your left/right steers the
   * car that way.
   */
  _computeSteerFromFingerTilt(hand) {
    const base = hand[INDEX_PIP];
    const tip = hand[INDEX_TIP];

    const dx = tip.x - base.x;
    const dy = tip.y - base.y;
    const angle = Math.atan2(dx, -dy); // 0 = fingertip pointing straight up

    const normalized = clamp(angle / FULL_LOCK_RAD, -1, 1);
    this.latest.steerNormalized = lerp(this.latest.steerNormalized, normalized, STEER_SMOOTHING);
  }
}

function _distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}