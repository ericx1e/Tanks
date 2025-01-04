const { TILE_SIZE, PLAYER_SIZE, BULLET_SIZE, BULLET_SPEED, AI_TANK_SPEED } = require('./public/constants.js');
const { isCollidingWithWall, lerpAngle, isWall, getRandomNonWallPosition, isCollidingWithPlayer } = require('./utils.js');

let io = null; // Declare io variable

// Function to set io instance
function setIO(ioInstance) {
    io = ioInstance;
}

// Initialize AI tanks

const colorList = [[100, 100, 100], [200, 100, 100], [200, 200, 100], [100, 200, 100], [200, 100, 200], [50, 150, 220]]

function initializeAITank(id, x, y, tier, buttonType) {
    let tank = {
        id: id,
        x: x,
        y: y,
        angle: Math.random() * 2 * Math.PI, // Random initial angle
        turretAngle: Math.random() * 2 * Math.PI,
        targetDirection: Math.random() * 2 * Math.PI, // Initial direction
        movementTimer: 60, // Timer for moving in a direction
        turnTimer: 60,
        isDriving: true, // Start with driving
        turretRotationalVelocity: 0, // Smooth turning speed
        tier: tier,
        isAI: true,
    };

    if (tier == 3) {
        tank.shotsLeft = 2;
    }
    if (tier == 4) {
        tank.buffs = {
            shield: 1
        }
    }
    if (tier == 5) {
        tank = {
            ...tank,
            laserDuration: 100, // Frames the laser is active
            isFiringLaser: false, // Laser firing state
            laserRange: TILE_SIZE * 8, // Laser range
            laserWidth: PLAYER_SIZE / 2, // Laser width
        }
    }

    tank.color = colorList[tank.tier]

    if (tier === 'button') {
        tank.color = [200, 200, 200]
        tank.name = buttonType
    }

    return tank
}

// function initializeAITanks(AI_TANK_COUNT) {
//     const aiTanks = {};
//     const { x, y } = getRandomNonWallPosition(level);
//     for (let i = 0; i < AI_TANK_COUNT; i++) {
//         const tank = {
//             id: `AI_${i}`,
//             x: 0,
//             y: 0,
//             angle: Math.random() * 2 * Math.PI, // Random initial angle
//             turretAngle: 0,
//             targetDirection: Math.random() * 2 * Math.PI, // Initial direction
//             movementTimer: 0, // Timer for moving in a direction
//             isDriving: true, // Start with driving
//             rotationalVelocity: 0, // Smooth turning speed
//             tier: Math.floor(Math.random() * 4),
//             isAI: true,
//         };

//         tank.color = colorList[tank.tier]

//         aiTanks[`AI_${i}`] = tank
//     }
//     return aiTanks;
// }

// Update all AI tanks
function updateAITanks(lobby, lobbyCode, players, level, bullets) {
    let allDead = true;
    for (let id in players) {
        const tank = players[id];
        if (tank.isAI && !tank.isDead) {
            allDead = false;
            updateAITank(lobby, lobbyCode, tank, level, players, bullets);
        }
    }
    return allDead;
}

