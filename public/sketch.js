// Global variables
let players = {};
let myTank = null;
let bullets = [];
let lasers = [];
let level = [];
let levelNumber = -1;
let explosions = [];
let trails = [];
let woodTexture;
let drops = [];
let buffs = [];

let camX, camY, camZ;
let shakeIntensity = 0;
let shakeDuration = 0;

let lobbyCode = null;
let gameState = "playing";
let transitionTimer = 0;
let transitionMessage = '';
let gameMode = 'lobby';

let VIEWPORT_WIDTH = 800;
let VIEWPORT_HEIGHT = 600;

let ping = 0;
let pingHistory = [];
let font;
let fogLayer;

// UI Manager instance
let uiManager;

// Game state management
let gameInitialized = false;

function preload() {
    font = loadFont('/assets/Roboto-Regular.ttf');
}

function setup() {
    let canvas = createCanvas(0.9 * window.innerWidth, 0.9 * window.innerHeight, WEBGL);
    canvas.parent('game-container');

    frameRate(60);
    fogLayer = createGraphics(width, height);

    // Initialize UI Manager
    uiManager = new UIManager();
    uiManager.setFont(font);
    uiManager.initialize();

    // Hide loading screen after setup
    setTimeout(() => {
        hideLoadingScreen();
        gameInitialized = true;
    }, 1000);

    console.log('Game initialized');
}

function draw() {
    background(51);
    lights();
    directionalLight(80, 80, 80, 1, 1, -1);
    directionalLight(80, 80, 80, 1, -1, -1);

    // Handle different game states
    if (gameState === "transition") {
        drawTransitionScreen();
        return;
    }

    // Show menu if not in a lobby or game not ready
    if (!level || !level[0] || !lobbyCode || !gameInitialized) {
        if (uiManager) {
            push();
            resetMatrix();
            camera(0, 0, 630, 0, 0, 0);
            uiManager.drawMenuScreen();
            pop();
        }
        return;
    }

    // Main game rendering
    drawGame();

    // Draw UI overlay that stays on screen
    drawFixedUI();
}

// UI that stays fixed on screen regardless of camera movement
function drawFixedUI() {
    // Completely reset to screen space
    push();
    resetMatrix();

    // Set up screen-space camera (UI doesn't move with game camera)
    camera(0, 0, 630, 0, 0, 0);

    // Draw UI notifications from manager
    if (uiManager) {
        uiManager.drawNotifications();
        uiManager.update();
    }

    // Draw panels in screen space
    drawTopLeftPanel();
    drawTopRightPanel();

    pop();
}

function drawGame() {
    // Draw ground
    const gridWidth = level[0].length * TILE_SIZE;
    const gridHeight = level.length * TILE_SIZE;

    push();
    fill(150, 120, 70);
    translate(gridWidth / 2, gridHeight / 2, -25);
    noStroke();
    plane(gridWidth, gridHeight);

    if (gameMode === 'lobby') {
        push();
        translate(0, 0, 1);
        textSize(TILE_SIZE);
        textFont(font);
        fill(255);
        noStroke();
        text(`Lobby ${lobbyCode}`, 0, 0);
        pop();
    }
    pop();

    // Draw walls
    drawWalls2();
    drawDrops();

    // Draw all tanks
    for (let id in players) {
        const tank = players[id];
        drawTank(tank, id == socket.id);
        if (id == socket.id) {
            myTank = tank;
        }
    }

    if (!myTank) {
        return;
    }

    // Camera setup
    setupCamera();

    // Draw game elements
    drawBullets();
    drawLasers();
    drawExplosions();
    drawTrails();

    // Draw fog of war
    if (isFogOfWar && myTank && !myTank.isDead) {
        drawFogOfWarEffects();
    }
}

