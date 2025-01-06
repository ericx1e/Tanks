const express = require('express');
const http = require('http');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // Generates unique lobby codes

const app = express();
const server = http.createServer(app);

const { initializeAITank, updateAITanks, setIO } = require('./bots.js');
const { TILE_SIZE, BULLET_SIZE, BULLET_SPEED, PLAYER_SIZE, MAX_SPEED, ACCELERATION, FRICTION } = require('./public/constants.js');
const { isCollidingWithWall, isCollidingWithPlayer, isWall, lerpAngle, getRandomNonWallPosition } = require('./utils.js');
const { loadLevel, getNumLevels } = require('./levels.js');

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
        lasers: [],
        spawn: {},
        mode: 'lobby',
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

    let { players: newPlayers, level, spawn } = loadLevel(levelNumber, lobby.mode, Object.keys(lobby.players).length)

    // Object.assign(newPlayers, lobby.players)
    // console.log(newPlayers)

    for (const [id, player] of Object.entries(lobby.players)) {
        if (!player.isAI) {
            player.isDead = false;
            let spawnX = spawn.x;
            let spawnY = spawn.y;

            if (lobby.mode === 'arena' || lobby.mode === 'survival') {
                randomSpawn = getRandomNonWallPosition(level);
                spawnX = randomSpawn.x;
                spawnY = randomSpawn.y;
            }

            player.x = spawnX;
            player.y = spawnY;
            newPlayers[id] = player;

            if (lobby.mode == 'survival') {
                player.buffs = {
                    speed: 0,
                    fireRate: 0,
                    shield: 0,
                    bulletSpeed: 0,
                    bulletBounces: 1,
                    multiShot: 0,
                    currentFireCooldown: 0,
                };
            }
        }
    }

    lobbies[lobbyCode] = {
        players: newPlayers,
        level: level,
        levelNumber: levelNumber,
        bullets: [],
        lasers: [],
        spawn: spawn,
        mode: lobby.mode,
        tankKills: 0, // Track kills
        drops: [], // Active drops
        spawnTier: 0,
        arenaProgress: 0,
        totalLevels: getNumLevels(lobby.mode),
    };

    // io.to(lobbyCode).emit('updateLevel', level)
    io.to(lobbyCode).emit('updateLevel', { level: level, levelNumber: levelNumber });
}

function startTransition(lobbyCode) {
    const lobby = lobbies[lobbyCode];
    lobby.gameState = "transition";
    if (!lobby) return;

    transitionTimers[lobbyCode] = 3; // Duration in seconds
    // io.to(lobbyCode).emit('transitionTimer', { secondsLeft: transitionTimers[lobbyCode] }); // Instant transition
    const intervalId = setInterval(() => {
        transitionTimers[lobbyCode]--;
        io.to(lobbyCode).emit('transitionTimer', { secondsLeft: transitionTimers[lobbyCode] });

        if (transitionTimers[lobbyCode] <= 0) {
            clearInterval(intervalId);
            createLevel(lobbyCode, lobby.levelNumber + 1);
            io.to(lobbyCode).emit('nextLevel');

            lobby.gameState = "playing";
            transitionTimers[lobbyCode] = null;
        }
    }, 1000);
}