// Update a single AI tank
function updateAITank(lobby, lobbyCode, tank, level, players, bullets) {
    let shootingRange = PLAYER_SIZE * 18; // Range for shooting players
    let turretSpeed = 0.12; // Speed of turret rotation
    let fireCooldown = 90; // Frames between shots
    let speed = AI_TANK_SPEED

    switch (tank.tier) {
        case 0:
            shootingRange = PLAYER_SIZE * 15; // Range for shooting players
            turretSpeed = 0.05; // Speed of turret rotation
            fireCooldown = 120; // Frames between shots
            speed = AI_TANK_SPEED * 0.75
            break;
        case 1:
            break;
        case 2:
            shootingRange = PLAYER_SIZE * 30;
            fireCooldown = 160;
            break;
        case 3:
            // shootingRange = PLAYER_SIZE * 12;
            speed = 1.5 * AI_TANK_SPEED;
            // tank.shotsLeft = 2
            fireCooldown = 130
            break;
        case 4:
            speed = 1.5 * AI_TANK_SPEED;
            fireCooldown = 70;
            turretSpeed = 0.24;
            break;
        case 5:
            fireCooldown = 200;
            break;
        case 'button':
            speed = 0;
            shootingRange = 0;
            fireCooldown = 1000000;
            break;
    }

    // Initialize fire cooldown
    if (!tank.fireCooldown) {
        tank.fireCooldown = 0;
    }

    // Detect nearby bullets
    const dangerBullet = detectNearbyBullet(tank, bullets, 10 * PLAYER_SIZE);

    if (tank.tier >= 1 && dangerBullet) {
        // If a bullet is nearby, move away
        // const bulletAngle = dangerBullet.angle;
        tank.targetDirection = avoidBullet(tank, dangerBullet)
    } else {
        // Otherwise, continue normal movement
        tank.movementTimer -= 1;

        // If movement timer expires or obstacle detected, pick a new direction
        if (tank.movementTimer <= 0 || detectObstacleAlongRay(tank.x, tank.y, tank.angle, 3 * PLAYER_SIZE, level)) {
            tank.targetDirection += (Math.random() - 0.5) * Math.PI; // Random new direction
            tank.movementTimer = Math.random() * 120 + 60; // Reset movement timer
        }
    }

    // Smoothly adjust the angle toward the target direction
    tank.angle = lerpAngle(tank.angle, tank.targetDirection, 0.1)

    // Move the tank if there are no obstacles ahead
    const newX = tank.x + Math.cos(tank.angle) * speed;
    const newY = tank.y + Math.sin(tank.angle) * speed;

    if (!isCollidingWithWall(newX, tank.y, PLAYER_SIZE, level)) {
        tank.x = newX;
    }
    if (!isCollidingWithWall(tank.x, newY, PLAYER_SIZE, level)) {
        tank.y = newY;
    }

    handleAITurret(lobby, lobbyCode, tank, level, players, bullets, shootingRange, turretSpeed, fireCooldown);
}

