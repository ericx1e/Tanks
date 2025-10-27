// levels.js
const fs = require('fs');
const { initializeAITank } = require('./bots.js');
const { TILE_SIZE } = require('./public/constants.js');
const { getRandomNonWallPosition, generateOpenMaze } = require('./utils.js');

function readLevels(path) {
  const levels = [];
  const text = fs.readFileSync(path, 'utf8');        // sync: no race
  const lines = text.split(/\r?\n/);                  // handle CRLF/LF

  let level = [];
  for (const raw of lines) {
    const line = raw.trim();                          // treat '\r' as empty
    if (line === '') {
      if (level.length) levels.push(level);
      level = [];
      continue;
    }
    const row = [];
    for (const ch of line) {
      const n = parseInt(ch, 10);
      row.push(Number.isNaN(n) ? ('A'.charCodeAt(0) - ch.charCodeAt(0) - 1) : n);
    }
    level.push(row);
  }
  if (level.length) levels.push(level);               // last level (no trailing newline)
  return levels;
}

const campaignLevels = readLevels('./campaignLevels.txt');
const lobbyLevels    = readLevels('./lobbyLevel.txt');
const arenaLevels    = readLevels('./arenaLevel.txt');

function loadLevel(lobby, levelNumber) {
  let level;
  const numPlayers = Object.values(lobby.players).reduce((count, p) => count + (!p.isAI ? 1 : 0), 0);

  switch (lobby.mode) {
    case 'lobby':
      level = lobbyLevels[levelNumber] || lobbyLevels[0] || [[]];
      break;
    case 'campaign':
      level = campaignLevels[levelNumber] || [[]];
      break;
    case 'arena': {
      const size = Math.max(1, Math.floor(30 * Math.sqrt(Math.max(1, numPlayers))));
      level = generateOpenMaze(size, size, 0.4, 2, 0.02);
      break;
    }
    case 'survival': {
      const size = Math.max(1, Math.floor(30 * Math.sqrt(Math.max(1, numPlayers))));
      level = generateOpenMaze(size, size, 0.4, 2, 0.02);
      break;
    }
    default:
      level = [[]];
  }

  // Bounds / fallback
  if (!Array.isArray(level) || !level.length || !Array.isArray(level[0])) {
    return { players: {}, level: [[]], spawn: { x: 0, y: 0 } };
  }

  const spawn = { x: 0, y: 0 };
  const players = {};
  let tankCount = 0;
  let buttonNumber = 0;
  const buttonTypes = ['Campaign', lobby.friendlyFire ? 'Friendly Fire: ON' : 'Friendly Fire: OFF', 'Arena', 'Survival'];

  for (let r = 0; r < level.length; r++) {
    for (let c = 0; c < level[0].length; c++) {
      const elem = level[r][c];
      const x = c * TILE_SIZE + TILE_SIZE / 2;
      const y = r * TILE_SIZE + TILE_SIZE / 2;

      if (elem < 0) {
        const tier = -elem - 1;
        if (tier === 18) {               // 'S' -> spawn marker
          spawn.x = x;
          spawn.y = y;
        } else if (tier === 25) {        // 'Z' -> button tank
          const id = `AI_${tankCount++}`;
          players[id] = initializeAITank(id, x, y, 'button', buttonTypes[buttonNumber++]);
        } else if (tier === 24) {        // 'Y' -> chest
          const id = `AI_c${tankCount++}`;
          players[id] = initializeAITank(id, x, y, 'chest');
        } else {
          const id = `AI_${tankCount++}`;
          players[id] = initializeAITank(id, x, y, tier);
        }
      }
    }
  }

  return { players, level, spawn };
}

function getNumLevels(mode) {
  switch (mode) {
    case 'campaign': return campaignLevels.length;
    case 'lobby':    return lobbyLevels.length;
    default:         return 1; // arena/survival are generated
  }
}

module.exports = {
  loadLevel,
  getNumLevels,
};
