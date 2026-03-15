// levelGen.js — BSP random level generator.
// Returns a 2D number array in the same format levels.js expects:
//   1 = wall   0 = open   negative = entity  (same charCode formula as readLevels)
//
// Used by generateLevels.js (CLI) and levels.js (server, endless mode).

'use strict';

function rng(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function makeGrid(w, h) {
    return Array.from({ length: h }, () => new Array(w).fill(1));
}

function inBounds(g, x, y) {
    return y >= 0 && y < g.length && x >= 0 && x < g[0].length;
}

function carveRect(g, x, y, w, h) {
    for (let r = y; r < y + h; r++)
        for (let c = x; c < x + w; c++)
            if (inBounds(g, c, r)) g[r][c] = 0;
}

// 2-wide horizontal segment at rows y and y+1
function carveH(g, x1, x2, y) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        if (inBounds(g, x, y)) g[y][x] = 0;
        if (inBounds(g, x, y + 1)) g[y + 1][x] = 0;
    }
}

// 2-wide vertical segment at cols x and x+1
function carveV(g, y1, y2, x) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        if (inBounds(g, x, y)) g[y][x] = 0;
        if (inBounds(g, x + 1, y)) g[y][x + 1] = 0;
    }
}

// 2-wide diagonal corridor — 2×2 brush stepping toward (x2,y2)
function carveDiag(g, x1, y1, x2, y2) {
    let x = x1, y = y1;
    while (true) {
        if (inBounds(g, x, y)) g[y][x] = 0;
        if (inBounds(g, x + 1, y)) g[y][x + 1] = 0;
        if (inBounds(g, x, y + 1)) g[y + 1][x] = 0;
        if (inBounds(g, x + 1, y + 1)) g[y + 1][x + 1] = 0;
        if (x === x2 && y === y2) break;
        if (x !== x2) x += x < x2 ? 1 : -1;
        if (y !== y2) y += y < y2 ? 1 : -1;
    }
}

// ── BSP ──────────────────────────────────────────────────────────────────────

const MIN_LEAF = 10;

// Recursively split region.  Fills rooms[] and pairs[].
// Returns array of room IDs belonging to this subtree.
function bsp(region, depth, rooms, pairs) {
    const { x, y, w, h } = region;

    if (depth === 0 || (w < MIN_LEAF && h < MIN_LEAF)) {
        const pad = Math.max(1, Math.min(2, Math.floor(Math.min(w, h) / 5)));
        const rw = Math.max(4, w - pad * 2);
        const rh = Math.max(4, h - pad * 2);
        const rx = x + pad + (w - pad * 2 - rw > 0 ? rng(0, w - pad * 2 - rw) : 0);
        const ry = y + pad + (h - pad * 2 - rh > 0 ? rng(0, h - pad * 2 - rh) : 0);
        const id = rooms.length;
        rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + rw / 2, cy: ry + rh / 2 });
        return [id];
    }

    const splitH = h > w * 1.25 ? true
        : w > h * 1.25 ? false
            : Math.random() < 0.5;

    let leftIds, rightIds;
    if (splitH) {
        const splitY = y + Math.floor(h * (0.35 + Math.random() * 0.3));
        const hA = splitY - y, hB = h - hA;
        if (hA < MIN_LEAF / 2 || hB < MIN_LEAF / 2) return bsp(region, 0, rooms, pairs);
        leftIds = bsp({ x, y, w, h: hA }, depth - 1, rooms, pairs);
        rightIds = bsp({ x, y: splitY, w, h: hB }, depth - 1, rooms, pairs);
    } else {
        const splitX = x + Math.floor(w * (0.35 + Math.random() * 0.3));
        const wA = splitX - x, wB = w - wA;
        if (wA < MIN_LEAF / 2 || wB < MIN_LEAF / 2) return bsp(region, 0, rooms, pairs);
        leftIds = bsp({ x, y, w: wA, h }, depth - 1, rooms, pairs);
        rightIds = bsp({ x: splitX, y, w: wB, h }, depth - 1, rooms, pairs);
    }

    const a = leftIds[Math.floor(Math.random() * leftIds.length)];
    const b = rightIds[Math.floor(Math.random() * rightIds.length)];
    pairs.push([a, b]);
    return [...leftIds, ...rightIds];
}

