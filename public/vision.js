let isFogOfWar = true;

function castRay(playerX, playerY, angle, maxDistance, level) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let mapCol = Math.floor(playerX / TILE_SIZE);
    let mapRow = Math.floor(playerY / TILE_SIZE);

    const stepCol = dx >= 0 ? 1 : -1;
    const stepRow = dy >= 0 ? 1 : -1;

    const deltaDistX = dx === 0 ? Infinity : Math.abs(TILE_SIZE / dx);
    const deltaDistY = dy === 0 ? Infinity : Math.abs(TILE_SIZE / dy);

    let sideDistX = dx >= 0
        ? ((mapCol + 1) * TILE_SIZE - playerX) / Math.abs(dx)
        : (playerX - mapCol * TILE_SIZE) / Math.abs(dx);
    let sideDistY = dy >= 0
        ? ((mapRow + 1) * TILE_SIZE - playerY) / Math.abs(dy)
        : (playerY - mapRow * TILE_SIZE) / Math.abs(dy);

    while (true) {
        let dist, hitX, hitY;

        // Corner crossing: both sides hit at ~same distance — check both neighbour tiles
        if (Math.abs(sideDistX - sideDistY) < 0.001) {
            dist = sideDistX;
            if (dist >= maxDistance) break;
            hitX = playerX + dx * dist;
            hitY = playerY + dy * dist;
            const wallA = level[mapRow + stepRow] && level[mapRow + stepRow][mapCol] > 0;
            const wallB = level[mapRow] && level[mapRow][mapCol + stepCol] > 0;
            if (wallA || wallB) return { x: hitX, y: hitY, hitWall: true };
            mapCol += stepCol;
            mapRow += stepRow;
            sideDistX += deltaDistX;
            sideDistY += deltaDistY;
        } else if (sideDistX < sideDistY) {
            dist = sideDistX;
            if (dist >= maxDistance) break;
            hitX = playerX + dx * dist;
            hitY = playerY + dy * dist;
            mapCol += stepCol;
            sideDistX += deltaDistX;
        } else {
            dist = sideDistY;
            if (dist >= maxDistance) break;
            hitX = playerX + dx * dist;
            hitY = playerY + dy * dist;
            mapRow += stepRow;
            sideDistY += deltaDistY;
        }

        if (mapRow < 0 || mapCol < 0 || !level[mapRow]) break;
        if (level[mapRow][mapCol] > 0) return { x: hitX, y: hitY, hitWall: true };
    }

    return { x: playerX + dx * maxDistance, y: playerY + dy * maxDistance, hitWall: false };
}

function calculateVision(playerX, playerY, level, maxDistance, resolution) {
    // Regular angular sweep
    const angles = [];
    for (let angle = 0; angle < TWO_PI; angle += resolution) {
        angles.push(angle);
    }

    // Corner rays: cast rays aimed at each wall-tile corner within range.
    // This ensures polygon vertices land exactly on corners, eliminating spill and choppiness.
    const c0 = Math.floor((playerX - maxDistance) / TILE_SIZE);
    const c1 = Math.floor((playerX + maxDistance) / TILE_SIZE);
    const r0 = Math.floor((playerY - maxDistance) / TILE_SIZE);
    const r1 = Math.floor((playerY + maxDistance) / TILE_SIZE);
    const eps = 0.0001;

    for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
            if (!level[row] || level[row][col] <= 0) continue;
            // 4 corners of this wall tile
            for (let cr = row; cr <= row + 1; cr++) {
                for (let cc = col; cc <= col + 1; cc++) {
                    const wx = cc * TILE_SIZE;
                    const wy = cr * TILE_SIZE;
                    if (Math.hypot(wx - playerX, wy - playerY) > maxDistance) continue;
                    const a = Math.atan2(wy - playerY, wx - playerX);
                    const norm = ((a % TWO_PI) + TWO_PI) % TWO_PI;
                    if (norm - eps >= 0)      angles.push(norm - eps);
                    angles.push(norm);
                    if (norm + eps < TWO_PI)  angles.push(norm + eps);
                }
            }
        }
    }

    angles.sort((a, b) => a - b);

    const visiblePoints = [];
    let prev = -Infinity;
    for (const angle of angles) {
        if (angle - prev < 0.00005) continue; // skip near-duplicates
        visiblePoints.push(castRay(playerX, playerY, angle, maxDistance, level));
        prev = angle;
    }

    if (visiblePoints.length > 0) visiblePoints.push(visiblePoints[0]);
    return visiblePoints;
}

