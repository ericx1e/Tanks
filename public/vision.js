let isFogOfWar = true;

function castRay(playerX, playerY, angle, maxDistance, level) {
    let x = playerX;
    let y = playerY;

    const stepSize = 0.5

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
                        return { x, y };
                    }
                }
            }
        }
    }

    // Ray reached max distance without hitting a wall
    return { x, y };
}

function calculateSharedVision(players, level, maxDistance, resolution) {
    const sharedVision = [];

    for (let id in players) {
        const tank = players[id];
        if (!tank.isDead && !tank.isAI) { // Only consider living allied tanks
            const tankVision = calculateVision(tank.x, tank.y, level, maxDistance, resolution);
            sharedVision.push(tankVision);
        }
    }

    return sharedVision; // Return a 2D array of visible points
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
    for (let angle = startAngle - angleRange / 2; angle < startAngle + angleRange; angle += resolution) {
        const rayEnd = castRay(playerX, playerY, angle, maxDistance, level);
        visiblePoints.push(rayEnd);
    }
    // for (let angle = 0; angle < TWO_PI; angle += resolution) {
    //     const rayEnd = castRay(playerX, playerY, angle, PLAYER_SIZE, level);
    //     visiblePoints.push(rayEnd);
    // }
    return visiblePoints;
}

function drawFogOfWar(playerX, playerY, visiblePoints) {
    push()
    // resetMatrix();
    translate(playerX, playerY, WALL_HEIGHT + 1)

    // Clear the fog layer
    // fogLayer = createGraphics(width, height);
    fogLayer.blendMode(BLEND)
    fogLayer.clear();

    // Draw fog over the entire map
    fogLayer.background(0)
    fogLayer.noStroke();
    fogLayer.blendMode(REMOVE);
    // fogLayer.fill(0); // Semi-transparent black
    // fogLayer.rect(0, 0, fogLayer.width, fogLayer.height);

    fogLayer.beginShape();
    fogLayer.fill(255, 255, 255)
    fogLayer.vertex(playerX - playerX + fogLayer.width / 2, playerY - playerY + fogLayer.height / 2); // Adjust for player's position
    visiblePoints.forEach(point => {
        const screenX = point.x - playerX + fogLayer.width / 2;
        const screenY = point.y - playerY + fogLayer.height / 2;
        fogLayer.vertex(screenX, screenY);
    });
    fogLayer.endShape(CLOSE);

    // Draw the fog layer over the 3D scene
    texture(fogLayer);
    // fill(0)
    noStroke();
    plane(width, height);
    pop()
}

function drawSharedFogOfWar(playerX, playerY, sharedVisiblePoints) {
    push();
    translate(playerX, playerY, WALL_HEIGHT + 1); // Position the fog above the ground

    // Clear the fog layer
    fogLayer.blendMode(BLEND);
    fogLayer.clear();

    // Draw fog over the entire map
    fogLayer.background(0);
    fogLayer.noStroke();
    fogLayer.blendMode(REMOVE);

    // Draw the visible areas for all points in the shared vision
    sharedVisiblePoints.forEach(visiblePoints => {
        fogLayer.beginShape();
        fogLayer.fill(255, 255, 255);

        visiblePoints.forEach(point => {
            const screenX = point.x - playerX + fogLayer.width / 2;
            const screenY = point.y - playerY + fogLayer.height / 2;
            fogLayer.vertex(screenX, screenY);
        });

        fogLayer.endShape(CLOSE);
    });

    // Draw the fog layer over the 3D scene
    texture(fogLayer);
    noStroke();
    plane(width, height);
    pop();
}