// ── Room detail ───────────────────────────────────────────────────────────────

// 3-wide horizontal corridor
function carveH3(g, x1, x2, y) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        for (let dy = -1; dy <= 1; dy++)
            if (inBounds(g, x, y + dy)) g[y + dy][x] = 0;
    }
}

// 3-wide vertical corridor
function carveV3(g, y1, y2, x) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        for (let dx = -1; dx <= 1; dx++)
            if (inBounds(g, x + dx, y)) g[y][x + dx] = 0;
    }
}

// Carve room as a varied shape: rectangle with corner cuts, alcoves, plus/cross extensions.
function carveIrregularRoom(g, room) {
    const { x, y, w, h } = room;
    const shape = Math.random();

    if (shape < 0.15 && w >= 10 && h >= 10) {
        // Cross/plus shape: narrow rectangle + arms extending out on each side
        const armW = Math.max(2, Math.floor(w * 0.35));
        const armH = Math.max(2, Math.floor(h * 0.35));
        const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
        carveRect(g, x, cy - armH, w, armH * 2);
        carveRect(g, cx - armW, y, armW * 2, h);
    } else if (shape < 0.30 && w >= 9 && h >= 9) {
        // L-shape: two rectangles sharing a corner
        const splitX = x + Math.floor(w * (0.4 + Math.random() * 0.2));
        const splitY = y + Math.floor(h * (0.4 + Math.random() * 0.2));
        const corner = rng(0, 3);
        if (corner === 0) { carveRect(g, x, y, w, splitY - y); carveRect(g, x, y, splitX - x, h); }
        else if (corner === 1) { carveRect(g, x, y, w, splitY - y); carveRect(g, splitX, y, x + w - splitX, h); }
        else if (corner === 2) { carveRect(g, x, splitY, w, y + h - splitY); carveRect(g, x, y, splitX - x, h); }
        else { carveRect(g, x, splitY, w, y + h - splitY); carveRect(g, splitX, y, x + w - splitX, h); }
    } else if (shape < 0.44 && w >= 10 && h >= 7) {
        // U-shape / notch: rectangle with a wall block carved back in from one side
        carveRect(g, x, y, w, h);
        const side = rng(0, 3);
        const nw = rng(Math.floor(w * 0.25), Math.floor(w * 0.5));
        const nh = rng(Math.floor(h * 0.25), Math.floor(h * 0.5));
        const nx = x + rng(1, Math.max(1, w - nw - 1));
        const ny = y + rng(1, Math.max(1, h - nh - 1));
        if (side === 0) { for (let r = y; r < y + nh; r++) for (let c = nx; c < nx + nw; c++) if (inBounds(g, c, r)) g[r][c] = 1; }
        else if (side === 1) { for (let r = ny; r < ny + nh; r++) for (let c = x + w - nw; c < x + w; c++) if (inBounds(g, c, r)) g[r][c] = 1; }
        else if (side === 2) { for (let r = y + h - nh; r < y + h; r++) for (let c = nx; c < nx + nw; c++) if (inBounds(g, c, r)) g[r][c] = 1; }
        else { for (let r = ny; r < ny + nh; r++) for (let c = x; c < x + nw; c++) if (inBounds(g, c, r)) g[r][c] = 1; }
    } else if (shape < 0.58 && w >= 8 && h >= 8) {
        // Octagonal: rectangle with all 4 corners cut
        carveRect(g, x, y, w, h);
        const cw = rng(2, Math.floor(w / 4));
        const ch = rng(2, Math.floor(h / 4));
        for (let r = y; r < y + ch; r++) for (let c = x; c < x + cw; c++) if (inBounds(g, c, r)) g[r][c] = 1;
        for (let r = y; r < y + ch; r++) for (let c = x + w - cw; c < x + w; c++) if (inBounds(g, c, r)) g[r][c] = 1;
        for (let r = y + h - ch; r < y + h; r++) for (let c = x; c < x + cw; c++) if (inBounds(g, c, r)) g[r][c] = 1;
        for (let r = y + h - ch; r < y + h; r++) for (let c = x + w - cw; c < x + w; c++) if (inBounds(g, c, r)) g[r][c] = 1;
    } else {
        // Base rectangle with 1-2 corner cuts (original feel, majority of rooms)
        carveRect(g, x, y, w, h);
        if (w < 7 || h < 7) return;
        const numCuts = rng(1, 2);
        const corners = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, numCuts);
        for (const corner of corners) {
            const cw = rng(2, Math.floor(w / 3));
            const ch = rng(2, Math.floor(h / 3));
            switch (corner) {
                case 0: for (let r = y; r < y + ch; r++) for (let c = x; c < x + cw; c++) if (inBounds(g, c, r)) g[r][c] = 1; break;
                case 1: for (let r = y; r < y + ch; r++) for (let c = x + w - cw; c < x + w; c++) if (inBounds(g, c, r)) g[r][c] = 1; break;
                case 2: for (let r = y + h - ch; r < y + h; r++) for (let c = x; c < x + cw; c++) if (inBounds(g, c, r)) g[r][c] = 1; break;
                case 3: for (let r = y + h - ch; r < y + h; r++) for (let c = x + w - cw; c < x + w; c++) if (inBounds(g, c, r)) g[r][c] = 1; break;
            }
        }
        // Occasionally add a small alcove (protrusion from one edge)
        if (Math.random() < 0.35 && w >= 9 && h >= 9) {
            const edge = rng(0, 3);
            const aw = rng(2, 4), ah = rng(2, 4);
            switch (edge) {
                case 0: carveRect(g, x + rng(1, w - aw - 1), y - ah + 1, aw, ah); break; // top
                case 1: carveRect(g, x + w - 1, y + rng(1, h - ah - 1), aw, ah); break;  // right
                case 2: carveRect(g, x + rng(1, w - aw - 1), y + h - 1, aw, ah); break;  // bottom
                case 3: carveRect(g, x - aw + 1, y + rng(1, h - ah - 1), aw, ah); break; // left
            }
        }
    }
}