function floodFillVisionTiles(playerX, playerY, level, maxDistance) {
    const startCol = Math.floor(playerX / TILE_SIZE);
    const startRow = Math.floor(playerY / TILE_SIZE);
    const visited = new Set();
    const visible = new Set();
    const queue = [[startRow, startCol]];
    visited.add(startRow * 65536 + startCol);

    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

    while (queue.length > 0) {
        const [row, col] = queue.shift();

        const tileX = (col + 0.5) * TILE_SIZE;
        const tileY = (row + 0.5) * TILE_SIZE;
        if (Math.hypot(tileX - playerX, tileY - playerY) > maxDistance + TILE_SIZE) continue;

        if (level[row] && level[row][col] > 0) continue; // wall — don't propagate or mark
        visible.add(row * 65536 + col);

        for (const [dr, dc] of dirs) {
            const nr = row + dr;
            const nc = col + dc;
            const key = nr * 65536 + nc;
            if (visited.has(key)) continue;
            if (nr < 0 || nc < 0 || !level[nr]) continue;
            visited.add(key);

            // Prevent cutting diagonally through wall corners
            if (dr !== 0 && dc !== 0) {
                const blockedA = level[row + dr] && level[row + dr][col] > 0;
                const blockedB = level[row] && level[row][col + dc] > 0;
                if (blockedA && blockedB) continue;
            }

            queue.push([nr, nc]);
        }
    }
    return visible;
}

function calculateSharedVision(players, level, resolution) {
    const sharedVision = [];

    for (let id in players) {
        const tank = players[id];
        if (!tank.isDead && !tank.isAI) {
            const points = getCachedVision(id, tank.x, tank.y, tank.visionDistance, level, resolution);
            const entry = {
                x: tank.x,
                y: tank.y,
                visionDistance: tank.visionDistance,
                points,
            };
            // visionCornerBoost (blurred tile pass) disabled for performance
            sharedVision.push(entry);
        }
    }

    return sharedVision;
}

function calculateLimitedVision(playerX, playerY, startAngle, angleRange, level, maxDistance, resolution) {
    const visiblePoints = [];
    for (let angle = startAngle - angleRange / 2; angle < startAngle + angleRange / 2; angle += resolution) {
        visiblePoints.push(castRay(playerX, playerY, angle, maxDistance, level));
    }
    return visiblePoints;
}

// Vision cache: skip raycasting when the player/tank hasn't moved significantly.
// Keyed by player id; invalidated on level change or vision resolution toggle.
const _visionCache = {};
const VISION_CACHE_THRESHOLD = 1.5; // pixels — tiny enough to be invisible

function clearVisionCache() {
    for (const k in _visionCache) delete _visionCache[k];
}

function getCachedVision(id, x, y, visionDistance, level, resolution) {
    const c = _visionCache[id];
    if (c && Math.abs(c.x - x) <= VISION_CACHE_THRESHOLD
           && Math.abs(c.y - y) <= VISION_CACHE_THRESHOLD
           && c.visionDistance === visionDistance
           && c.resolution === resolution) {
        return c.points;
    }
    const points = calculateVision(x, y, level, visionDistance, resolution);
    _visionCache[id] = { x, y, visionDistance, resolution, points };
    return points;
}

let _tileMaskLayer = null;

function _drawVisionTiles(cx, cy, viewX, viewY, tiles) {
    if (!_tileMaskLayer || _tileMaskLayer.width !== fogLayer.width || _tileMaskLayer.height !== fogLayer.height) {
        if (_tileMaskLayer) _tileMaskLayer.remove();
        _tileMaskLayer = createGraphics(fogLayer.width, fogLayer.height);
        _tileMaskLayer.pixelDensity(1);
    }

    _tileMaskLayer.clear();
    _tileMaskLayer.noStroke();
    _tileMaskLayer.fill(255, 110);

    for (const key of tiles) {
        const row = Math.floor(key / 65536);
        const col = key % 65536;
        _tileMaskLayer.rect(
            cx + col * TILE_SIZE - viewX,
            cy + row * TILE_SIZE - viewY,
            TILE_SIZE, TILE_SIZE
        );
    }

    _tileMaskLayer.filter(BLUR, 10);
    fogLayer.image(_tileMaskLayer, 0, 0);
}

