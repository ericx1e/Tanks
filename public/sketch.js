let players = {};
let myTank = { x: 400, y: 300, angle: 0 };
let bullets = [];
let level = [
    ['W', ' ', ' ', 'W', ' ', 'W'],
    [' ', ' ', 'W', ' ', ' ', ' '],
    [' ', 'W', ' ', ' ', 'W', ' '],
    ['W', ' ', ' ', 'W', ' ', 'W']
];
let woodTexture;

function preload() {
    woodTexture = loadImage('assets/wood-texture.jpg'); // Load texture for walls
}
function setup() {
    createCanvas(800, 600, WEBGL);

    // Receive the updated players object from the server
    socket.on('updatePlayers', (serverPlayers) => {
        players = serverPlayers;
    });

    // frameRate(60);
}

function draw() {
    background(200);

    // Set up camera
    let camX = myTank.x;
    let camY = myTank.y - 200;
    let camZ = 500;
    let targetX = myTank.x;
    let targetY = myTank.y;
    let targetZ = 0;
    camera(camX, camY, camZ, targetX, targetY, targetZ, 0, 0, -1);

    // Draw ground
    push();
    fill(180, 150, 100);
    translate(0, 0, -20);
    noStroke();
    plane(2000, 2000);
    pop();

    // Draw walls
    drawWalls();

    // Draw all tanks
    for (let id in players) {
        let tank = players[id];
        push();
        translate(tank.x, tank.y, 0);
        rotateZ(tank.angle);
        fill(id === socket.id ? 'blue' : 'red');
        box(40, 20, 40);
        pop();
    }

    // Draw bullets
    drawBullets();

    // Handle movement
    handleMovement();
}

function drawWalls() {
    const tileSize = 100;
    for (let row = 0; row < level.length; row++) {
        for (let col = 0; col < level[row].length; col++) {
            if (level[row][col] === 'W') {
                push();
                translate(col * tileSize - 300, row * tileSize - 200, 0);
                texture(woodTexture);
                box(tileSize, tileSize, 50);
                pop();
            }
        }
    }
}

function handleMovement() {
    let speed = 2;

    if (keyIsDown(LEFT_ARROW)) {
        myTank.angle -= 0.05;
    }
    if (keyIsDown(RIGHT_ARROW)) {
        myTank.angle += 0.05;
    }
    if (keyIsDown(UP_ARROW)) {
        myTank.x += cos(myTank.angle) * speed;
        myTank.y += sin(myTank.angle) * speed;
    }
    if (keyIsDown(DOWN_ARROW)) {
        myTank.x -= cos(myTank.angle) * speed;
        myTank.y -= sin(myTank.angle) * speed;
    }

    socket.emit('playerMove', myTank); // Send updated position to server
}

function fireBullet() {
    const bulletSpeed = 5;
    bullets.push({
        x: myTank.x,
        y: myTank.y,
        angle: myTank.angle,
        speed: bulletSpeed,
        bounces: 3 // Max ricochets
    });
}

function drawBullets() {
    bullets.forEach((bullet, index) => {
        bullet.x += cos(bullet.angle) * bullet.speed;
        bullet.y += sin(bullet.angle) * bullet.speed;

        // Collision with walls
        level.forEach((row, rowIndex) => {
            row.forEach((tile, colIndex) => {
                if (tile === 'W') {
                    let wallX = colIndex * 100 - 300;
                    let wallY = rowIndex * 100 - 200;
                    if (
                        bullet.x > wallX - 50 &&
                        bullet.x < wallX + 50 &&
                        bullet.y > wallY - 50 &&
                        bullet.y < wallY + 50
                    ) {
                        // Ricochet logic
                        if (bullet.bounces > 0) {
                            bullet.angle = bullet.angle + PI / 2; // Bounce angle
                            bullet.bounces--;
                        } else {
                            bullets.splice(index, 1); // Remove bullet
                        }
                    }
                }
            });
        });

        // Draw bullet
        push();
        translate(bullet.x, bullet.y, 5);
        fill(255, 0, 0);
        sphere(5); // Represent bullet
        pop();
    });
}

function keyPressed() {
    if (key === ' ') {
        fireBullet(); // Spacebar fires bullets
    }
}
