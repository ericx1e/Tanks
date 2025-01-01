const express = require('express');
const http = require('http');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // Generates unique lobby codes

const app = express();
const server = http.createServer(app);

const { initializeAITanks, updateAITanks, setIO } = require('./bots.js');
const { TILE_SIZE, BULLET_SIZE, BULLET_SPEED, PLAYER_SIZE, MAX_SPEED, ACCELERATION, FRICTION } = require('./public/constants.js');
const { isCollidingWithWall, isCollidingWithPlayer, isWall, lerpAngle, getRandomNonWallPosition } = require('./utils.js');
const { loadLevel, levels } = require('./levels.js');

app.use(cors({ origin: true }));
app.use(express.static('public'));

const io = require('socket.io')(server, {
    cors: {
        origin: true,
        methods: ['GET', 'POST']
    }
});

setIO(io);


const lobbies = {};
const socketToLobby = {}; // Map socket IDs to their respective lobby codes
const socketToNames = {};
const transitionTimers = {};

function createLobby() {
    const lobbyCode = uuidv4().slice(0, 2).toUpperCase();
    lobbies[lobbyCode] = {
        players: {},
        level: [[]],
        levelNumber: -1,
        bullets: [],
        spawn: {},
    };
    return lobbyCode;
}

function createLevel(lobbyCode, levelNumber) {
    lobby = lobbies[lobbyCode];
    if (!lobby) return;

    // for (const [id, player] of Object.entries(lobby.players)) {
    //     if (player.isAI) {
    //         delete lobby.players[id];
    //     }
    // }

    const { players: newPlayers, level, spawn } = loadLevel(levelNumber)

    // Object.assign(newPlayers, lobby.players)
    // console.log(newPlayers)

    lobbies[lobbyCode] = {
        players: newPlayers,
        level: level,
        levelNumber: levelNumber,
        bullets: [],
        spawn: spawn,
    };

    // io.to(lobbyCode).emit('updateLevel', level)
}

function startTransition(lobbyCode) {
    const lobby = lobbies[lobbyCode];
    lobby.gameState = "transition";
    if (!lobby) return;

    transitionTimers[lobbyCode] = 3; // Duration in seconds
    const intervalId = setInterval(() => {
        transitionTimers[lobbyCode]--;
        io.to(lobbyCode).emit('transitionTimer', { secondsLeft: transitionTimers[lobbyCode] });

        if (transitionTimers[lobbyCode] <= 0) {
            clearInterval(intervalId);
            createLevel(lobbyCode, (lobby.levelNumber + 1) % (levels.length));
            io.to(lobbyCode).emit('nextLevel');

            lobby.gameState = "playing";
            transitionTimers[lobbyCode] = null;
        }
    }, 1000);
}


