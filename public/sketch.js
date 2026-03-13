let players = {};
let myTank = null;
let bullets = [];
let lasers = [];
let flares = [];
let companions = {};
let companionVisionCache = {}; // { ownerId: { x, y, points } } — only recalc when moved
let muzzleFlashes = [];
let level = [];
let levelNumber = -1;
let explosions = [];
let trails = [];
let woodTexture;
let drops = []; // Store active drops
let vacuumDrops = []; // { x, y, buff, targetX, targetY, life } — flying toward player at round end
let fogSuppressed = false; // true during vacuum animation until transition or next level
// let drops = [{ x: 200, y: 200, buff: 'speed' }, { x: 250, y: 200, buff: 'fireRate' }, { x: 300, y: 200, buff: 'bulletSpeed' }, { x: 350, y: 200, buff: 'shield' }, { x: 400, y: 200, buff: 'multiShot' }, { x: 450, y: 200, buff: 'bulletBounces' }]; // test drop
let buffs = [];

// Minimap: tracks which tiles have been seen this run
let exploredTiles = null;
let skipMarkExplored = false; // true for one updatePlayers cycle after a level load

let camX = 0, camY = 0, camZ = 600;

// ---- Sound System (Web Audio API) ----
const _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const _soundBuffers = {};

async function _loadSound(name, url) {
    try {
        const resp = await fetch(url);
        const arrayBuf = await resp.arrayBuffer();
        _soundBuffers[name] = await _audioCtx.decodeAudioData(arrayBuf);
    } catch (e) {
        console.warn(`Sound '${name}' failed to load:`, e);
    }
}

// worldX/worldY: position in game world. Volume attenuates with distance from camera.
function _playSound(name, worldX, worldY, { volume = 1, pitchScale = 1 } = {}) {
    const buf = _soundBuffers[name];
    if (!buf) return;
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    const dx = worldX - camX, dy = worldY - camY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const MAX_DIST = 900;
    const distVol = Math.max(0, 1 - dist / MAX_DIST);
    if (distVol <= 0) return;
    const gainNode = _audioCtx.createGain();
    gainNode.gain.value = volume * distVol;
    gainNode.connect(_audioCtx.destination);
    const source = _audioCtx.createBufferSource();
    source.buffer = buf;
    source.playbackRate.value = pitchScale * (0.92 + Math.random() * 0.5);
    source.connect(gainNode);
    source.start(0);
}
// ---- End Sound System ----
let groupedWalls = [];
let floorTex = null, wallTex = null;
let useTextures = false; // toggle with T
let showFps = false;    // toggle with P
const _fpsHistory = [];
let _smoothFps = 60;

function createLevelTextures() {
    const ts = TILE_SIZE;

    // Floor tile: sandy base with subtle darker border seam
    floorTex = createGraphics(ts, ts);
    floorTex.pixelDensity(1);
    floorTex.background(148, 118, 68);
    floorTex.noFill();
    floorTex.stroke(108, 82, 36, 130);
    floorTex.strokeWeight(2);
    floorTex.rect(1, 1, ts - 2, ts - 2);
    // Faint inner highlight
    floorTex.stroke(170, 138, 82, 45);
    floorTex.strokeWeight(1);
    floorTex.rect(4, 4, ts - 8, ts - 8);

    // Wall tile: warm brown with horizontal stone-course lines
    wallTex = createGraphics(ts, WALL_HEIGHT);
    wallTex.pixelDensity(1);
    wallTex.background(120, 80, 40);
    wallTex.stroke(82, 52, 18, 110);
    wallTex.strokeWeight(1.5);
    for (let y = 22; y < WALL_HEIGHT; y += 22) {
        wallTex.line(0, y, ts, y);
    }
}

function rebuildGroupedWalls() {
    groupedWalls = [];
    if (!level.length) return;
    const rows = level.length;
    const cols = level[0].length;
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (level[row][col] <= 0 || visited[row][col]) continue;
            let w = 1;
            while (col + w < cols && level[row][col + w] > 0 && !visited[row][col + w]) w++;
            let h = 1;
            outer: while (row + h < rows) {
                for (let c = col; c < col + w; c++) {
                    if (level[row + h][c] <= 0 || visited[row + h][c]) break outer;
                }
                h++;
            }
            for (let r = row; r < row + h; r++)
                for (let c = col; c < col + w; c++)
                    visited[r][c] = true;
            groupedWalls.push({
                x: col * TILE_SIZE, y: row * TILE_SIZE,
                width: w * TILE_SIZE, height: h * TILE_SIZE,
                wallHeight: level[row][col] * WALL_HEIGHT,
            });
        }
    }
}

// Returns 1.0 at low tank counts, scales down toward 0.15 at high counts.
function hexToRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function playerColor(tank, _isSelf, alpha = 255) {
    if (tank.isAI) return [...tank.color, alpha];
    const cls = TANK_CLASSES.find(c => c.id === tank.selectedClass);
    const rgb = cls ? hexToRgb(cls.color) : [80, 120, 255];
    return [...rgb, alpha];
}

function particleScale() {
    const n = Object.keys(players).length;
    return Math.max(0.15, 4 / Math.max(4, n));
}

let shakeIntensity = 0;
let shakeDuration = 0;
let smokeClouds = []; // { x, y, radius, framesLeft }

let killIndicators = []; // { x, y, life, maxLife, text, color? }
let pillageAnims = [];  // { x, y, buff, rarity, life, maxLife }
let prevMyKills = 0;

const BUFF_LABELS = {
    speed: 'SPEED', maxBullets: 'MAX BULLETS', bulletSpeed: 'BULLET SPD',
    bulletBounces: 'BOUNCES', shield: 'SHIELD', multiShot: 'MULTISHOT',
    visionRange: 'VISION', piercing: 'PIERCE', autoTurret: 'TURRET',
    explosive: 'EXPLOSIVE', regen: 'SHIELD REGEN', chain: 'CHAIN', orbit: 'ORBIT', haste: 'HASTE',
    shockwave: 'SHOCKWAVE', scavenge: 'SCAVENGE',
    nullfield: 'NULLFIELD', ghost: 'GHOST', afterimage: 'AFTERIMAGE',
};
let skipKillDetection = false;
let prevMyBuffs = {};
let skipBuffDetection = false;

let lobbyCode = null;
let lobbyZones = [];
let zoneProgress = {};

let gameState = "playing"; // Other states: "transition", "waiting"
let transitionTimer = 0;
let transitionMessage = '';
let gameMode = 'lobby';

// Spectate state (persists across draw frames)
let spectateTargetId = null;
let spectateCamX = 0, spectateCamY = 0;

// adjustable parameters for vision/raycasting
let visionResolution = Math.PI / 150; // smaller value gives finer fog edges

let VIEWPORT_WIDTH = 800; // Match canvas width
let VIEWPORT_HEIGHT = 600; // Match canvas height

let ping = 0;
let pingHistory = [];

let tracks = [];
let trackState = {};                // per-tank: { prev:{x,y}, accum:number }
const TRACK_SPACING = PLAYER_SIZE * 0.8;     // increase for wider spacing
const TRACK_FADE_FRAMES = 120;

// --- Client-side smoothing state ---
const BULLET_PREDICTION_ENABLED = false; // show predicted bullet immediately on fire; disable if ghost bullets become an issue
let smoothingEnabled = true;
const aiTurretSmoothed = {}; // id -> smoothed turret angle for rate-limited AI tanks
let localTurretAngle = 0;
// Dead-reckoning baseline (captured from each server tick)
let _serverTickX = 0, _serverTickY = 0, _serverTickVx = 0, _serverTickVy = 0, _lastLocalTickMs = 0;
let currentKeys = { w: false, a: false, s: false, d: false };
let currentTurretAngle = 0;
let localLaserTurretAngle = null; // client-side accumulated angle during laser channeling, immune to tick snaps
let laserChanneling = false;   // true while right-click held for Laser class
let guardianShielding = false; // true while right-click held for Guardian class
let sniperPanning = false;     // true while right-click held for Sniper class
let sniperPanX = 0, sniperPanY = 0; // smoothed camera pan offset
let engineerRallyPoint = null;
let engineerRallyTimer = 0;

// Manual key state — clears on blur so keys never get stuck
const keysHeld = {};
const isLobbyPanelOpen = () => !document.getElementById('lobby-controls')?.classList.contains('is-hidden');
window.addEventListener('keydown', e => { if (!isLobbyPanelOpen()) keysHeld[e.code] = true; });
window.addEventListener('keyup', e => { delete keysHeld[e.code]; });
function clearAllInput() {
    Object.keys(keysHeld).forEach(k => delete keysHeld[k]);
    guardianShielding = false;
    laserChanneling = false;
    sniperPanning = false;
    socket.emit('playerInput', { keys: { w: false, a: false, s: false, d: false }, turretAngle: 0, shieldActive: false });
}
window.addEventListener('blur', clearAllInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearAllInput(); });
// Raw mouseup to reliably clear right-click state when other buttons are also held
window.addEventListener('mouseup', e => {
    if (e.button === 2) {
        guardianShielding = false; laserChanneling = false; sniperPanning = false;
    }
});
const playerInterpBuf = {}; // id -> [{x, y, angle, turretAngle, t}, ...]
const INTERP_DELAY_MS = 50;
let bulletState = {}; // id -> {x, y, angle, speed, receivedAt}
let predictedBullets = []; // client-side predicted bullets fired by local player (before server echo)


function getViewportBounds(playerX, playerY) {
    return {
        left: playerX - VIEWPORT_WIDTH / 2,
        right: playerX + VIEWPORT_WIDTH / 2,
        top: playerY - VIEWPORT_HEIGHT / 2 - 200,
        bottom: playerY + VIEWPORT_HEIGHT / 2 - 200,
    };
}

function isInsideViewport(x, y, viewport) {
    return (
        x + TILE_SIZE > viewport.left &&
        x - TILE_SIZE < viewport.right &&
        y + TILE_SIZE > viewport.top &&
        y - TILE_SIZE < viewport.bottom
    );
}

let _pingSentAt = 0;
function updatePing() {
    _pingSentAt = performance.now();
    socket.emit('pingCheck', 0);
}

socket.on('pingResponse', () => {
    const roundTripTime = performance.now() - _pingSentAt;
    pingHistory.push(roundTripTime);
    if (pingHistory.length > 10) pingHistory.shift();
    ping = pingHistory.reduce((a, b) => a + b, 0) / pingHistory.length;
});

// Update ping every 2 seconds
setInterval(updatePing, 2000);

socket.on('lobbyCreated', (data) => {
    console.log(`Lobby created! Code: ${data.lobbyCode}`);
    // Initialize game with data.level
    lobbyCode = data.lobbyCode;
    // document.getElementById('lobby-info').innerText = `Lobby: ${lobbyCode}`
});

socket.on('lobbyJoined', (data) => {
    console.log(`Joined lobby: ${data.lobbyCode}`);
    // Initialize game with data.level and data.players
    lobbyCode = data.lobbyCode;
    // document.getElementById('lobby-info').innerText = `Lobby: ${lobbyCode}`
});

socket.on('error', (err) => {
    alert(err.message);
});

socket.on('tick', (data) => {
    if (data.bullets) {
        const now = performance.now();
        const nextState = {};
        data.bullets.forEach((b, i) => {
            nextState[i] = { x: b.x, y: b.y, angle: b.angle, speed: b.speed, receivedAt: now };
        });
        bulletState = nextState;
        bullets = data.bullets;
        // Expire predicted bullets — real bullets are now in bulletState
        predictedBullets = predictedBullets.filter(pb => now - pb.createdAt < 150);
    }
    if (data.lasers !== undefined) lasers = data.lasers;
    if (data.flares !== undefined) flares = data.flares;
    if (data.companions !== undefined) companions = data.companions;
    if (data.smoke !== undefined) smokeClouds = data.smoke;
    if (data.zones !== undefined) zoneProgress = data.zones;
    const serverPlayers = data.players;
    const now = performance.now();
    for (const [id, p] of Object.entries(serverPlayers)) {
        if (id === socket.id) {
            // Capture server baseline for dead-reckoning
            _serverTickX = p.x; _serverTickY = p.y;
            _serverTickVx = p.vx || 0; _serverTickVy = p.vy || 0;
            _lastLocalTickMs = now;
        } else {
            if (!playerInterpBuf[id]) playerInterpBuf[id] = [];
            playerInterpBuf[id].push({ x: p.x, y: p.y, angle: p.angle, turretAngle: p.turretAngle || 0, t: now });
            if (playerInterpBuf[id].length > 20) playerInterpBuf[id].shift();
        }
    }
    for (const id of Object.keys(playerInterpBuf)) {
        if (!serverPlayers[id]) delete playerInterpBuf[id];
    }
    players = serverPlayers;
    skipMarkExplored = false;

    const me = serverPlayers[socket.id];
    if (me) {
        const newKills = me.kills || 0;
        if (!skipKillDetection && newKills > prevMyKills) {
            killIndicators.push({ x: me.x, y: me.y, life: 40, maxLife: 40, text: 'HIT' });
        }
        prevMyKills = newKills;
        skipKillDetection = false;

        const buffNames = {
            speed: 'SPEED', maxBullets: 'FIRE RATE', bulletSpeed: 'BULLET SPD',
            bulletBounces: 'BOUNCES', shield: 'SHIELD', multiShot: 'MULTISHOT',
            visionRange: 'VISION', piercing: 'PIERCE', autoTurret: 'TURRET',
            explosive: 'EXPLODE', homing: 'HOMING', regen: 'REGEN',
            chain: 'CHAIN', orbit: 'ORBIT', haste: 'HASTE',
            shockwave: 'SHOCKWAVE', scavenge: 'SCAVENGE',
            nullfield: 'NULLFIELD', ghost: 'GHOST', afterimage: 'AFTERIMAGE',
        };
        const newBuffs = me.buffs || {};
        const newBuffSnapshot = { ...newBuffs, shield: (newBuffs.shield || 0) + (me.shield ? 1 : 0) };
        if (!skipBuffDetection) {
            for (const [type, label] of Object.entries(buffNames)) {
                if ((newBuffSnapshot[type] || 0) > (prevMyBuffs[type] || 0)) {
                    killIndicators.push({ x: me.x, y: me.y, life: 50, maxLife: 50, text: `+${label}`, color: [100, 255, 160] });
                    _playSound('powerup', me.x, me.y, { volume: 0.7 });
                }
            }
        }
        skipBuffDetection = false;
        prevMyBuffs = newBuffSnapshot;
    }
});


let chainRays = [];
socket.on('chainRays', (data) => {
    for (const t of data.targets) {
        chainRays.push({ x1: data.x, y1: data.y, x2: t.x, y2: t.y, life: 18 });
    }
});

socket.on('tilesUpdated', (tiles) => {
    for (const { row, col } of tiles) {
        if (level[row]) level[row][col] = 0;
    }
    rebuildGroupedWalls();
});


socket.on('updateLevel', (data) => {
    level = data.level; // Store the level received from the server
    levelNumber = data.levelNumber;
    lobbyZones = data.zones || [];
    zoneProgress = {};
    rebuildGroupedWalls();
    clearVisionCache();
    tracks.length = 0;
    trackState = {};
    // Reset minimap exploration on every new level
    exploredTiles = level.length && level[0].length
        ? Array.from({ length: level.length }, () => new Array(level[0].length).fill(false))
        : null;
    // Block markExplored until the next updatePlayers so stale positions
    // from the previous level don't pollute the fresh exploredTiles.
    skipMarkExplored = true;
});

socket.on('explosion', (data) => {
    createExplosion(data.x, data.y, data.z, data.size, data.color, data.effect)
    if (data.size > BULLET_SIZE + 1) {
        triggerScreenShake(data.size / 12, Math.min(8, Math.round(data.size / 7)));
    }
    // Distance-attenuated sound based on explosion size / effect:
    // shield hit → shield_hit
    // size < 3   → muzzle flash / shoot sound
    // 3–11       → bullet impact
    // 12+        → big explosion (tank death, splash, cannon)
    if (data.effect === 'shield') {
        _playSound('shield_hit', data.x, data.y, { volume: 0.5 });
    } else if (data.size < 3) {
        _playSound('shoot', data.x, data.y, { volume: 0.18 });
    } else if (data.size < 12) {
        _playSound('bullet_collision', data.x, data.y, { volume: 0.25 });
    } else {
        const vol = Math.min(0.85, 0.4 + data.size / 40);
        const pitch = Math.max(0.7, 1.2 - data.size / 60);
        _playSound('bigexplosion', data.x, data.y, { volume: vol, pitchScale: pitch });
    }
    // explosions.push({
    //     x: data.x,
    //     y: data.y,
    //     z: data.z, // Initial explosion height
    //     size: data.size, // Initial explosion size
    //     dSize: data.dSize,
    //     alpha: 255, // Initial opacity
    //     isAI: false,
    // });
});

socket.on('victory', () => {
    transitionMessage = "Victory!"
})

socket.on('levelComplete', (data) => {
    transitionMessage = `Level ${data.levelNumber + 1} Complete!`;
})

socket.on('gameMode', (mode) => {
    gameMode = mode;
    transitionMessage = `Starting ${mode}!`;
})

socket.on('gameOver', () => {
    transitionMessage = "Game Over";
})

socket.on('transitionTimer', (data) => {
    gameState = "transition";
    transitionTimeLeft = data.secondsLeft;
    fogSuppressed = false;
});

socket.on('nextLevel', () => {
    // socket.emit('createPlayer')
    gameState = "playing";
    transitionTimeLeft = null;
    flares = [];
    companions = {};
    companionVisionCache = {};
    spectateTargetId = null;
    killIndicators = [];
    pillageAnims = [];
    scavengeAnims = [];
    afterimageAnims = [];
    smokeClouds = [];
    vacuumDrops = [];
    chainRays = [];
    smoothingEnabled = true;
    fogSuppressed = false;
    skipKillDetection = true;
    skipBuffDetection = true;
    prevMyBuffs = {};
});

socket.on('smokeCloud', (sc) => { smokeClouds.push({ ...sc, framesLeft: sc.duration }); });
socket.on('muzzleFlash', (data) => { muzzleFlashes.push({ ...data, life: 7 }); });

socket.on('arenaMode', () => {

});

socket.on('updateDrops', (serverDrops) => {
    drops = serverDrops;
});

