const { TILE_SIZE, PLAYER_SIZE, BULLET_SIZE, BULLET_SPEED, AI_TANK_SPEED } = require('./public/constants.js');
const { isCollidingWithWall, lerpAngle, isWall, getRandomNonWallPosition, isCollidingWithPlayer } = require('./utils.js');

let io = null; // Declare io variable

// Function to set io instance
function setIO(ioInstance) {
    io = ioInstance;
}

// Initialize AI tanks

const colorList = [[100, 100, 100], [200, 100, 100], [200, 200, 100], [100, 200, 100], [200, 100, 200], [50, 150, 220], [200, 100, 50], [150, 100, 100], [190, 210, 240], [60, 100, 220], [30, 15, 50], [200, 30, 200], [220, 30, 90], [50, 200, 210], [170, 110, 20], [100, 180, 255], [40, 90, 40]]

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
    if (tier == 8) {
        tank.cloakTimer = 280;
        tank.cloaked = false;
        tank.buffs = { shield: 1 };
    }
    if (tier == 9) {
        tank.shieldActive = false;
        tank.shieldFacing = 0;
    }
    if (tier == 10) {
        tank.buffs = { shield: 3 };
    }
    if (tier == 11) {
        // Harbinger — heavy spread artillery with ring burst
        tank.ringCooldown = 100;
        tank.buffs = { shield: 5 };
    }
    if (tier == 12) {
        tank.flankSide = 1;
        tank.flankTimer = 150;
        tank.buffs = { shield: 1 };
    }
    if (tier == 14) {
        tank.cannonCooldown = 0;
        tank.buffs = { shield: 1 };
    }
    if (tier == 15) {
        // Sovereign — massive, orbiting orb shield, cannonball artillery
        tank.orbAngle = 0;
        tank.buffs = { shield: 4 };
    }
    if (tier == 16) {
        // Phantom Sniper — omniscient, charges up and fires piercing wallPiercing shot
        tank.sniperCharging = false;
        tank.sniperChargeTimer = 0;
        tank.buffs = { shield: 2 };
    }
    if (tier == 13) {
        tank = {
            ...tank,
            laserDuration: 55,
            isFiringLaser: false,
            laserRange: TILE_SIZE * 5,
            laserWidth: PLAYER_SIZE / 2,
        };
        tank.buffs = { shield: 1 };
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
    // Sovereign orbs — outward-facing shield walls that intercept incoming bullets
    if (tank.tier === 15) {
        tank.orbAngle = ((tank.orbAngle || 0) + 0.04) % (Math.PI * 2);
        const orbRadius = PLAYER_SIZE * 3.2;
        const wallHalfWidth = PLAYER_SIZE * 1.4;
        const wallHalfDepth = PLAYER_SIZE * 0.6;
        // Splice in-place so the bullets array reference stays valid for fireBullet calls below
        for (let k = bullets.length - 1; k >= 0; k--) {
            const b = bullets[k];
            if (b.owner === tank.id) continue;
            let intercepted = false;
            for (let r = 0; r < 4; r++) {
                const a = tank.orbAngle + r * Math.PI / 2;
                const ox = tank.x + Math.cos(a) * orbRadius;
                const oy = tank.y + Math.sin(a) * orbRadius;
                const dx = b.x - ox;
                const dy = b.y - oy;
                const along = dx * Math.cos(a) + dy * Math.sin(a);
                const perp  = -dx * Math.sin(a) + dy * Math.cos(a);
                if (Math.abs(along) > wallHalfDepth) continue;
                if (Math.abs(perp) > wallHalfWidth) continue;
                const inward = Math.cos(b.angle) * Math.cos(a) + Math.sin(b.angle) * Math.sin(a);
                if (inward >= 0) continue;
                intercepted = true;
                io.to(lobbyCode).emit('explosion', {
                    x: ox, y: oy, z: PLAYER_SIZE * 1.5,
                    size: PLAYER_SIZE * 0.8, dSize: 1.2, color: [100, 180, 255],
                });
                break;
            }
            if (intercepted) bullets.splice(k, 1);
        }
    }
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
        case 8: // Phantom — fast cloaking tank
            speed = 1.3 * AI_TANK_SPEED;
            fireCooldown = 75;
            turretSpeed = 0.15;
            break;
        case 9: // Shield Tank — deploys a front-facing bullet wall
            speed = 1.0 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 22;
            fireCooldown = 90;
            turretSpeed = 0.18;
            break;
        case 10: // Titan — triple shot, rapid fire, 3 shields
            speed = 0.7 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 20;
            fireCooldown = 26;
            turretSpeed = 0.50;
            break;
        case 11: // Harbinger — heavy spread artillery with ring burst
            speed = 0.85 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 22;
            fireCooldown = 45;
            turretSpeed = 0.16;
            break;
        case 12: // Intelligence — fast, omniscient, flanks and leads shots
            speed = 1.8 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 30;
            fireCooldown = 40;
            turretSpeed = 0.45;
            break;
        case 13: // Laser Pulse — fast, short-range laser with high uptime
            speed = 1.2 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 20;
            fireCooldown = 90;
            turretSpeed = 0.22;
            break;
        case 14: // Cannoneer — slow, fires explosive cannonballs
            speed = 0.55 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 28;
            fireCooldown = 110;
            turretSpeed = 0.10;
            break;
        case 15: // Sovereign — massive boss, orbiting orb shield, heavy cannonballs
            speed = 0.45 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 32;
            fireCooldown = 130;
            turretSpeed = 0.08;
            break;
        case 16: // Phantom Sniper — slow, omniscient, charges up piercing shot
            speed = 0.35 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 40;
            fireCooldown = 220;
            turretSpeed = 0.06;
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

    // Phantom cloak mechanic
    if (tank.tier === 8) {
        tank.cloakTimer -= 1;
        if (tank.cloakTimer <= 0) {
            tank.cloaked = !tank.cloaked;
            if (tank.cloaked) {
                tank.shield = 1;
            }
            tank.cloakTimer = tank.cloaked ? 280 : 150;
        }
    }

    // Intelligence Tank: flank the nearest player when not dodging
    if (tank.tier === 12) {
        tank.flankTimer = (tank.flankTimer || 150) - 1;
        if (tank.flankTimer <= 0) {
            tank.flankSide = -tank.flankSide;
            tank.flankTimer = Math.floor(Math.random() * 80) + 100;
        }
    }

    // Initialize fire cooldown
    if (!tank.fireCooldown) {
        // tank.fireCooldown = fireCooldown / 2;
        tank.fireCooldown = 0;
    }

    tank._defendingThisFrame = false; // reset flag used to suppress turret override
    if (tank.defenseCooldown > 0) tank.defenseCooldown--;

    // Stun: disoriented AI spins randomly and can't fire
    if ((tank.disoriented || 0) > 0) {
        tank.disoriented--;
        tank.targetDirection += 0.18; // spin
        tank.turretAngle += 0.22;
        tank.fireCooldown = Math.max(tank.fireCooldown, 10);
        const newX = tank.x + Math.cos(tank.targetDirection) * speed;
        const newY = tank.y + Math.sin(tank.targetDirection) * speed;
        if (!isCollidingWithWall(newX, tank.y, PLAYER_SIZE, level)) tank.x = newX;
        if (!isCollidingWithWall(tank.x, newY, PLAYER_SIZE, level)) tank.y = newY;
        return;
    }

    const RANGE = 10 * PLAYER_SIZE;
    const AVOID_DOT = 0.35;
    const SHOOT_DOT = 0.80;

    // Scan all bullets once
    const candidates = [];
    for (const b of bullets) {
        if (b.owner === tank.id) continue; // ignore own shots
        const bulletOwner = players[b.owner];
        if (bulletOwner && bulletOwner.isAI) continue; // only react to player bullets
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
        tank.targetDirection = avoidBullet(tank, primary, level);

        tank._dodgeTimer = 10;
    } else {
        // Otherwise, continue normal movement
        tank.movementTimer -= 1;

        // If movement timer expires or obstacle detected, pick a new direction
        if (tank.movementTimer <= 0 || detectObstacleAlongRay(tank.x, tank.y, tank.angle, 3 * PLAYER_SIZE, level)) {
            tank.targetDirection += (Math.random() - 0.5) * Math.PI; // Random new direction
            tank.movementTimer = Math.random() * 120 + 60; // Reset movement timer
        }

        tank._dodgeTimer = Math.max(0, (tank._dodgeTimer || 0) - 1);

        // Intelligence Tank: when not dodging, flank the nearest player
        if (tank.tier === 12) {
            let nearestPlayer = null, nearestDist = Infinity;
            for (const id in players) {
                const p = players[id];
                if (!p.isAI && !p.isDead) {
                    const d = Math.hypot(p.x - tank.x, p.y - tank.y);
                    if (d < nearestDist) { nearestDist = d; nearestPlayer = p; }
                }
            }
            if (nearestPlayer) {
                const directAngle = Math.atan2(nearestPlayer.y - tank.y, nearestPlayer.x - tank.x);
                tank.targetDirection = directAngle + tank.flankSide * Math.PI / 2;
            }
        }

        // Linger: steer body toward last known player position
        if ((tank.targetLostTimer || 0) > 0 && tank.lastKnownTarget && tank.tier !== 12) {
            tank.targetDirection = Math.atan2(tank.lastKnownTarget.y - tank.y, tank.lastKnownTarget.x - tank.x);
        }
    }


    // 2) Shooting: be strict—only direct bullets on true collision course
    const shootThreats = candidates
        .filter(c => c.dot >= SHOOT_DOT && c.tStar >= 0)
        .sort((a, b) => (a.tStar - b.tStar) || (a.dist - b.dist));


    // if (tank.tier != 'button') {
    //     tank.name = tank.fireCooldown //debug 
    // }

    // Tiers >= 4 can shoot down bullets; exclude laser (5) and cannon (11) which can't usefully intercept
    if (tank.tier >= 4 && tank.tier !== 5 && tank.tier !== 11 && tank.tier !== 9 && tank.tier !== 13 && tank.tier !== 14 && tank.tier !== 15 && tank.tier !== 16 && shootThreats.length) {
        for (const { bullet } of shootThreats) {
            if (fireAtDangerBullet(lobbyCode, tank, bullet, bullets, level, players)) break;
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

    if (tank.tier === 12) {
        // Intelligence Tank: omniscient — find nearest player regardless of LOS, lead shot
        let nearestPlayer = null, nearestDist = Infinity;
        for (let id in players) {
            const player = players[id];
            if (!player.isAI && !player.isDead) {
                const dist = Math.hypot(player.x - tank.x, player.y - tank.y);
                if (dist <= shootingRange && dist < nearestDist) {
                    nearestDist = dist;
                    nearestPlayer = player;
                }
            }
        }
        if (nearestPlayer) {
            // Estimate player velocity from the tank's memory of last known position
            const vx = nearestPlayer.x - (tank.prevTargetX ?? nearestPlayer.x);
            const vy = nearestPlayer.y - (tank.prevTargetY ?? nearestPlayer.y);
            const leadAngle = computeLeadAngle(tank.x, tank.y, BULLET_SPEED, nearestPlayer.x, nearestPlayer.y, vx, vy);
            tank.prevTargetX = nearestPlayer.x;
            tank.prevTargetY = nearestPlayer.y;
            playerInSight = { player: nearestPlayer, angle: leadAngle };
        }
    } else if (tank.tier === 16) {
        // Phantom Sniper: omniscient — finds nearest player, leads with sniper bullet speed
        let nearestPlayer = null, nearestDist = Infinity;
        for (let id in players) {
            const player = players[id];
            if (!player.isAI && !player.isDead) {
                const dist = Math.hypot(player.x - tank.x, player.y - tank.y);
                if (dist <= shootingRange && dist < nearestDist) {
                    nearestDist = dist;
                    nearestPlayer = player;
                }
            }
        }
        if (nearestPlayer) {
            const vx = nearestPlayer.x - (tank.prevTargetX ?? nearestPlayer.x);
            const vy = nearestPlayer.y - (tank.prevTargetY ?? nearestPlayer.y);
            const leadAngle = computeLeadAngle(tank.x, tank.y, BULLET_SPEED * 3.0, nearestPlayer.x, nearestPlayer.y, vx, vy);
            tank.prevTargetX = nearestPlayer.x;
            tank.prevTargetY = nearestPlayer.y;
            playerInSight = { player: nearestPlayer, angle: leadAngle };
        }
    } else {
        // Standard LOS detection
        for (let id in players) {
            const player = players[id];
            if (!player.isAI && !player.isDead) {
                const dx = player.x - tank.x;
                const dy = player.y - tank.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance <= shootingRange) {
                    const angleToPlayer = Math.atan2(dy, dx);

                    let diff = ((angleToPlayer - tank.turretAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
                    if (diff < -Math.PI) {
                        diff += 2 * Math.PI;
                    }

                    if (Math.abs(diff) < Math.PI / 3) {
                        if (!detectObstacleAlongRay(tank.x, tank.y, angleToPlayer, distance, level)) {
                            playerInSight = { player, angle: angleToPlayer };
                            break;
                        }
                    }
                }
            }
        }
    }

    // Harbinger pulse/ring fires regardless of line-of-sight
    if (tank.tier === 11) {
        tank.ringCooldown = (tank.ringCooldown ?? 100) - 1;
        if (tank.ringCooldown <= 0) {
            // Pulse: capture nearby player bullets — change owner so they damage players, reverse & slow
            const pulseRadius = TILE_SIZE * 3.5;
            bullets.forEach(b => {
                if (b.owner === tank.id) return;
                const bulletOwner = players[b.owner];
                if (!bulletOwner || bulletOwner.isAI) return; // only capture player bullets
                if (Math.hypot(b.x - tank.x, b.y - tank.y) > pulseRadius) return;
                b.owner = tank.id;
                b.harbingerCaptured = true;
                b.speed *= 0.65;
                // Deflect radially outward from the Harbinger's center
                b.angle = Math.atan2(b.y - tank.y, b.x - tank.x);
            });
            tank.ringCooldown = 100;
            io.to(lobbyCode).emit('explosion', {
                x: tank.x, y: tank.y, z: PLAYER_SIZE * 1.5,
                size: PLAYER_SIZE * 2.5, dSize: 2.5, color: [200, 30, 200],
                effect: 'harbinger_pulse',
            });
            io.to(lobbyCode).emit('explosion', {
                x: tank.x, y: tank.y, z: PLAYER_SIZE * 1.5,
                size: PLAYER_SIZE * 2.5, dSize: 2.5, color: [200, 30, 200],
                effect: 'harbinger_ring',
            });
        }
    }

    if (playerInSight) {
        // Record last known position and reset linger timer
        tank.lastKnownTarget = { x: playerInSight.player.x, y: playerInSight.player.y };
        tank.targetLostTimer = 180;

        // Shield Tank — raise shield facing the player
        if (tank.tier === 9) {
            tank.shieldActive = true;
            tank.shieldFacing = playerInSight.angle;
            tank.shieldLinger = 90; // persist 1.5s after losing sight
        }

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
            case 10: // Titan — tight triple-shot at rapid fire rate
                if (tank.fireCooldown <= 0) {
                    fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level);
                    fireBullet(lobbyCode, tank, tank.turretAngle - Math.PI / 11, bullets, level);
                    fireBullet(lobbyCode, tank, tank.turretAngle + Math.PI / 11, bullets, level);
                    tank.fireCooldown = fireCooldown;
                }
                break;
            case 11: // Harbinger — 5-shot spread (pulse/ring handled above, always fires)
                if (tank.fireCooldown <= 0) {
                    for (let s = -2; s <= 2; s++) {
                        fireBullet(lobbyCode, tank, tank.turretAngle + s * (Math.PI / 9), bullets, level);
                    }
                    tank.fireCooldown = fireCooldown;
                }
                break;
            case 12: // Intelligence — lead shot, turret already tracks to predicted position
                if (tank.fireCooldown <= 0) {
                    fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level);
                    tank.fireCooldown = fireCooldown;
                }
                break;
            case 13: // Laser Pulse — short-range, frequent laser bursts
                if (tank.isFiringLaser) {
                    tank.laserDuration--;
                    const isActive13 = tank.laserDuration < 25;
                    fireLaser(lobby, tank, players, level, isActive13);
                    if (tank.laserDuration <= 0) {
                        tank.isFiringLaser = false;
                        tank.fireCooldown = fireCooldown;
                    }
                    tank.turretAngle = lerpAngle(tank.turretAngle, playerInSight.angle, 0.15);
                    tank.turretRotationalVelocity = 0;
                    return;
                }
                if (tank.fireCooldown <= 0) {
                    tank.isFiringLaser = true;
                    tank.laserDuration = 55;
                }
                break;
            case 14: // Cannoneer — fires a heavy cannonball
                if (tank.fireCooldown <= 0) {
                    fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level);
                    tank.fireCooldown = fireCooldown;
                    io.to(lobbyCode).emit('explosion', {
                        x: tank.x + Math.cos(tank.turretAngle) * PLAYER_SIZE * 1.5,
                        y: tank.y + Math.sin(tank.turretAngle) * PLAYER_SIZE * 1.5,
                        z: PLAYER_SIZE * 1.4, size: BULLET_SIZE * 1.5, dSize: 1, color: [170, 110, 20],
                    });
                }
                break;
            case 15: // Sovereign — fires twin heavy cannonballs slightly spread
                if (tank.fireCooldown <= 0) {
                    fireBullet(lobbyCode, tank, tank.turretAngle - 0.12, bullets, level);
                    fireBullet(lobbyCode, tank, tank.turretAngle + 0.12, bullets, level);
                    tank.fireCooldown = fireCooldown;
                    io.to(lobbyCode).emit('explosion', {
                        x: tank.x + Math.cos(tank.turretAngle) * PLAYER_SIZE * 2,
                        y: tank.y + Math.sin(tank.turretAngle) * PLAYER_SIZE * 2,
                        z: PLAYER_SIZE * 1.4, size: BULLET_SIZE * 2, dSize: 1.5, color: [100, 180, 255],
                    });
                }
                break;
            case 16: // Phantom Sniper — charge up then fire a piercing wallPiercing shot
                if (tank.sniperCharging) {
                    tank.sniperChargeTimer--;
                    if (tank.sniperChargeTimer <= 0) {
                        tank.sniperCharging = false;
                        fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level);
                        tank.fireCooldown = fireCooldown;
                    }
                } else if (tank.fireCooldown <= 0) {
                    tank.sniperCharging = true;
                    tank.sniperChargeTimer = 70;
                }
                break;
            default:
                if (tank.fireCooldown <= 0) {
                    fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level); // Single shot for other tiers
                    tank.fireCooldown = fireCooldown; // Reset cooldown
                }
                break;
        }
        if (!tank._defendingThisFrame && !tank.sniperCharging) {
            tank.turretAngle = lerpAngle(tank.turretAngle, playerInSight.angle, 0.1);
        }
        tank.turretRotationalVelocity = 0;
    } else {
        if (tank.tier === 5) {
            tank.isFiringLaser = false;
            tank.laserDuration = 100;
        }
        if (tank.tier === 13) {
            tank.isFiringLaser = false;
            tank.laserDuration = 55;
        }
        if (tank.tier === 16 && tank.sniperCharging) {
            // Cancel charge if no target in range
            tank.sniperCharging = false;
            tank.sniperChargeTimer = 0;
        }
        if (tank.tier === 9) {
            if ((tank.shieldLinger || 0) > 0) {
                tank.shieldLinger--;
                // Keep shield active while lingering
            } else {
                tank.shieldActive = false;
            }
        }

        if ((tank.targetLostTimer || 0) > 0) {
            // Linger: keep tracking toward last known position, but don't fire
            tank.targetLostTimer--;
            const lkdx = tank.lastKnownTarget.x - tank.x;
            const lkdy = tank.lastKnownTarget.y - tank.y;
            const lkAngle = Math.atan2(lkdy, lkdx);
            if (!tank._defendingThisFrame) {
                tank.turretAngle = lerpAngle(tank.turretAngle, lkAngle, turretSpeed);
            }
            tank.turretRotationalVelocity = 0;
        } else {
            // No information — rotate turret randomly
            tank.fireCooldown = fireCooldown / 2;
            tank.turretAngle += tank.turretRotationalVelocity;
            tank.turnTimer -= 1;

            if (tank.turnTimer <= 0) {
                let rand = Math.random();
                tank.turretRotationalVelocity = (rand * rand - 0.5) * turretSpeed;
                tank.turnTimer = Math.random() * 120 + 60;
            }
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
        case 10:
            newBullet = {
                id: bullets.length,
                owner: player.id,
                x: bulletX,
                y: bulletY,
                angle: angle,
                speed: BULLET_SPEED,
                bounces: 0
            }
            break;
        case 11: // Harbinger spread bullet — slower, no bounce
            newBullet = {
                id: bullets.length,
                owner: player.id,
                x: bulletX,
                y: bulletY,
                angle: angle,
                speed: BULLET_SPEED * 0.7,
                bounces: 0,
            }
            break;
        case 14: // Cannoneer — slow heavy cannonball
            newBullet = {
                id: bullets.length,
                owner: player.id,
                x: bulletX,
                y: bulletY,
                angle: angle,
                speed: BULLET_SPEED * 1.3,
                bounces: 0,
                isCannonball: true,
                isHeavyCannonball: true,
                hp: 2,
                splashRadius: PLAYER_SIZE * 2.5,
                explosionSize: BULLET_SIZE * 4,
            }
            break;
        case 15: // Sovereign — massive cannonball with large splash
            newBullet = {
                id: bullets.length,
                owner: player.id,
                x: bulletX,
                y: bulletY,
                angle: angle,
                speed: BULLET_SPEED * 1.5,
                bounces: 0,
                isCannonball: true,
                isHeavyCannonball: true,
                hp: 3,
                splashRadius: PLAYER_SIZE * 3.5,
                explosionSize: BULLET_SIZE * 6,
            }
            break;
        case 16: // Phantom Sniper — fast piercing wallPiercing shot
            newBullet = {
                id: bullets.length,
                owner: player.id,
                x: bulletX,
                y: bulletY,
                angle: angle,
                speed: BULLET_SPEED * 3.0,
                bounces: 0,
                wallPiercing: true,
                hp: 4,
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
                        } else if (!player.godMode) {
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
        isActive: isActive,
        duration: 2,
        color: [255, 50, 0],
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

function avoidBullet(tank, bullet, level) {
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

    // Angular preference (away from bullet)
    const preferred = diff1 > diff2 ? perpendicular1 : perpendicular2;
    const fallback = diff1 > diff2 ? perpendicular2 : perpendicular1;

    if (!level) return preferred;

    // Check how far each direction is clear of walls; pick the one with more space
    const probeShort = 2 * PLAYER_SIZE;
    const probeLong = 4 * PLAYER_SIZE;
    const preferredBlocked = detectObstacleAlongRay(tank.x, tank.y, preferred, probeShort, level);
    const fallbackBlocked = detectObstacleAlongRay(tank.x, tank.y, fallback, probeShort, level);

    if (preferredBlocked && !fallbackBlocked) return fallback;
    if (!preferredBlocked && fallbackBlocked) return preferred;

    // Both clear or both blocked at short range — check longer range and pick more open direction
    const preferredBlockedLong = detectObstacleAlongRay(tank.x, tank.y, preferred, probeLong, level);
    const fallbackBlockedLong = detectObstacleAlongRay(tank.x, tank.y, fallback, probeLong, level);
    if (preferredBlockedLong && !fallbackBlockedLong) return fallback;

    return preferred;
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
function fireAtDangerBullet(lobbyCode, tank, dangerBullet, bullets, level, players) {
    const interceptAngle = computeInterceptAngle(tank, dangerBullet);

    // Snap turret toward intercept faster than normal offensive tracking
    tank.turretAngle = lerpAngle(tank.turretAngle, interceptAngle, 0.40);
    tank.turretRotationalVelocity = 0;
    tank._defendingThisFrame = true; // suppress offensive turret override this frame

    // Use a separate defenseCooldown so defensive shots don’t block offensive ones and vice-versa
    if ((tank.defenseCooldown || 0) <= 0) {
        fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level);
        tank.defenseCooldown = 20; // 20-frame independent cooldown for point-defense
        return true;
    }
    return false;
}

/**
 * Compute the angle to fire at so a bullet (speed bulletSpeed) intercepts
 * a moving target. Uses quadratic time-of-flight solution; falls back to
 * direct aim if no solution exists.
 */
function computeLeadAngle(sx, sy, bulletSpeed, tx, ty, tvx, tvy) {
    const dx = tx - sx, dy = ty - sy;
    const A = tvx * tvx + tvy * tvy - bulletSpeed * bulletSpeed;
    const B = 2 * (dx * tvx + dy * tvy);
    const C = dx * dx + dy * dy;

    let t = null;
    if (Math.abs(A) < 1e-6) {
        if (Math.abs(B) > 1e-6) { const tl = -C / B; if (tl > 0) t = tl; }
    } else {
        const D = B * B - 4 * A * C;
        if (D >= 0) {
            const s = Math.sqrt(D);
            const t1 = (-B - s) / (2 * A), t2 = (-B + s) / (2 * A);
            const pos = [t1, t2].filter(tt => tt > 0);
            if (pos.length) t = Math.min(...pos);
        }
    }
    if (t === null) return Math.atan2(dy, dx);
    return Math.atan2(dy + tvy * t, dx + tvx * t);
}

module.exports = {
    setIO,
    initializeAITank,
    // initializeAITanks,
    updateAITanks,
    detectObstacleAlongRay,
};
