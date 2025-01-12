const { initializeAITank } = require('./bots.js');
const { TILE_SIZE } = require('./public/constants.js');
const { getRandomNonWallPosition, generateOpenMaze } = require('./utils.js');
const fs = require('fs');
// const readline = require('readline');


function readLevels(path) {
    let levels = []

    fs.readFile(path, 'utf8', (err, data) => {
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
    })

    return levels
}

const campaignLevels = readLevels('./campaignLevels.txt');
const lobbyLevel = readLevels('./lobbyLevel.txt');
const arenaLevel = readLevels('./arenaLevel.txt')

function loadLevel(lobby, levelNumber) {
    let level
    let numPlayers = Object.keys(lobby.players).length; // TODO: exclude AI tanks

    switch (lobby.mode) {
        case 'lobby':
            level = lobbyLevel[levelNumber];
            break;
        case 'campaign':
            // console.log(campaignLevels)
            level = campaignLevels[levelNumber];
            break;
        case 'arena':
            // level = arenaLevel[levelNumber];
            let size = Math.floor(Math.sqrt(numPlayers))
            level = generateOpenMaze(10 * size, 10 * size)
            break;
        case 'survival':
            let size1 = Math.floor(Math.sqrt(numPlayers));
            level = generateOpenMaze(15 * size1, 15 * size1);
            break;
    }

    if (levelNumber < 0 || levelNumber >= campaignLevels.length) {
        return { players: {}, level: [[]], spawn: { x: 0, y: 0 } };
    }

    const spawn = { x: 0, y: 0 }
    const players = {}
    let tankCount = 0;
    let buttonNumber = 0;
    let buttonTypes = ['Campaign', lobby.friendlyFire ? 'Friendly Fire: ON' : 'Friendly Fire: OFF', 'Arena', 'Survival']
    for (let r = 0; r < level.length; r++) {
        for (let c = 0; c < level[0].length; c++) {
            const id = `AI_${tankCount}`;
            const elem = level[r][c];
            if (elem < 0) {
                tankCount++;
                const tier = -elem - 1;
                const x = c * TILE_SIZE + TILE_SIZE / 2;
                const y = r * TILE_SIZE + TILE_SIZE / 2;
                if (tier == 18) { // S
                    // Special spawn marker, not tank
                    spawn.x = x;
                    spawn.y = y;
                } else if (tier == 25) {
                    // Button tank
                    players[id] = initializeAITank(id, x, y, 'button', buttonTypes[buttonNumber++]);
                } else if (tier == 24) {
                    // Chest
                    players[id] = initializeAITank(id, x, y, 'chest');
                }
                else {
                    players[id] = initializeAITank(id, x, y, tier);
                    // level[r][c] = 0
                }
            }
        }
    }

    return { players, level, spawn }

}

function getNumLevels(mode) {
    switch (mode) {
        case 'campaign':
            return campaignLevels.length;
        default:
            return 1;
    }
}

module.exports = {
    loadLevel,
    getNumLevels,
    // campaignLevels
}