// Add interior detail: pillars, wall segments, and 2×2 central columns for large rooms.
function addRoomDetail(g, room) {
    if (room.w < 5 || room.h < 5) return;

    // 2×2 central column for large rooms — creates interesting sight-line splitting
    if (room.w >= 10 && room.h >= 10 && Math.random() < 0.45) {
        const px = room.x + Math.floor(room.w / 2) - 1;
        const py = room.y + Math.floor(room.h / 2) - 1;
        for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++)
                if (inBounds(g, px + dx, py + dy) && g[py + dy][px + dx] === 0)
                    g[py + dy][px + dx] = 1;
    }

    // Pillars (2×1 or 1×2 wall blocks)
    const pillarCount = Math.floor((room.w * room.h) / 28);
    for (let i = 0; i < pillarCount; i++) {
        const px = room.x + 2 + rng(0, Math.max(0, room.w - 5));
        const py = room.y + 2 + rng(0, Math.max(0, room.h - 5));
        if (Math.random() < 0.5) {
            if (inBounds(g, px + 1, py) && g[py][px] === 0 && g[py][px + 1] === 0) { g[py][px] = 1; g[py][px + 1] = 1; }
        } else {
            if (inBounds(g, px, py + 1) && g[py][px] === 0 && g[py + 1][px] === 0) { g[py][px] = 1; g[py + 1][px] = 1; }
        }
    }

    // Short wall segments (dividers) for larger rooms
    if (room.w >= 8 && room.h >= 8) {
        const segCount = rng(0, 2);
        for (let i = 0; i < segCount; i++) {
            const len = rng(3, Math.min(6, Math.floor(Math.min(room.w, room.h) * 0.45)));
            if (Math.random() < 0.5) {
                const wy = room.y + rng(2, room.h - 3);
                const wx = room.x + rng(1, Math.max(1, room.w - len - 1));
                for (let j = 0; j < len; j++)
                    if (inBounds(g, wx + j, wy) && g[wy][wx + j] === 0) g[wy][wx + j] = 1;
            } else {
                const wx = room.x + rng(2, room.w - 3);
                const wy = room.y + rng(1, Math.max(1, room.h - len - 1));
                for (let j = 0; j < len; j++)
                    if (inBounds(g, wx, wy + j) && g[wy + j][wx] === 0) g[wy + j][wx] = 1;
            }
        }
    }
}

