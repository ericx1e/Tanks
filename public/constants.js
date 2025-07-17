// Enhanced Shared Constants for Tank Game
const TILE_SIZE = 50;  // Size of each tile
const BULLET_SIZE = 5; // Size of bullets
const BULLET_SPEED = 4;
const PLAYER_SIZE = 20; // Size of the player's bounding box
const WALL_HEIGHT = 80;

const MAX_SPEED = 2.2; // Maximum player speed
const ACCELERATION = 0.3; // How fast the tank accelerates
const FRICTION = 0.1; // How fast the tank slows down

const AI_TANK_SPEED = 1.5; // Speed of AI tanks

// UI Constants
const UI_CONSTANTS = {
    // Button dimensions
    BUTTON_WIDTH: 220,
    BUTTON_HEIGHT: 50,
    BUTTON_SPACING: 70,

    // Input field dimensions
    INPUT_WIDTH: 220,
    INPUT_HEIGHT: 45,

    // Panel dimensions
    TOP_PANEL_WIDTH: 280,
    TOP_PANEL_HEIGHT: 120,
    STATUS_PANEL_WIDTH: 180,
    STATUS_PANEL_HEIGHT: 100,

    // Font sizes
    TITLE_SIZE: 52,
    SUBTITLE_SIZE: 18,
    BUTTON_TEXT_SIZE: 18,
    PANEL_TEXT_SIZE: 14,
    HINT_TEXT_SIZE: 11,

    // Colors (RGB values for p5.js)
    COLORS: {
        PRIMARY: [30, 60, 114],
        PRIMARY_DARK: [20, 45, 85],
        SECONDARY: [42, 82, 152],
        ACCENT: [255, 193, 7],
        ACCENT_DARK: [230, 170, 0],
        SUCCESS: [40, 167, 69],
        DANGER: [220, 53, 69],
        WARNING: [255, 152, 0],
        DARK: [52, 58, 64],
        LIGHT: [248, 249, 250],
        WHITE: [255, 255, 255],
        BLACK: [0, 0, 0],
        TRANSPARENT: [0, 0, 0, 100],
        OVERLAY: [0, 0, 0, 150]
    },

    // Animation constants
    ANIMATION: {
        MENU_SLIDE_SPEED: 0.02,
        BUTTON_PULSE_SPEED: 0.05,
        NOTIFICATION_FADE_IN: 300,
        NOTIFICATION_FADE_OUT: 500,
        CURSOR_BLINK_RATE: 60,
        SHAKE_DECAY: 0.9
    },

    // Timing constants
    TIMING: {
        NOTIFICATION_DURATION: 4000,
        ERROR_DISPLAY_DURATION: 5000,
        LOADING_MIN_TIME: 1000,
        BUTTON_CLICK_FEEDBACK: 100
    },

    // Layout constants
    LAYOUT: {
        MENU_CENTER_X: 0,
        MENU_START_Y: -80,
        TOP_PANEL_X: -20, // offset from left edge
        TOP_PANEL_Y: 20,   // offset from top edge
        STATUS_PANEL_OFFSET_X: 200, // offset from right edge
        STATUS_PANEL_Y: 20,
        CONTROLS_HINT_X: 20,
        CONTROLS_HINT_Y_OFFSET: 60, // offset from bottom
        NOTIFICATION_START_Y: 160,
        NOTIFICATION_SPACING: 60
    },

    // Z-index layers
    Z_INDEX: {
        GAME: 0,
        UI_BACKGROUND: 100,
        UI_ELEMENTS: 200,
        NOTIFICATIONS: 300,
        MODAL: 400,
        LOADING: 500,
        ERROR: 600
    }
};

// Game Mode Constants
const GAME_MODES = {
    LOBBY: 'lobby',
    CAMPAIGN: 'campaign',
    ARENA: 'arena',
    SURVIVAL: 'survival'
};

// Tank Tier Constants
const TANK_TIERS = {
    BASIC: 0,
    FAST: 1,
    SNIPER: 2,
    BURST: 3,
    SHIELD: 4,
    LASER: 5,
    TRIPLE: 6,
    HEAVY: 7,
    BUTTON: 'button',
    CHEST: 'chest'
};

// Buff Types
const BUFF_TYPES = {
    SPEED: 'speed',
    FIRE_RATE: 'fireRate',
    BULLET_SPEED: 'bulletSpeed',
    BULLET_BOUNCES: 'bulletBounces',
    SHIELD: 'shield',
    MULTI_SHOT: 'multiShot'
};

