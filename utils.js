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
function isCollidingWithPlayer(bulletX, bulletY, player) {
    if (player.isDead) return;
    const halfSize = PLAYER_SIZE + BULLET_SIZE;

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

function generateOpenMaze(rows, cols, wallChance = 0.4, corridorWidth = 2) {
    /**
     * Generate a maze with more open areas and corridors of at least `corridorWidth` tiles wide.
     */
    // Initialize the maze with walls
    const maze = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => Math.random() < wallChance ? 4 : 0)
    );

    // Ensure corridors are wider by carving out blocks of empty spaces
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

    // Add some height variation for the walls
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            if (maze[i][j] === 4) {
                // maze[i][j] = Math.floor(Math.random() * 4) + 1; // Wall heights between 1 and 4
                maze[i][j] = 1
            }
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
    generateOpenMaze,
};