function connectRooms(g, a, b) {
    // Use random points within each room (not always centers) to break symmetric H patterns
    const ax = a.x + 1 + rng(0, Math.max(0, a.w - 3));
    const ay = a.y + 1 + rng(0, Math.max(0, a.h - 3));
    const bx = b.x + 1 + rng(0, Math.max(0, b.w - 3));
    const by = b.y + 1 + rng(0, Math.max(0, b.h - 3));
    const r = Math.random();
    const wide = Math.random() < 0.25; // 25% chance of a 3-wide corridor
    const H = wide ? carveH3 : carveH;
    const V = wide ? carveV3 : carveV;

    if (r < 0.18) {
        // Diagonal
        carveDiag(g, ax, ay, bx, by);
    } else if (r < 0.38) {
        // L-bend: H then V
        H(g, ax, bx, ay); V(g, ay, by, bx);
    } else if (r < 0.58) {
        // L-bend: V then H
        V(g, ay, by, ax); H(g, ax, bx, by);
    } else if (r < 0.75) {
        // S-bend through midpoint — creates interesting zigzag corridors
        const mx = Math.floor((ax + bx) / 2);
        const my = Math.floor((ay + by) / 2);
        H(g, ax, mx, ay); V(g, ay, my, mx); H(g, mx, bx, my); V(g, my, by, bx);
    } else if (r < 0.88) {
        // T-route: go partway H, then branch V to target, then finish H
        const mx = ax + Math.floor((bx - ax) * (0.3 + Math.random() * 0.4));
        H(g, ax, mx, ay); V(g, ay, by, mx); H(g, mx, bx, by);
    } else {
        // Two parallel segments with a short cross — creates a loop pocket
        const oy = rng(-2, 2);
        H(g, ax, bx, ay); H(g, ax, bx, ay + oy); V(g, ay, ay + oy, Math.floor((ax + bx) / 2));
    }

    // Occasionally carve a small junction room at corridor midpoint
    if (Math.random() < 0.22) {
        const jx = Math.floor((ax + bx) / 2) - 1;
        const jy = Math.floor((ay + by) / 2) - 1;
        carveRect(g, jx, jy, rng(3, 5), rng(3, 5));
    }
}

// ── Entities ──────────────────────────────────────────────────────────────────

// Entity char → numeric value (levels.js format)
const SPAWN_VAL = -100; // matches SPAWN_CELL in levels.js ('s' in level text files)

function enemyVal(tier) {
    return -(Math.min(18, Math.max(0, tier)) + 1); // -1 for tier 0, -19 for tier 18
}

// Grid LOS check with 2× tile-step sampling — correctly blocks diagonal sight lines.
function hasLOS(g, x1, y1, x2, y2) {
    const steps = Math.max(1, Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))) * 2;
    for (let i = 1; i < steps; i++) {
        const tx = Math.round(x1 + (x2 - x1) * i / steps);
        const ty = Math.round(y1 + (y2 - y1) * i / steps);
        if (inBounds(g, tx, ty) && g[ty][tx] > 0) return false;
    }
    return true;
}

// Returns true if the enemy at (ex,ey) or any open neighbour tile can see (cx,cy).
// The neighbour check simulates enemy movement so spawn cells near thin corridors are unsafe.
function enemyCanSee(g, cx, cy, ex, ey) {
    for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
            const nx = ex + dx, ny = ey + dy;
            if (inBounds(g, nx, ny) && g[ny][nx] !== 1 && hasLOS(g, cx, cy, nx, ny))
                return true;
        }
    return false;
}

