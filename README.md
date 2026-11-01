# OrbiPeak
### 👑 OrbiPeak — v1.1.0 Initial Release
_**3D Aesthetic Pastel Obby & Continuous World Platformer — MADE BY SOU.**_

**OrbiPeak** is a zero-dependency, single-file 3D-styled pastel platformer and obstacle course (Obby) built with HTML5 Canvas, Tailwind CSS, and Web Audio synthesis. Ascend 48 procedurally generated tiers from the unbreakable Solid Base to the **Celestial Win Sanctuary** at the peak while wrapping seamlessly across world boundaries, shifting speed gears on the fly, and collecting volumetric 3D fruits.

---

### 🌐 Core Gameplay & Physics
* **Procedural 48-Tier Obby Generation:** Every run and respawn dynamically randomizes platform layouts, moving islands, bounce pads, fruit clusters, and patrolling hazards so no two climbs are identical.
* **Continuous Wrap-Around World:** Seamless horizontal world wrapping (`2400px` span) lets you exit the left boundary wall and instantly emerge on the right side (and vice versa) with portal shimmer effects.
* **Dynamic Speed Gear System (`0.40x` – `2.50x`):** Real-time acceleration (`A`) and deceleration (`D`) shifts your movement between **Precision**, **Cruise**, **Turbo**, and **Hyper 3D** gears, complete with dynamic aura colors and speed trails.
* **Expressive 3D Spherical Physics:** Features double-jumping, squash-and-stretch animations, jump puff particles, moving platform momentum transfer, and high-velocity pink bounce pads.

---

### 🪐 4 Playable Geotype Biomes
Switch environments anytime from the main menu or mid-game HUD, each featuring custom gravity, surface friction, atmospheric lighting, and organic surface details:
1. **🌿 Pastel Meadow:** Balanced gravity (`0.56`) and friction (`0.85`) with swaying 3D grass blades, wildflowers, and floating pollen.
2. **🪨 Canyon Crags:** Heavier gravity (`0.58`) with warm sandstone platforms, rose-quartz crystals, and canyon dust.
3. **🫧 Abyssal Reef:** Buoyant underwater physics (`0.40` gravity, `0.88` friction) with animated light caustics, swaying kelp, coral, and rising bubbles.
4. **❄️ Alpine Frost:** Low-friction glossy ice physics (`0.91` friction) featuring an animated pastel Aurora Borealis, hanging icicles, and falling snow.

---

### 🍓 Collectibles, Combos & Hazards
* **Volumetric 3D Fruits:** Collect Apples (`100 pts`), Peaches (`150 pts`), Blueberries (`200 pts`), Strawberries (`250 pts`), and rare Golden Mangoes (`500 pts`).
* **Combo Multiplier:** Chain fruit pickups within a 3.5-second window to scale your score multiplier up to `x5 COMBO`.
* **Rose-Quartz Spiky Hazards:** Dodge rotating, patrolling spike orbs that deduct `100 pts` on impact, reset you to the base, and reshuffle the obby terrain.

---

### 📱 Glassmorphism UI & Cross-Device Controls
* **Dynamic Island HUD:** Real-time tracking for Score, Fruit count, Speed Gear gauge, and an Obby Peak elevation progress bar.
* **Dual Input Modes:** Auto-detects and supports instant switching between **Laptop/Desktop Keyboard** controls and an on-screen **Smartphone/Tablet Multi-Touch** controller.
* **Zero-Asset Web Audio Synth:** Custom polyphonic sound engine generating procedural jump tones, chord fanfares, fruit arpeggios, and portal whooshes using the native Web Audio API.
* **Cloud & Session High Scores:** Tracks Best Score, Most Fruits, Best Completion Time, and per-biome records via Firebase Firestore and local session state.

---

### 🎮 Controls

| Action | 💻 Laptop / Desktop | 📱 Smartphone / Touch |
| :--- | :--- | :--- |
| **Move Left / Right** | `◀` / `▶` Arrow Keys | Left / Right Touch Pads |
| **Jump / Double Jump** | `▲` Arrow or `Space` | Up Arrow Jump Button |
| **Accelerate (Speed +)** | `A` Key (Tap or Hold) | `A` ACCEL + Button |
| **Decelerate (Speed -)** | `D` Key (Tap or Hold) | `D` DECEL - Button |
| **Respawn & Shuffle Obby** | `R` Key or HUD Button | Shuffle Obby HUD Button |

---

### 🛠️ Tech Stack
* **Rendering:** HTML5 `<canvas>` with custom 2D volumetric gradients, specular highlights, and multi-layer parallax backgrounds.
* **Styling & UI:** Tailwind CSS, backdrop-filter glassmorphism, Fonts (`Outfit` & `Inter`), and Phosphor Icons.
* **Audio:** Native Web Audio API (`AudioContext` oscillators and gain envelopes).
* **Persistence:** Firebase v11.6.1 (Auth & Firestore).

---

### 🚀 How to Run
No build step or local server required:
1. Download `OrbiPeak.html`  from the release assets.
2. Open the file directly in any modern desktop or mobile web browser.
