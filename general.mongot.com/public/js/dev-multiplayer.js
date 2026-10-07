'use strict';

var roomSelect = document.getElementById('room_select');
var playerCount = document.getElementById('player_count');
var openButton = document.getElementById('open_players');
var workspace = document.getElementById('workspace');
var statusLabel = document.getElementById('cockpit_status');
var availableRooms = [];
var windows = [];
var defaultLayoutOpened = false;

var lobbySocket = io(location.host + '/game_infra', {
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
    var previousRoom = roomSelect.value;
    roomSelect.textContent = '';
    availableRooms.sort(function (first, second) {
        return first.startingPlayers - second.startingPlayers || second.players - first.players;
    });

    availableRooms.forEach(function (room) {
        var option = document.createElement('option');
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
    var room = selectedRoom();
    playerCount.textContent = '';
    if (!room) {
        playerCount.disabled = true;
        openButton.disabled = true;
        return;
    }

    var count = Math.min(2, room.startingPlayers);
    for (var number = 2; number <= room.startingPlayers; number += 1) {
        var option = document.createElement('option');
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
    var room = selectedRoom();
    if (!room) { return; }

    closeAllPlayers();
    var count = Number(playerCount.value);
    for (var index = 0; index < count; index += 1) {
        addPlayerWindow(index + 1, room.name);
    }
    layoutWindows();
    statusLabel.textContent = count + ' players in ' + room.name;
}

function addPlayerWindow(number, roomName) {
    var panel = document.createElement('article');
    panel.className = 'player-window';

    var titlebar = document.createElement('div');
    titlebar.className = 'window-titlebar';
    var title = document.createElement('span');
    title.className = 'window-title';
    title.textContent = 'Player ' + number;

    var actions = document.createElement('div');
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

    var frame = document.createElement('iframe');
    frame.title = 'Player ' + number + ' game';
    var gameUrl = new URL('/game', location.origin);
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
    var button = document.createElement('button');
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
    var dragOffsetX;
    var dragOffsetY;

    titlebar.addEventListener('pointerdown', function (event) {
        if (event.target.closest('button')) { return; }
        var panelBounds = panel.getBoundingClientRect();
        dragOffsetX = event.clientX - panelBounds.left;
        dragOffsetY = event.clientY - panelBounds.top;
        titlebar.setPointerCapture(event.pointerId);
    });

    titlebar.addEventListener('pointermove', function (event) {
        if (!titlebar.hasPointerCapture(event.pointerId)) { return; }
        var workspaceBounds = workspace.getBoundingClientRect();
        panel.style.left = Math.max(0, event.clientX - workspaceBounds.left + workspace.scrollLeft - dragOffsetX) + 'px';
        panel.style.top = Math.max(0, event.clientY - workspaceBounds.top + workspace.scrollTop - dragOffsetY) + 'px';
    });
}

function layoutWindows() {
    var gap = 14;
    var columns = workspace.clientWidth >= 900 ? 2 : 1;
    var width = columns === 2 ? Math.min(620, Math.floor((workspace.clientWidth - 36 - gap) / 2)) : Math.min(620, workspace.clientWidth - 24);
    width = Math.max(420, width);

    windows.forEach(function (entry, index) {
        var column = index % columns;
        var row = Math.floor(index / columns);
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