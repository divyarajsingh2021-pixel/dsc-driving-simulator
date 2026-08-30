// Shared road geometry used by the environment (visual road/markings),
// physics (lane boundary clamping), and traffic (oncoming vehicle lanes) —
// centralized here so all three systems always agree on where the road is.

export const LANE_WIDTH = 3.5; // meters
export const LANE_COUNT = 4;
export const ROAD_WIDTH = LANE_WIDTH * LANE_COUNT; // 14m across, 4 lanes
export const ROAD_HALF_WIDTH = ROAD_WIDTH / 2;

export const ROAD_LENGTH = 4000; // meters, total drivable stretch
export const ROAD_START_Z = -50;

// Lane center x-positions, left to right. Lanes 0-1 (x < 0) are the
// player's driving direction; lanes 2-3 (x > 0) carry oncoming traffic.
export const LANE_CENTERS = [
  -1.5 * LANE_WIDTH,
  -0.5 * LANE_WIDTH,
  0.5 * LANE_WIDTH,
  1.5 * LANE_WIDTH,
];

export const ONCOMING_LANE_CENTERS = [LANE_CENTERS[2], LANE_CENTERS[3]];

// Approximate half-width of the player's car, used to keep the car's edge
// (not just its center point) from clipping through the road boundary, and
// for the AABB collision check against oncoming traffic in main.js.
export const CAR_HALF_WIDTH = 0.95;
export const CAR_HALF_LENGTH = 2.15;