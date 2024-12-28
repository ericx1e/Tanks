const express = require('express');
const http = require('http');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const { initializeAITanks, updateAITanks } = require('./bots.js');
const { TILE_SIZE, BULLET_SIZE, BULLET_SPEED, PLAYER_SIZE, MAX_SPEED, ACCELERATION, FRICTION } = require('./public/constants.js');
const { isCollidingWithWall, isCollidingWithPlayer, isWall, lerpAngle, getRandomNonWallPosition } = require('./utils.js');

app.use(cors({ origin: true }));
app.use(express.static('public'));

const io = require('socket.io')(server, {
    cors: {
        origin: true,
        methods: ['GET', 'POST']
    }
});

const players = {}; // Store player states

const level = [
    [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    [4, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 4],
    [4, 0, 4, 0, 4, 0, 0, 0, 0, 4, 0, 0, 0, 4, 4, 0, 4, 0, 4, 0, 4, 0, 0, 0, 4],
    [4, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 4, 0, 4],
    [4, 4, 0, 4, 4, 0, 4, 0, 4, 0, 4, 0, 4, 4, 4, 0, 0, 0, 4, 4, 4, 0, 4, 0, 4],
    [4, 0, 0, 0, 4, 0, 0, 0, 4, 0, 4, 0, 0, 0, 4, 0, 4, 0, 4, 0, 0, 0, 0, 0, 4],
    [4, 4, 4, 0, 4, 0, 4, 0, 4, 0, 0, 0, 4, 4, 4, 0, 0, 0, 4, 0, 4, 4, 4, 0, 4],
    [4, 0, 0, 0, 0, 0, 0, 0, 4, 0, 4, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 4, 0, 4],
    [4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 4, 4, 0, 4, 4, 4, 0, 4, 0, 4, 0, 4],
    [4, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 4],
    [4, 4, 4, 0, 4, 0, 4, 0, 4, 0, 4, 4, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 4, 4],
    [4, 0, 0, 0, 0, 0, 4, 0, 4, 0, 0, 0, 4, 0, 0, 0, 4, 0, 4, 0, 0, 0, 0, 0, 4],
    [4, 0, 4, 4, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 4, 4, 0, 4, 0, 4],
    [4, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 4],
    [4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 4],
    [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 4],
    [4, 4, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 4, 4, 0, 4, 0, 4, 4, 4, 0, 4, 4, 4],
    [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4],
    [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
];

let bullets = []; // Store all bullets

const AI_TANK_COUNT = 40; // Number of AI tanks
Object.assign(players, initializeAITanks(AI_TANK_COUNT));

for (let i = 0; i < AI_TANK_COUNT; i++) {
    const { x, y } = getRandomNonWallPosition(level);
    players[`AI_${i}`] = {
        id: `AI_${i}`,
        x: x,
        y: y,
        angle: Math.random() * 2 * Math.PI, // Random initial angle
        turretAngle: 0,
        targetDirection: Math.random() * 2 * Math.PI, // Initial direction
        movementTimer: 0, // Timer for moving in a direction
        isDriving: true, // Start with driving
        rotationalVelocity: 0, // Smooth turning speed
        isAI: true,
    };
}


// When a player connects
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    const { x, y } = getRandomNonWallPosition(level);
    players[socket.id] = {
        id: socket.id,
        x: x,
        y: y,
        vx: 0, // Horizontal velocity
        vy: 0, // Vertical velocity
        angle: 0, // Tank rotation
        turretAngle: 0, // Turret rotation
    };
    // level = surroundLevelWithWalls(level); // Surround level with walls
    socket.emit('updateLevel', level);

    // Send updated player list to all clients
    io.emit('updatePlayers', players);

    socket.on('playerInput', (input) => {
        const player = players[socket.id];
        if (!player) return;

        // Update velocity based on input
        if (input.keys.w) player.vy -= ACCELERATION;
        if (input.keys.s) player.vy += ACCELERATION;
        if (input.keys.a) player.vx -= ACCELERATION;
        if (input.keys.d) player.vx += ACCELERATION;

        // Apply friction
        player.vx *= (1 - FRICTION);
        player.vy *= (1 - FRICTION);

        // Clamp velocity to max speed
        player.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.vx));
        player.vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.vy));

        // Calculate the desired angle based on velocity
        const desiredAngle = Math.atan2(player.vy, player.vx);

        // Smoothly interpolate the tank's angle toward the desired angle
        if (player.vx !== 0 || player.vy !== 0) {
            const rotationSpeed = 0.1; // Adjust this value for faster or slower rotations
            player.angle = lerpAngle(player.angle, desiredAngle, rotationSpeed);
        }

        const newX = player.x + player.vx;
        const newY = player.y + player.vy;

        // Check for collision
        if (!isCollidingWithWall(newX, player.y, PLAYER_SIZE, level)) {
            player.x = newX; // Update position if no collision
        } else {
            player.vx = 0; // Stop horizontal movement on collision
        }
        if (!isCollidingWithWall(player.x, newY, PLAYER_SIZE, level)) {
            player.y = newY; // Update position if no collision
        } else {
            player.vy = 0; // Stop vertical movement on collision
        }

        // Update the turret angle
        player.turretAngle = input.turretAngle;

        io.emit('updatePlayers', players);
    });

    // Handle player movement
    socket.on('playerTankMove', (data) => {
        const player = players[socket.id];
        if (player) {
            // Predict new position
            const newX = player.x + (data.dx || 0); // Default dx, dy to 0 if undefined
            const newY = player.y + (data.dy || 0);

            // Check for collisions
            if (!isCollidingWithWall(newX, player.y, PLAYER_SIZE, level)) {
                player.x = newX; // Update X position if no collision
            }
            if (!isCollidingWithWall(player.x, newY, PLAYER_SIZE, level)) {
                player.y = newY; // Update Y position if no collision
            }

            player.angle += data.angleChange; // Update angle
            player.turretAngle = data.turretAngle || player.turretAngle; // Update turret angle
        }
    });


    // Handle firing bullets
    socket.on('fireBullet', (bulletData) => {
        const player = players[socket.id];

        const playerBulletCount = bullets.filter(bullet => bullet.owner === player.id).length;

        // Enforce the 6-bullet limit
        if (playerBulletCount >= 6) {
            return; // Do not fire if the player has 6 active bullets
        }

        const dx = 1.3 * Math.cos(player.turretAngle) * (PLAYER_SIZE + BULLET_SIZE) + player.vx;
        const dy = 1.3 * Math.sin(player.turretAngle) * (PLAYER_SIZE + BULLET_SIZE) + player.vy;

        const bulletX = player.x + dx;
        const bulletY = player.y + dy;

        const checkBulletX = player.x + 2 * dx;
        const checkBulletY = player.y + 2 * dy;
        const size = 2 * BULLET_SIZE;
        const colLeft = Math.floor((checkBulletX - size) / TILE_SIZE);
        const colRight = Math.floor((checkBulletX + size) / TILE_SIZE);
        const rowTop = Math.floor((checkBulletY - size) / TILE_SIZE);
        const rowBottom = Math.floor((checkBulletY + size) / TILE_SIZE);

        if (isWall(colLeft, rowTop, level) || isWall(colRight, rowTop, level) || isWall(colLeft, rowBottom, level) || isWall(colRight, rowBottom, level)) {
            // Do not fire the bullet if it starts inside a wall
            return;
        }

        bullets.push({
            id: bullets.length,
            owner: socket.id,
            x: bulletX,
            y: bulletY,
            angle: bulletData.angle,
            speed: BULLET_SPEED,
            bounces: 1
        });
    });

    // Handle player disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id];
    });
});

