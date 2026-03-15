
const socket = io.connect(
    location.hostname === 'localhost' ? 'localhost:3000'
    : 'https://multiplayer-tanks-3fa3c942a132.herokuapp.com/'
);

// Dev console command: giveBuff('speed', 3)
window.giveBuff = (buff, count = 1) => socket.emit('devGiveBuff', { buff, count });
// Dev console command: gotoLevel(15)  — endless mode only
window.gotoLevel = (n) => socket.emit('devGotoLevel', n);

const el = (id) => document.getElementById(id);
const toast = (msg) => {
    const t = el('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.remove('show'), 1600);
};

const NAME_KEY = 'tanks.displayName';
const getSavedName = () => localStorage.getItem(NAME_KEY) || '';
const emitNameIfAny = () => { const n = getSavedName(); if (n) socket.emit('setName', n); };

function normalizeCode(raw) { return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); }

function setButtonsEnabled() {
    el('create-lobby').disabled = false;
    el('join-lobby').disabled = normalizeCode(el('join-lobby-code').value).length < 2;
}

// === Name flow ===
function applySavedNameUI(name) {
    el('player-name').value = name || '';
    const has = !!name;
    el('player-name').disabled = has;
    el('set-name').style.display = has ? 'none' : '';
    el('edit-name').style.display = has ? '' : 'none';
    el('random-name').disabled = has;
    el('name-status').textContent = has ? `Saved as “${name}”` : '';
    setButtonsEnabled();
}

// Returns a resolved name: saved → field value → auto-generated random
function getOrMakeName() {
    const saved = getSavedName();
    if (saved) return saved;
    const fromField = (el('player-name').value || '').trim().slice(0, 16);
    if (fromField) { saveName(fromField); return fromField; }
    const auto = randomName();
    saveName(auto);
    return auto;
}

function randomName() {
    const adjectives = ['Crimson', 'Quantum', 'Nimble', 'Nebula', 'Turbo', 'Silent', 'Swift', 'Azure', 'Cobalt', 'Verdant', 'Solar', 'Feral'];
    const nouns = ['Tank', 'Raptor', 'Blitz', 'Comet', 'Golem', 'Falcon', 'Viper', 'Knight', 'Forge', 'Sprite', 'Nova', 'Spectre'];
    return adjectives[Math.floor(Math.random() * adjectives.length)]
        + nouns[Math.floor(Math.random() * nouns.length)]
        + Math.floor(Math.random() * 90 + 10);
}

function saveName(name) {
    name = (name || '').trim().slice(0, 16);
    if (!name) { toast('Enter a name first'); return; }
    localStorage.setItem(NAME_KEY, name);
    socket.emit('setName', name);
    applySavedNameUI(name);
    el('random-name').disabled = true;
    toast('Name saved');
}

function showLobbyCode(code) {
    if (!code) return;
    el('lobby-info').style.display = 'grid';
    el('lobby-code-badge').textContent = code;
}

// Wire up
applySavedNameUI(localStorage.getItem(NAME_KEY));
el('set-name').addEventListener('click', () => saveName(el('player-name').value));
el('random-name').addEventListener('click', () => { el('player-name').value = randomName(); el('player-name').focus(); });
el('edit-name').addEventListener('click', () => {
    el('player-name').disabled = false; el('player-name').focus();
    el('set-name').style.display = ''; el('edit-name').style.display = 'none';
    el('random-name').disabled = false; el('name-status').textContent = 'Editing name…';
});

el('player-name').addEventListener('input', setButtonsEnabled);
el('join-lobby-code').addEventListener('input', () => {
    const v = normalizeCode(el('join-lobby-code').value);
    if (el('join-lobby-code').value !== v) el('join-lobby-code').value = v;
    setButtonsEnabled();
});

// Enter submits
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (document.activeElement === el('player-name')) {
        saveName(el('player-name').value);
        return;
    }
    const code = normalizeCode(el('join-lobby-code').value);
    const name = getOrMakeName();
    if (code.length >= 2) {
        socket.emit('joinLobby', { code, name });
    } else {
        socket.emit('createLobby', { name });
    }
});

el('create-lobby').addEventListener('click', () => {
    socket.emit('createLobby', { name: getOrMakeName() });
});

el('join-lobby').addEventListener('click', () => {
    const code = normalizeCode(el('join-lobby-code').value);
    if (!code) return toast('Enter a lobby code');
    socket.emit('joinLobby', { code, name: getOrMakeName() });
});

