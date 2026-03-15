const { TILE_SIZE, PLAYER_SIZE, BULLET_SIZE, BULLET_SPEED, AI_TANK_SPEED } = require('./public/constants.js');
const { isCollidingWithWall, lerpAngle, isWall, getRandomNonWallPosition, isCollidingWithPlayer } = require('./utils.js');

let io = null; // Declare io variable

const _humans = [];
const _candidatesBuf = []; // reused per-tank bullet scan buffer (avoids per-tick allocation)

// Function to set io instance
function setIO(ioInstance) {
    io = ioInstance;
}

// Initialize AI tanks

const colorList = [[100, 100, 100], [200, 100, 100], [200, 200, 100], [100, 200, 100], [200, 100, 200], [50, 150, 220], [200, 100, 50], [150, 100, 100], [190, 210, 240], [60, 100, 220], [30, 15, 50], [200, 30, 200], [220, 30, 90], [50, 200, 210], [170, 110, 20], [100, 180, 255], [40, 90, 40], [180, 220, 255], [220, 175, 50]]

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
        tank.cloakTimer = Math.ceil(Math.random() * 280); // random offset so phantoms don't all cloak together
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
        tank.ringCooldown = Math.ceil(Math.random() * 100);
        tank.buffs = { shield: 9 };
    }
    if (tier == 12) {
        tank.flankSide = 1;
        tank.flankTimer = Math.ceil(Math.random() * 150);
        tank.burstPending = 0;
        tank.buffs = { shield: 2 };
    }
    if (tier == 14) {
        tank.cannonCooldown = 0;
        tank.buffs = { shield: 1 };
    }
    if (tier == 15) {
        // Sovereign — massive, orbiting orb shield, cannonball artillery
        tank.orbAngle = Math.random() * Math.PI * 2;
        tank.flankSide = Math.random() < 0.5 ? 1 : -1;
        tank.buffs = { shield: 7 };
    }
    if (tier == 16) {
        // Phantom Sniper — cloaks to reposition, then charges 3 shots, then recloaks
        tank.cloaked = true;
        tank.sniperPhase = 'cloak';
        tank.sniperCloakTimer = Math.ceil(Math.random() * 120 + 60);
        tank.sniperShotsLeft = 0;
        tank.flankSide = Math.random() < 0.5 ? 1 : -1;
        tank.buffs = { shield: 3 };
    }
    if (tier == 17) {
        // Wraith — stealths (invulnerable+fast), rapid single-direction fire, smoke grenades
        tank.wraithStealthed = false;
        tank.wraithPhaseTimer = Math.ceil(Math.random() * 300); // random offset so wraiths don't all stealth together
        tank.wraithSmokeTimer = 200;
        tank.buffs = { shield: 6 };
    }
    if (tier == 18) {
        // Commander — nullfield defense, periodic ally aura, active bullet interception
        tank.nullAngle = Math.random() * Math.PI * 2;
        tank.auraCooldown = Math.ceil(Math.random() * 150 + 80);
        tank.auraActive = false;
        tank.auraDuration = 0;
        tank.flankSide = Math.random() < 0.5 ? 1 : -1;
        tank.buffs = { shield: 8 };
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

    // Precompute human player positions once for culling (reuse array to avoid GC pressure)
    _humans.length = 0;
    for (const id in players) { const p = players[id]; if (!p.isAI && !p.isDead) _humans.push(p); }
    const humans = _humans;
    const cullDist = TILE_SIZE * 30; // skip full AI logic beyond this range
    const cullDistSq = cullDist * cullDist;

    for (let id in players) {
        const tank = players[id];
        if (!tank.isAI || tank.isDead || tank.tier === 'chest' || tank.isMuseum) continue;
        allDead = false;

        // One pass: cull distance + nearest human (plain) + nearest visible (non-ghost) human
        let nearestHumanDistSq = Infinity, nearestVisibleDistSq = Infinity;
        let nearestHuman = null, nearestVisibleHuman = null;
        for (const h of humans) {
            const dx = tank.x - h.x, dy = tank.y - h.y;
            const dsq = dx * dx + dy * dy;
            if (dsq < nearestHumanDistSq) { nearestHumanDistSq = dsq; nearestHuman = h; }
            if (!h.ghostCloaked && dsq < nearestVisibleDistSq) { nearestVisibleDistSq = dsq; nearestVisibleHuman = h; }
        }
        tank._culled = humans.length > 0 && nearestHumanDistSq > cullDistSq;
        tank._nearestHuman = nearestHuman;
        tank._nearestHumanDist = nearestHuman ? Math.sqrt(nearestHumanDistSq) : Infinity;
        tank._nearestVisibleHuman = nearestVisibleHuman;
        tank._nearestVisibleHumanDist = nearestVisibleHuman ? Math.sqrt(nearestVisibleDistSq) : Infinity;

        updateAITank(lobby, lobbyCode, tank, level, players, bullets);
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
        const orbReachSq = (orbRadius + wallHalfWidth + PLAYER_SIZE) * (orbRadius + wallHalfWidth + PLAYER_SIZE);
        for (let k = 0; k < bullets.length; k++) {
            const b = bullets[k];
            if (b._dead || b.owner === tank.id) continue; // skip own shots
            const bOwner = players[b.owner];
            if (bOwner && bOwner.isAI) continue; // don't block other bot bullets
            // Pre-cull: skip bullets outside any orb's possible reach
            const bx = b.x - tank.x, by = b.y - tank.y;
            if (bx * bx + by * by > orbReachSq) continue;
            for (let r = 0; r < 4; r++) {
                const a = tank.orbAngle + r * Math.PI / 2;
                const ox = tank.x + Math.cos(a) * orbRadius;
                const oy = tank.y + Math.sin(a) * orbRadius;
                const dx = b.x - ox;
                const dy = b.y - oy;
                const along = dx * Math.cos(a) + dy * Math.sin(a);
                const perp = -dx * Math.sin(a) + dy * Math.cos(a);
                if (Math.abs(along) > wallHalfDepth) continue;
                if (Math.abs(perp) > wallHalfWidth) continue;
                const inward = Math.cos(b.angle) * Math.cos(a) + Math.sin(b.angle) * Math.sin(a);
                if (inward >= 0) continue;
                b._dead = true;
                io.to(lobbyCode).emit('explosion', {
                    x: ox, y: oy, z: PLAYER_SIZE * 1.5,
                    size: PLAYER_SIZE * 0.8, dSize: 1.2, color: [100, 180, 255],
                });
                break;
            }
        }
        // Compact in-place (O(n)) rather than repeated splice (O(n²))
        let w = 0;
        for (let r = 0; r < bullets.length; r++) { if (!bullets[r]._dead) bullets[w++] = bullets[r]; }
        bullets.length = w;
    }

    // Commander nullfield — 6 spinning panels intercept incoming player bullets
    if (tank.tier === 18) {
        tank.nullAngle = ((tank.nullAngle || 0) + 0.025) % (Math.PI * 2);
        const nullRadius = TILE_SIZE * 2;
        const wallHalfWidth = PLAYER_SIZE * 1.75; // wider panels at this radius
        const wallHalfDepth = PLAYER_SIZE * 0.5;
        const slowRadiusSq = (TILE_SIZE * 4) ** 2;
        const panelReachSq = (nullRadius + wallHalfWidth + PLAYER_SIZE) ** 2;
        for (let k = 0; k < bullets.length; k++) {
            const b = bullets[k];
            if (b._dead || b.owner === tank.id) continue;
            const bOwner = players[b.owner];
            if (bOwner && bOwner.isAI) continue;
            const bdx = b.x - tank.x, bdy = b.y - tank.y;
            const bDistSq = bdx * bdx + bdy * bdy;
            // Skip bullets far enough that no panel can possibly reach them
            if (bDistSq > panelReachSq) {
                // Still apply slow-field flag update for distant bullets
                b._commanderSlowed = false;
                continue;
            }
            let blocked = false;
            for (let r = 0; r < 6; r++) {
                const a = tank.nullAngle + r * Math.PI / 3;
                const ox = tank.x + Math.cos(a) * nullRadius;
                const oy = tank.y + Math.sin(a) * nullRadius;
                const dx = b.x - ox;
                const dy = b.y - oy;
                const along = dx * Math.cos(a) + dy * Math.sin(a);
                const perp = -dx * Math.sin(a) + dy * Math.cos(a);
                if (Math.abs(along) > wallHalfDepth) continue;
                if (Math.abs(perp) > wallHalfWidth) continue;
                const inward = Math.cos(b.angle) * Math.cos(a) + Math.sin(b.angle) * Math.sin(a);
                if (inward >= 0) continue;
                b._dead = true;
                blocked = true;
                io.to(lobbyCode).emit('explosion', {
                    x: ox, y: oy, z: PLAYER_SIZE * 1.2,
                    size: PLAYER_SIZE * 0.7, dSize: 1.0, color: [220, 175, 50],
                });
                break;
            }
            // Passive drag: slow player bullets passing through the aura zone
            if (!blocked) {
                if (bDistSq < slowRadiusSq) {
                    b.speed = Math.max(BULLET_SPEED * 0.45, (b.speed || BULLET_SPEED) * 0.97);
                    b._commanderSlowed = true;
                } else {
                    b._commanderSlowed = false;
                }
            }
        }
        // Compact in-place (O(n)) rather than repeated splice (O(n²))
        let w = 0;
        for (let r = 0; r < bullets.length; r++) { if (!bullets[r]._dead) bullets[w++] = bullets[r]; }
        bullets.length = w;
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
            turretSpeed = 0.22;
            break;
        case 12: // Intelligence — fast, omniscient, flanks and leads shots; piercing shots not rapid fire
            speed = 1.9 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 30;
            fireCooldown = 70;
            turretSpeed = 0.50;
            break;
        case 13: // Laser Pulse — fast, short-range laser with high uptime
            speed = 1.2 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 20;
            fireCooldown = 115;
            turretSpeed = 0.11; // slow base tracking — must commit to an angle
            break;
        case 14: // Cannoneer — slow, fires explosive cannonballs; shoots through walls but has finite range
            speed = 0.75 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 35;
            fireCooldown = 95;
            turretSpeed = 0.16;
            break;
        case 15: // Sovereign — massive boss, orbiting orb shield, heavy cannonballs
            speed = 0.45 * AI_TANK_SPEED;
            shootingRange = Infinity;
            fireCooldown = 80;
            turretSpeed = 0.22;
            break;
        case 16: // Phantom Sniper — flanks while cloaked, stands still to charge and fire
            speed = (tank.sniperPhase !== 'cloak' || (tank.sniperCloakTimer ?? 150) <= 20) ? 0 : 1.3 * AI_TANK_SPEED;
            shootingRange = Infinity;
            fireCooldown = 30;
            turretSpeed = 0.55;
            break;
        case 17: // Wraith — stealth/attack cycle, piercing shots not rapid fire
            speed = tank.wraithStealthed ? 2.4 * AI_TANK_SPEED : 1.0 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 24;
            fireCooldown = 55;
            turretSpeed = 0.30;
            break;
        case 18: // Commander — support boss, nullfield, periodic aura, ally defense
            speed = 0.35 * AI_TANK_SPEED;
            shootingRange = PLAYER_SIZE * 28;
            fireCooldown = 55;
            turretSpeed = 0.30;
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

    // Periodic flank side flip for all strafing tanks
    if (tank.tier === 12 || tank.tier === 2 || tank.tier === 5 || tank.tier === 13) {
        if (!tank.flankSide) tank.flankSide = Math.random() < 0.5 ? 1 : -1;
        tank.flankTimer = (tank.flankTimer || 150) - 1;
        if (tank.flankTimer <= 0) {
            tank.flankSide = -tank.flankSide;
            tank.flankTimer = Math.floor(Math.random() * 80) + 100;
        }
    }

    // Endless mode scaling bonuses
    if (tank.endlessSpeedMult) speed *= tank.endlessSpeedMult;
    if (tank.endlessFireMult) fireCooldown = Math.max(10, Math.round(fireCooldown * tank.endlessFireMult));

    // Commander aura buff — temporary fire rate boost granted by a nearby Commander
    if ((tank.coordBuff || 0) > 0) {
        tank.coordBuff--;
        fireCooldown = Math.max(10, Math.round(fireCooldown * 0.7));
    }

    // Initialize fire cooldown with a random offset so spawned groups don't all fire simultaneously
    if (tank.fireCooldown === undefined || tank.fireCooldown === null) {
        tank.fireCooldown = Math.floor(Math.random() * fireCooldown);
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
    const RANGE_SQ = RANGE * RANGE;
    const AVOID_DOT = 0.35;
    const SHOOT_DOT = 0.80;

    // Scan all bullets once — skip for culled (distant) tanks
    // Cooldowns tick by 2 because updateAITank now runs at 30fps (every other physics tick)
    if (tank._culled) {
        if (tank.fireCooldown > 0) tank.fireCooldown -= 2;
        return;
    }
    _candidatesBuf.length = 0; // reuse module-level buffer, no allocation
    for (const b of bullets) {
        if (b.owner === tank.id) continue; // ignore own shots
        const bulletOwner = players[b.owner];
        if (bulletOwner && bulletOwner.isAI) continue; // only react to player bullets
        const dx = b.x - tank.x, dy = b.y - tank.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > RANGE_SQ) continue; // squared check avoids sqrt
        const dist = Math.sqrt(distSq);
        const dot = bulletCosTowardTank(tank, b);
        const { tStar, dmin2 } = closestApproach(b, tank);
        _candidatesBuf.push({ bullet: b, dist, dot, tStar, dmin2 });
    }

    // 1) Driving: be liberal—avoid the most concerning bullet by earliest impact (or highest dot as tie)
    const driveThreats = _candidatesBuf.filter(c => c.dot >= AVOID_DOT && c.tStar >= 0);
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

        // Intelligence Tank: adaptive approach — charge when far, orbit when close
        if (tank.tier === 12) {
            const nearestPlayer = tank._nearestHuman;
            const nearestDist = tank._nearestHumanDist;
            if (nearestPlayer) {
                const directAngle = Math.atan2(nearestPlayer.y - tank.y, nearestPlayer.x - tank.x);
                // Far: charge directly. Mid: 60° flank. Close: tight 80° orbit
                const flankAngle = nearestDist > PLAYER_SIZE * 12 ? 0
                    : nearestDist > PLAYER_SIZE * 6 ? tank.flankSide * Math.PI * 0.33
                    : tank.flankSide * Math.PI * 0.44;
                tank.targetDirection = directAngle + flankAngle;
            }
        }

        // Allies with Commander buff gravitate toward the nearest Commander
        if ((tank.coordBuff || 0) > 0 && tank.tier !== 18) {
            let nearestCommander = null, nearestCommanderDistSq = Infinity;
            for (const id in players) {
                const p = players[id];
                if (!p.isAI || p.isDead || p.tier !== 18) continue;
                const dx = p.x - tank.x, dy = p.y - tank.y;
                const dsq = dx * dx + dy * dy;
                if (dsq < nearestCommanderDistSq) { nearestCommanderDistSq = dsq; nearestCommander = p; }
            }
            if (nearestCommander && nearestCommanderDistSq > (TILE_SIZE * 3) * (TILE_SIZE * 3)) {
                const toCommander = Math.atan2(nearestCommander.y - tank.y, nearestCommander.x - tank.x);
                tank.targetDirection = lerpAngle(tank.targetDirection, toCommander, 0.15);
            }
        }

        // Boss tiers: navigate toward nearest player with wall-following intelligence
        if (tank.tier === 11 || tank.tier === 15 || tank.tier === 16 || tank.tier === 17 || tank.tier === 18) {
            const nearestPlayer = tank._nearestHuman;
            const nearestDist = tank._nearestHumanDist;
            if (nearestPlayer) {
                const directAngle = Math.atan2(nearestPlayer.y - tank.y, nearestPlayer.x - tank.x);
                const probeLen = 3 * PLAYER_SIZE;

                // Preferred stand-off distances
                const preferredDist = tank.tier === 15 ? PLAYER_SIZE * 9
                    : tank.tier === 18 ? PLAYER_SIZE * 12 : 0;
                // Phantom Sniper: flank perpendicular while cloaked; stand still while visible
                let targetAngle;
                if (tank.tier === 16) {
                    if (!tank.cloaked) targetAngle = tank.targetDirection; // planted — hold current angle
                    else targetAngle = directAngle + tank.flankSide * Math.PI * 0.5;
                } else {
                    targetAngle = nearestDist < preferredDist && preferredDist > 0
                        ? directAngle + Math.PI + tank.flankSide * 0.4 // retreat + strafe
                        : directAngle;
                }

                const wallAhead = detectObstacleAlongRay(tank.x, tank.y, tank.targetDirection, probeLen, level);
                if (wallAhead) {
                    // Wall-following: pick the open side and commit
                    tank.navBlockedTimer = (tank.navBlockedTimer || 0) + 1;
                    if (tank.navBlockedTimer === 1) {
                        // Decide turn direction once; stick with it
                        const leftClear  = !detectObstacleAlongRay(tank.x, tank.y, tank.targetDirection - Math.PI / 2, probeLen, level);
                        const rightClear = !detectObstacleAlongRay(tank.x, tank.y, tank.targetDirection + Math.PI / 2, probeLen, level);
                        tank.navTurnDir = leftClear ? -1 : rightClear ? 1 : (Math.random() < 0.5 ? -1 : 1);
                    }
                    tank.targetDirection += tank.navTurnDir * 0.18;
                } else {
                    tank.navBlockedTimer = 0;
                    tank.targetDirection = lerpAngle(tank.targetDirection, targetAngle, 0.12);
                }

                // Stuck detection: if barely moved in 60 frames, try opposite wall side
                tank._prevDistToTarget = tank._prevDistToTarget ?? nearestDist;
                tank._stuckCounter = (tank._stuckCounter || 0) + 1;
                if (tank._stuckCounter >= 60) {
                    if (Math.abs(nearestDist - tank._prevDistToTarget) < PLAYER_SIZE) {
                        tank.navTurnDir = -(tank.navTurnDir || 1);
                        tank.targetDirection += tank.navTurnDir * Math.PI * 0.5;
                    }
                    tank._stuckCounter = 0;
                    tank._prevDistToTarget = nearestDist;
                }
            }
        } else if (tank.tier === 2 || tank.tier === 5 || tank.tier === 13) {
            // Range-maintaining: Marksman (2), Beamer (5), Laser Pulse (13)
            const preferredDist = tank.tier === 2  ? PLAYER_SIZE * 11  // Marksman: long range
                                : tank.tier === 5  ? PLAYER_SIZE * 10  // Beamer: needs room for beam
                                :                   PLAYER_SIZE * 5;   // Laser Pulse: close but not point-blank
            const nearestPlayer = tank._nearestHuman;
            const nearestDist = tank._nearestHumanDist;
            if (nearestPlayer) {
                const toPlayer = Math.atan2(nearestPlayer.y - tank.y, nearestPlayer.x - tank.x);
                if (nearestDist < preferredDist * 0.7) {
                    // Too close — retreat directly away while strafing slightly
                    tank.flankSide = tank.flankSide || 1;
                    tank.targetDirection = toPlayer + Math.PI + tank.flankSide * 0.25;
                } else if (nearestDist > preferredDist * 1.4) {
                    // Too far — close in
                    tank.targetDirection = lerpAngle(tank.targetDirection, toPlayer, 0.10);
                } else {
                    // In the zone — strafe perpendicular
                    if (!tank.flankSide) tank.flankSide = 1;
                    tank.targetDirection = lerpAngle(tank.targetDirection, toPlayer + tank.flankSide * Math.PI * 0.5, 0.08);
                }
            }
        }
    }


    // 2) Shooting: be strict—only direct bullets on true collision course
    const shootThreats = _candidatesBuf
        .filter(c => c.dot >= SHOOT_DOT && c.tStar >= 0)
        .sort((a, b) => (a.tStar - b.tStar) || (a.dist - b.dist));


    // if (tank.tier != 'button') {
    //     tank.name = tank.fireCooldown //debug 
    // }

    // Tiers >= 4 can shoot down bullets; exclude laser (5) and cannon (11) which can't usefully intercept
    // Endless-scaled tanks (endlessDefensive) can shoot down bullets regardless of tier
    const canDefend = (tank.endlessDefensive || tank.tier >= 4)
        && tank.tier !== 5 && tank.tier !== 11 && tank.tier !== 9
        && tank.tier !== 13 && tank.tier !== 14 && tank.tier !== 15 && tank.tier !== 16;
    if (canDefend && shootThreats.length) {
        for (const { bullet } of shootThreats) {
            if (fireAtDangerBullet(lobbyCode, tank, bullet, bullets, level, players)) break;
        }
    }

    // Commander: also intercept player bullets threatening nearby allies
    if (tank.tier === 18) {
        const allyDefendRadiusSq = (TILE_SIZE * 10) * (TILE_SIZE * 10);
        const bulletReachSq = (TILE_SIZE * 12) * (TILE_SIZE * 12); // generous envelope around ally radius
        const hitR = PLAYER_SIZE / 2 + BULLET_SIZE;
        const hitRSq9 = hitR * hitR * 9;
        let intercepted = false;
        for (const b of bullets) {
            if (intercepted) break;
            if (b.owner === tank.id) continue;
            const bOwner = players[b.owner];
            if (bOwner && bOwner.isAI) continue;
            // Skip bullets far from Commander — they can't threaten nearby allies
            const btx = b.x - tank.x, bty = b.y - tank.y;
            if (btx * btx + bty * bty > bulletReachSq) continue;
            for (const id in players) {
                if (id === tank.id) continue;
                const ally = players[id];
                if (!ally.isAI || ally.isDead) continue;
                // Squared distance check before expensive closestApproach
                const ax = ally.x - tank.x, ay = ally.y - tank.y;
                if (ax * ax + ay * ay > allyDefendRadiusSq) continue;
                const { tStar, dmin2 } = closestApproach(b, ally);
                if (tStar < 0) continue;
                if (dmin2 <= hitRSq9) {
                    if (fireAtDangerBullet(lobbyCode, tank, b, bullets, level, players)) { intercepted = true; break; }
                }
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
        tryMoveWithWallGlideAndEscape(tank, speed, level, isDodging);
    } else {
        const newX = tank.x + Math.cos(tank.angle) * speed;
        const newY = tank.y + Math.sin(tank.angle) * speed;
        if (!isCollidingWithWall(newX, tank.y, PLAYER_SIZE, level)) tank.x = newX;
        if (!isCollidingWithWall(tank.x, newY, PLAYER_SIZE, level)) tank.y = newY;
    }

    // Wraith stealth/attack cycle
    if (tank.tier === 17) {
        tank.wraithPhaseTimer = (tank.wraithPhaseTimer || 300) - 1;
        if (tank.wraithPhaseTimer <= 0) {
            const wasStealthed = tank.wraithStealthed;
            tank.wraithStealthed = !tank.wraithStealthed;
            tank.wraithPhaseTimer = tank.wraithStealthed ? 180 : 300; // 3s stealth, 5s visible
            if (wasStealthed && !tank.wraithStealthed) {
                // Ambush burst on reveal — 3-shot spread aimed at nearest player
                const ambushTarget = tank._nearestHuman;
                if (ambushTarget) {
                    const baseAngle = Math.atan2(ambushTarget.y - tank.y, ambushTarget.x - tank.x);
                    for (let s = -1; s <= 1; s++) {
                        fireBullet(lobbyCode, tank, baseAngle + s * 0.20, bullets, level);
                    }
                }
                tank.fireCooldown = 40; // brief pause after ambush before regular fire
            } else if (!wasStealthed && tank.wraithStealthed) {
                // Just became stealthed — smoke screen at own position + shield
                tank.shield = 1;
                lobby.smokeClouds = lobby.smokeClouds || [];
                lobby.smokeClouds.push({ x: tank.x, y: tank.y, radius: TILE_SIZE * 3, framesLeft: 480 });
                io.to(lobbyCode).emit('smokeCloud', { x: tank.x, y: tank.y, radius: TILE_SIZE * 3, duration: 480 });
            }
        }

        if (tank.wraithStealthed) {
            // Invulnerable while stealthed — only track turret toward nearest player, never fire
            const stealthTarget = tank._nearestHuman;
            if (stealthTarget) {
                const a = Math.atan2(stealthTarget.y - tank.y, stealthTarget.x - tank.x);
                tank.turretAngle = lerpAngle(tank.turretAngle, a, turretSpeed);
            }
            return;
        }
    }

    // Phantom Sniper — charge/fire/cloak state machine
    if (tank.tier === 16) {
        const CHARGE_FRAMES = 90;
        if (!tank.sniperPhase) tank.sniperPhase = 'cloak';

        if (tank.sniperPhase === 'cloak') {
            tank.sniperCloakTimer = (tank.sniperCloakTimer ?? 150) - 1;
            if (tank.sniperCloakTimer <= 0) {
                tank.sniperPhase = 'charge';
                tank.sniperChargeTimer = CHARGE_FRAMES;
                tank.sniperShotsLeft = 3;
                tank.cloaked = false;
            }
            return; // no turret/firing while cloaked
        } else {
            // Charge phase: track player, slowing to a lock as timer runs out
            const chargeProgress = 1 - (tank.sniperChargeTimer ?? CHARGE_FRAMES) / CHARGE_FRAMES;
            const trackRate = turretSpeed * Math.max(0.005, Math.pow(1.0 - chargeProgress, 2.5));

            const target = tank._nearestVisibleHuman;
            if (target) {
                const vx = target.x - (tank.prevTargetX ?? target.x);
                const vy = target.y - (tank.prevTargetY ?? target.y);
                tank.prevTargetX = target.x;
                tank.prevTargetY = target.y;
                const leadAngle = computeLeadAngle(tank.x, tank.y, BULLET_SPEED * 3.0, target.x, target.y, vx, vy);
                tank.turretAngle = lerpAngle(tank.turretAngle, leadAngle, trackRate);
            }

            tank.sniperChargeTimer = (tank.sniperChargeTimer ?? CHARGE_FRAMES) - 1;
            if (tank.sniperChargeTimer <= 0) {
                fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level);
                tank.sniperShotsLeft = (tank.sniperShotsLeft ?? 1) - 1;
                if (tank.sniperShotsLeft <= 0) {
                    tank.sniperPhase = 'cloak';
                    tank.cloaked = true;
                    tank.sniperCloakTimer = 150 + Math.ceil(Math.random() * 90);
                    tank.flankSide = -tank.flankSide;
                } else {
                    tank.sniperChargeTimer = CHARGE_FRAMES;
                }
            }
            return; // skip handleAITurret
        }
    }

    // Skip expensive targeting/firing for tanks far from all players
    if (!tank._culled) {
        handleAITurret(lobby, lobbyCode, tank, level, players, bullets, shootingRange, turretSpeed, fireCooldown);
    }
}

function handleAITurret(lobby, lobbyCode, tank, level, players, bullets, shootingRange, turretSpeed, fireCooldown) {
    let playerInSight = null;

    if (tank.tier === 12) {
        // Intelligence Tank: omniscient — nearest visible player, lead shot
        const nearestPlayer = tank._nearestVisibleHuman;
        const nearestDist = tank._nearestVisibleHumanDist;
        if (nearestPlayer && nearestDist <= shootingRange) {
            const vx = nearestPlayer.x - (tank.prevTargetX ?? nearestPlayer.x);
            const vy = nearestPlayer.y - (tank.prevTargetY ?? nearestPlayer.y);
            const leadAngle = computeLeadAngle(tank.x, tank.y, BULLET_SPEED, nearestPlayer.x, nearestPlayer.y, vx, vy);
            tank.prevTargetX = nearestPlayer.x;
            tank.prevTargetY = nearestPlayer.y;
            playerInSight = { player: nearestPlayer, angle: leadAngle };
        }
    } else if (tank.tier === 11 || tank.tier === 14 || tank.tier === 15 || tank.tier === 17 || tank.tier === 18) {
        // Boss tanks + Cannoneer: omniscient — nearest visible player, lead shot
        const nearestPlayer = tank._nearestVisibleHuman;
        const nearestDist = tank._nearestVisibleHumanDist;
        if (nearestPlayer && nearestDist <= shootingRange) {
            const vx = nearestPlayer.x - (tank.prevTargetX ?? nearestPlayer.x);
            const vy = nearestPlayer.y - (tank.prevTargetY ?? nearestPlayer.y);
            const bSpeed = tank.tier === 15 ? BULLET_SPEED * 1.5
                : tank.tier === 17 ? BULLET_SPEED * 1.6
                : tank.tier === 18 ? BULLET_SPEED * 1.2
                    : BULLET_SPEED;
            const leadAngle = computeLeadAngle(tank.x, tank.y, bSpeed, nearestPlayer.x, nearestPlayer.y, vx, vy);
            tank.prevTargetX = nearestPlayer.x;
            tank.prevTargetY = nearestPlayer.y;
            playerInSight = { player: nearestPlayer, angle: leadAngle };
        }
    } else {
        // Standard LOS detection — check nearest visible player only
        const player = tank._nearestVisibleHuman;
        if (player) {
            const dx = player.x - tank.x;
            const dy = player.y - tank.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= shootingRange * shootingRange) {
                const distance = Math.sqrt(distSq);
                const angleToPlayer = Math.atan2(dy, dx);
                let diff = ((angleToPlayer - tank.turretAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
                if (diff < -Math.PI) diff += 2 * Math.PI;
                if (Math.abs(diff) < Math.PI / 3) {
                    if (!detectObstacleAlongRay(tank.x, tank.y, angleToPlayer, distance, level)) {
                        playerInSight = { player, angle: angleToPlayer };
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
            const pulseRadiusSq = (TILE_SIZE * 3.5) * (TILE_SIZE * 3.5);
            bullets.forEach(b => {
                if (b.owner === tank.id) return;
                const bulletOwner = players[b.owner];
                if (!bulletOwner || bulletOwner.isAI) return; // only capture player bullets
                const bpx = b.x - tank.x, bpy = b.y - tank.y;
                if (bpx * bpx + bpy * bpy > pulseRadiusSq) return;
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

    // Commander aura — periodically grants +1 shield to all nearby AI allies
    if (tank.tier === 18) {
        if (tank.auraActive) {
            tank.auraDuration--;
            if (tank.auraDuration <= 0) {
                tank.auraActive = false;
                tank.auraCooldown = 250 + Math.ceil(Math.random() * 80);
            }
        } else {
            tank.auraCooldown--;
            if (tank.auraCooldown <= 0) {
                tank.auraActive = true;
                tank.auraDuration = 120;
                const auraRadiusSq = (TILE_SIZE * 9) * (TILE_SIZE * 9);
                for (const id in players) {
                    const ally = players[id];
                    if (!ally.isAI || ally.isDead || id === tank.id) continue;
                    const ax = ally.x - tank.x, ay = ally.y - tank.y;
                    if (ax * ax + ay * ay > auraRadiusSq) continue;
                    if (!ally.buffs) ally.buffs = {};
                    ally.buffs.shield = (ally.buffs.shield || 0) + 1; // +1 stacking shield per pulse
                    ally.coordBuff = 360; // 6s speed + fire rate boost
                    // Flash at each buffed ally position
                    io.to(lobbyCode).emit('explosion', {
                        x: ally.x, y: ally.y, z: PLAYER_SIZE * 1.5,
                        size: PLAYER_SIZE * 1.8, dSize: 3, color: [220, 175, 50],
                        effect: 'commander_buff',
                    });
                }
                io.to(lobbyCode).emit('explosion', {
                    x: tank.x, y: tank.y, z: PLAYER_SIZE * 2,
                    size: TILE_SIZE * 5, dSize: 2, color: [220, 175, 50],
                    effect: 'commander_ring',
                });
            }
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
            case 12: // Intelligence — single precise piercing shot
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
                    // Very slow tracking once committed — dodging sideways works
                    tank.turretAngle = lerpAngle(tank.turretAngle, playerInSight.angle, 0.06);
                    tank.turretRotationalVelocity = 0;
                    return;
                }
                if (tank.fireCooldown <= 0) {
                    tank.isFiringLaser = true;
                    tank.laserDuration = 70; // longer windup = more warning
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
            case 15: // Sovereign — single massive cannonball
                if (tank.fireCooldown <= 0) {
                    fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level);
                    tank.fireCooldown = fireCooldown;
                    io.to(lobbyCode).emit('explosion', {
                        x: tank.x + Math.cos(tank.turretAngle) * PLAYER_SIZE * 2,
                        y: tank.y + Math.sin(tank.turretAngle) * PLAYER_SIZE * 2,
                        z: PLAYER_SIZE * 1.4, size: BULLET_SIZE * 2, dSize: 1.5, color: [100, 180, 255],
                    });
                }
                break;
            case 16: // Phantom Sniper — handled in state machine above, never reaches here
                break;
            case 18: // Commander — suppression shots at visible players
                if (tank.fireCooldown <= 0) {
                    fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level);
                    tank.fireCooldown = fireCooldown;
                }
                break;
            default:
                if (tank.fireCooldown <= 0) {
                    fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level); // Single shot for other tiers
                    tank.fireCooldown = fireCooldown; // Reset cooldown
                }
                break;
        }
        if (!tank._defendingThisFrame) {
            tank.turretAngle = lerpAngle(tank.turretAngle, playerInSight.angle, turretSpeed);
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
        if (tank.tier === 9) {
            if ((tank.shieldLinger || 0) > 0) {
                tank.shieldLinger--;
                // Keep shield active while lingering
            } else {
                tank.shieldActive = false;
            }
        }

        if ((tank.targetLostTimer || 0) > 0) {
            // Linger: keep tracking toward last known position
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

    // Decrease cooldown timer — decrement by 2 since AI runs at 30fps (every other 60fps tick)
    if (tank.fireCooldown > 0) {
        tank.fireCooldown -= 2;
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

    // Boss tiers fire heavy shots that pierce/destroy walls — skip the wall proximity check
    const skipWallCheck = tank.tier === 11 || tank.tier === 14 || tank.tier === 15 || tank.tier === 16 || tank.tier === 17 || tank.tier === 18;
    if (!skipWallCheck && (isWall(colLeft, rowTop, level) || isWall(colRight, rowTop, level) || isWall(colLeft, rowBottom, level) || isWall(colRight, rowBottom, level))) {
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
        case 14: // Cannoneer — heavy cannonball
            newBullet = {
                id: bullets.length,
                owner: player.id,
                x: bulletX,
                y: bulletY,
                angle: angle,
                speed: BULLET_SPEED * 1.6,
                bounces: 0,
                isCannonball: true,
                isHeavyCannonball: true,
                hp: 3,
                splashRadius: PLAYER_SIZE * 3.2,
                explosionSize: BULLET_SIZE * 6,
            }
            break;
        case 15: // Sovereign — single massive wall-destroying cannonball
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
                hp: 4,
                splashRadius: PLAYER_SIZE * 3.5,
                explosionSize: BULLET_SIZE * 7,
                skipOwner: true, // prevent diagonal-spawn self-collision (bounding box > spawn radius at 45°)
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
        case 17: // Wraith — fast piercing shots
            newBullet = {
                id: bullets.length,
                owner: player.id,
                x: bulletX,
                y: bulletY,
                angle: angle,
                speed: BULLET_SPEED * 2.2,
                bounces: 0,
                hp: 2,
            }
            break;
        case 18: // Commander — solid suppression shot
            newBullet = {
                id: bullets.length,
                owner: player.id,
                x: bulletX,
                y: bulletY,
                angle: angle,
                speed: BULLET_SPEED * 1.2,
                bounces: 1,
                hp: 2,
            }
            break;
        case 12: // Intelligence — fast piercing shot, harder to dodge
            newBullet = {
                id: bullets.length,
                owner: player.id,
                x: bulletX,
                y: bulletY,
                angle: angle,
                speed: BULLET_SPEED * 2.0,
                bounces: 0,
                hp: 2,
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
        // Apply endless scaling to bullet speed and pierce (skip cannonballs — they're already strong)
        if (!newBullet.isCannonball) {
            if (player.endlessBulletSpeedMult) newBullet.speed = (newBullet.speed || BULLET_SPEED) * player.endlessBulletSpeedMult;
            if (player.endlessPierce > 0) newBullet.hp = (newBullet.hp || 1) + player.endlessPierce;
        }
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
                    if (lobby.mode !== 'lobby' || player.isAI) { // No player damage in lobby
                        // Apply damage to the player
                        if ((player.laserShieldCooldown || 0) > 0) {
                            // Shield just stripped — grace period before next damage
                        } else if (player.shield) {
                            player.shield = false;
                            player.laserShieldCooldown = 30; // 0.5s cooldown before damage can land
                        } else if (!player.godMode) {
                            player.isDead = true;
                        }
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
        owner: tank.id,
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

// DDA raycast — jumps directly to tile boundaries instead of small steps.
// ~10-30x faster than the old step-based version for typical ranges.
function detectObstacleAlongRay(playerX, playerY, angle, maxDistance, level) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let col = Math.floor(playerX / TILE_SIZE);
    let row = Math.floor(playerY / TILE_SIZE);

    const stepCol = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepRow = dy > 0 ? 1 : dy < 0 ? -1 : 0;

    // Distance along the ray to the next vertical/horizontal tile boundary
    const tDeltaX = dx !== 0 ? Math.abs(TILE_SIZE / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(TILE_SIZE / dy) : Infinity;

    let tMaxX = dx !== 0
        ? (dx > 0 ? (col + 1) * TILE_SIZE - playerX : playerX - col * TILE_SIZE) / Math.abs(dx)
        : Infinity;
    let tMaxY = dy !== 0
        ? (dy > 0 ? (row + 1) * TILE_SIZE - playerY : playerY - row * TILE_SIZE) / Math.abs(dy)
        : Infinity;

    let dist = 0;
    while (dist < maxDistance) {
        if (tMaxX < tMaxY) {
            dist = tMaxX;
            tMaxX += tDeltaX;
            col += stepCol;
        } else {
            dist = tMaxY;
            tMaxY += tDeltaY;
            row += stepRow;
        }
        if (dist > maxDistance) return false;
        if (level[row] && level[row][col] > 0) return true;
        if (!level[row] || level[row][col] === undefined) return false; // out of bounds
    }
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
    // Endless-scaled tanks react faster (down to 10 frames based on fire mult)
    const baseDC = tank.endlessDefensive ? Math.max(10, Math.round(20 * (tank.endlessFireMult || 1))) : 20;
    if ((tank.defenseCooldown || 0) <= 0) {
        fireBullet(lobbyCode, tank, tank.turretAngle, bullets, level);
        tank.defenseCooldown = baseDC;
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
    updateAITanks,
    detectObstacleAlongRay,
    computeLeadAngle,
};