socket.on('dropsVacuum', (events) => {
    smoothingEnabled = false;
    fogSuppressed = true;
    for (const ev of events) {
        vacuumDrops.push({ x: ev.x, y: ev.y, buff: ev.buff, rarity: ev.rarity, targetX: ev.targetX, targetY: ev.targetY, life: 120 });
    }
});

socket.on('pillageAnim', ({ x, y, buff, rarity }) => {
    pillageAnims.push({ x, y, buff, rarity, life: 85, maxLife: 85 });
});

let scavengeAnims = []; // { x, y, life, maxLife }
socket.on('scavengeProc', ({ x, y }) => {
    scavengeAnims.push({ x, y, life: 45, maxLife: 45 });
});

let afterimageAnims = []; // { x, y, angle, turretAngle, life, maxLife }
socket.on('afterimageFire', ({ x, y, angle, turretAngle }) => {
    afterimageAnims.push({ x, y, angle, turretAngle, life: 28, maxLife: 28 });
});

socket.on('laserFired', (laserData) => {
    const { x, y, angle, range, width } = laserData;

    // Draw the laser on the canvas
    // ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.fillRect(0, -width / 2, range, width);
    // ctx.restore();
});


let font
let fogLayer
let cnv
let gameMount

function getMountSize() {
    // Cache the element
    if (!gameMount) gameMount = document.getElementById('game-mount') || document.body;
    const r = gameMount.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    return { w, h };
}

async function setup() {
    // createCanvas(1200, 800, WEBGL);
    // let canvas = createCanvas(800, 600, WEBGL);
    // canvas.position((window.innerWidth - width) / 2, (window.innerHeight - height) / 2);


    if (!gameMount) gameMount = document.getElementById('game-mount') || document.body;
    cnv = createCanvas(1100, 680, WEBGL);
    cnv.parent(gameMount);
    cnv.elt.addEventListener('contextmenu', e => e.preventDefault());

    pixelDensity(1);

    try {
        font = await loadFont('assets/Roboto-Regular.ttf');
        console.log('Font loaded!');
    } catch (err) {
        console.error('Font failed to load:', err);
        font = null;
    }

    frameRate(60);
    fogLayer = createGraphics(width * 2, height * 2);
    createLevelTextures();
    // Dev console helper: type godMode() in the browser console to toggle invincibility
    _loadSound('shoot', 'assets/sounds/shoot.wav');
    _loadSound('bigexplosion', 'assets/sounds/bigexplosion.wav');
    _loadSound('bullet_collision', 'assets/sounds/bullet_collision.wav');
    _loadSound('shield_hit', 'assets/sounds/shield_hit.wav');
    _loadSound('powerup', 'assets/sounds/powerup.wav');

    window.godMode = () => socket.emit('toggleGodMode');
    socket.on('godModeStatus', (on) => console.log(`%cGod mode ${on ? 'ON ✓' : 'OFF ✗'}`, `color:${on ? 'lime' : 'red'};font-weight:bold`))
    // fogLayer.clear();
}

let menuAngle = 0; // start screen animation phase


function draw() {
    if (deltaTime > 0) {
        _fpsHistory.push(1000 / deltaTime);
        if (_fpsHistory.length > 60) _fpsHistory.shift();
        _smoothFps = _fpsHistory.reduce((a, b) => a + b, 0) / _fpsHistory.length;
    }
    background(51);
    lights();
    directionalLight(80, 80, 80, 1, 1, -1)
    directionalLight(80, 80, 80, 1, -1, -1)

    if (gameState === "transition") {
        if (vacuumDrops.length > 0 && myTank) {
            camera(camX, camY, camZ, myTank.x, myTank.y, 0, 0, 1, 0);
            drawDrops();
        }
        drawTransitionScreen();
        return;
    }

    // Start screen// Start screen
    if (!level || !level[0] || !lobbyCode) {
        // Camera + bg
        // camera(0, 0, 700, 0, 0, 0);
        background(10, 12, 18);

        // --- 2D overlay (we won't worry about depth) ---
        push();
        resetMatrix();                 // switch to screen space
        translate(0, height / 16);

        // Subtle grid backdrop
        push();
        const gridAlpha = 22;
        stroke(30, 120, 255, gridAlpha);
        strokeWeight(1);
        noFill();
        const gs = 28;                      // grid spacing
        const cols = ceil(width / gs);
        const rows = ceil(height / gs);
        translate(-width / 2, -height / 2 - 2 * gs);
        for (let i = 0; i <= cols; i++) {
            line(i * gs, 0, i * gs, height);
        }
        for (let j = 0; j <= rows; j++) {
            line(0, j * gs, width, j * gs);
        }
        pop();

        // Radar center position (slightly above center)
        translate(0, -40);

        // Concentric pulsing rings
        noFill();
        for (let i = 1; i <= 4; i++) {
            const r = 70 * i;
            const a = 120 + 60 * sin(frameCount * 0.03 + i * 0.7);
            stroke(110, 168, 255, a);
            strokeWeight(2);
            ellipse(0, 0, r * 2, r * 2, 50);

        }

        // Rotating sweep (soft pie slice)
        push();
        const sweepA = menuAngle;
        const sweepW = PI / 6; // width of the sweep
        noStroke();
        const sweepAlpha = 36;
        fill(110, 168, 255, sweepAlpha);
        beginShape();
        vertex(0, 0);
        // edge 1
        for (let t = 0; t <= 1; t += 0.2) {
            const a = sweepA - sweepW / 2 + t * sweepW;
            const rr = 280;
            vertex(rr * cos(a), rr * sin(a));
        }
        endShape(CLOSE);
        pop();

        // Orbiting dots
        noStroke();
        for (let i = 0; i < 6; i++) {
            const a = 2.5 * menuAngle + (TWO_PI * i / 6);
            const rr = 140 + 26 * sqrt(i) * sin(frameCount * 0.02 + i);
            const x = rr * cos(a);
            const y = rr * sin(a);
            // glow
            fill(255, 240, 180, 80);
            circle(x, y, 16);
            // core
            fill(255, 240, 180, 200);
            circle(x, y, 6);
        }

        // Title & UI chips
        textFont(font);
        textAlign(CENTER, CENTER);

        // Title
        fill(240);
        noStroke();
        textSize(width / 14);
        text("TANK ARENA", 0, -height / 2 + 90);

        // Chips
        const chips = ["W / A / S / D — Move", "Mouse — Aim", "Click — Fire"];
        const chipW = width * 0.45;
        const chipH = height / 16;
        const spacing = chipH * 1.2;
        const startY = height / 2 - chipH * chips.length * 1.4;

        textSize(width / 45);
        for (let i = 0; i < chips.length; i++) {
            const y = startY + i * spacing;
            // chip bg
            fill(20, 24, 32);
            rectMode(CENTER);
            rect(0, y, chipW, chipH, 12);
            // border pulse
            noFill();
            stroke(110, 168, 255, 80 + 40 * sin(frameCount * 0.05 + i));
            strokeWeight(2);
            rect(0, y, chipW, chipH, 12);
            // label
            push();
            translate(0, 0, 1);
            noStroke();
            fill(220);
            text(chips[i], 0, y);
            pop();
        }

        pop(); // end overlay

        // animate
        menuAngle += 0.02;

        return;
    }


    // Draw ground

    const gridWidth = level[0].length * TILE_SIZE; // Width of the ground
    const gridHeight = level.length * TILE_SIZE; // Height of the ground

    // Run prediction so all geometry uses current-frame positions.
    if (smoothingEnabled) applySmoothing();
    myTank = players[socket.id] || myTank; // always prefer current server object

    if (!myTank) return;

    let targetTank = myTank;
    let allDead = false;
    let isSpectating = false;

    if (myTank.isDead) {
        isSpectating = true;
        const spectatable = Object.entries(players)
            .filter(([id, p]) => !p.isAI && !p.isDead && id !== socket.id)
            .sort((a, b) => a[0].localeCompare(b[0]));

        if (spectatable.length === 0) {
            allDead = true;
            targetTank = myTank;
        } else {
            if (!spectatable.find(([id]) => id === spectateTargetId)) {
                spectateTargetId = spectatable[0][0];
                spectateCamX = spectatable[0][1].x;
                spectateCamY = spectatable[0][1].y;
            }
            targetTank = players[spectateTargetId] || spectatable[0][1];
        }

        spectateCamX += (targetTank.x - spectateCamX) * 0.10;
        spectateCamY += (targetTank.y - spectateCamY) * 0.10;
        camX = spectateCamX;
        camY = spectateCamY + 200;
        camZ = 600;
    } else {
        camX = targetTank.x;
        camY = targetTank.y + 200;
        camZ = 600;
    }

    // Sniper scope pan: smoothly shift camera toward mouse world direction while right-click held
    const panDist = 220;
    if (sniperPanning && myTank && myTank.selectedClass === 'sniper') {
        const panAngle = atan2(mouseY - height / 2, mouseX - width / 2);
        const mouseDist = Math.hypot(mouseX - width / 2, mouseY - height / 2);
        const scaledDist = panDist * Math.min(1, mouseDist / (Math.min(width, height) * 0.35));
        sniperPanX = lerp(sniperPanX, cos(panAngle) * scaledDist, 0.07);
        sniperPanY = lerp(sniperPanY, sin(panAngle) * scaledDist, 0.07);
    } else {
        sniperPanX = lerp(sniperPanX, 0, 0.10);
        sniperPanY = lerp(sniperPanY, 0, 0.10);
    }
    camX += sniperPanX;
    camY += sniperPanY;

    let targetX = targetTank.x + sniperPanX;
    let targetY = targetTank.y + sniperPanY;
    let targetZ = 0;

    let offsetX = 0;
    let offsetY = 0;
    let offsetZ = 0;

    if (shakeDuration > 0) {
        offsetX = random(-shakeIntensity, shakeIntensity);
        offsetY = random(-shakeIntensity, shakeIntensity);
        shakeDuration--;
        if (shakeDuration <= 0) shakeIntensity = 0;
    }

    camera(camX + offsetX, camY + offsetY, camZ + offsetZ, targetX + offsetX, targetY + offsetY, targetZ, 0, 1, 0);

    if (useTextures && floorTex) {
        const camCX = myTank ? myTank.x : gridWidth / 2;
        const camCY = myTank ? myTank.y : gridHeight / 2;
        const margin = 700;
        const cStart = Math.max(0, Math.floor((camCX - margin) / TILE_SIZE));
        const cEnd = Math.min(level[0].length - 1, Math.ceil((camCX + margin) / TILE_SIZE));
        const rStart = Math.max(0, Math.floor((camCY - margin) / TILE_SIZE));
        const rEnd = Math.min(level.length - 1, Math.ceil((camCY + margin) / TILE_SIZE));
        noStroke();
        for (let r = rStart; r <= rEnd; r++) {
            for (let c = cStart; c <= cEnd; c++) {
                push();
                translate((c + 0.5) * TILE_SIZE, (r + 0.5) * TILE_SIZE, -2);
                texture(floorTex);
                plane(TILE_SIZE, TILE_SIZE);
                pop();
            }
        }
    } else {
        push();
        fill(150, 120, 70);
        translate(gridWidth / 2, gridHeight / 2, -2);
        noStroke();
        plane(gridWidth, gridHeight);
        pop();
    }
    if (gameMode === 'lobby') {
        push();
        translate(gridWidth / 2, gridHeight / 2, -1);
        textSize(TILE_SIZE);
        textFont(font);
        textAlign(CENTER, CENTER);
        fill(255);
        noStroke();
        text(`Lobby ${lobbyCode}`, 0, 0);
        pop();
    }


    drawTracks();
    drawLobbyZones();

    // Draw walls
    drawWalls();

    drawDrops();

    // Nullfield aura — electric rippling field around players with the buff
    for (const id in players) {
        const tank = players[id];
        if (tank.isDead || !(tank.buffs?.nullfield > 0)) continue;
        const stacks = tank.buffs.nullfield;
        const radius = TILE_SIZE * (2 + Math.sqrt(stacks));
        const t = frameCount;
        push();
        translate(tank.x, tank.y, PLAYER_SIZE * 0.2);

        // Outer rippling edge — wavy ring with per-vertex sin perturbation
        noFill();
        const waveFreq = 7;     // number of ripple crests around the ring
        const waveAmp = radius * 0.06;
        const waveSpeed = t * 0.055;
        const waveAmp2 = radius * 0.04;
        const waveSpeed2 = t * 0.08 + 1.3;

        stroke(80, 170, 255, 55);
        strokeWeight(2.5);
        beginShape();
        for (let a = 0; a <= TWO_PI; a += 0.08) {
            const r = radius + sin(a * waveFreq + waveSpeed) * waveAmp + sin(a * (waveFreq + 2) + waveSpeed2) * waveAmp2;
            vertex(cos(a) * r, sin(a) * r);
        }
        endShape(CLOSE);

        // Inner softer ring, counter-phase
        stroke(120, 210, 255, 30);
        strokeWeight(1.5);
        beginShape();
        for (let a = 0; a <= TWO_PI; a += 0.1) {
            const r = radius * 0.82 + sin(a * (waveFreq - 1) - waveSpeed * 0.7) * waveAmp * 0.7;
            vertex(cos(a) * r, sin(a) * r);
        }
        endShape(CLOSE);

        // Faint filled disc — dim blue interior tint
        noStroke();
        fill(60, 130, 255, 8);
        beginShape();
        for (let a = 0; a <= TWO_PI; a += 0.15) vertex(cos(a) * radius, sin(a) * radius);
        endShape(CLOSE);

        pop();
    }

    // Draw all tanks
    for (let id in players) {
        const tank = players[id];
        drawTank(tank, id == socket.id);
        leaveTracksForTank(tank, id);
        if (id == socket.id) {
            myTank = tank;
        }
    }

    // Kill indicators — short punchy pop above player tank
    killIndicators = killIndicators.filter(k => k.life > 0);
    for (const k of killIndicators) {
        const t = k.life / k.maxLife;
        const rise = (1 - t) * PLAYER_SIZE * 2;
        const a = t * 255;
        push();
        translate(k.x, k.y, PLAYER_SIZE * 4 + rise);
        rotateX(atan2(k.y - camY, camZ));
        noStroke();
        textFont(font);
        textSize(PLAYER_SIZE * 0.9);
        textAlign(CENTER, CENTER);
        const [r, g, b] = k.color || [255, 220, 60];
        translate(0, 0, -1);
        fill(0, 0, 0, a * 0.7);
        text(k.text, 1.5, 1.5);
        translate(0, 0, 1);
        fill(r, g, b, a);
        text(k.text, 0, 0);
        pop();
        k.life--;
    }

    // Define the viewing volume for the orthogonal camera
    // const left = -width / 2;
    // const right = width / 2;
    // const bottom = -height / 2;
    // const top = height / 2;
    // // const near = -1000; // Farther away from the camera
    // // const far = 10000; // Closer to the camera

    // // Set orthogonal projection
    // ortho(left, right, bottom, top);

    // Show fog/vision hint for first 5 seconds, then briefly every 10 s
    if (frameCount < 300 || frameCount % 600 < 120) {
        const VH = 630 * Math.tan(Math.PI / 6);
        const VW = VH * (width / height);
        drawHintText("F: fog toggle | V: vision quality", -VW + 20, -VH + 20);
    }

    // camera(camX, camY, camZ, targetX, targetY, targetZ, 0, 1, 0);

    // Draw bullets
    drawBullets();

    drawLasers();
    drawChainRays();

    drawExplosions();

    drawTrails();

    drawFlares();
    drawSmokeClouds();
    drawPillageAnims();
    drawScavengeAnims();
    drawAfterimageAnims();
    drawCompanions();
    drawEngineerRallyIndicator();
    drawSniperScopeRay();

    // Compute sniper scope mouse-world reveal
    let sniperScopeVision = null;
    if (sniperPanning && myTank && myTank.selectedClass === 'sniper') {
        const cx = camX, cy = camY, cz = camZ;
        const tx = targetX, ty = targetY;
        let fwdX = tx - cx, fwdY = ty - cy, fwdZ = 0 - cz;
        const fLen = Math.sqrt(fwdX * fwdX + fwdY * fwdY + fwdZ * fwdZ);
        fwdX /= fLen; fwdY /= fLen; fwdZ /= fLen;
        let rX = fwdY * 0 - fwdZ * 1, rY = fwdZ * 0 - fwdX * 0, rZ = fwdX * 1 - fwdY * 0;
        const rLen = Math.sqrt(rX * rX + rY * rY + rZ * rZ);
        rX /= rLen; rY /= rLen; rZ /= rLen;
        const uX = rY * fwdZ - rZ * fwdY, uY = rZ * fwdX - rX * fwdZ, uZ = rX * fwdY - rY * fwdX;
        const fov = Math.PI / 3, h2 = Math.tan(fov / 2), aspect = width / height, scale = 0.75;
        const mx = -(mouseX - width / 2) / (width / 2) * h2 * aspect * scale;
        const my = -(mouseY - height / 2) / (height / 2) * h2 * scale;
        const rdx = mx * rX + my * uX - fwdX;
        const rdy = mx * rY + my * uY - fwdY;
        const rdz = mx * rZ + my * uZ - fwdZ;
        if (rdz !== 0) {
            const t = -cz / rdz;
            const wx = cx + t * rdx;
            const wy = cy + t * rdy;
            const scopeRadius = TILE_SIZE * 1.5;
            const circlePoints = [];
            for (let i = 0; i <= 32; i++) {
                const a = (i / 32) * Math.PI * 2;
                circlePoints.push({ x: wx + Math.cos(a) * scopeRadius, y: wy + Math.sin(a) * scopeRadius });
            }
            sniperScopeVision = { x: wx, y: wy, visionDistance: scopeRadius, points: circlePoints };
        }
    }

    if (isFogOfWar && !allDead && !fogSuppressed) {
        const resolution = visionResolution;
        // Flare vision drawn as direct circle punches in drawSharedFogOfWar — no raycasting
        const flareVision = [];
        // Companion vision drawn as a direct circle punch in drawSharedFogOfWar — no raycasting
        const companionVision = [];
        const scopeExtra = sniperScopeVision ? [sniperScopeVision] : [];
        // Fog plane anchored to the tank being viewed so the vision polygon aligns correctly
        const fogX = targetTank.x;
        const fogY = targetTank.y;
        if (gameMode == 'lobby') {
            const visiblePoints = getCachedVision(spectateTargetId || socket.id, targetTank.x, targetTank.y, targetTank.visionDistance, level, resolution);
            drawFogOfWar(fogX, fogY, visiblePoints, targetTank.x, targetTank.y);
        } else if (gameMode == 'arena') {
            const visiblePoints = getCachedVision(spectateTargetId || socket.id, targetTank.x, targetTank.y, targetTank.visionDistance, level, resolution);
            drawFogOfWar(fogX, fogY, visiblePoints, targetTank.x, targetTank.y);
            if (!skipMarkExplored) {
                const sharedVision = [...calculateSharedVision(players, level, resolution), ...scopeExtra];
                for (const { x: vx, y: vy, points } of sharedVision) markExplored(vx, vy, points);
            }
        } else {
            const visiblePoints = [...calculateSharedVision(players, level, resolution), ...flareVision, ...companionVision, ...scopeExtra];
            drawSharedFogOfWar(fogX, fogY, visiblePoints);
            if (!skipMarkExplored) {
                for (const { x: vx, y: vy, points } of visiblePoints) markExplored(vx, vy, points);
            }
        }
    }

    push(); // Save current transformations
    resetMatrix(); // Reset transformations to screen space

    camera(0, 0, 630, 0, 0, 0)
    // Draw the ping in the top-left corner of the screen
    fill(255); // Set text color
    textSize(20); // Set text size
    textAlign(LEFT, TOP); // Align text to the top-left
    textFont(font);

    if (showFps) drawPerfOverlay();

    if (gameMode !== 'lobby') {
        drawMinimap();
        drawBuffHUD();
        drawBulletIndicator();
        drawClassBadge();
        drawKDABoard();
    } else if (gameMode === 'lobby') {
        drawClassInfoPanel();
    }

    // Spectate overlay
    if (isSpectating && !allDead && targetTank) {
        const VH = height / 2;
        const gl = drawingContext;
        gl.disable(gl.DEPTH_TEST);
        textAlign(CENTER, CENTER);
        textFont(font);
        fill(0, 0, 0, 120);
        noStroke();
        rectMode(CENTER);
        rect(0, -VH + 46, 320, 50, 8);
        textSize(18);
        fill(255, 220, 50);
        text(`SPECTATING  ${targetTank.name || 'Player'}`, 0, -VH + 38);
        textSize(13);
        fill(180, 180, 180);
        text('TAB — switch player', 0, -VH + 60);
        gl.enable(gl.DEPTH_TEST);
    }

    pop(); // Restore transformations
}

