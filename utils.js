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


module.exports = {
    isCollidingWithWall,
    isCollidingWithPlayer,
    isWall,
    lerpAngle,
    getRandomNonWallPosition,
};
