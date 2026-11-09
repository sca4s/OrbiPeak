import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/********************************************************************
 * 1. STATE & PERSISTENCE (FIRESTORE + IN-MEMORY STATE)
 ********************************************************************/
const highScoresState = {
    bestScore: 0,
    bestFruits: 0,
    bestTimeSec: null,
    byBiome: {
        grass: 0,
        rock: 0,
        underwater: 0,
        snow: 0
    }
};

let db = null;
let auth = null;
let currentUser = null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'mariana-obby-sou';

async function initCloudStorage() {
    try {
        if (typeof __firebase_config !== 'undefined' && __firebase_config) {
            const firebaseConfig = JSON.parse(__firebase_config);
            const app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);

            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }

            onAuthStateChanged(auth, (user) => {
                currentUser = user;
                if (currentUser) {
                    subscribeToHighScores();
                }
            });
        } else {
            updateHighScoreUI();
        }
    } catch (err) {
        console.warn("Running with session high score memory:", err);
        updateHighScoreUI();
    }
}

function subscribeToHighScores() {
    if (!currentUser || !db) return;
    const userId = currentUser.uid;
    const userScoreDocRef = doc(db, 'artifacts', appId, 'users', userId, 'mariana_stats', 'summary');
    onSnapshot(
        userScoreDocRef,
        (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (typeof data.bestScore === 'number') highScoresState.bestScore = Math.max(highScoresState.bestScore, data.bestScore);
                if (typeof data.bestFruits === 'number') highScoresState.bestFruits = Math.max(highScoresState.bestFruits, data.bestFruits);
                if (typeof data.bestTimeSec === 'number') {
                    if (highScoresState.bestTimeSec === null || data.bestTimeSec < highScoresState.bestTimeSec) {
                        highScoresState.bestTimeSec = data.bestTimeSec;
                    }
                }
                if (data.byBiome) {
                    highScoresState.byBiome = { ...highScoresState.byBiome, ...data.byBiome };
                }
                updateHighScoreUI();
            }
        },
        (err) => {
            console.warn("Firestore snapshot notice:", err);
        }
    );
}

async function saveHighScore(scoreVal, fruitsVal, timeSec, biomeKey) {
    if (scoreVal > highScoresState.bestScore) {
        highScoresState.bestScore = scoreVal;
    }
    if (fruitsVal > highScoresState.bestFruits) {
        highScoresState.bestFruits = fruitsVal;
    }
    if (timeSec !== null && timeSec > 0 && (highScoresState.bestTimeSec === null || timeSec < highScoresState.bestTimeSec)) {
        highScoresState.bestTimeSec = timeSec;
    }
    if (biomeKey && scoreVal > (highScoresState.byBiome[biomeKey] || 0)) {
        highScoresState.byBiome[biomeKey] = scoreVal;
    }

    updateHighScoreUI();

    if (!currentUser || !db) return;
    try {
        const userId = currentUser.uid;
        const userScoreDocRef = doc(db, 'artifacts', appId, 'users', userId, 'mariana_stats', 'summary');
        await setDoc(userScoreDocRef, {
            bestScore: highScoresState.bestScore,
            bestFruits: highScoresState.bestFruits,
            bestTimeSec: highScoresState.bestTimeSec,
            byBiome: highScoresState.byBiome,
            updatedAt: Date.now()
        }, { merge: true });
    } catch (e) {
        console.warn("Could not sync score to cloud:", e);
    }
}

function formatTime(sec) {
    if (sec === null || sec === undefined || !isFinite(sec)) return "--:--";
    const mins = Math.floor(sec / 60);
    const rem = Math.floor(sec % 60);
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function updateHighScoreUI() {
    document.getElementById('statBestScore').textContent = highScoresState.bestScore.toLocaleString();
    document.getElementById('statBestFruits').textContent = highScoresState.bestFruits.toLocaleString();
    document.getElementById('statBestTime').textContent = formatTime(highScoresState.bestTimeSec);
}

/********************************************************************
 * 2. SYNTHESIZED WEB AUDIO API SOUND ENGINE
 ********************************************************************/
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playTone(freq, type = 'sine', duration = 0.15, vol = 0.12, slideTo = null) {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (slideTo) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
        }

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + duration + 0.02);
    }

    jump(isDouble = false) {
        if (isDouble) {
            this.playTone(420, 'sine', 0.18, 0.14, 780);
            setTimeout(() => this.playTone(620, 'triangle', 0.15, 0.1, 960), 45);
        } else {
            this.playTone(290, 'sine', 0.16, 0.14, 560);
        }
    }

    bouncePad() {
        this.playTone(220, 'sine', 0.32, 0.18, 880);
        setTimeout(() => this.playTone(440, 'triangle', 0.25, 0.12, 1120), 60);
    }

    accelerate(gearMultiplier) {
        const base = 300 + gearMultiplier * 180;
        this.playTone(base, 'triangle', 0.11, 0.09, base * 1.25);
    }

    decelerate(gearMultiplier) {
        const base = 280 + gearMultiplier * 160;
        this.playTone(base, 'sine', 0.11, 0.09, base * 0.78);
    }

    fruit(combo = 1) {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        const pitchBoost = Math.min(combo * 35, 350);
        notes.forEach((n, idx) => {
            setTimeout(() => {
                this.playTone(n + pitchBoost, 'sine', 0.18, 0.11);
            }, idx * 45);
        });
    }

    wrapPortal() {
        this.playTone(340, 'sine', 0.22, 0.12, 680);
        setTimeout(() => this.playTone(680, 'triangle', 0.22, 0.09, 510), 60);
    }

    hazardReset() {
        this.playTone(300, 'sawtooth', 0.25, 0.11, 110);
        setTimeout(() => this.playTone(190, 'triangle', 0.3, 0.12, 85), 90);
    }

    countdownTick(isFinalGo = false) {
        if (isFinalGo) {
            this.playTone(587.33, 'triangle', 0.25, 0.14, 880);
            setTimeout(() => this.playTone(880, 'sine', 0.32, 0.13, 1174.66), 55);
        } else {
            this.playTone(440, 'sine', 0.16, 0.11, 493.88);
        }
    }

    themeMorph() {
        this.playTone(380, 'sine', 0.18, 0.07, 540);
    }

    winFanfare() {
        const chord = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        chord.forEach((freq, i) => {
            setTimeout(() => {
                this.playTone(freq, 'triangle', 0.45, 0.15);
            }, i * 95);
        });
    }
}

const sfx = new SoundEngine();

/********************************************************************
 * 3. GEOTYPE (BIOME) DEFINITIONS (SOFT AESTHETIC PASTEL DAY & NIGHT)
 ********************************************************************/
const BIOMES = {
    grass: {
        key: 'grass',
        name: 'Pastel Meadow',
        shortName: 'Meadow',
        emoji: '🌿',
        gravity: 0.56,
        friction: 0.85,
        skyTop: '#c3dafe',
        skyMid: '#e9d8fd',
        skyBottom: '#fff5f7',
        sunColor: '#fefcbf',
        mountainFar: '#d6bcfa',
        mountainNear: '#b2f5ea',
        nightSkyTop: '#2a244d',
        nightSkyMid: '#463b78',
        nightSkyBottom: '#705996',
        nightOrbColor: '#fef9c3',
        nightMountainFar: '#3d336b',
        nightMountainNear: '#334e68',
        platTopLight: '#b9f6ca',
        platTopDark: '#81e6d9',
        platBodyLight: '#fed7aa',
        platBodyDark: '#e9b893',
        platRim: '#e6fffa',
        particleColor: 'rgba(254, 249, 195, 0.8)',
        nightParticleColor: 'rgba(253, 230, 138, 0.88)',
        particleType: 'pollen'
    },
    rock: {
        key: 'rock',
        name: 'Canyon Crags',
        shortName: 'Canyon',
        emoji: '🪨',
        gravity: 0.58,
        friction: 0.84,
        skyTop: '#d6bcfa',
        skyMid: '#fbb6ce',
        skyBottom: '#feebc8',
        sunColor: '#ffedd5',
        mountainFar: '#e9d8fd',
        mountainNear: '#fed7e2',
        nightSkyTop: '#2d2346',
        nightSkyMid: '#523868',
        nightSkyBottom: '#83527d',
        nightOrbColor: '#fce7f3',
        nightMountainFar: '#46305c',
        nightMountainNear: '#5e3c66',
        platTopLight: '#fed7aa',
        platTopDark: '#fbb6ce',
        platBodyLight: '#d6bcfa',
        platBodyDark: '#b794f4',
        platRim: '#fff5f5',
        particleColor: 'rgba(254, 215, 226, 0.78)',
        nightParticleColor: 'rgba(249, 168, 212, 0.85)',
        particleType: 'dust'
    },
    underwater: {
        key: 'underwater',
        name: 'Abyssal Reef',
        shortName: 'Underwater',
        emoji: '🫧',
        gravity: 0.40,
        friction: 0.88,
        skyTop: '#a3bffa',
        skyMid: '#b2f5ea',
        skyBottom: '#e6fffa',
        sunColor: '#f0fff4',
        mountainFar: '#90cdf4',
        mountainNear: '#81e6d9',
        nightSkyTop: '#1a2a4a',
        nightSkyMid: '#24476e',
        nightSkyBottom: '#35698a',
        nightOrbColor: '#ccfbf1',
        nightMountainFar: '#233d63',
        nightMountainNear: '#275673',
        platTopLight: '#b2f5ea',
        platTopDark: '#81e6d9',
        platBodyLight: '#c3dafe',
        platBodyDark: '#a3bffa',
        platRim: '#f0ffff',
        particleColor: 'rgba(224, 255, 255, 0.82)',
        nightParticleColor: 'rgba(165, 243, 252, 0.88)',
        particleType: 'bubble'
    },
    snow: {
        key: 'snow',
        name: 'Alpine Frost',
        shortName: 'Snow',
        emoji: '❄️',
        gravity: 0.55,
        friction: 0.91,
        skyTop: '#c3dafe',
        skyMid: '#e2e8f0',
        skyBottom: '#fff5f7',
        sunColor: '#ffffff',
        mountainFar: '#e9d8fd',
        mountainNear: '#bee3f8',
        nightSkyTop: '#232946',
        nightSkyMid: '#3b4371',
        nightSkyBottom: '#636fa4',
        nightOrbColor: '#f8fafc',
        nightMountainFar: '#333b66',
        nightMountainNear: '#455082',
        platTopLight: '#ffffff',
        platTopDark: '#e2e8f0',
        platBodyLight: '#c3dafe',
        platBodyDark: '#a3bffa',
        platRim: '#ffffff',
        particleColor: 'rgba(255, 255, 255, 0.92)',
        nightParticleColor: 'rgba(224, 231, 255, 0.92)',
        particleType: 'snow'
    }
};

/********************************************************************
 * 4. WORLD & GAMEPLAY CONSTANTS + SMOOTH DELTA-TIME STATE
 ********************************************************************/
const WORLD_WIDTH = 2400;
const WORLD_GROUND_Y = 7200;
const WIN_ALTITUDE_Y = 480;
const TOTAL_TIERS = 48;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let currentBiomeKey = 'grass';
let sceneTime = 'day'; // 'day' or 'night'
let uiThemeMode = 'white'; // 'white' or 'dark'
let controlMode = 'laptop'; // 'laptop' or 'phone'
let gameRunning = false;
let gamePaused = false;
let countdownActive = false;
let gameWon = false;
let activePlayTimeMs = 0;
let baseViewScale = 1.0;
let viewScale = 1.0;

// Camera Modes (Laptop Shortcut 'C' or HUD Camera Button)
const CAMERA_MODES = [
    { key: 'standard', name: 'Standard', zoomMult: 1.0, yRatioOffset: 0.0, lookAhead: 11 },
    { key: 'wide', name: 'Wide Vista', zoomMult: 0.80, yRatioOffset: 0.05, lookAhead: 15 },
    { key: 'close', name: 'Close Action', zoomMult: 1.18, yRatioOffset: -0.04, lookAhead: 8 },
    { key: 'summit', name: 'Summit Peek', zoomMult: 0.90, yRatioOffset: 0.14, lookAhead: 13 }
];
let currentCameraModeIdx = 0;
let currentCamZoomMult = 1.0;
let currentCamYOffset = 0.0;

// Separate Individual UI Hide State per Device Mode ('laptop' vs 'phone')
const hiddenZonesByMode = {
    laptop: new Set(),
    phone: new Set()
};

const HIDEABLE_ZONES = [
    { id: 'brandScoreZone', elementId: 'brandScoreZone', hideClass: 'hide-up', label: 'Brand & Score' },
    { id: 'quickActionsZone', elementId: 'quickActionsZone', hideClass: 'hide-up', label: 'Action Toolbar' },
    { id: 'speedLevelZone', elementId: 'speedLevelZone', hideClass: 'hide-up', label: 'Speed & Level Bar' },
    { id: 'laptopHintZone', elementId: 'laptopHintZone', hideClass: 'hide-up', label: 'Keyboard Hints' },
    { id: 'elevationZone', elementId: 'elevationTracker', hideClass: 'hide-right', label: 'Elevation Tracker' }
];

// Input state
const keys = {
    left: false,
    right: false,
    up: false,
    accelA: false,
    decelD: false
};

