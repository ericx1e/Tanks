// generateLevels.js
// Generates random campaign levels with 2-wide corridors and increasing difficulty.
// Usage:  node generateLevels.js [count=20] [output=moreCampaignLevels.txt]

'use strict';

const fs = require('fs');
const { generateLevel } = require('./levelGen.js');

const NUM_LEVELS = parseInt(process.argv[2]) || 20;
const OUT_FILE   = process.argv[3] || 'moreCampaignLevels.txt';

// Convert numeric grid back to the text format used by campaignLevels.txt
function numGridToStr(grid) {
    return grid.map(row =>
        row.map(c => {
            if (c === 0) return '0';
            if (c === 1) return '1';
            // Negative value → entity character (reverse of readLevels formula)
            return String.fromCharCode('A'.charCodeAt(0) - c - 1);
        }).join('')
    ).join('\n');
}

const levels = [];
for (let i = 0; i < NUM_LEVELS; i++) {
    levels.push(numGridToStr(generateLevel(i, NUM_LEVELS)));
}

fs.writeFileSync(OUT_FILE, levels.join('\n\n') + '\n');
console.log(`Generated ${NUM_LEVELS} levels → ${OUT_FILE}`);
