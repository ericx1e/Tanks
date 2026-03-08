const express = require('express');
const http = require('http');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // Generates unique lobby codes

const app = express();
const server = http.createServer(app);

const { initializeAITank, updateAITanks, setIO, detectObstacleAlongRay } = require('./bots.js');
const { TILE_SIZE, BULLET_SIZE, BULLET_SPEED, PLAYER_SIZE, MAX_SPEED, ACCELERATION, FRICTION, TANK_CLASSES } = require('./public/constants.js');
const { isCollidingWithWall, isCollidingWithPlayer, isWall, lerpAngle, getRandomNonWallPosition, getSpreadOutPosition } = require('./utils.js');
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

const debug_lag = false;
// Lag simulation for development. Set LAG_MS > 0 to enable.
// JITTER_MS adds random variance around LAG_MS, causing packets to arrive out of order.
const LAG_MS = 0;
const JITTER_MS = 60;
const lagEmit = (target, event, data) => {
    if (LAG_MS > 0 || JITTER_MS > 0) {
        const delay = Math.max(0, LAG_MS + (Math.random() * 2 - 1) * JITTER_MS);
        setTimeout(() => target.emit(event, data), delay);
    } else {
        target.emit(event, data);
    }
};

function createLobby() {
    const lobbyCode = uuidv4().slice(0, 2).toUpperCase();
    lobbies[lobbyCode] = {
        players: {},
        level: [[]],
        levelNumber: -1,
        bullets: [],
        lasers: [],
        flares: [],
        companions: {},
        spawn: {},
        mode: 'lobby',
        friendlyFire: false,
    };
    return lobbyCode;
}

function createLevel(lobbyCode, levelNumber) {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;

    // for (const [id, player] of Object.entries(lobby.players)) {
    //     if (player.isAI) {
    //         delete lobby.players[id];
    //     }
    // }

    let { players: newPlayers, level, spawn } = loadLevel(lobby, levelNumber)

    // Object.assign(newPlayers, lobby.players)
    // console.log(newPlayers)

    for (const [id, player] of Object.entries(lobby.players)) {
        if (!player.isAI) {
            player.isDead = false;
            player.spawnGrace = lobby.mode === 'lobby' ? 0 : 180; // 3 s at 60 fps
            if (lobby.mode === 'lobby') {
                resetBuffs(player);
                player.hasLaserAbility = false;
                player.hasShieldAbility = false;
                player.laserEnergy = 100;
                player.laserDepleted = false;
                player.shieldEnergy = 100;
                player.shieldDepleted = false;
                player.shieldActive = false;
                player.hasFlareAbility = false;
                player.flareCooldown = 0;
                player.hasBarrageAbility = false;
                player.barrageCooldown = 0;
                player.barrageActive = false;
                player.barrageShots = 0;
                player.classBuffsApplied = false; // reset so next game start applies them once
                player.pillageCharge = 0;
                player._lastPillageKills = 0;
            }
            // player.shield = true; // Start with shield
            let spawnX = spawn.x;
            let spawnY = spawn.y;

            if (lobby.mode === 'arena' || lobby.mode === 'survival') {
                const randomSpawn = getSpreadOutPosition(level, newPlayers, 12 * TILE_SIZE);
                // randomSpawn = getRandomNonWallPosition(level);
                spawnX = randomSpawn.x;
                spawnY = randomSpawn.y;
            }

            player.x = spawnX;
            player.y = spawnY;
            // Reset ability cooldowns on new stage (except engineer companion)
            if (lobby.mode !== 'lobby') {
                player.flareCooldown = 0;
                player.sniperShotCooldown = 0;
                player.barrageCooldown = 0;
                player.cannonCooldown = 0;
                player.laserDepleted = false;
                player.laserEnergy = 100;
            }

            newPlayers[id] = player;
        }
    }

    if (lobby.mode === 'campaign') {
        for (let i = 0; i < Math.random() * 4 - 1; i++) {
            randomSpawn = getRandomNonWallPosition(level);
            const botId = `AI_${Object.keys(newPlayers).length}`;
            newPlayers[botId] = initializeAITank(botId, randomSpawn.x, randomSpawn.y, 'chest');
        }
    }

    // Apply class-based starting buffs once per game (not on every level)
    if (lobby.mode !== 'lobby') {
        for (const player of Object.values(newPlayers)) {
            if (!player.isAI && !player.classBuffsApplied) {
                applyClassBuffs(player);
                player.classBuffsApplied = true;
            }
        }
    }

    // Carry over living companions; only spawn a fresh one if none survived
    const prevCompanions = lobby.companions || {};
    const newCompanions = {};
    if (lobby.mode !== 'lobby') {
        const offsets = [[0, 0], [40, 0], [-40, 0], [0, 40], [0, -40], [40, 40], [-40, 40], [40, -40], [-40, -40]];
        for (const [id, player] of Object.entries(newPlayers)) {
            if (!player.isAI && player.selectedClass === 'engineer') {
                let spawnX = player.x, spawnY = player.y;
                for (const [ox, oy] of offsets) {
                    if (!isCollidingWithWall(player.x + ox, player.y + oy, PLAYER_SIZE * 0.6, level)) {
                        spawnX = player.x + ox; spawnY = player.y + oy; break;
                    }
                }

                let idx = 0;
                for (const comp of Object.values(prevCompanions)) {
                    if (comp.ownerId !== id || comp.isDead) continue;
                    let cx = spawnX + (Math.random() - 0.5) * 60;
                    let cy = spawnY + (Math.random() - 0.5) * 60;
                    if (isCollidingWithWall(cx, cy, PLAYER_SIZE * 0.6, level)) { cx = spawnX; cy = spawnY; }
                    newCompanions[`${id}_${idx}`] = {
                        ...comp, x: cx, y: cy, vx: 0, vy: 0,
                        spawnGrace: 60, rallyPoint: null,
                    };
                    idx++;
                }

                // No survivors — give one fresh companion and reset cooldown
                if (idx === 0) {
                    const initWander = Math.random() * Math.PI * 2;
                    newCompanions[`${id}_0`] = {
                        x: spawnX, y: spawnY,
                        vx: 0, vy: 0,
                        angle: 0, turretAngle: 0,
                        ownerId: id,
                        isDead: false,
                        shield: true,
                        fireCooldown: 90,
                        spawnGrace: 60,
                        wanderAngle: initWander,
                        wanderTargetAngle: initWander,
                        wanderTimer: 0,
                    };
                    idx = 1;
                    player.companionSpawnCooldown = 900;
                }
                // Otherwise cooldown carries over from previous round
                player.companionCount = idx;
            }
        }
    }

    // Add class selection dummies to the lobby level
    if (lobby.mode === 'lobby') {
        TANK_CLASSES.forEach((cls, i) => {
            const pos = CLASS_DUMMY_POSITIONS[i];
            if (!pos) return;
            const x = (pos.col + 0.5) * TILE_SIZE;
            const y = (pos.row + 0.5) * TILE_SIZE;
            const dummyId = `class_${cls.id}`;
            const dummy = initializeAITank(dummyId, x, y, 'button', cls.name);
            dummy.classId = cls.id;
            dummy.color = hexToRgb(cls.color);
            dummy.angle = pos.angle ?? Math.PI / 2;
            newPlayers[dummyId] = dummy;
        });
    }

    lobbies[lobbyCode] = {
        players: newPlayers,
        level: level,
        levelNumber: levelNumber,
        bullets: [],
        lasers: [],
        flares: [],
        companions: newCompanions,
        spawn: spawn,
        mode: lobby.mode,
        tankKills: 0, // Track kills
        drops: [], // Active drops
        spawnTier: 0,
        arenaProgress: 0,
        totalLevels: getNumLevels(lobby.mode),
        friendlyFire: lobby.friendlyFire,
        numBots: 0,
        smokeClouds: [],
    };

    // io.to(lobbyCode).emit('updateLevel', level)
    io.to(lobbyCode).emit('updateLevel', { level: level, levelNumber: levelNumber, zones: lobby.mode === 'lobby' ? LOBBY_ZONES : [] });
}