// Scan every open cell in room; score = −(enemies that can see it) * 1000 + min enemy dist.
// Returns {x, y} of safest cell, or {x:-1, y:-1} if room is empty.
function findSafeSpawn(g, room, enemies) {
    let bestX = -1, bestY = -1, bestScore = -Infinity;
    for (let cy = room.y; cy < room.y + room.h; cy++) {
        for (let cx = room.x; cx < room.x + room.w; cx++) {
            if (!inBounds(g, cx, cy) || g[cy][cx] !== 0) continue;
            let losCount = 0;
            let minDist = Infinity;
            for (const { ex, ey } of enemies) {
                const d = Math.hypot(cx - ex, cy - ey);
                if (d < minDist) minDist = d;
                if (enemyCanSee(g, cx, cy, ex, ey)) losCount++;
            }
            const score = -losCount * 1000 + (enemies.length ? minDist : 0);
            if (score > bestScore) { bestScore = score; bestX = cx; bestY = cy; }
        }
    }
    return { x: bestX, y: bestY };
}

// Returns array of placed enemy grid positions [{ex, ey}].
// Minimum difficulty required for each boss-tier enemy to appear in the pool.
// Staggered so each boss is introduced 2-3 levels after the previous one:
// L10: Harbinger, L13: Sovereign, L16: Wraith, L18: Phantom Sniper, L20: Commander
const BOSS_MIN_DIFF = { 11: 0.50, 15: 0.65, 16: 0.90, 17: 0.80, 18: 0.98 };

function placeEnemies(g, rooms, diff) {
    const totalCount = Math.min(31, Math.floor(5 + diff * 13));
    const maxTier = Math.min(18, Math.floor(diff * 19 + 0.5));

    const poolMin = Math.max(0, maxTier - 7);
    const pool = [];
    for (let t = poolMin; t <= maxTier; t++) {
        // Boss tiers only enter the pool once their minimum difficulty is reached
        if (BOSS_MIN_DIFF[t] !== undefined && diff < BOSS_MIN_DIFF[t]) continue;
        const w = t === 11 || t === 15 || t === 16 || t === 17 || t === 18 ? 1  // Harbinger/Sovereign/Phantom/Wraith/Commander: rare
            : t === 13 && diff > 0.75 ? 1                      // Laser Pulse: falls off in late game
            : t >= maxTier - 1 ? 3                             // Top-tier: frequent
                : 2;                                               // Mid-tier: normal
        for (let i = 0; i < w; i++) pool.push(t);
    }
    if (!pool.length) pool.push(0);

    // Cannoneer (tier 14): introduce as rare mid-game encounter before they dominate the pool
    if (diff >= 0.35 && !pool.includes(14)) {
        pool.push(14);                          // 1 entry = rare at diff 0.35–0.5
        if (diff >= 0.55) pool.push(14);        // 2 entries = occasional at diff 0.55–0.74
    }

    // At mid-to-high difficulty guarantee one elite enemy type per level
    // Elites: Titan(10), Cloak(8), Guardian(9), Intelligence(12), Laser-Pulse(13), Cannoneer(14), + bosses
    let guaranteedTier = -1;
    if (diff >= 0.45 && maxTier >= 8) {
        const elites = [10, 8, 9, 12, 13, 14, 15, 16, 17, 18].filter(t =>
            t <= maxTier
            && (BOSS_MIN_DIFF[t] === undefined || diff >= BOSS_MIN_DIFF[t])
            && !(t === 13 && diff > 0.80) // Laser Pulse: no longer a guaranteed spawn in late game
        );
        if (elites.length) guaranteedTier = elites[rng(0, elites.length - 1)];
    }

    const positions = [];
    let placed = 0;

    // Sort non-spawn rooms by distance from spawn room (farthest first).
    // Boss tiers will be placed in the farthest rooms.
    const spawnCx = rooms[0].cx, spawnCy = rooms[0].cy;
    const enemyRooms = rooms.slice(1).sort((a, b) => {
        const da = Math.hypot(a.cx - spawnCx, a.cy - spawnCy);
        const db = Math.hypot(b.cx - spawnCx, b.cy - spawnCy);
        return db - da; // farthest first
    });
    if (!enemyRooms.length) enemyRooms.push(rooms[0]);

    const BOSS_TIERS = new Set([11, 15, 16, 17, 18]);

    // Place the guaranteed elite first, in the farthest room
    if (guaranteedTier >= 0 && enemyRooms.length) {
        const room = enemyRooms[0]; // index 0 = farthest room
        for (let tries = 0; tries < 30; tries++) {
            const ex = room.x + 1 + rng(0, Math.max(0, room.w - 3));
            const ey = room.y + 1 + rng(0, Math.max(0, room.h - 3));
            if (inBounds(g, ex, ey) && g[ey][ex] === 0) {
                g[ey][ex] = enemyVal(guaranteedTier);
                positions.push({ ex, ey });
                placed++;
                break;
            }
        }
    }

    // Fill remaining slots room by room.
    // Rooms are ordered farthest-first so bosses drawn from pool land in far rooms.
    for (let ri = 0; ri < enemyRooms.length && placed < totalCount; ri++) {
        const room = enemyRooms[ri];
        const roomCapacity = rng(1, 2);
        let roomPlaced = 0;
        for (let tries = 0; tries < 30 && roomPlaced < roomCapacity && placed < totalCount; tries++) {
            const ex = room.x + 1 + rng(0, Math.max(0, room.w - 3));
            const ey = room.y + 1 + rng(0, Math.max(0, room.h - 3));
            if (!inBounds(g, ex, ey) || g[ey][ex] !== 0) continue;
            let tier = pool[rng(0, pool.length - 1)];
            // If a boss tier is drawn while we're still in the nearer half of rooms, reroll once
            if (BOSS_TIERS.has(tier) && ri > enemyRooms.length / 2) {
                const nonBoss = pool.filter(t => !BOSS_TIERS.has(t));
                if (nonBoss.length) tier = nonBoss[rng(0, nonBoss.length - 1)];
            }
            g[ey][ex] = enemyVal(tier);
            positions.push({ ex, ey });
            placed++;
            roomPlaced++;
        }
    }

    // Top up if rooms ran out before hitting totalCount
    for (let tries = 0; tries < totalCount * 10 && placed < totalCount; tries++) {
        const room = enemyRooms[rng(0, enemyRooms.length - 1)];
        const ex = room.x + 1 + rng(0, Math.max(0, room.w - 3));
        const ey = room.y + 1 + rng(0, Math.max(0, room.h - 3));
        if (!inBounds(g, ex, ey) || g[ey][ex] !== 0) continue;
        const tier = pool[rng(0, pool.length - 1)];
        g[ey][ex] = enemyVal(tier);
        positions.push({ ex, ey });
        placed++;
    }

    return positions;
}

