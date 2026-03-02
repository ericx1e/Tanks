let isFogOfWar = true;

function castRay(playerX, playerY, angle, maxDistance, level) {
    let x = playerX;
    let y = playerY;

    const stepSize = 0.5;

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    for (let i = 0; i < maxDistance / stepSize; i++) {
        x += dx * stepSize;
        y += dy * stepSize;

        const raySize = TILE_SIZE / 100;

        const colStart = Math.floor((x - raySize) / TILE_SIZE);
        const colEnd = Math.floor((x + raySize) / TILE_SIZE);
        const rowStart = Math.floor((y - raySize) / TILE_SIZE);
        const rowEnd = Math.floor((y + raySize) / TILE_SIZE);

        for (let row = rowStart; row <= rowEnd; row++) {
            for (let col = colStart; col <= colEnd; col++) {
                if (level[row] && level[row][col] > 0) {
                    return { x, y, hitWall: true };
                }
            }
        }
    }

    return { x, y, hitWall: false };
}

function calculateSharedVision(players, level, resolution) {
    const sharedVision = [];

    for (let id in players) {
        const tank = players[id];
        if (!tank.isDead && !tank.isAI) {
            sharedVision.push({
                x: tank.x,
                y: tank.y,
                visionDistance: tank.visionDistance,
                points: calculateVision(tank.x, tank.y, level, tank.visionDistance, resolution),
            });
        }
    }

    return sharedVision;
}

function calculateVision(playerX, playerY, level, maxDistance, resolution) {
    const visiblePoints = [];
    for (let angle = 0; angle < TWO_PI; angle += resolution) {
        const rayEnd = castRay(playerX, playerY, angle, maxDistance, level);
        visiblePoints.push(rayEnd);
    }
    return visiblePoints;
}

function calculateLimitedVision(playerX, playerY, startAngle, angleRange, level, maxDistance, resolution) {
    const visiblePoints = [];
    for (let angle = startAngle - angleRange / 2; angle < startAngle + angleRange / 2; angle += resolution) {
        const rayEnd = castRay(playerX, playerY, angle, maxDistance, level);
        visiblePoints.push(rayEnd);
    }
    return visiblePoints;
}

// No-op stub — vision is not cached, but the key handler calls this
function clearVisionCache() {}

// Shared helper: draws the visible fan polygon onto fogLayer (hard edge, no fade).
// originX/Y is the tank whose vision this is; viewX/Y is the camera-center tank.
// cx/cy is the center of fogLayer (fogLayer.width/2, fogLayer.height/2).
function _drawVisionPolygon(cx, cy, originX, originY, viewX, viewY, points) {
    // Main visible area — fully clears fog
    fogLayer.fill(255, 255, 255);
    fogLayer.beginShape();
    fogLayer.vertex(cx + originX - viewX, cy + originY - viewY);
    for (const point of points) {
        fogLayer.vertex(cx + point.x - viewX, cy + point.y - viewY);
    }
    fogLayer.endShape(CLOSE);

}

function drawFogOfWar(playerX, playerY, visiblePoints) {
    push();
    translate(playerX, playerY, WALL_HEIGHT - 25 + 1);

    fogLayer.blendMode(BLEND);
    fogLayer.clear();
    fogLayer.background(51);
    fogLayer.noStroke();
    fogLayer.blendMode(REMOVE);

    const cx = fogLayer.width / 2;
    const cy = fogLayer.height / 2;

    _drawVisionPolygon(cx, cy, playerX, playerY, playerX, playerY, visiblePoints);

    texture(fogLayer);
    noStroke();
    plane(width, height);
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

    for (const { x: tankX, y: tankY, points } of sharedVisiblePoints) {
        _drawVisionPolygon(cx, cy, tankX, tankY, viewX, viewY, points);
    }

    texture(fogLayer);
    noStroke();
    plane(width, height);
    pop();
}