function startTransition(lobbyCode) {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;
    lobby.gameState = "transition";

    const basePillageGain = 45; // Base gain per level
    for (const player of Object.values(lobby.players)) {
        if (!player.isAI && player.selectedClass === 'assault') {
            player.pillageCharge = (player.pillageCharge || 0) + basePillageGain / (player.hasteMult || 1);
        }
    }

    const duration = lobby.levelNumber === -1 ? 2 : 3;
    transitionTimers[lobbyCode] = duration;

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

    // Reset KDA for all human players when starting a new run
    if (mode !== 'lobby') {
        for (const player of Object.values(lobby.players)) {
            if (!player.isAI) { player.kills = 0; player.deaths = 0; }
        }
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

    // Remove this socket from its current lobby (if any). Returns true if left successfully.
    function leaveCurrentLobby() {
        const oldCode = socketToLobby[socket.id];
        if (!oldCode) return true;
        const oldLobby = lobbies[oldCode];
        if (oldLobby) {
            if (oldLobby.mode !== 'lobby') {
                socket.emit('error', { message: 'Cannot switch lobbies mid-game' });
                return false;
            }
            delete oldLobby.players[socket.id];
            io.to(oldCode).emit('updatePlayers', oldLobby.players);
            const remaining = Object.values(oldLobby.players).filter(p => !p.isAI).length;
            if (remaining === 0) {
                delete lobbies[oldCode];
                console.log(`Lobby ${oldCode} deleted (empty after leave)`);
            }
        }
        socket.leave(oldCode);
        delete socketToLobby[socket.id];
        return true;
    }

    function createPlayer() {
        // const { x, y } = getRandomNonWallPosition(level);
        const lobby = getLobby()

        socket.emit('updateLevel', { level: lobby.level, levelNumber: lobby.levelNumber, zones: lobby.mode === 'lobby' ? LOBBY_ZONES : [] });

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

        const player = {
            id: socket.id,
            x: spawnX,
            y: spawnY,
            vx: 0,
            vy: 0,
            angle: 0,
            turretAngle: 0,
            // max_speed: MAX_SPEED,
            name: name,
            // bulletSpeed: 1.2 * BULLET_SPEED,
            // bulletBounces: 1,
            isAI: false,
            // buffs: { shield: 1 },
            // shield: true,
            selectedClass: 'assault',
            kills: 0,
            deaths: 0,
        };

        resetBuffs(player);
        updatePlayerStats(lobby, player);

        return player;
    }

    function sanitizeName(raw) {
        if (typeof raw !== 'string') return 'Player';
        // keep letters, numbers, spaces and basic punctuation; trim and clamp to 16
        const cleaned = raw.replace(/[^\p{L}\p{N}\s._-]/gu, '').trim().slice(0, 16);
        return cleaned || 'Player';
    }

    function setPlayerName(socket, rawName) {
        const name = sanitizeName(rawName);

        // remember for later player creation
        socketToNames[socket.id] = name;

        // if already in a lobby and player exists, update & broadcast
        const lobbyCode = socketToLobby[socket.id];
        if (lobbyCode) {
            const lobby = lobbies[lobbyCode];
            if (lobby && lobby.players && lobby.players[socket.id]) {
                lobby.players[socket.id].name = name;
                io.to(lobbyCode).emit('updatePlayers', lobby.players);
            }
        }

        return name; // handy if you want the canonical value back
    }



    socket.on('pingCheck', (startTime) => {
        socket.emit('pingResponse', startTime);
    });

    socket.on('createLobby', (data = {}) => {
        if (!leaveCurrentLobby()) return;
        const name = data.name?.trim() || 'Player';
        setPlayerName(socket, name);

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

    socket.on('joinLobby', (data = {}) => {
        if (!leaveCurrentLobby()) return;

        const { code, name } = data;
        let lobbyCode = code

        const lobby = lobbies[lobbyCode];
        if (lobby) {
            if (lobby.mode !== 'lobby') {
                socket.emit('error', { message: 'Game in progress' });
                return;
            }
            if (name) setPlayerName(socket, name.trim());
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
        player.input = input
        /*
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

        // const lobbyCode = socketToLobby[socket];
        // io.to(lobbyCode).emit('updatePlayers', players);
        */
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
            const playerBulletCount = bullets.filter(bullet => bullet.owner === player.id && !bullet.isTurretBullet && !bullet.isChainBullet).length;

            // Enforce the 6-bullet limit
            if (playerBulletCount >= player.maxBullets) {
                return; // Do not fire if the player has 6 active bullets
            }
        }

        const shots = player.multiShot
        if (shots) {
            const dAngle = Math.PI / 11;
            let angle = bulletData.angle - (shots - 1) / 2 * dAngle
            for (let i = 0; i < shots; i++) {
                fireBullet(angle);
                angle += dAngle;
            }
        } else {
            fireBullet(bulletData.angle);
        }
        player.currentFireCooldown = player.playerFireCooldown;

        function fireBullet(angle) {
            const dx = 1.1 * Math.cos(angle) * (PLAYER_SIZE + 2 * BULLET_SIZE) + player.vx;
            const dy = 1.1 * Math.sin(angle) * (PLAYER_SIZE + 2 * BULLET_SIZE) + player.vy;

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

            const explosiveStacks = player.buffs?.explosive || 0;
            const isExplosive = explosiveStacks > 0;
            // Each explosive stack multiplies splash by +50% (sqrt diminishing returns)
            const splashMult = explosiveStacks > 0 ? 1 + 0.5 * Math.sqrt(explosiveStacks) : 1;
            bullets.push({
                id: bullets.length,
                owner: socket.id,
                x: bulletX,
                y: bulletY,
                angle: angle,
                speed: player.bulletSpeed,
                bounces: player.bulletBounces,
                hasSplash: isExplosive || undefined,
                hp: 1 + (player.piercing || 0),
                splashRadius: isExplosive ? PLAYER_SIZE * 2.5 * splashMult : undefined,
                explosionSize: isExplosive ? BULLET_SIZE * 3.5 * splashMult : undefined,
            });

            io.to(lobbyCode).emit('explosion', {
                x: bulletX,
                y: bulletY,
                z: PLAYER_SIZE * 1.4 - BULLET_SIZE,
                size: BULLET_SIZE / 2,
            });
        }
    });

    socket.on('devGiveBuff', ({ buff, count = 1 }) => {
        const lobbyCode = socketToLobby[socket.id];
        if (!lobbyCode) return;
        const lobby = lobbies[lobbyCode];
        if (!lobby) return;
        const player = lobby.players[socket.id];
        if (!player || !player.buffs) return;
        if (!player.buffs.hasOwnProperty(buff)) return;
        player.buffs[buff] += Math.max(1, Math.floor(count));
        updatePlayerStats(lobby, player);
        io.to(lobbyCode).emit('updatePlayerBuffs', { playerId: player.id, buffs: player.buffs });
    });

    socket.on('selectClass', (classId) => {
        const lobbyCode = socketToLobby[socket.id];
        if (!lobbyCode) return;
        const lobby = lobbies[lobbyCode];
        if (!lobby) return;
        const player = lobby.players[socket.id];
        if (!player) return;
        if (!TANK_CLASSES.find(c => c.id === classId)) return; // validate
        player.selectedClass = classId;
        io.to(lobbyCode).emit('playerClassChanged', { playerId: socket.id, classId });
    });


    socket.on('fireLaser', () => {
        const lobbyCode = socketToLobby[socket.id];
        if (!lobbyCode) return;
        const lobby = lobbies[lobbyCode];
        if (!lobby) return;
        const player = lobby.players[socket.id];
        if (!player) return;
        if (player.isDead) return;

        const isLaserClass = player.hasLaserAbility;
        const isDevLaser = player.name === 'jeric';
        if (!isLaserClass && !isDevLaser) return;
        if (isLaserClass) {
            if (player.laserDepleted || (player.laserEnergy || 0) <= 0) return;
            player.laserEnergy -= 4 * (player.hasteMult || 1);
            player.laserChanneling = true;
            if (player.laserEnergy <= 0) {
                player.laserEnergy = 0;
                player.laserDepleted = true;
            }
        }

        // Laser recoil — continuous small kick while channeling
        player.vx -= Math.cos(player.turretAngle) * 0.4;
        player.vy -= Math.sin(player.turretAngle) * 0.4;
        fireLaser(lobby, lobbyCode, player, lobby.players, lobby.level, true)
    });

    socket.on('flareShot', (data) => {
        const lobbyCode = socketToLobby[socket.id];
        if (!lobbyCode) return;
        const lobby = lobbies[lobbyCode];
        if (!lobby) return;
        const player = lobby.players[socket.id];
        if (!player || player.isDead || !player.hasFlareAbility) return;
        if ((player.flareCooldown || 0) > 0) return;
        const angle = data.angle;
        const speed = 3;
        lobby.flares.push({
            x: player.x + Math.cos(angle) * PLAYER_SIZE * 1.5,
            y: player.y + Math.sin(angle) * PLAYER_SIZE * 1.5,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 480,
            visionRadius: 4 * TILE_SIZE,
            stopped: false,
        });
        player.flareCooldown = Math.round(300 * (player.hasteMult || 1));
    });

    socket.on('sniperShot', () => {
        const lobbyCode = socketToLobby[socket.id];
        if (!lobbyCode) return;
        const lobby = lobbies[lobbyCode];
        if (!lobby) return;
        const player = lobby.players[socket.id];
        if (!player || player.isDead || !player.hasScopeAbility) return;
        if ((player.sniperShotCooldown || 0) > 0) return;

        lobby.bullets.push({
            x: player.x + Math.cos(player.turretAngle) * PLAYER_SIZE * 1.5,
            y: player.y + Math.sin(player.turretAngle) * PLAYER_SIZE * 1.5,
            angle: player.turretAngle,
            speed: BULLET_SPEED * 2.5,
            bounces: 0,
            wallPiercing: true,
            allyPassthrough: true,
            hp: 5,
            owner: socket.id,
        });
        // Recoil — kick backward from shot direction
        player.vx -= Math.cos(player.turretAngle) * 3.5;
        player.vy -= Math.sin(player.turretAngle) * 3.5;
        player.sniperShotCooldown = Math.round(120 * (player.hasteMult || 1)); // 2 s base
    });

    socket.on('cannonShot', () => {
        const lobbyCode = socketToLobby[socket.id];
        if (!lobbyCode) return;
        const lobby = lobbies[lobbyCode];
        if (!lobby || lobby.mode === 'lobby') return;
        const player = lobby.players[socket.id];
        if (!player || player.isDead || !player.hasCannonAbility) return;
        if ((player.cannonCooldown || 0) > 0) return;

        const angle = player.turretAngle;
        const ox = Math.cos(angle) * PLAYER_SIZE * 1.5;
        const oy = Math.sin(angle) * PLAYER_SIZE * 1.5;
        lobby.bullets.push({
            id: lobby.bullets.length,
            owner: socket.id,
            x: player.x + ox,
            y: player.y + oy,
            angle,
            speed: BULLET_SPEED * 2.8,
            bounces: 1,
            isCannonball: true,
            isHeavyCannonball: true,
            allyPassthrough: true,
            hp: 2,
            splashRadius: PLAYER_SIZE * 6,
            explosionSize: BULLET_SIZE * 10,
        });
        player.cannonCooldown = Math.round(600 * (player.hasteMult || 1)); // 10 s base
        io.to(lobbyCode).emit('explosion', {
            x: player.x + ox, y: player.y + oy,
            z: PLAYER_SIZE * 1.4, size: BULLET_SIZE * 1.5, dSize: 1, color: [230, 120, 30],
        });
    });

    socket.on('companionRally', (data) => {
        const lobbyCode = socketToLobby[socket.id];
        if (!lobbyCode) return;
        const lobby = lobbies[lobbyCode];
        if (!lobby || !lobby.companions || lobby.mode === 'lobby') return;
        const player = lobby.players[socket.id];
        if (!player || player.isDead || player.selectedClass !== 'engineer') return;
        if (isCollidingWithWall(data.x, data.y, PLAYER_SIZE * 0.6, lobby.level)) return;

        // Always set rally for existing living companions
        for (const comp of Object.values(lobby.companions)) {
            if (comp.ownerId === socket.id && !comp.isDead) {
                comp.rallyPoint = { x: data.x, y: data.y };
                comp.pathWaypoints = null; // replan toward rally
            }
        }
        player.lastRallyPoint = { x: data.x, y: data.y };

        // If cooldown is ready, spawn a new companion at the rally position
        if ((player.companionSpawnCooldown || 0) <= 0) {
            spawnCompanionForPlayer(lobby, socket.id, player, data.x, data.y);
        }
    });

    socket.on('barrageStart', () => {
        const lobbyCode = socketToLobby[socket.id];
        if (!lobbyCode) return;
        const lobby = lobbies[lobbyCode];
        if (!lobby) return;
        const player = lobby.players[socket.id];
        if (!player || player.isDead || !player.hasBarrageAbility) return;
        if (player.barrageCooldown > 0 || player.barrageActive) return;
        player.barrageActive = true;
        player.barrageShots = 16;
        player.barrageTick = 0;
    });

    socket.on('activatePillage', () => {
        const lobbyCode = socketToLobby[socket.id];
        if (!lobbyCode) return;
        const lobby = lobbies[lobbyCode];
        if (!lobby || lobby.mode === 'lobby') return;
        const player = lobby.players[socket.id];
        if (!player || player.isDead || player.selectedClass !== 'assault') return;
        if ((player.pillageCharge || 0) < 100) return;

        const buff = pickWeightedBuff(player);
        if (player.buffs && player.buffs.hasOwnProperty(buff)) {
            player.buffs[buff] += 1;
        }
        player.pillageCharge = Math.max(0, player.pillageCharge - 100);
        io.to(lobbyCode).emit('updatePlayerBuffs', { playerId: player.id, buffs: player.buffs });
    });

    socket.on('createPlayer', () => {
        const lobby = getLobby()
        lobby.players[socket.id] = createPlayer()
    });

    // Dev: toggle invincibility for the calling player
    socket.on('toggleGodMode', () => {
        const lobby = getLobby();
        const player = lobby?.players[socket.id];
        if (!player) return;
        player.godMode = !player.godMode;
        console.log(`God mode ${player.godMode ? 'ON' : 'OFF'} for ${socket.id}`);
        io.to(socket.id).emit('godModeStatus', player.godMode);
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
            const remainingPlayers = Object.entries(lobby.players).reduce((acc, [_, player]) => acc +
                (!player.isAI ? 1 : 0), 0);

            if (remainingPlayers === 0) {
                delete lobbies[lobbyCode];
                console.log(`Lobby ${lobbyCode} deleted as it is empty.`);
            }
        }
        if (socketToNames[socket.id]) {
            delete socketToNames[socket.id];
        }
    });
});

// Fires chain bullets from a kill site on behalf of owner; chainDepth limits recursion to 2
function triggerChain(lobby, lobbyCode, owner, killedPlayer, sourceDepth) {
    const chainStacks = owner.buffs?.chain || 0;
    if (chainStacks <= 0) return;
    const depth = sourceDepth || 0;
    if (depth >= 2) return;

    const players = lobby.players;
    const bullets = lobby.bullets;
    const explosiveStacks = owner.buffs?.explosive || 0;
    const isExplosive = explosiveStacks > 0;
    const splashMult = explosiveStacks > 0 ? 1 + 0.5 * Math.sqrt(explosiveStacks) : 1;
    const chainCount = chainStacks + 1;

    const targets = Object.values(players)
        .filter(t => t.isAI && !t.isDead && t.id !== killedPlayer.id)
        .sort((a, b) => Math.hypot(a.x - killedPlayer.x, a.y - killedPlayer.y) - Math.hypot(b.x - killedPlayer.x, b.y - killedPlayer.y))
        .slice(0, chainCount);

    for (const target of targets) {
        const cAngle = Math.atan2(target.y - killedPlayer.y, target.x - killedPlayer.x);
        bullets.push({
            id: bullets.length + Math.random(),
            owner: owner.id,
            x: killedPlayer.x,
            y: killedPlayer.y,
            angle: cAngle,
            speed: (owner.bulletSpeed || BULLET_SPEED) * 1.6,
            bounces: owner.bulletBounces || 0,
            hp: 1 + (owner.piercing || 0),
            isChainBullet: true,
            chainDepth: depth + 1,
            hasSplash: isExplosive || undefined,
            splashRadius: isExplosive ? PLAYER_SIZE * 2.5 * splashMult : undefined,
            explosionSize: isExplosive ? BULLET_SIZE * 3.5 * splashMult : undefined,
        });
    }

    if (targets.length > 0) {
        io.to(lobbyCode).emit('chainRays', {
            x: killedPlayer.x,
            y: killedPlayer.y,
            targets: targets.map(t => ({ x: t.x, y: t.y })),
        });
    }
}

function fireLaser(lobby, lobbyCode, tank, players, level, isActive) {
    const angle = tank.turretAngle;
    let laserEnd = { x: tank.x, y: tank.y };
    const stepSize = 5; // Precision of laser steps
    const maxDistance = TILE_SIZE * 20; // Maximum laser range

    for (let i = 0; i < maxDistance; i += stepSize) {
        const x = tank.x + Math.cos(angle) * i;
        const y = tank.y + Math.sin(angle) * i;

        if (isWall(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE), level)) {
            laserEnd = { x, y }; // Stop at the wall
            break;
        }

        let done = false;
        for (const id in players) {
            const player = players[id];
            if (player.isAI && !player.isDead && isCollidingWithPlayer(x, y, player, 0)) {
                laserEnd = { x, y }; // Stop at the player
                if (isActive) { // Damage ticks every 5 frames
                    if (true || lobby.mode !== 'lobby' || player.isAI) // No player damage in lobby

                        // Apply damage to the player
                        if ((player.laserShieldCooldown || 0) > 0) {
                            // Cooldown active — block all laser damage (prevents insta-kill after shield strip)
                            done = true;
                            break;
                        } else if (player.shield) {
                            player.shield = false; // Remove shield instead of killing
                            player.laserShieldCooldown = 30; // 0.5 s cooldown to prevent immediate follow-up damage
                        } else if (!player.spawnGrace) {
                            player.isDead = true;
                            if (player.isAI && player.tier !== 'chest' && !tank.isAI) {
                                tank.kills = (tank.kills || 0) + 1;
                                triggerChain(lobby, lobbyCode, tank, player, 0);
                            }
                            if (!player.isAI) {
                                player.deaths = (player.deaths || 0) + 1;
                            }

                            // Chest killed by laser — spawn drop (same as bullet kill)
                            if (player.tier === 'chest' && !tank.isAI) {
                                spawnDrop(lobbyCode, player.x, player.y, tank);
                            }

                            let color = player.id; // indicates human player hit
                            if (player.isAI) {
                                color = player.color;
                            }
                            if (player.shield) {
                                color = [50, 100, 255];
                            }

                            io.to(lobbyCode).emit('explosion', {
                                x: player.x,
                                y: player.y,
                                z: PLAYER_SIZE,
                                size: 15,
                                dSize: 2,
                                color: color,
                            });

                        }
                }
                // HIT
                done = true;
                break;
            }
        }
        if (done) {
            break;
        }
    }


    const dx = 1.3 * Math.cos(tank.turretAngle) * (PLAYER_SIZE + BULLET_SIZE) + tank.max_speed * Math.cos(tank.angle);
    const dy = 1.3 * Math.sin(tank.turretAngle) * (PLAYER_SIZE + BULLET_SIZE) + tank.max_speed * Math.sin(tank.angle);

    const laserX = tank.x + dx;
    const laserY = tank.y + dy;

    lobby.lasers.push({
        x1: laserX,
        y1: laserY,
        x2: laserEnd.x,
        y2: laserEnd.y,
        isActive: isActive, // Active state of the laser
        duration: 5, // short so channeled beams always look fresh
    });
}