// Player state
const player = {
    x: WORLD_WIDTH / 2,
    y: WORLD_GROUND_Y - 60,
    vx: 0,
    vy: 0,
    radius: 24,
    speedMultiplier: 1.0,
    minMultiplier: 0.4,
    maxMultiplier: 2.5,
    baseSpeed: 5.8,
    jumpPower: 14.8,
    onGround: false,
    jumpsLeft: 2,
    facing: 1,
    squashX: 1,
    squashY: 1,
    trail: [],
    portalFlash: 0,
    invulnTimer: 0
};

// World Entities
let platforms = [];
let fruits = [];
let hazards = [];
let particles = [];
let stars = [];
let floatingTexts = [];
let clouds = [];
let winSpot = {
    x: WORLD_WIDTH / 2,
    y: WIN_ALTITUDE_Y,
    width: 320,
    height: 44
};

// Session Score & Stats
let score = 0;
let collectedFruits = 0;
let totalFruitsInWorld = 0;
let comboCount = 0;
let comboTimer = 0;

// Smooth Spring Camera state
const camera = {
    x: WORLD_WIDTH / 2 - window.innerWidth / 2,
    y: WORLD_GROUND_Y - window.innerHeight * 0.75
};

function getViewportWidth() {
    return canvas.width / viewScale;
}
function getViewportHeight() {
    return canvas.height / viewScale;
}
function getPlayerScreenYRatio() {
    const baseRatio = (controlMode === 'phone' || window.innerWidth < 768) ? 0.54 : 0.63;
    return Math.min(0.76, Math.max(0.38, baseRatio + currentCamYOffset));
}

function cycleCameraMode() {
    currentCameraModeIdx = (currentCameraModeIdx + 1) % CAMERA_MODES.length;
    const camMode = CAMERA_MODES[currentCameraModeIdx];
    const hudCamName = document.getElementById('hudCameraName');
    if (hudCamName) hudCamName.textContent = camMode.name;
    sfx.playTone(460 + currentCameraModeIdx * 70, 'sine', 0.14, 0.09, 620 + currentCameraModeIdx * 80);
    showToast("🎥", `Camera Mode: ${camMode.name}`);
}

function syncHiddenZonesUI() {
    const activeSet = hiddenZonesByMode[controlMode];

    HIDEABLE_ZONES.forEach((z) => {
        const el = document.getElementById(z.elementId);
        if (!el) return;
        if (z.id === 'laptopHintZone' && controlMode === 'phone') {
            // Laptop hint banner is only for laptop mode
            el.classList.add(z.hideClass);
            return;
        }
        if (activeSet.has(z.id)) {
            el.classList.add(z.hideClass);
        } else {
            el.classList.remove(z.hideClass);
        }
    });

    // Collapse topHudRow wrapper if both brandScoreZone and quickActionsZone are hidden
    const topHudRow = document.getElementById('topHudRow');
    if (topHudRow) {
        if (activeSet.has('brandScoreZone') && activeSet.has('quickActionsZone')) {
            topHudRow.classList.add('hide-up');
        } else {
            topHudRow.classList.remove('hide-up');
        }
    }

    // Count how many applicable zones are currently hidden in this mode
    let hiddenCount = 0;
    activeSet.forEach((zoneId) => {
        if (controlMode === 'phone' && zoneId === 'laptopHintZone') return;
        hiddenCount++;
    });

    const centralWrap = document.getElementById('centralUnhideWrap');
    const labelEl = document.getElementById('unhideAllLabel');
    if (centralWrap && labelEl) {
        if (hiddenCount > 0) {
            labelEl.textContent = `Unhide All UI (${hiddenCount})`;
            centralWrap.classList.remove('unhide-collapsed');
        } else {
            centralWrap.classList.add('unhide-collapsed');
        }
    }

    // Guarantee Touch Controls in Phone Mode are never hidden when running
    const touchOverlay = document.getElementById('touchControlsOverlay');
    if (touchOverlay && controlMode === 'phone' && gameRunning && !gamePaused) {
        touchOverlay.classList.remove('hidden');
        touchOverlay.classList.add('flex');
    }
}

function hideSingleZone(zoneId) {
    // Strictly prevent hiding touch controls in phone mode
    if (zoneId === 'touchControlsOverlay') return;
    const activeSet = hiddenZonesByMode[controlMode];
    activeSet.add(zoneId);
    sfx.playTone(360, 'sine', 0.12, 0.07, 240);
    syncHiddenZonesUI();
}

function unhideAllZonesForCurrentMode() {
    const activeSet = hiddenZonesByMode[controlMode];
    if (activeSet.size === 0) return;
    activeSet.clear();
    sfx.playTone(320, 'sine', 0.16, 0.09, 580);
    syncHiddenZonesUI();
    showToast("👁️", `All ${controlMode === 'laptop' ? 'Laptop' : 'Mobile'} UI Panels Restored`);
}

/********************************************************************
 * 5. SIMULTANEOUS 4-CORNER PER-ZONE UI THEME TRANSITION ENGINE
 ********************************************************************/
let themeTransitionTimers = [];
let activeWebAnimations = [];

function clearThemeTransitionTimers() {
    themeTransitionTimers.forEach((id) => clearTimeout(id));
    themeTransitionTimers = [];
    activeWebAnimations.forEach((anim) => {
        try { anim.cancel(); } catch (e) {}
    });
    activeWebAnimations = [];
}

function setUiTheme(targetMode, animateCorners = true) {
    const normalized = targetMode === 'dark' ? 'dark' : 'white';
    const prevMode = uiThemeMode;
    const modeChanged = normalized !== prevMode;
    uiThemeMode = normalized;

    // Update HUD UI Theme Button
    const hudIcon = document.getElementById('hudUiThemeIcon');
    const hudName = document.getElementById('hudUiThemeName');
    if (normalized === 'dark') {
        hudIcon.className = 'ph-fill ph-moon-stars text-sm text-indigo-300';
        hudName.textContent = 'Dark UI';
    } else {
        hudIcon.className = 'ph-fill ph-sun-dim text-sm text-amber-400';
        hudName.textContent = 'White UI';
    }

    // Sync all UI Theme Option Buttons across Initiation & Pause screens
    document.querySelectorAll('.uitheme-option').forEach((btn) => {
        if (btn.dataset.uitheme === normalized) {
            btn.classList.add('active-card-indigo');
            btn.classList.remove('theme-text-secondary');
            btn.classList.add('theme-text-primary');
        } else {
            btn.classList.remove('active-card-indigo');
            btn.classList.remove('theme-text-primary');
            btn.classList.add('theme-text-secondary');
        }
    });

    if (animateCorners && modeChanged) {
        sfx.themeMorph();
        triggerCornerUIThemeTransition(normalized, prevMode);
    } else {
        clearThemeTransitionTimers();
        document.body.classList.remove('hold-bg-white', 'hold-bg-dark');
        document.querySelectorAll('.ui-corner-fx').forEach((el) => el.remove());
        if (normalized === 'dark') {
            document.body.classList.add('ui-dark');
        } else {
            document.body.classList.remove('ui-dark');
        }
    }
}

function triggerCornerUIThemeTransition(targetMode, prevMode) {
    clearThemeTransitionTimers();

    // Remove any leftover corner fx containers
    document.querySelectorAll('.ui-corner-fx').forEach((el) => el.remove());

    // Hold previous base surface gradient while the 4 opaque corner discs expand at z-index: -1
    document.body.classList.remove('hold-bg-white', 'hold-bg-dark');
    document.body.classList.add(prevMode === 'dark' ? 'hold-bg-dark' : 'hold-bg-white');

    // Smoothly transition text, borders, and shadows to the target theme
    if (targetMode === 'dark') {
        document.body.classList.add('ui-dark');
    } else {
        document.body.classList.remove('ui-dark');
    }

    const fxClass = targetMode === 'dark' ? 'to-dark' : 'to-white';
    const activeFxContainers = [];

    // Animate all visible .ui-zone elements (including .liquid-subpill stat cards) in lockstep
    const zones = document.querySelectorAll('.ui-zone');
    zones.forEach((zone) => {
        const rect = zone.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const style = window.getComputedStyle(zone);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return;

        const diag = Math.hypot(rect.width, rect.height);
        const diameter = Math.ceil(diag * 1.45);

        const fxContainer = document.createElement('div');
        fxContainer.className = `ui-corner-fx ${fxClass}`;

        const corners = ['tl', 'tr', 'bl', 'br'];
        for (let i = 0; i < corners.length; i++) {
            const disc = document.createElement('div');
            disc.className = `corner-disc ${corners[i]}`;
            disc.style.width = `${diameter}px`;
            disc.style.height = `${diameter}px`;
            fxContainer.appendChild(disc);

            if (typeof disc.animate === 'function') {
                const anim = disc.animate(
                    [
                        { transform: 'translate3d(-50%, -50%, 0) scale3d(0.001, 0.001, 1)' },
                        { transform: 'translate3d(-50%, -50%, 0) scale3d(1, 1, 1)' }
                    ],
                    {
                        duration: 440,
                        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                        fill: 'forwards'
                    }
                );
                activeWebAnimations.push(anim);
            } else {
                disc.style.transform = 'translate3d(-50%, -50%, 0) scale3d(1, 1, 1)';
            }
        }

        zone.appendChild(fxContainer);
        activeFxContainers.push(fxContainer);
    });

    // At 440ms (when the 4 opaque corner discs cover 100% of every zone), swap the held base background underneath
    // and fade out .ui-corner-fx over 100ms so there is zero pop or flash
    const handoffTimer = setTimeout(() => {
        document.body.classList.remove('hold-bg-white', 'hold-bg-dark');
        activeFxContainers.forEach((fx) => {
            if (typeof fx.animate === 'function') {
                const fadeAnim = fx.animate(
                    [
                        { opacity: 1 },
                        { opacity: 0 }
                    ],
                    {
                        duration: 100,
                        easing: 'linear',
                        fill: 'forwards'
                    }
                );
                activeWebAnimations.push(fadeAnim);
            } else {
                fx.style.opacity = '0';
            }
        });
    }, 440);
    themeTransitionTimers.push(handoffTimer);

    const cleanupTimer = setTimeout(() => {
        activeFxContainers.forEach((fx) => fx.remove());
        activeWebAnimations = [];
    }, 560);
    themeTransitionTimers.push(cleanupTimer);
}
const triggerFourCornerUiZoneTransition = triggerCornerUIThemeTransition;

// Smooth Modal Open & Close Helper
function setModalVisibility(modalId, visible) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (visible) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                modal.classList.remove('modal-closed');
            });
        });
    } else {
        modal.classList.add('modal-closed');
        setTimeout(() => {
            if (modal.classList.contains('modal-closed')) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        }, 350);
    }
}

/********************************************************************
 * 6. ULTRA-SMOOTH 60/120FPS rAF 3-2-1-GO COUNTDOWN ENGINE
 ********************************************************************/
let countdownRafId = null;

function clearCountdownTimers() {
    if (countdownRafId) {
        cancelAnimationFrame(countdownRafId);
        countdownRafId = null;
    }
}

function runSmoothCountdown(subtitleText = "Synchronizing Horizon", onComplete = null) {
    clearCountdownTimers();
    countdownActive = true;

    const numEl = document.getElementById('countdownText');
    const subEl = document.getElementById('countdownSubtext');
    const ringEl = document.getElementById('countdownRing');

    subEl.textContent = subtitleText;
    setModalVisibility('countdownOverlay', true);

    const steps = ['3', '2', '1', 'GO!'];
    const stepDuration = 640; // ms per beat
    const totalDuration = steps.length * stepDuration;
    const circumference = 326.7;
    const startTime = performance.now();
    let lastStepIdx = -1;

    function tickCountdown(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / totalDuration);
        const stepIdx = Math.min(steps.length - 1, Math.floor(elapsed / stepDuration));
        const stepLocalT = (elapsed % stepDuration) / stepDuration;

        if (stepIdx !== lastStepIdx) {
            lastStepIdx = stepIdx;
            numEl.textContent = steps[stepIdx];
            sfx.countdownTick(stepIdx === steps.length - 1);
        }

        // Smooth continuous SVG ring progress
        const dashOffset = circumference * (1 - progress);
        ringEl.style.strokeDashoffset = dashOffset.toFixed(2);

        // Smooth spring scale & opacity curve within each beat
        let scale = 1;
        let opacity = 1;
        if (stepLocalT < 0.28) {
            const t = stepLocalT / 0.28;
            const easeOut = 1 - Math.pow(1 - t, 3);
            scale = 0.55 + easeOut * 0.53; // 0.55 -> 1.08
            opacity = easeOut;
        } else if (stepLocalT < 0.72) {
            const t = (stepLocalT - 0.28) / 0.44;
            scale = 1.08 - t * 0.08; // 1.08 -> 1.00
            opacity = 1;
        } else {
            const t = (stepLocalT - 0.72) / 0.28;
            const easeIn = t * t;
            scale = 1.0 + easeIn * 0.24; // 1.00 -> 1.24
            opacity = 1 - easeIn;
        }

        numEl.style.transform = `scale3d(${scale.toFixed(3)}, ${scale.toFixed(3)}, 1)`;
        numEl.style.opacity = opacity.toFixed(3);

        if (elapsed < totalDuration) {
            countdownRafId = requestAnimationFrame(tickCountdown);
        } else {
            countdownRafId = null;
            setModalVisibility('countdownOverlay', false);
            countdownActive = false;
            if (typeof onComplete === 'function') onComplete();
        }
    }

    countdownRafId = requestAnimationFrame(tickCountdown);
}