function setupCamera() {
    let targetTank = myTank;
    let allDead = false;

    if (myTank && myTank.isDead) {
        targetTank = Object.values(players).find(player => !player.isDead && !player.isAI);
        if (!targetTank) {
            allDead = true;
            targetTank = myTank;
        }
    }

    camX = targetTank.x;
    camY = targetTank.y + 200;
    camZ = 600;

    let targetX = targetTank.x;
    let targetY = targetTank.y;
    let targetZ = 0;

    // Screen shake effect
    let offsetX = 0, offsetY = 0, offsetZ = 0;
    if (shakeDuration > 0) {
        offsetX = random(-shakeIntensity, shakeIntensity);
        offsetY = random(-shakeIntensity, shakeIntensity);
        offsetZ = random(-shakeIntensity, shakeIntensity / 2);
        shakeDuration--;
        if (shakeDuration <= 0) {
            shakeIntensity = 0;
        }
    }

    camera(camX + offsetX, camY + offsetY, camZ + offsetZ, targetX, targetY, targetZ, 0, 1, 0);
}

function drawFogOfWarEffects() {
    const resolution = PI / 150;
    let visiblePoints;

    if (gameMode == 'lobby') {
        visiblePoints = calculateVision(myTank.x, myTank.y, level, myTank.visionDistance, resolution);
        drawFogOfWar(myTank.x, myTank.y, visiblePoints);
    } else if (gameMode == 'arena') {
        visiblePoints = calculateVision(myTank.x, myTank.y, level, myTank.visionDistance, resolution);
        drawFogOfWar(myTank.x, myTank.y, visiblePoints);
    } else {
        visiblePoints = calculateSharedVision(players, level, resolution);
        drawSharedFogOfWar(myTank.x, myTank.y, visiblePoints);
    }
}

function drawTransitionScreen() {
    push();
    resetMatrix();
    camera(0, 0, 800, 0, 0, 0);

    background(0, 150);
    textAlign(CENTER, CENTER);
    textFont(font);
    textSize(width / 15);
    fill(255);
    text(transitionMessage, 0, -height / 4);

    if (transitionTimeLeft != null) {
        textSize(width / 30);
        text(`Next level in ${transitionTimeLeft} seconds...`, 0, 0);
    }
    pop();
}

// Input handling
function handleMovement() {
    if (!myTank) return;

    const keys = {
        w: keyIsDown(87), // W key
        a: keyIsDown(65), // A key
        s: keyIsDown(83), // S key
        d: keyIsDown(68), // D key
    };

    const turretAngle = atan2(mouseY - height / 2, mouseX - width / 2);

    socket.emit('playerInput', {
        keys: keys,
        turretAngle: turretAngle,
    });
}

function mousePressed() {
    // Handle UI interactions first
    if (uiManager && (!lobbyCode || !level || !level[0] || !gameInitialized)) {
        uiManager.handleMousePressed();
        return;
    }

    // Game shooting
    if (lobbyCode && myTank && !myTank.isDead) {
        socket.emit('fireBullet', { angle: myTank.turretAngle });
    }
}

function mouseReleased() {
    if (uiManager) {
        uiManager.handleMouseReleased();
    }
}

function mouseMoved() {
    if (uiManager) {
        uiManager.handleMouseMoved();
    }
}

function mouseDragged() {
    if (myTank && myTank.name === 'jeric') {
        socket.emit('fireLaser');
    }
}

function keyPressed() {
    // Handle UI key events first
    if (uiManager && (!lobbyCode || !level || !level[0] || !gameInitialized)) {
        const handled = uiManager.handleKeyPressed();
        if (handled === false) {
            return false; // UI handled the key, prevent default
        }
    }
    // Let other key events pass through for game controls
}

// Screen shake effect
function triggerScreenShake(intensity, duration) {
    shakeIntensity = intensity;
    shakeDuration = duration;
}

// Ping monitoring
function updatePing() {
    const startTime = Date.now();
    socket.emit('pingCheck', startTime);
}

setInterval(updatePing, 2000);

// Socket event handlers
socket.on('pingResponse', (startTime) => {
    const roundTripTime = Date.now() - startTime;
    pingHistory.push(roundTripTime);
    if (pingHistory.length > 10) pingHistory.shift();
    ping = pingHistory.reduce((a, b) => a + b, 0) / pingHistory.length;
});

