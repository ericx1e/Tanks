const { TILE_SIZE, PLAYER_SIZE, BULLET_SIZE, BULLET_SPEED, AI_TANK_SPEED } = require('./public/constants.js');
const { isCollidingWithWall, lerpAngle, isWall, getRandomNonWallPosition, isCollidingWithPlayer } = require('./utils.js');

let io = null; // Declare io variable

// Function to set io instance
function setIO(ioInstance) {
    io = ioInstance;
}

// Initialize AI tanks

const colorList = [[100, 100, 100], [200, 100, 100], [200, 200, 100], [100, 200, 100], [200, 100, 200], [50, 150, 220], [200, 100, 50], [150, 100, 100]]

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
    if (tier == 6) {
        tank.buffs = {
            shield: 1
        }
    }
    if (tier == 7) {
        tank.buffs = {
            shield: 2
        }
    }

    tank.color = colorList[tank.tier]

    if (tier === 'button') {
        tank.color = [200, 200, 200]
        tank.name = buttonType
    }

    if (tier === 'chest') {
        tank.color = [180, 100, 50]
        // tank.name = 'Open'
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
        if (tank.isAI && !tank.isDead && tank.tier !== 'chest') {
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
            fireCooldown = 120;
            break;
        case 4:
            speed = 1.5 * AI_TANK_SPEED;
            fireCooldown = 70;
            turretSpeed = 0.30;
            break;
        case 5:
            speed = 0.5 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 40;
            fireCooldown = 200;
            break;
        case 6:
            // shootingRange = PLAYER_SIZE * 12;
            speed = 1.5 * AI_TANK_SPEED;
            // tank.shotsLeft = 2
            fireCooldown = 120;
            turretSpeed = 0.30;
            break;
        case 7:
            shootingRange = PLAYER_SIZE * 20;
            speed = 1.0 * AI_TANK_SPEED;
            fireCooldown = 30;
            turretSpeed = 0.40;
            break;
        case 'button':
            speed = 0;
            shootingRange = 0;
            fireCooldown = 1000000;
            break;
        case 'chest':
            speed = 0;
            shootingRange = 0;
            fireCooldown = 1000000;
            turretSpeed = 0;
            return;
            break;
    }

    // Initialize fire cooldown
    if (!tank.fireCooldown) {
        // tank.fireCooldown = fireCooldown / 2;
        tank.fireCooldown = 0;
    }

    const RANGE = 10 * PLAYER_SIZE;
    const AVOID_DOT = 0.35;
    const SHOOT_DOT = 0.85;

    // Scan all bullets once
    const candidates = [];
    for (const b of bullets) {
        if (b.owner === tank.id) continue; // ignore own shots
        const dx = b.x - tank.x, dy = b.y - tank.y;
        const dist = Math.hypot(dx, dy);
        if (dist > RANGE) continue;
        const dot = bulletCosTowardTank(tank, b);
        const { tStar, dmin2 } = closestApproach(b, tank);
        candidates.push({ bullet: b, dist, dot, tStar, dmin2 });
    }

    // 1) Driving: be liberal—avoid the most concerning bullet by earliest impact (or highest dot as tie)
    const driveThreats = candidates.filter(c => c.dot >= AVOID_DOT && c.tStar >= 0);
    if (tank.tier >= 1 && driveThreats.length) {
        driveThreats.sort((a, b) => (a.tStar - b.tStar) || (b.dot - a.dot));
        const primary = driveThreats[0].bullet;
        tank.targetDirection = avoidBullet(tank, primary);

        tank.dodgeTimer = 4;
    } else {
        // Otherwise, continue normal movement
        tank.movementTimer -= 1;

        // If movement timer expires or obstacle detected, pick a new direction
        if (tank.movementTimer <= 0 || detectObstacleAlongRay(tank.x, tank.y, tank.angle, 3 * PLAYER_SIZE, level)) {
            tank.targetDirection += (Math.random() - 0.5) * Math.PI; // Random new direction
            tank.movementTimer = Math.random() * 120 + 60; // Reset movement timer
        }

        tank.dodgeTimer = Math.max(0, (tank.dodgeTimer || 0) - 1);
    }


    // 2) Shooting: be strict—only direct bullets on true collision course
    const shootThreats = candidates
        .filter(c => c.dot >= SHOOT_DOT && c.tStar >= 0)
        .sort((a, b) => (a.tStar - b.tStar) || (a.dist - b.dist));


    // if (tank.tier != 'button') {
    //     tank.name = tank.fireCooldown //debug 
    // }

    if (tank.tier >= 4 && tank.tier != 5 && shootThreats.length) {
        const maxShotsThisFrame = 1;
        let shots = 0;
        for (const { bullet, dist } of shootThreats) {
            const fired = fireAtDangerBullet(
                lobbyCode, tank, bullet, bullets, level, players, fireCooldown
            );
            if (fired && ++shots >= maxShotsThisFrame) break;
            // Small assist: if very close, help cooldown tick faster
            if (dist < 6 * PLAYER_SIZE) {
                tank.fireCooldown = Math.min(tank.fireCooldown, 30);
            }
        }
    }


    // if (tank.tier >= 1 && threats.length) {
    //     // If a bullet is nearby, move away
    //     // tank.targetDirection = avoidBullet(tank, dangerBullet)
    //     const primary = threats[0].bullet;
    //     tank.targetDirection = avoidBullet(tank, primary);

    //     if (tank.tier >= 1) {
    //         for (const { bullet } of threats) {
    //             const fired = fireAtDangerBullet(
    //                 lobbyCode, tank, bullet, bullets, level, players, fireCooldown
    //             );
    //             if (fired) break;
    //         }
    //     }
    // } 
    // Smoothly adjust the angle toward the target direction
    tank.angle = lerpAngle(tank.angle, tank.targetDirection, 0.1);

    // Glide only during dodge; otherwise keep your original step
    const isDodging = (tank._dodgeTimer || 0) > 0;

    if (isDodging) {
        tryMoveWithWallGlideAndEscape(tank, speed, level, true);
    } else {
        const newX = tank.x + Math.cos(tank.angle) * speed;
        const newY = tank.y + Math.sin(tank.angle) * speed;
        if (!isCollidingWithWall(newX, tank.y, PLAYER_SIZE, level)) tank.x = newX;
        if (!isCollidingWithWall(tank.x, newY, PLAYER_SIZE, level)) tank.y = newY;
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

    // if (tank.tier === 5) { // Laser Bot logic
    //     if (tank.isFiringLaser) {
    //         // Handle laser duration
    //         tank.laserDuration--;
    //         const isActive = tank.laserDuration < 20;
    //         fireLaser(lobby, tank, players, level, isActive);

    //         if (tank.laserDuration <= 0) {
    //             tank.isFiringLaser = false;
    //             tank.fireCooldown = fireCooldown; // Reset the cooldown
    //         }
    //         return; // Skip other firing logic while laser is active
    //     }

    //     // Charge up for laser if cooldown is ready
    //     if (tank.fireCooldown > 0) {
    //         tank.fireCooldown--;
    //     } else if (playerInSight) {
    //         tank.isFiringLaser = true;
    //         tank.laserDuration = 100; // Reset laser duration
    //         tank.turretAngle = playerInSight.angle;
    //     }
    //     return; // Start firing laser, skip other firing behaviors
    // }

    if (playerInSight) {
        // return;
        // Lock onto the player and fire

        // const dx = playerInSight.player.x - tank.x;
        // const dy = playerInSight.player.y - tank.y;
        // const distance = Math.sqrt(dx * dx + dy * dy);

        // if (!detectBotInPath(tank.x, tank.y, tank.turretAngle, distance, players, tank.id)) {
        switch (tank.tier) {
            case 3:
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
                break;
            case 5:
                if (tank.isFiringLaser) {
                    // Handle laser duration
                    tank.laserDuration--;
                    const isActive = tank.laserDuration < 15;
                    fireLaser(lobby, tank, players, level, isActive);

                    if (tank.laserDuration <= 0) {
                        tank.isFiringLaser = false;
                        tank.fireCooldown = fireCooldown; // Reset the cooldown
                    }
                    tank.turretAngle = lerpAngle(tank.turretAngle, playerInSight.angle, 0.05);
                    tank.turretRotationalVelocity = 0;
                    return; // Skip other firing logic while laser is active
                }

                // Charge up for laser if cooldown is ready
                if (tank.fireCooldown > 0) {
                    // tank.fireCooldown--;
                } else {
                    tank.isFiringLaser = true;
                    tank.laserDuration = 100; // Reset laser duration
                    // tank.turretAngle = playerInSight.angle;
                    // return;
                }
                break;
            case 6:
                if (tank.fireCooldown <= 0) {
                    fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level);
                    fireBullet(lobbyCode, tank, tank.turretAngle - Math.PI / 11, bullets, level);
                    fireBullet(lobbyCode, tank, tank.turretAngle + Math.PI / 11, bullets, level);
                    tank.fireCooldown = fireCooldown; // Reset cooldown
                }
                break;
            default:
                if (tank.fireCooldown <= 0) {
                    fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level); // Single shot for other tiers
                    tank.fireCooldown = fireCooldown; // Reset cooldown
                }
                break;
        }
        tank.turretAngle = lerpAngle(tank.turretAngle, playerInSight.angle, 0.1);
        tank.turretRotationalVelocity = 0;
    } else {
        // Rotate turret randomly if no player is in sight)
        tank.fireCooldown = fireCooldown / 2
        tank.turretAngle += tank.turretRotationalVelocity;
        tank.turnTimer -= 1;

        if (tank.tier === 5) {
            tank.isFiringLaser = false;
            tank.laserDuration = 100;
        }

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
        if (tank.tier == 4) {
        }
    }
}