function triggerScreenShake(intensity, duration) {
    shakeIntensity = intensity;
    shakeDuration = duration;
}

function drawHintText(msg, x, y) {
    push();
    resetMatrix();
    camera(0, 0, 630, 0, 0, 0);
    const gl = drawingContext;
    gl.disable(gl.DEPTH_TEST);
    fill(255, 200);
    textSize(14);
    textAlign(LEFT, TOP);
    textFont(font);
    text(msg, x, y);
    gl.enable(gl.DEPTH_TEST);
    pop();
}

// Mark tiles visible along each ray as explored (DDA tile walk from player to ray endpoint).
function markExplored(playerX, playerY, points) {
    if (!exploredTiles || !level.length) return;
    const rows = exploredTiles.length, cols = exploredTiles[0].length;
    const pCol = Math.floor(playerX / TILE_SIZE);
    const pRow = Math.floor(playerY / TILE_SIZE);
    for (const pt of points) {
        const eCol = Math.floor(pt.x / TILE_SIZE);
        const eRow = Math.floor(pt.y / TILE_SIZE);
        const dCol = eCol - pCol, dRow = eRow - pRow;
        const steps = Math.max(1, Math.max(Math.abs(dCol), Math.abs(dRow)));
        for (let s = 0; s <= steps; s++) {
            const c = Math.round(pCol + dCol * s / steps);
            const r = Math.round(pRow + dRow * s / steps);
            if (r >= 0 && r < rows && c >= 0 && c < cols) exploredTiles[r][c] = true;
        }
    }
}

function drawPerfOverlay() {
    const VH = 250;
    const margin = 12;
    const fps = Math.round(_smoothFps);
    const ms = ping.toFixed(1);
    const label = `FPS: ${fps}   Ping: ${ms} ms`;

    const gl = drawingContext;
    gl.disable(gl.DEPTH_TEST);

    if (font) textFont(font);
    textSize(13);
    textAlign(CENTER, TOP);
    const x = 0;
    const y = -VH + margin;
    fill(0, 0, 0, 160);
    text(label, x + 1, y + 1);
    const fpsColor = fps >= 50 ? color(100, 255, 130) : fps >= 30 ? color(255, 210, 60) : color(255, 80, 80);
    fill(fpsColor);
    text(label, x, y);

    gl.enable(gl.DEPTH_TEST);
}

// Draw a small exploration minimap in the bottom-left corner (screen space).
function drawMinimap() {
    if (!exploredTiles || !level.length || !level[0].length) return;
    const rows = level.length, cols = level[0].length;
    const tilePx = Math.max(2, Math.floor(150 / Math.max(rows, cols)));
    const mmW = cols * tilePx, mmH = rows * tilePx;
    const margin = 12;
    // Empirically-tuned frustum half-extents for camera(0,0,630) screen-space overlay
    const VH = 250;
    const VW = VH * (width / height);
    const mmLeft = -VW + margin;
    const mmTop = VH - margin - mmH;

    // The fog plane writes depth buffer values across the whole screen.
    // Disable depth testing so the minimap always renders on top.
    const gl = drawingContext;
    gl.disable(gl.DEPTH_TEST);

    rectMode(CORNER);
    noStroke();
    fill(0, 0, 0, 160);
    rect(mmLeft - 2, mmTop - 2, mmW + 4, mmH + 4);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!exploredTiles[r][c]) continue;
            fill(level[r][c] > 0 ? 50 : 150, level[r][c] > 0 ? 50 : 145, level[r][c] > 0 ? 55 : 130);
            rect(mmLeft + c * tilePx, mmTop + r * tilePx, tilePx, tilePx);
        }
    }

    // Player dots — blue for self, green for allies
    for (const [id, tank] of Object.entries(players)) {
        if (tank.isDead || tank.isAI) continue;
        const pc = Math.floor(tank.x / TILE_SIZE);
        const pr = Math.floor(tank.y / TILE_SIZE);
        fill(id === socket.id ? color(80, 180, 255) : color(80, 220, 100));
        rect(mmLeft + pc * tilePx, mmTop + pr * tilePx, tilePx, tilePx);
    }

    gl.enable(gl.DEPTH_TEST);
}

// Draw active buff icons in the top-right corner (screen space), 8 per row.
function drawBuffHUD() {
    if (!myTank || !myTank.buffs) return;

    const VH = 250;
    const VW = VH * (width / height);
    const margin = 10;
    const slotW = 28;   // horizontal spacing per icon
    const slotH = 30;   // vertical spacing per row
    const iconsPerRow = 8;

    const gl = drawingContext;
    gl.disable(gl.DEPTH_TEST);

    const buffTypes = ['speed', 'maxBullets', 'bulletSpeed', 'bulletBounces', 'shield', 'multiShot', 'visionRange', 'piercing', 'autoTurret', 'explosive', 'homing', 'regen', 'chain', 'orbit', 'haste', 'shockwave', 'scavenge', 'nullfield', 'ghost', 'afterimage'];

    // Collect active buffs in order (include negatives)
    const active = [];
    for (const buffType of buffTypes) {
        const count = buffType === 'shield'
            ? (myTank.buffs.shield || 0) + (myTank.shield ? 1 : 0)
            : (myTank.buffs[buffType] || 0);
        if (count !== 0) active.push({ buffType, count });
    }

    for (let i = 0; i < active.length; i++) {
        const { buffType, count } = active[i];
        const col = i % iconsPerRow;
        const row = Math.floor(i / iconsPerRow);

        // Right-align: rightmost slot at VW - margin, going left
        const iconX = VW - margin - col * slotW;
        const iconY = -VH + margin + 10 + row * slotH;

        // Count badge
        push();
        translate(iconX - 8, iconY + 10, 0);
        fill(count < 0 ? color(255, 80, 80, 220) : color(255, 255, 255, 220));
        noStroke();
        textFont(font);
        textSize(9);
        textAlign(CENTER, CENTER);
        text(`${count}`, 0, 0);
        pop();

        // 3D icon
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        push();
        translate(iconX, iconY, 0);
        scale(0.78);
        rotateZ(frameCount / 45);
        drawDrop(0, 0, frameCount / 45, buffType);
        pop();
        gl.disable(gl.DEPTH_TEST);
    }

    gl.enable(gl.DEPTH_TEST);
}

function drawBulletIndicator() {
    if (!myTank || myTank.isDead) return;

    const myBulletCount = bullets.filter(b => b.owner === socket.id && !b.isTurretBullet && !b.afterimageBullet).length;
    const maxBullets = myTank.maxBullets || 6;

    const VH = 250;
    const pipR = 4.5;
    const gap = 4;
    const totalW = maxBullets * (pipR * 2 + gap) - gap;

    const gl = drawingContext;
    gl.disable(gl.DEPTH_TEST);

    noStroke();
    for (let i = 0; i < maxBullets; i++) {
        const px = -totalW / 2 + i * (pipR * 2 + gap) + pipR;
        fill(i < myBulletCount ? color(220, 70, 70, 220) : color(210, 210, 210, 180));
        ellipse(px, VH - 18, pipR * 2, pipR * 2);
    }

    const fixedBarW = 150;
    const barH = 4;
    let extraBarY = VH - 30;

    // Regen charge bar
    if ((myTank.buffs?.regen || 0) > 0) {
        const charge = Math.min(1, (myTank._regenCharge || 0) / 100);
        noStroke();
        fill(30, 30, 60, 160);
        rect(-fixedBarW / 2, extraBarY, fixedBarW, barH, 2);
        fill(80, 180, 255, 230);
        rect(-fixedBarW / 2, extraBarY, fixedBarW * charge, barH, 2);
        textFont(font);
        textSize(8);
        textAlign(CENTER, CENTER);
        fill(140, 200, 255, 180);
        text('REGEN', 0, extraBarY - 6);
        extraBarY -= 18;
    }

    // Ghost cloak timer bar
    if ((myTank.buffs?.ghost || 0) > 0 && myTank.ghostCooldown !== undefined) {
        const stacks = myTank.buffs.ghost;
        const maxCooldown = myTank.ghostCloaked ? Math.round(120 + 80 * Math.sqrt(stacks)) : Math.max(90, Math.round(300 - 60 * Math.sqrt(stacks)));
        const progress = Math.max(0, Math.min(1, myTank.ghostCooldown / maxCooldown));
        noStroke();
        fill(30, 20, 50, 160);
        rect(-fixedBarW / 2, extraBarY, fixedBarW, barH, 2);
        // Cloaked = purple draining, visible = teal filling toward next cloak
        if (myTank.ghostCloaked) {
            fill(160, 60, 255, 230);
        } else {
            fill(80, 220, 200, 180);
        }
        rect(-fixedBarW / 2, extraBarY, fixedBarW * progress, barH, 2);
        textFont(font);
        textSize(8);
        textAlign(CENTER, CENTER);
        fill(myTank.ghostCloaked ? color(180, 100, 255, 200) : color(100, 220, 200, 180));
        text(myTank.ghostCloaked ? 'GHOST' : 'GHOST', 0, extraBarY - 6);
        extraBarY -= 18;
    }

    gl.enable(gl.DEPTH_TEST);
}

// Draw class badge (bottom-left, above minimap) showing chosen class + laser cooldown.
function drawClassBadge() {
    if (!myTank) return;

    const cls = typeof TANK_CLASSES !== 'undefined'
        ? TANK_CLASSES.find(c => c.id === myTank.selectedClass)
        : null;
    if (!cls) return;

    const VH = 250;
    const VW = VH * (width / height);
    const badgeW = 108;
    const x = VW - badgeW - 14; // bottom-right corner
    const y = VH - 46;

    const gl = drawingContext;
    gl.disable(gl.DEPTH_TEST);

    // Background pill
    push();
    translate(x, y, 0);
    noStroke();
    fill(10, 14, 24, 210);
    rectMode(CORNER);
    rect(0, 0, badgeW, 26, 8);

    // Class label + name
    textFont(font);
    textSize(11);
    textAlign(LEFT, CENTER);
    fill(230, 235, 255, 230);
    text(`${cls.label}  ${cls.name}`, 8, 13);
    pop();

    // Right-click ability energy bar
    if (cls.special === 'laser' || cls.special === 'shield') {
        const isLaser = cls.special === 'laser';
        const energy = isLaser
            ? Math.max(0, myTank.laserEnergy ?? 100)
            : Math.max(0, myTank.shieldEnergy ?? 100);
        const depleted = isLaser ? !!(myTank.laserDepleted) : !!(myTank.shieldDepleted);
        const active = isLaser ? laserChanneling : !!(myTank.shieldActive);
        const pct = energy / 100;

        // Colors — active, idle, depleted
        const rA = isLaser ? 255 : 80, gA = isLaser ? 90 : 180, bA = isLaser ? 60 : 255;
        const rI = isLaser ? 160 : 50, gI = isLaser ? 60 : 100, bI = isLaser ? 45 : 180;

        let label;
        if (depleted) {
            const pulse = 120 + 100 * sin(frameCount * 0.08);
            label = { text: 'RECHARGING...', r: 160, g: 160, b: 160, a: pulse };
        } else if (active) {
            label = { text: isLaser ? 'CHANNELING' : 'SHIELD ACTIVE', r: rA, g: gA, b: bA, a: 220 };
        } else {
            label = {
                text: isLaser ? 'RIGHT-CLICK: LASER' : 'RIGHT-CLICK: SHIELD',
                r: rI + 40, g: gI + 40, b: bI + 40, a: 160
            };
        }

        push();
        translate(x, y + 28, 0);
        noStroke();
        rectMode(CORNER);

        // Background
        fill(depleted ? color(20, 20, 20, 180) : isLaser ? color(50, 15, 15, 180) : color(15, 30, 50, 180));
        rect(0, 0, badgeW, 6, 3);

        if (depleted) {
            // Dim recharge progress
            fill(60, 60, 60, 140);
            rect(0, 0, badgeW * pct, 6, 3);
            // Tick mark at the 25% re-enable threshold
            stroke(180, 180, 180, 160);
            strokeWeight(1);
            line(badgeW * 0.25, 0, badgeW * 0.25, 6);
        } else {
            fill(active ? color(rA, gA, bA, 230) : color(rI, gI, bI, 160));
            rect(0, 0, badgeW * pct, 6, 3);
        }

        noStroke();
        textFont(font);
        textSize(9);
        textAlign(CENTER, CENTER);
        fill(label.r, label.g, label.b, label.a);
        text(label.text, badgeW / 2, -6);
        pop();
    } else if (cls.special === 'flare') {
        const maxCooldown = 300;
        const cd = Math.max(0, myTank.flareCooldown || 0);
        const ready = cd === 0;
        const pct = ready ? 1 : 1 - cd / maxCooldown;

        push();
        translate(x, y + 28, 0);
        noStroke();
        rectMode(CORNER);
        fill(15, 30, 15, 180);
        rect(0, 0, badgeW, 6, 3);
        fill(ready ? color(100, 230, 100, 200) : color(60, 140, 60, 160));
        rect(0, 0, badgeW * pct, 6, 3);
        noStroke();
        textFont(font);
        textSize(9);
        textAlign(CENTER, CENTER);
        if (ready) {
            fill(100, 230, 100, 200);
            text('RIGHT-CLICK: FLARE', badgeW / 2, -6);
        } else {
            fill(130, 180, 130, 160);
            text(`FLARE COOLDOWN`, badgeW / 2, -6);
        }
        pop();
    } else if (cls.special === 'barrage') {
        const maxCooldown = 270;
        const cd = Math.max(0, myTank.barrageCooldown || 0);
        const active = !!(myTank.barrageActive);
        const ready = cd === 0 && !active;
        const pct = active ? 1 : (ready ? 1 : 1 - cd / maxCooldown);

        push();
        translate(x, y + 28, 0);
        noStroke();
        rectMode(CORNER);
        fill(20, 15, 35, 180);
        rect(0, 0, badgeW, 6, 3);
        fill(active ? color(200, 160, 255, 230) : ready ? color(160, 120, 255, 200) : color(90, 60, 160, 160));
        rect(0, 0, badgeW * pct, 6, 3);
        noStroke();
        textFont(font);
        textSize(9);
        textAlign(CENTER, CENTER);
        if (active) {
            fill(210, 170, 255, 220 + 35 * sin(frameCount * 0.2));
            text('FIRING...', badgeW / 2, -6);
        } else if (ready) {
            fill(160, 120, 255, 200);
            text('RIGHT-CLICK: BARRAGE', badgeW / 2, -6);
        } else {
            fill(120, 90, 180, 160);
            text('BARRAGE COOLDOWN', badgeW / 2, -6);
        }
        pop();
    } else if (cls.special === 'companion') {
        const maxCooldown = 1800;
        const cd = Math.max(0, myTank.companionSpawnCooldown || 0);
        const ready = cd === 0;
        const pct = ready ? 1 : 1 - cd / maxCooldown;

        push();
        translate(x, y + 28, 0);
        noStroke();
        rectMode(CORNER);
        fill(30, 25, 10, 180);
        rect(0, 0, badgeW, 6, 3);
        fill(ready ? color(255, 211, 42, 200) : color(160, 130, 30, 160));
        rect(0, 0, badgeW * pct, 6, 3);
        noStroke();
        textFont(font);
        textSize(9);
        textAlign(CENTER, CENTER);
        if (ready) {
            fill(255, 211, 42, 200);
            text('RIGHT-CLICK: COMPANION', badgeW / 2, -6);
        } else {
            fill(180, 160, 60, 160);
            text('COMPANION COOLDOWN', badgeW / 2, -6);
        }
        pop();
    } else if (cls.special === 'cannon') {
        const maxCooldown = 600;
        const cd = Math.max(0, myTank.cannonCooldown || 0);
        const ready = cd === 0;
        const pct = ready ? 1 : 1 - cd / maxCooldown;
        push();
        translate(x, y + 28, 0);
        noStroke(); rectMode(CORNER);
        fill(35, 18, 5, 180); rect(0, 0, badgeW, 6, 3);
        fill(ready ? color(230, 120, 30, 210) : color(140, 70, 20, 160));
        rect(0, 0, badgeW * pct, 6, 3);
        noStroke(); textFont(font); textSize(9); textAlign(CENTER, CENTER);
        if (ready) {
            fill(255, 150, 50, 200 + 35 * sin(frameCount * 0.1));
            text('RIGHT-CLICK: CANNONBALL', badgeW / 2, -6);
        } else {
            fill(180, 100, 40, 160);
            text('CANNON COOLDOWN', badgeW / 2, -6);
        }
        pop();
    } else if (cls.special === 'scope') {
        const maxCooldown = 180;
        const cd = Math.max(0, myTank.sniperShotCooldown || 0);
        const ready = cd === 0;
        const scoped = sniperPanning;
        const pct = ready ? 1 : 1 - cd / maxCooldown;

        push();
        translate(x, y + 28, 0);
        noStroke();
        rectMode(CORNER);
        fill(30, 20, 10, 180);
        rect(0, 0, badgeW, 6, 3);
        fill(scoped && ready ? color(255, 180, 60, 240) : ready ? color(255, 150, 40, 200) : color(140, 80, 20, 160));
        rect(0, 0, badgeW * pct, 6, 3);
        noStroke();
        textFont(font);
        textSize(9);
        textAlign(CENTER, CENTER);
        if (scoped && ready) {
            fill(255, 200, 80, 220 + 35 * sin(frameCount * 0.15));
            text('LEFT-CLICK: PIERCE SHOT', badgeW / 2, -6);
        } else if (ready) {
            fill(255, 160, 60, 200);
            text('HOLD RIGHT: SCOPE', badgeW / 2, -6);
        } else {
            fill(160, 100, 40, 160);
            text('SCOPE COOLDOWN', badgeW / 2, -6);
        }
        pop();
    } else if (cls.special === 'pillage') {
        const charge = myTank.pillageCharge || 0;
        const ready = charge >= 100;
        const overflow = Math.max(0, charge - 100);
        const basePct = Math.min(1, charge / 100);
        const overflowPct = Math.min(1, overflow / 100);
        const pulse = 200 + 35 * sin(frameCount * 0.12);

        push();
        translate(x, y + 28, 0);
        noStroke();
        rectMode(CORNER);
        // Track
        fill(15, 30, 15, 180);
        rect(0, 0, badgeW, 6, 3);
        // Base fill
        fill(ready ? color(80, 220, 120, pulse) : color(40, 130, 70, 160));
        rect(0, 0, badgeW * basePct, 6, 3);
        // Overflow layer — bright white-green shimmer on top
        if (overflow > 0) {
            fill(200, 255, 210, 180 + 60 * sin(frameCount * 0.25));
            rect(0, 0, badgeW * overflowPct, 6, 3);
        }
        noStroke();
        textFont(font);
        textSize(9);
        textAlign(CENTER, CENTER);
        if (ready) {
            fill(100, 255, 140, pulse);
            text(`RIGHT-CLICK: PILLAGE  ${Math.floor(charge)}%`, badgeW / 2, -6);
        } else {
            fill(80, 170, 100, 160);
            text(`PILLAGE  ${Math.floor(charge)}%`, badgeW / 2, -6);
        }
        pop();
    }

    // Regen buff progress bar — shown below ability bar when shield is regenerating
    if ((myTank.buffs?.regen || 0) > 0 && !myTank.shield && !myTank.isDead) {
        const stacks = myTank.buffs.regen;
        const period = Math.round(900 / Math.sqrt(stacks));
        const timer = myTank._regenTimer ?? period;
        const pct = Math.max(0, Math.min(1, 1 - timer / period));
        const nearReady = pct > 0.85;

        // Determine Y: place below ability bar if one is shown, otherwise at same slot
        const hasAbilityBar = cls && ['laser', 'shield', 'flare', 'barrage', 'companion', 'cannon', 'scope', 'pillage'].includes(cls.special);
        const regenY = y + (hasAbilityBar ? 46 : 28);

        push();
        translate(x, regenY, 0);
        noStroke();
        rectMode(CORNER);

        // Track background
        fill(10, 20, 45, 180);
        rect(0, 0, badgeW, 6, 3);

        // Fill
        const pulse = nearReady ? (180 + 75 * sin(frameCount * 0.18)) : 160;
        fill(nearReady ? color(120, 200, 255, pulse) : color(50, 110, 200, 150));
        rect(0, 0, badgeW * pct, 6, 3);

        // Label
        noStroke();
        textFont(font);
        textSize(9);
        textAlign(CENTER, CENTER);
        if (nearReady) {
            fill(150, 220, 255, pulse);
            text('SHIELD INCOMING!', badgeW / 2, -6);
        } else {
            fill(80, 150, 220, 160);
            text('SHIELD REGEN', badgeW / 2, -6);
        }
        pop();
    }

    gl.enable(gl.DEPTH_TEST);
}

