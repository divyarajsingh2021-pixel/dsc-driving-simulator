# 🏎️ DSC — Gesture-Controlled Driving Simulator

A 3D driving simulator built with **Three.js**, **Vite**, and **MediaPipe Hands** — drive using nothing but hand gestures in front of your webcam (or tilt-to-steer on mobile), through a four-lane road with real oncoming traffic, cycling day/rain/night weather, and a live score system.

---

## ✨ Features

- **Gesture-based controls** — point with your index finger to accelerate, tilt it left/right to steer. Powered by [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) running entirely in-browser.
- **Mobile support** — automatically switches to tilt-to-steer + hold-to-drive touch controls on phones, with a landscape-orientation prompt and a recenter-steering button.
- **Four-lane road** with correct lane markings (dashed lane splits, double-yellow center divider, solid edges) and hard road boundaries — the car physically can't cross the curb.
- **Oncoming traffic** — cars and trucks spawn ahead and drive toward you in the oncoming lanes, with collision detection that costs you points on impact.
- **Dynamic weather cycle** — smoothly transitions between sunny, rainy, and night, complete with rain particles, a gradient sky dome, and street lamps that brighten after dark.
- **3D positional engine audio** — a procedurally synthesized engine hum that pitches and swells with speed, spatially anchored to the car.
- **Custom vehicle models** — drop in your own `.glb` car/truck models; they're auto-scaled and re-centered regardless of how they were exported, with a procedural fallback shape if a model fails to load.
- **Live HUD** — analog speedometer, steering angle indicator, driver name, running score, and distance traveled.

---

## 🎮 Controls

| Platform | Steering | Throttle |
|---|---|---|
| **Desktop** | Point with your index finger (other fingers curled) and tilt it left/right | Hold the pointing gesture |
| **Mobile** | Tilt your device left/right (tap "Recenter Steering" to re-zero) | Hold the on-screen button |
| **Fallback** | Arrow keys / A, D | Arrow Up / W |

If webcam access is denied or hand tracking fails to start, keyboard controls take over automatically.

---

## 🛠️ Tech Stack

- [Three.js](https://threejs.org/) — 3D rendering
- [Vite](https://vitejs.dev/) — dev server & build tooling
- [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) + [Camera Utils](https://www.npmjs.com/package/@mediapipe/camera_utils) — real-time hand tracking
- Vanilla JavaScript (ES modules), no framework

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- A webcam (desktop) — not required on mobile, which uses touch/tilt controls instead

### Installation

```bash
git clone https://github.com/divyarajsingh2021-pixel/dsc-driving-simulator.git
cd dsc-driving-simulator
npm install
```

### Run locally

```bash
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`) in Chrome for best MediaPipe/WebGL support.

### Build for production

```bash
npm run build
npm run preview
```

---

## 📦 Adding your own vehicle models

Drop your own `.glb` files into `assets/models/`:

```
assets/models/
├── car.glb            # player's car
├── traffic-car.glb    # oncoming traffic cars
└── truck.glb          # oncoming trucks
```

Models are automatically scaled to a realistic length and re-centered on the ground, regardless of the units or pivot they were exported with. If a model fails to load, that vehicle type falls back to a simple procedural shape rather than breaking the game — check the browser console for load confirmations or errors.

---

## 📁 Project Structure

```
dsc-driving-simulator/
├── index.html              # markup, HUD layout, start/overlay screens
├── package.json
├── css/
│   ├── main.css             # base layout, start overlay, orientation lock
│   └── hud.css               # HUD panels, gauges, mobile controls
└── js/
    ├── main.js               # game loop, orchestration, control routing
    ├── scene.js               # lighting, fog, ground
    ├── camera.js              # third-person follow camera
    ├── renderer.js            # WebGL renderer setup
    ├── player.js              # vehicle model loading + positional audio
    ├── physics.js             # acceleration, steering, road boundaries
    ├── environment.js         # road, lane markings, trees, traffic lights, sky
    ├── traffic.js             # oncoming vehicle spawning & collision data
    ├── weather.js             # sunny/rainy/night cycle, rain particles
    ├── handTracking.js        # MediaPipe gesture recognition
    ├── touchControls.js       # mobile tilt/tap controls
    ├── ui.js                  # HUD DOM updates
    ├── roadConfig.js          # shared lane/road geometry constants
    └── modelUtils.js          # GLTF scale/pivot normalization helpers
```

---

## 🗺️ Roadmap / Ideas

- [ ] Curved road sections and intersections
- [ ] Checkpoints / lap-based scoring
- [ ] Real wheel spin/steer animation matched to custom model mesh names
- [ ] Leaderboard (local storage or backend)

---

## 📄 License

This project is open source. Add a license of your choice (MIT is a common, permissive default) — see [choosealicense.com](https://choosealicense.com/) if you're not sure which fits.