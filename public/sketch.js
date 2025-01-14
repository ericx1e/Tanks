let players = {};
let myTank = null;
let bullets = [];
let lasers = [];
let level = [];
let levelNumber = -1;
let explosions = [];
let trails = [];
let woodTexture;
let drops = []; // Store active drops
// let drops = [{ x: 200, y: 200, buff: 'speed' }, { x: 250, y: 200, buff: 'fireRate' }, { x: 300, y: 200, buff: 'bulletSpeed' }, { x: 350, y: 200, buff: 'shield' }, { x: 400, y: 200, buff: 'multiShot' }, { x: 450, y: 200, buff: 'bulletBounces' }]; // test drop
let buffs = [];

let camX;
let camY;
let camZ;

let shakeIntensity = 0;
let shakeDuration = 0;

let lobbyCode = null;

let gameState = "playing"; // Other states: "transition", "waiting"
let transitionTimer = 0;
let transitionMessage = '';
let gameMode = 'lobby';

let VIEWPORT_WIDTH = 800; // Match canvas width
let VIEWPORT_HEIGHT = 600; // Match canvas height

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

function preload() {
    woodTexture = loadImage('public/assets/wood-texture.jpg'); // Load texture for walls
    font = loadFont('public/assets/Roboto-Regular.ttf'); // Load the font
}

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
    level = data.level; // Store the level received from the server
    levelNumber = data.levelNumber;
});

socket.on('explosion', (data) => {
    createExplosion(data.x, data.y, data.z, data.size)
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
    transitionTimeLeft = data.secondsLeft; // Update the countdown
});

socket.on('nextLevel', () => {
    // socket.emit('createPlayer')
    gameState = "playing";
    transitionTimeLeft = null;
});

socket.on('arenaMode', () => {

});

socket.on('updateDrops', (serverDrops) => {
    drops = serverDrops;
});

socket.on('laserFired', (laserData) => {
    const { x, y, angle, range, width } = laserData;

    // Draw the laser on the canvas
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.fillRect(0, -width / 2, range, width);
    ctx.restore();
});


function setup() {
    // createCanvas(1200, 800, WEBGL);
    let canvas = createCanvas(0.9 * window.innerWidth, 0.9 * window.innerHeight, WEBGL);
    canvas.position((window.innerWidth - width) / 2, (window.innerHeight - height) / 2);
    // createCanvas

    frameRate(60);
    fogLayer = createGraphics(width, height);
    // fogLayer.clear();
}