// Place chests in non-spawn rooms. chest tile value = -25 (matches 'Y' in readLevels).
const CHEST_TILE = -25;
function placeChests(g, rooms, count) {
    // Prefer non-spawn rooms; fall back to all rooms to guarantee placement
    const preferred = rooms.slice(1).sort(() => Math.random() - 0.5);
    const fallback  = [rooms[0]];
    let placed = 0;
    for (const roomList of [preferred, fallback]) {
        for (let ri = 0; ri < roomList.length && placed < count; ri++) {
            const room = roomList[ri];
            for (let tries = 0; tries < 40; tries++) {
                const cx = room.x + 1 + rng(0, Math.max(0, room.w - 3));
                const cy = room.y + 1 + rng(0, Math.max(0, room.h - 3));
                if (inBounds(g, cx, cy) && g[cy][cx] === 0) {
                    g[cy][cx] = CHEST_TILE;
                    placed++;
                    break;
                }
            }
        }
        if (placed >= count) break;
    }
}

// ── Connectivity ──────────────────────────────────────────────────────────────

// BFS from (startX, startY) through non-wall tiles. Returns a Set of reachable
// tile keys (y * 65536 + x).  Treats negative values (entities) as passable.
function floodFillReachable(g, startX, startY) {
    const reachable = new Set();
    if (!inBounds(g, startX, startY) || g[startY][startX] >= 1) return reachable;
    const key = (x, y) => y * 65536 + x;
    const queue = [[startX, startY]];
    reachable.add(key(startX, startY));
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    while (queue.length) {
        const [x, y] = queue.shift();
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (!inBounds(g, nx, ny) || g[ny][nx] >= 1) continue;
            const k = key(nx, ny);
            if (reachable.has(k)) continue;
            reachable.add(k);
            queue.push([nx, ny]);
        }
    }
    return reachable;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a random level.
 * @param {number} levelIndex   0-based index (drives difficulty).
 * @param {number} totalLevels  Total levels in the run; pass Infinity for endless.
 * @param {boolean} [endless]   If true, place map chests instead of relying on kill-drops.
 * @returns {number[][]}  2D number grid (1=wall, 0=open, negative=entity).
 */