function drawKDABoard() {
    const human = Object.values(players).filter(p => !p.isAI);
    if (!human.length) return;

    const VH = 250;
    const VW = VH * (width / height);
    const margin = 12;
    const rowH = 16;
    const padX = 8, padY = 6;
    const cols = { name: 0, k: 90, d: 115, kd: 140 };
    const boardW = 158;
    const boardH = padY * 2 + rowH * (human.length + 1); // header + rows

    const bx = -VW + margin;
    const by = -VH + margin;

    const gl = drawingContext;
    gl.disable(gl.DEPTH_TEST);

    push();
    translate(bx, by, 0);
    noStroke();

    // Background
    fill(8, 12, 20, 200);
    rectMode(CORNER);
    rect(0, 0, boardW, boardH, 6);

    textFont(font);
    rectMode(CORNER);

    // Header
    textSize(9);
    textAlign(LEFT, TOP);
    fill(160, 170, 200, 180);
    text('PLAYER', padX + cols.name, padY);
    textAlign(CENTER, TOP);
    text('K', padX + cols.k, padY);
    text('D', padX + cols.d, padY);
    text('K/D', padX + cols.kd, padY);

    // Divider
    stroke(80, 90, 120, 120);
    strokeWeight(1);
    line(4, padY + rowH - 2, boardW - 4, padY + rowH - 2);
    noStroke();

    // Rows — sorted by kills desc
    const sorted = [...human].sort((a, b) => (b.kills || 0) - (a.kills || 0));
    sorted.forEach((p, i) => {
        const ry = padY + rowH * (i + 1);
        const isMe = p.id === socket.id;
        const k = p.kills || 0;
        const d = p.deaths || 0;
        const kd = d === 0 ? k.toFixed(0) : (k / d).toFixed(1);

        if (isMe) {
            fill(255, 211, 42, 30);
            rect(2, ry - 1, boardW - 4, rowH - 1, 3);
        }

        fill(isMe ? color(255, 230, 100, 220) : color(200, 210, 230, 190));
        textSize(9);
        textAlign(LEFT, TOP);
        text(p.name.slice(0, 10), padX + cols.name, ry + 1);

        textAlign(CENTER, TOP);
        fill(100, 220, 130, 200);
        text(k, padX + cols.k, ry + 1);
        fill(220, 100, 100, 200);
        text(d, padX + cols.d, ry + 1);
        fill(180, 200, 240, 190);
        text(kd, padX + cols.kd, ry + 1);
    });

    pop();
    gl.enable(gl.DEPTH_TEST);
}


// Draw class info panel in lobby mode — shows selected class description + trade-offs
function drawClassInfoPanel() {
    if (!myTank || typeof TANK_CLASSES === 'undefined') return;
    const cls = TANK_CLASSES.find(c => c.id === (myTank.selectedClass || 'assault'));
    if (!cls) return;

    // Empirically-tuned frustum half-extents for camera(0,0,630) screen-space overlay
    const VH = 250;
    const VW = VH * (width / height);
    const panelW = 260;
    const panelH = 88;
    const x = -VW + 14;
    const y = VH - panelH - 14;

    const gl = drawingContext;
    gl.disable(gl.DEPTH_TEST);

    push();
    translate(x, y, 0);
    noStroke();

    // Panel background
    fill(8, 12, 22, 210);
    rectMode(CORNER);
    rect(0, 0, panelW, panelH, 10);

    // Header: class name
    textFont(font);
    textAlign(LEFT, TOP);

    const [cr, cg, cb] = cls.color.match(/\w\w/g).map(h => parseInt(h, 16));
    fill(cr, cg, cb, 230);
    textSize(13);
    text(cls.label + '  ' + cls.name, 10, 10);

    // Description
    fill(180, 185, 200, 200);
    textSize(10);
    // Word-wrap manually by splitting at ~38 chars
    const words = cls.description.split(' ');
    let line = '';
    let lineY = 28;
    for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (test.length > 38) {
            text(line, 10, lineY);
            lineY += 14;
            line = w;
        } else {
            line = test;
        }
    }
    if (line) text(line, 10, lineY);

    // Right-click hint at bottom
    if (cls.special) {
        const hint = cls.special === 'shield' ? 'Right-click: hold to deploy shield'
            : cls.special === 'laser' ? 'Right-click: fire laser beam' : '';
        if (hint) {
            fill(120, 180, 255, 180);
            textSize(9);
            text(hint, 10, panelH - 14);
        }
    }

    pop();
    gl.enable(gl.DEPTH_TEST);
}

// keyboard shortcuts to tweak fog/vision
function keyPressed() {
    if (isLobbyPanelOpen()) return;
    if (key === 'T' || key === 't') {
        useTextures = !useTextures;
    }
    if (key === 'P' || key === 'p') {
        showFps = !showFps;
    }
    if (key === 'F' || key === 'f') {
        // toggleFogOfWar();
        isFogOfWar = !isFogOfWar;
    }
    if (key === 'V' || key === 'v') {
        // alternate between fine and coarse ray resolution
        visionResolution = (visionResolution === PI / 150 ? PI / 300 : PI / 150);
        clearVisionCache();
    }
    // Tab: cycle spectate target while dead
    if (keyCode === 9 && myTank && myTank.isDead) {
        const spectatable = Object.entries(players)
            .filter(([id, p]) => !p.isAI && !p.isDead && id !== socket.id)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([id]) => id);
        if (spectatable.length > 1) {
            const curIdx = spectatable.indexOf(spectateTargetId);
            spectateTargetId = spectatable[(curIdx + 1) % spectatable.length];
            // Snap camera to new target so the pan starts from their position
            const t = players[spectateTargetId];
            if (t) { spectateCamX = t.x; spectateCamY = t.y; }
        }
        return false; // prevent Tab from shifting browser focus
    }
}

function drawTransitionScreen() {
    camera(0, 0, 800, 0, 0, 0)
    background(0, 100); // Dim the background
    textAlign(CENTER, CENTER);
    textFont(font);
    textSize(width / 15);
    fill(255);
    text(transitionMessage, 0, -height / 4);

    if (transitionTimeLeft != null) {
        textSize(width / 30);
        text(`Next level in ${transitionTimeLeft} seconds...`, 0, 0);
    }
}

setInterval(handleMovement, 1000 / 60)

// Client replica of server's isCollidingWithWall (used for CSP)
function clientCollidesWithWall(x, y) {
    if (!level || !level[0]) return false;
    const offsets = [
        [-PLAYER_SIZE, -PLAYER_SIZE], [-PLAYER_SIZE, PLAYER_SIZE],
        [PLAYER_SIZE, PLAYER_SIZE], [PLAYER_SIZE, -PLAYER_SIZE],
    ];
    for (const [dx, dy] of offsets) {
        const col = Math.floor((x + dx) / TILE_SIZE);
        const row = Math.floor((y + dy) / TILE_SIZE);
        if (row < 0 || col < 0 || row >= level.length || col >= level[0].length || level[row][col] > 0)
            return true;
    }
    return false;
}

