// levels.js
const SPAWN_CELL = -100; // sentinel for lowercase 's' in level files
const fs = require('fs');
const { initializeAITank } = require('./bots.js');
const { TILE_SIZE } = require('./public/constants.js');
const { getRandomNonWallPosition, generateOpenMaze } = require('./utils.js');
const { generateLevel: generateBSPLevel, generateLootLevel } = require('./levelGen.js');

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
      if (ch === 's') { row.push(SPAWN_CELL); continue; } // lowercase s = player spawn
      const n = parseInt(ch, 10);
      row.push(Number.isNaN(n) ? ('A'.charCodeAt(0) - ch.charCodeAt(0) - 1) : n);
    }
    level.push(row);
  }
  if (level.length) levels.push(level);               // last level (no trailing newline)
  return levels;
}

let allCampaignLevels = [];
try { allCampaignLevels = readLevels('./campaignLevels.txt'); } catch (_) { }

const lobbyLevels = readLevels('./lobbyLevel.txt');
const arenaLevels = readLevels('./arenaLevel.txt');

function loadLevel(lobby, levelNumber) {
  let level;
  const numPlayers = Object.values(lobby.players).reduce((count, p) => count + (!p.isAI ? 1 : 0), 0);

  let lootContinueZone = null;

  switch (lobby.mode) {
    case 'lobby':
      level = lobbyLevels[levelNumber] || lobbyLevels[0] || [[]];
      break;
    case 'campaign':
      level = allCampaignLevels[levelNumber] || [[]];
      break;
    case 'endless':
      if ((levelNumber + 1) % 5 === 0 && levelNumber >= 9) { // first loot room at level 10, not 5
        // Loot round
        const result = generateLootLevel(numPlayers, levelNumber);
        level = result.grid;
        lootContinueZone = { col: result.continueCol, row: result.continueRow };
      } else {
        level = generateBSPLevel(levelNumber, Infinity, true);
        lootContinueZone = null;
      }
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
  for (let r = 0; r < level.length; r++) {
    for (let c = 0; c < level[0].length; c++) {
      const elem = level[r][c];
      const x = c * TILE_SIZE + TILE_SIZE / 2;
      const y = r * TILE_SIZE + TILE_SIZE / 2;

      if (elem === SPAWN_CELL) {
        spawn.x = x;
        spawn.y = y;
      } else if (elem < 0) {
        const tier = -elem - 1;
        if (tier === 24) {               // 'Y' -> chest
          const id = `AI_c${tankCount++}`;
          players[id] = initializeAITank(id, x, y, 'chest');
        } else {
          const id = `AI_${tankCount++}`;
          players[id] = initializeAITank(id, x, y, tier);
        }
      }
    }
  }

  return { players, level, spawn, continueZone: lootContinueZone };
}

function getNumLevels(mode) {
  switch (mode) {
    case 'campaign': return allCampaignLevels.length;
    case 'endless': return Infinity;
    case 'lobby': return lobbyLevels.length;
    default: return 1; // arena/survival are generated
  }
}

module.exports = {
  loadLevel,
  getNumLevels,
};