function explodeCannonball(lobby, lobbyCode, bullet, bulletsToRemove, i) {
    const splashRadius = bullet.splashRadius || PLAYER_SIZE * 4;
    const players = lobby.players;
    for (const playerId in players) {
        const player = players[playerId];
        if (player.isDead) continue;
        if (Math.hypot(player.x - bullet.x, player.y - bullet.y) > splashRadius) continue;
        const owner = players[bullet.owner];
        if (lobby.mode !== 'lobby' || player.isAI) {
            if (!owner || lobby.friendlyFire || lobby.mode === 'arena' || (player.isAI !== owner.isAI)) {
                if (player.shield) {
                    player.shield = false;
                } else if (!player.godMode && !player.spawnGrace) {
                    player.isDead = true;
                    if (player.isAI && player.tier !== 'chest') {
                        const killer = players[bullet.owner];
                        if (killer && !killer.isAI) {
                            killer.kills = (killer.kills || 0) + 1;
                            triggerChain(lobby, lobbyCode, killer, player, bullet.chainDepth || 0);
                        }
                    }
                    if (!player.isAI) {
                        player.deaths = (player.deaths || 0) + 1;
                    }
                    if (lobby.mode === 'survival' && player.tier !== 'chest' && player.isAI) {
                        lobby.tankKills++;
                        if (lobby.tankKills % 5 === 0) spawnDrop(lobbyCode, player.x, player.y, owner);
                    }
                }
            }
        }
        if (player.tier === 'chest') spawnDrop(lobbyCode, player.x, player.y, owner);
    }
    // Destroy interior walls in splash radius (cannoneer heavy cannon only)
    if (bullet.isHeavyCannonball && lobby.level) {
        const level = lobby.level;
        const rows = level.length;
        const cols = level[0]?.length || 0;
        const minRow = Math.max(1, Math.floor((bullet.y - splashRadius) / TILE_SIZE));
        const maxRow = Math.min(rows - 2, Math.ceil((bullet.y + splashRadius) / TILE_SIZE));
        const minCol = Math.max(1, Math.floor((bullet.x - splashRadius) / TILE_SIZE));
        const maxCol = Math.min(cols - 2, Math.ceil((bullet.x + splashRadius) / TILE_SIZE));
        const destroyedTiles = [];
        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                if (!level[r] || level[r][c] <= 0) continue;
                const wx = (c + 0.5) * TILE_SIZE;
                const wy = (r + 0.5) * TILE_SIZE;
                if (Math.hypot(wx - bullet.x, wy - bullet.y) > splashRadius) continue;
                level[r][c] = 0;
                destroyedTiles.push({ row: r, col: c });
            }
        }
        if (destroyedTiles.length > 0) {
            io.to(lobbyCode).emit('tilesUpdated', destroyedTiles);
        }
    }

    // Destroy bullets caught in the explosion (never destroy owner's own bullets)
    lobby.bullets.forEach((b, j) => {
        if (j === i || bulletsToRemove.has(j)) return;
        if (b.owner === bullet.owner) return;
        if (Math.hypot(b.x - bullet.x, b.y - bullet.y) <= splashRadius) {
            bulletsToRemove.add(j);
        }
    });
    bulletsToRemove.add(i);
    io.to(lobbyCode).emit('explosion', {
        x: bullet.x,
        y: bullet.y,
        z: PLAYER_SIZE * 1.4 - BULLET_SIZE,
        size: bullet.explosionSize || BULLET_SIZE * 4,
        dSize: 1.5,
    });
}