function generateLevel(levelIndex, totalLevels, endless) {
    // Endless: ramp difficulty continuously — no cap.
    const diff = !isFinite(totalLevels)
        ? levelIndex / 20
        : totalLevels <= 1 ? 0.5 : levelIndex / (totalLevels - 1);

    const w = Math.max(20, Math.min(38, Math.floor(18 + diff * 20) + rng(-2, 2)));
    const h = Math.max(16, Math.min(30, Math.floor(15 + diff * 15) + rng(-2, 2)));

    const g = makeGrid(w, h);
    const rooms = [], pairs = [];

    const depth = w < 24 ? 3 : w < 30 ? 4 : 5; // bumped up to guarantee more rooms
    bsp({ x: 1, y: 1, w: w - 2, h: h - 2 }, depth, rooms, pairs);

    if (!rooms.length) {
        carveRect(g, 2, 2, w - 4, h - 4);
        g[3][3] = SPAWN_VAL;
        return g;
    }

    rooms.forEach(r => carveIrregularRoom(g, r));
    pairs.forEach(([a, b]) => connectRooms(g, rooms[a], rooms[b]));

    // Extra loop corridors for shortcuts and variety (more on larger maps)
    const extraCorridors = rooms.length >= 6 ? rng(2, 3) : rooms.length >= 3 ? rng(1, 2) : 1;
    for (let e = 0; e < extraCorridors; e++) {
        const ai = rng(0, rooms.length - 1);
        const bi = (ai + 1 + rng(1, Math.max(1, rooms.length - 1))) % rooms.length;
        connectRooms(g, rooms[ai], rooms[bi]);
    }

    // Add interior detail after corridors so wall segments get natural gaps where corridors pass
    rooms.forEach(r => addRoomDetail(g, r));

    // Seal unreachable open tiles before enemy placement.
    // addRoomDetail can re-wall tiles that corridors carved, disconnecting sections.
    // Flood-fill from room 0's center; any open tile not reached becomes a wall.
    {
        let sx = Math.floor(rooms[0].cx), sy = Math.floor(rooms[0].cy);
        // Ensure start tile is actually open; search widening rings then full grid as fallback
        if (g[sy][sx] !== 0) {
            let found = false;
            outer: for (let dy = -3; dy <= 3; dy++)
                for (let dx = -3; dx <= 3; dx++)
                    if (inBounds(g, sx + dx, sy + dy) && g[sy + dy][sx + dx] === 0) {
                        sx += dx; sy += dy; found = true; break outer;
                    }
            // Full-grid fallback — prevents catastrophic all-tile-sealed case
            if (!found) {
                outer2: for (let ry = 1; ry < g.length - 1; ry++)
                    for (let rx = 1; rx < g[ry].length - 1; rx++)
                        if (g[ry][rx] === 0) { sx = rx; sy = ry; break outer2; }
            }
        }
        const reachable = floodFillReachable(g, sx, sy);
        for (let ry = 0; ry < g.length; ry++)
            for (let rx = 0; rx < g[ry].length; rx++)
                if (g[ry][rx] === 0 && !reachable.has(ry * 65536 + rx))
                    g[ry][rx] = 1;
    }

    // Seal border — alcove/corridor carving can accidentally open edge tiles
    for (let c = 0; c < w; c++) { g[0][c] = 1; g[h - 1][c] = 1; }
    for (let r = 0; r < h; r++) { g[r][0] = 1; g[r][w - 1] = 1; }

    // Place map chests for endless mode — none until level 4, slow ramp through level 10.
    // Ramp dials back in L14-22 (boss introduction zone) to slow loot pace during the danger window.
    if (endless && levelIndex >= 3) {
        const chestBase = Math.floor((levelIndex - 2) / 5); // 0 until L5, 1 at L7, 2 at L12...
        if (chestBase > 0) {
            const lootBrake = (levelIndex >= 13 && levelIndex <= 21) ? 1 : 0;
            const chestCount = Math.max(1, chestBase - lootBrake + rng(0, Math.max(0, Math.floor(chestBase * 0.5) - lootBrake)));
            placeChests(g, rooms, chestCount);
        }
    }

    // Place enemies first so we can find a spawn with no line-of-sight to them
    const enemies = placeEnemies(g, rooms, diff);

    // Find the safest open cell in room 0 (fewest enemies with direct LOS)
    const spawn = rooms[0];
    const { x: spawnX, y: spawnY } = findSafeSpawn(g, spawn, enemies);
    if (spawnX >= 0) {
        g[spawnY][spawnX] = SPAWN_VAL;
    } else {
        // Fallback: search outward from room center in case LOS scan found nothing
        let sx = Math.floor(spawn.cx), sy = Math.floor(spawn.cy);
        let placed = false;
        outer:
        for (let dy = 0; dy < 4; dy++)
            for (let dx = 0; dx < 4; dx++)
                if (inBounds(g, sx + dx, sy + dy) && g[sy + dy][sx + dx] === 0) {
                    g[sy + dy][sx + dx] = SPAWN_VAL;
                    placed = true;
                    break outer;
                }
        if (!placed) g[Math.max(0, spawn.y)][Math.max(0, spawn.x)] = SPAWN_VAL;
    }

    return g;
}

