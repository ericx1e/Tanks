const { initializeAITank } = require('./bots.js');
const { TILE_SIZE } = require('./public/constants.js');
const { getRandomNonWallPosition } = require('./utils.js');
const fs = require('fs');
// const readline = require('readline');

const levels = []

fs.readFile('./levels.txt', 'utf8', (err, data) => {
    if (err) throw err;

    let lines = data.split('\n'); // Split into individual lines

    let level = []
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line) {
            const row = []
            for (let j = 0; j < line.length; j++) {
                if (isNaN(parseInt(line[j]))) {
                    row.push('A'.charCodeAt(0) - line[j].charCodeAt(0) - 1);
                } else {
                    row.push(parseInt(line[j]));
                }
            }
            level.push(row)
        } else {
            levels.push(level)
            level = []
        }
    }

    levels.push(level)
    level = []

    // console.log(levels)
})


function loadLevel(levelNumber) {
    if (levelNumber < 0 || levelNumber >= levels.length) {
        return { players: {}, level: [[]], spawn: { x: 0, y: 0 } };
    }

    const spawn = { x: 0, y: 0 }
    const players = {}
    const level = levels[levelNumber];
    let tankCount = 0;
    for (let r = 0; r < level.length; r++) {
        for (let c = 0; c < level[0].length; c++) {
            const id = tankCount;
            const elem = level[r][c];
            if (elem < 0) {
                const tier = -elem - 1;
                const x = c * TILE_SIZE + TILE_SIZE / 2;
                const y = r * TILE_SIZE + TILE_SIZE / 2;
                if (tier == 18) { // S
                    // Special spawn marker, not tank
                    spawn.x = x;
                    spawn.y = y;
                } else if (tier == 25) {
                    // Button tank
                    players[`AI_${tankCount++}`] = initializeAITank(id, x, y, 'button');
                }
                else {
                    players[`AI_${tankCount++}`] = initializeAITank(id, x, y, tier);
                    // level[r][c] = 0
                }
            }
        }
    }

    return { players, level, spawn }
}

module.exports = {
    loadLevel,
    levels
}