function updateBullets(lobby, lobbyCode) {
    const bulletsToRemove = new Set();
    const hitThisTick = new Set(); // bullets that already took damage this tick (prevents multi-hit in one frame)
    const bullets = lobby.bullets
    const players = lobby.players
    const level = lobby.level
    if (!level) return;

    bullets.forEach((bullet, i) => {
        // Homing: curve player bullets toward nearest AI enemy
        if (!bullet.isCannonball && !bullet.wallPiercing && !bullet.isTurretBullet && !bullet.hasSplash) {
            const owner = players[bullet.owner];
            if (owner && !owner.isAI && (owner.buffs?.homing || 0) > 0) {
                let nearestDist = TILE_SIZE * 10, nearestAngle = null;
                for (const pid in players) {
                    const t = players[pid];
                    if (!t.isAI || t.isDead) continue;
                    const d = Math.hypot(t.x - bullet.x, t.y - bullet.y);
                    if (d < nearestDist) { nearestDist = d; nearestAngle = Math.atan2(t.y - bullet.y, t.x - bullet.x); }
                }
                if (nearestAngle !== null) {
                    const turnRate = 0.05 * Math.sqrt(owner.buffs.homing);
                    let diff = nearestAngle - bullet.angle;
                    while (diff > Math.PI) diff -= 2 * Math.PI;
                    while (diff < -Math.PI) diff += 2 * Math.PI;
                    bullet.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnRate);
                }
            }
        }

        // Tick slowed timer
        if (bullet.slowed) {
            bullet.slowedTimer--;
            if (bullet.slowedTimer <= 0) {
                bullet.speed = bullet._baseSpeed;
                bullet.slowed = false;
            }
        }

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

        // Move bullet and handle wall collisions
        if (bullet.wallPiercing) {
            // Pass through walls — just advance straight, cull when off map
            bullet.x += Math.cos(bullet.angle) * bullet.speed;
            bullet.y += Math.sin(bullet.angle) * bullet.speed;
            const mapW = (level[0]?.length || 0) * TILE_SIZE;
            const mapH = level.length * TILE_SIZE;
            if (bullet.x < 0 || bullet.y < 0 || bullet.x > mapW || bullet.y > mapH) {
                bulletsToRemove.add(i); return;
            }
        } else {
            if (horizontalCollision && verticalCollision) {
                const dx = Math.cos(bullet.angle), dy = Math.sin(bullet.angle);
                bullet.angle = Math.abs(dx) > Math.abs(dy) ? Math.PI - bullet.angle : -bullet.angle;
            } else if (horizontalCollision) {
                bullet.angle = Math.PI - bullet.angle;
            } else if (verticalCollision) {
                bullet.angle = -bullet.angle;
            }
            bullet.x += Math.cos(bullet.angle) * bullet.speed;
            bullet.y += Math.sin(bullet.angle) * bullet.speed;

            if (horizontalCollision || verticalCollision) {
                if (bullet.isCannonball) {
                    explodeCannonball(lobby, lobbyCode, bullet, bulletsToRemove, i);
                } else if (bullet.bounces > 0) {
                    bullet.bounces--;
                } else {
                    io.to(lobbyCode).emit('explosion', {
                        x: bullet.x, y: bullet.y,
                        z: bullet.isTurretBullet ? PLAYER_SIZE * 2.4 : PLAYER_SIZE * 1.4 - BULLET_SIZE,
                        size: BULLET_SIZE, dSize: 0.5
                    });
                    bulletsToRemove.add(i);
                }
                return;
            }
        }


        // Check for collisions with other bullets
        bullets.forEach((otherBullet, j) => {
            if (bulletsToRemove.has(i) || hitThisTick.has(i)) return;
            if (i === j || bulletsToRemove.has(j) || hitThisTick.has(j)) return;
            // Same owner bullets never collide with each other
            if (bullet.owner === otherBullet.owner) return;
            const dx = bullet.x - otherBullet.x;
            const dy = bullet.y - otherBullet.y;
            if (dx * dx + dy * dy >= (2 * BULLET_SIZE) * (2 * BULLET_SIZE)) return;

            // Generic hp system: each bullet deals 1 damage to the other
            bullet.hp = (bullet.hp ?? 1) - 1;
            otherBullet.hp = (otherBullet.hp ?? 1) - 1;
            if (bullet.hp <= 0) bulletsToRemove.add(i); else hitThisTick.add(i);
            if (otherBullet.hp <= 0) bulletsToRemove.add(j); else hitThisTick.add(j);

            const cannonInvolved = bullet.isCannonball || bullet.isHeavyCannonball || otherBullet.isCannonball || otherBullet.isHeavyCannonball;
            io.to(lobbyCode).emit('explosion', {
                x: (bullet.x + otherBullet.x) / 2,
                y: (bullet.y + otherBullet.y) / 2,
                z: PLAYER_SIZE * 1.4 - BULLET_SIZE,
                size: cannonInvolved ? BULLET_SIZE * 2.5 : BULLET_SIZE,
                dSize: cannonInvolved ? 1.0 : 0.5,
            });
        });

        // Check for bullet interception by Shield Tanks (tier 9 AI) or Guardian players
        for (const playerId in players) {
            if (bulletsToRemove.has(i)) break;
            const shieldTank = players[playerId];
            const isAIShield = shieldTank.isAI && shieldTank.tier === 9;
            const isPlayerGuardian = !shieldTank.isAI && shieldTank.hasShieldAbility;
            if ((!isAIShield && !isPlayerGuardian) || !shieldTank.shieldActive || shieldTank.isDead) continue;
            if (bullet.owner === shieldTank.id) continue; // never block own shots

            const sf = shieldTank.shieldFacing;
            const shieldDist = PLAYER_SIZE * 1.5;
            const scx = shieldTank.x + Math.cos(sf) * shieldDist;
            const scy = shieldTank.y + Math.sin(sf) * shieldDist;

            const dx = bullet.x - scx;
            const dy = bullet.y - scy;
            const along = dx * Math.cos(sf) + dy * Math.sin(sf);
            const perp = -dx * Math.sin(sf) + dy * Math.cos(sf);

            if (Math.abs(along) <= PLAYER_SIZE * 0.5 && Math.abs(perp) <= PLAYER_SIZE * 2.5) {
                // Bullet is inside the shield zone — only intercept if coming from the front
                const bulletDotNormal = Math.cos(bullet.angle) * Math.cos(sf) + Math.sin(bullet.angle) * Math.sin(sf);
                if (bulletDotNormal < 0) {
                    bulletsToRemove.add(i);
                    io.to(lobbyCode).emit('explosion', {
                        x: bullet.x,
                        y: bullet.y,
                        z: PLAYER_SIZE,
                        size: BULLET_SIZE * 2,
                        dSize: 0.5,
                        color: [100, 150, 255],
                    });
                }
            }
        }

        // Companion mini-tanks: destroyed by AI bullets (no respawn until next round)
        if (lobby.companions) {
            for (const ownerId in lobby.companions) {
                if (bulletsToRemove.has(i)) break;
                const companion = lobby.companions[ownerId];
                if (companion.isDead || companion.spawnGrace > 0) continue;
                if (bullet.owner === companion.ownerId) continue; // engineer's own bullets don't hurt companion
                const bulletOwner = players[bullet.owner];
                if (!bulletOwner || !bulletOwner.isAI) continue; // only AI bullets can kill companion
                const dx = bullet.x - companion.x;
                const dy = bullet.y - companion.y;
                if (Math.hypot(dx, dy) < PLAYER_SIZE * 0.8) {
                    bulletsToRemove.add(i);
                    if (companion.shield) {
                        companion.shield = false;
                    } else {
                        companion.isDead = true;
                        io.to(lobbyCode).emit('explosion', {
                            x: companion.x, y: companion.y,
                            z: PLAYER_SIZE, size: 10, dSize: 2,
                            color: [255, 211, 42],
                        });
                    }
                }
            }
        }

        // Check for collisions with players
        for (let playerId in players) {
            const player = players[playerId];
            if ((bullet.isTurretBullet || bullet.skipOwner) && playerId === bullet.owner) continue;
            // wallPiercing bullets from AI tanks (e.g. Phantom Sniper) pass through other AI tanks
            if (bullet.wallPiercing && player.isAI) {
                const bOwner = players[bullet.owner];
                if (bOwner && bOwner.isAI) continue;
            }
            if (player.isAI && player.wraithStealthed) continue; // Wraith invulnerable while stealthed
            if (/*playerId !== bullet.owner && */isCollidingWithPlayer(nextX, nextY, player)) {
                if (bullet.isCannonball || bullet.hasSplash) {
                    explodeCannonball(lobby, lobbyCode, bullet, bulletsToRemove, i);
                    break;
                }
                bullet.hp = (bullet.hp ?? 1) - 1;
                if (bullet.hp <= 0) bulletsToRemove.add(i);

                let color = player.id; // indicates human player hit
                let effect = null;
                if (player.isAI) {
                    color = player.color;
                }
                if (player.shield) {
                    color = [50, 100, 255];
                    effect = 'shield';
                }

                io.to(lobbyCode).emit('explosion', {
                    x: player.x,
                    y: player.y,
                    z: PLAYER_SIZE,
                    size: 10,
                    dSize: 2,
                    color: color,
                    effect: effect,
                });

                if (lobby.mode !== 'lobby' || player.isAI) {// No player damage in lobby
                    const owner = lobby.players[bullet.owner];

                    // Sniper pierce shot and cannonball pass through allies
                    if (bullet.allyPassthrough && !player.isAI && owner && !owner.isAI) break;

                    if (!owner || lobby.friendlyFire || lobby.mode === 'arena' || (player.isAI !== owner.isAI))
                        // Apply damage to the player
                        if (player.shield) {
                            player.shield = false; // Remove shield instead of killing
                        } else if (!player.godMode && !player.spawnGrace) {
                            player.isDead = true;
                            if (player.isAI && player.tier !== 'chest' && owner && !owner.isAI) {
                                owner.kills = (owner.kills || 0) + 1;
                                // Chain buff: fire bullets at nearby living enemies
                                triggerChain(lobby, lobbyCode, owner, player, bullet.chainDepth || 0);
                            }
                            if (!player.isAI) {
                                player.deaths = (player.deaths || 0) + 1;
                            }
                        }
                    // player.isDead = true;
                }

                if (player.tier == 'chest') {
                    const bulletOwner = lobby.players[bullet.owner];
                    if (!bulletOwner || !bulletOwner.isAI) {
                        spawnDrop(lobbyCode, player.x, player.y, bulletOwner);
                    }
                }

                if (lobby.mode === 'survival') {
                    if (player.tier !== 'chest' && player.isAI) {
                        lobby.tankKills++;
                        if (lobby.tankKills % 5 === 0) {
                            const bulletOwner = lobby.players[bullet.owner];
                            spawnDrop(lobbyCode, player.x, player.y, bulletOwner);
                        }
                    }
                }

                // Tank dies / takes damage
                if (lobby.mode === 'lobby') {
                    if (player.isAI && player.tier === 'button' && player.classId) {
                        // Class selection dummy — set the shooter's class
                        const shooter = lobby.players[bullet.owner];
                        if (shooter && !shooter.isAI) {
                            shooter.selectedClass = player.classId;
                            io.to(lobbyCode).emit('playerClassChanged', { playerId: bullet.owner, classId: player.classId });
                        }
                        player.isDead = false; // Dummy stays alive
                    }
                }
                if (bullet.hp > 0) continue; // still has hp, pierces to next target
                break;
            }
        }
    });

    lobby.bullets = bullets.filter((_, index) => !bulletsToRemove.has(index));
}