function handleAITurret(lobby, lobbyCode, tank, level, players, bullets, shootingRange, turretSpeed, fireCooldown) {
    let playerInSight = null;

    // Check for players in line of sight
    for (let id in players) {
        const player = players[id];
        if (!player.isAI && !player.isDead) {
            const dx = player.x - tank.x;
            const dy = player.y - tank.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= shootingRange) {
                const angleToPlayer = Math.atan2(dy, dx);

                // Difference between turret angle and angle to player
                let diff = ((angleToPlayer - tank.turretAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
                if (diff < -Math.PI) {
                    diff += 2 * Math.PI;
                }

                if (Math.abs(diff) < Math.PI / 3) {
                    // Check if the path to the player is clear (no walls)
                    if (!detectObstacleAlongRay(tank.x, tank.y, angleToPlayer, distance, level)) {
                        playerInSight = { player, angle: angleToPlayer };
                        break;
                    }
                }
            }
        }
    }

    if (tank.tier === 5) { // Laser Bot logic
        if (tank.isFiringLaser) {
            // Handle laser duration
            tank.laserDuration--;
            const isActive = tank.laserDuration < 20;
            fireLaser(lobby, tank, players, level, isActive);

            if (tank.laserDuration <= 0) {
                tank.isFiringLaser = false;
                tank.fireCooldown = fireCooldown; // Reset the cooldown
            }
            return; // Skip other firing logic while laser is active
        }

        // Charge up for laser if cooldown is ready
        if (tank.fireCooldown > 0) {
            tank.fireCooldown--;
        } else if (playerInSight) {
            tank.isFiringLaser = true;
            tank.laserDuration = 100; // Reset laser duration
            tank.turretAngle = playerInSight.angle;
        }
        return; // Start firing laser, skip other firing behaviors
    }

    if (playerInSight) {
        // Lock onto the player and fire

        // const dx = playerInSight.player.x - tank.x;
        // const dy = playerInSight.player.y - tank.y;
        // const distance = Math.sqrt(dx * dx + dy * dy);

        tank.turretAngle = lerpAngle(tank.turretAngle, playerInSight.angle, 0.1);
        tank.turretRotationalVelocity = 0;

        // if (!detectBotInPath(tank.x, tank.y, tank.turretAngle, distance, players, tank.id)) {
        if (tank.tier === 3) {
            if (tank.fireCooldown <= 0) {
                if (tank.shotsLeft == 0) {
                    tank.shotsLeft = 2; // Start a new burst
                }

                if (!tank.burstTimer || tank.burstTimer <= 0) {
                    handleBurstFiring(lobbyCode, tank, bullets, level, fireCooldown);
                } else {
                    tank.burstTimer -= 1; // Decrement burst timer
                }
            }
        } else if (tank.fireCooldown <= 0) {
            fireBullet(lobbyCode, tank, bullets, level); // Single shot for other tiers
            tank.fireCooldown = fireCooldown; // Reset cooldown
        }

        if (tank.tier === 5) {
            if (tank.isFiringLaser) {
                // Handle laser duration
                tank.laserDuration--;
                const isActive = tank.laserDuration < 20;
                fireLaser(lobby, tank, players, level, isActive);

                if (tank.laserDuration <= 0) {
                    tank.isFiringLaser = false;
                    tank.fireCooldown = fireCooldown; // Reset the cooldown
                }
                return; // Skip other firing logic while laser is active
            }

            // Charge up for laser if cooldown is ready
            if (tank.fireCooldown > 0) {
                tank.fireCooldown--;
            } else {
                tank.isFiringLaser = true;
                tank.laserDuration = 100; // Reset laser duration
                // tank.turretAngle = playerInSight.angle;
                // return;
            }
        }
    } else {
        // Rotate turret randomly if no player is in sight
        tank.fireCooldown = fireCooldown / 2
        tank.turretAngle += tank.turretRotationalVelocity;
        tank.turnTimer -= 1;

        // If movement timer expires or obstacle detected, pick a new direction
        if (tank.turnTimer <= 0) {
            let rand = Math.random()
            tank.turretRotationalVelocity = (rand * rand - 0.5) * turretSpeed;
            tank.turnTimer = Math.random() * 120 + 60; // Reset movement timer
        }
    }

    // Decrease cooldown timer
    if (tank.fireCooldown > 0) {
        tank.fireCooldown -= 1;
    }
}

function fireBullet(lobbyCode, tank, bullets, level) {
    player = tank
    const dx = 1.3 * Math.cos(player.turretAngle) * (PLAYER_SIZE + BULLET_SIZE) + AI_TANK_SPEED * Math.cos(player.angle);
    const dy = 1.3 * Math.sin(player.turretAngle) * (PLAYER_SIZE + BULLET_SIZE) + AI_TANK_SPEED * Math.sin(player.angle);

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

    let newBullet;

    switch (tank.tier) {
        case 2:
            newBullet = {
                id: bullets.length,
                owner: player.id,
                x: bulletX,
                y: bulletY,
                angle: player.turretAngle,
                speed: 1.7 * BULLET_SPEED,
                bounces: 0
            }
            break;
        case 3:
            newBullet = {
                id: bullets.length,
                owner: player.id,
                x: bulletX,
                y: bulletY,
                angle: player.turretAngle,
                speed: BULLET_SPEED,
                bounces: 1
            }
            // Fire 3 shots rapidly
            break;
        default:
            newBullet = {
                id: bullets.length,
                owner: player.id,
                x: bulletX,
                y: bulletY,
                angle: player.turretAngle,
                speed: BULLET_SPEED,
                bounces: 1
            }
            break;
    }
    if (newBullet) {
        bullets.push(newBullet);

        io.to(lobbyCode).emit('explosion', {
            x: bulletX,
            y: bulletY,
            z: PLAYER_SIZE * 1.4 - BULLET_SIZE,
            size: BULLET_SIZE / 2,
        });
    }

}

function fireLaser(lobby, tank, players, level, isActive) {
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

        for (const id in players) {
            const player = players[id];
            if (!player.isAI && !player.isDead && isCollidingWithPlayer(x, y, player)) {
                laserEnd = { x, y }; // Stop at the player
                if (isActive) {
                    console.log("hit")
                }
                // HIT
                break;
            }
        }
    }

    lobby.lasers.push({
        x1: tank.x,
        y1: tank.y,
        x2: laserEnd.x,
        y2: laserEnd.y,
        color: [255, 0, 0], // Example color for the laser
        isActive: isActive, // Active state of the laser
        duration: 2, // Frames to display laser
    });
}

// function detectObstacle(tank, level, range) {
//     const startX = tank.x;
//     const startY = tank.y;
//     const endX = startX + Math.cos(tank.angle) * range;
//     const endY = startY + Math.sin(tank.angle) * range;

//     return isCollidingWithWall(endX, endY, PLAYER_SIZE, level); // Returns true if a wall is detected
// }