function clientLerpAngle(current, target, t) {
    let diff = ((target - current + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    return current + diff * t;
}

// Extrapolate a bullet's display position forward from its last received state.
// Bullets travel in straight lines at constant speed between bounces, so this is exact
// until the next bounce — at which point the server correction snaps us back.
function getBulletDisplayPos(index) {
    const s = bulletState[index];
    const b = bullets[index];
    if (!s || !b) return b ? { x: b.x, y: b.y } : { x: 0, y: 0 };
    const framesElapsed = (performance.now() - s.receivedAt) / (1000 / 60);
    return {
        x: s.x + Math.cos(s.angle) * s.speed * framesElapsed,
        y: s.y + Math.sin(s.angle) * s.speed * framesElapsed,
    };
}

// Apply dead-reckoning (local player) and entity interpolation (remote players)
function applySmoothing() {
    // Local player: extrapolate from last server tick using server velocity.
    // This eliminates prediction/reconcile drift — tank always tracks server authority,
    // smoothed by physics velocity between 30fps ticks.
    if (_lastLocalTickMs > 0 && players[socket.id] && !players[socket.id].isDead) {
        const sp = players[socket.id];
        const msSince = Math.min(performance.now() - _lastLocalTickMs, 80); // cap extrapolation at 80ms
        const steps = msSince / (1000 / 60);
        sp.x = _serverTickX + _serverTickVx * steps;
        sp.y = _serverTickY + _serverTickVy * steps;
        if (laserChanneling && sp.selectedClass === 'laser') {
            // Maintain angle client-side so server tick snaps don't override it
            if (localLaserTurretAngle === null) localLaserTurretAngle = sp.turretAngle;
            const diff = ((currentTurretAngle - localLaserTurretAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            localLaserTurretAngle += Math.max(-0.05, Math.min(0.05, diff));
            sp.turretAngle = localLaserTurretAngle;
        } else {
            localLaserTurretAngle = null;
            sp.turretAngle = currentTurretAngle;
        }
    }

    // Remote players/bots: interpolate between buffered snapshots, extrapolate when ahead
    const renderTime = performance.now() - INTERP_DELAY_MS;
    for (const [id, buf] of Object.entries(playerInterpBuf)) {
        if (!players[id] || buf.length < 2) continue;
        let i = buf.length - 2;
        while (i > 0 && buf[i].t > renderTime) i--;
        const before = buf[i], after = buf[i + 1];

        if (renderTime > after.t) {
            // Buffer exhausted (server spike) — dead-reckoning from last two snapshots
            const dt = after.t - before.t;
            const elapsed = Math.min(renderTime - after.t, 200); // cap at 200ms
            if (dt > 0) {
                const vx = (after.x - before.x) / dt;
                const vy = (after.y - before.y) / dt;
                players[id].x = after.x + vx * elapsed;
                players[id].y = after.y + vy * elapsed;
                const va = clientLerpAngle(before.angle, after.angle, 1) - before.angle;
                players[id].angle = after.angle + (va / dt) * elapsed;
                const vta = clientLerpAngle(before.turretAngle, after.turretAngle, 1) - before.turretAngle;
                players[id].turretAngle = after.turretAngle + (vta / dt) * elapsed;
            } else {
                players[id].x = after.x;
                players[id].y = after.y;
                players[id].angle = after.angle;
                players[id].turretAngle = after.turretAngle;
            }
        } else {
            const span = after.t - before.t;
            const t = span > 0 ? Math.max(0, Math.min(1, (renderTime - before.t) / span)) : 1;
            players[id].x = before.x + (after.x - before.x) * t;
            players[id].y = before.y + (after.y - before.y) * t;
            players[id].angle = clientLerpAngle(before.angle, after.angle, t);
            players[id].turretAngle = clientLerpAngle(before.turretAngle, after.turretAngle, t);
        }

        // Rate-limit turret angle for tier 13 (tracking laser) — cap at server lerp speed
        const p = players[id];
        if (p && p.isAI && p.tier === 13) {
            if (aiTurretSmoothed[id] === undefined) aiTurretSmoothed[id] = p.turretAngle;
            const diff = ((p.turretAngle - aiTurretSmoothed[id] + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            aiTurretSmoothed[id] += Math.max(-0.06, Math.min(0.06, diff));
            p.turretAngle = aiTurretSmoothed[id];
        } else if (!p || !p.isAI || p.isDead) {
            delete aiTurretSmoothed[id];
        }
    }
}

function leaveTracksForTank(tank, id) {
    if (!tank) return;

    // Reset state if dead
    if (tank.isDead) { delete trackState[id]; return; }

    const s = trackState[id] || { prev: { x: tank.x, y: tank.y }, accum: 0 };
    const dx = tank.x - s.prev.x;
    const dy = tank.y - s.prev.y;
    const stepDist = Math.hypot(dx, dy);

    if (stepDist > 2 * TILE_SIZE) { // detect teleport / large jump
        s.prev = { x: tank.x, y: tank.y };
        s.accum = 0;
        trackState[id] = s;
        return;
    }

    // Update accumulator and prev
    s.accum += stepDist;

    // If we haven't reached spacing, just update prev and bail
    if (s.accum < TRACK_SPACING) {
        s.prev = { x: tank.x, y: tank.y };
        trackState[id] = s;
        return;
    }

    // We may need to drop multiple treads if we moved a lot this frame
    const moveAngle = Math.atan2(dy, dx);
    const nx = -Math.sin(moveAngle);      // normal (left/right offset)
    const ny = Math.cos(moveAngle);
    const treadWidth = Math.max(PLAYER_SIZE * 0.28, 4);
    const treadSep = (PLAYER_SIZE - 2.1 * treadWidth);                  // half-separation from center
    const z = 0;                                          // just above ground plane

    // Start from last known position and march forward in TRACK_SPACING steps
    let px = s.prev.x, py = s.prev.y;
    let remaining = s.accum;

    while (remaining >= TRACK_SPACING) {
        // Advance along the path by TRACK_SPACING/2 for a nice center placement
        const hx = px + Math.cos(moveAngle) * (TRACK_SPACING * 0.5);
        const hy = py + Math.sin(moveAngle) * (TRACK_SPACING * 0.5);

        // Left/right strips
        for (const side of [-1, +1]) {
            const cx = hx + nx * (treadSep * side);
            const cy = hy + ny * (treadSep * side);
            tracks.push({
                x: cx, y: cy, z,
                angle: moveAngle,
                len: TRACK_SPACING / 2,
                width: treadWidth,
                alpha: 160,
                life: TRACK_FADE_FRAMES,
            });
        }

        // March forward one full spacing and continue
        px += Math.cos(moveAngle) * TRACK_SPACING;
        py += Math.sin(moveAngle) * TRACK_SPACING;
        remaining -= TRACK_SPACING;
    }

    // Save tail state for next frame
    s.prev = { x: tank.x, y: tank.y };
    s.accum = remaining;
    trackState[id] = s;
}

function drawTracks() {
    for (let i = tracks.length - 1; i >= 0; i--) {
        const t = tracks[i];
        push();
        translate(t.x, t.y, t.z);
        rotateZ(t.angle);
        noStroke();
        fill(40, 36, 30, t.alpha);
        box(t.len, t.width, 0.8);
        pop();

        t.life--;
        t.alpha = Math.max(0, Math.round(160 * (t.life / TRACK_FADE_FRAMES)));
        if (t.life <= 0) tracks.splice(i, 1);
    }
}

function drawTank(tank, isSelf) {
    const size = PLAYER_SIZE;
    const _isAlly = !tank.isAI && tank.id !== socket.id && gameMode !== 'arena';
    const cloakAlpha = (tank.tier === 8 && tank.cloaked) ? 10 : (tank.tier === 17 && tank.wraithStealthed) ? 15 : (tank.ghostCloaked && tank.id !== socket.id && !_isAlly) ? 0 : (tank.ghostCloaked) ? 40 : 255;
    // Grace period ring: draw a pulsing aura in world space
    if (tank.spawnGrace > 0) {
        const pulse = 0.7 + 0.3 * Math.sin(frameCount * 0.25);
        push();
        translate(tank.x, tank.y, 2);
        noStroke();
        fill(255, 240, 80, Math.round(pulse * 140));
        torus(size * 1.6, size * 0.25);
        pop();
    }
    push();
    // Tank base (lower box)
    translate(tank.x, tank.y, PLAYER_SIZE); // Position tank
    rotateZ(tank.angle); // Rotate tank base

    fill(color(...playerColor(tank, isSelf, cloakAlpha)));

    if (!tank.isDead) {

        if (tank.tier === 'chest') {
            drawChest(tank);
        } else {
            stroke(0, 0, 0, cloakAlpha)
            strokeWeight(1.5)
            if (tank.tier === 11) {
                box(2.6 * size, 2.0 * size, size);        // Wide Harbinger hull
                box(2.4 * size, 2.3 * size, size * 0.75); // Extra-wide treads
            } else if (tank.tier === 15) {
                box(3.2 * size, 2.6 * size, size * 1.2);  // Massive Sovereign hull
                box(3.0 * size, 3.0 * size, size * 0.8);  // Wide treads
            } else if (tank.tier === 16) {
                box(2.8 * size, 1.8 * size, size * 1.1);  // Long Phantom hull
                box(2.6 * size, 2.1 * size, size * 0.75); // Treads
            } else if (tank.tier === 17) {
                box(3.0 * size, 2.0 * size, size * 1.1);  // Wraith hull
                box(2.8 * size, 2.4 * size, size * 0.7);  // Wide treads
            } else {
                box(2 * size, 1.5 * size, size); // Tank base dimensions
                box(1.8 * size, 1.7 * size, size * 0.8); // Treads
            }

            push();
            rotateZ(PI / 2 + tank.turretAngle - tank.angle); // Rotate turret independently
            translate(0, 0, size);
            if (tank.tier === 11) {
                box(1.5 * size, 1.7 * size, size * 1.1); // Wider Harbinger turret
            } else if (tank.tier === 15) {
                box(1.8 * size, 1.5 * size, size * 1.3); // Sovereign turret
            } else if (tank.tier === 16) {
                box(1.3 * size, 1.3 * size, size * 1.1); // Phantom turret
            } else if (tank.tier === 17) {
                box(1.4 * size, 1.4 * size, size * 1.0); // Wraith turret
            } else {
                box(size, 1.15 * size, size); // Slightly smaller box
            }
            // fill(50); // Different color for the turret
            noStroke();

            // Draw the barrel

            switch (tank.tier) {
                case 3:
                    drawBarrel(size / 3.1);
                    drawBarrel(-size / 3.1);
                    break;
                case 6:
                    drawBarrel(0);
                    push();
                    rotate(PI / 11);
                    drawBarrel(0);
                    pop();
                    rotate(-PI / 11);
                    drawBarrel(0);
                    break;
                case 7:
                    push();
                    translate(0, 0, -size / 3.1);
                    drawBarrel(size / 3.1);
                    drawBarrel(-size / 3.1);
                    translate(0, 0, 2 * size / 3.1);
                    drawBarrel(size / 3.1);
                    drawBarrel(-size / 3.1);
                    pop();
                    break;
                case 10: // Titan — wide 2×2 cluster
                    push();
                    translate(0, 0, -size / 3.5);
                    drawBarrel(size / 3.5);
                    drawBarrel(-size / 3.5);
                    translate(0, 0, 2 * size / 3.5);
                    drawBarrel(size / 3.5);
                    drawBarrel(-size / 3.5);
                    pop();
                    break;
                case 11: // Harbinger — 5 spread barrels matching ±40° firing arc
                    for (let s = -2; s <= 2; s++) {
                        push();
                        rotate(s * PI / 9);
                        drawBarrel(0);
                        pop();
                    }
                    break;
                case 15: // Sovereign — single massive barrel
                    drawBarrel(0, 1.4, 1.8);
                    break;
                case 16: // Phantom Sniper — extra-long barrel
                    drawBarrel(0, 2.0, 0.8);
                    break;
                case 5:
                case 13: // Laser tanks — wide emitter barrel
                    drawLaserBarrel(0);
                    break;
                case 12: // Intelligence — twin thin fast barrels
                    drawBarrel(size / 5);
                    drawBarrel(-size / 5);
                    break;
                default:
                    if (tank.multiShot > 0) {
                        const barrels = tank.multiShot;
                        const dAngle = PI / 11;
                        push();
                        rotate(-dAngle * (barrels - 1) / 2)
                        for (let i = 0; i < barrels; i++) {
                            drawBarrel(0);
                            rotate(dAngle);
                        }
                        pop();
                    } else {
                        drawBarrel(0);
                    }
                    break;
            }

            pop();

            // Auto-turret buff: small independent turret on top
            if (tank.buffs && tank.buffs.autoTurret > 0 && tank.autoTurretAngle !== undefined) {
                push();
                translate(0, 0, size * 1.7); // sit above the main turret
                rotateZ(PI / 2 + tank.autoTurretAngle - tank.angle);
                fill(255, 160, 0);
                stroke(80, 50, 0);
                strokeWeight(1);
                box(size * 0.55, size * 0.7, size * 0.55); // turret body
                noStroke();
                drawBarrel(0, 0.7, 0.8, tank.autoTurretAngle, [255, 160, 0]);
                pop();
            }
        }
    } else {
        push();
        translate(0, 0, -24);
        const s = PLAYER_SIZE;
        rotateZ(PI / 4);
        rectMode(CENTER)
        noStroke();
        rect(0, 0, s, s / 4);
        rotateZ(PI / 2);
        rect(0, 0, s, s / 4);
        pop();
    }
    pop();

    // Phantom Sniper charging — laser sight warning line
    if (tank.isAI && !tank.isDead && tank.tier === 16 && tank.sniperCharging) {
        const chargeProgress = 1 - (tank.sniperChargeTimer || 0) / 70;
        const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.4);
        const sightLen = TILE_SIZE * 20;
        const tx = tank.x + Math.cos(tank.turretAngle) * sightLen;
        const ty = tank.y + Math.sin(tank.turretAngle) * sightLen;
        push();
        strokeWeight(2 + chargeProgress * 3);
        stroke(255, 30, 30, 120 + 120 * pulse);
        noFill();
        line(tank.x, tank.y, PLAYER_SIZE * 2, tx, ty, PLAYER_SIZE * 2);
        // Charging glow circle at tank
        noStroke();
        fill(255, 50, 50, 60 + 80 * pulse);
        translate(tank.x, tank.y, PLAYER_SIZE * 2);
        sphere(PLAYER_SIZE * (0.8 + chargeProgress * 1.2));
        pop();
    }

    // Sovereign orbiting shield walls
    if (tank.isAI && !tank.isDead && tank.tier === 15) {
        const orbRadius = PLAYER_SIZE * 3.2;
        const orbAngle = tank.orbAngle || 0;
        for (let r = 0; r < 4; r++) {
            const a = orbAngle + r * Math.PI / 2;
            const ox = Math.cos(a) * orbRadius;
            const oy = Math.sin(a) * orbRadius;
            push();
            translate(tank.x + ox, tank.y + oy, PLAYER_SIZE * 1.6);
            // Align panel perpendicular to the outward normal (same as shield tank)
            rotateZ(a + HALF_PI);
            // Glow backing
            fill(100, 180, 255, 55);
            noStroke();
            box(PLAYER_SIZE * 2.8, PLAYER_SIZE * 0.35, PLAYER_SIZE * 2.5);
            // Bright face
            fill(180, 220, 255, 210);
            stroke(140, 200, 255, 240);
            strokeWeight(2);
            box(PLAYER_SIZE * 2.8, PLAYER_SIZE * 0.2, PLAYER_SIZE * 2.2);
            pop();
        }
    }

    // Player orbit buff — orbiting wall panels (sovereign style)
    if (!tank.isAI && !tank.isDead && (tank.buffs?.orbit || 0) > 0) {
        const numOrbs = tank.buffs.orbit;
        const orbRadius = PLAYER_SIZE * 2.4;
        const orbAngle = tank.orbAngle || 0;
        for (let r = 0; r < numOrbs; r++) {
            const a = orbAngle + r * (TWO_PI / numOrbs);
            const ox = Math.cos(a) * orbRadius;
            const oy = Math.sin(a) * orbRadius;
            push();
            translate(tank.x + ox, tank.y + oy, PLAYER_SIZE * 1.6);
            rotateZ(a + HALF_PI);
            // Glow backing
            fill(80, 220, 140, 55);
            noStroke();
            box(PLAYER_SIZE * 2.0, PLAYER_SIZE * 0.35, PLAYER_SIZE * 2.0);
            // Bright face
            fill(140, 255, 180, 210);
            stroke(100, 220, 150, 240);
            strokeWeight(2);
            box(PLAYER_SIZE * 2.0, PLAYER_SIZE * 0.2, PLAYER_SIZE * 1.8);
            pop();
        }
    }

    // Stun indicator: orbiting spheres above stunned AI tanks
    if (tank.isAI && !tank.isDead && (tank.disoriented || 0) > 0) {
        const fade = Math.min(tank.disoriented / 30, 1);
        const spin = frameCount * 0.12;
        push();
        translate(tank.x, tank.y, PLAYER_SIZE * 3.2);
        noFill();
        for (let r = 0; r < 3; r++) {
            const a = spin + (r * TWO_PI / 3);
            const rx = Math.cos(a) * PLAYER_SIZE * 0.9;
            const ry = Math.sin(a) * PLAYER_SIZE * 0.9;
            push();
            translate(rx, ry, r * 4);
            stroke(255, 220, 40, 220 * fade);
            strokeWeight(2);
            sphere(PLAYER_SIZE * 0.28);
            pop();
        }
        stroke(255, 200, 0, 100 * fade);
        strokeWeight(1.5);
        beginShape();
        for (let a = 0; a <= TWO_PI; a += 0.2) vertex(cos(a) * PLAYER_SIZE * 1.1, sin(a) * PLAYER_SIZE * 1.1);
        endShape(CLOSE);
        pop();
    }

    if (!tank.isDead && tank.speed > 0) {
        for (let i = 0; i < 2; i++) { // Add two particles per frame
            trails.push({
                x: tank.x - random(-PLAYER_SIZE / 2, PLAYER_SIZE / 2),
                y: tank.y - random(-PLAYER_SIZE / 2, PLAYER_SIZE / 2),
                z: -PLAYER_SIZE / 2,
                size: random(2, 4),
                dSize: 0.05,
                alpha: 128,
            });
        }
    }

    // Draw nametag
    if (tank.classId) {
        // ── Class selection dummy ──────────────────────────────────────
        const cls = typeof TANK_CLASSES !== 'undefined'
            ? TANK_CLASSES.find(c => c.id === tank.classId) : null;
        const isSelected = myTank && myTank.selectedClass === tank.classId;

        // Pulsing glow when this is the player's selected class
        if (isSelected) {
            push();
            translate(tank.x, tank.y, PLAYER_SIZE);
            noStroke();
            fill(...tank.color, 45 + 25 * Math.sin(frameCount * 0.06));
            sphere(PLAYER_SIZE * 2.5);
            pop();
        }

        // Icon + name label floating above the dummy
        push();
        translate(tank.x, tank.y, PLAYER_SIZE * 4.2);
        rotateX(atan2(tank.y - camY, camZ));
        textAlign(CENTER, CENTER);
        if (font) textFont(font);
        noStroke();
        const label = cls ? cls.name : tank.name;
        textSize(isSelected ? 16 : 14);
        translate(0, 0, -1);
        fill(0, 0, 0, 180);
        text(label, 1.5, 1.5);
        translate(0, 0, 1);
        fill(...tank.color);
        text(label, 0, 0);
        if (isSelected) {
            textSize(10);
            translate(0, 0, -1);
            fill(0, 0, 0, 180);
            text('SELECTED', 1.5, 19.5);
            translate(0, 0, 1);
            fill(...tank.color, 200);
            text('SELECTED', 0, 18);
        }
        pop();
    } else if (!tank.isAI || tank.tier === 'button') {
        push();
        translate(tank.x, tank.y, PLAYER_SIZE * 3.5);
        rotateX(atan2(tank.y - camY, camZ));
        textAlign(CENTER, CENTER);
        if (font) textFont(font);
        textSize(16);
        noStroke();
        const name = tank.name || "Player";
        translate(0, 0, -1);
        fill(0, 0, 0, 180);
        text(name, 1.5, 1.5);
        translate(0, 0, 1);
        fill(255);
        text(name, 0, 0);
        pop();
    }

    if (tank.shield) {
        // Scale the bubble to enclose each tank's hull
        // Shield tank (tier 9) and guardian have a wall panel in front — use smaller bubble
        const isShieldPanel = tank.tier === 9 || (!tank.isAI && tank.selectedClass === 'guardian');
        const shieldR = tank.tier === 15 ? size * 2.4
            : tank.tier === 11 ? size * 2.1
                : (tank.tier === 10 || tank.tier === 14 || tank.tier === 16) ? size * 2.0
                    : isShieldPanel ? size * 1.3
                        : size * 1.9;
        push();
        translate(tank.x, tank.y, PLAYER_SIZE);
        fill(50, 100, 255, 100);
        if (tank.cloaked) {
            fill(50, 100, 255, cloakAlpha);
        }
        noStroke();
        sphere(shieldR);

        rotateX(atan2(tank.y - camY, camZ))
        textAlign(CENTER, CENTER);
        textSize(16);
        if (tank.buffs && tank.buffs.shield) {
            text(tank.buffs.shield + 1, shieldR + 20, 0)
        }
        pop()
    }

    // Shield Tank (tier 9 AI) or Guardian player — draw the blocking wall panel
    const isAIShield = tank.tier === 9;
    const isGuardianPlayer = !tank.isAI && tank.selectedClass === 'guardian';
    if ((isAIShield || isGuardianPlayer) && tank.shieldActive && !tank.isDead) {
        const sf = tank.shieldFacing;
        const shieldDist = PLAYER_SIZE * 1.8;
        // Guardian gets a slightly different color to distinguish from AI
        const r = isGuardianPlayer ? 80 : 60;
        const g = isGuardianPlayer ? 180 : 120;
        const b = isGuardianPlayer ? 255 : 255;
        push();
        translate(
            tank.x + Math.cos(sf) * shieldDist,
            tank.y + Math.sin(sf) * shieldDist,
            PLAYER_SIZE
        );
        rotateZ(sf + HALF_PI); // orient panel perpendicular to facing
        fill(r, g, b, 200);
        stroke(160, 210, 255, 240);
        strokeWeight(2);
        box(PLAYER_SIZE * 5, PLAYER_SIZE * 0.35, PLAYER_SIZE * 2.5);
        pop();
    }

    function drawBarrel(x, lengthMult = 1, widthMult = 1, angle = tank.turretAngle, color = null) {
        const barrelRadius = 0.15 * size * widthMult;
        const barrelLength = 1.5 * size * lengthMult;
        const tipRadius = 0.20 * size * widthMult;
        // Keep the back of the barrel fixed at the turret edge regardless of length
        const centerY = 0.25 * size - 0.75 * size * lengthMult;

        const cameraPos = new p5.Vector(camX, camY, camZ);

        // Helper: compute camera-facing outline offset at a world position
        function outlineOffset(wx, wy) {
            const pos = new p5.Vector(wx, wy, size);
            return p5.Vector.sub(cameraPos, pos).normalize().mult(-2);
        }

        push();
        translate(x, centerY, 0);

        // Barrel body outline
        push();
        const bodyOffset = outlineOffset(
            tank.x + (1.5 * size) * Math.cos(angle),
            tank.y + (1.5 * size) * Math.sin(angle)
        );
        rotateZ(-(PI / 2 + angle));
        translate(bodyOffset.x, bodyOffset.y, bodyOffset.z);
        rotateZ(PI / 2 + angle);
        fill(0, 0, 0, cloakAlpha);
        cylinder(barrelRadius + 1, barrelLength);
        pop();

        cylinder(barrelRadius, barrelLength);

        // Tip flare
        push();
        translate(0, -0.75 * size * lengthMult, 0);

        push();
        const tipOffset = outlineOffset(
            tank.x + (1.5 * size) * Math.cos(angle),
            tank.y - 5 / 4 * size + (1.5 * size) * Math.sin(angle)
        );
        rotateZ(-(PI / 2 + angle));
        translate(tipOffset.x, tipOffset.y, tipOffset.z);
        rotateZ(PI / 2 + angle);
        fill(0, 0, 0, cloakAlpha);
        cylinder(tipRadius + 1, 0.20 * size + 1.9);
        pop();

        if (color !== null) {
            fill(...color, cloakAlpha);
        } else {
            fill(...playerColor(tank, isSelf, cloakAlpha));
        }
        cylinder(tipRadius * 0.25 + 1, 0.20 * size + 2);

        cylinder(tipRadius);
        pop();
        pop();
    }

    function drawLaserBarrel(x) {
        const cameraPos = new p5.Vector(camX, camY, camZ);
        const angle = tank.turretAngle;
        let vd, off;
        push();
        translate(x, -size / 2, 0);

        // Barrel outline
        push();
        vd = p5.Vector.sub(cameraPos, new p5.Vector(
            tank.x + 1.3 * size * Math.cos(angle),
            tank.y + 1.3 * size * Math.sin(angle),
            size
        )).normalize();
        off = vd.mult(-2);
        rotateZ(-(PI / 2 + angle));
        translate(off.x, off.y, off.z);
        rotateZ(PI / 2 + angle);
        fill(0, 0, 0, cloakAlpha);
        cylinder(0.22 * size + 1, 1.3 * size);
        pop();

        // Main barrel — wider, shorter than standard
        cylinder(0.22 * size, 1.3 * size);

        // Emitter disc at tip
        push();
        translate(0, -0.65 * size, 0);
        push();
        vd = p5.Vector.sub(cameraPos, new p5.Vector(
            tank.x + 1.3 * size * Math.cos(angle),
            tank.y - 0.65 * size + 1.3 * size * Math.sin(angle),
            size
        )).normalize();
        off = vd.mult(-2);
        rotateZ(-(PI / 2 + angle));
        translate(off.x, off.y, off.z);
        rotateZ(PI / 2 + angle);
        fill(0, 0, 0, cloakAlpha);
        cylinder(0.40 * size + 1, 0.12 * size + 1);
        pop();
        fill(...playerColor(tank, isSelf, cloakAlpha));
        cylinder(0.40 * size, 0.12 * size);
        pop();

        pop();
    }
}

function drawChest(tank) {
    const size = TILE_SIZE / 2;
    stroke(0);
    strokeWeight(3);
    fill(120, 50, 0);
    box(1.5 * size + 2, size + 2, size + 1);

    push();
    translate(0, 0, size / 2)
    rotateZ(PI / 2);

    push();
    const angle = tank.angle + PI / 2;
    const cameraPos = new p5.Vector(camX, camY, camZ); // Camera position
    const barrelX = tank.x;
    const barrelY = tank.y;
    const barrelZ = tank.z + size / 2; // Height of the barrel
    const barrelPos = new p5.Vector(barrelX, barrelY, barrelZ);
    let viewDirection = p5.Vector.sub(cameraPos, barrelPos).normalize(); // Direction from bullet to camera
    // Offset the outline behind the bullet
    let offset = viewDirection.mult(-4);
    rotateZ(-angle);
    translate(offset.x, offset.y, offset.z); // Apply the offset
    rotateZ(angle);

    fill(0); // Semi-transparent black for the outline
    cylinder(size / 2 + 1, 1.5 * size);

    pop();
    noStroke();
    fill(130, 50, 10);
    cylinder(size / 2, 1.5 * size);
    pop();
    translate(0, 0.5 * size, size / 2);
    fill(160, 100, 50);
    box(size / 5, size / 5, size / 3);
}

function drawLobbyZones() {
    if (!lobbyZones.length) return;
    const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.07);
    for (const zone of lobbyZones) {
        const zx = (zone.col + 0.5) * TILE_SIZE;
        const zy = (zone.row + 0.5) * TILE_SIZE;
        const prog = zoneProgress[zone.mode] || 0;
        const [r, g, b] = zone.color;
        const radius = TILE_SIZE * 1.0;

        // Ground circle
        push();
        translate(zx, zy, 1);
        noStroke();
        fill(r, g, b, 100 + 60 * pulse);
        circle(0, 0, radius * 2);
        pop();

        // Progress arc (swept ring drawn as filled arc minus inner)
        if (prog > 0) {
            push();
            translate(zx, zy, 2);
            noFill();
            stroke(r, g, b, 230);
            strokeWeight(5);
            arc(0, 0, radius * 2, radius * 2, -HALF_PI, -HALF_PI + prog * TWO_PI);
            pop();
        }

        // Label floating above
        push();
        translate(zx, zy, PLAYER_SIZE * 2.5);
        rotateX(Math.atan2(zy - camY, camZ));
        noStroke();
        if (font) textFont(font);
        textAlign(CENTER, CENTER);
        textSize(PLAYER_SIZE * 0.8);
        translate(0, 0, -1);
        fill(0, 0, 0, 180);
        text(zone.label, 1.5, 1.5);
        translate(0, 0, 1);
        fill(255);
        text(zone.label, 0, 0);
        if (prog > 0) {
            textSize(PLAYER_SIZE * 0.6);
            translate(0, 0, -1);
            fill(0, 0, 0, 180);
            text(`${Math.ceil(3 * (1 - prog))}s`, 1.5, PLAYER_SIZE * 1.1 + 1.5);
            translate(0, 0, 1);
            fill(255);
            text(`${Math.ceil(3 * (1 - prog))}s`, 0, PLAYER_SIZE * 1.1);
        }
        pop();
    }
}

function drawWalls() {
    if (!level.length) return;

    const camCX = myTank ? myTank.x : 0;
    const camCY = myTank ? myTank.y : 0;
    const marginX = 700, marginY = 800;
    noStroke();

    if (useTextures && wallTex) {
        // Per-tile draw so each box gets correct UV tiling
        const cStart = Math.max(0, Math.floor((camCX - marginX) / TILE_SIZE));
        const cEnd = Math.min(level[0].length - 1, Math.ceil((camCX + marginX) / TILE_SIZE));
        const rStart = Math.max(0, Math.floor((camCY - marginY) / TILE_SIZE));
        const rEnd = Math.min(level.length - 1, Math.ceil((camCY + marginY) / TILE_SIZE));
        for (let r = rStart; r <= rEnd; r++) {
            for (let c = cStart; c <= cEnd; c++) {
                if (!level[r][c]) continue;
                const wh = level[r][c] * WALL_HEIGHT;
                push();
                translate((c + 0.5) * TILE_SIZE, (r + 0.5) * TILE_SIZE, wh / 2 - 25);
                texture(wallTex);
                box(TILE_SIZE, TILE_SIZE, wh);
                pop();
            }
        }
    } else {
        // Grouped draw (faster, no texture)
        for (const wall of groupedWalls) {
            if (wall.x + wall.width < camCX - marginX || wall.x > camCX + marginX) continue;
            if (wall.y + wall.height < camCY - marginY || wall.y > camCY + marginY) continue;
            push();
            translate(wall.x + wall.width / 2, wall.y + wall.height / 2, wall.wallHeight / 2 - 25);
            fill(120, 80, 40);
            box(wall.width, wall.height, wall.wallHeight);
            pop();
        }
    }
}


function drawWalls2() {
    if (!level.length) return; // Ensure the level array is defined

    for (let row = 0; row < level.length; row++) {
        for (let col = 0; col < level[row].length; col++) {
            const wallHeight = level[row][col];
            const h = wallHeight * WALL_HEIGHT;
            if (wallHeight > 0) {
                push();

                // Calculate wall position relative to (0, 0)
                const wallX = col * TILE_SIZE + TILE_SIZE / 2;
                const wallY = row * TILE_SIZE + TILE_SIZE / 2;

                // Move to position and render wall
                translate(wallX, wallY, h / 2 - 25);
                fill(120, 80, 40); // Wall color
                stroke(0); // Outline color
                strokeWeight(1);
                noStroke(); // Stroke causes lines to blled through fog of war, not sure why
                box(TILE_SIZE, TILE_SIZE, h);
                pop();
            }
        }
    }
}

// function drawWalls() { // With viewport
//     if (!level.length) return; // Ensure the level array is defined

//     const viewport = getViewportBounds(camX, camY);

//     for (let row = 0; row < level.length; row++) {
//         for (let col = 0; col < level[row].length; col++) {
//             const wallHeight = level[row][col];
//             if (wallHeight > 0) {
//                 // Correctly align the wall to its tile center
//                 const wallX = col * TILE_SIZE + TILE_SIZE / 2;
//                 const wallY = row * TILE_SIZE + TILE_SIZE / 2;
//                 const wallZ = (wallHeight * WALL_HEIGHT) / 2;

//                 if (isInsideViewport(wallX, wallY, viewport)) {
//                     push();
//                     translate(wallX, wallY, wallZ); // Align the wall correctly
//                     fill(120, 80, 40); // Wall color
//                     stroke(0); // Outline color
//                     strokeWeight(1);
//                     box(TILE_SIZE, TILE_SIZE, wallHeight * WALL_HEIGHT); // Properly sized wall
//                     pop();
//                 }
//             }
//         }
//     }
// }


SHIELD_COLOR = [50, 100, 255]

function drawExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];

        if (explosion.effect === 'harbinger_ring') {
            if (!explosion._hInit) {
                explosion._hInit = true;
                explosion._life = 40;
                explosion._maxLife = 40;
                explosion._ringR = explosion.size * 0.3;
                explosion._maxRingR = explosion.size * 3.5;
            }
            explosion._life--;
            if (explosion._life <= 0) { explosions.splice(i, 1); continue; }
            const t = 1 - explosion._life / explosion._maxLife;
            const alpha = explosion._life / explosion._maxLife;
            const ringR = explosion._ringR + (explosion._maxRingR - explosion._ringR) * t;
            push();
            translate(explosion.x, explosion.y, explosion.z);
            // Core flash
            noStroke();
            fill(220, 80, 220, 200 * (1 - t));
            sphere(explosion.size * 0.8 * (1 - t));
            // Expanding ring
            noFill();
            stroke(220, 60, 220, 255 * alpha);
            strokeWeight(4 * alpha);
            beginShape();
            for (let a = 0; a <= TWO_PI; a += 0.18) vertex(cos(a) * ringR, sin(a) * ringR);
            endShape(CLOSE);
            // Secondary faint ring
            stroke(255, 140, 255, 140 * alpha);
            strokeWeight(2 * alpha);
            beginShape();
            for (let a = 0; a <= TWO_PI; a += 0.18) vertex(cos(a) * ringR * 0.65, sin(a) * ringR * 0.65);
            endShape(CLOSE);
            // 12 radial spokes
            for (let r = 0; r < 12; r++) {
                const a = (r / 12) * TWO_PI;
                stroke(255, 100, 255, 180 * alpha);
                strokeWeight(1.5);
                line(0, 0, cos(a) * ringR * 0.55, sin(a) * ringR * 0.55);
            }
            pop();
            continue;
        }

        if (explosion.effect === 'harbinger_pulse') {
            if (!explosion._pInit) {
                explosion._pInit = true;
                explosion._life = 28;
                explosion._maxLife = 28;
                explosion._maxR = explosion.size * 4.5;
            }
            explosion._life--;
            if (explosion._life <= 0) { explosions.splice(i, 1); continue; }
            const tp = 1 - explosion._life / explosion._maxLife;
            const ap = explosion._life / explosion._maxLife;
            const rp = explosion._maxR * tp;
            push();
            translate(explosion.x, explosion.y, explosion.z);
            noFill();
            // Outer shockwave ring
            stroke(180, 40, 255, 255 * ap);
            strokeWeight(5 * ap);
            beginShape();
            for (let a = 0; a <= TWO_PI; a += 0.14) vertex(cos(a) * rp, sin(a) * rp);
            endShape(CLOSE);
            // Inner ghost ring
            stroke(220, 120, 255, 160 * ap);
            strokeWeight(2 * ap);
            beginShape();
            for (let a = 0; a <= TWO_PI; a += 0.14) vertex(cos(a) * rp * 0.7, sin(a) * rp * 0.7);
            endShape(CLOSE);
            // Central flash
            noStroke();
            fill(200, 80, 255, 180 * (1 - tp));
            sphere(explosion.size * 0.5 * (1 - tp));
            pop();
            continue;
        }

        if (explosion.effect === 'shockwave_pulse') {
            if (!explosion._swInit) {
                explosion._swInit = true;
                explosion._life = 32;
                explosion._maxLife = 32;
                explosion._maxR = explosion.size * 5;
            }
            explosion._life--;
            if (explosion._life <= 0) { explosions.splice(i, 1); continue; }
            const tsw = 1 - explosion._life / explosion._maxLife;
            const asw = explosion._life / explosion._maxLife;
            const rsw = explosion._maxR * tsw;
            push();
            translate(explosion.x, explosion.y, explosion.z);
            noFill();
            // Outer cyan ring
            stroke(60, 200, 255, 255 * asw);
            strokeWeight(6 * asw);
            beginShape();
            for (let a = 0; a <= TWO_PI; a += 0.14) vertex(cos(a) * rsw, sin(a) * rsw);
            endShape(CLOSE);
            // Inner white ring
            stroke(180, 230, 255, 180 * asw);
            strokeWeight(2.5 * asw);
            beginShape();
            for (let a = 0; a <= TWO_PI; a += 0.14) vertex(cos(a) * rsw * 0.65, sin(a) * rsw * 0.65);
            endShape(CLOSE);
            // Central flash
            noStroke();
            fill(120, 220, 255, 200 * (1 - tsw));
            sphere(explosion.size * 0.4 * (1 - tsw));
            pop();
            continue;
        }

        if (explosion.effect === 'stun') {
            if (!explosion._stunInit) {
                explosion._stunInit = true;
                explosion._life = 28;
                explosion._alpha = 255;
                // Generate rays at random angles
                explosion._rays = [];
                const rayCount = 28;
                for (let r = 0; r < rayCount; r++) {
                    explosion._rays.push({
                        ang: random(TWO_PI),
                        inner: explosion.size * random(0.2, 0.5),
                        outer: explosion.size * random(2.8, 5.0),
                        wid: random(2.5, 5.5),
                    });
                }
            }

            explosion._life--;
            explosion._alpha = (explosion._life / 28) * 255;
            if (explosion._life <= 0) { explosions.splice(i, 1); continue; }

            push();
            translate(explosion.x, explosion.y, explosion.z);
            noFill();
            const a = explosion._alpha;
            // Core flash
            noStroke();
            fill(255, 245, 140, a * 0.7);
            sphere(explosion.size * 1.1 * (explosion._life / 28));
            // Rays
            for (const ray of explosion._rays) {
                stroke(255, 225, 60, a);
                strokeWeight(ray.wid);
                line(
                    Math.cos(ray.ang) * ray.inner, Math.sin(ray.ang) * ray.inner, 0,
                    Math.cos(ray.ang) * ray.outer, Math.sin(ray.ang) * ray.outer, 0
                );
                // Bright inner highlight
                stroke(255, 255, 200, a * 0.85);
                strokeWeight(ray.wid * 0.45);
                line(
                    Math.cos(ray.ang) * ray.inner, Math.sin(ray.ang) * ray.inner, 0,
                    Math.cos(ray.ang) * ray.outer * 0.75, Math.sin(ray.ang) * ray.outer * 0.75, 0
                );
            }
            pop();
            continue;
        }

        if (explosion.effect === 'shield') {
            // Lazy init once
            if (!explosion._shieldInit) {
                explosion._shieldInit = true;

                // Ring params
                explosion._ringR = explosion.size * 0.9;
                explosion._ringMaxR = explosion.size * 6.0;
                explosion._ringThick = Math.max(1.2, explosion.size * 0.12);
                explosion._ringSpeed = 3.2;

                // Lifetime separate from normal alpha
                explosion._alpha = 255;
                explosion._life = 22;

                // Electric arcs sitting on the ring
                explosion._arcs = [];
                const arcCount = 20;
                for (let a = 0; a < arcCount; a++) {
                    const ang = random(TWO_PI);
                    explosion._arcs.push({
                        ang,
                        len: random(explosion.size * 0.8, explosion.size * 1.4),
                        wid: random(explosion.size * 0.12, explosion.size * 0.22),
                        z: 0.2,
                        spin: random(-0.06, 0.06),
                        life: explosion._life - floor(random(6))
                    });
                }
                // Blue “glass” debris
                explosion._debris = [];
                const n = 14 + floor(random(4));
                for (let k = 0; k < n; k++) {
                    const ang = random(TWO_PI);
                    const baseSpd = random(0.6, 1.6) * (explosion.size / 5);
                    explosion._debris.push({
                        x: 0, y: 0, z: 0.2,            // <— LOCAL offsets (not world)
                        vx: Math.cos(ang) * baseSpd,
                        vy: Math.sin(ang) * baseSpd,
                        vz: random(1.0, 2.2) * (explosion.size / 10),
                        spinX: random(-0.22, 0.22),
                        spinY: random(-0.28, 0.28),
                        s: random(6, 12) * (explosion.size / 10),
                        life: 14 + floor(random(30)),
                        alpha: 255
                    });
                }
            }

            // DRAW shield visuals
            push();
            translate(explosion.x, explosion.y, explosion.z);

            // 1) Core shimmer (faint)
            const shimmerA = Math.max(0, explosion._alpha * 0.22);
            if (shimmerA > 0) {
                noStroke();
                fill(SHIELD_COLOR[0], SHIELD_COLOR[1], SHIELD_COLOR[2], shimmerA);
                sphere(explosion.size * 0.9);
            }

            // 2) Expanding ring (flat torus)
            push();
            // rotateX(HALF_PI);                       // << re-enable so ring lies on ground
            const a1 = Math.max(0, explosion._alpha);
            noFill();
            stroke(SHIELD_COLOR[0], SHIELD_COLOR[1], SHIELD_COLOR[2], a1);
            strokeWeight(explosion._ringThick * 1.6);
            torus(explosion._ringR, explosion._ringThick * 0.9);
            stroke(220, 240, 255, a1);
            strokeWeight(explosion._ringThick * 0.6);
            torus(explosion._ringR * 0.995, explosion._ringThick * 0.45);

            // 3) Electric arcs along the ring (same rotated frame)
            for (let k = explosion._arcs.length - 1; k >= 0; k--) {
                const arc = explosion._arcs[k];
                if (arc.life <= 0) { explosion._arcs.splice(k, 1); continue; }
                arc.life--;

                // shrink & fade
                arc.len *= 0.92;
                arc.wid *= 0.94;
                const aFade = Math.max(0, Math.min(255, arc.life * 10));

                // position on ring
                const R = explosion._ringMaxR * random(0.6, 0.9);
                const ax = Math.cos(arc.ang) * R;
                const ay = Math.sin(arc.ang) * R;

                push();
                translate(ax, ay, arc.z);
                rotateZ(arc.ang);                    // tangent alignment
                noStroke();
                // gentle flicker, clamped by fade
                const flick = 150 + 60 * (noise(frameCount * 0.12 + k * 5) - 0.5);
                fill(120, 200, 255, Math.min(aFade, flick));
                // guard against going to zero
                box(Math.max(arc.len, 0.1), Math.max(arc.wid, 0.1), 0.8);
                pop();

                arc.ang += arc.spin;
            }
            pop(); // end rotateX(HALF_PI) block


            // 4) Blue debris shards (thin, glassy)
            if (explosion._debris && explosion._debris.length) {
                for (let j = explosion._debris.length - 1; j >= 0; j--) {
                    const d = explosion._debris[j];

                    // physics
                    d.vz -= 0.25;
                    d.x += d.vx; d.y += d.vy; d.z += d.vz;
                    if (d.z < 0) { d.z = 0; d.vz *= -0.22; d.vx *= 0.84; d.vy *= 0.84; }

                    // life/fade + shrink
                    d.life--;
                    d.s *= 0.96;
                    d.alpha = Math.max(0, Math.min(255, d.life * 6));
                    if (d.life <= 0 || d.s < 0.6) { explosion._debris.splice(j, 1); continue; }

                    push();
                    translate(d.x, d.y, d.z + 0.2);
                    rotateX(frameCount * d.spinX); rotateY(frameCount * d.spinY);
                    noStroke();
                    fill(SHIELD_COLOR[0], SHIELD_COLOR[1], SHIELD_COLOR[2], d.alpha);
                    box(d.s, d.s * 0.45, d.s * 0.25);
                    pop();
                }
            }

            pop(); // end translate

            // UPDATE & CLEANUP
            explosion._ringR = Math.min(explosion._ringMaxR, explosion._ringR + explosion._ringSpeed);
            explosion._alpha = Math.max(0, explosion._alpha - 20);
            explosion._life--;

            if (explosion._life <= 0 &&
                (!explosion._debris || explosion._debris.length === 0) &&
                (!explosion._arcs || explosion._arcs.length === 0)) {
                explosions.splice(i, 1);
            }

            // Skip normal orange explosion branch
            continue;
        }

        if (explosion.alpha > 0) {
            push();
            translate(explosion.x, explosion.y, explosion.z);

            // Simulate explosion light
            // const lightIntensity = explosion.alpha / 255 * 150 + random(-20, 20);  // Scale light intensity with alpha
            // pointLight(255, 150, 0, explosion.x, explosion.y, explosion.z + explosion.size); // Orange light
            // ambientLight(lightIntensity, lightIntensity / 2, 0); // Add ambient light

            // Draw the main explosion sphere
            noStroke();
            const colorShift = map(explosion.alpha, 255, 0, 1, 0); // Shift color from yellow to red
            fill(255, 150 * colorShift, 0, explosion.alpha); // Transition color
            sphere(explosion.size); // Expanding sphere

            // Glow effect
            // fill(255, 100, 0, explosion.alpha / 2); // Semi-transparent glow
            // sphere(explosion.size * 1.5); // Larger glow sphere

            // Shockwave
            // push();
            // rotateX(HALF_PI); // Orient the shockwave on the ground plane
            // fill(255, 100, 0, explosion.alpha / 3); // Semi-transparent ring
            // noStroke();
            // ellipse(0, 0, explosion.size * 4, explosion.size * 2); // Expanding ellipse
            // pop();

            // Particle Effects
            for (let j = 0; j < explosion.particles.length; j++) {
                const particle = explosion.particles[j];
                push();
                translate(particle.x, particle.y, particle.z);
                fill(255, random(150, 250), 0, particle.alpha); // Particle color
                noStroke();
                sphere(particle.size); // Draw particle
                pop();

                // Update particle properties
                particle.x += particle.vx;
                particle.y += particle.vy;
                particle.z += particle.vz;
                particle.alpha -= 10; // Fade particle
                particle.size *= 0.9; // Shrink particle

                // Remove faded particles
                if (particle.alpha <= 0) {
                    explosion.particles.splice(j, 1);
                    j--; // Adjust index
                }
            }

            pop();

            // Update explosion properties
            explosion.size += explosion.dSize; // Increase size
            explosion.alpha -= Math.ceil(explosion.alpha / 4); // Fade out
        }

        // Debris shards
        if (explosion.color) {
            if (typeof explosion.color === 'string') { // player id — resolve to class color
                const hitPlayer = players[explosion.color];
                if (hitPlayer) {
                    const cls = TANK_CLASSES.find(c => c.id === hitPlayer.selectedClass);
                    explosion.color = cls ? hexToRgb(cls.color) : [200, 200, 200];
                } else {
                    explosion.color = [200, 200, 200];
                }
            }
            if (!explosion._debrisSpawned) {
                explosion._debrisSpawned = true;
                const n = 8 + floor(random(4));                 // count
                let sizeScale = explosion.size ? explosion.size / 10 : 1;      // scale by blast size
                sizeScale *= 1.1;

                explosion._debris = [];
                for (let k = 0; k < n; k++) {
                    const ang = random(TWO_PI);
                    const spd = random(0.5, 2.5) * sizeScale;      // radial speed
                    explosion._debris.push({
                        x: explosion.x, y: explosion.y, z: (explosion.z ?? 0.2),
                        vx: Math.cos(ang) * spd,
                        vy: Math.sin(ang) * spd,
                        vz: random(1.5, 2.5) * spd,                        // upward pop
                        spinX: random(-0.20, 0.20),
                        spinY: random(-0.25, 0.25),
                        s: random(10, 20) * sizeScale,                // shard size
                        life: 50 + floor(random(20)),                // frames
                        alpha: 255
                    });
                }
            }

            // Draw debris shards
            if (explosion._debris && explosion._debris.length) {
                for (let j = explosion._debris.length - 1; j >= 0; j--) {
                    const d = explosion._debris[j];

                    // physics
                    d.vz -= 0.28;                        // gravity
                    d.x += d.vx; d.y += d.vy; d.z += d.vz;

                    // gentle ground bounce
                    if (d.z < 0) {
                        d.z = 0;
                        d.vz *= -0.25;                     // dampen vertical
                        d.vx *= 0.82; d.vy *= 0.82;        // friction
                    }

                    // life/fade
                    d.life--;
                    d.s *= 0.96;
                    d.alpha = Math.max(0, Math.min(255, d.life * 6));
                    if (d.life <= 0 || d.s < 0.6) { explosion._debris.splice(j, 1); continue; }

                    // draw shard
                    push();
                    translate(d.x, d.y, d.z + 0.2);
                    rotateX(frameCount * d.spinX);
                    rotateY(frameCount * d.spinY);
                    if (explosion.color) {
                        const factor = 1;
                        fill(explosion.color[0] * factor, explosion.color[1] * factor, explosion.color[2] * factor, d.alpha);
                    } else {
                        // ambientMaterial(120, 110, 100, d.alpha);
                    }
                    noStroke();
                    strokeWeight(0.1);
                    stroke(0);
                    box(d.s, d.s * 0.7, d.s * 0.35);
                    pop();
                }
            }
        }

        // Remove explosion when fully faded// Remove explosion when fully faded AND no children left
        if (
            explosion.alpha <= 0 &&
            (!explosion._debris || explosion._debris.length === 0)
        ) {
            explosions.splice(i, 1);
        }

    }
}

// Function to create an explosion with particles
function createExplosion(x, y, z, size, color, effect) {
    // triggerScreenShake(size, 20);
    const particles = [];
    const particleCount = Math.max(3, Math.ceil(20 * particleScale()));
    for (let i = 0; i < particleCount; i++) { // Number of particles
        const angle = random(TWO_PI);
        const speed = random(size / 4, size / 2); // Random speed
        const vx = speed * cos(angle);
        const vy = speed * sin(angle);
        const vz = random(-1, 1); // Vertical component
        particles.push({
            x: 0,
            y: 0,
            z: 0,
            vx: vx,
            vy: vy,
            vz: vz,
            alpha: 255, // Initial opacity
            size: random(2, 5), // Initial size
        });
    }

    explosions.push({
        x: x,
        y: y,
        z: z,
        size: size, // Initial explosion size
        dSize: size / 10, // Size increment
        alpha: 255, // Initial opacity
        particles: particles,
        color: color,
        effect: effect,
    });
}

function drawTrails() {
    for (let i = trails.length - 1; i >= 0; i--) {
        const trail = trails[i];

        push();
        translate(trail.x, trail.y, trail.z);
        noStroke();
        fill(100, trail.alpha);
        sphere(trail.size); // Expanding sphere
        pop();

        // Update trail properties
        trail.size -= trail.dSize; // Decrease size
        trail.alpha -= 9; // Fade out
        // explosion.z -= 2; // Move upward slightly

        // Remove explosion when fully faded
        if (trail.alpha <= 0) {
            trails.splice(i, 1);
        }
    }
}

const RARITY_GLOW = {
    common: [220, 220, 220],
    rare: [80, 140, 255],
    epic: [200, 60, 255],
    legendary: [255, 140, 20],
};

function drawDropGlow(rarity) {
    const [r, g, b] = RARITY_GLOW[rarity] || RARITY_GLOW.common;
    const pulse = 0.7 + 0.3 * Math.sin(frameCount * 0.07);
    noStroke();
    fill(r, g, b, 70 * pulse);
    ellipse(0, 0, TILE_SIZE * 0.9, TILE_SIZE * 0.9);
    fill(r, g, b, 30 * pulse);
    ellipse(0, 0, TILE_SIZE * 1.4, TILE_SIZE * 1.4);
}

function drawDrops() {
    drops.forEach((drop) => {
        const { x, y, buff, rarity } = drop;

        push();
        translate(x, y, 1);
        drawDropGlow(rarity);
        pop();

        push();
        translate(x, y, TILE_SIZE / 4);
        const angle = frameCount / 45;
        rotateZ(angle);
        drawDrop(x, y, angle, buff);
        pop();
    });

    // Vacuum animation: actual drop icons fly and shrink toward their target player
    for (let i = vacuumDrops.length - 1; i >= 0; i--) {
        const vd = vacuumDrops[i];
        const t = 1 - vd.life / 120;         // 0→1 over 2 seconds
        const speed = 0.015 + t * t * 0.12;  // ease-in: slow start, accelerates late
        vd.x += (vd.targetX - vd.x) * speed;
        vd.y += (vd.targetY - vd.y) * speed;
        vd.life--;

        // Stay full size for first 60% of journey, then shrink
        const sz = t < 0.6 ? 1 : (1 - (t - 0.6) / 0.4);
        if (sz < 0.08 || Math.hypot(vd.x - vd.targetX, vd.y - vd.targetY) < PLAYER_SIZE * 0.5) {
            vacuumDrops.splice(i, 1);
            continue;
        }

        const angle = frameCount / 45;
        push();
        translate(vd.x, vd.y, 1);
        scale(sz, sz, sz);
        drawDropGlow(vd.rarity);
        pop();
        push();
        translate(vd.x, vd.y, TILE_SIZE / 4 * sz);
        rotateZ(angle);
        scale(sz, sz, sz);
        if (font) textFont(font);
        drawDrop(vd.x, vd.y, angle, vd.buff);
        pop();
    }
}


function handleMovement() {
    if (!myTank) return;
    // Capture input and send to server. Physics prediction runs in applySmoothing()
    // (inside draw()) so it fires exactly once per render frame, not at setInterval rate.
    const panelOpen = isLobbyPanelOpen();
    currentKeys = {
        w: !panelOpen && !!keysHeld['KeyW'],
        a: !panelOpen && !!keysHeld['KeyA'],
        s: !panelOpen && !!keysHeld['KeyS'],
        d: !panelOpen && !!keysHeld['KeyD'],
    };
    currentTurretAngle = atan2(mouseY - height / 2, mouseX - width / 2);
    if (laserChanneling && myTank?.selectedClass === 'laser') socket.emit('fireLaser');
    socket.emit('playerInput', { keys: currentKeys, turretAngle: currentTurretAngle, shieldActive: guardianShielding });
}

function handleTankMovement() {
    let dx = 0;
    let dy = 0;
    const speed = 2;
    let angleChange = 0;

    // Capture directional input
    if (keysHeld['KeyW']) { // W key (move forward)
        dx += Math.cos(myTank.angle) * speed;
        dy += Math.sin(myTank.angle) * speed;
    }
    if (keysHeld['KeyS']) { // S key (move backward)
        dx -= Math.cos(myTank.angle) * speed;
        dy -= Math.sin(myTank.angle) * speed;
    }

    // Capture rotational input
    if (keysHeld['KeyA']) { // A key (rotate left)
        angleChange -= 0.05;
    }
    if (keysHeld['KeyD']) { // D key (rotate right)
        angleChange += 0.05;
    }

    // Emit movement input to the server
    socket.emit('playerTankMove', {
        dx: dx,
        dy: dy,
        angleChange: angleChange,
        turretAngle: atan2(mouseY - height / 2, mouseX - width / 2), // Point turret to the mouse
    });
}

function mousePressed() {
    if (!lobbyCode) return;
    if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;
    const panel = document.getElementById('lobby-controls');
    if (panel && !panel.classList.contains('is-hidden')) return;

    if (mouseButton === RIGHT) {
        if (myTank && myTank.selectedClass === 'guardian') guardianShielding = true;
        if (myTank && myTank.selectedClass === 'laser') laserChanneling = true;
        if (myTank && myTank.selectedClass === 'sniper') sniperPanning = true;
        if (myTank && myTank.selectedClass === 'scout') {
            const angle = atan2(mouseY - height / 2, mouseX - width / 2);
            socket.emit('flareShot', { angle });
        }
        if (myTank && myTank.selectedClass === 'gunner') socket.emit('barrageStart');
        if (myTank && myTank.selectedClass === 'artillerist') socket.emit('cannonShot');
        if (myTank && myTank.selectedClass === 'assault' && (myTank.pillageCharge || 0) >= 100) socket.emit('activatePillage');
        if (myTank && myTank.selectedClass === 'engineer') {
            const cx = camX, cy = camY, cz = camZ;
            const tx = cx + sniperPanX;
            const ty = cy - 200 + sniperPanY;
            let fwdX = tx - cx, fwdY = ty - cy, fwdZ = 0 - cz;
            const fLen = Math.sqrt(fwdX * fwdX + fwdY * fwdY + fwdZ * fwdZ);
            fwdX /= fLen; fwdY /= fLen; fwdZ /= fLen;
            let rX = fwdY * 0 - fwdZ * 1, rY = fwdZ * 0 - fwdX * 0, rZ = fwdX * 1 - fwdY * 0;
            const rLen = Math.sqrt(rX * rX + rY * rY + rZ * rZ);
            rX /= rLen; rY /= rLen; rZ /= rLen;
            const uX = rY * fwdZ - rZ * fwdY, uY = rZ * fwdX - rX * fwdZ, uZ = rX * fwdY - rY * fwdX;
            const fov = Math.PI / 3, h2 = Math.tan(fov / 2), aspect = width / height, scale = 0.75;
            const mx = -(mouseX - width / 2) / (width / 2) * h2 * aspect * scale;
            const my = -(mouseY - height / 2) / (height / 2) * h2 * scale;
            const rdx = mx * rX + my * uX - fwdX;
            const rdy = mx * rY + my * uY - fwdY;
            const rdz = mx * rZ + my * uZ - fwdZ;
            if (rdz !== 0) {
                const t = -cz / rdz;
                const worldX = cx + t * rdx;
                const worldY = cy + t * rdy;
                socket.emit('companionRally', { x: worldX, y: worldY });
                engineerRallyPoint = { x: worldX, y: worldY };
                engineerRallyTimer = 240;
            }
        }
        return false; // prevent context menu
    }

    // Left click — fire piercing shot if scoped and ready, otherwise normal bullet
    if (myTank && myTank.selectedClass === 'sniper' && sniperPanning && !(myTank.sniperShotCooldown > 0)) {
        socket.emit('sniperShot');
    } else if (myTank) {
        const _fAngle = myTank.turretAngle;
        if (BULLET_PREDICTION_ENABLED) {
            const _ownedBullets = bullets.filter(b => b.owner === socket.id && !b.isTurretBullet && !b.isChainBullet && !b.afterimageBullet).length
                + predictedBullets.length;
            if ((myTank.currentFireCooldown || 0) <= 0 && _ownedBullets < (myTank.maxBullets || 6)) {
                const _spawnDist = PLAYER_SIZE + BULLET_SIZE * 2;
                predictedBullets.push({
                    x: myTank.x + Math.cos(_fAngle) * _spawnDist,
                    y: myTank.y + Math.sin(_fAngle) * _spawnDist,
                    angle: _fAngle,
                    speed: BULLET_SPEED,
                    createdAt: performance.now(),
                });
            }
        }
        socket.emit('fireBullet', { angle: _fAngle });
    }
}


function mouseReleased() {
    if (mouseButton === RIGHT) {
        laserChanneling = false;
        guardianShielding = false;
        sniperPanning = false;
    }
}

function mouseDragged() {
    if (myTank && myTank.name === 'jeric') {
        socket.emit('fireLaser');
    }
}

function drawBullets() {
    bullets.forEach((bullet, i) => {
        const { x, y } = getBulletDisplayPos(i);
        const bz = bullet.bulletZ ?? (bullet.isTurretBullet ? PLAYER_SIZE * 2.4 : PLAYER_SIZE * 1.4 - BULLET_SIZE);

        push();
        translate(x, y, bz);
        noStroke();

        if (bullet.isTurretBullet) {
            // Small orange turret bullet
            const bs = BULLET_SIZE * 0.55;
            push();
            const cameraPos = new p5.Vector(camX, camY, camZ);
            const bulletPos = new p5.Vector(x, y, bz);
            const offset = p5.Vector.sub(cameraPos, bulletPos).normalize().mult(-1.5);
            translate(offset.x, offset.y, offset.z);
            fill(80, 40, 0);
            sphere(bs + 1);
            pop();
            fill(255, 160, 0);
            sphere(bs);
        } else {
            // Standard bullet rendering — also used for cannonballs/sniper (just larger)
            const bs = bullet.isHeavyCannonball ? BULLET_SIZE * 2.2
                : bullet.isCannonball ? BULLET_SIZE * 1.5
                    : bullet.wallPiercing ? BULLET_SIZE * 1.8
                        : BULLET_SIZE;
            push();
            const cameraPos = new p5.Vector(camX, camY, camZ);
            const bulletPos = new p5.Vector(x, y, bz);
            const viewDirection = p5.Vector.sub(cameraPos, bulletPos).normalize();
            const offset = viewDirection.mult(-2);
            translate(offset.x, offset.y, offset.z);
            fill(0);
            sphere(bs + 1);
            if (bullet.owner && players[bullet.owner] && players[bullet.owner].isAI) {
                fill(255, 0, 0, 110);
                translate(offset.x, offset.y, offset.z);
                sphere(bs + 2);
            }
            pop();
            fill(150);
            sphere(bs);
        }

        // Harbinger-captured bullet: purple pulsing aura (only on redirected player bullets)
        if (bullet.harbingerCaptured) {
            const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.22);
            noStroke();
            fill(180, 40, 255, 90 + 90 * pulse);
            sphere(BULLET_SIZE * (1.7 + 0.4 * pulse));
        }

        // Shockwave-captured bullet: cyan electric aura
        if (bullet.shockwaveCaptured) {
            const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.3);
            noStroke();
            fill(60, 200, 255, 80 + 100 * pulse);
            sphere(BULLET_SIZE * (1.6 + 0.5 * pulse));
            // Hard inner core flash
            fill(200, 240, 255, 120 * pulse);
            sphere(BULLET_SIZE * 0.9);
        }

        // Afterimage bullet: cyan ghost trail aura
        if (bullet.afterimageBullet) {
            const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.25);
            noStroke();
            fill(160, 220, 255, 60 + 60 * pulse);
            sphere(BULLET_SIZE * (1.5 + 0.4 * pulse));
        }

        // Nullfield-slowed bullet: icy blue drag ring perpendicular to travel
        if (bullet._nullfieldSlowed) {
            const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.18);
            noFill();
            // Flat ring oriented perpendicular to bullet travel direction
            push();
            rotateZ(bullet.angle + HALF_PI);
            stroke(80, 180, 255, 120 + 80 * pulse);
            strokeWeight(1.8);
            beginShape();
            for (let a = 0; a <= TWO_PI; a += 0.25) vertex(cos(a) * BULLET_SIZE * (1.8 + 0.5 * pulse), sin(a) * BULLET_SIZE * (0.5 + 0.2 * pulse));
            endShape(CLOSE);
            stroke(160, 220, 255, 60 * pulse);
            strokeWeight(1);
            beginShape();
            for (let a = 0; a <= TWO_PI; a += 0.25) vertex(cos(a) * BULLET_SIZE * (2.4 + 0.6 * pulse), sin(a) * BULLET_SIZE * (0.7 + 0.2 * pulse));
            endShape(CLOSE);
            pop();
            // Faint blue tint over the bullet core
            noStroke();
            fill(100, 180, 255, 50 + 40 * pulse);
            sphere(BULLET_SIZE * 1.1);
        }

        // Chain bullet: yellow-green electric arcs
        if (bullet.isChainBullet) {
            const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.35 + bullet.id * 2.7);
            noStroke();
            fill(180, 255, 80, 70 + 80 * pulse);
            sphere(BULLET_SIZE * (1.6 + 0.5 * pulse));
            // Crackling outer ring perpendicular to travel
            push();
            rotateZ(bullet.angle + HALF_PI);
            noFill();
            stroke(220, 255, 100, 130 + 80 * pulse);
            strokeWeight(1.5);
            beginShape();
            for (let a = 0; a <= TWO_PI; a += 0.3) {
                const jitter = 1 + 0.25 * Math.sin(frameCount * 0.6 + a * 3.1 + bullet.id);
                vertex(cos(a) * BULLET_SIZE * 2.0 * jitter, sin(a) * BULLET_SIZE * 0.5 * jitter);
            }
            endShape(CLOSE);
            pop();
        }

        pop();

        // Trail
        const trailSize = bullet.isHeavyCannonball ? BULLET_SIZE * 2.2 : bullet.isCannonball ? BULLET_SIZE * 1.5 : bullet.wallPiercing ? BULLET_SIZE * 1.8 : bullet.isTurretBullet ? BULLET_SIZE * 0.55 : BULLET_SIZE;
        trails.push({
            x, y,
            z: bz,
            size: trailSize,
            dSize: trailSize / 15,
            alpha: 108,
        });
    });

    // Draw client-side predicted bullets (fired locally, not yet echoed by server)
    if (!BULLET_PREDICTION_ENABLED) return;
    const frameMs = 1000 / 60;
    predictedBullets.forEach(pb => {
        const framesElapsed = (performance.now() - pb.createdAt) / frameMs;
        const px = pb.x + Math.cos(pb.angle) * pb.speed * framesElapsed;
        const py = pb.y + Math.sin(pb.angle) * pb.speed * framesElapsed;
        const pbz = PLAYER_SIZE * 1.4 - BULLET_SIZE;
        push();
        translate(px, py, pbz);
        noStroke();
        const cameraPos = new p5.Vector(camX, camY, camZ);
        const bulletPos = new p5.Vector(px, py, pbz);
        const offset = p5.Vector.sub(cameraPos, bulletPos).normalize().mult(-2);
        push();
        translate(offset.x, offset.y, offset.z);
        fill(0);
        sphere(BULLET_SIZE + 1);
        pop();
        fill(150);
        sphere(BULLET_SIZE);
        pop();
        trails.push({ x: px, y: py, z: pbz, size: BULLET_SIZE, dSize: BULLET_SIZE / 15, alpha: 108 });
    });
}