function handlePlayerMovement(lobby, player) {
    if (!lobby) return;
    // const players = lobby.players
    // const player = players[socket.id]
    if (!player || !player.input || player.isDead) {
        return;
    }

    const level = lobby.level;
    const input = player.input;

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

    // Update the turret angle (limited while channeling laser)
    if (player.laserChanneling) {
        const maxTurnRate = 0.05; // ~2.9 degrees per frame
        let diff = input.turretAngle - player.turretAngle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        player.turretAngle += Math.sign(diff) * Math.min(Math.abs(diff), maxTurnRate);
    } else {
        player.turretAngle = input.turretAngle;
    }

    // Guardian shield — held while right-click held and energy available
    if (player.hasShieldAbility) {
        if (input.shieldActive && !player.shieldDepleted && (player.shieldEnergy || 0) > 0) {
            player.shieldActive = true;
            player.shieldFacing = player.turretAngle;
        } else {
            player.shieldActive = false;
        }
    }

    // const lobbyCode = socketToLobby[socket];
    // io.to(lobbyCode).emit('updatePlayers', players);
}

// Lobby mode-select zones (right section, col 17) — player stands in zone for ZONE_HOLD_FRAMES to activate
const LOBBY_ZONES = [
    { col: 15, row: 2, mode: 'campaign', label: 'CAMPAIGN', color: [80, 220, 120] },
    { col: 15, row: 5, mode: 'arena', label: 'ARENA', color: [220, 80, 80] },
    { col: 15, row: 8, mode: 'survival', label: 'SURVIVAL', color: [220, 160, 60] },
    { col: 15, row: 11, mode: 'endless', label: 'ENDLESS', color: [140, 100, 220] },
];
const ZONE_RADIUS = TILE_SIZE * 1.2;
const ZONE_HOLD_FRAMES = 180; // 3 seconds at 60 fps

// Class dummy positions — two rows of 4 spread across the open lobby
// Row 2 faces down (toward center), Row 11 faces up (toward center)
const CLASS_DUMMY_POSITIONS = [
    { col: 2, row: 2, angle: Math.PI / 2 },
    { col: 5, row: 2, angle: Math.PI / 2 },
    { col: 8, row: 2, angle: Math.PI / 2 },
    { col: 11, row: 2, angle: Math.PI / 2 },
    { col: 2, row: 11, angle: -Math.PI / 2 },
    { col: 5, row: 11, angle: -Math.PI / 2 },
    { col: 8, row: 11, angle: -Math.PI / 2 },
    { col: 11, row: 11, angle: -Math.PI / 2 },
];

function hexToRgb(hex) {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];
}

function applyClassBuffs(player) {
    const cls = TANK_CLASSES.find(c => c.id === (player.selectedClass || 'assault'));
    if (!cls) return;
    for (const [buffType, stacks] of Object.entries(cls.buffs)) {
        if (player.buffs.hasOwnProperty(buffType)) {
            player.buffs[buffType] += stacks;
        }
    }
    player.hasLaserAbility = cls.special === 'laser';
    player.hasShieldAbility = cls.special === 'shield';
    player.hasFlareAbility = cls.special === 'flare';
    player.hasBarrageAbility = cls.special === 'barrage';
    player.hasScopeAbility = cls.special === 'scope';
    player.hasCannonAbility = cls.special === 'cannon';
    player.laserEnergy = 100;
    player.laserDepleted = false;
    player.shieldEnergy = 100;
    player.shieldDepleted = false;
    player.shieldActive = false;
    player.flareCooldown = 0;
    player.barrageCooldown = 0;
    player.barrageActive = false;
    player.barrageShots = 0;
    player.barrageTick = 0;
    player.sniperShotCooldown = 0;
    player.cannonCooldown = 0;
}

function resetBuffs(player) {
    player.buffs = {
        speed: 0,
        fireRate: 0,
        shield: 0,
        bulletSpeed: 0,
        bulletBounces: 0,
        maxBullets: 0,
        multiShot: 0,
        visionRange: 0,
        piercing: 0,
        autoTurret: 0,
        explosive: 0,  // bullets deal small splash on player hit
        // homing: 0,     // bullets curve toward nearest enemy
        regen: 0,      // passively restores shield over time
        chain: 0,      // killing an enemy fires chain bullets at nearby enemies
        orbit: 0,      // orbiting orbs that intercept incoming bullets
        haste: 0,      // reduces all ability cooldowns and energy drain
        currentFireCooldown: 0,
    };
}

