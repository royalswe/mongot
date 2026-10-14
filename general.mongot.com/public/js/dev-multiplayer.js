'use strict';

window.roomSelect = document.getElementById('room_select');
window.playerCount = document.getElementById('player_count');
window.openButton = document.getElementById('open_players');
window.workspace = document.getElementById('workspace');
window.statusLabel = document.getElementById('cockpit_status');
window.availableRooms = [];
window.windows = [];
window.defaultLayoutOpened = false;

window.lobbySocket = io(location.host + '/game_infra', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    transports: ['websocket', 'polling']
});

lobbySocket.on('connect', function () {
    statusLabel.textContent = 'Connected';
    lobbySocket.emit('get_rooms');
});

lobbySocket.on('disconnect', function () {
    statusLabel.textContent = 'Disconnected';
});

lobbySocket.on('rooms_list', function (rooms) {
    availableRooms = rooms.filter(function (room) {
        return room.players === 0 && (room.status === 'open' || room.status === 'waiting for players');
    });
    renderRooms();
    statusLabel.textContent = availableRooms.length ? availableRooms.length + ' open tables' : 'No open tables';

    if (!defaultLayoutOpened && availableRooms.length) {
        defaultLayoutOpened = true;
        openPlayers();
    }
});

roomSelect.addEventListener('change', updatePlayerCounts);
openButton.addEventListener('click', openPlayers);
document.getElementById('clear_players').addEventListener('click', closeAllPlayers);

function renderRooms() {
    const previousRoom = roomSelect.value;
    roomSelect.textContent = '';
    availableRooms.sort(function (first, second) {
        return first.startingPlayers - second.startingPlayers || second.players - first.players;
    });

    availableRooms.forEach(function (room) {
        const option = document.createElement('option');
        option.value = room.name;
        option.textContent = room.name + ' (' + room.players + '/' + room.startingPlayers + ')';
        roomSelect.appendChild(option);
    });

    if (availableRooms.some(function (room) { return room.name === previousRoom; })) {
        roomSelect.value = previousRoom;
    }
    updatePlayerCounts();
}

function updatePlayerCounts() {
    const room = selectedRoom();
    playerCount.textContent = '';
    if (!room) {
        playerCount.disabled = true;
        openButton.disabled = true;
        return;
    }

    const count = Math.min(2, room.startingPlayers);
    for (let number = 2; number <= room.startingPlayers; number += 1) {
        let option = document.createElement('option');
        option.value = String(number);
        option.textContent = String(number);
        playerCount.appendChild(option);
    }
    playerCount.value = String(count);
    playerCount.disabled = false;
    openButton.disabled = false;
}

function selectedRoom() {
    return availableRooms.find(function (room) { return room.name === roomSelect.value; });
}

function openPlayers() {
    const room = selectedRoom();
    if (!room) { return; }

    closeAllPlayers();
    const count = Number(playerCount.value);
    for (let index = 0; index < count; index += 1) {
        addPlayerWindow(index + 1, room.name);
    }
    layoutWindows();
    statusLabel.textContent = count + ' players in ' + room.name;
}

function addPlayerWindow(number, roomName) {
    const panel = document.createElement('article');
    panel.className = 'player-window';

    const titlebar = document.createElement('div');
    titlebar.className = 'window-titlebar';
    const title = document.createElement('span');
    title.className = 'window-title';
    title.textContent = 'Player ' + number;

    const actions = document.createElement('div');
    actions.className = 'window-actions';
    actions.appendChild(makeWindowButton('Reload', 'R', function () {
        frame.src = frame.src;
    }));
    actions.appendChild(makeWindowButton('Close', 'x', function () {
        windows = windows.filter(function (entry) { return entry.panel !== panel; });
        panel.remove();
    }));
    titlebar.appendChild(title);
    titlebar.appendChild(actions);

    const frame = document.createElement('iframe');
    frame.title = 'Player ' + number + ' game';
    const gameUrl = new URL('/game', location.origin);
    gameUrl.searchParams.set('room', roomName);
    gameUrl.searchParams.set('devGuestId', createGuestId());
    gameUrl.searchParams.set('devMapId', 'quick');
    frame.src = gameUrl.pathname + gameUrl.search;

    panel.appendChild(titlebar);
    panel.appendChild(frame);
    workspace.appendChild(panel);
    windows.push({panel: panel, titlebar: titlebar});
    enableDragging(panel, titlebar);
}

function makeWindowButton(label, text, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
}

function createGuestId() {
    return Date.now().toString(36);
}

function enableDragging(panel, titlebar) {
    let dragOffsetX;
    let dragOffsetY;

    titlebar.addEventListener('pointerdown', function (event) {
        if (event.target.closest('button')) { return; }
        const panelBounds = panel.getBoundingClientRect();
        dragOffsetX = event.clientX - panelBounds.left;
        dragOffsetY = event.clientY - panelBounds.top;
        titlebar.setPointerCapture(event.pointerId);
    });

    titlebar.addEventListener('pointermove', function (event) {
        if (!titlebar.hasPointerCapture(event.pointerId)) { return; }
        const workspaceBounds = workspace.getBoundingClientRect();
        panel.style.left = Math.max(0, event.clientX - workspaceBounds.left + workspace.scrollLeft - dragOffsetX) + 'px';
        panel.style.top = Math.max(0, event.clientY - workspaceBounds.top + workspace.scrollTop - dragOffsetY) + 'px';
    });
}

function layoutWindows() {
    const gap = 14;
    const columns = workspace.clientWidth >= 900 ? 2 : 1;
    let width = columns === 2 ? Math.min(620, Math.floor((workspace.clientWidth - 36 - gap) / 2)) : Math.min(620, workspace.clientWidth - 24);
    width = Math.max(420, width);

    windows.forEach(function (entry, index) {
        const column = index % columns;
        const row = Math.floor(index / columns);
        entry.panel.style.width = width + 'px';
        entry.panel.style.left = (12 + column * (width + gap)) + 'px';
        entry.panel.style.top = (12 + row * (468 + gap)) + 'px';
    });
}

function closeAllPlayers() {
    windows.forEach(function (entry) { entry.panel.remove(); });
    windows = [];
}

window.addEventListener('resize', layoutWindows);