el('copy-code').addEventListener('click', async () => {
    const code = el('lobby-code-badge').textContent.trim();
    if (!code) return;
    try { await navigator.clipboard.writeText(code); toast('Copied lobby code'); }
    catch (e) { toast('Copy failed'); }
});

// Fullscreen toggle
el('fullscreen-btn').addEventListener('mousedown', () => { window._fsButtonDown = true; });
el('fullscreen-btn').addEventListener('click', () => {
    const mount = el('game-mount');
    if (!document.fullscreenElement) {
        mount.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen();
    }
});

document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    el('fs-expand').style.display = isFs ? 'none' : '';
    el('fs-compress').style.display = isFs ? '' : 'none';
    if (window.setGamePixelDensity) window.setGamePixelDensity(isFs ? 2 : 1);
});

// True once a lobby is active — gates WASD focus-steal
window.tankGameActive = false;

function releaseInputFocus() {
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
}

function showLobbyPanel() { if (typeof clearAllInput === 'function') clearAllInput(); }
function hideLobbyPanel() { /* no-op: controls bar is always visible */ }
function updateFabCode() { /* no-op: no FAB */ }

// Only steal focus from inputs when the game is actually running
document.addEventListener('keydown', (e) => {
    if (!window.tankGameActive) return;
    const gameKeys = ['w','a','s','d','ArrowUp','ArrowLeft','ArrowDown','ArrowRight',' '];
    if (gameKeys.includes(e.key) && document.activeElement instanceof HTMLInputElement) {
        document.activeElement.blur();
    }
}, true);

// Socket events
socket.on('lobbyCreated', (data) => {
    window.tankGameActive = true;
    showLobbyCode(data.lobbyCode);
    updateFabCode(data.lobbyCode);
    el('join-lobby-code').value = data.lobbyCode;
    setButtonsEnabled();
    emitNameIfAny();
    releaseInputFocus();
    toast('Lobby created');
});

socket.on('lobbyJoined', (data) => {
    window.tankGameActive = true;
    showLobbyCode(data.lobbyCode);
    updateFabCode(data.lobbyCode);
    setButtonsEnabled();
    emitNameIfAny();
    releaseInputFocus();
    toast('Joined lobby');
});

socket.on('disconnect', () => { window.tankGameActive = false; showLobbyPanel(); });
socket.on('error', (err) => { toast(err?.message || 'Something went wrong'); });

// ===== Event Log =====
function gameLog(tag, msg, type = 'game') {
    const log = el('event-log');
    if (!log) return;
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML =
        `<span class="log-time">${time}</span>` +
        `<span class="log-tag ${type}">${tag}</span>` +
        `<span class="log-msg">${msg}</span>`;
    log.prepend(entry);
    while (log.children.length > 60) log.lastChild.remove();
}

el('clear-log').addEventListener('click', () => {
    const log = el('event-log');
    while (log.firstChild) log.firstChild.remove();
});

// Connection
socket.on('connect', () => gameLog('conn', 'Connected to server', 'conn'));
socket.on('disconnect', () => gameLog('conn', 'Disconnected', 'error'));

// Lobby
socket.on('lobbyCreated', (data) => gameLog('lobby', `Lobby ${data.lobbyCode} created`, 'lobby'));
socket.on('lobbyJoined', (data) => gameLog('lobby', `Joined lobby ${data.lobbyCode}`, 'lobby'));
socket.on('error', (err) => gameLog('error', err?.message || 'Error', 'error'));

// Game
socket.on('gameMode', (mode) => gameLog('game', `Mode: ${mode}`));
socket.on('victory', () => gameLog('game', 'Victory!'));
socket.on('levelComplete', (data) => gameLog('game', `Level ${data.levelNumber} complete`));
socket.on('gameOver', () => gameLog('game', 'Game over'));
socket.on('nextLevel', () => gameLog('game', 'Loading next level…'));

// Sync selected class to server after joining (persists last choice from localStorage)
const _savedClass = localStorage.getItem('tanks.selectedClass') || 'assault';
socket.on('lobbyCreated', () => socket.emit('selectClass', _savedClass));
socket.on('lobbyJoined', () => socket.emit('selectClass', _savedClass));

socket.on('playerClassChanged', ({ playerId, classId }) => {
    if (playerId === socket.id) {
        localStorage.setItem('tanks.selectedClass', classId);
        const cls = typeof TANK_CLASSES !== 'undefined'
            ? TANK_CLASSES.find(c => c.id === classId) : null;
        gameLog('game', `Class: ${cls ? cls.name : classId}`);
    }
});