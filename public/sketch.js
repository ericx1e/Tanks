let players = {};
let myTank = null;
let bullets = [];
let level = [];
let explosions = [];
let woodTexture;

let tileSize = 100;

let camX;
let camY;
let camZ;

function preload() {
    woodTexture = loadImage('assets/wood-texture.jpg'); // Load texture for walls
}

socket.on('updatePlayers', (serverPlayers) => {
    players = serverPlayers;
});

socket.on('updateBullets', (serverBullets) => {
    bullets = serverBullets;
});

socket.on('updateLevel', (serverLevel) => {
    level = serverLevel; // Store the level received from the server
});

socket.on('explosion', (data) => {
    explosions.push({
        x: data.x,
        y: data.y,
        z: data.z, // Initial explosion height
        size: data.size, // Initial explosion size
        dSize: data.dSize,
        alpha: 255, // Initial opacity
        isAI: false,
    });
});

function setup() {
    createCanvas(800, 600, WEBGL);

    // Receive the updated players object from the server
    frameRate(60);
}

function draw() {
    background(200);
    lights()

    // Draw ground

    const gridWidth = level[0].length * TILE_SIZE; // Width of the ground
    const gridHeight = level.length * TILE_SIZE; // Height of the ground

    push();
    fill(180, 150, 100); // Ground color
    translate(gridWidth / 2, gridHeight / 2, -25); // Center ground at (0, 0)
    noStroke();
    plane(gridWidth, gridHeight); // Ground dimensions
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


    // Set up camera
    camX = myTank.x;
    camY = myTank.y + 200;
    camZ = 700;
    let targetX = myTank.x;
    let targetY = myTank.y;
    let targetZ = 0;
    camera(camX, camY, camZ, targetX, targetY, targetZ, 0, 1, 0);

    // Draw bullets
    drawBullets();

    drawExplosions();


    // Handle movement
    handleMovement();

    // socket.emit('playerMove', myTank); // Send updated position to server
}

function drawTank(tank, isSelf) {
    push();
    // Tank base (lower box)
    translate(tank.x, tank.y, 0); // Position tank
    rotateZ(tank.angle); // Rotate tank base

    if (tank.isAI) {
        fill(200, 100, 100); // AI tank color
    } else {
        fill(isSelf ? 'blue' : 'red'); // Differentiate self vs others
    }

    stroke(0)
    strokeWeight(1)
    const size = PLAYER_SIZE;
    box(2 * size, 1.5 * size, size); // Tank base dimensions

    push();
    rotateZ(PI / 2 + tank.turretAngle - tank.angle); // Rotate turret independently
    translate(0, 0, size); // Move above the base
    box(size, size, size); // Slightly smaller box
    // fill(50); // Different color for the turret
    noStroke();

    // Draw the barrel
    push();
    translate(0, -size / 2, 0)

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
        fill(200, 100, 100); // AI tank color
    } else {
        fill(isSelf ? 'blue' : 'red'); // Differentiate self vs others
    }

    cylinder(0.05 * size + 1, 0.20 * size + 2);
    pop();


    cylinder(0.20 * size);
    pop();
    pop();
    pop();
    pop();

    // push()
    // translate(barrelPos.x, barrelPos.y, barrelPos.z);
    // sphere(10)
    // pop()
}

function drawWalls() {
    if (!level.length) return; // Ensure the level array is defined

    for (let row = 0; row < level.length; row++) {
        for (let col = 0; col < level[row].length; col++) {
            const wallHeight = level[row][col];
            if (wallHeight > 0) {
                push();

                // Calculate wall position relative to (0, 0)
                const wallX = col * TILE_SIZE + TILE_SIZE / 2;
                const wallY = row * TILE_SIZE + TILE_SIZE / 2;

                // Move to position and render wall
                translate(wallX, wallY, 0);
                fill(120, 80, 40); // Wall color
                box(TILE_SIZE, TILE_SIZE, wallHeight * WALL_HEIGHT); // Wall dimensions
                pop();
            }
        }
    }
}

// Render explosions
function drawExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];

        push();
        translate(explosion.x, explosion.y, explosion.z);
        noStroke();
        fill(255, explosion.alpha, 0, explosion.alpha); // Orange with fading alpha
        sphere(explosion.size); // Expanding sphere
        pop();

        // Update explosion properties
        explosion.size += explosion.dSize; // Increase size
        explosion.alpha -= 9; // Fade out
        // explosion.z -= 2; // Move upward slightly

        // Remove explosion when fully faded
        if (explosion.alpha <= 0) {
            explosions.splice(i, 1);
        }
    }
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
    // Emit a fire event to the server when the mouse is clicked
    socket.emit('fireBullet', { angle: myTank.turretAngle });
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
        fill(200, 0, 0); // Red bullet
        sphere(BULLET_SIZE); // Render bullet as a sphere
        pop();
    });
}