function updatePlayerStats(lobby, player) {
    if (!player.buffs) return;
    if (player.isDead) return;

    player.fireRateMultiplier = 1;
    // player.shield = false;
    player.bulletSpeedMultiplier = 1;
    player.multiShot = 1;
    player.bulletBounces = 0;

    switch (lobby.mode) {
        case 'campaign':
        case 'endless':
            player.visionDistance = 5 * TILE_SIZE
            player.max_speed = MAX_SPEED;
            player.maxBullets = 6;
            player.bulletBounces = 1;
            break;
        case 'survival':
            player.visionDistance = 5 * TILE_SIZE
            player.max_speed = 0.7 * MAX_SPEED;
            break;
        case 'arena':
            player.visionDistance = 7 * TILE_SIZE
            break;
        default:
            player.visionDistance = 100 * TILE_SIZE
            player.max_speed = MAX_SPEED * 1.4;
            player.maxBullets = 6;
            // player.bulletBounces = 0;
            break;
    }

    // Apply buffs — sqrt diminishing returns for positive, linear penalty for negative
    if (player.buffs.speed > 0) {
        player.max_speed *= 1 + 0.12 * Math.sqrt(player.buffs.speed);
    } else if (player.buffs.speed < 0) {
        player.max_speed *= Math.max(0.3, 1 + player.buffs.speed * 0.15);
    }

    // Fire-rate buff: faster (positive) or slower (negative)
    const fireRateBulletBonus = player.buffs.fireRate > 0
        ? Math.ceil(Math.sqrt(player.buffs.fireRate)) : 0;
    if (player.buffs.fireRate > 0) {
        player.fireRateMultiplier = Math.max(0.35, 1 - 0.09 * Math.sqrt(player.buffs.fireRate));
    } else if (player.buffs.fireRate < 0) {
        player.fireRateMultiplier = Math.min(2.5, 1 + Math.sqrt(-player.buffs.fireRate) * 0.15);
    }

    if (player.buffs.shield > 0) {
        if (!player.shield) {
            player.shield = true;
            player.buffs.shield--;
        }
    }

    if ((player.laserShieldCooldown || 0) > 0) {
        player.laserShieldCooldown--;
    }

    // Regen: passively restore shield after a cooldown period
    if ((player.buffs.regen || 0) > 0 && !player.shield && !player.spawnGrace) {
        const period = Math.round(900 / Math.sqrt(player.buffs.regen)); // ~15s, 10s, 7.5s...
        player._regenTimer = ((player._regenTimer ?? period) - 1);
        if (player._regenTimer <= 0) {
            player.shield = true;
            player._regenTimer = period;
        }
    } else if (player.shield) {
        player._regenTimer = null; // reset so next cycle starts fresh
    }

    // Pillage charge: assault earns 10 charge per kill
    if (player.selectedClass === 'assault' && lobby.mode !== 'lobby') {
        const newKills = player.kills || 0;
        const prevKills = player._lastPillageKills || 0;
        if (newKills > prevKills) {
            player.pillageCharge = (player.pillageCharge || 0) + (newKills - prevKills) * 10 / (player.hasteMult || 1);
        }
        player._lastPillageKills = newKills;
    }

    if (player.buffs.bulletSpeed > 0) {
        player.bulletSpeedMultiplier *= 1 + 0.12 * Math.sqrt(player.buffs.bulletSpeed);
    } else if (player.buffs.bulletSpeed < 0) {
        player.bulletSpeedMultiplier *= Math.max(0.3, 1 + player.buffs.bulletSpeed * 0.15);
    }

    if (player.buffs.multiShot > 0) {
        player.multiShot += Math.ceil(Math.sqrt(player.buffs.multiShot));
    }

    if (player.buffs.bulletBounces !== 0) {
        player.bulletBounces += player.buffs.bulletBounces > 0
            ? Math.ceil(Math.sqrt(player.buffs.bulletBounces))
            : player.buffs.bulletBounces;
        player.bulletBounces = Math.max(0, player.bulletBounces);
    }

    if (player.buffs.visionRange > 0) {
        player.visionDistance *= 1 + 0.3 * Math.sqrt(player.buffs.visionRange);
        player.visionCornerBoost = 1;
    } else if (player.buffs.visionRange < 0) {
        player.visionDistance *= Math.max(0.2, 1 - 0.2 * Math.sqrt(-player.buffs.visionRange));
        player.visionCornerBoost = 0;
    } else {
        player.visionCornerBoost = 0;
    }

    player.piercing = player.buffs.piercing > 0
        ? Math.ceil(Math.sqrt(player.buffs.piercing)) : 0;

    // Haste: reduces all ability cooldowns and energy drain (sqrt diminishing returns)
    const hastStacks = player.buffs.haste || 0;
    player.hasteMult = hastStacks > 0 ? 1 / (1 + 0.25 * Math.sqrt(hastStacks)) : 1;

    // maxBullets buff: additive to base value, clamped to minimum 1
    if (player.buffs.maxBullets !== 0) {
        player.maxBullets = Math.max(1, player.maxBullets + player.buffs.maxBullets);
    }

    switch (lobby.mode) {
        case 'survival':
            player.bulletSpeed = 0.7 * BULLET_SPEED * player.bulletSpeedMultiplier
            break;
        case 'campaign':
        case 'endless':
            player.bulletSpeed = 1.1 * BULLET_SPEED * player.bulletSpeedMultiplier
            break;
        default:
            player.bulletSpeed = BULLET_SPEED * player.bulletSpeedMultiplier
            break;
    }
    player.playerFireCooldown = 60 * player.fireRateMultiplier;

    // Apply fireRate bullet bonus on top of class base
    player.maxBullets += fireRateBulletBonus;

    // Laser energy: drains via fireLaser events, recharges passively
    if (player.hasLaserAbility) {
        player.laserChanneling = false; // reset each tick; fireLaser handler re-sets if fired
        player.laserEnergy = Math.min(100, (player.laserEnergy || 0) + 0.15 / (player.hasteMult || 1));
        if (player.laserDepleted && player.laserEnergy >= 25) player.laserDepleted = false;
    }

    // Shield energy: drains while active, recharges while inactive
    if (player.hasShieldAbility) {
        if (player.shieldActive) {
            player.shieldEnergy -= 0.6 * (player.hasteMult || 1);
            if (player.shieldEnergy <= 0) {
                player.shieldEnergy = 0;
                player.shieldDepleted = true;
                player.shieldActive = false;
            }
        } else {
            player.shieldEnergy = Math.min(100, (player.shieldEnergy || 0) + 0.5 / (player.hasteMult || 1));
            if (player.shieldDepleted && player.shieldEnergy >= 25) player.shieldDepleted = false;
        }
    }

    if (player.hasFlareAbility && player.flareCooldown > 0) player.flareCooldown--;
    if (player.hasBarrageAbility && player.barrageCooldown > 0) player.barrageCooldown--;
    if (player.hasScopeAbility && player.sniperShotCooldown > 0) player.sniperShotCooldown--;
    if (player.hasCannonAbility && player.cannonCooldown > 0) player.cannonCooldown--;
    if (player.selectedClass === 'engineer' && (player.companionSpawnCooldown || 0) > 0) {
        player.companionSpawnCooldown--;
    }

    player.currentFireCooldown--;
    if (player.spawnGrace > 0) player.spawnGrace--;
}

function updateFlares(lobby, lobbyCode) {
    if (!lobby.flares || !lobby.flares.length) return;
    lobby.flares = lobby.flares.filter(flare => {
        flare.life--;
        if (flare.life <= 0) return false;
        if (!flare.stopped) {
            const nx = flare.x + flare.vx;
            const ny = flare.y + flare.vy;

            // Check collision with enemy tanks
            let hitTank = false;
            for (const tank of Object.values(lobby.players)) {
                if (!tank.isAI || tank.isDead) continue;
                if (Math.hypot(tank.x - nx, tank.y - ny) <= PLAYER_SIZE + BULLET_SIZE) {
                    hitTank = true;
                    break;
                }
            }

            if (isCollidingWithWall(nx, ny, BULLET_SIZE, lobby.level) || hitTank) {
                flare.stopped = true;
                // Stun nearby AI on landing
                const stunRadius = 3 * TILE_SIZE;
                let anyStunned = false;
                for (const tank of Object.values(lobby.players)) {
                    if (!tank.isAI || tank.isDead) continue;
                    if (Math.hypot(tank.x - flare.x, tank.y - flare.y) <= stunRadius) {
                        tank.disoriented = 150; // 2.5 s at 60 fps
                        anyStunned = true;
                    }
                }
                // Rays burst at impact
                io.to(lobbyCode).emit('explosion', {
                    x: flare.x, y: flare.y, z: PLAYER_SIZE,
                    size: anyStunned ? 32 : 18,
                    effect: 'stun',
                });
            } else {
                flare.x = nx;
                flare.y = ny;
            }
        }
        return true;
    });
    io.to(lobbyCode).emit('updateFlares', lobby.flares);
}

function autoSpawnCompanionIfReady(lobby, playerId, player) {
    if (player.isAI || player.isDead) return;
    if (player.selectedClass !== 'engineer') return;
    if (lobby.mode === 'lobby') return;
    if ((player.companionSpawnCooldown || 0) !== 0) return;
    if (!lobby.companions) return;
    const offsets = [[0, 0], [40, 0], [-40, 0], [0, 40], [0, -40], [40, 40], [-40, 40], [40, -40], [-40, -40]];
    let spawnX = player.x, spawnY = player.y;
    for (const [ox, oy] of offsets) {
        if (!isCollidingWithWall(player.x + ox, player.y + oy, PLAYER_SIZE * 0.6, lobby.level)) {
            spawnX = player.x + ox; spawnY = player.y + oy; break;
        }
    }
    spawnCompanionForPlayer(lobby, playerId, player, spawnX, spawnY);
}

function spawnCompanionForPlayer(lobby, playerId, player, spawnX, spawnY) {
    const idx = player.companionCount || 1;
    const initWander = Math.random() * Math.PI * 2;
    lobby.companions[`${playerId}_${idx}`] = {
        x: spawnX, y: spawnY,
        vx: 0, vy: 0,
        angle: 0, turretAngle: 0,
        ownerId: playerId,
        isDead: false,
        shield: true,
        fireCooldown: 90,
        spawnGrace: 60,
        rallyPoint: player.lastRallyPoint || null,
        wanderAngle: initWander,
        wanderTargetAngle: initWander,
        wanderTimer: 0,
    };
    player.companionCount = idx + 1;
    player.companionSpawnCooldown = Math.round(1800 * (player.hasteMult || 1));
}

function bfsPath(level, startX, startY, endX, endY) {
    const rows = level.length;
    const cols = level[0]?.length || 0;
    const sr = Math.floor(startY / TILE_SIZE);
    const sc = Math.floor(startX / TILE_SIZE);
    const er = Math.floor(endY / TILE_SIZE);
    const ec = Math.floor(endX / TILE_SIZE);
    if (sr === er && sc === ec) return [];
    const parent = new Map();
    const startKey = `${sr},${sc}`;
    parent.set(startKey, null);
    const queue = [[sr, sc]];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    let found = false;
    while (queue.length > 0) {
        const [r, c] = queue.shift();
        if (r === er && c === ec) { found = true; break; }
        for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (level[nr][nc] > 0) continue;
            if (dr !== 0 && dc !== 0 && (level[r][nc] > 0 || level[nr][c] > 0)) continue;
            const key = `${nr},${nc}`;
            if (parent.has(key)) continue;
            parent.set(key, `${r},${c}`);
            queue.push([nr, nc]);
        }
    }
    if (!found) return null;
    const path = [];
    let cur = `${er},${ec}`;
    while (cur && cur !== startKey) {
        const [r, c] = cur.split(',').map(Number);
        path.unshift({ x: (c + 0.5) * TILE_SIZE, y: (r + 0.5) * TILE_SIZE });
        cur = parent.get(cur);
    }
    return path;
}

