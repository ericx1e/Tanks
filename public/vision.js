let isFogOfWar = true;

function castRay(playerX, playerY, angle, maxDistance, level) {
    let x = playerX;
    let y = playerY;

    const stepSize = 0.5;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    for (let i = 0; i < maxDistance / stepSize; i++) {
        const nextX = x + dx * stepSize;
        const nextY = y + dy * stepSize;

        const raySize = TILE_SIZE / 100;
        const colStart = Math.floor((nextX - raySize) / TILE_SIZE);
        const colEnd = Math.floor((nextX + raySize) / TILE_SIZE);
        const rowStart = Math.floor((nextY - raySize) / TILE_SIZE);
        const rowEnd = Math.floor((nextY + raySize) / TILE_SIZE);

        let hit = false;
        outer:
        for (let row = rowStart; row <= rowEnd; row++) {
            for (let col = colStart; col <= colEnd; col++) {
                if (level[row] && level[row][col] > 0) { hit = true; break outer; }
            }
        }

        if (hit) return { x, y, hitWall: true };
        x = nextX;
        y = nextY;
    }

    return { x, y, hitWall: false };
}

function calculateVision(playerX, playerY, level, maxDistance, resolution) {
    const visiblePoints = [];
    for (let angle = 0; angle < TWO_PI; angle += resolution) {
        visiblePoints.push(castRay(playerX, playerY, angle, maxDistance, level));
    }
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
            const points = calculateVision(tank.x, tank.y, level, tank.visionDistance, resolution);
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

// No-op stub — vision is not cached, but the key handler calls this
function clearVisionCache() { }

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

function _drawVisionPolygon(cx, cy, originX, originY, viewX, viewY, points) {
    fogLayer.fill(255, 255, 255);
    fogLayer.beginShape();
    fogLayer.vertex(cx + originX - viewX, cy + originY - viewY);
    for (const point of points) {
        fogLayer.vertex(cx + point.x - viewX, cy + point.y - viewY);
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
    _drawVisionPolygon(cx, cy, originX, originY, playerX, playerY, visiblePoints);

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

    // Ray polygons at full alpha (direct line of sight fully clear)
    for (const { x: tankX, y: tankY, points } of sharedVisiblePoints) {
        _drawVisionPolygon(cx, cy, tankX, tankY, viewX, viewY, points);
    }

    texture(fogLayer);
    noStroke();
    plane(fogLayer.width, fogLayer.height);
    pop();
}
