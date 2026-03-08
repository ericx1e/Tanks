
const socket = io.connect(
    location.hostname === 'localhost' ? 'localhost:3000'
    : 'https://multiplayer-tanks-3fa3c942a132.herokuapp.com/'
);

// Dev console command: giveBuff('speed', 3)
window.giveBuff = (buff, count = 1) => socket.emit('devGiveBuff', { buff, count });

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

function setButtonsEnabled(hasName) {
    el('create-lobby').disabled = !hasName;
    const joinFilled = normalizeCode(el('join-lobby-code').value).length >= 2;
    el('join-lobby').disabled = !(hasName && joinFilled);
}

// === Name flow ===
function applySavedNameUI(name) {
    el('player-name').value = name || '';
    const has = !!name;
    el('player-name').disabled = has;
    el('set-name').style.display = has ? 'none' : '';
    el('edit-name').style.display = has ? '' : 'none';
    el('random-name').disabled = has;
    el('name-status').textContent = has ? `Saved as “${name}”` : 'Pick a name to continue';
    setButtonsEnabled(has);
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

el('player-name').addEventListener('input', () => setButtonsEnabled(!!el('player-name').value.trim()));
el('join-lobby-code').addEventListener('input', () => {
    const v = normalizeCode(el('join-lobby-code').value);
    if (el('join-lobby-code').value !== v) el('join-lobby-code').value = v;
    setButtonsEnabled(!!localStorage.getItem(NAME_KEY));
});

// Enter submits
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const hasNameSaved = !!getSavedName();
    const code = normalizeCode(el('join-lobby-code').value);

    if (document.activeElement === el('player-name')) {
        saveName(el('player-name').value);
    } else if ((hasNameSaved || el('player-name').value.trim()) && code.length >= 2) {
        if (!hasNameSaved) saveName(el('player-name').value);
        socket.emit('joinLobby', { code, name: getSavedName() });
    } else if (hasNameSaved || el('player-name').value.trim()) {
        if (!hasNameSaved) saveName(el('player-name').value);
        socket.emit('createLobby');
    } else {
        toast('Save a name first');
    }
});

el('create-lobby').addEventListener('click', () => {
    if (!getSavedName() && el('player-name').value.trim()) { saveName(el('player-name').value); }
    if (!localStorage.getItem(NAME_KEY)) return toast('Save a name first');
    socket.emit('createLobby', { name: getSavedName() });
});

el('join-lobby').addEventListener('click', () => {
    if (!getSavedName() && el('player-name').value.trim()) { saveName(el('player-name').value); }
    if (!localStorage.getItem(NAME_KEY)) return toast('Save a name first');
    const code = normalizeCode(el('join-lobby-code').value);
    if (!code) return toast('Enter a lobby code');
    socket.emit('joinLobby', { code, name: getSavedName() });
});

el('copy-code').addEventListener('click', async () => {
    const code = el('lobby-code-badge').textContent.trim();
    if (!code) return;
    try { await navigator.clipboard.writeText(code); toast('Copied lobby code'); }
    catch (e) { toast('Copy failed'); }
});

// Close/open lobby panel
const panel = el('lobby-controls');
const fab = el('lobby-fab');
const fabCode = el('lobby-fab-code');

function showLobbyPanel() { panel.classList.remove('is-hidden'); fab.classList.remove('show'); panel.setAttribute('aria-hidden', 'false'); if (typeof clearAllInput === 'function') clearAllInput(); }
function hideLobbyPanel() { panel.classList.add('is-hidden'); fab.classList.add('show'); panel.setAttribute('aria-hidden', 'true'); }
function updateFabCode(code) { if (!code) return; fabCode.textContent = code; }
fab.addEventListener('click', showLobbyPanel);

document.addEventListener('click', (e) => {
    if (panel.contains(e.target) || fab.contains(e.target)) return;
    if (!panel.classList.contains('is-hidden')) { hideLobbyPanel(); }
});

// Socket events
socket.on('lobbyCreated', (data) => {
    showLobbyCode(data.lobbyCode);
    updateFabCode(data.lobbyCode);
    el('join-lobby-code').value = data.lobbyCode;
    hideLobbyPanel();
    setButtonsEnabled(true);
    emitNameIfAny();
    toast('Lobby created');
});

socket.on('lobbyJoined', (data) => {
    showLobbyCode(data.lobbyCode);
    updateFabCode(data.lobbyCode);
    setButtonsEnabled(true);
    hideLobbyPanel();
    emitNameIfAny();
    toast('Joined lobby');
});

socket.on('disconnect', () => { showLobbyPanel(); });
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