// Tier 3 tank-specific logic
function handleBurstFiring(lobbyCode, tank, bullets, level, fireCooldown) {
    if (tank.shotsLeft > 0) {
        // console.log("pew", tank.shotsLeft)
        fireBullet(lobbyCode, tank, bullets, level);
        tank.shotsLeft -= 1;

        if (tank.shotsLeft > 0) {
            // Set a delay for the next burst shot
            tank.burstTimer = 10; // Delay for next shot in the burst (10 frames)
        } else {
            // End the burst and reset fireCooldown
            tank.fireCooldown = fireCooldown; // General cooldown after the burst
        }
    }
}

function detectObstacleAlongRay(playerX, playerY, angle, maxDistance, level) {
    let x = playerX;
    let y = playerY;

    const stepSize = 1

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    for (let i = 0; i < maxDistance / stepSize; i++) {
        x += dx * stepSize;
        y += dy * stepSize;

        const raySize = TILE_SIZE / 100

        // Calculate the bounding box coordinates of the current ray position
        const colStart = Math.floor((x - raySize) / TILE_SIZE);
        const colEnd = Math.floor((x + raySize) / TILE_SIZE);
        const rowStart = Math.floor((y - raySize) / TILE_SIZE);
        const rowEnd = Math.floor((y + raySize) / TILE_SIZE);

        // Check multiple tiles in the level grid
        for (let row = rowStart; row <= rowEnd; row++) {
            for (let col = colStart; col <= colEnd; col++) {
                if (level[row] && level[row][col] > 0) {

                    if (level[row] && level[row][col] > 0) {
                        // Ray hits a wall
                        return true
                    }
                }
            }
        }
    }

    // Ray reached max distance without hitting a wall
    return false;
}

function detectBotInPath(x, y, angle, maxDistance, players, firingTankId) {
    const stepSize = PLAYER_SIZE / 2;
    let currentX = x;
    let currentY = y;

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    for (let i = 0; i < maxDistance / stepSize; i++) {
        currentX += dx * stepSize;
        currentY += dy * stepSize;

        for (let id in players) {
            const player = players[id];
            if (id === firingTankId || !player.isAI || player.isDead) continue;
            const distance = Math.sqrt(
                Math.pow(currentX - player.x, 2) + Math.pow(currentY - player.y, 2)
            );

            if (distance < PLAYER_SIZE) {
                return true; // Bot detected in the path
            }
        }
    }

    return false; // No bot detected in the path
}

// Detect nearby bullets
function detectNearbyBullet(tank, bullets, range) {
    for (let bullet of bullets) {
        const dx = tank.x - bullet.x;
        const dy = tank.y - bullet.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if the bullet is within the danger range
        if (distance < range) {
            // Compute bullet direction from angle
            const bulletDirection = { x: Math.cos(bullet.angle), y: Math.sin(bullet.angle) };

            // Normalize the relative position vector (tank to bullet)
            const relativeMagnitude = Math.sqrt(dx * dx + dy * dy);
            const relativeDirection = { x: dx / relativeMagnitude, y: dy / relativeMagnitude };

            // Compute the dot product between the bullet direction and relative direction
            const dot = bulletDirection.x * relativeDirection.x + bulletDirection.y * relativeDirection.y;
            // If the dot product is above the threshold, the bullet is heading toward the tank
            const dangerThreshold = 0.707; // cos(45 degrees)
            if (dot > dangerThreshold) {
                return bullet; // Return the dangerous bullet
            }
        }
    }
    return null;
}

function avoidBullet(tank, bullet) {
    // Compute the relative direction vector from the tank to the bullet
    const dx = bullet.x - tank.x;
    const dy = bullet.y - tank.y;
    const relativeAngle = Math.atan2(dy, dx);

    // Perpendicular directions to the bullet's trajectory
    const perpendicular1 = (bullet.angle + Math.PI / 2) % (2 * Math.PI);
    const perpendicular2 = (bullet.angle - Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);

    // Calculate the angular difference between relative angle and each perpendicular
    const diff1 = Math.abs(((perpendicular1 - relativeAngle + Math.PI) % (2 * Math.PI)) - Math.PI);
    const diff2 = Math.abs(((perpendicular2 - relativeAngle + Math.PI) % (2 * Math.PI)) - Math.PI);

    // Choose the direction with the larger angular separation
    return diff1 > diff2 ? perpendicular1 : perpendicular2;
}


module.exports = {
    setIO,
    initializeAITank,
    // initializeAITanks,
    updateAITanks,
};
