const { TILE_SIZE, PLAYER_SIZE, BULLET_SIZE } = require('./public/constants.js');

// Check if a position collides with a wall
function isCollidingWithWall(x, y, size, level) {
    const radius = size;

    // Offsets for each corner of the bounding box
    const offsets = [
        { dx: -radius, dy: -radius }, // Top-left
        { dx: -radius, dy: radius },  // Bottom-left
        { dx: radius, dy: radius },   // Bottom-right
        { dx: radius, dy: -radius },  // Top-right
    ];

    for (let offset of offsets) {
        const cornerX = x + offset.dx;
        const cornerY = y + offset.dy;

        // Calculate the grid position of the corner
        const col = Math.floor(cornerX / TILE_SIZE);
        const row = Math.floor(cornerY / TILE_SIZE);

        if (
            row < 0 || col < 0 ||
            row >= level.length || col >= level[0].length ||
            level[row][col] > 0
        ) {
            return true; // Collision detected
        }
    }

    return false; // No collisions
}

// Check if a bullet collides with a player's bounding box
function isCollidingWithPlayer(bulletX, bulletY, player, radius = BULLET_SIZE) {
    if (player.isDead) return;
    const halfSize = PLAYER_SIZE + radius;

    // Check if the bullet is within the player's bounding box
    return (
        bulletX > player.x - halfSize &&
        bulletX < player.x + halfSize &&
        bulletY > player.y - halfSize &&
        bulletY < player.y + halfSize
    );
}

// Check if a tile is a wall
function isWall(col, row, level) {
    if (row < 0 || col < 0 || row >= level.length || col >= level[0].length) {
        return false; // Out of bounds
    }
    return level[row][col] > 0; // Non-zero values indicate walls
}

// Smoothly interpolate an angle
function lerpAngle(current, target, t) {
    let diff = ((target - current + Math.PI) % (2 * Math.PI)) - Math.PI;

    if (diff < -Math.PI) {
        diff += 2 * Math.PI;
    }
    return current + diff * t;
}

function getRandomNonWallPosition(level) {
    const rows = level.length;
    const cols = level[0].length;

    while (true) {
        // Generate a random row and column
        const row = Math.floor(Math.random() * rows);
        const col = Math.floor(Math.random() * cols);

        // Check if the tile is a non-wall tile (value 0)
        if (level[row][col] === 0) {
            // Convert grid position to world coordinates
            const x = col * TILE_SIZE + TILE_SIZE / 2;
            const y = row * TILE_SIZE + TILE_SIZE / 2;
            return { x, y };
        }
    }
}

function getSpreadOutPosition(level, existingPlayers, minDistance) {
    let randomSpawn;
    let attempts = 0;
    const maxAttempts = 100;

    do {
        randomSpawn = getRandomNonWallPosition(level);
        const spawnX = randomSpawn.x;
        const spawnY = randomSpawn.y;

        // Check if this position is sufficiently far from all existing tanks
        const isFarEnough = Object.values(existingPlayers).every(player => {
            const dx = player.x - spawnX;
            const dy = player.y - spawnY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance >= minDistance;
        });

        if (isFarEnough) {
            return randomSpawn; // Valid spawn position found
        }

        attempts++;
    } while (attempts < maxAttempts);

    // If a valid position isn't found after maxAttempts, fallback
    console.warn("Couldn't find a spread-out spawn position. Using fallback.");
    return randomSpawn;
}


function generateOpenMaze(rows, cols, wallChance = 0.4, corridorWidth = 2, chestChance = 0.1) {
    const maze = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => Math.random() < wallChance ? 4 : 0)
    );

    // Ensure corridors are wider
    for (let i = 0; i < rows; i += corridorWidth) {
        for (let j = 0; j < cols; j += corridorWidth) {
            if (Math.random() > wallChance) {
                for (let di = 0; di < corridorWidth; di++) {
                    for (let dj = 0; dj < corridorWidth; dj++) {
                        const ni = i + di;
                        const nj = j + dj;
                        if (ni >= 0 && ni < rows && nj >= 0 && nj < cols) {
                            maze[ni][nj] = 0;
                        }
                    }
                }
            }
        }
    }

    // Surround the maze with walls
    for (let row = 0; row < rows; row++) {
        maze[row][0] = 4;
        maze[row][cols - 1] = 4;
    }
    for (let col = 0; col < cols; col++) {
        maze[0][col] = 4;
        maze[rows - 1][col] = 4;
    }

    // Add height variation for walls
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            if (maze[i][j] === 4) {
                maze[i][j] = 1; // Fixed wall height
            }
        }
    }

    // Find largest connected open area
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    let largestRegion = [];
    let largestSize = 0;

    function floodFill(x, y) {
        const queue = [{ x, y }];
        const region = [];
        visited[x][y] = true;
        let size = 0;

        while (queue.length > 0) {
            const { x: cx, y: cy } = queue.shift();
            region.push({ x: cx, y: cy });
            size++;

            const directions = [
                { dx: 1, dy: 0 },
                { dx: -1, dy: 0 },
                { dx: 0, dy: 1 },
                { dx: 0, dy: -1 },
            ];

            for (const { dx, dy } of directions) {
                const nx = cx + dx;
                const ny = cy + dy;

                if (
                    nx >= 0 &&
                    ny >= 0 &&
                    nx < rows &&
                    ny < cols &&
                    maze[nx][ny] === 0 &&
                    !visited[nx][ny]
                ) {
                    queue.push({ x: nx, y: ny });
                    visited[nx][ny] = true;
                }
            }
        }

        return { size, region };
    }

    // Find all regions and determine the largest
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            if (maze[i][j] === 0 && !visited[i][j]) {
                const { size, region } = floodFill(i, j);
                if (size > largestSize) {
                    largestSize = size;
                    largestRegion = region;
                }
            }
        }
    }

    // Convert small regions into walls
    const largestRegionSet = new Set(
        largestRegion.map(({ x, y }) => `${x},${y}`)
    );

    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const key = `${i},${j}`;
            if (maze[i][j] === 0 && !largestRegionSet.has(key)) {
                maze[i][j] = 1; // Convert disconnected areas to walls
            }
        }
    }

    // Spawn chests in the largest region
    for (const { x, y } of largestRegion) {
        if (Math.random() < chestChance) {
            maze[x][y] = -25; // Mark the position of the chest
        }
    }

    return maze;
}

module.exports = {
    isCollidingWithWall,
    isCollidingWithPlayer,
    isWall,
    lerpAngle,
    getRandomNonWallPosition,
    getSpreadOutPosition,
    generateOpenMaze,
};
