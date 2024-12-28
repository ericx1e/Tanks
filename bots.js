const { TILE_SIZE, PLAYER_SIZE, BULLET_SIZE, BULLET_SPEED, AI_TANK_SPEED } = require('./public/constants.js');
const { isCollidingWithWall, lerpAngle, isWall } = require('./utils.js');

// Initialize AI tanks
function initializeAITanks(AI_TANK_COUNT) {
    const aiTanks = {};
    for (let i = 0; i < AI_TANK_COUNT; i++) {
        aiTanks[`AI_${i}`] = {
            id: `AI_${i}`,
            x: 150 + i * 50, // Random position
            y: 150,
            angle: Math.random() * 2 * Math.PI, // Random initial angle
            turretAngle: 0,
            targetDirection: Math.random() * 2 * Math.PI, // Initial direction
            movementTimer: 0, // Timer for moving in a direction
            isDriving: true, // Start with driving
            rotationalVelocity: 0, // Smooth turning speed
            isAI: true,
        };
    }
    return aiTanks;
}

// Update all AI tanks
function updateAITanks(players, level, players, bullets) {
    for (let id in players) {
        const tank = players[id];
        if (tank.isAI) {
            updateAITank(tank, level, players, bullets);
        }
    }
}

// Update a single AI tank
function updateAITank(tank, level, players, bullets) {
    const shootingRange = TILE_SIZE * 3.5; // Range for shooting players
    const turretSpeed = 0.05; // Speed of turret rotation
    const fireCooldown = 80; // Frames between shots

    // Initialize fire cooldown
    if (!tank.fireCooldown) {
        tank.fireCooldown = 0;
    }

    // Detect nearby bullets
    const dangerBullet = detectNearbyBullet(tank, bullets, 2 * TILE_SIZE);

    if (dangerBullet) {
        // If a bullet is nearby, move away
        // const bulletAngle = dangerBullet.angle;
        tank.targetDirection = avoidBullet(tank, dangerBullet)
    } else {
        // Otherwise, continue normal movement
        tank.movementTimer -= 1;

        // If movement timer expires or obstacle detected, pick a new direction
        if (tank.movementTimer <= 0 || detectObstacleAlongRay(tank.x, tank.y, tank.angle, 2 * PLAYER_SIZE, level)) {
            tank.targetDirection += (Math.random() - 0.5) * Math.PI; // Random new direction
            tank.movementTimer = Math.random() * 120 + 60; // Reset movement timer
        }
    }

    // Smoothly adjust the angle toward the target direction
    tank.angle = lerpAngle(tank.angle, tank.targetDirection, 0.1)

    // Move the tank if there are no obstacles ahead
    const newX = tank.x + Math.cos(tank.angle) * AI_TANK_SPEED;
    const newY = tank.y + Math.sin(tank.angle) * AI_TANK_SPEED;

    if (!isCollidingWithWall(newX, tank.y, PLAYER_SIZE, level)) {
        tank.x = newX;
    }
    if (!isCollidingWithWall(tank.x, newY, PLAYER_SIZE, level)) {
        tank.y = newY;
    }

    handleAITurret(tank, level, players, bullets, shootingRange, turretSpeed, fireCooldown);
}

function handleAITurret(tank, level, players, bullets, shootingRange, turretSpeed, fireCooldown) {
    let playerInSight = null;

    // Check for players in line of sight
    for (let id in players) {
        const player = players[id];
        if (!player.isAI) {
            const dx = player.x - tank.x;
            const dy = player.y - tank.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= shootingRange) {
                const angleToPlayer = Math.atan2(dy, dx);

                // Check if the path to the player is clear (no walls)
                if (!detectObstacleAlongRay(tank.x, tank.y, angleToPlayer, distance, level)) {
                    playerInSight = { player, angle: angleToPlayer };
                    break;
                }
            }
        }
    }

    if (playerInSight) {
        // Lock onto the player and fire
        tank.turretAngle = lerpAngle(tank.turretAngle, playerInSight.angle, 0.1);

        if (tank.fireCooldown <= 0) {
            fireBullet(tank, bullets, level); // Fire a bullet at the locked-on player
            tank.fireCooldown = fireCooldown; // Reset cooldown
        }
    } else {
        // Rotate turret randomly if no player is in sight
        tank.turretAngle += (Math.random() - 0.5) * turretSpeed; // Semi-random rotation
    }

    // Decrease cooldown timer
    if (tank.fireCooldown > 0) {
        tank.fireCooldown -= 1;
    }
}

function fireBullet(tank, bullets, level) {
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

    bullets.push({
        id: bullets.length,
        owner: player.id,
        x: bulletX,
        y: bulletY,
        angle: player.turretAngle,
        speed: BULLET_SPEED,
        bounces: 1
    });
}

// function detectObstacle(tank, level, range) {
//     const startX = tank.x;
//     const startY = tank.y;
//     const endX = startX + Math.cos(tank.angle) * range;
//     const endY = startY + Math.sin(tank.angle) * range;

//     return isCollidingWithWall(endX, endY, PLAYER_SIZE, level); // Returns true if a wall is detected
// }

function detectObstacleAlongRay(startX, startY, angle, range, level) {
    const steps = Math.ceil(range / TILE_SIZE); // Break the ray into steps
    const stepSize = TILE_SIZE / steps;

    for (let i = 1; i <= steps; i++) {
        const x = startX + Math.cos(angle) * stepSize * i;
        const y = startY + Math.sin(angle) * stepSize * i;

        if (isCollidingWithWall(x, y, BULLET_SIZE, level)) {
            return true; // Obstacle detected
        }
    }

    return false; // Path is clear
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
    initializeAITanks,
    updateAITanks,
};