/********************************************************************
 * 7. PROCEDURAL OBBY & TERRAIN GENERATOR (RANDOMIZED ON RESPAWN)
 ********************************************************************/
function generateRandomizedWorld() {
    platforms = [];
    fruits = [];
    hazards = [];
    floatingTexts = [];
    collectedFruits = 0;

    // 1. THE PROPER SOLID BASE
    platforms.push({
        id: 'solid-base',
        x: 0,
        y: WORLD_GROUND_Y,
        w: WORLD_WIDTH,
        h: 380,
        isBase: true,
        type: 'base',
        foliageSeed: Math.random() * 1000
    });

    const verticalClimb = WORLD_GROUND_Y - WIN_ALTITUDE_Y - 120;
    const stepY = verticalClimb / TOTAL_TIERS;

    let spineX = WORLD_WIDTH / 2;

    for (let i = 1; i <= TOTAL_TIERS; i++) {
        const tierY = WORLD_GROUND_Y - i * stepY;

        const maxHorizontalJump = 280 + (i % 4 === 0 ? 70 : 0);
        const dir = Math.random() < 0.5 ? -1 : 1;
        const deltaX = dir * (130 + Math.random() * (maxHorizontalJump - 130));
        spineX = (spineX + deltaX + WORLD_WIDTH) % WORLD_WIDTH;

        const platW = Math.max(135, 240 - i * 1.4 + (Math.random() * 45 - 22));
        const platH = 34;

        let pType = 'normal';
        let moveRange = 0;
        let moveSpeed = 0;
        let hasBouncePad = false;

        if (i > 3 && i % 6 === 0) {
            pType = 'moving';
            moveRange = 85 + Math.random() * 75;
            moveSpeed = 0.018 + Math.random() * 0.015;
        } else if (i % 7 === 0 && i < TOTAL_TIERS - 2) {
            hasBouncePad = true;
        }

        const mainPlat = {
            id: `spine-${i}`,
            x: spineX - platW / 2,
            baseX: spineX - platW / 2,
            y: tierY,
            w: platW,
            h: platH,
            type: pType,
            moveRange,
            moveSpeed,
            movePhase: Math.random() * Math.PI * 2,
            hasBouncePad,
            foliageSeed: Math.random() * 100
        };
        mainPlat.x = (mainPlat.x + WORLD_WIDTH) % WORLD_WIDTH;
        mainPlat.baseX = mainPlat.x;
        platforms.push(mainPlat);

        if (Math.random() < 0.78) {
            spawnFruitOnPlatform(mainPlat, i);
        }

        const extraCount = (i % 2 === 0) ? 2 : 1;
        for (let e = 0; e < extraCount; e++) {
            const offset = (e === 0 ? 1 : -1) * (420 + Math.random() * 550);
            const sideW = 130 + Math.random() * 90;
            const sideX = (spineX + offset + WORLD_WIDTH) % WORLD_WIDTH;
            const sideY = tierY + (Math.random() * 44 - 22);

            const sidePlat = {
                id: `side-${i}-${e}`,
                x: sideX,
                baseX: sideX,
                y: sideY,
                w: sideW,
                h: 32,
                type: Math.random() < 0.25 ? 'moving' : 'normal',
                moveRange: 65,
                moveSpeed: 0.016,
                movePhase: Math.random() * Math.PI * 2,
                hasBouncePad: Math.random() < 0.18,
                foliageSeed: Math.random() * 100
            };
            platforms.push(sidePlat);

            spawnFruitOnPlatform(sidePlat, i, true);

            if (i > 2 && Math.random() < 0.42) {
                hazards.push({
                    x: (sidePlat.x + sidePlat.w * 0.5) % WORLD_WIDTH,
                    baseX: (sidePlat.x + sidePlat.w * 0.5) % WORLD_WIDTH,
                    y: sidePlat.y - 22,
                    radius: 17,
                    angle: Math.random() * Math.PI * 2,
                    patrolRange: sidePlat.w * 0.35,
                    patrolSpeed: 0.025 + Math.random() * 0.02,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }

        if (i > 4 && platW > 175 && !hasBouncePad && Math.random() < 0.35) {
            hazards.push({
                x: (mainPlat.x + mainPlat.w * 0.5) % WORLD_WIDTH,
                baseX: (mainPlat.x + mainPlat.w * 0.5) % WORLD_WIDTH,
                y: mainPlat.y - 21,
                radius: 16,
                angle: 0,
                patrolRange: mainPlat.w * 0.28,
                patrolSpeed: 0.022,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    // 3. DEDICATED WIN SPOT AT THE PEAK (Celestial Sanctuary)
    winSpot = {
        x: spineX - 170,
        y: WIN_ALTITUDE_Y,
        width: 340,
        height: 46
    };
    winSpot.x = (winSpot.x + WORLD_WIDTH) % WORLD_WIDTH;

    platforms.push({
        id: 'win-sanctuary',
        x: winSpot.x,
        baseX: winSpot.x,
        y: winSpot.y,
        w: winSpot.width,
        h: winSpot.height,
        isWinSpot: true,
        type: 'sanctuary',
        foliageSeed: 777
    });

    for (let m = -1; m <= 1; m += 2) {
        fruits.push({
            x: (winSpot.x + winSpot.width / 2 + m * 95 + WORLD_WIDTH) % WORLD_WIDTH,
            y: winSpot.y - 42,
            baseY: winSpot.y - 42,
            type: 'mango',
            points: 500,
            radius: 20,
            collected: false,
            bobPhase: Math.random() * Math.PI * 2
        });
    }

    for (let b = 0; b < 8; b++) {
        const fx = ((b + 0.5) * (WORLD_WIDTH / 8)) % WORLD_WIDTH;
        fruits.push({
            x: fx,
            y: WORLD_GROUND_Y - 46,
            baseY: WORLD_GROUND_Y - 46,
            type: ['apple', 'peach', 'strawberry', 'blueberry'][b % 4],
            points: 150,
            radius: 17,
            collected: false,
            bobPhase: b * 0.8
        });
    }

    totalFruitsInWorld = fruits.length;
    initEnvironmentParticles();
    updateHUD();
}

function spawnFruitOnPlatform(plat, tierIndex, isBonus = false) {
    const types = [
        { type: 'apple', points: 100, radius: 16 },
        { type: 'peach', points: 150, radius: 17 },
        { type: 'blueberry', points: 200, radius: 16 },
        { type: 'strawberry', points: 250, radius: 17 },
        { type: 'mango', points: 500, radius: 19 }
    ];
    let pickIndex = Math.floor(Math.random() * 4);
    if ((tierIndex > 25 || isBonus) && Math.random() < 0.28) {
        pickIndex = 4;
    }
    const chosen = types[pickIndex];
    const fx = (plat.x + plat.w * (0.3 + Math.random() * 0.4)) % WORLD_WIDTH;
    const fy = plat.y - 38;

    fruits.push({
        x: fx,
        y: fy,
        baseY: fy,
        type: chosen.type,
        points: chosen.points,
        radius: chosen.radius,
        collected: false,
        bobPhase: Math.random() * Math.PI * 2
    });
}

function initEnvironmentParticles() {
    particles = [];
    const vw = getViewportWidth();
    const vh = getViewportHeight();
    for (let i = 0; i < 60; i++) {
        particles.push({
            x: Math.random() * vw,
            y: Math.random() * vh,
            r: 2 + Math.random() * 4.2,
            vx: (Math.random() - 0.5) * 0.65,
            vy: (Math.random() - 0.5) * 0.65,
            alpha: 0.35 + Math.random() * 0.55,
            phase: Math.random() * Math.PI * 2
        });
    }

    stars = [];
    for (let s = 0; s < 75; s++) {
        stars.push({
            xRatio: Math.random(),
            yRatio: Math.random() * 0.72,
            r: 0.9 + Math.random() * 2.1,
            twinkleSpeed: 0.02 + Math.random() * 0.04,
            phase: Math.random() * Math.PI * 2,
            hue: ['#ffffff', '#fef08a', '#fbcfe8', '#c4b5fd', '#bae6fd'][s % 5]
        });
    }

    clouds = [];
    for (let c = 0; c < 18; c++) {
        clouds.push({
            x: Math.random() * WORLD_WIDTH,
            y: 300 + Math.random() * (WORLD_GROUND_Y - 500),
            scale: 0.65 + Math.random() * 1.1,
            speed: 0.15 + Math.random() * 0.25,
            opacity: 0.45 + Math.random() * 0.35
        });
    }
}

/********************************************************************
 * 8. PLAYER RESPAWN, SPEED ACCEL/DECEL ('A' & 'D') & HELPERS
 ********************************************************************/
function respawnPlayer(randomize = true, message = "Terrain Randomized! Fresh Obby Generated") {
    if (randomize) {
        generateRandomizedWorld();
    }
    player.x = WORLD_WIDTH / 2;
    player.y = WORLD_GROUND_Y - player.radius - 10;
    player.vx = 0;
    player.vy = 0;
    player.jumpsLeft = 2;
    player.trail = [];
    player.invulnTimer = 45;
    comboCount = 0;

    camera.x = player.x - getViewportWidth() / 2;
    camera.y = player.y - getViewportHeight() * getPlayerScreenYRatio();

    showToast("🎲", message);
    updateHUD();
}

function adjustSpeedMultiplier(delta, isDiscreteTap = false) {
    const prev = player.speedMultiplier;
    player.speedMultiplier = Math.max(
        player.minMultiplier,
        Math.min(player.maxMultiplier, +(player.speedMultiplier + delta).toFixed(2))
    );
    if (Math.abs(player.speedMultiplier - prev) > 0.005) {
        if (isDiscreteTap) {
            if (delta > 0) sfx.accelerate(player.speedMultiplier);
            else sfx.decelerate(player.speedMultiplier);
        }
        updateSpeedHUD();
    }
}

function updateSpeedHUD() {
    const mult = player.speedMultiplier;
    document.getElementById('hudSpeedValue').textContent = `${mult.toFixed(2)}x`;
    const pct = ((mult - player.minMultiplier) / (player.maxMultiplier - player.minMultiplier)) * 100;
    document.getElementById('hudSpeedBar').style.width = `${Math.max(6, Math.min(100, pct))}%`;

    const labelEl = document.getElementById('hudGearLabel');
    if (mult < 0.8) {
        labelEl.textContent = 'CALM';
        labelEl.className = 'text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-cyan-100/90 text-cyan-600 leading-none';
    } else if (mult <= 1.35) {
        labelEl.textContent = 'CRUISE';
        labelEl.className = 'text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-indigo-100/90 text-indigo-600 leading-none';
    } else if (mult <= 1.95) {
        labelEl.textContent = 'BREEZE';
        labelEl.className = 'text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-purple-100/90 text-purple-600 leading-none';
    } else {
        labelEl.textContent = 'DREAM';
        labelEl.className = 'text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-pink-100/90 text-rose-600 leading-none';
    }
}

function updateHUD() {
    document.getElementById('hudScore').textContent = score.toLocaleString();
    document.getElementById('hudFruits').textContent = `${collectedFruits} / ${totalFruitsInWorld}`;

    const totalClimb = WORLD_GROUND_Y - WIN_ALTITUDE_Y;
    const currentClimb = Math.max(0, WORLD_GROUND_Y - (player.y + player.radius));
    const pct = Math.min(100, Math.max(0, Math.round((currentClimb / totalClimb) * 100)));

    const currentLevel = Math.min(TOTAL_TIERS, Math.max(1, Math.floor((currentClimb / totalClimb) * TOTAL_TIERS) + 1));

    document.getElementById('hudLevelBadge').textContent = `LVL ${currentLevel}`;
    document.getElementById('sideLevelNum').textContent = `L${currentLevel}`;
    document.getElementById('hudAltitude').textContent = `${pct}%`;
    document.getElementById('hudAltitudeBar').style.width = `${pct}%`;
    document.getElementById('sideElevationFill').style.height = `${pct}%`;
    document.getElementById('sidePlayerDot').style.bottom = `calc(${pct}% - 4px)`;

    // Keep Pause modal live counters updated too
    const pauseScoreEl = document.getElementById('pauseCurrentScore');
    const pauseAltEl = document.getElementById('pauseCurrentAltitude');
    if (pauseScoreEl) pauseScoreEl.textContent = score.toLocaleString();
    if (pauseAltEl) pauseAltEl.textContent = `${pct}%`;

    const comboEl = document.getElementById('comboBadge');
    if (comboCount > 1) {
        comboEl.textContent = `x${comboCount}`;
        comboEl.classList.remove('hidden');
    } else {
        comboEl.classList.add('hidden');
    }
}

let toastTimeout = null;
function showToast(emoji, text) {
    const banner = document.getElementById('toastBanner');
    document.getElementById('toastEmoji').textContent = emoji;
    document.getElementById('toastText').textContent = text;
    banner.classList.remove('opacity-0', '-translate-y-3', 'scale-95');
    banner.classList.add('opacity-100', 'translate-y-0', 'scale-100');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        banner.classList.remove('opacity-100', 'translate-y-0', 'scale-100');
        banner.classList.add('opacity-0', '-translate-y-3', 'scale-95');
    }, 2200);
}

/********************************************************************
 * 9. DELTA-TIME SMOOTHED PHYSICS & CONTINUOUS WORLD WRAP ENGINE
 ********************************************************************/
function triggerJump() {
    if (!gameRunning || gamePaused || countdownActive || gameWon) return;
    if (player.onGround || player.jumpsLeft > 0) {
        const isDouble = !player.onGround;
        player.vy = -player.jumpPower * (isDouble ? 0.92 : 1.0);
        player.onGround = false;
        player.jumpsLeft = Math.max(0, player.jumpsLeft - 1);
        player.squashX = 0.78;
        player.squashY = 1.26;
        sfx.jump(isDouble);

        for (let i = 0; i < 8; i++) {
            floatingTexts.push({
                isPuff: true,
                x: player.x + (Math.random() - 0.5) * 26,
                y: player.y + player.radius,
                vx: (Math.random() - 0.5) * 3,
                vy: Math.random() * 1.5,
                r: 5 + Math.random() * 5,
                alpha: 0.85,
                color: '#ffffff'
            });
        }
    }
}

function getWrappedPlatX(platX, refX) {
    let dx = platX - refX;
    if (dx > WORLD_WIDTH / 2) platX -= WORLD_WIDTH;
    else if (dx < -WORLD_WIDTH / 2) platX += WORLD_WIDTH;
    return platX;
}

function updatePhysics(dtFactor) {
    const biome = BIOMES[currentBiomeKey];

    if (keys.accelA) adjustSpeedMultiplier(0.018 * dtFactor, false);
    if (keys.decelD) adjustSpeedMultiplier(-0.018 * dtFactor, false);

    const targetSpeed = player.baseSpeed * player.speedMultiplier;
    if (keys.left) {
        player.vx += (-targetSpeed - player.vx) * Math.min(1, 0.36 * dtFactor);
        player.facing = -1;
    } else if (keys.right) {
        player.vx += (targetSpeed - player.vx) * Math.min(1, 0.36 * dtFactor);
        player.facing = 1;
    } else {
        player.vx *= Math.pow(biome.friction, dtFactor);
        if (Math.abs(player.vx) < 0.06) player.vx = 0;
    }

    player.x += player.vx * dtFactor;

    if (player.x < 0) {
        player.x += WORLD_WIDTH;
        camera.x += WORLD_WIDTH;
        player.portalFlash = 18;
        sfx.wrapPortal();
        showToast("🌀", "Wrapped Around Left Wall → Right Side!");
    } else if (player.x >= WORLD_WIDTH) {
        player.x -= WORLD_WIDTH;
        camera.x -= WORLD_WIDTH;
        player.portalFlash = 18;
        sfx.wrapPortal();
        showToast("🌀", "Wrapped Around Right Wall → Left Side!");
    }

    if (player.portalFlash > 0) player.portalFlash = Math.max(0, player.portalFlash - dtFactor);
    if (player.invulnTimer > 0) player.invulnTimer = Math.max(0, player.invulnTimer - dtFactor);

    for (const p of platforms) {
        if (p.type === 'moving') {
            p.movePhase += p.moveSpeed * dtFactor;
            p.x = (p.baseX + Math.sin(p.movePhase) * p.moveRange + WORLD_WIDTH) % WORLD_WIDTH;
        }
    }

    const prevBottom = player.y + player.radius;
    player.vy += biome.gravity * dtFactor;
    if (player.vy > 18) player.vy = 18;
    player.y += player.vy * dtFactor;

    player.onGround = false;

    const curBottom = player.y + player.radius;
    for (const p of platforms) {
        if (p.isBase) {
            if (curBottom >= p.y && prevBottom <= p.y + 26 && player.vy >= 0) {
                player.y = p.y - player.radius;
                player.vy = 0;
                player.onGround = true;
                player.jumpsLeft = 2;
            }
            continue;
        }

        const wx = getWrappedPlatX(p.x, player.x);
        const withinX = (player.x + player.radius * 0.65 > wx) && (player.x - player.radius * 0.65 < wx + p.w);

        if (withinX && player.vy >= 0 && prevBottom <= p.y + 18 && curBottom >= p.y) {
            player.y = p.y - player.radius;
            player.vy = 0;
            player.onGround = true;
            player.jumpsLeft = 2;

            if (p.type === 'moving') {
                const deltaMove = Math.cos(p.movePhase) * p.moveRange * p.moveSpeed * dtFactor;
                player.x = (player.x + deltaMove + WORLD_WIDTH) % WORLD_WIDTH;
            }

            if (p.hasBouncePad) {
                const padCenter = wx + p.w / 2;
                if (Math.abs(player.x - padCenter) < 38) {
                    player.vy = -player.jumpPower * 1.55;
                    player.onGround = false;
                    player.jumpsLeft = 2;
                    player.squashX = 0.68;
                    player.squashY = 1.38;
                    sfx.bouncePad();
                }
            }

            if (p.isWinSpot && !gameWon) {
                handleVictory();
            }
        }
    }

    if (player.y + player.radius > WORLD_GROUND_Y) {
        player.y = WORLD_GROUND_Y - player.radius;
        player.vy = 0;
        player.onGround = true;
        player.jumpsLeft = 2;
    }

    const squashLerp = 1 - Math.pow(0.82, dtFactor);
    player.squashX += (1 - player.squashX) * squashLerp;
    player.squashY += (1 - player.squashY) * squashLerp;

    if (player.speedMultiplier > 1.15 || Math.abs(player.vy) > 8) {
        player.trail.push({
            x: player.x,
            y: player.y,
            r: player.radius * 0.85,
            alpha: 0.42
        });
    }
    for (let i = player.trail.length - 1; i >= 0; i--) {
        player.trail[i].alpha -= 0.045 * dtFactor;
        if (player.trail[i].alpha <= 0) player.trail.splice(i, 1);
    }

    if (comboTimer > 0) {
        comboTimer = Math.max(0, comboTimer - dtFactor);
        if (comboTimer === 0) {
            comboCount = 0;
            updateHUD();
        }
    }

    for (const f of fruits) {
        f.bobPhase += 0.06 * dtFactor;
        f.y = f.baseY + Math.sin(f.bobPhase) * 5;
        if (f.collected) continue;

        const fx = getWrappedPlatX(f.x, player.x);
        const dist = Math.hypot(player.x - fx, player.y - f.y);
        if (dist < player.radius + f.radius + 4) {
            f.collected = true;
            collectedFruits++;
            comboCount++;
            comboTimer = 210;
            const earned = f.points * Math.min(comboCount, 5);
            score += earned;
            sfx.fruit(comboCount);

            floatingTexts.push({
                isPuff: false,
                x: player.x,
                y: f.y - 10,
                vy: -1.6,
                alpha: 1.0,
                text: `+${earned}`,
                color: f.type === 'mango' ? '#fbbf24' : '#f472b6'
            });

            updateHUD();
            saveHighScore(score, collectedFruits, null, currentBiomeKey);
        }
    }

    for (const h of hazards) {
        h.phase += h.patrolSpeed * dtFactor;
        h.angle += 0.06 * dtFactor;
        h.x = (h.baseX + Math.sin(h.phase) * h.patrolRange + WORLD_WIDTH) % WORLD_WIDTH;

        if (player.invulnTimer <= 0) {
            const hx = getWrappedPlatX(h.x, player.x);
            const dist = Math.hypot(player.x - hx, player.y - h.y);
            if (dist < player.radius + h.radius - 4) {
                sfx.hazardReset();
                score = Math.max(0, score - 100);
                respawnPlayer(true, "Obstacle Hit! Respawned at Base & Terrain Randomized");
                break;
            }
        }
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.y += ft.vy * dtFactor;
        if (ft.vx) ft.x += ft.vx * dtFactor;
        ft.alpha -= 0.025 * dtFactor;
        if (ft.alpha <= 0) floatingTexts.splice(i, 1);
    }

    // Ultra-Smooth Frame-Independent Camera Tracking + Smooth Camera Mode Zoom Interpolation
    const camMode = CAMERA_MODES[currentCameraModeIdx];
    const zoomLerp = 1 - Math.pow(0.86, dtFactor);
    currentCamZoomMult += (camMode.zoomMult - currentCamZoomMult) * zoomLerp;
    currentCamYOffset += (camMode.yRatioOffset - currentCamYOffset) * zoomLerp;
    viewScale = baseViewScale * currentCamZoomMult;

    const vw = getViewportWidth();
    const vh = getViewportHeight();
    const targetCamX = player.x - vw / 2 + player.vx * camMode.lookAhead;
    const targetCamY = player.y - vh * getPlayerScreenYRatio();
    const camLerp = 1 - Math.pow(0.86, dtFactor);
    camera.x += (targetCamX - camera.x) * camLerp;
    camera.y += (targetCamY - camera.y) * camLerp;

    const bottomClearance = (controlMode === 'phone' || window.innerWidth < 768) ? 235 : 140;
    const maxCamY = WORLD_GROUND_Y - vh + bottomClearance;
    if (camera.y > maxCamY) camera.y = maxCamY;

    updateHUD();
}

function handleVictory() {
    gameWon = true;
    sfx.winFanfare();
    const elapsedSec = Math.max(1, Math.round(activePlayTimeMs / 1000));
    const victoryBonus = 2500;
    score += victoryBonus;
    updateHUD();
    saveHighScore(score, collectedFruits, elapsedSec, currentBiomeKey);

    document.getElementById('winScore').textContent = score.toLocaleString();
    document.getElementById('winFruits').textContent = `${collectedFruits} / ${totalFruitsInWorld}`;
    document.getElementById('winTime').textContent = formatTime(elapsedSec);

    setModalVisibility('victoryModal', true);
}
/********************************************************************
 * 10. 3D PASTEL GRAPHICS RENDERER (WITH SMOOTH COLOR INTERPOLATION)
 ********************************************************************/
function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r, g, b) {
    const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerpHexColor(hexA, hexB, t) {
    const [r1, g1, b1] = hexToRgb(hexA);
    const [r2, g2, b2] = hexToRgb(hexB);
    return rgbToHex(
        r1 + (r2 - r1) * t,
        g1 + (g2 - g1) * t,
        b1 + (b2 - b1) * t
    );
}

// Smoothly interpolated visual state for zero-snap Biome & Day/Night transitions
const visualPalette = {
    initialized: false,
    nightBlend: 0, // 0 = Daylight, 1 = Starlight Night
    skyTop: '#c3dafe',
    skyMid: '#e9d8fd',
    skyBottom: '#fff5f7',
    orbColor: '#fefcbf',
    mountainFar: '#d6bcfa',
    mountainNear: '#b2f5ea',
    platTopLight: '#b9f6ca',
    platTopDark: '#81e6d9',
    platBodyLight: '#fed7aa',
    platBodyDark: '#e9b893',
    platRim: '#e6fffa'
};

function updateVisualPalette(dtFactor) {
    const biome = BIOMES[currentBiomeKey];
    const isNight = sceneTime === 'night';
    const targetNightBlend = isNight ? 1 : 0;

    const targetSkyTop = isNight ? biome.nightSkyTop : biome.skyTop;
    const targetSkyMid = isNight ? biome.nightSkyMid : biome.skyMid;
    const targetSkyBottom = isNight ? biome.nightSkyBottom : biome.skyBottom;
    const targetOrb = isNight ? biome.nightOrbColor : biome.sunColor;
    const targetMtnFar = isNight ? biome.nightMountainFar : biome.mountainFar;
    const targetMtnNear = isNight ? biome.nightMountainNear : biome.mountainNear;

    if (!visualPalette.initialized) {
        visualPalette.initialized = true;
        visualPalette.nightBlend = targetNightBlend;
        visualPalette.skyTop = targetSkyTop;
        visualPalette.skyMid = targetSkyMid;
        visualPalette.skyBottom = targetSkyBottom;
        visualPalette.orbColor = targetOrb;
        visualPalette.mountainFar = targetMtnFar;
        visualPalette.mountainNear = targetMtnNear;
        visualPalette.platTopLight = biome.platTopLight;
        visualPalette.platTopDark = biome.platTopDark;
        visualPalette.platBodyLight = biome.platBodyLight;
        visualPalette.platBodyDark = biome.platBodyDark;
        visualPalette.platRim = biome.platRim;
        return;
    }

    const rate = 1 - Math.pow(0.90, dtFactor);
    visualPalette.nightBlend += (targetNightBlend - visualPalette.nightBlend) * rate;
    visualPalette.skyTop = lerpHexColor(visualPalette.skyTop, targetSkyTop, rate);
    visualPalette.skyMid = lerpHexColor(visualPalette.skyMid, targetSkyMid, rate);
    visualPalette.skyBottom = lerpHexColor(visualPalette.skyBottom, targetSkyBottom, rate);
    visualPalette.orbColor = lerpHexColor(visualPalette.orbColor, targetOrb, rate);
    visualPalette.mountainFar = lerpHexColor(visualPalette.mountainFar, targetMtnFar, rate);
    visualPalette.mountainNear = lerpHexColor(visualPalette.mountainNear, targetMtnNear, rate);
    visualPalette.platTopLight = lerpHexColor(visualPalette.platTopLight, biome.platTopLight, rate);
    visualPalette.platTopDark = lerpHexColor(visualPalette.platTopDark, biome.platTopDark, rate);
    visualPalette.platBodyLight = lerpHexColor(visualPalette.platBodyLight, biome.platBodyLight, rate);
    visualPalette.platBodyDark = lerpHexColor(visualPalette.platBodyDark, biome.platBodyDark, rate);
    visualPalette.platRim = lerpHexColor(visualPalette.platRim, biome.platRim, rate);
}

function drawRoundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function renderBackgroundAndSky(dtFactor) {
    const nightT = visualPalette.nightBlend;
    const vw = getViewportWidth();
    const vh = getViewportHeight();

    // 1. Smoothly Interpolated Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, vh);
    skyGrad.addColorStop(0, visualPalette.skyTop);
    skyGrad.addColorStop(0.55, visualPalette.skyMid);
    skyGrad.addColorStop(1, visualPalette.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, vw, vh);

    // 2. Smoothly Fading Twinkling Stars
    if (nightT > 0.01) {
        ctx.save();
        for (const st of stars) {
            st.phase += st.twinkleSpeed * dtFactor;
            const alpha = (0.35 + Math.sin(st.phase) * 0.45) * nightT;
            const sx = st.xRatio * vw;
            const sy = st.yRatio * vh;
            ctx.fillStyle = st.hue;
            ctx.globalAlpha = Math.max(0.01, alpha);
            ctx.beginPath();
            ctx.arc(sx, sy, st.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // 3. Smooth Sun-to-Moon Elevation & Halo Transition
    const orbX = vw * 0.78;
    const orbY = vh * (0.20 + nightT * 0.04);
    const haloRadius = 210 - nightT * 40;
    const sunHalo = ctx.createRadialGradient(orbX, orbY, 10, orbX, orbY, haloRadius);
    sunHalo.addColorStop(0, visualPalette.orbColor);
    sunHalo.addColorStop(0.38, `rgba(238, 232, 255, ${(0.52 - nightT * 0.20).toFixed(3)})`);
    sunHalo.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sunHalo;
    ctx.beginPath();
    ctx.arc(orbX, orbY, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    if (nightT > 0.02) {
        ctx.save();
        ctx.globalAlpha = nightT;
        ctx.fillStyle = '#fef9c3';
        ctx.beginPath();
        ctx.arc(orbX, orbY, 32, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = visualPalette.skyTop;
        ctx.beginPath();
        ctx.arc(orbX - 11 * nightT, orbY - 6 * nightT, 27, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 4. Biome-Specific Atmospheric Rays & Aurora Ribbon
    if (currentBiomeKey === 'underwater') {
        ctx.save();
        for (let r = 0; r < 6; r++) {
            const rayX = ((r * 260 + Date.now() * 0.02) % (vw + 300)) - 150;
            const rayGrad = ctx.createLinearGradient(rayX, 0, rayX + 120, vh * 0.85);
            rayGrad.addColorStop(0, `rgba(195, 250, 255, ${(0.26 - nightT * 0.11).toFixed(3)})`);
            rayGrad.addColorStop(1, 'rgba(224, 255, 255, 0)');
            ctx.fillStyle = rayGrad;
            ctx.beginPath();
            ctx.moveTo(rayX, 0);
            ctx.lineTo(rayX + 90, 0);
            ctx.lineTo(rayX + 240, vh);
            ctx.lineTo(rayX + 60, vh);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    } else if (currentBiomeKey === 'snow' || nightT > 0.04) {
        ctx.save();
        ctx.globalAlpha = currentBiomeKey === 'snow' ? 1 : nightT;
        const auroraGrad = ctx.createLinearGradient(0, 40, vw, 220);
        auroraGrad.addColorStop(0, 'rgba(167, 243, 208, 0.24)');
        auroraGrad.addColorStop(0.5, 'rgba(196, 181, 253, 0.28)');
        auroraGrad.addColorStop(1, 'rgba(251, 207, 232, 0.24)');
        ctx.fillStyle = auroraGrad;
        ctx.beginPath();
        ctx.moveTo(0, 140);
        for (let x = 0; x <= vw; x += 60) {
            const wave = Math.sin(x * 0.006 + Date.now() * 0.0015) * 32;
            ctx.lineTo(x, 110 + wave);
        }
        ctx.lineTo(vw, 240);
        ctx.lineTo(0, 240);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // 5. Smoothly Interpolated Parallax Mountains
    drawParallaxMountainRange(0.15, visualPalette.mountainFar, vh * 0.72, 90);
    drawParallaxMountainRange(0.3, visualPalette.mountainNear, vh * 0.82, 65);
}

function drawParallaxMountainRange(parallaxFactor, color, baseScreenY, amp) {
    const vw = getViewportWidth();
    const vh = getViewportHeight();
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, vh);
    const offset = camera.x * parallaxFactor;
    for (let x = -40; x <= vw + 40; x += 40) {
        const worldX = x + offset;
        const y = baseScreenY
            + Math.sin(worldX * 0.0025) * amp
            + Math.cos(worldX * 0.0055) * (amp * 0.45);
        ctx.lineTo(x, y);
    }
    ctx.lineTo(vw, vh);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function renderVolumetricClouds(dtFactor) {
    const vw = getViewportWidth();
    const vh = getViewportHeight();
    const nightT = visualPalette.nightBlend;

    for (const c of clouds) {
        c.x = (c.x + c.speed * dtFactor) % WORLD_WIDTH;
        const screenY = c.y - camera.y * 0.55;
        if (screenY < -150 || screenY > vh + 150) continue;

        for (let wrapOffset of [-WORLD_WIDTH, 0, WORLD_WIDTH]) {
            const screenX = (c.x + wrapOffset) - camera.x * 0.55;
            if (screenX < -250 || screenX > vw + 250) continue;

            ctx.save();
            ctx.translate(screenX, screenY);
            ctx.scale(c.scale, c.scale);

            if (currentBiomeKey === 'underwater') {
                const mistGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, 65);
                mistGrad.addColorStop(0, `rgba(224, 255, 255, ${(c.opacity * 0.45).toFixed(3)})`);
                mistGrad.addColorStop(1, 'rgba(224, 255, 255, 0)');
                ctx.fillStyle = mistGrad;
                ctx.beginPath();
                ctx.arc(0, 0, 65, 0, Math.PI * 2);
                ctx.fill();
            } else {
                const cloudGrad = ctx.createLinearGradient(0, -35, 0, 30);
                const topAlpha = c.opacity * (0.92 - nightT * 0.37);
                const botAlpha = c.opacity * (0.72 - nightT * 0.37);
                const topColor = lerpHexColor('#ffffff', '#ddd6fe', nightT);
                const botColor = lerpHexColor('#f3e8ff', '#a5b4fc', nightT);
                const [tr, tg, tb] = hexToRgb(topColor);
                const [br, bg, bb] = hexToRgb(botColor);
                cloudGrad.addColorStop(0, `rgba(${tr}, ${tg}, ${tb}, ${topAlpha.toFixed(3)})`);
                cloudGrad.addColorStop(1, `rgba(${br}, ${bg}, ${bb}, ${botAlpha.toFixed(3)})`);
                ctx.fillStyle = cloudGrad;

                ctx.beginPath();
                ctx.arc(0, 0, 34, 0, Math.PI * 2);
                ctx.arc(-28, 8, 24, 0, Math.PI * 2);
                ctx.arc(28, 8, 26, 0, Math.PI * 2);
                ctx.arc(-12, -14, 25, 0, Math.PI * 2);
                ctx.arc(14, -12, 22, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }
}

function renderPlatform3D(p, offsetX) {
    const vw = getViewportWidth();
    const vh = getViewportHeight();
    const sx = p.x + offsetX - camera.x;
    const sy = p.y - camera.y;

    if (sx + p.w < -120 || sx > vw + 120 || sy + p.h < -120 || sy - 120 > vh) {
        return;
    }

    const pTopLight = visualPalette.platTopLight;
    const pTopDark = visualPalette.platTopDark;
    const pBodyLight = visualPalette.platBodyLight;
    const pBodyDark = visualPalette.platBodyDark;
    const pRim = visualPalette.platRim;

    ctx.save();

    if (p.isBase) {
        const baseGrad = ctx.createLinearGradient(0, sy, 0, sy + p.h);
        baseGrad.addColorStop(0, pBodyLight);
        baseGrad.addColorStop(0.45, pBodyDark);
        baseGrad.addColorStop(1, '#94a3b8');
        ctx.fillStyle = baseGrad;
        ctx.fillRect(sx, sy + 14, p.w, p.h);

        const capGrad = ctx.createLinearGradient(0, sy, 0, sy + 28);
        capGrad.addColorStop(0, pTopLight);
        capGrad.addColorStop(1, pTopDark);
        ctx.fillStyle = capGrad;
        drawRoundedRect(ctx, sx, sy, p.w, 28, 14);
        ctx.fill();

        ctx.strokeStyle = pRim;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sx + 10, sy + 3);
        ctx.lineTo(sx + p.w - 10, sy + 3);
        ctx.stroke();

        drawBiomeSurfaceDetails(sx, sy, p.w, p.foliageSeed, true);
        ctx.restore();
        return;
    }

    ctx.fillStyle = 'rgba(100, 116, 139, 0.14)';
    drawRoundedRect(ctx, sx + 4, sy + 10, p.w, p.h + 6, 18);
    ctx.fill();

    if (p.isWinSpot) {
        const winBodyGrad = ctx.createLinearGradient(sx, sy, sx, sy + p.h);
        winBodyGrad.addColorStop(0, '#fef9c3');
        winBodyGrad.addColorStop(0.5, '#fde68a');
        winBodyGrad.addColorStop(1, '#f9a8d4');
        ctx.fillStyle = winBodyGrad;
        drawRoundedRect(ctx, sx, sy, p.w, p.h, 22);
        ctx.fill();

        const centerX = sx + p.w / 2;
        const pulse = Math.sin(Date.now() * 0.005) * 6;
        const haloGrad = ctx.createRadialGradient(centerX, sy - 55, 10, centerX, sy - 55, 95 + pulse);
        haloGrad.addColorStop(0, 'rgba(254, 249, 195, 0.95)');
        haloGrad.addColorStop(0.5, 'rgba(251, 207, 232, 0.5)');
        haloGrad.addColorStop(1, 'rgba(251, 207, 232, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(centerX, sy - 55, 95 + pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '900 15px Outfit, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('👑 CELESTIAL WIN SANCTUARY 👑', centerX, sy - 50);
        ctx.restore();
        return;
    }

    const bodyGrad = ctx.createLinearGradient(sx, sy + 8, sx, sy + p.h + 8);
    bodyGrad.addColorStop(0, pBodyLight);
    bodyGrad.addColorStop(1, pBodyDark);
    ctx.fillStyle = bodyGrad;
    drawRoundedRect(ctx, sx, sy + 8, p.w, p.h, 16);
    ctx.fill();

    const topGrad = ctx.createLinearGradient(sx, sy, sx, sy + 22);
    topGrad.addColorStop(0, pTopLight);
    topGrad.addColorStop(1, pTopDark);
    ctx.fillStyle = topGrad;
    drawRoundedRect(ctx, sx, sy, p.w, 22, 12);
    ctx.fill();

    ctx.strokeStyle = pRim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx + 12, sy + 2.5);
    ctx.lineTo(sx + p.w - 12, sy + 2.5);
    ctx.stroke();

    drawBiomeSurfaceDetails(sx, sy, p.w, p.foliageSeed, false);

    if (p.hasBouncePad) {
        const bx = sx + p.w / 2 - 28;
        const by = sy - 10;
        const padGrad = ctx.createLinearGradient(bx, by, bx, by + 12);
        padGrad.addColorStop(0, '#fbcfe8');
        padGrad.addColorStop(1, '#f472b6');
        ctx.fillStyle = padGrad;
        drawRoundedRect(ctx, bx, by, 56, 12, 6);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx + 8, by + 3);
        ctx.lineTo(bx + 48, by + 3);
        ctx.stroke();
    }

    ctx.restore();
}

function drawBiomeSurfaceDetails(sx, sy, w, seed, isBase) {
    const step = isBase ? 42 : 28;
    const time = Date.now() * 0.003;

    for (let x = 18; x < w - 18; x += step) {
        const px = sx + x;
        const hash = Math.sin(seed + x * 0.37);

        if (currentBiomeKey === 'grass') {
            const sway = Math.sin(time + x * 0.1) * 3;
            ctx.strokeStyle = '#6ee7b7';
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(px, sy + 2);
            ctx.quadraticCurveTo(px + sway, sy - 6, px + sway * 1.4, sy - 10);
            ctx.stroke();

            if (hash > 0.65) {
                ctx.fillStyle = hash > 0.82 ? '#fbcfe8' : '#fef08a';
                ctx.beginPath();
                ctx.arc(px + sway * 1.4, sy - 11, 3.2, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (currentBiomeKey === 'rock') {
            if (hash > 0.45) {
                ctx.fillStyle = 'rgba(233, 213, 255, 0.85)';
                ctx.beginPath();
                ctx.moveTo(px, sy + 2);
                ctx.lineTo(px + 5, sy - 11);
                ctx.lineTo(px + 10, sy + 2);
                ctx.closePath();
                ctx.fill();
            }
        } else if (currentBiomeKey === 'underwater') {
            const sway = Math.sin(time * 1.2 + x) * 4;
            ctx.strokeStyle = hash > 0 ? '#fbcfe8' : '#a5f3fc';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(px, sy + 2);
            ctx.quadraticCurveTo(px + sway, sy - 8, px + sway * 1.2, sy - 15);
            ctx.stroke();
        } else if (currentBiomeKey === 'snow') {
            if (!isBase && hash > 0.2) {
                ctx.fillStyle = 'rgba(224, 242, 254, 0.88)';
                ctx.beginPath();
                ctx.moveTo(px, sy + 30);
                ctx.lineTo(px + 4, sy + 42 + (hash * 8));
                ctx.lineTo(px + 8, sy + 30);
                ctx.closePath();
                ctx.fill();
            }
        }
    }
}

function renderRealisticFruit3D(f, offsetX) {
    if (f.collected) return;
    const vw = getViewportWidth();
    const vh = getViewportHeight();
    const sx = f.x + offsetX - camera.x;
    const sy = f.y - camera.y;
    if (sx < -60 || sx > vw + 60 || sy < -60 || sy > vh + 60) return;

    ctx.save();
    ctx.translate(sx, sy);

    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, f.radius * 1.75);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.78)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, f.radius * 1.75, 0, Math.PI * 2);
    ctx.fill();

    const r = f.radius;
    const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.12, 0, 0, r);

    if (f.type === 'apple') {
        grad.addColorStop(0, '#ffe4e6');
        grad.addColorStop(0.5, '#fda4af');
        grad.addColorStop(1, '#fb7185');
    } else if (f.type === 'peach') {
        grad.addColorStop(0, '#fff7ed');
        grad.addColorStop(0.5, '#fed7aa');
        grad.addColorStop(1, '#f9a8d4');
    } else if (f.type === 'blueberry') {
        grad.addColorStop(0, '#eff6ff');
        grad.addColorStop(0.5, '#bfdbfe');
        grad.addColorStop(1, '#818cf8');
    } else if (f.type === 'strawberry') {
        grad.addColorStop(0, '#fdf2f8');
        grad.addColorStop(0.5, '#fbcfe8');
        grad.addColorStop(1, '#f472b6');
    } else {
        grad.addColorStop(0, '#fefce8');
        grad.addColorStop(0.5, '#fef08a');
        grad.addColorStop(1, '#fbbf24');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -r + 2);
    ctx.quadraticCurveTo(3, -r - 6, 5, -r - 7);
    ctx.stroke();

    ctx.fillStyle = '#86efac';
    ctx.beginPath();
    ctx.ellipse(6, -r - 3, 6, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.35, -r * 0.35, r * 0.26, r * 0.15, -0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function renderHazard3D(h, offsetX) {
    const vw = getViewportWidth();
    const vh = getViewportHeight();
    const sx = h.x + offsetX - camera.x;
    const sy = h.y - camera.y;
    if (sx < -60 || sx > vw + 60 || sy < -60 || sy > vh + 60) return;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(h.angle);

    ctx.fillStyle = '#f472b6';
    for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(-4, -h.radius + 3);
        ctx.lineTo(0, -h.radius - 8);
        ctx.lineTo(4, -h.radius + 3);
        ctx.closePath();
        ctx.fill();
    }

    const orbGrad = ctx.createRadialGradient(-5, -5, 2, 0, 0, h.radius);
    orbGrad.addColorStop(0, '#fff1f2');
    orbGrad.addColorStop(0.55, '#fbcfe8');
    orbGrad.addColorStop(1, '#db2777');
    ctx.fillStyle = orbGrad;
    ctx.beginPath();
    ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function renderPlayer3D(offsetX = 0) {
    const vw = getViewportWidth();
    const sx = player.x + offsetX - camera.x;
    const sy = player.y - camera.y;
    if (sx < -100 || sx > vw + 100) return;

    for (const tr of player.trail) {
        const tx = getWrappedPlatX(tr.x, player.x) + offsetX - camera.x;
        const ty = tr.y - camera.y;
        ctx.save();
        ctx.fillStyle = player.speedMultiplier > 1.4
            ? `rgba(216, 180, 254, ${tr.alpha})`
            : `rgba(165, 180, 252, ${tr.alpha * 0.75})`;
        ctx.beginPath();
        ctx.arc(tx, ty, tr.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(player.squashX, player.squashY);

    if (player.portalFlash > 0) {
        ctx.strokeStyle = `rgba(216, 180, 254, ${player.portalFlash / 18})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, player.radius + (18 - player.portalFlash) * 2.2, 0, Math.PI * 2);
        ctx.stroke();
    }

    const r = player.radius;
    const bodyGrad = ctx.createRadialGradient(-r * 0.35, -r * 0.38, r * 0.1, 0, 0, r);
    if (player.speedMultiplier > 1.5) {
        bodyGrad.addColorStop(0, '#ffffff');
        bodyGrad.addColorStop(0.4, '#fbcfe8');
        bodyGrad.addColorStop(0.8, '#c4b5fd');
        bodyGrad.addColorStop(1, '#818cf8');
    } else if (player.speedMultiplier < 0.8) {
        bodyGrad.addColorStop(0, '#ffffff');
        bodyGrad.addColorStop(0.45, '#cffafe');
        bodyGrad.addColorStop(0.85, '#93c5fd');
        bodyGrad.addColorStop(1, '#60a5fa');
    } else {
        bodyGrad.addColorStop(0, '#ffffff');
        bodyGrad.addColorStop(0.42, '#fce7f3');
        bodyGrad.addColorStop(0.78, '#c4b5fd');
        bodyGrad.addColorStop(1, '#818cf8');
    }

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.38, r * 0.32, r * 0.18, -0.5, 0, Math.PI * 2);
    ctx.fill();

    const eyeOffsetX = player.facing * 5;
    ctx.fillStyle = '#312e81';
    ctx.beginPath();
    ctx.arc(eyeOffsetX - 5, -2, 3.2, 0, Math.PI * 2);
    ctx.arc(eyeOffsetX + 6, -2, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eyeOffsetX - 6, -3.2, 1.2, 0, Math.PI * 2);
    ctx.arc(eyeOffsetX + 5, -3.2, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(244, 114, 182, 0.45)';
    ctx.beginPath();
    ctx.ellipse(eyeOffsetX - 10, 3, 3.5, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(eyeOffsetX + 11, 3, 3.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function renderBoundaryWrapPortals() {
    const vw = getViewportWidth();
    const vh = getViewportHeight();
    for (let wallX of [0, WORLD_WIDTH]) {
        const sx = wallX - camera.x;
        if (sx < -60 || sx > vw + 60) continue;

        const portalGrad = ctx.createLinearGradient(sx - 18, 0, sx + 18, 0);
        portalGrad.addColorStop(0, 'rgba(196, 181, 253, 0)');
        portalGrad.addColorStop(0.5, 'rgba(196, 181, 253, 0.36)');
        portalGrad.addColorStop(1, 'rgba(196, 181, 253, 0)');
        ctx.fillStyle = portalGrad;
        ctx.fillRect(sx - 18, 0, 36, vh);
    }
}

/********************************************************************
 * 10B. TRANSLUCENT 3D JUMP PROJECTILE & LANDING BEACON ENGINE
 ********************************************************************/
function simulateJumpArc(startX, startY, simVx, simVy, maxSteps = 86) {
    const biome = BIOMES[currentBiomeKey];
    const points = [{ unwrappedX: startX, y: startY }];
    let curUnwrappedX = startX;
    let curY = startY;
    let curVy = simVy;
    let landed = false;
    let landX = startX;
    let landY = startY + player.radius;
    let landingType = 'normal'; // 'normal' | 'bounce' | 'win'

    for (let step = 1; step <= maxSteps; step++) {
        const prevBottom = curY + player.radius;
        curUnwrappedX += simVx;
        const wrappedX = ((curUnwrappedX % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;

        curVy = Math.min(18, curVy + biome.gravity);
        curY += curVy;
        const curBottom = curY + player.radius;

        // Check collision with platforms when descending
        if (curVy >= 0) {
            for (const p of platforms) {
                if (p.isBase) {
                    if (curBottom >= p.y && prevBottom <= p.y + 26) {
                        curY = p.y - player.radius;
                        landX = curUnwrappedX;
                        landY = p.y;
                        landed = true;
                        landingType = 'normal';
                        break;
                    }
                    continue;
                }

                const wx = getWrappedPlatX(p.x, wrappedX);
                const withinX = (wrappedX + player.radius * 0.65 > wx) && (wrappedX - player.radius * 0.65 < wx + p.w);
                if (withinX && prevBottom <= p.y + 18 && curBottom >= p.y) {
                    curY = p.y - player.radius;
                    landX = curUnwrappedX;
                    landY = p.y;
                    landed = true;
                    if (p.isWinSpot) {
                        landingType = 'win';
                    } else if (p.hasBouncePad && Math.abs(wrappedX - (wx + p.w / 2)) < 38) {
                        landingType = 'bounce';
                    } else {
                        landingType = 'normal';
                    }
                    break;
                }
            }
        }

        if (!landed && curY + player.radius >= WORLD_GROUND_Y) {
            curY = WORLD_GROUND_Y - player.radius;
            landX = curUnwrappedX;
            landY = WORLD_GROUND_Y;
            landed = true;
            landingType = 'normal';
        }

        points.push({ unwrappedX: curUnwrappedX, y: curY });
        if (landed) break;
    }

    return { points, landed, landX, landY, landingType };
}

function drawSingleTrajectoryArc(arcData, offsetX, isSecondary = false) {
    const { points, landed, landX, landY, landingType } = arcData;
    if (!points || points.length < 2) return;

    const vw = getViewportWidth();
    const vh = getViewportHeight();
    const firstScreenX = points[0].unwrappedX + offsetX - camera.x;
    const lastScreenX = points[points.length - 1].unwrappedX + offsetX - camera.x;
    if (Math.max(firstScreenX, lastScreenX) < -160 || Math.min(firstScreenX, lastScreenX) > vw + 160) {
        return;
    }

    ctx.save();

    // 1. Translucent Glowing Trajectory Ribbon
    const startSx = points[0].unwrappedX + offsetX - camera.x;
    const startSy = points[0].y - camera.y;
    const endSx = points[points.length - 1].unwrappedX + offsetX - camera.x;
    const endSy = points[points.length - 1].y - camera.y;

    const arcGrad = ctx.createLinearGradient(startSx, startSy, endSx, endSy);
    if (isSecondary) {
        arcGrad.addColorStop(0, 'rgba(196, 181, 253, 0.08)');
        arcGrad.addColorStop(0.5, 'rgba(216, 180, 254, 0.24)');
        arcGrad.addColorStop(1, 'rgba(244, 114, 182, 0.32)');
    } else {
        arcGrad.addColorStop(0, 'rgba(129, 140, 248, 0.16)');
        arcGrad.addColorStop(0.45, 'rgba(167, 139, 250, 0.42)');
        arcGrad.addColorStop(1, landingType === 'win'
            ? 'rgba(250, 204, 21, 0.62)'
            : landingType === 'bounce'
                ? 'rgba(244, 114, 182, 0.62)'
                : 'rgba(99, 102, 241, 0.56)');
    }

    // Soft outer glow stroke
    ctx.beginPath();
    ctx.moveTo(startSx, startSy);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].unwrappedX + offsetX - camera.x, points[i].y - camera.y);
    }
    ctx.strokeStyle = isSecondary ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.26)';
    ctx.lineWidth = isSecondary ? 4 : 6.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Inner gradient trajectory line
    ctx.strokeStyle = arcGrad;
    ctx.lineWidth = isSecondary ? 2 : 3.2;
    ctx.stroke();

    // 2. Animated Flowing Translucent Trajectory Beads
    const timePhase = (performance.now() * 0.012) % 3;
    const stepStride = isSecondary ? 4 : 3;
    for (let i = 2; i < points.length - 1; i += stepStride) {
        const pt = points[i];
        const bx = pt.unwrappedX + offsetX - camera.x;
        const by = pt.y - camera.y;
        if (bx < -40 || bx > vw + 40 || by < -40 || by > vh + 40) continue;

        const progress = i / points.length;
        const pulse = 0.85 + Math.sin(progress * Math.PI * 4 - timePhase * 2.1) * 0.25;
        const beadRadius = (isSecondary ? 2.4 : 3.4) * pulse;

        ctx.fillStyle = isSecondary
            ? 'rgba(243, 232, 255, 0.42)'
            : 'rgba(255, 255, 255, 0.72)';
        ctx.beginPath();
        ctx.arc(bx, by, beadRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    // 3. 3D Translucent Landing Target Cushion & Vertical Beacon at Predicted Landing Spot
    const targetSx = landX + offsetX - camera.x;
    const targetSy = landY - camera.y;
    if (targetSx >= -80 && targetSx <= vw + 80 && targetSy >= -80 && targetSy <= vh + 80) {
        const pulseWave = (Math.sin(performance.now() * 0.006) + 1) * 0.5;
        const primaryColor = landingType === 'win'
            ? [250, 204, 21]
            : landingType === 'bounce'
                ? [244, 114, 182]
                : isSecondary
                    ? [192, 132, 252]
                    : [129, 140, 248];
        const [cr, cg, cb] = primaryColor;

        // Vertical holographic landing beam
        const beamHeight = isSecondary ? 34 : 54;
        const beamWidth = isSecondary ? 18 : 26;
        const beamGrad = ctx.createLinearGradient(targetSx, targetSy - beamHeight, targetSx, targetSy);
        beamGrad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        beamGrad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, ${isSecondary ? 0.20 : 0.36})`);
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.ellipse(targetSx, targetSy, beamWidth, 6, 0, 0, Math.PI * 2);
        ctx.rect(targetSx - beamWidth, targetSy - beamHeight, beamWidth * 2, beamHeight);
        ctx.fill();

        // Outer expanding 3D perspective landing ring
        const outerRx = (isSecondary ? 18 : 26) + pulseWave * 7;
        const outerRy = (isSecondary ? 5.5 : 8) + pulseWave * 2.2;
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${(isSecondary ? 0.35 : 0.62) * (1 - pulseWave * 0.45)})`;
        ctx.lineWidth = isSecondary ? 1.5 : 2.2;
        ctx.beginPath();
        ctx.ellipse(targetSx, targetSy, outerRx, outerRy, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Inner glowing landing pad cushion
        ctx.fillStyle = `rgba(255, 255, 255, ${isSecondary ? 0.38 : 0.68})`;
        ctx.beginPath();
        ctx.ellipse(targetSx, targetSy, isSecondary ? 11 : 16, isSecondary ? 3.8 : 5.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ghost orb silhouette at exact landing spot
        ctx.strokeStyle = `rgba(255, 255, 255, ${isSecondary ? 0.28 : 0.52})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(targetSx, targetSy - player.radius, player.radius * 0.86, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.restore();
}

function renderJumpProjectile3D() {
    if (!gameRunning || gameWon) return;

    const targetSpeed = player.baseSpeed * player.speedMultiplier;
    let primaryArc = null;
    let secondaryDoubleJumpArc = null;

    if (player.onGround) {
        // On ground: preview where jumping right now will land
        const previewVx = Math.abs(player.vx) > 0.22
            ? player.vx
            : player.facing * targetSpeed * 0.68;
        const previewVy = -player.jumpPower;
        primaryArc = simulateJumpArc(player.x, player.y, previewVx, previewVy, 84);
    } else {
        // Airborne: show exact real-time landing trajectory of current jump
        primaryArc = simulateJumpArc(player.x, player.y, player.vx, player.vy, 90);

        // If double jump is still available, show a subtle secondary preview arc
        if (player.jumpsLeft > 0) {
            const dblVx = Math.abs(player.vx) > 0.22
                ? player.vx
                : player.facing * targetSpeed * 0.72;
            const dblVy = -player.jumpPower * 0.92;
            secondaryDoubleJumpArc = simulateJumpArc(player.x, player.y, dblVx, dblVy, 78);
        }
    }

    const wrapOffsets = [-WORLD_WIDTH, 0, WORLD_WIDTH];
    for (const offset of wrapOffsets) {
        if (secondaryDoubleJumpArc) {
            drawSingleTrajectoryArc(secondaryDoubleJumpArc, offset, true);
        }
        if (primaryArc) {
            drawSingleTrajectoryArc(primaryArc, offset, false);
        }
    }
}

function renderEnvironmentParticles(dtFactor) {
    const biome = BIOMES[currentBiomeKey];
    const isNight = sceneTime === 'night';
    const vw = getViewportWidth();
    const vh = getViewportHeight();

    ctx.save();
    for (const pt of particles) {
        pt.phase += 0.03 * dtFactor;
        if (biome.particleType === 'bubble') {
            pt.y -= (0.6 + pt.r * 0.15) * dtFactor;
            pt.x += Math.sin(pt.phase) * 0.5 * dtFactor;
            if (pt.y < -10) pt.y = vh + 10;
        } else if (biome.particleType === 'snow') {
            pt.y += (0.8 + pt.r * 0.2) * dtFactor;
            pt.x += Math.cos(pt.phase) * 0.6 * dtFactor;
            if (pt.y > vh + 10) pt.y = -10;
        } else {
            pt.x += (pt.vx + Math.sin(pt.phase) * 0.25) * dtFactor;
            pt.y += (pt.vy + Math.cos(pt.phase) * 0.25) * dtFactor;
            if (pt.x < 0) pt.x = vw;
            if (pt.x > vw) pt.x = 0;
            if (pt.y < 0) pt.y = vh;
            if (pt.y > vh) pt.y = 0;
        }

        ctx.fillStyle = isNight ? biome.nightParticleColor : biome.particleColor;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function renderFloatingTexts() {
    for (const ft of floatingTexts) {
        const sx = getWrappedPlatX(ft.x, player.x) - camera.x;
        const sy = ft.y - camera.y;
        ctx.save();
        ctx.globalAlpha = Math.max(0, ft.alpha);
        if (ft.isPuff) {
            ctx.fillStyle = ft.color;
            ctx.beginPath();
            ctx.arc(sx, sy, ft.r, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.font = '800 15px Outfit, sans-serif';
            ctx.fillStyle = ft.color;
            ctx.textAlign = 'center';
            ctx.fillText(ft.text, sx, sy);
        }
        ctx.restore();
    }
}

/********************************************************************
 * 11. HIGH-PRECISION DELTA-TIME MAIN ANIMATION LOOP
 ********************************************************************/
let lastFrameTime = performance.now();

function animate(now = performance.now()) {
    const rawDt = now - lastFrameTime;
    lastFrameTime = now;
    // Normalized to 60fps baseline (16.6667ms), clamped to prevent lag spikes on tab switch
    const dtFactor = Math.min(2.4, Math.max(0.25, rawDt / 16.6667));

    updateVisualPalette(dtFactor);

    if (gameRunning && !gamePaused && !countdownActive && !gameWon) {
        activePlayTimeMs += Math.min(100, rawDt);
        updatePhysics(dtFactor);
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(viewScale, viewScale);

    renderBackgroundAndSky(dtFactor);
    renderVolumetricClouds(dtFactor);

    const wrapOffsets = [-WORLD_WIDTH, 0, WORLD_WIDTH];
    for (const offset of wrapOffsets) {
        for (const p of platforms) {
            renderPlatform3D(p, offset);
        }
        for (const f of fruits) {
            renderRealisticFruit3D(f, offset);
        }
        for (const h of hazards) {
            renderHazard3D(h, offset);
        }
    }

    renderBoundaryWrapPortals();

    // Render Translucent 3D Jump Projectile & Landing Beacon underneath Player Orb
    renderJumpProjectile3D();

    for (const offset of wrapOffsets) {
        renderPlayer3D(offset);
    }

    renderEnvironmentParticles(dtFactor);
    renderFloatingTexts();

    ctx.restore();

    requestAnimationFrame(animate);
}

/********************************************************************
 * 12. UI NAVIGATION, PAUSE/RESUME STUDIO & EVENT LISTENERS
 ********************************************************************/
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (window.innerWidth < 480) {
        baseViewScale = Math.max(0.76, window.innerWidth / 500);
    } else if (window.innerWidth < 768) {
        baseViewScale = 0.88;
    } else {
        baseViewScale = 1.0;
    }
    viewScale = baseViewScale * currentCamZoomMult;
}
window.addEventListener('resize', resizeCanvas);

let currentInitStep = 1;
let stepTransitionTimer = null;

function showInitiationStep(stepNumber, immediate = false) {
    const step1 = document.getElementById('initStep1');
    const step2 = document.getElementById('initStep2');
    const tab1 = document.getElementById('stepTab1');
    const tab2 = document.getElementById('stepTab2');

    if (stepNumber === 2) {
        tab2.className = 'px-3.5 py-1 rounded-full text-[10px] sm:text-xs font-display font-extrabold transition-all duration-300 bg-gradient-to-r from-indigo-300 to-purple-300 text-slate-900 shadow-sm';
        tab1.className = 'px-3.5 py-1 rounded-full text-[10px] sm:text-xs font-display font-bold transition-all duration-300 theme-text-muted';
    } else {
        tab1.className = 'px-3.5 py-1 rounded-full text-[10px] sm:text-xs font-display font-extrabold transition-all duration-300 bg-gradient-to-r from-indigo-300 to-purple-300 text-slate-900 shadow-sm';
        tab2.className = 'px-3.5 py-1 rounded-full text-[10px] sm:text-xs font-display font-bold transition-all duration-300 theme-text-muted';
    }

    if (immediate || currentInitStep === stepNumber) {
        currentInitStep = stepNumber;
        if (stepTransitionTimer) clearTimeout(stepTransitionTimer);
        step1.classList.remove('step-Leaving-Left', 'step-Leaving-Right');
        step2.classList.remove('step-Leaving-Left', 'step-Leaving-Right');
        if (stepNumber === 2) {
            step1.classList.add('step-hidden');
            step2.classList.remove('step-hidden');
        } else {
            step2.classList.add('step-hidden');
            step1.classList.remove('step-hidden');
        }
        return;
    }

    currentInitStep = stepNumber;
    if (stepTransitionTimer) clearTimeout(stepTransitionTimer);

    if (stepNumber === 2) {
        step1.classList.add('step-Leaving-Left');
        stepTransitionTimer = setTimeout(() => {
            step1.classList.add('step-hidden');
            step1.classList.remove('step-Leaving-Left');
            step2.classList.add('step-Leaving-Right');
            step2.classList.remove('step-hidden');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    step2.classList.remove('step-Leaving-Right');
                });
            });
        }, 180);
    } else {
        step2.classList.add('step-Leaving-Right');
        stepTransitionTimer = setTimeout(() => {
            step2.classList.add('step-hidden');
            step2.classList.remove('step-Leaving-Right');
            step1.classList.add('step-Leaving-Left');
            step1.classList.remove('step-hidden');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    step1.classList.remove('step-Leaving-Left');
                });
            });
        }, 180);
    }
}

function setSceneTime(mode) {
    sceneTime = mode === 'night' ? 'night' : 'day';
    const hudEmoji = document.getElementById('hudSceneEmoji');
    const hudName = document.getElementById('hudSceneName');

    if (sceneTime === 'night') {
        hudEmoji.textContent = '🌙';
        hudName.textContent = 'Night';
    } else {
        hudEmoji.textContent = '☀️';
        hudName.textContent = 'Day';
    }

    document.querySelectorAll('.scene-option').forEach((btn) => {
        if (btn.dataset.scene === sceneTime) {
            btn.classList.add('active-card-indigo', 'theme-text-primary');
            btn.classList.remove('theme-text-secondary');
        } else {
            btn.classList.remove('active-card-indigo', 'theme-text-primary');
            btn.classList.add('theme-text-secondary');
        }
    });
}

function setDeviceMode(mode) {
    controlMode = mode;
    const btnLaptop = document.getElementById('selectDeviceLaptop');
    const btnPhone = document.getElementById('selectDevicePhone');
    const pauseLaptop = document.getElementById('pauseSelectLaptop');
    const pausePhone = document.getElementById('pauseSelectPhone');
    const badgeLaptop = document.getElementById('badgeLaptop');
    const badgePhone = document.getElementById('badgePhone');
    const touchOverlay = document.getElementById('touchControlsOverlay');
    const hudIcon = document.getElementById('hudDeviceIcon');
    const hudText = document.getElementById('hudDeviceText');
    const laptopHint = document.getElementById('laptopHintBanner');

    if (mode === 'laptop') {
        btnLaptop.classList.add('active-card-indigo');
        btnPhone.classList.remove('active-card-pink');
        pauseLaptop.classList.add('active-card-indigo');
        pausePhone.classList.remove('active-card-pink');
        badgeLaptop.classList.remove('hidden');
        badgePhone.classList.add('hidden');

        touchOverlay.classList.add('hidden');
        touchOverlay.classList.remove('flex');
        hudIcon.className = 'ph-bold ph-laptop text-sm text-indigo-400';
        hudText.textContent = 'Keys';
    } else {
        btnPhone.classList.add('active-card-pink');
        btnLaptop.classList.remove('active-card-indigo');
        pausePhone.classList.add('active-card-pink');
        pauseLaptop.classList.remove('active-card-indigo');
        badgePhone.classList.remove('hidden');
        badgeLaptop.classList.add('hidden');

        if (gameRunning && !gamePaused) {
            touchOverlay.classList.remove('hidden');
            touchOverlay.classList.add('flex');
        }
        hudIcon.className = 'ph-bold ph-device-mobile-camera text-sm text-pink-400';
        hudText.textContent = 'Touch';
    }

    syncHiddenZonesUI();
}

function setBiome(biomeKey) {
    if (!BIOMES[biomeKey]) return;
    currentBiomeKey = biomeKey;
    const b = BIOMES[biomeKey];

    document.querySelectorAll('.biome-card').forEach((card) => {
        if (card.dataset.biome === biomeKey) {
            card.classList.add('active-card-indigo');
        } else {
            card.classList.remove('active-card-indigo');
        }
    });

    document.getElementById('hudBiomeEmoji').textContent = b.emoji;
    document.getElementById('hudBiomeName').textContent = b.shortName;
}

function openPauseMenu() {
    if (!gameRunning || gameWon) return;
    clearCountdownTimers();
    countdownActive = false;
    setModalVisibility('countdownOverlay', false);

    gamePaused = true;
    keys.left = false;
    keys.right = false;
    keys.up = false;
    keys.accelA = false;
    keys.decelD = false;

    updateHUD();
    setModalVisibility('pauseModal', true);

    document.getElementById('hudPauseIcon').className = 'ph-fill ph-play text-xs sm:text-sm text-emerald-400';
    document.getElementById('hudPauseText').textContent = 'Resume';
}

function resumeFromPauseMenu() {
    if (!gameRunning || gameWon) return;
    setModalVisibility('pauseModal', false);

    document.getElementById('hudPauseIcon').className = 'ph-fill ph-pause text-xs sm:text-sm text-indigo-400';
    document.getElementById('hudPauseText').textContent = 'Pause';

    setDeviceMode(controlMode);

    runSmoothCountdown(`Resuming ${BIOMES[currentBiomeKey].name}`, () => {
        gamePaused = false;
        lastFrameTime = performance.now();
    });
}

window.addEventListener('keydown', (e) => {
    const code = e.code;
    const key = e.key.toLowerCase();

    // Pause / Resume Shortcut ('P' or 'Escape')
    if (key === 'p' || code === 'Escape') {
        if (gameRunning && !gameWon) {
            e.preventDefault();
            if (gamePaused) resumeFromPauseMenu();
            else openPauseMenu();
        }
        return;
    }

    // Expanded Laptop Mode Keyboard Controls
    if (controlMode === 'laptop' && gameRunning && !gameWon) {
        if (key === 'u' || key === 'h') {
            e.preventDefault();
            unhideAllZonesForCurrentMode();
            return;
        }
        if (!gamePaused && !countdownActive) {
            if (key === 'c') {
                e.preventDefault();
                cycleCameraMode();
                return;
            } else if (key === 'b') {
                e.preventDefault();
                const order = ['grass', 'rock', 'underwater', 'snow'];
                const nextIdx = (order.indexOf(currentBiomeKey) + 1) % order.length;
                setBiome(order[nextIdx]);
                showToast(BIOMES[currentBiomeKey].emoji, `Switched Geotype to ${BIOMES[currentBiomeKey].name}`);
                return;
            } else if (key === 'n') {
                e.preventDefault();
                const nextScene = sceneTime === 'day' ? 'night' : 'day';
                setSceneTime(nextScene);
                showToast(nextScene === 'night' ? '🌙' : '☀️', `Switched to ${nextScene === 'night' ? 'Starlight Night' : 'Pastel Daylight'} Scene`);
                return;
            } else if (key === 'm') {
                e.preventDefault();
                const nextTheme = uiThemeMode === 'white' ? 'dark' : 'white';
                setUiTheme(nextTheme, true);
                showToast(nextTheme === 'dark' ? '🌑' : '☀️', `Switched to ${nextTheme === 'dark' ? 'Dark' : 'White'} Glass Interface`);
                return;
            } else if (key === 'v') {
                e.preventDefault();
                document.getElementById('btnMute').click();
                return;
            }
        }
    }

    if (!gameRunning || gamePaused || countdownActive) return;

    if (code === 'ArrowLeft') {
        keys.left = true;
        e.preventDefault();
    } else if (code === 'ArrowRight') {
        keys.right = true;
        e.preventDefault();
    } else if (code === 'ArrowUp' || code === 'Space') {
        if (!keys.up) {
            triggerJump();
        }
        keys.up = true;
        e.preventDefault();
    } else if (key === 'a') {
        if (!keys.accelA) adjustSpeedMultiplier(0.15, true);
        keys.accelA = true;
    } else if (key === 'd') {
        if (!keys.decelD) adjustSpeedMultiplier(-0.15, true);
        keys.decelD = true;
    } else if (key === 'r') {
        respawnPlayer(true, "Respawned & Obby Terrain Randomized!");
    }
});

window.addEventListener('keyup', (e) => {
    const code = e.code;
    const key = e.key.toLowerCase();

    if (code === 'ArrowLeft') keys.left = false;
    else if (code === 'ArrowRight') keys.right = false;
    else if (code === 'ArrowUp' || code === 'Space') keys.up = false;
    else if (key === 'a') keys.accelA = false;
    else if (key === 'd') keys.decelD = false;
});

function bindHoldButton(btnId, onDown, onUp) {
    const el = document.getElementById(btnId);
    if (!el) return;

    const start = (ev) => {
        ev.preventDefault();
        el.classList.add('active-press');
        onDown();
    };
    const end = (ev) => {
        ev.preventDefault();
        el.classList.remove('active-press');
        if (onUp) onUp();
    };

    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointerleave', end);
    el.addEventListener('pointercancel', end);
}

bindHoldButton('touchLeft', () => { keys.left = true; }, () => { keys.left = false; });
bindHoldButton('touchRight', () => { keys.right = true; }, () => { keys.right = false; });
bindHoldButton('touchJump', () => { triggerJump(); }, null);
bindHoldButton(
    'touchAccelA',
    () => { adjustSpeedMultiplier(0.18, true); keys.accelA = true; },
    () => { keys.accelA = false; }
);
bindHoldButton(
    'touchDecelD',
    () => { adjustSpeedMultiplier(-0.18, true); keys.decelD = true; },
    () => { keys.decelD = false; }
);

// Two-Step Navigation Listeners
document.getElementById('btnGoToStep2').addEventListener('click', () => {
    sfx.init();
    sfx.playTone(480, 'sine', 0.12, 0.08, 640);
    showInitiationStep(2);
});
document.getElementById('btnBackToStep1').addEventListener('click', () => {
    sfx.playTone(520, 'sine', 0.12, 0.08, 390);
    showInitiationStep(1);
});
document.getElementById('stepTab1').addEventListener('click', () => showInitiationStep(1));
document.getElementById('stepTab2').addEventListener('click', () => showInitiationStep(2));

// Device Mode Listeners (Main & Pause)
document.getElementById('selectDeviceLaptop').addEventListener('click', () => setDeviceMode('laptop'));
document.getElementById('selectDevicePhone').addEventListener('click', () => setDeviceMode('phone'));
document.getElementById('pauseSelectLaptop').addEventListener('click', () => setDeviceMode('laptop'));
document.getElementById('pauseSelectPhone').addEventListener('click', () => setDeviceMode('phone'));

// Individual HUD Hide Buttons & Centralized Unhide All Button
document.querySelectorAll('[data-hide-target]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideSingleZone(btn.dataset.hideTarget);
    });
});

document.getElementById('btnUnhideAllUI').addEventListener('click', () => {
    unhideAllZonesForCurrentMode();
});

document.getElementById('btnCameraMode').addEventListener('click', () => {
    cycleCameraMode();
});

// Scene Time Listeners (Day / Night)
document.querySelectorAll('.scene-option').forEach((btn) => {
    btn.addEventListener('click', () => {
        setSceneTime(btn.dataset.scene);
    });
});

// UI Theme Mode Listeners (White / Dark with 4-corner per-zone transition)
document.querySelectorAll('.uitheme-option').forEach((btn) => {
    btn.addEventListener('click', () => {
        setUiTheme(btn.dataset.uitheme, true);
    });
});

document.getElementById('btnToggleUiTheme').addEventListener('click', () => {
    const nextTheme = uiThemeMode === 'white' ? 'dark' : 'white';
    setUiTheme(nextTheme, true);
    showToast(nextTheme === 'dark' ? '🌑' : '☀️', `Switched to ${nextTheme === 'dark' ? 'Dark' : 'White'} Glass Interface`);
});

document.getElementById('btnToggleScene').addEventListener('click', () => {
    const nextScene = sceneTime === 'day' ? 'night' : 'day';
    setSceneTime(nextScene);
    showToast(nextScene === 'night' ? '🌙' : '☀️', `Switched to ${nextScene === 'night' ? 'Starlight Night' : 'Pastel Daylight'} Scene`);
});

document.querySelectorAll('.biome-card').forEach((card) => {
    card.addEventListener('click', () => {
        setBiome(card.dataset.biome);
    });
});

// Launch Game from Step 2 Play Button
document.getElementById('btnStartGame').addEventListener('click', () => {
    sfx.init();
    setModalVisibility('startModal', false);
    document.getElementById('hudHeader').classList.remove('opacity-0');
    document.getElementById('elevationTracker').classList.remove('opacity-0');

    gameRunning = true;
    gamePaused = false;
    gameWon = false;
    score = 0;
    activePlayTimeMs = 0;
    setDeviceMode(controlMode);
    respawnPlayer(true, `Welcome to ${BIOMES[currentBiomeKey].name}!`);

    runSmoothCountdown(`Entering ${BIOMES[currentBiomeKey].name}`, () => {
        lastFrameTime = performance.now();
    });
});

// Pause / Resume Buttons
document.getElementById('btnPauseResume').addEventListener('click', () => {
    if (!gameRunning || gameWon) return;
    if (gamePaused) resumeFromPauseMenu();
    else openPauseMenu();
});

document.getElementById('btnResumeGame').addEventListener('click', () => {
    resumeFromPauseMenu();
});

document.getElementById('btnPauseShuffle').addEventListener('click', () => {
    setModalVisibility('pauseModal', false);
    document.getElementById('hudPauseIcon').className = 'ph-fill ph-pause text-xs sm:text-sm text-indigo-400';
    document.getElementById('hudPauseText').textContent = 'Pause';
    respawnPlayer(true, "Obby Reshuffled! Respawned at Solid Base");
    runSmoothCountdown("Fresh Obby Ready", () => {
        gamePaused = false;
        lastFrameTime = performance.now();
    });
});

// Save Current Highest Score, Fruits & Time (if any) and Return to Main Menu
document.getElementById('btnPauseSaveMainMenu').addEventListener('click', async () => {
    clearCountdownTimers();
    countdownActive = false;
    const elapsedSec = activePlayTimeMs >= 1000 ? Math.max(1, Math.round(activePlayTimeMs / 1000)) : null;

    if (score > 0 || collectedFruits > 0 || elapsedSec !== null) {
        await saveHighScore(score, collectedFruits, elapsedSec, currentBiomeKey);
        showToast("💾", `Progress Saved! Best Score & Time Updated`);
    } else {
        updateHighScoreUI();
        showToast("🏠", "Returned to Main Menu");
    }

    setModalVisibility('pauseModal', false);

    document.getElementById('hudPauseIcon').className = 'ph-fill ph-pause text-xs sm:text-sm text-indigo-400';
    document.getElementById('hudPauseText').textContent = 'Pause';

    gameRunning = false;
    gamePaused = false;
    showInitiationStep(1, true);
    setModalVisibility('startModal', true);
});

document.getElementById('btnQuickBiome').addEventListener('click', () => {
    const order = ['grass', 'rock', 'underwater', 'snow'];
    const nextIdx = (order.indexOf(currentBiomeKey) + 1) % order.length;
    setBiome(order[nextIdx]);
    showToast(BIOMES[currentBiomeKey].emoji, `Switched Geotype to ${BIOMES[currentBiomeKey].name}`);
});

document.getElementById('btnToggleDevice').addEventListener('click', () => {
    setDeviceMode(controlMode === 'laptop' ? 'phone' : 'laptop');
    showToast(controlMode === 'laptop' ? '💻' : '📱', `Switched to ${controlMode === 'laptop' ? 'Laptop Keyboard' : 'Smartphone Touch'} Mode`);
});

document.getElementById('btnRespawn').addEventListener('click', () => {
    respawnPlayer(true, "Obby Reshuffled! Respawned at Solid Base");
});

document.getElementById('btnMute').addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    const icon = document.getElementById('iconMute');
    icon.className = sfx.muted ? 'ph-bold ph-speaker-slash text-sm text-rose-400' : 'ph-bold ph-speaker-high text-sm';
});

document.getElementById('btnOpenMenu').addEventListener('click', () => {
    clearCountdownTimers();
    countdownActive = false;
    setModalVisibility('countdownOverlay', false);
    setModalVisibility('pauseModal', false);

    const elapsedSec = activePlayTimeMs >= 1000 ? Math.max(1, Math.round(activePlayTimeMs / 1000)) : null;
    if (score > 0 || collectedFruits > 0 || elapsedSec !== null) {
        saveHighScore(score, collectedFruits, elapsedSec, currentBiomeKey);
    }

    gameRunning = false;
    gamePaused = false;
    showInitiationStep(1, true);
    setModalVisibility('startModal', true);
});

document.getElementById('btnPlayAgain').addEventListener('click', () => {
    setModalVisibility('victoryModal', false);
    gameWon = false;
    gameRunning = true;
    gamePaused = false;
    score = 0;
    activePlayTimeMs = 0;
    respawnPlayer(true, "New Randomized Obby Generated!");
    runSmoothCountdown("New Ascent Begins", () => {
        lastFrameTime = performance.now();
    });
});

document.getElementById('btnWinMenu').addEventListener('click', () => {
    setModalVisibility('victoryModal', false);
    gameWon = false;
    gameRunning = false;
    gamePaused = false;
    showInitiationStep(2, true);
    setModalVisibility('startModal', true);
});

/********************************************************************
 * 13. INITIALIZE ON WINDOW LOAD
 ********************************************************************/
window.onload = function () {
    resizeCanvas();
    if ('ontouchstart' in window && window.innerWidth < 900) {
        setDeviceMode('phone');
    } else {
        setDeviceMode('laptop');
    }
    setUiTheme('white', false);
    setSceneTime('day');
    setBiome('grass');
    showInitiationStep(1, true);
    generateRandomizedWorld();
    updateSpeedHUD();
    initCloudStorage();
    lastFrameTime = performance.now();
    requestAnimationFrame(animate);
};