socket.on('lobbyCreated', (data) => {
    console.log(`Lobby created! Code: ${data.lobbyCode}`);
    lobbyCode = data.lobbyCode;
    if (uiManager) uiManager.onLobbyCreated(data);
});

socket.on('lobbyJoined', (data) => {
    console.log(`Joined lobby: ${data.lobbyCode}`);
    lobbyCode = data.lobbyCode;
    if (uiManager) uiManager.onLobbyJoined(data);
});

socket.on('error', (err) => {
    console.error('Socket error:', err);
    if (uiManager) uiManager.onError(err);
});

socket.on('updatePlayers', (serverPlayers) => {
    players = serverPlayers;
});

socket.on('updateBullets', (serverBullets) => {
    bullets = serverBullets;
});

socket.on('updateLasers', (serverLasers) => {
    lasers = serverLasers;
});

socket.on('updateLevel', (data) => {
    level = data.level;
    levelNumber = data.levelNumber;
});

socket.on('explosion', (data) => {
    createExplosion(data.x, data.y, data.z, data.size);
});

socket.on('victory', () => {
    transitionMessage = "Victory!";
    if (uiManager) uiManager.onVictory();
});

socket.on('levelComplete', (data) => {
    transitionMessage = `Level ${data.levelNumber + 1} Complete!`;
    if (uiManager) uiManager.onLevelComplete(data);
});

socket.on('gameMode', (mode) => {
    gameMode = mode;
    transitionMessage = `Starting ${mode}!`;
    if (uiManager) uiManager.onGameModeChanged(mode);
});

socket.on('gameOver', () => {
    transitionMessage = "Game Over";
    if (uiManager) uiManager.onGameOver();
});

socket.on('transitionTimer', (data) => {
    gameState = "transition";
    transitionTimeLeft = data.secondsLeft;
});

socket.on('nextLevel', () => {
    gameState = "playing";
    transitionTimeLeft = null;
});

socket.on('updateDrops', (serverDrops) => {
    drops = serverDrops;
});

// Movement handling
setInterval(handleMovement, 1000 / 60);

// Utility functions
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