function drawLasers() {
    lasers.forEach(laser => {
        push();
        // Recompute origin from visual tank (turretAngle already throttled by pre-draw pass)
        let x1 = laser.x1, y1 = laser.y1;
        if (laser.owner && players[laser.owner]) {
            const t = players[laser.owner];
            const spawnDist = 1.3 * (PLAYER_SIZE + BULLET_SIZE);
            x1 = t.x + Math.cos(t.turretAngle) * spawnDist;
            y1 = t.y + Math.sin(t.turretAngle) * spawnDist;
        }
        const dx = laser.x2 - x1;
        const dy = laser.y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = atan2(dy, dx) + PI / 2;
        translate((x1 + laser.x2) / 2, (y1 + laser.y2) / 2, PLAYER_SIZE * 1.4);
        rotateZ(angle)
        let r = PLAYER_SIZE / 2
        if (laser.isActive) {
            fill(255, 50, 0);
            if (frameCount % 5 == 0 && random() < particleScale()) {
                createExplosion(x1 + random(-r, r), y1 + random(-r, r), PLAYER_SIZE * 1.4 - BULLET_SIZE + random(-r, r), BULLET_SIZE);
                createExplosion(laser.x2 + random(-r, r), laser.y2 + random(-r, r), PLAYER_SIZE * 1.4 - BULLET_SIZE + random(-r, r), BULLET_SIZE);
            }
        } else {
            fill(150);

            if (frameCount % 10 == 0) {
                trails.push({
                    x: x1 + random(-r, r),
                    y: y1 + random(-r, r),
                    z: PLAYER_SIZE * 1.4 - BULLET_SIZE + random(-r, r),
                    size: BULLET_SIZE,
                    dSize: BULLET_SIZE / 10,
                    alpha: 108,
                });
            }
        }
        // strokeWeight(3); // Adjust thickness
        noStroke();
        // line(laser.x1, laser.y1, laser.x2, laser.y2);
        cylinder(2, len)
        pop();
    });
}