function draw() {
    background(51);
    lights();
    directionalLight(80, 80, 80, 1, 1, -1)
    directionalLight(80, 80, 80, 1, -1, -1)

    if (gameState === "transition") {
        drawTransitionScreen();
        return;
    }

    if (!level || !level[0] || !lobbyCode) {
        textFont(font);
        textAlign(CENTER, CENTER);
        textSize(width / 20);
        fill(0);
        text("Create or Join a Lobby", 0, 0);
        return
    }

    // Draw ground

    const gridWidth = level[0].length * TILE_SIZE; // Width of the ground
    const gridHeight = level.length * TILE_SIZE; // Height of the ground

    push();
    fill(150, 120, 70); // Ground color
    translate(gridWidth / 2, gridHeight / 2, -25); // Center ground at (0, 0)
    noStroke();
    plane(gridWidth, gridHeight); // Ground dimensions
    if (gameMode === 'lobby') {
        push()
        translate(0, 0, 1)
        textSize(TILE_SIZE);
        // rotateX(PI / 2);
        textFont(font);
        fill(255);
        noStroke();
        text(`Lobby ${lobbyCode}`, 0, 0)
        pop()
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

    // Define the viewing volume for the orthogonal camera
    // const left = -width / 2;
    // const right = width / 2;
    // const bottom = -height / 2;
    // const top = height / 2;
    // // const near = -1000; // Farther away from the camera
    // // const far = 10000; // Closer to the camera

    // // Set orthogonal projection
    // ortho(left, right, bottom, top);

    if (!myTank) {
        return;
    }

    let targetTank = myTank;
    let allDead = false;
    if (myTank && myTank.isDead) {
        // Find the first living player to spectate
        targetTank = Object.values(players).find(player => !player.isDead && !player.isAI);
        if (!targetTank) {
            // If no living players, stop camera movement or use a default position
            allDead = true;
            targetTank = myTank;
        }
    }

    // Set up camera
    camX = targetTank.x;
    camY = targetTank.y + 200;
    camZ = 600; // ORIGINAL: 700
    let targetX = targetTank.x;
    let targetY = targetTank.y;
    let targetZ = 0;

    let offsetX = 0;
    let offsetY = 0;
    let offsetZ = 0;

    if (shakeDuration > 0) {
        offsetX = random(-shakeIntensity, shakeIntensity);
        offsetY = random(-shakeIntensity, shakeIntensity);
        offsetZ = random(-shakeIntensity, shakeIntensity / 2); // Subtle Z-axis shake

        shakeDuration--;
        if (shakeDuration <= 0) {
            shakeIntensity = 0; // Reset intensity
        }
    }

    camera(camX + offsetX, camY + offsetY, camZ + offsetZ, targetX, targetY, targetZ, 0, 1, 0);

    // camera(camX, camY, camZ, targetX, targetY, targetZ, 0, 1, 0);

    // Draw bullets
    drawBullets();

    drawLasers();

    drawExplosions();

    drawTrails();

    if (isFogOfWar && !allDead) {
        const resolution = PI / 150;
        // const visiblePoints = calculateVision(targetTank.x, targetTank.y, level, maxDistance, resolution);
        if (gameMode == 'lobby') {
            const maxDistance = TILE_SIZE * 100;
            const visiblePoints = calculateVision(targetTank.x, targetTank.y, level, targetTank.visionDistance, resolution);
            drawFogOfWar(targetTank.x, targetTank.y, visiblePoints);
        } else if (gameMode == 'arena') {
            const maxDistance = TILE_SIZE * 7;
            const visiblePoints = calculateVision(targetTank.x, targetTank.y, level, targetTank.visionDistance, resolution);
            drawFogOfWar(targetTank.x, targetTank.y, visiblePoints);
        } else {
            const maxDistance = TILE_SIZE * 5;
            const visiblePoints = calculateSharedVision(players, level, resolution);
            drawSharedFogOfWar(targetTank.x, targetTank.y, visiblePoints);
        }
        // const visiblePoints = calculateLimitedVision(myTank.x, myTank.y, myTank.turretAngle, Math.PI / 4, level, maxDistance, resolution);

    }

    // drawUI();
}

function triggerScreenShake(intensity, duration) {
    shakeIntensity = intensity;
    shakeDuration = duration;
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

function drawTank(tank, isSelf) {
    const size = PLAYER_SIZE;
    push();
    // Tank base (lower box)
    translate(tank.x, tank.y, 0); // Position tank
    rotateZ(tank.angle); // Rotate tank base

    if (tank.isAI) {
        fill(...tank.color); // AI tank color
    } else {
        fill(isSelf ? 'blue' : 'red'); // Differentiate self vs others
    }

    if (!tank.isDead) {

        if (tank.tier === 'chest') {
            drawChest(tank);
        } else {
            stroke(0)
            strokeWeight(1)
            box(2 * size, 1.5 * size, size); // Tank base dimensions
            box(1.8 * size, 1.7 * size, size * 0.8); // Treads

            push();
            rotateZ(PI / 2 + tank.turretAngle - tank.angle); // Rotate turret independently
            translate(0, 0, size);
            box(size, 1.15 * size, size); // Slightly smaller box
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

    if (tank.shield) {
        push();
        translate(tank.x, tank.y, PLAYER_SIZE);
        fill(50, 100, 255, 100);
        noStroke();
        sphere(PLAYER_SIZE * 1.6);
        pop()
    }


    // Draw nametag
    if (!tank.isAI || tank.tier === 'button') {
        push();
        translate(tank.x, tank.y, PLAYER_SIZE * 2.5); // Position above the tank
        // rotateX(-HALF_PI);
        rotateX(atan2(tank.y - camY, camZ))
        textAlign(CENTER, CENTER);
        textSize(16);
        fill(255);
        stroke(0);
        strokeWeight(1);
        textFont(font);
        text(tank.name || "Player", 0, 0); // Show the name, default to "Player"
        pop();
    }


    function drawBarrel(x) {
        push();
        translate(x, -size / 2, 0)

        push();
        const cameraPos = createVector(camX, camY, camZ); // Camera position
        const angle = tank.turretAngle;
        const barrelX = tank.x + (1.5 * size) * Math.cos(angle);
        const barrelY = tank.y + (1.5 * size) * Math.sin(angle);
        const barrelZ = size; // Height of the barrel
        const barrelPos = createVector(barrelX, barrelY, barrelZ);
        let viewDirection = p5.Vector.sub(cameraPos, barrelPos).normalize(); // Direction from bullet to camera
        // Offset the outline behind the bullet
        let offset = viewDirection.mult(-2); // Move slightly behind the bullet
        rotateZ(-(PI / 2 + tank.turretAngle));
        translate(offset.x, offset.y, offset.z); // Apply the offset
        rotateZ(PI / 2 + tank.turretAngle);

        fill(0); // Semi-transparent black for the outline
        cylinder(0.15 * size + 1, 1.5 * size);

        pop();

        cylinder(0.15 * size, 1.5 * size);

        push();
        translate(0, -3 / 4 * size, 0)

        push();
        const barrelTipX = tank.x + (1.5 * size) * Math.cos(tank.turretAngle);
        const barrelTipY = tank.y - 5 / 4 * size + (1.5 * size) * Math.sin(tank.turretAngle);
        const barrelTipZ = size; // Height of the barrel
        const barrelTipPos = createVector(barrelTipX, barrelTipY, barrelTipZ);
        viewDirection = p5.Vector.sub(cameraPos, barrelTipPos).normalize(); // Direction from bullet to camera
        // Offset the outline behind the bullet
        offset = viewDirection.mult(-2); // Move slightly behind the bullet
        rotateZ(-(PI / 2 + tank.turretAngle));
        translate(offset.x, offset.y, offset.z); // Apply the offset
        rotateZ(PI / 2 + tank.turretAngle);

        fill(0); // Semi-transparent black for the outline
        cylinder(0.20 * size + 1, 0.20 * size + 1.9);

        if (tank.isAI) {
            fill(...tank.color); // AI tank color
        } else {
            fill(isSelf ? 'blue' : 'red'); // Differentiate self vs others
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
    translate(0, 0, size / 2)
    rotateZ(PI / 2);

    push();
    const angle = tank.angle + PI / 2;
    const cameraPos = createVector(camX, camY, camZ); // Camera position
    const barrelX = tank.x;
    const barrelY = tank.y;
    const barrelZ = tank.z + size / 2; // Height of the barrel
    const barrelPos = createVector(barrelX, barrelY, barrelZ);
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

function drawWalls() {
    if (!level.length) return; // Ensure the level array is defined

    const groupedWalls = [];
    const rows = level.length;
    const cols = level[0].length;
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));

    // Group wall segments
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (level[row][col] > 0 && !visited[row][col]) {
                // Find horizontal segment
                let width = 1;
                while (
                    col + width < cols &&
                    level[row][col + width] > 0 &&
                    !visited[row][col + width]
                ) {
                    width++;
                }

                // Check if it's part of a vertical block
                let height = 1;
                let isRectangle = true;
                while (row + height < rows) {
                    for (let c = col; c < col + width; c++) {
                        if (level[row + height][c] === 0 || visited[row + height][c]) {
                            isRectangle = false;
                            break;
                        }
                    }
                    if (!isRectangle) break;
                    height++;
                }

                // Mark the entire group as visited
                for (let r = row; r < row + height; r++) {
                    for (let c = col; c < col + width; c++) {
                        visited[r][c] = true;
                    }
                }

                // Store the grouped wall segment
                groupedWalls.push({
                    x: col * TILE_SIZE,
                    y: row * TILE_SIZE,
                    width: width * TILE_SIZE,
                    height: height * TILE_SIZE,
                    wallHeight: level[row][col] * WALL_HEIGHT, // Use the first tile's height for the entire block
                });
            }
        }
    }

    // Render grouped wall segments
    for (const wall of groupedWalls) {
        push();
        translate(
            wall.x + wall.width / 2,
            wall.y + wall.height / 2,
            wall.wallHeight / 2
        ); // Center of the wall block
        fill(120, 80, 40); // Wall color
        stroke(0); // Outline color
        strokeWeight(1);
        box(wall.width, wall.height, wall.wallHeight); // Render as a single box
        pop();
    }
}


function drawWalls2() {
    if (!level.length) return; // Ensure the level array is defined

    for (let row = 0; row < level.length; row++) {
        for (let col = 0; col < level[row].length; col++) {
            const wallHeight = level[row][col];
            const height = wallHeight * WALL_HEIGHT;
            if (wallHeight > 0) {
                push();

                // Calculate wall position relative to (0, 0)
                const wallX = col * TILE_SIZE + TILE_SIZE / 2;
                const wallY = row * TILE_SIZE + TILE_SIZE / 2;

                // Move to position and render wall
                translate(wallX, wallY, height / 2 - 25);
                fill(120, 80, 40); // Wall color
                stroke(0); // Outline color
                strokeWeight(1);
                noStroke(); // Stroke causes lines to blled through fog of war, not sure why
                box(TILE_SIZE, TILE_SIZE, height);
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


function drawExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];

        push();
        translate(explosion.x, explosion.y, explosion.z);

        // Simulate explosion light
        const lightIntensity = explosion.alpha / 255 * 150 + random(-20, 20);  // Scale light intensity with alpha
        pointLight(255, 150, 0, explosion.x, explosion.y, explosion.z + explosion.size); // Orange light
        ambientLight(lightIntensity, lightIntensity / 2, 0); // Add ambient light

        // Draw the main explosion sphere
        noStroke();
        const colorShift = map(explosion.alpha, 255, 0, 1, 0); // Shift color from yellow to red
        fill(255, 150 * colorShift, 0, explosion.alpha); // Transition color
        sphere(explosion.size); // Expanding sphere

        // Glow effect
        fill(255, 100, 0, explosion.alpha / 2); // Semi-transparent glow
        sphere(explosion.size * 1.5); // Larger glow sphere

        // Shockwave
        push();
        rotateX(HALF_PI); // Orient the shockwave on the ground plane
        fill(255, 100, 0, explosion.alpha / 3); // Semi-transparent ring
        noStroke();
        ellipse(0, 0, explosion.size * 4, explosion.size * 2); // Expanding ellipse
        pop();

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

        // Remove explosion when fully faded
        if (explosion.alpha <= 0 && explosion.particles.length === 0) {
            explosions.splice(i, 1);
        }
    }
}

// Function to create an explosion with particles
function createExplosion(x, y, z, size) {
    // triggerScreenShake(size, 20);
    const particles = [];
    for (let i = 0; i < 20; i++) { // Number of particles
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

function drawDrops() {
    drops.forEach((drop) => {
        const { x, y, buff } = drop;

        push();
        translate(x, y, TILE_SIZE / 4);
        const angle = frameCount / 45;
        rotateZ(angle);

        // TODO: Custom icons
        drawDrop(x, y, angle, buff);
        pop();
    });
}

function drawUI() {
    push()
    translate(myTank.x, myTank.y, 0)
    const angle = - PI / 2 + atan2(camZ, camY - myTank.y)
    translate(0, 0 * sin(angle), 100)
    rotateX(angle)
    push()
    // translate(-width / 2, -height / 2)
    fill(255);
    noStroke();
    textAlign(LEFT, TOP);
    textFont(font)
    text("HELLO", mouseX, 0)
    pop()
    pop()
}

function handleMovement() {
    if (!myTank) return;

    const keys = {
        w: keyIsDown(87), // W key
        a: keyIsDown(65), // A key
        s: keyIsDown(83), // S key
        d: keyIsDown(68), // D key
    };

    const turretAngle = atan2(mouseY - height / 2, mouseX - width / 2);

    // Emit the movement input to the server
    socket.emit('playerInput', {
        keys: keys,
        turretAngle: turretAngle,
    });
}

function handleTankMovement() {
    let dx = 0;
    let dy = 0;
    const speed = 2;
    let angleChange = 0;

    // Capture directional input
    if (keyIsDown(87)) { // W key (move forward)
        dx += Math.cos(myTank.angle) * speed;
        dy += Math.sin(myTank.angle) * speed;
    }
    if (keyIsDown(83)) { // S key (move backward)
        dx -= Math.cos(myTank.angle) * speed;
        dy -= Math.sin(myTank.angle) * speed;
    }

    // Capture rotational input
    if (keyIsDown(65)) { // A key (rotate left)
        angleChange -= 0.05;
    }
    if (keyIsDown(68)) { // D key (rotate right)
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
    if (!lobbyCode) return
    socket.emit('fireBullet', { angle: myTank.turretAngle });
    // socket.emit('fireBullet', { angle: myTank.turretAngle - PI / 11 });
    // socket.emit('fireBullet', { angle: myTank.turretAngle + PI / 11 });
    // return false;
}

function mouseDragged() {
    if (myTank && myTank.name === 'jeric') {
        socket.emit('fireLaser')
    }
}

function drawBullets() {
    bullets.forEach((bullet) => {
        push();
        translate(bullet.x, bullet.y, PLAYER_SIZE * 1.4 - BULLET_SIZE);

        // Draw bullet outline
        noStroke();
        push();
        const cameraPos = createVector(camX, camY, camZ); // Camera position
        const bulletPos = createVector(bullet.x, bullet.y, PLAYER_SIZE * 1.4 - BULLET_SIZE); // Bullet position
        const viewDirection = p5.Vector.sub(cameraPos, bulletPos).normalize(); // Direction from bullet to camera

        // Offset the outline behind the bullet
        const offset = viewDirection.mult(-2); // Move slightly behind the bullet
        translate(offset.x, offset.y, offset.z); // Apply the offset


        fill(0);
        sphere(BULLET_SIZE + 1); // Slightly larger sphere for the outline

        if (bullet.owner && players[bullet.owner] && players[bullet.owner].isAI) {
            fill(255, 0, 0, 100);
            translate(offset.x, offset.y, offset.z); // Red outline for enemy bullets
            sphere(BULLET_SIZE + 2); // Slightly larger sphere for the outline
        }

        pop();
        // Draw bullet
        fill(150);
        sphere(BULLET_SIZE); // Render bullet as a sphere
        pop();

        if (frameCount % 1 == 0) {
            trails.push({
                x: bullet.x,
                y: bullet.y,
                z: PLAYER_SIZE * 1.4 - BULLET_SIZE, // Initial explosion height
                size: BULLET_SIZE, // Initial explosion size
                dSize: BULLET_SIZE / 15,
                alpha: 108, // Initial opacity
            })
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
        rotateZ(angle)
        let r = PLAYER_SIZE / 2
        if (laser.isActive) {
            // stroke(laser.color[0], laser.color[1], laser.color[2]);
            fill(255, 50, 0);
            if (frameCount % 5 == 0) {
                createExplosion(laser.x1 + random(-r, r), laser.y1 + random(-r, r), PLAYER_SIZE * 1.4 - BULLET_SIZE + random(-r, r), BULLET_SIZE);
                createExplosion(laser.x2 + random(-r, r), laser.y2 + random(-r, r), PLAYER_SIZE * 1.4 - BULLET_SIZE + random(-r, r), BULLET_SIZE);
            }
        } else {
            // stroke(150);
            fill(150);

            if (frameCount % 10 == 0) {
                trails.push({
                    x: laser.x1 + random(-r, r),
                    y: laser.y1 + random(-r, r),
                    z: PLAYER_SIZE * 1.4 - BULLET_SIZE + random(-r, r), // Initial explosion height
                    size: BULLET_SIZE, // Initial explosion size
                    dSize: BULLET_SIZE / 10,
                    alpha: 108, // Initial opacity
                })
            }
        }
        // strokeWeight(3); // Adjust thickness
        noStroke();
        // line(laser.x1, laser.y1, laser.x2, laser.y2);
        cylinder(2, len)
        pop();
    });
}