// Input Key Codes
const INPUT_KEYS = {
    W: 87,
    A: 65,
    S: 83,
    D: 68,
    SPACE: 32,
    ENTER: 13,
    ESCAPE: 27,
    BACKSPACE: 8,
    TAB: 9,
    SHIFT: 16,
    CTRL: 17,
    ALT: 18
};

// Game State Constants
const GAME_STATES = {
    MENU: 'menu',
    PLAYING: 'playing',
    TRANSITION: 'transition',
    PAUSED: 'paused',
    GAME_OVER: 'gameOver'
};

// Notification Types
const NOTIFICATION_TYPES = {
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error'
};

// Vision and Fog of War Constants
const VISION_CONSTANTS = {
    LOBBY_VISION_DISTANCE: 100, // in tiles
    CAMPAIGN_VISION_DISTANCE: 5, // in tiles
    ARENA_VISION_DISTANCE: 7, // in tiles
    SURVIVAL_VISION_DISTANCE: 5, // in tiles
    RAY_RESOLUTION: Math.PI / 150,
    FOG_ALPHA: 180,
    FOG_COLOR: [51, 51, 51]
};

// Audio Constants (for future implementation)
const AUDIO_CONSTANTS = {
    MASTER_VOLUME: 0.7,
    SFX_VOLUME: 0.8,
    MUSIC_VOLUME: 0.5,
    UI_VOLUME: 0.6
};

// Performance Constants
const PERFORMANCE_CONSTANTS = {
    TARGET_FPS: 60,
    MAX_PARTICLES: 1000,
    MAX_BULLETS: 100,
    MAX_EXPLOSIONS: 50,
    CULL_DISTANCE: 2000, // pixels
    LOD_DISTANCE: 1000   // pixels for level of detail
};

// Utility Functions for Constants
const CONSTANTS_UTILS = {
    // Convert UI color array to p5.js color
    getColor: function (colorArray) {
        if (typeof color !== 'undefined') {
            return color(...colorArray);
        }
        return colorArray;
    },

    // Get responsive size based on screen width
    getResponsiveSize: function (baseSize, screenWidth = window.innerWidth) {
        if (screenWidth < 480) return baseSize * 0.7;
        if (screenWidth < 768) return baseSize * 0.85;
        return baseSize;
    },

    // Get responsive font size
    getResponsiveFontSize: function (baseFontSize, screenWidth = window.innerWidth) {
        if (screenWidth < 480) return baseFontSize * 0.8;
        if (screenWidth < 768) return baseFontSize * 0.9;
        return baseFontSize;
    },

    // Convert tile coordinates to world coordinates
    tileToWorld: function (tileX, tileY) {
        return {
            x: tileX * TILE_SIZE + TILE_SIZE / 2,
            y: tileY * TILE_SIZE + TILE_SIZE / 2
        };
    },

    // Convert world coordinates to tile coordinates
    worldToTile: function (worldX, worldY) {
        return {
            x: Math.floor(worldX / TILE_SIZE),
            y: Math.floor(worldY / TILE_SIZE)
        };
    },

    // Calculate distance between two points
    distance: function (x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    },

    // Clamp value between min and max
    clamp: function (value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    // Linear interpolation
    lerp: function (start, end, factor) {
        return start + (end - start) * factor;
    },

    // Map value from one range to another
    map: function (value, start1, stop1, start2, stop2) {
        return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
    }
};

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
        UI_CONSTANTS,
        GAME_MODES,
        TANK_TIERS,
        BUFF_TYPES,
        INPUT_KEYS,
        GAME_STATES,
        NOTIFICATION_TYPES,
        VISION_CONSTANTS,
        AUDIO_CONSTANTS,
        PERFORMANCE_CONSTANTS,
        CONSTANTS_UTILS
    };
}

// Make constants globally available in browser
if (typeof window !== 'undefined') {
    window.GAME_CONSTANTS = {
        TILE_SIZE,
        BULLET_SIZE,
        BULLET_SPEED,
        PLAYER_SIZE,
        WALL_HEIGHT,
        MAX_SPEED,
        ACCELERATION,
        FRICTION,
        AI_TANK_SPEED,
        UI_CONSTANTS,
        GAME_MODES,
        TANK_TIERS,
        BUFF_TYPES,
        INPUT_KEYS,
        GAME_STATES,
        NOTIFICATION_TYPES,
        VISION_CONSTANTS,
        AUDIO_CONSTANTS,
        PERFORMANCE_CONSTANTS,
        CONSTANTS_UTILS
    };
}