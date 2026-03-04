// Shared Constants
const TILE_SIZE = 50;  // Size of each tile
const BULLET_SIZE = 5; // Size of bullets
const BULLET_SPEED = 4;
const PLAYER_SIZE = 20; // Size of the player's bounding box
const WALL_HEIGHT = 100;

const MAX_SPEED = 2.2; // Maximum player speed
const ACCELERATION = 0.3; // How fast the tank accelerates
const FRICTION = 0.1; // How fast the tank slows down

const AI_TANK_SPEED = 1.5; // Speed of AI tanks

const TANK_CLASSES = [
    {
        id: 'assault', name: 'Assault', label: '[A]',
        description: 'Balanced fighter — the pure baseline. No trade-offs.',
        buffs: {},
        color: '#6ea8ff',
    },
    {
        id: 'scout', name: 'Scout', label: '[S]',
        description: 'Lightning-fast with extended vision. Right-click to launch a flare that reveals the area around it through fog.',
        buffs: { speed: 3, visionRange: 2, maxBullets: -3, bulletBounces: -1 },
        special: 'flare',
        color: '#78f5cf',
    },
    {
        id: 'sniper', name: 'Sniper', label: '[SN]',
        description: 'Piercing high-velocity shots. Very slow movement and slow fire rate.',
        buffs: { bulletSpeed: 4, piercing: 2, visionRange: 1, speed: -3, maxBullets: -4, fireRate: -4 },
        color: '#ff9f43',
    },
    {
        id: 'guardian', name: 'Guardian', label: '[G]',
        description: 'Right-click to hold a directional shield that blocks incoming bullets. Fewer bullets and slower fire.',
        buffs: { maxBullets: -2, fireRate: -3 },
        special: 'shield',
        color: '#48dbfb',
    },
    {
        id: 'engineer', name: 'Engineer', label: '[E]',
        description: 'Deploys auto-turrets that intercept bullets and enemies. A companion mini-tank follows you, auto-shoots enemies, and respawns each round.',
        buffs: { autoTurret: 5, speed: -2, maxBullets: -3 },
        color: '#ffd32a',
    },
    {
        id: 'laser', name: 'Laser', label: '[L]',
        description: 'Right-click to fire a laser beam. Normal bullets are slower with no ricochets and limited ammo.',
        buffs: { bulletSpeed: -2, bulletBounces: -1, maxBullets: -3 },
        special: 'laser',
        color: '#ff6b6b',
    },
    {
        id: 'gunner', name: 'Gunner', label: '[GN]',
        description: 'Rapid-fire triple-shot spread. Right-click to unleash a focused bullet stream at your crosshair. Bullets are slower with no ricochets.',
        buffs: { multiShot: 2, fireRate: 3, bulletSpeed: -2, bulletBounces: -1 },
        special: 'barrage',
        color: '#a29bfe',
    },
];

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
        AI_TANK_SPEED,
        TANK_CLASSES
    };
}