function updateCompanions(lobby, lobbyCode) {
    if (!lobby.companions) return;
    for (const ownerId in lobby.companions) {
        const companion = lobby.companions[ownerId];
        if (companion.isDead) continue;
        const owner = lobby.players[companion.ownerId];
        if (!owner || owner.isDead) continue;

        if (companion.spawnGrace > 0) { companion.spawnGrace--; continue; }

        // Find nearest enemy to decide between chase and wander modes
        let nearestEnemy = null, nearestDist = 8 * TILE_SIZE;
        for (const pid in lobby.players) {
            const p = lobby.players[pid];
            if (!p.isAI || p.isDead) continue;
            const d = Math.hypot(p.x - companion.x, p.y - companion.y);
            if (d < nearestDist) { nearestDist = d; nearestEnemy = p; }
        }

        // --- Pathfinding via BFS waypoints ---
        // Determine the final destination
        let destX, destY;
        if (companion.rallyPoint) {
            destX = companion.rallyPoint.x;
            destY = companion.rallyPoint.y;
            if (Math.hypot(destX - companion.x, destY - companion.y) < 20) {
                companion.rallyPoint = null;
                companion.pathWaypoints = null;
            }
        } else {
            // Pick a new wander destination when needed
            companion.wanderTimer = (companion.wanderTimer || 0) - 1;
            if (companion.wanderTimer <= 0 || !companion.wanderDest) {
                const maxLeash = nearestEnemy ? 2 : 3;
                let picked = null;
                for (let attempt = 0; attempt < 16; attempt++) {
                    const a = Math.random() * Math.PI * 2;
                    const d = (0.5 + Math.random() * maxLeash) * TILE_SIZE;
                    const cx = owner.x + Math.cos(a) * d;
                    const cy = owner.y + Math.sin(a) * d;
                    if (!isCollidingWithWall(cx, cy, PLAYER_SIZE * 0.6, lobby.level)) {
                        picked = { x: cx, y: cy };
                        break;
                    }
                }
                companion.wanderDest = picked || { x: owner.x, y: owner.y };
                companion.pathWaypoints = null; // force replan
                companion.wanderTimer = 100 + Math.floor(Math.random() * 80);
            }
            destX = companion.wanderDest.x;
            destY = companion.wanderDest.y;
        }

        // Replan BFS path to destination when needed
        if (!companion.pathWaypoints || companion.pathWaypoints.length === 0) {
            companion.pathWaypoints = bfsPath(lobby.level, companion.x, companion.y, destX, destY) || [];
        }

        // Consume waypoints as they are reached
        while (companion.pathWaypoints.length > 0) {
            const wp = companion.pathWaypoints[0];
            if (Math.hypot(wp.x - companion.x, wp.y - companion.y) < TILE_SIZE * 0.55) {
                companion.pathWaypoints.shift();
            } else break;
        }

        // Steer toward the next waypoint (or destination if path empty)
        const nextWP = companion.pathWaypoints.length > 0 ? companion.pathWaypoints[0] : { x: destX, y: destY };
        const dx = nextWP.x - companion.x;
        const dy = nextWP.y - companion.y;
        const dist = Math.hypot(dx, dy);

        const speed = 1.6;
        if (dist > 8) {
            companion.vx = companion.vx * 0.75 + (dx / dist) * speed * 0.25;
            companion.vy = companion.vy * 0.75 + (dy / dist) * speed * 0.25;
            companion.angle = lerpAngle(companion.angle, Math.atan2(dy, dx), 0.12);
        } else {
            companion.vx *= 0.75;
            companion.vy *= 0.75;
        }

        // Repulsion from other companions to prevent stacking
        for (const otherId in lobby.companions) {
            if (otherId === ownerId) continue;
            const other = lobby.companions[otherId];
            if (other.isDead) continue;
            const rdx = companion.x - other.x;
            const rdy = companion.y - other.y;
            const rdist = Math.hypot(rdx, rdy);
            const minSep = PLAYER_SIZE * 2.2;
            if (rdist < minSep && rdist > 0.1) {
                const repulse = (minSep - rdist) / minSep * 2.5;
                companion.vx += (rdx / rdist) * repulse;
                companion.vy += (rdy / rdist) * repulse;
            }
        }

        // Wall collision: slide along walls cleanly
        const nx = companion.x + companion.vx;
        const ny = companion.y + companion.vy;
        if (!isCollidingWithWall(nx, companion.y, PLAYER_SIZE * 0.6, lobby.level)) {
            companion.x = nx;
        } else {
            companion.vx = 0;
            companion.pathWaypoints = null; // replan around obstacle
        }
        if (!isCollidingWithWall(companion.x, ny, PLAYER_SIZE * 0.6, lobby.level)) {
            companion.y = ny;
        } else {
            companion.vy = 0;
            companion.pathWaypoints = null;
        }

        // Auto-aim: only track and fire when a clear line of sight exists
        companion.fireCooldown--;
        if (nearestEnemy) {
            const angleToEnemy = Math.atan2(nearestEnemy.y - companion.y, nearestEnemy.x - companion.x);
            const hasLOS = !detectObstacleAlongRay(companion.x, companion.y, angleToEnemy, nearestDist, lobby.level);
            if (hasLOS) {
                companion.turretAngle = lerpAngle(companion.turretAngle, angleToEnemy, 0.18);
                const d = companion.turretAngle - angleToEnemy;
                const aimDiff = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
                if (companion.fireCooldown <= 0 && aimDiff < 0.15) {
                    lobby.bullets.push({
                        x: companion.x + Math.cos(companion.turretAngle) * PLAYER_SIZE,
                        y: companion.y + Math.sin(companion.turretAngle) * PLAYER_SIZE,
                        angle: companion.turretAngle,
                        speed: BULLET_SPEED * 0.85,
                        bounces: 1,
                        piercing: 0,
                        owner: companion.ownerId,
                        isTurretBullet: true,
                        bulletZ: PLAYER_SIZE * 1.1,
                    });
                    companion.fireCooldown = 90;
                }
            }
        }
    }
    io.to(lobbyCode).emit('updateCompanions', lobby.companions);
}

function updateBarrages(lobby, lobbyCode) {
    for (const playerId in lobby.players) {
        const player = lobby.players[playerId];
        if (!player.barrageActive) continue;

        player.barrageTick--;
        if (player.barrageTick > 0) continue;
        player.barrageTick = 3; // one bullet every 3 ticks ≈ 20/sec

        const spread = (Math.random() - 0.5) * 0.08;
        const angle = player.turretAngle + spread;
        lobby.bullets.push({
            x: player.x + Math.cos(angle) * PLAYER_SIZE * 2,
            y: player.y + Math.sin(angle) * PLAYER_SIZE * 2,
            angle,
            speed: (player.bulletSpeed || BULLET_SPEED) * 2,
            bounces: 0,
            hp: 1 + (player.piercing || 0),
            owner: playerId,
            skipOwner: true,
        });

        io.to(lobbyCode).emit('explosion', {
            x: player.x + Math.cos(angle) * PLAYER_SIZE * 2,
            y: player.y + Math.sin(angle) * PLAYER_SIZE * 2,
            z: PLAYER_SIZE * 1.4 - BULLET_SIZE,
            size: BULLET_SIZE / 2,
        });


        player.barrageShots--;
        if (player.barrageShots <= 0) {
            player.barrageActive = false;
            player.barrageCooldown = Math.round(270 * (player.hasteMult || 1)); // 4.5s base
        }
    }
}

function updateAutoTurrets(lobby, lobbyCode) {
    for (const playerId in lobby.players) {
        const player = lobby.players[playerId];
        if (player.isAI || player.isDead) continue;
        const stacks = player.buffs?.autoTurret || 0;
        if (stacks === 0) continue;

        const turnRate = 0.05 * Math.sqrt(stacks);
        const cooldown = Math.round(90 / Math.sqrt(stacks) * (player.hasteMult || 1));
        const bulletRange = 12 * TILE_SIZE;
        const tankRange = 8 * TILE_SIZE;

        if (player.autoTurretAngle === undefined) player.autoTurretAngle = player.turretAngle;
        if (player.autoTurretCooldown === undefined) player.autoTurretCooldown = 0;
        if (player.autoTurretCooldown > 0) player.autoTurretCooldown--;

        // Priority 1: enemy bullet heading toward this player (bullets are in open space, no LOS needed)
        let targetAngle = null;
        let bestDist = Infinity;
        for (const b of lobby.bullets) {
            if (b.owner === playerId) continue;
            const owner = lobby.players[b.owner];
            if (owner && !owner.isAI && lobby.mode !== 'arena') continue;
            const dx = b.x - player.x;
            const dy = b.y - player.y;
            const dist = Math.hypot(dx, dy);
            if (dist > bulletRange) continue;
            // Bullet is a threat if moving toward the player
            const approaching = -dx * Math.cos(b.angle) - dy * Math.sin(b.angle);
            if (approaching > 0 && dist < bestDist) {
                bestDist = dist;
                targetAngle = Math.atan2(dy, dx);
            }
        }

        // Priority 2: nearest enemy tank / player with clear line of sight
        if (targetAngle === null) {
            let nearestDist = tankRange;
            for (const id in lobby.players) {
                if (id === playerId) continue;
                const t = lobby.players[id];
                if (t.isDead) continue;
                if (!t.isAI && lobby.mode !== 'arena') continue;
                const dx = t.x - player.x;
                const dy = t.y - player.y;
                const dist = Math.hypot(dx, dy);
                if (dist < nearestDist && !detectObstacleAlongRay(player.x, player.y, Math.atan2(dy, dx), dist, lobby.level)) {
                    nearestDist = dist;
                    targetAngle = Math.atan2(dy, dx);
                }
            }
        }

        if (targetAngle === null) continue;

        // Rotate turret toward target
        let diff = targetAngle - player.autoTurretAngle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        if (Math.abs(diff) <= turnRate) {
            player.autoTurretAngle = targetAngle;
        } else {
            player.autoTurretAngle += Math.sign(diff) * turnRate;
        }

        // Fire when aimed and cooled down
        if (player.autoTurretCooldown <= 0 && Math.abs(diff) < 0.25) {
            const angle = player.autoTurretAngle;
            // Spawn at turret barrel tip: body offset 0.55 + half barrel 0.325 = 0.875
            const bx = player.x + Math.cos(angle) * PLAYER_SIZE * 0.875 + player.vx;
            const by = player.y + Math.sin(angle) * PLAYER_SIZE * 0.875 + player.vy;
            lobby.bullets.push({
                id: lobby.bullets.length,
                owner: playerId,
                x: bx, y: by,
                angle,
                speed: player.bulletSpeed || BULLET_SPEED,
                bounces: 0,
                hp: 1 + (player.piercing || 0),
                isTurretBullet: true,
            });
            io.to(lobbyCode).emit('explosion', { x: bx, y: by, z: PLAYER_SIZE * 2.4, size: BULLET_SIZE / 2 });
            player.autoTurretCooldown = cooldown;
        }
    }
}