function drawChainRays() {
    chainRays = chainRays.filter(r => r.life > 0);
    for (const r of chainRays) {
        const t = r.life / 18;
        const alpha = t * 220;
        const dx = r.x2 - r.x1;
        const dy = r.y2 - r.y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = atan2(dy, dx) + HALF_PI;
        push();
        noStroke();
        translate((r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2, PLAYER_SIZE * 1.6);
        rotateZ(angle);
        fill(255, 220, 50, alpha);
        cylinder(2.5 * t, len);
        pop();
        r.life--;
    }
}

function drawPillageAnims() {
    pillageAnims = pillageAnims.filter(p => p.life > 0);
    for (const p of pillageAnims) {
        const t = 1 - p.life / p.maxLife;               // 0→1 over lifetime
        const rise = TILE_SIZE * 3 * Math.sqrt(t);       // ease-out rise
        const fadeT = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
        const popT = Math.min(1, t / 0.12);              // quick pop-in over first 12%
        const sz = popT < 1 ? 0.3 + 0.7 * popT : 1;

        const [r, g, b] = RARITY_GLOW[p.rarity] || RARITY_GLOW.common;
        const label = BUFF_LABELS[p.buff] || p.buff;

        // Rarity glow halo
        push();
        translate(p.x, p.y, TILE_SIZE * 0.3 + rise);
        noStroke();
        fill(r, g, b, 90 * fadeT * sz);
        ellipse(0, 0, TILE_SIZE * 1.1 * sz, TILE_SIZE * 1.1 * sz);
        fill(r, g, b, 35 * fadeT * sz);
        ellipse(0, 0, TILE_SIZE * 1.8 * sz, TILE_SIZE * 1.8 * sz);
        pop();

        // Spinning 3D drop icon
        push();
        translate(p.x, p.y, TILE_SIZE * 0.3 + rise);
        rotateZ(frameCount / 18);
        scale(sz * 1.3);
        drawDrop(p.x, p.y, frameCount / 18, p.buff);
        pop();

        // Buff label text rising above icon
        push();
        translate(p.x, p.y, TILE_SIZE * 0.3 + rise + TILE_SIZE * 0.85);
        rotateX(atan2(p.y - camY, camZ));
        noStroke();
        textFont(font);
        textSize(PLAYER_SIZE * 0.85);
        textAlign(CENTER, CENTER);
        fill(0, 0, 0, 180 * fadeT);
        text(label, 1.5, 1.5);
        fill(r, g, b, 255 * fadeT);
        text(label, 0, 0);
        pop();

        p.life--;
    }
}

function drawAfterimageAnims() {
    afterimageAnims = afterimageAnims.filter(a => a.life > 0);
    for (const a of afterimageAnims) {
        const alpha = (a.life / a.maxLife) * 130;
        const s = PLAYER_SIZE;
        push();
        translate(a.x, a.y, s);
        rotateZ(a.angle);

        noStroke();
        // Hull — matches standard tank: two overlapping boxes
        fill(160, 220, 255, alpha);
        box(2 * s, 1.5 * s, s);
        fill(150, 210, 255, alpha * 0.85);
        box(1.8 * s, 1.7 * s, s * 0.8);

        // Turret
        push();
        rotateZ(PI / 2 + a.turretAngle - a.angle);
        translate(0, 0, s);
        fill(180, 235, 255, alpha);
        box(s, 1.15 * s, s);

        // Barrel — standard single barrel (centerY = 0.25s - 0.75s = -0.5s, no rotateX needed)
        push();
        translate(0, -(0.5 * s), 0);
        fill(200, 240, 255, alpha * 0.9);
        cylinder(s * 0.15, s * 1.5);
        pop();
        pop();

        pop();
        a.life--;
    }
}

function drawScavengeAnims() {
    scavengeAnims = scavengeAnims.filter(a => a.life > 0);
    for (const a of scavengeAnims) {
        const t = 1 - a.life / a.maxLife;
        const alpha = a.life / a.maxLife;
        // Expanding gold sparkle ring
        const ringR = TILE_SIZE * 0.9 * Math.sqrt(t + 0.1);
        push();
        translate(a.x, a.y, PLAYER_SIZE * 0.5);
        noFill();
        stroke(255, 200, 40, 220 * alpha);
        strokeWeight(3 * alpha);
        beginShape();
        for (let ag = 0; ag <= TWO_PI; ag += 0.2) vertex(cos(ag) * ringR, sin(ag) * ringR);
        endShape(CLOSE);
        // 6 radiating sparkle lines
        for (let k = 0; k < 6; k++) {
            const ang = (k / 6) * TWO_PI + t * 1.5;
            const inner = ringR * 0.4;
            const outer = ringR * 0.95;
            stroke(255, 230, 80, 200 * alpha);
            strokeWeight(1.5 * alpha);
            line(cos(ang) * inner, sin(ang) * inner, cos(ang) * outer, sin(ang) * outer);
        }
        pop();
        a.life--;
    }
}

function drawFlares() {
    for (const flare of flares) {
        push();
        const pulse = 0.7 + 0.3 * sin(frameCount * 0.15);
        translate(flare.x, flare.y, PLAYER_SIZE * 0.8);
        noStroke();
        fill(255, 220, 80, 200 * pulse);
        sphere(BULLET_SIZE * 2);
        // Glow halo
        fill(255, 180, 40, 60 * pulse);
        sphere(BULLET_SIZE * 4);
        pop();
    }
}


function drawSmokeClouds() {
    // Fog blocking is handled in vision.js fog layer.
    // Draw a subtle ground ring so the smoke location is hinted at in-world.
    for (const sc of smokeClouds) {
        const fade = Math.min(1, sc.framesLeft / 60);
        const pulse = 0.8 + 0.2 * Math.sin(frameCount * 0.05);
        push();
        translate(sc.x, sc.y, 2);
        noStroke();
        fill(140, 140, 160, Math.round(55 * fade * pulse));
        torus(sc.radius * 0.55, sc.radius * 0.18);
        pop();
    }
}

function drawSniperScopeRay() {
    if (!sniperPanning || !myTank || myTank.selectedClass !== 'sniper') return;
    const shotReady = !(myTank.sniperShotCooldown > 0);

    const angle = myTank.turretAngle;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const maxLen = (level.length + (level[0] ? level[0].length : 0)) * TILE_SIZE;

    // Trace the ray ignoring walls (wall-piercing)
    const endX = myTank.x + dx * maxLen;
    const endY = myTank.y + dy * maxLen;

    const pulse = 0.6 + 0.4 * Math.sin(frameCount * 0.2);
    const z = PLAYER_SIZE * 1.4;
    const r = shotReady ? 255 : 150, g2 = shotReady ? 160 : 150, b = shotReady ? 30 : 150;

    push();
    // Outer glow line
    stroke(r, g2, b, (shotReady ? 60 : 30) * pulse);
    strokeWeight(6);
    line(myTank.x, myTank.y, z, endX, endY, z);
    // Core line
    stroke(r, shotReady ? 220 : 180, b, (shotReady ? 200 : 80) * pulse);
    strokeWeight(1.5);
    line(myTank.x, myTank.y, z, endX, endY, z);
    pop();
}

function drawEngineerRallyIndicator() {
    if (!engineerRallyPoint || !myTank || myTank.selectedClass !== 'engineer') return;
    engineerRallyTimer--;
    if (engineerRallyTimer <= 0) { engineerRallyPoint = null; return; }

    const fade = Math.min(engineerRallyTimer / 60, 1);
    const pulse = (Math.sin(frameCount * 0.12) + 1) * 0.5;
    const innerR = PLAYER_SIZE * 1.3;
    const outerR = PLAYER_SIZE * (2.0 + pulse * 0.5);
    const arm = PLAYER_SIZE * 0.65;

    push();
    translate(engineerRallyPoint.x, engineerRallyPoint.y, 1);
    noFill();
    stroke(255, 211, 42, 220 * fade);
    strokeWeight(2.5);
    beginShape();
    for (let a = 0; a <= TWO_PI; a += 0.22) vertex(cos(a) * innerR, sin(a) * innerR, 0);
    endShape(CLOSE);
    stroke(255, 211, 42, 100 * fade);
    strokeWeight(1.5);
    beginShape();
    for (let a = 0; a <= TWO_PI; a += 0.22) vertex(cos(a) * outerR, sin(a) * outerR, 0);
    endShape(CLOSE);
    stroke(255, 211, 42, 200 * fade);
    strokeWeight(2);
    line(-arm, 0, 0, arm, 0, 0);
    line(0, -arm, 0, 0, arm, 0);
    pop();
}

function drawCompanions() {
    const s = PLAYER_SIZE * 0.55; // companion is ~55% of tank size
    for (const ownerId in companions) {
        const c = companions[ownerId];
        if (c.isDead) continue;
        push();
        translate(c.x, c.y, s);
        rotateZ(c.angle);

        fill(255, 211, 42);
        stroke(0);
        strokeWeight(1);
        box(2 * s, 1.5 * s, s);

        // Turret
        push();
        rotateZ(PI / 2 + c.turretAngle - c.angle);
        translate(0, 0, s);
        fill(200, 165, 30);
        box(s, s, 0.9 * s);
        noStroke();
        // Barrel using camera-facing outline
        {
            const bLen = s * 1.5, bRad = s * 0.15, centerY = 0.25 * s - 0.75 * s;
            const cam = new p5.Vector(camX, camY, camZ);
            const bx = c.x + s * 1.5 * Math.cos(c.turretAngle);
            const by = c.y + s * 1.5 * Math.sin(c.turretAngle);
            const off = p5.Vector.sub(cam, new p5.Vector(bx, by, s)).normalize().mult(-2);
            push();
            translate(0, centerY, 0);
            push();
            rotateZ(-(PI / 2 + c.turretAngle));
            translate(off.x, off.y, off.z);
            rotateZ(PI / 2 + c.turretAngle);
            fill(0, 0, 0);
            cylinder(bRad + 1, bLen);
            pop();
            fill(180, 140, 20);
            cylinder(bRad, bLen);
            // Tip with outline
            push();
            translate(0, -0.75 * s, 0);
            push();
            const tipOff = p5.Vector.sub(cam, new p5.Vector(bx, by, s)).normalize().mult(-2);
            rotateZ(-(PI / 2 + c.turretAngle));
            translate(tipOff.x, tipOff.y, tipOff.z);
            rotateZ(PI / 2 + c.turretAngle);
            fill(0, 0, 0);
            cylinder(bRad * 1.1 + 1, s * 0.15 + 1.9);
            pop();
            fill(200, 165, 30);
            cylinder(bRad * 1.1, s * 0.15 + 2);
            pop();
            pop();
        }
        pop();

        // Shield bubble (same as normal tank shield)
        if (c.shield) {
            noStroke();
            fill(50, 100, 255, 100);
            sphere(s * 1.6);
        }

        pop();
    }
}