function generateLootLevel(numPlayers, levelNumber = 1) {
    const W = 18, H = 12;

    // Border walls, open interior
    const g = Array.from({ length: H }, (_, r) =>
        Array.from({ length: W }, (_, c) =>
            (r === 0 || r === H - 1 || c === 0 || c === W - 1) ? 1 : 0
        )
    );

    // 2×2 pillars — fully symmetric: 2 rows from top/bottom interior, 3 cols from side walls.
    // Top centers at row 2.5, bottom centers at row 8.5 → both 3.5 from map center row 5.5.
    [[2, 3], [2, W - 5], [H - 4, 3], [H - 4, W - 5]].forEach(([pr, pc]) => {
        g[pr][pc] = g[pr][pc + 1] = g[pr + 1][pc] = g[pr + 1][pc + 1] = 1;
    });

    // Hollow 3×3 altar dead-center
    const ar = Math.floor(H / 2) - 1, ac = Math.floor(W / 2) - 1;
    for (let dr = 0; dr <= 2; dr++) {
        for (let dc = 0; dc <= 2; dc++) {
            if (dr === 0 || dr === 2 || dc === 0 || dc === 2) g[ar + dr][ac + dc] = 1;
        }
    }

    // Spawn top-left
    g[1][1] = SPAWN_VAL;

    // Continue zone: centered directly below the altar — symmetric left-right,
    // clear of all pillars (nearest pillar edge is 3+ tiles away), 1.5 tiles from bottom border.
    const continueCol = Math.floor(W / 2);  // col 9 = altar center column
    const continueRow = H - 3;              // row 9

    // Chest positions — altar flanks, pillar inner faces, perimeter alcoves
    const chestSlots = [
        [ar + 1, ac - 2], [ar + 1, ac + 4],   // altar left/right flanks
        [ar - 1, ac + 1], [ar + 3, ac + 1],   // altar top/bottom flanks
        [2,      6],      [2,      W - 7],     // inner face of top pillars
        [H - 4,  6],      [H - 4,  W - 7],    // inner face of bottom pillars
        [1,      Math.floor(W / 2)],           // top-center
        [Math.floor(H / 2), 1],                // left-center
        [H - 2,  3],      [H - 2,  W - 4],    // bottom corners (clear of zone)
    ];

    const targetChests = 4 + Math.min(numPlayers, 4) + Math.floor(Math.min(levelNumber / 5, 4));
    let placed = 0;
    for (const [cr, cc] of chestSlots) {
        if (placed >= targetChests) break;
        if (cr > 0 && cr < H - 1 && cc > 0 && cc < W - 1 && g[cr][cc] === 0) {
            g[cr][cc] = CHEST_TILE;
            placed++;
        }
    }

    return { grid: g, continueCol, continueRow };
}

module.exports = { generateLevel, generateLootLevel };
