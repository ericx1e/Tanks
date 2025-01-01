// Shared Constants
const TILE_SIZE = 50;  // Size of each tile
const BULLET_SIZE = 5; // Size of bullets
const BULLET_SPEED = 4;
const PLAYER_SIZE = 20; // Size of the player's bounding box
const WALL_HEIGHT = 60;

const MAX_SPEED = 2.2; // Maximum player speed
const ACCELERATION = 0.3; // How fast the tank accelerates
const FRICTION = 0.1; // How fast the tank slows down

const AI_TANK_SPEED = 1.5; // Speed of AI tanks

// Export for Node.js (Server)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TILE_SIZE,
        BULLET_SIZE,
        BULLET_SPEED,
        PLAYER_SIZE,
        WALL_HEIGHT,
        MAX_SPEED,
        ACCELERATION,
        FRICTION,
        AI_TANK_SPEED
    };
}