function _drawVisionPolygon(cx, cy, originX, originY, viewX, viewY, points, fs) {
    fogLayer.fill(255, 255, 255);
    fogLayer.beginShape();
    fogLayer.vertex(cx + (originX - viewX) * fs, cy + (originY - viewY) * fs);
    for (const point of points) {
        fogLayer.vertex(cx + (point.x - viewX) * fs, cy + (point.y - viewY) * fs);
    }
    fogLayer.endShape(CLOSE);
}

function drawFogOfWar(playerX, playerY, visiblePoints, originX, originY) {
    originX = originX !== undefined ? originX : playerX;
    originY = originY !== undefined ? originY : playerY;
    push();
    translate(playerX, playerY, WALL_HEIGHT - 25 + 1);

    fogLayer.blendMode(BLEND);
    fogLayer.clear();
    fogLayer.background(51);
    fogLayer.noStroke();
    fogLayer.blendMode(REMOVE);

    const cx = fogLayer.width / 2;
    const cy = fogLayer.height / 2;
    const fs = fogLayer.width / (width * 2);
    _drawVisionPolygon(cx, cy, originX, originY, playerX, playerY, visiblePoints, fs);

    // Flare vision: circle punch
    if (typeof flares !== 'undefined') {
        for (const f of flares) {
            fogLayer.fill(255);
            fogLayer.circle(cx + (f.x - playerX) * fs, cy + (f.y - playerY) * fs, f.visionRadius * 2 * fs);
        }
    }

    // Repaint smoke clouds — use full fog color so smoke is invisible outside vision
    // but restores opacity inside cleared (visible) areas, denying vision there.
    if (typeof smokeClouds !== 'undefined' && smokeClouds.length) {
        fogLayer.blendMode(BLEND);
        fogLayer.noStroke();
        for (const sc of smokeClouds) {
            const relX = cx + (sc.x - playerX) * fs;
            const relY = cy + (sc.y - playerY) * fs;
            const fade = Math.min(1, sc.framesLeft / 60);
            fogLayer.fill(51, 51, 51, Math.round(255 * fade));
            fogLayer.circle(relX, relY, sc.radius * 2 * fs);
        }
    }

    texture(fogLayer);
    noStroke();
    plane(fogLayer.width, fogLayer.height);
    pop();
}

function drawSharedFogOfWar(viewX, viewY, sharedVisiblePoints) {
    push();
    translate(viewX, viewY, WALL_HEIGHT - 25 + 1);

    fogLayer.blendMode(BLEND);
    fogLayer.clear();
    fogLayer.background(51);
    fogLayer.noStroke();
    fogLayer.blendMode(REMOVE);

    const cx = fogLayer.width / 2;
    const cy = fogLayer.height / 2;
    const fs = fogLayer.width / (width * 2);

    // Ray polygons at full alpha (direct line of sight fully clear)
    for (const { x: tankX, y: tankY, points } of sharedVisiblePoints) {
        _drawVisionPolygon(cx, cy, tankX, tankY, viewX, viewY, points, fs);
    }

    // Companion vision: simple circle punch — no raycasting needed
    if (typeof companions !== 'undefined') {
        for (const c of Object.values(companions)) {
            if (c.isDead) continue;
            fogLayer.fill(255);
            fogLayer.circle(cx + (c.x - viewX) * fs, cy + (c.y - viewY) * fs, TILE_SIZE * 3 * 2 * fs);
        }
    }

    // Flare vision: circle punch — no raycasting needed
    if (typeof flares !== 'undefined') {
        for (const f of flares) {
            fogLayer.fill(255);
            fogLayer.circle(cx + (f.x - viewX) * fs, cy + (f.y - viewY) * fs, f.visionRadius * 2 * fs);
        }
    }

    // Repaint smoke clouds — full fog color so smoke only denies vision, invisible outside it
    if (typeof smokeClouds !== 'undefined' && smokeClouds.length) {
        fogLayer.blendMode(BLEND);
        fogLayer.noStroke();
        for (const sc of smokeClouds) {
            const relX = cx + (sc.x - viewX) * fs;
            const relY = cy + (sc.y - viewY) * fs;
            const fade = Math.min(1, sc.framesLeft / 60);
            fogLayer.fill(51, 51, 51, Math.round(255 * fade));
            fogLayer.circle(relX, relY, sc.radius * 2 * fs);
        }
    }

    texture(fogLayer);
    noStroke();
    plane(fogLayer.width, fogLayer.height);
    pop();
}