function changeMode(lobbyCode, mode) {
    const lobby = lobbies[lobbyCode];
    if (!lobby) {
        return;
    }

    lobby.mode = mode;
    io.to(lobbyCode).emit('gameMode', mode);
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

        let spawnX = lobby.spawn.x;
        let spawnY = lobby.spawn.y;

        if (lobby.mode === 'arena' || lobby.mode === 'survival') {
            randomSpawn = getRandomNonWallPosition(lobby.level);
            spawnX = randomSpawn.x;
            spawnY = randomSpawn.y;
        }

        return {
            id: socket.id,
            x: spawnX,
            y: spawnY,
            vx: 0,
            vy: 0,
            angle: 0,
            turretAngle: 0,
            max_speed: MAX_SPEED,
            name: name,
            bulletSpeed: 1.2 * BULLET_SPEED,
            bulletBounces: 1,
            // buffs: { shield: 1 }
        };
    }

    socket.on('createLobby', () => {
        if (socketToLobby[socket.id]) {
            return;
        }

        const lobbyCode = createLobby();
        console.log("created lobby", lobbyCode);
        socketToLobby[socket.id] = lobbyCode;
        socket.join(lobbyCode);
        socket.emit('lobbyCreated', { lobbyCode });
        console.log(`Lobby ${lobbyCode} created by ${socket.id}`);
        io.to(lobbyCode).emit("gameMode", 'lobby');

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
            if (lobby.mode !== 'lobby') {
                socket.emit('error', { message: 'Game in progress' });
                return;
            }
            socketToLobby[socket.id] = lobbyCode;
            socket.emit('lobbyJoined', { lobbyCode });
            io.to(lobbyCode).emit('updatePlayers', lobby.players);
            socket.join(lobbyCode);
            console.log(`${socket.id} joined lobby ${lobbyCode}`);
            io.to(lobbyCode).emit("gameMode", 'lobby');

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

        if (lobby.mode == 'survival') {
            if (player.currentFireCooldown > 0) {
                return;
            }
        } else {
            const playerBulletCount = bullets.filter(bullet => bullet.owner === player.id).length;

            // Enforce the 6-bullet limit
            if (playerBulletCount >= 6) {
                return; // Do not fire if the player has 6 active bullets
            }
        }

        const dx = 1.1 * Math.cos(player.turretAngle) * (PLAYER_SIZE + 2 * BULLET_SIZE) + player.vx;
        const dy = 1.1 * Math.sin(player.turretAngle) * (PLAYER_SIZE + 2 * BULLET_SIZE) + player.vy;

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

        player.currentFireCooldown = player.fireCooldown;

        bullets.push({
            id: bullets.length,
            owner: socket.id,
            x: bulletX,
            y: bulletY,
            angle: bulletData.angle,
            speed: player.bulletSpeed,
            bounces: player.bulletBounces,
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
                    io.to(lobbyCode).emit('explosion', {
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
                bulletsToRemove.add(i); // Remove bullet

                io.to(lobbyCode).emit('explosion', {
                    x: player.x,
                    y: player.y,
                    z: PLAYER_SIZE,
                    size: 10,
                    dSize: 2
                });

                if (lobby.mode !== 'lobby' || player.isAI) {// No player damage in lobby

                    // Apply damage to the player
                    if (player.shield) {
                        player.shield = false; // Remove shield instead of killing
                    } else {
                        player.isDead = true;
                    }
                    // player.isDead = true;
                }

                if (lobby.mode === 'survival') {
                    lobby.tankKills++;
                    if (lobby.tankKills % 1 === 0) {
                        spawnDrop(lobbyCode, player.x, player.y);
                    }
                }

                // Tank dies / takes damage
                if (lobby.mode === 'lobby') {
                    if (player.isAI && player.tier === 'button') {
                        // player.isDead = true;
                        changeMode(lobbyCode, player.name.toLowerCase());
                        lobby.levelNumber = -1;
                        // lobby.levelNumber = 12; // Start from level
                        startTransition(lobbyCode);
                        // switch (player.name) {
                        //     case 'Campaign':
                        //         // createLevel(lobbyCode, lobby.levelNumber + 1);
                        //         io.to(lobbyCode).emit("campaignMode");
                        //         startTransition(lobbyCode);
                        //         mode
                        //         break;
                        //     case 'Arena':
                        //         io.to(lobbyCode).emit("arenaMode");
                        //         startTransition(lobbyCode);
                        //         break;
                        //     case 'Survival':
                        //         // io.to(lobbyCode).emit("")
                        //         break;
                        // }
                    }
                }
                break;
            }
        }
    });

    lobby.bullets = bullets.filter((_, index) => !bulletsToRemove.has(index));
}

function updatePlayerStats(player) {
    if (!player.buffs) return;

    // Base stats
    player.max_speed = 0.7 * MAX_SPEED;
    player.fireRateMultiplier = 1;
    // player.shield = false;
    player.bulletSpeedMultiplier = 1;
    player.multiShot = 1;
    player.bulletBounces = 0;
    // Apply buffs
    if (player.buffs.speed > 0) {
        player.max_speed *= 1 + 0.1 * player.buffs.speed; // Example: 10% speed boost per buff
    }

    if (player.buffs.fireRate > 0) {
        player.fireRateMultiplier *= 1 - 0.1 * player.buffs.fireRate; // Example: 10% faster fire rate per buff
    }

    if (player.buffs.shield > 0) {
        if (!player.shield) {
            player.shield = true;
            player.buffs.shield--; // Shield active if at least one shield buff exists
        }
    }

    if (player.buffs.bulletSpeed > 0) {
        player.bulletSpeedMultiplier *= 1 + 0.1 * player.buffs.bulletSpeed; // Example: 10% bullet speed boost per buff
    }

    if (player.buffs.multiShot > 0) {
        player.multiShot += player.buffs.multiShot; // Add extra bullets based on multi-shot buffs
    }

    if (player.buffs.bulletBounces > 0) {
        player.bulletBounces = player.buffs.bulletBounces;
    }

    player.bulletSpeed = 0.7 * BULLET_SPEED * player.bulletSpeedMultiplier
    player.fireCooldown = 60 * player.fireRateMultiplier;
    player.currentFireCooldown--;
}


function spawnSurvivalBots(lobbyCode) {
    const lobby = lobbies[lobbyCode];
    if (!lobby || lobby.mode !== 'survival') return;

    const level = lobby.level;
    const players = lobby.players;

    while (true) {
        ({ x, y } = getRandomNonWallPosition(level))
        let done = true
        for (const playerId in lobby.players) {
            const player = lobby.players[playerId];
            if (!player.isAI && isCollidingWithPlayer(x, y, player, TILE_SIZE * 3)) {
                done = false;
                break;
            }
        }
        if (done) {
            break;
        }
    }

    const botId = `AI_${Object.keys(players).length}`;
    // console.log(lobby.spawnTier);
    for (let i = 0; i < 5; i++) {
        lobby.players[botId] = initializeAITank(botId, x, y, Math.floor(Math.random() * lobby.spawnTier));
    }

    io.to(lobbyCode).emit('updatePlayers', lobby.players);
}

function spawnDrop(lobbyCode, x, y) {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;

    // Define possible buffs
    const buffs = [
        'speed',
        'fireRate',
        'bulletSpeed',
        // 'bulletBounces',
        'shield',
    ];

    // Randomly select a buff
    const buff = buffs[Math.floor(Math.random() * buffs.length)];

    // Add drop to the lobby
    lobby.drops.push({
        id: uuidv4(),
        x: x,
        y: y,
        buff: buff
    });

    // Notify clients of the new drop
    // io.to(lobbyCode).emit('spawnDrop', lobby.drops);
    io.to(lobbyCode).emit('updateDrops', lobby.drops);
}

function handlePlayerPickup(lobbyCode, playerId) {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;

    const player = lobby.players[playerId];
    if (!player || player.isDead) return;

    // Check for nearby drops
    const remainingDrops = [];
    if (!lobby.drops) return;
    for (let i = 0; i < lobby.drops.length; i++) {
        const drop = lobby.drops[i]
        const dx = drop.x - player.x;
        const dy = drop.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < PLAYER_SIZE * 2) {
            // Apply the buff to the player and update their buff counts
            if (!player.buffs) {
                player.buffs = {
                    speed: 0,
                    fireRate: 0,
                    shield: 0,
                    bulletSpeed: 0,
                    multiShot: 0,
                };
            }

            // Update the player's buff count
            if (player.buffs.hasOwnProperty(drop.buff)) {
                player.buffs[drop.buff] += 1; // Increment the count for this buff type
            }

            // Send updated player buffs to the client
            io.to(lobbyCode).emit('updatePlayerBuffs', { playerId: player.id, buffs: player.buffs });


            // lobby.drops.splice(i, 1); // Remove the drop

            // Notify the client about the pickup
            // io.to(lobbyCode).emit('pickup', { playerId, buff: drop.buff });
        } else {
            remainingDrops.push(drop);
        }
    }

    // Update the drops in the lobby
    lobby.drops = remainingDrops;
    io.to(lobbyCode).emit('updateDrops', lobby.drops);
}