function updateBullets() {
    const bulletsToRemove = new Set();

    bullets.forEach((bullet, i) => {
        // Predict the new position of the bullet
        const nextX = bullet.x + Math.cos(bullet.angle) * bullet.speed;
        const nextY = bullet.y + Math.sin(bullet.angle) * bullet.speed;

        const halfSize = BULLET_SIZE; // Radius

        // Initialize flags for collision
        let horizontalCollision = false;
        let verticalCollision = false;

        // Check for horizontal collision (left and right sides of the bullet)
        const colLeft = Math.floor((nextX - halfSize) / TILE_SIZE);
        const colRight = Math.floor((nextX + halfSize) / TILE_SIZE);
        const rowHorizontal = Math.floor(bullet.y / TILE_SIZE);
        if (isWall(colLeft, rowHorizontal, level) || isWall(colRight, rowHorizontal, level)) {
            horizontalCollision = true;
        }

        // Check for vertical collision (top and bottom sides of the bullet)
        const colVertical = Math.floor(bullet.x / TILE_SIZE);
        const rowTop = Math.floor((nextY - halfSize) / TILE_SIZE);
        const rowBottom = Math.floor((nextY + halfSize) / TILE_SIZE);
        if (isWall(colVertical, rowTop, level) || isWall(colVertical, rowBottom, level)) {
            verticalCollision = true;
        }

        // Handle collisions
        if (horizontalCollision && verticalCollision) {
            // Corner collision: bounce in the direction of the steeper change
            const dx = Math.cos(bullet.angle);
            const dy = Math.sin(bullet.angle);

            if (Math.abs(dx) > Math.abs(dy)) {
                // More horizontal movement, prioritize horizontal bounce
                bullet.angle = Math.PI - bullet.angle;
            } else {
                // More vertical movement, prioritize vertical bounce
                bullet.angle = -bullet.angle;
            }
        } else if (horizontalCollision) {
            // Horizontal bounce
            bullet.angle = Math.PI - bullet.angle;
        } else if (verticalCollision) {
            // Vertical bounce
            bullet.angle = -bullet.angle;
        }
        bullet.x += Math.cos(bullet.angle) * bullet.speed;
        bullet.y += Math.sin(bullet.angle) * bullet.speed;

        // Reduce bounces or remove bullet if no bounces remain
        if (horizontalCollision || verticalCollision) {
            if (bullet.bounces > 0) {
                bullet.bounces--;
            } else {
                io.emit('explosion', {
                    x: bullet.x,
                    y: bullet.y,
                    z: PLAYER_SIZE * 1.4 - BULLET_SIZE,
                    size: BULLET_SIZE,
                    dSize: 0.5
                });

                bulletsToRemove.add(i);
            }
            return;
        }


        // Check for collisions with other bullets
        bullets.forEach((otherBullet, j) => {
            if (i !== j && !bulletsToRemove.has(j)) {
                const dx = bullet.x - otherBullet.x;
                const dy = bullet.y - otherBullet.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // If the distance is less than the sum of their radii, they collide
                if (distance < 2 * BULLET_SIZE) {
                    bulletsToRemove.add(i); // Mark both bullets for removal
                    bulletsToRemove.add(j);
                    io.emit('explosion', {
                        x: (bullet.x + otherBullet.x) / 2,
                        y: (bullet.y + otherBullet.y) / 2,
                        z: PLAYER_SIZE * 1.4 - BULLET_SIZE,
                        size: BULLET_SIZE,
                        dSize: 0.5
                    });
                }
            }
        });

        // Check for collisions with players
        for (let playerId in players) {
            const player = players[playerId];
            if (/*playerId !== bullet.owner && */isCollidingWithPlayer(nextX, nextY, player)) {
                // delete players[playerId];

                bulletsToRemove.add(i); // Remove bullet

                io.emit('explosion', {
                    x: player.x,
                    y: player.y,
                    z: PLAYER_SIZE,
                    size: 10,
                    dSize: 2
                });

                const { x, y } = getRandomNonWallPosition(level)
                player.x = x;
                player.y = y;
                player.vx = 0;
                player.vy = 0;

                // Broadcast player health
                io.emit('updatePlayers', players);

                // Exit early to avoid further processing of this bullet
                break;
            }
        }
    });

    bullets = bullets.filter((_, index) => !bulletsToRemove.has(index));
    io.emit('updateBullets', bullets);
}

// Run bullet updates 60 times per second
setInterval(() => {
    updateBullets();
    updateAITanks(players, level, players, bullets);
    io.emit('updatePlayers', players);
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