function drawTank(tank, isSelf) {
    const size = PLAYER_SIZE;
    push();
    translate(tank.x, tank.y, 0);
    rotateZ(tank.angle);

    if (tank.isAI) {
        fill(...tank.color);
    } else {
        fill(isSelf ? 'blue' : 'red');
    }

    if (!tank.isDead) {
        if (tank.tier === 'chest') {
            drawChest(tank);
        } else {
            stroke(0);
            strokeWeight(1);
            box(2 * size, 1.5 * size, size);
            box(1.8 * size, 1.7 * size, size * 0.8);

            push();
            rotateZ(PI / 2 + tank.turretAngle - tank.angle);
            translate(0, 0, size);
            box(size, 1.15 * size, size);
            noStroke();

            // Draw barrel based on tank tier
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
                default:
                    if (tank.multiShot > 0) {
                        const barrels = tank.multiShot;
                        const dAngle = PI / 11;
                        push();
                        rotate(-dAngle * (barrels - 1) / 2);
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
        }
    } else {
        // Dead tank display
        push();
        translate(0, 0, -24);
        const s = PLAYER_SIZE;
        rotateZ(PI / 4);
        rectMode(CENTER);
        noStroke();
        rect(0, 0, s, s / 4);
        rotateZ(PI / 2);
        rect(0, 0, s, s / 4);
        pop();
    }
    pop();

    // Add dust trails for moving tanks
    if (!tank.isDead && tank.speed > 0) {
        for (let i = 0; i < 2; i++) {
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
    if (!tank.isAI || tank.tier === 'button') {
        push();
        translate(tank.x, tank.y, PLAYER_SIZE * 2.5);
        rotateX(atan2(tank.y - camY, camZ));
        textAlign(CENTER, CENTER);
        textSize(16);
        fill(255);
        stroke(0);
        strokeWeight(1);
        textFont(font);
        text(tank.name || "Player", 0, 0);
        pop();
    }

    // Draw shield effect
    if (tank.shield) {
        push();
        translate(tank.x, tank.y, PLAYER_SIZE);
        fill(50, 100, 255, 100);
        noStroke();
        sphere(PLAYER_SIZE * 1.6);

        rotateX(atan2(tank.y - camY, camZ));
        textAlign(CENTER, CENTER);
        textSize(16);
        if (tank.buffs && tank.buffs.shield) {
            text(tank.buffs.shield + 1, PLAYER_SIZE * 1.6 + 20, 0);
        }
        pop();
    }

    function drawBarrel(x) {
        push();
        translate(x, -size / 2, 0);

        // Barrel outline for depth effect
        push();
        const cameraPos = createVector(camX, camY, camZ);
        const angle = tank.turretAngle;
        const barrelX = tank.x + (1.5 * size) * Math.cos(angle);
        const barrelY = tank.y + (1.5 * size) * Math.sin(angle);
        const barrelZ = size;
        const barrelPos = createVector(barrelX, barrelY, barrelZ);
        let viewDirection = p5.Vector.sub(cameraPos, barrelPos).normalize();
        let offset = viewDirection.mult(-2);
        rotateZ(-(PI / 2 + tank.turretAngle));
        translate(offset.x, offset.y, offset.z);
        rotateZ(PI / 2 + tank.turretAngle);

        fill(0); // Black outline
        cylinder(0.15 * size + 1, 1.5 * size);
        pop();

        // Main barrel
        if (tank.isAI) {
            fill(...tank.color);
        } else {
            fill(isSelf ? 'blue' : 'red');
        }

        cylinder(0.15 * size, 1.5 * size);

        // Barrel tip
        push();
        translate(0, -3 / 4 * size, 0);

        // Tip outline
        push();
        const barrelTipX = tank.x + (1.5 * size) * Math.cos(tank.turretAngle);
        const barrelTipY = tank.y - 5 / 4 * size + (1.5 * size) * Math.sin(tank.turretAngle);
        const barrelTipZ = size;
        const barrelTipPos = createVector(barrelTipX, barrelTipY, barrelTipZ);
        viewDirection = p5.Vector.sub(cameraPos, barrelTipPos).normalize();
        offset = viewDirection.mult(-2);
        rotateZ(-(PI / 2 + tank.turretAngle));
        translate(offset.x, offset.y, offset.z);
        rotateZ(PI / 2 + tank.turretAngle);

        fill(0); // Black outline
        cylinder(0.20 * size + 1, 0.20 * size + 1.9);

        if (tank.isAI) {
            fill(...tank.color);
        } else {
            fill(isSelf ? 'blue' : 'red');
        }

        cylinder(0.05 * size + 1, 0.20 * size + 2);
        pop();

        cylinder(0.20 * size);
        pop();
        pop();
    }
}

function drawChest(tank) {
    const size = TILE_SIZE / 2;
    stroke(0);
    strokeWeight(2);
    fill(120, 50, 0);
    box(1.5 * size + 2, size + 2, size + 1);

    push();
    translate(0, 0, size / 2);
    rotateZ(PI / 2);

    noStroke();
    fill(130, 50, 10);
    cylinder(size / 2, 1.5 * size);
    pop();

    translate(0, 0.5 * size, size / 2);
    fill(160, 100, 50);
    box(size / 5, size / 5, size / 3);
}

function drawWalls2() {
    if (!level.length) return;

    for (let row = 0; row < level.length; row++) {
        for (let col = 0; col < level[row].length; col++) {
            const wallHeight = level[row][col];
            const height = wallHeight * WALL_HEIGHT;
            if (wallHeight > 0) {
                push();
                const wallX = col * TILE_SIZE + TILE_SIZE / 2;
                const wallY = row * TILE_SIZE + TILE_SIZE / 2;
                translate(wallX, wallY, height / 2 - 25);
                fill(120, 80, 40);
                stroke(0);
                strokeWeight(1);
                noStroke();
                box(TILE_SIZE, TILE_SIZE, height);
                pop();
            }
        }
    }
}

function drawBullets() {
    bullets.forEach((bullet) => {
        push();
        translate(bullet.x, bullet.y, PLAYER_SIZE * 1.4 - BULLET_SIZE);

        // Bullet outline
        noStroke();
        push();
        const cameraPos = createVector(camX, camY, camZ);
        const bulletPos = createVector(bullet.x, bullet.y, PLAYER_SIZE * 1.4 - BULLET_SIZE);
        const viewDirection = p5.Vector.sub(cameraPos, bulletPos).normalize();
        const offset = viewDirection.mult(-2);
        translate(offset.x, offset.y, offset.z);

        fill(0);
        sphere(BULLET_SIZE + 1);

        if (bullet.owner && players[bullet.owner] && players[bullet.owner].isAI) {
            fill(255, 0, 0, 100);
            translate(offset.x, offset.y, offset.z);
            sphere(BULLET_SIZE + 2);
        }
        pop();

        // Main bullet
        fill(150);
        sphere(BULLET_SIZE);
        pop();

        // Add bullet trails
        if (frameCount % 1 == 0) {
            trails.push({
                x: bullet.x,
                y: bullet.y,
                z: PLAYER_SIZE * 1.4 - BULLET_SIZE,
                size: BULLET_SIZE,
                dSize: BULLET_SIZE / 15,
                alpha: 108,
            });
        }
    });
}

function drawLasers() {
    lasers.forEach(laser => {
        push();
        const dx = laser.x2 - laser.x1;
        const dy = laser.y2 - laser.y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = atan2(dy, dx) + PI / 2;
        translate((laser.x1 + laser.x2) / 2, (laser.y1 + laser.y2) / 2, PLAYER_SIZE * 1.4 - BULLET_SIZE);
        rotateZ(angle);

        let r = PLAYER_SIZE / 2;
        if (laser.isActive) {
            fill(255, 50, 0);
            if (frameCount % 5 == 0) {
                createExplosion(laser.x1 + random(-r, r), laser.y1 + random(-r, r), PLAYER_SIZE * 1.4 - BULLET_SIZE + random(-r, r), BULLET_SIZE);
                createExplosion(laser.x2 + random(-r, r), laser.y2 + random(-r, r), PLAYER_SIZE * 1.4 - BULLET_SIZE + random(-r, r), BULLET_SIZE);
            }
        } else {
            fill(150);
            if (frameCount % 10 == 0) {
                trails.push({
                    x: laser.x1 + random(-r, r),
                    y: laser.y1 + random(-r, r),
                    z: PLAYER_SIZE * 1.4 - BULLET_SIZE + random(-r, r),
                    size: BULLET_SIZE,
                    dSize: BULLET_SIZE / 10,
                    alpha: 108,
                });
            }
        }

        noStroke();
        cylinder(2, len);
        pop();
    });
}

function drawExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];

        push();
        translate(explosion.x, explosion.y, explosion.z);

        const lightIntensity = explosion.alpha / 255 * 150 + random(-20, 20);
        pointLight(255, 150, 0, explosion.x, explosion.y, explosion.z + explosion.size);
        ambientLight(lightIntensity, lightIntensity / 2, 0);

        noStroke();
        const colorShift = map(explosion.alpha, 255, 0, 1, 0);
        fill(255, 150 * colorShift, 0, explosion.alpha);
        sphere(explosion.size);

        fill(255, 100, 0, explosion.alpha / 2);
        sphere(explosion.size * 1.5);

        push();
        rotateX(HALF_PI);
        fill(255, 100, 0, explosion.alpha / 3);
        noStroke();
        ellipse(0, 0, explosion.size * 4, explosion.size * 2);
        pop();

        // Update particles
        for (let j = 0; j < explosion.particles.length; j++) {
            const particle = explosion.particles[j];
            push();
            translate(particle.x, particle.y, particle.z);
            fill(255, random(150, 250), 0, particle.alpha);
            noStroke();
            sphere(particle.size);
            pop();

            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.z += particle.vz;
            particle.alpha -= 10;
            particle.size *= 0.9;

            if (particle.alpha <= 0) {
                explosion.particles.splice(j, 1);
                j--;
            }
        }

        pop();

        explosion.size += explosion.dSize;
        explosion.alpha -= Math.ceil(explosion.alpha / 4);

        if (explosion.alpha <= 0 && explosion.particles.length === 0) {
            explosions.splice(i, 1);
        }
    }
}

