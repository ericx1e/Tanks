let players = {};
let myTank = null;
let bullets = [];
let level = [];
let levelNumber = -1;
let explosions = [];
let trails = [];
let woodTexture;

let camX;
let camY;
let camZ;

let shakeIntensity = 0;
let shakeDuration = 0;

let lobbyCode = null;

let gameState = "playing"; // Other states: "transition", "waiting"
let transitionTimer = 0;
let transitionMessage = '';

function preload() {
    woodTexture = loadImage('assets/wood-texture.jpg'); // Load texture for walls
    font = loadFont('assets/Roboto-Regular.ttf'); // Load the font
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

socket.on('levelComplete', () => {
    transitionMessage = "Level Complete!";
})

socket.on('gameOver', () => {
    transitionMessage = "Game Over";
})

socket.on('transitionTimer', (data) => {
    gameState = "transition";
    transitionTimeLeft = data.secondsLeft; // Update the countdown
});

socket.on('nextLevel', () => {
    socket.emit('createPlayer')
    gameState = "playing";
    transitionTimeLeft = null;
});


function setup() {
    createCanvas(800, 600, WEBGL);

    // nameInput = createInput("Player");
    // nameInput.position(10, height + 20); // Position it at the bottom-left
    // nameInput.style("width", "150px");
    // nameInput.input(() => {
    //     playerName = nameInput.value(); // Update local player name
    //     socket.emit("setName", playerName); // Send name to the server
    // });


    // Receive the updated players object from the server
    frameRate(60);
    fogLayer = createGraphics(width, height);
    // fogLayer.clear();
}

function draw() {
    background(200);
    lights()

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
    fill(180, 150, 100); // Ground color
    translate(gridWidth / 2, gridHeight / 2, -25); // Center ground at (0, 0)
    noStroke();
    plane(gridWidth, gridHeight); // Ground dimensions
    if (levelNumber == 0) {
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
    drawWalls();

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
    if (myTank && myTank.isDead) {
        // Find the first living player to spectate
        targetTank = Object.values(players).find(player => !player.isDead && !player.isAI);
        if (!targetTank) {
            // If no living players, stop camera movement or use a default position
            targetTank = { x: 0, y: 0 };
        }
    }

    // Set up camera
    camX = targetTank.x;
    camY = targetTank.y + 200; // ORIGINAL: + 200
    camZ = 700; // ORIGINAL: 700
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

    drawExplosions();

    drawTrails();

    if (isFogOfWar) {
        const maxDistance = TILE_SIZE * 5; // Vision range
        const resolution = PI / 150; // Fine angular step for smoother vision
        // const visiblePoints = calculateVision(targetTank.x, targetTank.y, level, maxDistance, resolution);
        const visiblePoints = calculateSharedVision(players, level, maxDistance, resolution);
        // const visiblePoints = calculateLimitedVision(myTank.x, myTank.y, myTank.turretAngle, Math.PI / 4, level, maxDistance, resolution);

        drawSharedFogOfWar(targetTank.x, targetTank.y, visiblePoints);
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

// handleMovement();

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
            default:
                drawBarrel(0)
                break;
        }

        pop();
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

    if (!tank.isDead) {
        // if (Math.abs(tank.vx) > 0.1 || Math.abs(tank.vy) > 0.1) {
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
    // }


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

function drawWalls() {
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
                translate(wallX, wallY, height / 2);
                fill(120, 80, 40); // Wall color
                box(TILE_SIZE, TILE_SIZE, wallHeight * WALL_HEIGHT); // Wall dimensions
                pop();
            }
        }
    }
}

// Render explosions

// function drawExplosions() {
//     for (let i = explosions.length - 1; i >= 0; i--) {
//         const explosion = explosions[i];

//         // Emit light from the explosion
//         push();
//         translate(explosion.x, explosion.y, explosion.z);

//         // Simulate explosion light
//         const lightIntensity = explosion.alpha / 255 * 150; // Scale light intensity with alpha
//         pointLight(255, 150, 0, explosion.x, explosion.y, explosion.z + explosion.size); // Orange light
//         ambientLight(lightIntensity, lightIntensity / 2, 0); // Add ambient light

//         // Draw the explosion sphere
//         noStroke();
//         fill(255, explosion.alpha, 0, explosion.alpha); // Orange with fading alpha
//         sphere(explosion.size); // Expanding sphere
//         pop();

//         // Update explosion properties
//         explosion.size += explosion.dSize; // Increase size
//         explosion.alpha -= Math.ceil(explosion.alpha / 4); // Fade out

//         // Remove explosion when fully faded
//         if (explosion.alpha <= 0) {
//             explosions.splice(i, 1);
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
    // Emit a fire event to the server when the mouse is clicked
    socket.emit('fireBullet', { angle: myTank.turretAngle });
    // return false;
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

        fill(0); // Semi-transparent black for the outline
        sphere(BULLET_SIZE + 1); // Slightly larger sphere for the outline
        pop();
        // Draw bullet
        fill(150);
        sphere(BULLET_SIZE); // Render bullet as a sphere
        pop();

        trails.push({
            x: bullet.x,
            y: bullet.y,
            z: PLAYER_SIZE * 1.4 - BULLET_SIZE, // Initial explosion height
            size: BULLET_SIZE, // Initial explosion size
            dSize: BULLET_SIZE / 15,
            alpha: 108, // Initial opacity
        })
    });
}