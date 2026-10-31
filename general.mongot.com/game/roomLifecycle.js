'use strict';

const ROOM_CLEANUP_DELAY = Number(process.env.ROOM_CLEANUP_DELAY_MS) || 30000;

function createRoomLifecycle(options = {}) {
    const lobbyRooms = options.rooms || createStartingRooms();
    const joinedPlayers = [];
    const playerSockets = [];
    const rematchVotes = {};
    const cleanupTimers = {};
    const getGame = options.getGame || (() => undefined);
    const destroyGame = options.destroyGame || (() => {});
    const onRoomRemoved = options.onRoomRemoved || (() => {});
    const hasVisitors = options.hasVisitors || (() => false);
    const setTimer = options.setTimeout || setTimeout;
    const clearTimer = options.clearTimeout || clearTimeout;
    const cleanupDelay = options.cleanupDelay === undefined ? ROOM_CLEANUP_DELAY : options.cleanupDelay;

    function findRoom(room) {
        return lobbyRooms.find((gameRoom) => gameRoom.name === room);
    }

    function seatedIn(room) {
        return playerSockets.filter((player) => player.room === room);
    }

    function canTakeSeat(room, username, color) {
        return Boolean(findRoom(room)) && !seatedIn(room).some((player) => player.username === username || player.color === color);
    }

    function updateLobby(room) {
        const humans = seatedIn(room).length;
        const roomInfo = findRoom(room);
        if (!roomInfo) { return humans; }
        const game = getGame(room);
        const playersInRoom = roomInfo.status === 'rematch' && game ?
            game.getPlayerCount() :
            humans + (roomInfo.status === 'game in progress' ? roomInfo.botCount || 0 : 0);
        roomInfo.players = playersInRoom;
        if (roomInfo.status === 'game in progress' || roomInfo.status === 'rematch') { return playersInRoom; }

        if (playersInRoom === roomInfo.startingPlayers) {
            roomInfo.status = roomInfo.status === 'game is starting' ? 'game in progress' : 'game is starting';
        }
        else {
            roomInfo.status = playersInRoom > 0 ? 'waiting for players' : 'open';
        }
        return playersInRoom;
    }

    function evictStaleSeat(room, socket) {
        let evicted = false;
        for (let index = playerSockets.length - 1; index >= 0; index -= 1) {
            const seated = playerSockets[index];
            if (seated !== socket && seated.room === room && seated.username === socket.username) {
                seated.replaced = true;
                playerSockets.splice(index, 1);
                evicted = true;
            }
        }
        if (!evicted) { return false; }
        for (let index = joinedPlayers.length - 1; index >= 0; index -= 1) {
            if (joinedPlayers[index].room === room && joinedPlayers[index].username === socket.username) {
                joinedPlayers.splice(index, 1);
            }
        }
        updateLobby(room);
        return true;
    }

    function addSeat(socket, room, color) {
        socket.color = color;
        socket.room = room;
        playerSockets.push(socket);
        joinedPlayers.push({username: socket.username, room: room, color: color});
    }

    function prepareRoomJoin(room, socket) {
        const roomInfo = findRoom(room);
        if (!roomInfo) { return null; }
        evictStaleSeat(room, socket);
        return canTakeSeat(room, socket.username) ? roomInfo : null;
    }

    function joinGame(socket, room, color, settings, allowedColors, allowedMapIds) {
        const roomInfo = findRoom(room);
        const tableIsOpen = roomInfo && (roomInfo.status === 'open' || roomInfo.status === 'waiting for players');
        if (!tableIsOpen || allowedColors.indexOf(color) === -1 || !canTakeSeat(room, socket.username, color) ||
            seatedIn(room).length >= roomInfo.startingPlayers) {
            return null;
        }
        if (roomInfo.host === null) {
            roomInfo.host = socket.username;
            roomInfo.mapId = allowedMapIds.indexOf(settings && settings.mapId) !== -1 ? settings.mapId : 'original';
            roomInfo.allowBots = Boolean(settings && settings.allowBots);
        }
        addSeat(socket, room, color);
        return {roomInfo: roomInfo, waitingPlayers: updateLobby(room)};
    }

    function returnRoom(room, socket, color) {
        evictStaleSeat(room, socket);
        if (!canTakeSeat(room, socket.username, color)) { return false; }
        addSeat(socket, room, color);
        return true;
    }

    function removeJoinedPlayer(socket) {
        const index = joinedPlayers.findIndex((player) => player.username === socket.username && player.room === socket.room);
        if (index !== -1) { joinedPlayers.splice(index, 1); }
    }

    function isUnattended(room) {
        return seatedIn(room).length === 0 && !hasVisitors(room);
    }

    function removeRoom(room) {
        if (!findRoom(room)) { return; }
        clearTimer(cleanupTimers[room]);
        delete cleanupTimers[room];
        const index = lobbyRooms.findIndex((gameRoom) => gameRoom.name === room);
        if (index !== -1) { lobbyRooms.splice(index, 1); }
        destroyGame(room);
        delete rematchVotes[room];
        onRoomRemoved(room);
    }

    function isRunning(game) {
        return Boolean(game && game.isOver && !game.isOver());
    }

    function onlyBotsPlay(game) {
        return Boolean(game && game.hasHumanPlayers && !game.hasHumanPlayers());
    }

    // Bots finish a match nobody is watching at full speed; the room goes once the match is over.
    function playOutWithoutAudience(game) {
        if (game.setFastForward) { game.setFastForward(true); }
    }

    function scheduleRoomCleanup(room) {
        clearTimer(cleanupTimers[room]);
        cleanupTimers[room] = setTimer(() => {
            delete cleanupTimers[room];
            if (!isUnattended(room)) { return; }
            const game = getGame(room);
            if (isRunning(game) && game.replaceAbsentPlayers) {
                game.replaceAbsentPlayers(); // nobody came back in time
                if (isRunning(game)) { return playOutWithoutAudience(game); }
            }
            removeRoom(room);
        }, cleanupDelay);
    }

    // A started table nobody is at: a bot-only match plays out fast, otherwise absent players get a reconnect
    // grace period first. Returns true when the room was removed.
    function releaseIfAbandoned(room) {
        const roomInfo = findRoom(room);
        if (!roomInfo || (roomInfo.status !== 'game in progress' && roomInfo.status !== 'rematch') || !isUnattended(room)) {
            return false;
        }
        const game = getGame(room);
        if (isRunning(game) && onlyBotsPlay(game)) {
            playOutWithoutAudience(game);
            return false;
        }
        scheduleRoomCleanup(room);
        return false;
    }

    // Someone is at the table again, so bots go back to a watchable pace.
    function audienceReturned(room) {
        const game = getGame(room);
        if (game && game.setFastForward) { game.setFastForward(false); }
    }

    function removeSeat(socket) {
        const index = playerSockets.findIndex((player) => player.room === socket.room && player.username === socket.username);
        if (index === -1) { return null; }
        playerSockets.splice(index, 1);
        const roomInfo = findRoom(socket.room);
        if (!roomInfo) { return {roomInfo: null, hostChanged: false, rematchReset: false, remaining: seatedIn(socket.room)}; }

        const room = roomInfo.name;
        const remaining = seatedIn(room);
        roomInfo.players -= 1;
        if (releaseIfAbandoned(room)) {
            return {roomInfo: null, hostChanged: false, rematchReset: false, remaining: remaining};
        }
        let hostChanged = false;
        if (roomInfo.host === socket.username && roomInfo.status !== 'game in progress') {
            roomInfo.host = remaining.length ? remaining[0].username : null;
            hostChanged = true;
        }
        const rematchReset = roomInfo.status === 'rematch';
        if (rematchReset) { delete rematchVotes[room]; }
        return {roomInfo: roomInfo, hostChanged: hostChanged, rematchReset: rematchReset, remaining: remaining};
    }

    // Returns null when the finished match had nobody left to offer a rematch to, and its room was removed.
    function matchFinished(room, playerCount) {
        const roomInfo = findRoom(room);
        if (roomInfo) {
            roomInfo.status = 'rematch';
            roomInfo.players = playerCount === undefined ? seatedIn(room).length : playerCount;
        }
        delete rematchVotes[room];
        if (roomInfo && isUnattended(room)) {
            if (onlyBotsPlay(getGame(room))) {
                removeRoom(room);
                return null;
            }
            scheduleRoomCleanup(room); // a dropped player may still reload into the rematch
        }
        return roomInfo;
    }

    function voteRematch(socket, room, game) {
        const roomInfo = findRoom(room);
        const seatedPlayers = seatedIn(room);
        if (!roomInfo || roomInfo.status !== 'rematch' || !game || !game.isOver() || seatedPlayers.indexOf(socket) === -1) {
            return null;
        }
        rematchVotes[room] = rematchVotes[room] || {};
        rematchVotes[room][socket.username] = true;
        const voters = Object.keys(rematchVotes[room]);
        return {votes: voters.length, required: seatedPlayers.length, voters: voters};
    }

    function beginRematch(room, players) {
        const roomInfo = findRoom(room);
        if (!roomInfo) { return null; }
        delete rematchVotes[room];
        roomInfo.status = 'game in progress';
        roomInfo.botCount = players.filter((player) => player.isBot).length;
        return roomInfo;
    }

    function markBotStart(room) {
        const roomInfo = findRoom(room);
        if (roomInfo) { roomInfo.status = 'starting with bots'; }
        return roomInfo;
    }

    function markBotStartFailed(room, humanCount) {
        const roomInfo = findRoom(room);
        if (roomInfo) {
            roomInfo.status = humanCount === roomInfo.startingPlayers ? 'game is starting' : 'waiting for players';
        }
        return roomInfo;
    }

    function markBotGameStarted(room, playerCount, botCount) {
        const roomInfo = findRoom(room);
        if (roomInfo) {
            roomInfo.status = 'game in progress';
            roomInfo.players = playerCount;
            roomInfo.botCount = botCount;
        }
        return roomInfo;
    }

    function openNewTable(numOfPlayers) {
        const roomInfo = newRoom(numOfPlayers);
        lobbyRooms.push(roomInfo);
        return roomInfo;
    }

    function newRoom(numOfPlayers) {
        return {name: nameGenerator(), players: 0, startingPlayers: numOfPlayers, status: 'open', mapId: 'original', host: null, allowBots: false};
    }

    function createStartingRooms() {
        const rooms = [];
        for (let index = 0; index < 2; index += 1) {
            [2, 3, 4].forEach((numOfPlayers) => {
                let name;
                do {
                    name = options.generateName ? options.generateName() : nameGenerator(rooms);
                }
                while (rooms.some((room) => room.name === name));
                rooms.push({name: name, players: 0, startingPlayers: numOfPlayers, status: 'open', mapId: 'original', host: null, allowBots: false});
            });
        }
        return rooms;
    }

    function nameGenerator(existingRooms = lobbyRooms) {
        const adjectives = ['Doctor', 'Cool', 'Drunken', 'Bloody', 'Lame', 'Rough', 'Happy', 'Sad', 'Crazy', 'Bitter', 'Silent', 'Dark', 'Lingering', 'Shy', 'Psycho', 'Mad', 'Insane'];
        const names = ['Wolf', 'Blackhand', 'Lama', 'Thunder', 'Christ', 'Sloth', 'Grinch', 'Beast', 'Admiral', 'Warrior', 'General', 'Dragonfly', 'Stormrage'];
        let name;
        do {
            name = adjectives[parseInt(Math.random() * adjectives.length)] + '-' + names[parseInt(Math.random() * names.length)];
        }
        while (existingRooms.some((room) => room.name === name));
        return name;
    }

    return {
        getRooms: () => lobbyRooms,
        getJoinedPlayers: () => joinedPlayers,
        findRoom: findRoom,
        seatedIn: seatedIn,
        findSeatedPlayer: (room, username) => playerSockets.find((player) => player.username === username && player.room === room),
        canTakeSeat: canTakeSeat,
        prepareRoomJoin: prepareRoomJoin,
        joinGame: joinGame,
        returnRoom: returnRoom,
        removeJoinedPlayer: removeJoinedPlayer,
        removeSeat: removeSeat,
        updateLobby: updateLobby,
        matchFinished: matchFinished,
        voteRematch: voteRematch,
        beginRematch: beginRematch,
        markBotStart: markBotStart,
        markBotStartFailed: markBotStartFailed,
        markBotGameStarted: markBotGameStarted,
        openNewTable: openNewTable,
        scheduleRoomCleanup: scheduleRoomCleanup,
        releaseIfAbandoned: releaseIfAbandoned,
        audienceReturned: audienceReturned,
        removeRoom: removeRoom
    };
}

module.exports = {createRoomLifecycle: createRoomLifecycle};