function createExplosion(x, y, z, size) {
    const particles = [];
    for (let i = 0; i < 20; i++) {
        const angle = random(TWO_PI);
        const speed = random(size / 4, size / 2);
        const vx = speed * cos(angle);
        const vy = speed * sin(angle);
        const vz = random(-1, 1);
        particles.push({
            x: 0, y: 0, z: 0,
            vx: vx, vy: vy, vz: vz,
            alpha: 255,
            size: random(2, 5),
        });
    }

    explosions.push({
        x: x, y: y, z: z,
        size: size,
        dSize: size / 10,
        alpha: 255,
        particles: particles,
    });
}

function drawTrails() {
    for (let i = trails.length - 1; i >= 0; i--) {
        const trail = trails[i];

        push();
        translate(trail.x, trail.y, trail.z);
        noStroke();
        fill(100, trail.alpha);
        sphere(trail.size);
        pop();

        trail.size -= trail.dSize;
        trail.alpha -= 9;

        if (trail.alpha <= 0) {
            trails.splice(i, 1);
        }
    }
}

function drawDrops() {
    drops.forEach((drop) => {
        const { x, y, buff } = drop;

        push();
        translate(x, y, TILE_SIZE / 4);
        const angle = frameCount / 45;
        rotateZ(angle);
        drawDrop(x, y, angle, buff);
        pop();
    });
}