// Run lobby updates 60 times per second
setInterval(() => {
    for (const [lobbyCode, lobby] of Object.entries(lobbies)) {
        if (lobby.gameState == "transition") continue;

        updateBullets(lobby, lobbyCode);

        io.to(lobbyCode).emit('updatePlayers', lobby.players);
        io.to(lobbyCode).emit('updateBullets', lobby.bullets);


        lobby.lasers.forEach((laser, index) => {
            laser.duration--;
            if (laser.duration <= 0) {
                lobby.lasers.splice(index, 1);
            }
        });

        io.to(lobbyCode).emit('updateLasers', lobby.lasers);

        if (lobby.mode == 'lobby' || lobby.mode == 'campaign') {
            if (lobby.level && updateAITanks(lobby, lobbyCode, lobby.players, lobby.level, lobby.bullets)) {
                // createLevel(lobbyCode, lobby.levelNumber + 1);
                // console.log(lobby.levelNumber, lobby.totalLevels - 1)
                if (lobby.levelNumber == lobby.totalLevels - 1) {
                    changeMode(lobbyCode, 'lobby');
                    io.to(lobbyCode).emit("victory");
                    lobby.levelNumber = -1;
                } else {
                    io.to(lobbyCode).emit("levelComplete");
                }
                startTransition(lobbyCode);
                // lobby.gameState = "transition";
            }

            for (const playerId in lobby.players) {
                // handlePlayerPickup(lobbyCode, playerId);
                updatePlayerStats(lobby.players[playerId]);
            }

        }

        if (lobby.mode == 'survival') {
            updateAITanks(lobby, lobbyCode, lobby.players, lobby.level, lobby.bullets)

            for (const playerId in lobby.players) {
                const player = lobby.players[playerId]
                if (!player.isAI) {
                    handlePlayerPickup(lobbyCode, playerId);
                }
                updatePlayerStats(lobby.players[playerId]);
            }
        }

        if (lobby.mode == 'arena') {
            const livingPlayers = []
            for (const [_, player] of Object.entries(lobby.players)) {
                if (!player.isDead) {
                    livingPlayers.push(player);
                }
            }
            if (livingPlayers.length == 1) {
                // TODO: Broadcast winning player

                changeMode(lobbyCode, 'lobby');
                io.to(lobbyCode).emit("gameOver");
                lobby.levelNumber = -1;
                startTransition(lobbyCode);
            }
        }

        if (lobby.mode == 'campaign' || lobby.mode == 'survival') {
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
                changeMode(lobbyCode, 'lobby');
                io.to(lobbyCode).emit("gameOver");
                lobby.levelNumber = -1;
                startTransition(lobbyCode);
            }
        }
    }
}, 1000 / 60);

// Periodically spawn bots in survival mode
setInterval(() => {
    for (const [lobbyCode, lobby] of Object.entries(lobbies)) {
        if (lobby.mode === 'survival') {
            spawnSurvivalBots(lobbyCode);

            lobby.arenaProgress++;

            if (lobby.arenaProgress % 10 == 0) {
                lobby.spawnTier = Math.min(lobby.spawnTier + 1, 6);

            }
        }
    }
}, 10000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