// When a player connects
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    function getLobby() {
        const lobbyCode = socketToLobby[socket.id];
        if (!lobbyCode) return null;
        return lobbies[lobbyCode];
    }

    function createPlayer() {
        // const { x, y } = getRandomNonWallPosition(level);
        const lobby = getLobby()

        socket.emit('updateLevel', { level: lobby.level, levelNumber: lobby.levelNumber });

        let name = "Player"

        if (socketToNames[socket.id]) {
            name = socketToNames[socket.id]
        }

        return {
            id: socket.id,
            x: lobby.spawn.x,
            y: lobby.spawn.y,
            vx: 0,
            vy: 0,
            angle: 0,
            turretAngle: 0,
            max_speed: MAX_SPEED,
            name: name,
        };
    }

    socket.on('createLobby', () => {
        if (socketToLobby[socket.id]) {
            return;
        }

        const lobbyCode = createLobby(); // TODO: Create lobby screen, and handle spawning when game starts
        console.log("created lobby", lobbyCode);
        socketToLobby[socket.id] = lobbyCode;
        socket.join(lobbyCode);
        socket.emit('lobbyCreated', { lobbyCode });
        console.log(`Lobby ${lobbyCode} created by ${socket.id}`);

        // Start game logic
        createLevel(lobbyCode, 0)
        const lobby = lobbies[lobbyCode]
        lobby.players[socket.id] = createPlayer();
    });

    socket.on('joinLobby', (lobbyCode) => {
        if (socketToLobby[socket.id]) {
            return;
        }

        const lobby = lobbies[lobbyCode];
        if (lobby) {
            if (lobby.levelNumber > 0) {
                socket.emit('error', { message: 'Game in progress' });
                return;
            }
            socketToLobby[socket.id] = lobbyCode;
            socket.emit('lobbyJoined', { lobbyCode });
            io.to(lobbyCode).emit('updatePlayers', lobby.players);
            socket.join(lobbyCode);
            console.log(`${socket.id} joined lobby ${lobbyCode}`);

            lobby.players[socket.id] = createPlayer();
        } else {
            socket.emit('error', { message: 'Lobby not found' });
        }
    });

    socket.on('playerInput', (input) => {
        const lobby = getLobby();
        if (!lobby) return;
        const players = lobby.players
        const player = players[socket.id]
        if (!player) return;
        if (player.isDead) return;
        const level = lobby.level

        // Update velocity based on input
        if (input.keys.w) player.vy -= ACCELERATION;
        if (input.keys.s) player.vy += ACCELERATION;
        if (input.keys.a) player.vx -= ACCELERATION;
        if (input.keys.d) player.vx += ACCELERATION;

        // Apply friction
        player.vx *= (1 - FRICTION);
        player.vy *= (1 - FRICTION);

        // Clamp velocity to max speed
        // player.vx = Math.max(-player.max_speed, Math.min(player.max_speed, player.vx));
        // player.vy = Math.max(-player.max_speed, Math.min(player.max_speed, player.vy));
        const magnitude = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
        if (magnitude > player.max_speed) {
            player.vx = player.vx / magnitude * player.max_speed;
            player.vy = player.vy / magnitude * player.max_speed;
        }

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

        const lobbyCode = socketToLobby[socket];
        io.to(lobbyCode).emit('updatePlayers', players);
    });

    socket.on("setName", (name) => {
        const lobby = getLobby();
        if (!lobby) return;
        const players = lobby.players
        const player = players[socket.id]
        if (!player) return;

        player.name = name.substring(0, 16); // Set the player's name with a max length
        socketToNames[socket.id] = name

        // console.log(socketToNames)

        const lobbyCode = socketToLobby[socket.id];
        io.to(lobbyCode).emit('updatePlayers', players);
    });

    // Handle firing bullets
    socket.on('fireBullet', (bulletData) => {
        const lobbyCode = socketToLobby[socket.id];
        if (!lobbyCode) return;
        const lobby = lobbies[lobbyCode];
        if (!lobby) return;
        const player = lobby.players[socket.id];
        if (!player) return;
        if (player.isDead) return;
        const bullets = lobby.bullets;
        const level = lobby.level

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

        io.to(lobbyCode).emit('explosion', {
            x: bulletX,
            y: bulletY,
            z: PLAYER_SIZE * 1.4 - BULLET_SIZE,
            size: BULLET_SIZE / 2,
        });
    });

    socket.on('createPlayer', () => {
        const lobby = getLobby()
        lobby.players[socket.id] = createPlayer()
    });

    // Handle player disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        const lobbyCode = socketToLobby[socket.id];
        if (lobbyCode) {
            const lobby = lobbies[lobbyCode];
            delete lobby.players[socket.id];
            delete socketToLobby[socket.id];
            io.to(lobbyCode).emit('updatePlayers', lobby.players);

            // Optionally remove the lobby if empty
            if (Object.keys(lobby.players).length === 0) {
                delete lobbies[lobbyCode];
                console.log(`Lobby ${lobbyCode} deleted as it is empty.`);
            }
        }
        if (socketToNames[socket]) {
            delete socketToNames[socket]
        }
    });
});

function updateBullets(lobby, lobbyCode) {
    const bulletsToRemove = new Set();
    const bullets = lobby.bullets
    const players = lobby.players
    const level = lobby.level
    if (!level) return;

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
                io.to(lobbyCode).emit('explosion', {
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

                io.to(lobbyCode).emit('explosion', {
                    x: player.x,
                    y: player.y,
                    z: PLAYER_SIZE,
                    size: 10,
                    dSize: 2
                });


                // Tank dies / takes damage
                if (lobby.levelNumber != 0 || player.isAI) // No player damage in lobby
                    player.isDead = true;

                // Teleport to random location
                // const { x, y } = getRandomNonWallPosition(level)
                // player.x = x;
                // player.y = y;
                // player.vx = 0;
                // player.vy = 0;

                // Exit early to avoid further processing of this bullet
                break;
            }
        }
    });

    lobby.bullets = bullets.filter((_, index) => !bulletsToRemove.has(index));
}

// Run lobby updates 60 times per second
setInterval(() => {
    for (const [lobbyCode, lobby] of Object.entries(lobbies)) {
        if (lobby.gameState == "transition") continue;

        updateBullets(lobby, lobbyCode);
        if (lobby.level && updateAITanks(lobbyCode, lobby.players, lobby.level, lobby.bullets)) {
            // createLevel(lobbyCode, lobby.levelNumber + 1);
            io.to(lobbyCode).emit("levelComplete");
            startTransition(lobbyCode);
            // lobby.gameState = "transition";
        }
        io.to(lobbyCode).emit('updatePlayers', lobby.players);
        io.to(lobbyCode).emit('updateBullets', lobby.bullets);

        let allDead = true;
        let numPlayers = 0;
        for (const [_, player] of Object.entries(lobby.players)) {
            if (!player.isAI) {
                numPlayers++;
                if (!player.isDead) {
                    allDead = false;
                }
            }
        }

        if (numPlayers > 0 && allDead) {
            console.log(lobby.players)
            io.to(lobbyCode).emit("gameOver");
            lobby.levelNumber = -1
            startTransition(lobbyCode);
        }
    }
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