function spawnSurvivalBots(lobbyCode, n) {
    const lobby = lobbies[lobbyCode];
    if (!lobby || lobby.mode !== 'survival' || lobby.gameState === "transition") return;

    const level = lobby.level;

    while (true) {
        ({ x, y } = getRandomNonWallPosition(level))
        let done = true
        for (const playerId in lobby.players) {
            const player = lobby.players[playerId];
            if (!player.isAI && isCollidingWithPlayer(x, y, player, TILE_SIZE * 7)) {
                done = false;
                break;
            }
        }
        if (done) {
            break;
        }
    }


    for (let i = 0; i < n; i++) {
        const botId = `AI_${lobby.numBots++}`;
        lobby.players[botId] = initializeAITank(botId, x, y, Math.floor(Math.random() * lobby.spawnTier));
    }

    io.to(lobbyCode).emit('updatePlayers', lobby.players);
}

function updatePlayerOrbits(lobby, lobbyCode) {
    const players = lobby.players;
    const bullets = lobby.bullets;
    for (const playerId in players) {
        const player = players[playerId];
        if (player.isAI || player.isDead) continue;
        const stacks = player.buffs?.orbit || 0;
        if (stacks === 0) continue;

        player.orbAngle = ((player.orbAngle || 0) + 0.035) % (Math.PI * 2);
        const numOrbs = stacks;
        const orbRadius = PLAYER_SIZE * 2.4;
        const hitRadius = PLAYER_SIZE * 0.72;

        for (let k = bullets.length - 1; k >= 0; k--) {
            const b = bullets[k];
            if (b.owner === playerId || b.isTurretBullet) continue;
            let intercepted = false;
            for (let r = 0; r < numOrbs; r++) {
                const a = player.orbAngle + r * (Math.PI * 2 / numOrbs);
                const ox = player.x + Math.cos(a) * orbRadius;
                const oy = player.y + Math.sin(a) * orbRadius;
                if (Math.hypot(b.x - ox, b.y - oy) < hitRadius) {
                    intercepted = true;
                    io.to(lobbyCode).emit('explosion', {
                        x: ox, y: oy, z: PLAYER_SIZE,
                        size: PLAYER_SIZE * 0.6, dSize: 0.9, color: [80, 220, 140],
                    });
                    break;
                }
            }
            if (intercepted) bullets.splice(k, 1);
        }
    }
}

// Weighted buff selection based on the player's current stacks.
// Buffs that are less useful in large quantities get reduced weight after each stack.
function pickWeightedBuff(player) {
    const b = player?.buffs || {};
    const w = (base, stacks, decay = 2) => Math.max(0.5, base - stacks * decay);
    const weights = {
        speed: 5,
        fireRate: 5,
        bulletSpeed: 5,
        shield: 5,
        piercing: 5,
        autoTurret: 5,
        explosive: 5,
        // homing: 5, // disabled from drops for now
        bulletBounces: w(5, b.bulletBounces || 0, 2),   // rapidly less useful after 2
        multiShot: w(5, b.multiShot || 0, 1.5),
        visionRange: w(5, b.visionRange || 0, 2),
        regen: w(5, b.regen || 0, 2),
        chain: 5,
        orbit: w(5, b.orbit || 0, 0.8), // diminishing — each extra orb is very powerful
        haste: 5,
    };
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    let r = Math.random() * total;
    for (const [buff, v] of entries) {
        r -= v;
        if (r <= 0) return buff;
    }
    return 'speed';
}

function spawnDrop(lobbyCode, x, y, player) {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;

    // Pick buff at spawn time so it's visible on the ground
    const buff = pickWeightedBuff(player);
    lobby.drops.push({ id: uuidv4(), x, y, buff });
    io.to(lobbyCode).emit('updateDrops', lobby.drops);
}

function handlePlayerPickup(lobbyCode, playerId) {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;

    const player = lobby.players[playerId];
    if (!player || player.isDead) return;

    const remainingDrops = [];
    if (!lobby.drops) return;
    for (let i = 0; i < lobby.drops.length; i++) {
        const drop = lobby.drops[i];
        const dx = drop.x - player.x;
        const dy = drop.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < PLAYER_SIZE * 2) {
            const buff = drop.buff;
            if (buff && player.buffs && player.buffs.hasOwnProperty(buff)) {
                player.buffs[buff] += 1;
            }
            io.to(lobbyCode).emit('updatePlayerBuffs', { playerId: player.id, buffs: player.buffs });
        } else {
            remainingDrops.push(drop);
        }
    }

    lobby.drops = remainingDrops;
    io.to(lobbyCode).emit('updateDrops', lobby.drops);
}

// Run lobby updates 60 times per second
setInterval(() => {
    for (const [lobbyCode, lobby] of Object.entries(lobbies)) {
        if (lobby.gameState == "transition") continue;

        updateBullets(lobby, lobbyCode);

        if (debug_lag) {
            lagEmit(io.to(lobbyCode), 'updatePlayers', lobby.players);
            lagEmit(io.to(lobbyCode), 'updateBullets', lobby.bullets);
        } else {
            io.to(lobbyCode).emit('updatePlayers', lobby.players);
            io.to(lobbyCode).emit('updateBullets', lobby.bullets);
        }




        for (const [_, player] of Object.entries(lobby.players)) {
            if (!player.isAI && !player.isDead) {
                handlePlayerMovement(lobby, player);
            }
        }

        // Zone voting in lobby
        if (lobby.mode === 'lobby') {
            const zoneProgress = {};
            for (const zone of LOBBY_ZONES) zoneProgress[zone.mode] = 0;
            let modeTriggered = false;
            for (const player of Object.values(lobby.players)) {
                if (player.isAI || player.isDead || modeTriggered) continue;
                player.zoneTimers = player.zoneTimers || {};
                for (const zone of LOBBY_ZONES) {
                    const zx = (zone.col + 0.5) * TILE_SIZE;
                    const zy = (zone.row + 0.5) * TILE_SIZE;
                    if (Math.hypot(player.x - zx, player.y - zy) < ZONE_RADIUS) {
                        player.zoneTimers[zone.mode] = (player.zoneTimers[zone.mode] || 0) + 1;
                        if (player.zoneTimers[zone.mode] >= ZONE_HOLD_FRAMES) {
                            modeTriggered = true;
                            player.zoneTimers = {};
                            changeMode(lobbyCode, zone.mode);
                            lobby.levelNumber = -1;
                            startTransition(lobbyCode);
                            break;
                        }
                        zoneProgress[zone.mode] = Math.max(zoneProgress[zone.mode], player.zoneTimers[zone.mode] / ZONE_HOLD_FRAMES);
                    } else {
                        player.zoneTimers[zone.mode] = Math.max(0, (player.zoneTimers[zone.mode] || 0) - 3);
                    }
                }
            }
            if (!modeTriggered) io.to(lobbyCode).emit('updateZones', zoneProgress);
        }

        lobby.lasers = lobby.lasers.filter(laser => {
            laser.duration--;
            return laser.duration > 0;
        });

        io.to(lobbyCode).emit('updateLasers', lobby.lasers);


        for (const playerId in lobby.players) {
            const player = lobby.players[playerId]
            if (!player.isAI) {
                handlePlayerPickup(lobbyCode, playerId);
            }
            updatePlayerStats(lobby, player);
            autoSpawnCompanionIfReady(lobby, playerId, player);
        }

        updateAutoTurrets(lobby, lobbyCode);
        updatePlayerOrbits(lobby, lobbyCode);
        updateBarrages(lobby, lobbyCode);
        updateFlares(lobby, lobbyCode);
        updateCompanions(lobby, lobbyCode);

        if (lobby.mode == 'lobby' || lobby.mode == 'campaign' || lobby.mode == 'endless') {
            if (lobby.level && updateAITanks(lobby, lobbyCode, lobby.players, lobby.level, lobby.bullets)) {
                // createLevel(lobbyCode, lobby.levelNumber + 1);
                // console.log(lobby.levelNumber, lobby.totalLevels - 1)
                if (lobby.levelNumber == lobby.totalLevels - 1) {
                    changeMode(lobbyCode, 'lobby');
                    io.to(lobbyCode).emit("victory");
                    lobby.levelNumber = -1;
                } else {
                    io.to(lobbyCode).emit("levelComplete", { levelNumber: lobby.levelNumber });
                }
                startTransition(lobbyCode);
                // lobby.gameState = "transition";
            }
        }

        if (lobby.mode == 'survival') {
            updateAITanks(lobby, lobbyCode, lobby.players, lobby.level, lobby.bullets)

            // Remove dead AI tanks (player stats already updated in the main loop above)
            for (const playerId in lobby.players) {
                if (lobby.players[playerId].isAI && lobby.players[playerId].isDead) {
                    delete lobby.players[playerId];
                }
            }
        }

        if (lobby.mode == 'arena') {
            const livingPlayers = []
            for (const [_, player] of Object.entries(lobby.players)) {
                if (!player.isAI && !player.isDead) {
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

        if (lobby.mode == 'campaign' || lobby.mode == 'survival' || lobby.mode == 'endless') {
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

        // Tick smoke clouds
        if (lobby.smokeClouds && lobby.smokeClouds.length) {
            lobby.smokeClouds = lobby.smokeClouds.filter(sc => --sc.framesLeft > 0);
            io.to(lobbyCode).emit('updateSmokeClouds', lobby.smokeClouds);
        }
    }
}, 1000 / 60);

// Periodically spawn bots in survival mode
setInterval(() => {
    for (const [lobbyCode, lobby] of Object.entries(lobbies)) {
        if (lobby.mode === 'survival') {
            spawnSurvivalBots(lobbyCode, 3);

            lobby.arenaProgress++;

            if (lobby.arenaProgress % 10 == 0) {
                lobby.spawnTier = Math.min(lobby.spawnTier + 1, 14);
                spawnSurvivalBots(lobbyCode, 10);
            }
        }
    }
}, 5000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