function fireBullet(lobbyCode, tank, angle, bullets, level) {
    player = tank
    const dx = 1.3 * Math.cos(angle) * (PLAYER_SIZE + BULLET_SIZE) + AI_TANK_SPEED * Math.cos(player.angle);
    const dy = 1.3 * Math.sin(angle) * (PLAYER_SIZE + BULLET_SIZE) + AI_TANK_SPEED * Math.sin(player.angle);

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
                angle: angle,
                speed: 1.7 * BULLET_SPEED,
                bounces: 0
            }
            break;
        default:
            newBullet = {
                id: bullets.length,
                owner: player.id,
                x: bulletX,
                y: bulletY,
                angle: angle,
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

        let done = false;
        for (const id in players) {
            const player = players[id];
            if (!player.isAI && !player.isDead && isCollidingWithPlayer(x, y, player, 0)) {
                laserEnd = { x, y }; // Stop at the player
                if (isActive && tank.laserDuration % 5 == 0) { // Damage ticks every 5 frames
                    if (lobby.mode !== 'lobby' || player.isAI) // No player damage in lobby

                        // Apply damage to the player
                        if (player.shield) {
                            player.shield = false; // Remove shield instead of killing
                        } else {
                            player.isDead = true;
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


    const dx = 1.3 * Math.cos(tank.turretAngle) * (PLAYER_SIZE + BULLET_SIZE) + 0.5 * AI_TANK_SPEED * Math.cos(tank.angle);
    const dy = 1.3 * Math.sin(tank.turretAngle) * (PLAYER_SIZE + BULLET_SIZE) + 0.5 * AI_TANK_SPEED * Math.sin(tank.angle);

    const laserX = tank.x + dx;
    const laserY = tank.y + dy;

    lobby.lasers.push({
        x1: laserX,
        y1: laserY,
        x2: laserEnd.x,
        y2: laserEnd.y,
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
        fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level);
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

function bulletCosTowardTank(tank, bullet) {
    const dirx = Math.cos(bullet.angle), diry = Math.sin(bullet.angle);
    const rx = tank.x - bullet.x, ry = tank.y - bullet.y;
    const rmag = Math.hypot(rx, ry) || 1e-6;
    return (dirx * (rx / rmag) + diry * (ry / rmag)); // in [-1, 1]
}

function closestApproach(bullet, tank) {
    const px = bullet.x - tank.x, py = bullet.y - tank.y;
    const vb = bullet.speed || BULLET_SPEED;
    const vx = Math.cos(bullet.angle) * vb, vy = Math.sin(bullet.angle) * vb;
    const v2 = vx * vx + vy * vy || 1e-6;
    const tStar = - (px * vx + py * vy) / v2; // can be < 0 (moving away)
    const cx = px + vx * Math.max(tStar, 0);
    const cy = py + vy * Math.max(tStar, 0);
    const dmin2 = cx * cx + cy * cy;
    return { tStar, dmin2 };
}

function isDirectCollisionCourse(tank, bullet) {
    const { tStar, dmin2 } = closestApproach(bullet, tank);
    if (tStar < 0) return false; // not coming toward us
    const hitR = (PLAYER_SIZE / 2) + BULLET_SIZE;
    return dmin2 <= hitR * hitR;
}


function getCollisionThreats(tank, bullets, range, maxThreats = 3) {
    const hitR = (PLAYER_SIZE / 2) + BULLET_SIZE;
    const hitR2 = hitR * hitR;
    const threats = [];

    for (const b of bullets) {
        if (b.owner === tank.id) continue; // ignore our own
        // quick range cull
        const dx = b.x - tank.x, dy = b.y - tank.y;
        const dist = Math.hypot(dx, dy);
        if (dist > range) continue;

        const vb = (b.speed || BULLET_SPEED);
        const vx = Math.cos(b.angle) * vb;
        const vy = Math.sin(b.angle) * vb;

        const v2 = vx * vx + vy * vy;
        if (v2 < 1e-9) continue;

        // t* = argmin_t |p + v t|^2 = - (p·v) / |v|^2
        const tStar = - (dx * vx + dy * vy) / v2;
        if (tStar < 0) continue; // closest approach is in the past (moving away)

        // miss distance at t*
        const cx = dx + vx * tStar;
        const cy = dy + vy * tStar;
        const dmin2 = cx * cx + cy * cy;

        if (dmin2 <= hitR2) {
            threats.push({ bullet: b, tStar, dmin2, dist });
        }
    }

    // Sort: soonest impact first; tie-break by smaller current distance
    threats.sort((a, b) => (a.tStar - b.tStar) || (a.dist - b.dist));
    return threats.slice(0, maxThreats);
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

// Sample nearby tiles to estimate a wall "normal" pointing away from walls
function getWallNormalAt(x, y, level) {
    const off = TILE_SIZE * 0.6;
    const samples = [
        { dx: off, dy: 0 }, // right
        { dx: -off, dy: 0 }, // left
        { dx: 0, dy: off },// down
        { dx: 0, dy: -off },// up
    ];
    let nx = 0, ny = 0;
    for (const s of samples) {
        const cx = x + s.dx, cy = y + s.dy;
        const col = Math.floor(cx / TILE_SIZE);
        const row = Math.floor(cy / TILE_SIZE);
        if (isWall(col, row, level)) {
            // push away from that side (add opposite of the sample direction)
            nx += -s.dx; ny += -s.dy;
        }
    }
    const mag = Math.hypot(nx, ny);
    if (mag < 1e-6) return { nx: 0, ny: 0 };
    return { nx: nx / mag, ny: ny / mag };
}

// Slide along walls; if totally blocked, perform a corner escape.
// Returns true if moved this frame.
function tryMoveWithWallGlideAndEscape(tank, speed, level, isDodging) {
    const stepX = Math.cos(tank.angle) * speed;
    const stepY = Math.sin(tank.angle) * speed;

    let moved = false;

    // Try full step
    const nx = tank.x + stepX, ny = tank.y + stepY;
    if (!isCollidingWithWall(nx, tank.y, PLAYER_SIZE, level)) { tank.x = nx; moved = true; }
    if (!isCollidingWithWall(tank.x, ny, PLAYER_SIZE, level)) { tank.y = ny; moved = true; }

    if (moved) {
        tank._stuckFrames = 0;
        return true;
    }

    // Try sliding along the freer axis based on probe
    const probe = Math.max(PLAYER_SIZE * 0.6, speed);
    const xBlocked = isCollidingWithWall(tank.x + Math.sign(stepX) * probe, tank.y, PLAYER_SIZE, level);
    const yBlocked = isCollidingWithWall(tank.x, tank.y + Math.sign(stepY) * probe, PLAYER_SIZE, level);

    if (!xBlocked) {
        const nx2 = tank.x + stepX;
        if (!isCollidingWithWall(nx2, tank.y, PLAYER_SIZE, level)) { tank.x = nx2; tank._stuckFrames = 0; return true; }
    }
    if (!yBlocked) {
        const ny2 = tank.y + stepY;
        if (!isCollidingWithWall(tank.x, ny2, PLAYER_SIZE, level)) { tank.y = ny2; tank._stuckFrames = 0; return true; }
    }

    // Corner escape 
    tank._stuckFrames = (tank._stuckFrames || 0) + 1;

    // small backstep
    const back = Math.min(speed * 1.2, PLAYER_SIZE * 0.7);
    const bx = tank.x - Math.cos(tank.angle) * back;
    const by = tank.y - Math.sin(tank.angle) * back;
    const backOkX = !isCollidingWithWall(bx, tank.y, PLAYER_SIZE, level);
    const backOkY = !isCollidingWithWall(tank.x, by, PLAYER_SIZE, level);
    if (backOkX) tank.x = bx;
    if (backOkY) tank.y = by;

    // steer away from local wall normal with a small random bias (prevents stacking)
    const { nx: nwx, ny: nwy } = getWallNormalAt(tank.x, tank.y, level);
    if (nwx !== 0 || nwy !== 0) {
        const awayAngle = Math.atan2(nwy, nwx); // direction away from walls
        // Blend target a bit toward awayAngle +/- jitter
        const jitter = (Math.random() - 0.5) * (Math.PI / 8);
        const escapeAngle = (awayAngle + jitter + Math.PI) % (2 * Math.PI); // bias to exit corner
        tank.targetDirection = lerpAngle(tank.targetDirection, escapeAngle, 0.35);
    } else {
        // If no normal, spin slightly
        tank.targetDirection = (tank.targetDirection + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 6) % (2 * Math.PI);
    }

    // give the escape a couple frames to work (helps “burst” out of corners)
    if (isDodging) tank._dodgeTimer = Math.max(tank._dodgeTimer || 0, 3);

    return false;
}


function isDirectCollisionCourse(tank, bullet) {
    const px = bullet.x - tank.x;
    const py = bullet.y - tank.y;

    const vb = bullet.speed || BULLET_SPEED;
    const vx = Math.cos(bullet.angle) * vb;
    const vy = Math.sin(bullet.angle) * vb;

    const v2 = vx * vx + vy * vy;
    if (v2 < 1e-9) return false; // degenerate

    // Time of closest approach for r(t) = p + v t
    const tStar = - (px * vx + py * vy) / v2;

    // If closest approach is in the past, it's not coming toward us
    if (tStar < 0) return false;

    // Miss distance at closest approach
    const cx = px + vx * tStar;
    const cy = py + vy * tStar;
    const dmin2 = cx * cx + cy * cy;

    // Hit if miss distance <= combined radii
    const hitR = 2 * (PLAYER_SIZE) + BULLET_SIZE;
    return dmin2 <= hitR * hitR;
}

function computeInterceptAngle(tank, bullet) {
    const r0x = bullet.x - tank.x, r0y = bullet.y - tank.y;
    const vb = bullet.speed || BULLET_SPEED;
    const vbx = Math.cos(bullet.angle) * vb;
    const vby = Math.sin(bullet.angle) * vb;

    // our bullet speed mirrors fireBullet logic (tier 2 shoots faster)
    const vs = (tank.tier === 2 ? 1.7 : 1.0) * BULLET_SPEED;

    // (v_b^2 - v_s^2) t^2 + 2 (r0·v_b) t + |r0|^2 = 0
    const A = (vbx * vbx + vby * vby) - (vs * vs);
    const B = 2 * (r0x * vbx + r0y * vby);
    const C = (r0x * r0x + r0y * r0y);

    let t = null;
    if (Math.abs(A) < 1e-6) {
        if (Math.abs(B) > 1e-6) {
            const tLin = -C / B;
            if (tLin > 0) t = tLin;
        }
    } else {
        const D = B * B - 4 * A * C;
        if (D >= 0) {
            const s = Math.sqrt(D);
            const t1 = (-B - s) / (2 * A);
            const t2 = (-B + s) / (2 * A);
            const pos = [t1, t2].filter(tt => tt > 0);
            if (pos.length) t = Math.min(...pos);
        }
    }

    const tx = t == null ? bullet.x : bullet.x + vbx * t;
    const ty = t == null ? bullet.y : bullet.y + vby * t;
    return Math.atan2(ty - tank.y, tx - tank.x);
}

/**
 * Try to shoot down an incoming bullet.
 * Aligns turret toward predicted intercept and fires if:
 *  - roughly aligned,
 *  - line-of-sight is clear (no walls),
 *  - no friendly AI in the short path,
 *  - cooldown is ready.
 * Returns true if it fired this frame.
 */
function fireAtDangerBullet(lobbyCode, tank, dangerBullet, bullets, level, players, fireCooldown) {
    // Aim where we'll meet the bullet
    const interceptAngle = computeInterceptAngle(tank, dangerBullet);

    // Turn turret quickly toward intercept
    tank.turretAngle = lerpAngle(tank.turretAngle, interceptAngle, 0.25);
    tank.turretRotationalVelocity = 0;

    // Requirements to shoot
    const distToBullet = Math.hypot(dangerBullet.x - tank.x, dangerBullet.y - tank.y);
    // const aligned = Math.abs(((interceptAngle - tank.turretAngle + Math.PI) % (2 * Math.PI)) - Math.PI) < Math.PI / 18; // ~10°
    // const clear = !detectObstacleAlongRay(tank.x, tank.y, interceptAngle, distToBullet, level);
    // const pathHasBot = detectBotInPath(tank.x, tank.y, interceptAngle, distToBullet, players, tank.id);
    if (tank.tier !== 5 && tank.fireCooldown <= 0) {
        fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level);
        // Shorter cooldown for point-defense so it can react again soon
        tank.fireCooldown = fireCooldown / 2;
        // console.log('AI shooting down bullet');

        return true;
    }

    // If it’s very close, help the bot get a shot off soon
    // if (distToBullet < 3 * TILE_SIZE) {
    //     tank.fireCooldown = Math.max(0, tank.fireCooldown - 1);
    // }
    return false;
}

module.exports = {
    setIO,
    initializeAITank,
    // initializeAITanks,
    updateAITanks,
};
