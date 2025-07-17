// UI Utility Functions for Tank Game

class UIUtils {
    // Animation and easing functions
    static easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    static easeOut(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    static easeIn(t) {
        return t * t * t;
    }

    // Color utility functions
    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    static rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    static interpolateColor(color1, color2, factor) {
        if (!color1 || !color2) return color1 || color2;

        const result = [];
        for (let i = 0; i < Math.min(color1.length, color2.length); i++) {
            result[i] = Math.round(color1[i] + (color2[i] - color1[i]) * factor);
        }
        return result;
    }

    static darkenColor(colorArray, factor) {
        return colorArray.map(c => Math.round(c * (1 - factor)));
    }

    static lightenColor(colorArray, factor) {
        return colorArray.map(c => Math.round(c + (255 - c) * factor));
    }

    // Text and formatting utilities
    static formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes > 0) {
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `${remainingSeconds}s`;
    }

    static truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    static capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    static formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    // Layout and positioning utilities
    static centerX(containerWidth, elementWidth) {
        return (containerWidth - elementWidth) / 2;
    }

    static centerY(containerHeight, elementHeight) {
        return (containerHeight - elementHeight) / 2;
    }

    static alignGrid(elements, containerWidth, containerHeight, cols, rows) {
        const cellWidth = containerWidth / cols;
        const cellHeight = containerHeight / rows;

        return elements.map((element, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);

            return {
                ...element,
                x: col * cellWidth + cellWidth / 2 - element.width / 2,
                y: row * cellHeight + cellHeight / 2 - element.height / 2
            };
        });
    }

    // Responsive design utilities
    static getBreakpoint(width) {
        if (width < 480) return 'mobile';
        if (width < 768) return 'tablet';
        if (width < 1024) return 'laptop';
        return 'desktop';
    }

    static getScaleFactor(breakpoint) {
        const scales = {
            mobile: 0.7,
            tablet: 0.85,
            laptop: 0.95,
            desktop: 1.0
        };
        return scales[breakpoint] || 1.0;
    }

    static scaleForDevice(baseValue, screenWidth = window.innerWidth) {
        const breakpoint = UIUtils.getBreakpoint(screenWidth);
        const scale = UIUtils.getScaleFactor(breakpoint);
        return Math.round(baseValue * scale);
    }

    // Input validation utilities
    static validatePlayerName(name) {
        if (!name || typeof name !== 'string') {
            return { valid: false, error: 'Name is required' };
        }

        const trimmed = name.trim();
        if (trimmed.length < 2) {
            return { valid: false, error: 'Name must be at least 2 characters' };
        }

        if (trimmed.length > 16) {
            return { valid: false, error: 'Name must be 16 characters or less' };
        }

        if (!/^[a-zA-Z0-9_\-\s]+$/.test(trimmed)) {
            return { valid: false, error: 'Name can only contain letters, numbers, spaces, hyphens, and underscores' };
        }

        return { valid: true, name: trimmed };
    }

    static validateLobbyCode(code) {
        if (!code || typeof code !== 'string') {
            return { valid: false, error: 'Lobby code is required' };
        }

        const trimmed = code.trim().toUpperCase();
        if (trimmed.length < 2) {
            return { valid: false, error: 'Lobby code is too short' };
        }

        if (trimmed.length > 10) {
            return { valid: false, error: 'Lobby code is too long' };
        }

        if (!/^[A-Z0-9]+$/.test(trimmed)) {
            return { valid: false, error: 'Invalid lobby code format' };
        }

        return { valid: true, code: trimmed };
    }

    // Performance utilities
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static throttle(func, limit) {
        let inThrottle;
        return function () {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Storage utilities
    static saveToLocalStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
            return false;
        }
    }

    static loadFromLocalStorage(key, defaultValue = null) {
        try {
            const stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : defaultValue;
        } catch (e) {
            console.warn('Failed to load from localStorage:', e);
            return defaultValue;
        }
    }

    static clearLocalStorage(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.warn('Failed to clear localStorage:', e);
            return false;
        }
    }

    // Math utilities
    static clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    static lerp(start, end, factor) {
        return start + (end - start) * factor;
    }

    static map(value, start1, stop1, start2, stop2) {
        return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
    }

    static distance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    static angleBetween(x1, y1, x2, y2) {
        return Math.atan2(y2 - y1, x2 - x1);
    }

    static randomRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Collision detection utilities
    static pointInRect(px, py, rx, ry, rw, rh) {
        return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
    }

    static pointInCircle(px, py, cx, cy, radius) {
        const dx = px - cx;
        const dy = py - cy;
        return (dx * dx + dy * dy) <= (radius * radius);
    }

    static rectOverlap(r1x, r1y, r1w, r1h, r2x, r2y, r2w, r2h) {
        return !(r2x > r1x + r1w ||
            r2x + r2w < r1x ||
            r2y > r1y + r1h ||
            r2y + r2h < r1y);
    }

    // Audio utilities (for future implementation)
    static playSound(soundName, volume = 1.0, pitch = 1.0) {
        // Placeholder for audio implementation
        console.log(`Playing sound: ${soundName} at volume ${volume} and pitch ${pitch}`);
    }

    static stopSound(soundName) {
        // Placeholder for audio implementation
        console.log(`Stopping sound: ${soundName}`);
    }

    // Device detection utilities
    static isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    static isTablet() {
        return /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent);
    }

    static isTouchDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    static getDevicePixelRatio() {
        return window.devicePixelRatio || 1;
    }

    // Network utilities
    static getConnectionQuality() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            if (connection.effectiveType) {
                return connection.effectiveType; // '4g', '3g', '2g', 'slow-2g'
            }
        }
        return 'unknown';
    }

    static isOnline() {
        return navigator.onLine;
    }

    // Accessibility utilities
    static announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.style.position = 'absolute';
        announcement.style.left = '-10000px';
        announcement.style.width = '1px';
        announcement.style.height = '1px';
        announcement.style.overflow = 'hidden';
        announcement.textContent = message;

        document.body.appendChild(announcement);

        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    static setFocusable(element, focusable = true) {
        if (focusable) {
            element.setAttribute('tabindex', '0');
        } else {
            element.setAttribute('tabindex', '-1');
        }
    }

    // Error handling utilities
    static logError(error, context = '') {
        const errorInfo = {
            message: error.message,
            stack: error.stack,
            context: context,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        console.error('Game Error:', errorInfo);

        // In production, you might want to send this to an error tracking service
        // Example: sendToErrorTrackingService(errorInfo);
    }

    static createErrorHandler(context) {
        return (error) => {
            UIUtils.logError(error, context);
            // Show user-friendly error message
            if (window.uiManager) {
                window.uiManager.addNotification(
                    'An error occurred. Please try again.',
                    'error'
                );
            }
        };
    }

    // Cookie utilities (if needed for settings)
    static setCookie(name, value, days = 30) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Strict`;
    }

    static getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    static deleteCookie(name) {
        document.cookie = `${name}=; Max-Age=-99999999; path=/`;
    }

    // URL utilities
    static getQueryParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    }

    static setQueryParam(param, value) {
        const url = new URL(window.location);
        url.searchParams.set(param, value);
        window.history.replaceState({}, '', url);
    }

    static removeQueryParam(param) {
        const url = new URL(window.location);
        url.searchParams.delete(param);
        window.history.replaceState({}, '', url);
    }

    // Game-specific utilities
    static formatPlayerStats(stats) {
        return {
            kills: UIUtils.formatNumber(stats.kills || 0),
            deaths: UIUtils.formatNumber(stats.deaths || 0),
            score: UIUtils.formatNumber(stats.score || 0),
            kdr: stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : 'N/A'
        };
    }

    static getGameModeDisplayName(mode) {
        const modeNames = {
            'lobby': 'Lobby',
            'campaign': 'Campaign',
            'arena': 'Arena Battle',
            'survival': 'Survival Mode'
        };
        return modeNames[mode] || UIUtils.capitalizeFirst(mode);
    }

    static getTankTierDisplayName(tier) {
        const tierNames = {
            0: 'Basic Tank',
            1: 'Fast Tank',
            2: 'Sniper Tank',
            3: 'Burst Tank',
            4: 'Shield Tank',
            5: 'Laser Tank',
            6: 'Triple Tank',
            7: 'Heavy Tank',
            'button': 'Control Panel',
            'chest': 'Supply Chest'
        };
        return tierNames[tier] || 'Unknown Tank';
    }

    static getBuffDisplayName(buffType) {
        const buffNames = {
            'speed': 'Speed Boost',
            'fireRate': 'Rapid Fire',
            'bulletSpeed': 'Bullet Velocity',
            'bulletBounces': 'Ricochet',
            'shield': 'Energy Shield',
            'multiShot': 'Multi-Shot'
        };
        return buffNames[buffType] || UIUtils.capitalizeFirst(buffType);
    }

    // Version and update utilities
    static getGameVersion() {
        return '1.0.0'; // Should be updated with actual version
    }

    static checkForUpdates() {
        // Placeholder for update checking
        const currentVersion = UIUtils.getGameVersion();
        console.log(`Current game version: ${currentVersion}`);
        // In production, this would check against a server for updates
    }

    // Browser compatibility utilities
    static isWebGLSupported() {
        try {
            const canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext && canvas.getContext('webgl'));
        } catch (e) {
            return false;
        }
    }

    static isLocalStorageSupported() {
        try {
            const test = 'test';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }

    static getBrowserInfo() {
        const ua = navigator.userAgent;
        let browser = 'Unknown';

        if (ua.includes('Chrome')) browser = 'Chrome';
        else if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Safari')) browser = 'Safari';
        else if (ua.includes('Edge')) browser = 'Edge';
        else if (ua.includes('Opera')) browser = 'Opera';

        return {
            browser,
            userAgent: ua,
            webGL: UIUtils.isWebGLSupported(),
            localStorage: UIUtils.isLocalStorageSupported(),
            mobile: UIUtils.isMobile(),
            touchDevice: UIUtils.isTouchDevice()
        };
    }
}

// Make UIUtils globally available
if (typeof window !== 'undefined') {
    window.UIUtils = UIUtils;
}

// Export for Node.js if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIUtils;
}