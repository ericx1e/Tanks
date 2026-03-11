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
        description: 'Balanced fighter. Right-click to spend pillage charge for a random buff — charge builds on kills and surges on level completion.',
        buffs: {},
        special: 'pillage',
        color: '#6ea8ff',
    },
    {
        id: 'scout', name: 'Scout', label: '[S]',
        description: 'Lightning-fast with extended vision. Right-click to throw a stun flare — reveals fog and blinds nearby enemies for 2.5 seconds.',
        buffs: { speed: 3, visionRange: 2, maxBullets: -3, bulletBounces: -1 },
        special: 'flare',
        color: '#78f5cf',
    },
    {
        id: 'sniper', name: 'Sniper', label: '[SN]',
        description: 'Piercing high-velocity shots. Hold right-click to scope; release to fire a wall-piercing shot that passes through everything.',
        buffs: { bulletSpeed: 4, piercing: 2, visionRange: 2, speed: -3, fireRate: -4 },
        special: 'scope',
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
        description: 'Deploys auto-turrets that intercept bullets and enemies. Starts with a companion mini-tank; right-click to spawn another every 30 seconds.',
        buffs: { autoTurret: 5, speed: -1, visionRange: -3, fireRate: -3 },
        special: 'companion',
        color: '#ffd32a',
    },
    {
        id: 'laser', name: 'Laser', label: '[L]',
        description: 'Right-click to fire a laser beam. Normal bullets are slower with no ricochets and limited ammo.',
        buffs: { bulletSpeed: -2, bulletBounces: -1, maxBullets: -3, fireRate: -3 },
        special: 'laser',
        color: '#ff6b6b',
    },
    {
        id: 'gunner', name: 'Gunner', label: '[GN]',
        description: 'Rapid-fire triple-shot spread. Right-click to unleash a focused bullet stream at your crosshair. Bullets are slower with no ricochets.',
        buffs: { multiShot: 2, bulletSpeed: -2, bulletBounces: -1, visionRange: -1 },
        special: 'barrage',
        color: '#a29bfe',
    },
    {
        id: 'artillerist', name: 'Artillerist', label: '[AT]',
        description: 'Starts with pierce and explosive — every bullet pierces and explodes. Right-click to launch a heavy cannonball with a massive blast radius.',
        buffs: { piercing: 1, explosive: 1, speed: -1, bulletSpeed: -1, maxBullets: -2 },
        special: 'cannon',
        color: '#e67e22',
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