function drawTopLeftPanel() {
    const x = -width / 2 + 150;
    const y = -height / 2 + 100;

    // Dark background with border
    fill(0, 0, 0, 180);
    stroke(255, 193, 7);
    strokeWeight(1);
    rect(x, y, 150, 60, 5);
    fill(255);
    noStroke();
    textAlign(LEFT, TOP);
    textFont(font);
    textSize(10);

    let textY = y + 5;
    if (lobbyCode) {
        fill(255, 193, 7);
        text(`Lobby: ${lobbyCode}`, x + 5, textY);
        textY += 12;
    }

    fill(255);
    text(`Ping: ${Math.round(ping)}ms`, x + 5, textY);
    textY += 12;
    text(`Mode: ${gameMode}`, x + 5, textY);

    if (levelNumber >= 0) {
        textY += 12;
        text(`Level: ${levelNumber + 1}`, x + 5, textY);
    }
}

function drawTopRightPanel() {
    if (!myTank) return;

    // Use working coordinates with proper styling
    const x = width / 2 - 300;
    const y = -height / 2 + 100;

    // Dark background with colored border
    fill(0, 0, 0, 180);
    stroke(myTank.isDead ? color(255, 100, 100) : color(100, 255, 100));
    strokeWeight(2);
    rect(x, y, 150, 60, 5);

    // White text
    fill(255);
    noStroke();
    textAlign(LEFT, TOP);
    textFont(font);
    textSize(10);

    let textY = y + 5;
    text(`${(myTank.name || 'Player').substring(0, 10)}`, x + 5, textY);
    textY += 12;

    if (myTank.isDead) {
        fill(255, 100, 100);
        text("DEAD", x + 5, textY);
    } else {
        fill(100, 255, 100);
        text(myTank.shield ? "SHIELDED" : "ALIVE", x + 5, textY);
    }
    textY += 12;

    // Controls hint
    fill(150);
    textSize(9);
    text("WASD + Mouse", x + 5, textY);
}