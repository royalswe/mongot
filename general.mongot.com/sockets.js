'use strict';

let GameBoard = require('./game/GameBoard');
let BotPlayer = require('./game/BotPlayer');
let countryHandler = require('./game/countryHandler');
let identity = require('./game/identity');
let rating = require('./game/rating');
const {createRoomLifecycle} = require('./game/roomLifecycle');
let models = require('../models');
let mongoose = require('mongoose');
const { Server } = require('socket.io');
let io;
let fs = require('fs');
let lobbyChat = require('./lobbyChat.json');
let gameChat = require('./gameChat.json');
let newGames = [];
let colors = ['red', 'blue', 'orange', 'green', 'purple', 'black'];
let botProfiles = require('./game/botProfiles');
let gameInfra;
let chatCom;
let lobbyCom;
const roomLifecycle = createRoomLifecycle({
    getGame: (room) => newGames[room],
    destroyGame: (room) => {
        if (newGames[room]) { newGames[room].abandon(); } // charges a loss if the match never finished
        delete newGames[room];
    },
    onRoomRemoved: broadcastRooms,
    hasVisitors: (room) => {
        const members = gameInfra && gameInfra.adapter.rooms.get(room);
        return Boolean(members && members.size > 0);
    }
});

exports.returnRoom = (room, socket, color) => { // If player returns after disconnection
    if (!roomLifecycle.returnRoom(room, socket, color)) { return; }
    gameInfra.to(room).emit("list_of_players", updatePlayerListInRoom(room));
    roomLifecycle.updateLobby(room);
    broadcastRooms();
}

exports.updatePlayerList = (room, usernames) => { // Update playerlist in room and lobbyrooms
    // Ratings are reloaded after the game's own database writes have had time to land; tests have no database.
    if (process.env.NODE_ENV !== 'test') { setTimeout(() => refreshRatings(room, usernames), 400); }

    roomLifecycle.matchFinished(room, newGames[room] ? newGames[room].getPlayerCount() : undefined);
    broadcastRooms();
    if (newGames[room]) {
        gameInfra.in(room).emit('list_of_players', newGames[room].getRoomPlayers());
    }
}

const lobbyHooks = {
    returnRoom: exports.returnRoom,
    updatePlayerList: exports.updatePlayerList,
    matchAbandoned: (room) => roomLifecycle.removeRoom(room)
};

// Reloads the players' stored ratings after a match, then refreshes the room's player list.
function refreshRatings(room, usernames) {
    let loaded = 0;
    usernames.forEach((username) => {
        models.User.findOne({username: username}, function(err, user) {
            const seated = user && roomLifecycle.findSeatedPlayer(room, user.username);
            if (seated) { seated.points = user.points_general; }
            loaded += 1;
            if (loaded === usernames.length) {
                gameInfra.in(room).emit('list_of_players', updatePlayerListInRoom(room));
            }
        });
    });
}

// Identity is set before any event is handled and only ever comes from the login cookie.
function authenticate(socket, next) {
    // v2 clients (tabs opened before the upgrade) still send the guest id as a query parameter.
    const guestId = (socket.handshake.auth && socket.handshake.auth.guestId) || socket.handshake.query.guestId;
    identity.resolve(socket.request.headers.cookie, guestId, socket.id).then((who) => {
        socket.isGuest = who.isGuest;
        socket.isUnverified = who.isUnverified; // can play, but never changes or earns rank
        socket.isGod = who.isGod;
        socket.username = who.username;
        socket.points = who.points;
        socket.ip = who.ip;
        next();
    }).catch(next);
}

// A player's game and chat sockets travel on one client connection, so they share client.id.
function siblingSocket(namespace, socket) {
    for (const candidate of namespace.sockets.values()) {
        if (candidate.client.id === socket.client.id) { return candidate; }
    }
    return null;
}

exports.initialize = (server) => {
    // allowEIO3 lets tabs still running the old client reconnect after the upgrade; drop it once they are gone.
    io = new Server(server, {allowEIO3: true});

    gameInfra = io.of('/game_infra');
    gameInfra.use(authenticate);
    gameInfra.on('connection', (socket) => {
        socket.on('player_ready', () => greetPlayer(socket));
        socket.on('dice_log_room', (room) => socket.join(room));
        socket.on('join_room', (room) => joinRoom(socket, room));
        socket.on('preview_map', (room, mapId) => previewMap(socket, room, mapId));
        socket.on('join_game', (room, color, settings) => joinGame(socket, room, color, settings));
        socket.on('countdown_finished', (room) => startCountedDownGame(room));
        socket.on('start_with_bots', (room) => startWithBots(socket, room));
        socket.on('rematch', (room) => voteRematch(socket, room));
        socket.on('god_mode', (data) => godMode(socket, data));
        socket.on('visitor', (room) => showGameToVisitor(socket, room));
        socket.on('get_rooms', () => socket.emit('rooms_list', roomLifecycle.getRooms(), roomLifecycle.getJoinedPlayers()));
        // 'disconnecting' fires while the socket is still in its rooms, and leaves socket.io's own cleanup intact.
        socket.on('disconnecting', () => leaveTable(socket));
    });

    chatCom = io.of('/chat_com');
    chatCom.on('connection', (socket) => {
        socket.on('message', (msg) => relayGameChat(socket, msg));
        // The game socket may already be gone here, so the name was kept on this socket when it joined.
        socket.on('disconnecting', () => {
            if (!socket.room || !socket.playerName) { return; }
            socket.to(socket.room).emit('player_left', socket.playerName);
        });
    });

    lobbyCom = io.of('/lobby_com');
    lobbyCom.use(authenticate);
    lobbyCom.on('connection', (socket) => {
        socket.on('disconnect', broadcastUsersOnline);
        socket.on('message', (msg) => relayLobbyChat(socket, msg));
        socket.on('remove_message', (index) => removeLobbyMessage(socket, index));
        socket.on('player_joined', () => {
            if (!socket.isGuest) {
                socket.broadcast.emit('user_notification', socket.username + ' arrived to the lobby');
            }
            socket.emit('render_messages', lobbyChat);
            broadcastUsersOnline();
        });
    });
};

function greetPlayer(socket) {
    socket.send({type: 'identity', username: socket.username, isGuest: socket.isGuest, isUnverified: socket.isUnverified});
    socket.send({
        type: 'serverMessage',
        message: socket.isGuest ? 'Welcome ' + socket.username + '. You are playing as a guest, so your games are unranked. Log in to earn rank.' :
            socket.isUnverified ? 'Welcome ' + socket.username + '. Your email is not verified, so your games are unranked until you verify it.' :
            'Welcome ' + socket.username
    });
}

function joinRoom(socket, room) {
    const roomInfo = roomLifecycle.prepareRoomJoin(room, socket);
    if (!roomInfo) { return; }

    socket.join(room);
    roomLifecycle.audienceReturned(room);
    socket.watching = room; // spectators have no seat, so socket.room alone cannot tell which table they leave
    socket.send(roomSettingsMessage(roomInfo));
    const playerList = updatePlayerListInRoom(room);
    socket.emit('list_of_players', playerList);
    socket.emit('map_info', countryHandler.getMap(roomInfo.mapId));
    // Everyone can watch and chat; a colour is only offered while the table is open.
    if (roomInfo.status === 'open' || roomInfo.status === 'waiting for players') {
        socket.emit('choose_color', playerList, colors, {
            maps: countryHandler.list(),
            mapId: roomInfo.mapId,
            allowBots: roomInfo.allowBots,
            isHost: roomInfo.host === null
        });
    }

    const comSocket = siblingSocket(chatCom, socket);
    if (comSocket) {
        comSocket.join(room);
        comSocket.room = room;
        comSocket.playerName = socket.username;
    }
    socket.to(room).emit('message', {type: 'serverMessage', message: socket.username + ' has joined the room.'});
}

function previewMap(socket, room, mapId) {
    const roomInfo = roomLifecycle.findRoom(room);
    const tableIsWaiting = roomInfo && (roomInfo.status === 'open' || roomInfo.status === 'waiting for players');
    const isHost = roomInfo && (roomInfo.host === null || roomInfo.host === socket.username);
    if (!tableIsWaiting || !isHost || !socket.rooms.has(room)) { return; }

    const map = countryHandler.list().find((candidate) => candidate.id === mapId);
    if (map) { socket.emit('map_info', countryHandler.getMap(map.id)); }
}

function joinGame(socket, room, color, settings) {
    const result = roomLifecycle.joinGame(socket, room, color, settings, colors, countryHandler.list().map((map) => map.id));
    if (!result) { return; }
    const roomInfo = result.roomInfo;

    const playerList = updatePlayerListInRoom(room);
    gameInfra.to(room).emit('list_of_players', playerList);
    gameInfra.to(room).emit('remove_color_popup', playerList);

    const waitingPlayers = result.waitingPlayers;
    gameInfra.to(room).emit('map_info', countryHandler.getMap(roomInfo.mapId));
    gameInfra.to(room).emit('message', roomSettingsMessage(roomInfo));
    broadcastRooms();

    if (waitingPlayers === roomInfo.startingPlayers) {
        gameInfra.to(room).emit('clear_game_countdown');
        gameInfra.to(room).emit('remove_color_popup_box');
        gameInfra.to(room).emit('game_countdown', true);
    }
}

function startCountedDownGame(room) {
    const roomInfo = roomLifecycle.findRoom(room);
    if (!roomInfo || newGames[room] !== undefined) { return; }
    if (roomLifecycle.updateLobby(room) !== roomInfo.startingPlayers) {
        gameInfra.to(room).emit('game_countdown', false);
        return;
    }
    openNewTable(roomInfo.startingPlayers);
    startGame(roomInfo, roomLifecycle.seatedIn(room));
}

async function startWithBots(socket, room) {
    const roomInfo = roomLifecycle.findRoom(room);
    const humanSockets = roomLifecycle.seatedIn(room);
    if (!roomInfo || !roomInfo.allowBots || roomInfo.host !== socket.username ||
        roomInfo.status === 'game in progress' || roomInfo.status === 'starting with bots' ||
        humanSockets.length === 0 || humanSockets.length >= roomInfo.startingPlayers ||
        humanSockets.indexOf(socket) === -1 || newGames[room] !== undefined) {
        return;
    }

    roomLifecycle.markBotStart(room);
    const availableColors = colors.filter((color) => !humanSockets.some((player) => player.color === color));
    const botSockets = [];
    try {
        const botsNeeded = roomInfo.startingPlayers - humanSockets.length;
        for (let index = 0; index < botsNeeded; index += 1) {
            const definition = botProfiles[index % botProfiles.length];
            const profile = mongoose.connection.readyState === 1 ? (await models.Bot.findOneAndUpdate(
                {key: definition.key},
                {$setOnInsert: {username: definition.username, points_general: definition.points_general}},
                {new: true, upsert: true, setDefaultsOnInsert: true}
            ).exec()).toObject() : {};
            botSockets.push(new BotPlayer(
                Object.assign({}, definition, profile, {aggression: definition.aggression}),
                humanSockets.length + index,
                availableColors[index]
            ));
        }

        const allPlayers = humanSockets.concat(botSockets);
        openNewTable(roomInfo.startingPlayers); // same replacement table a normal start creates
        gameInfra.in(room).emit('clear_game_countdown');
        gameInfra.in(room).emit('remove_color_popup_box');
        const game = startGame(roomInfo, allPlayers);
        roomLifecycle.markBotGameStarted(room, allPlayers.length, botSockets.length);
        gameInfra.in(room).emit('list_of_players', game.getRoomPlayers());
        broadcastRooms();
    }
    catch (error) {
        roomLifecycle.markBotStartFailed(room, humanSockets.length);
        gameInfra.in(room).emit('message', {type: 'serverMessage', message: 'Could not start the bot match. Please try again.'});
    }
}

function voteRematch(socket, room) {
    const roomInfo = roomLifecycle.findRoom(room);
    const game = newGames[room];
    const vote = roomLifecycle.voteRematch(socket, room, game);
    if (!vote) { return; }
    const seatedPlayers = roomLifecycle.seatedIn(room);
    gameInfra.in(room).emit('rematch_status', vote);
    if (vote.votes < vote.required) { return; }
    const rematchPlayers = game.getRematchPlayers(seatedPlayers);
    if (rematchPlayers.length < 2) { return; }

    // The finished board registered these listeners on each human socket.
    ['next_turn', 'deploy', 'battle', 'tactical_move', 'everyone_deploy', 'surrender'].forEach((eventName) => {
        seatedPlayers.forEach((player) => player.removeAllListeners(eventName));
    });
    if (!roomLifecycle.beginRematch(room, rematchPlayers)) { return; }
    gameInfra.in(room).emit('rematch_started');
    startGame(roomInfo, rematchPlayers);
    broadcastRooms();
}

function godMode(socket, data) {
    if (!socket.isGod || !data) { return; }
    if (data.type === 'kick_player' && newGames[data.room] !== undefined) {
        newGames[data.room].kickoutPlayer(data.player);
        gameInfra.in(data.room).emit('message', {type: 'serverMessage', message: socket.username + ' kicked ' + data.player + ' from the game'});
    }
}

// Brings a spectator (or a returning player) up to date with a game in progress.
function showGameToVisitor(socket, room) {
    const board = newGames[room];
    if (board === undefined) { return; }
    const game = board.getGameInfo();

    socket.emit('start_countdown', {
        deadline: game.phaseDeadline,
        serverTime: Date.now()
    });
    socket.emit('map_info', board.getMapInfo());
    socket.emit('action_history', game.actionHistory);
    if (game.phase === 'Everyone deploy') {
        socket.emit('render_no_army_map', game.playerList);
    }
    else {
        if (game.disabledCountries !== undefined) {
            socket.emit('render_disabled_countries', game.disabledCountries);
        }
        socket.emit('render_map', game.playerList);
    }
    socket.send({type: 'phase', message: game.phase, phaseMsg: "Welcome! You are a guest in this room"});

    if (game.ap !== undefined) {
        socket.send({
            type: 'current_player',
            bool: false,
            player: game.ap,
            username: game.playerList[game.ap].username,
            color: game.playerList[game.ap].color
        });
    }
    board.returningPlayer(socket);
}

function leaveTable(socket) {
    const room = socket.room || socket.watching;
    if (socket.replaced || !socket.rooms.has(room)) { return; } // replaced: a newer socket of the same player took over

    roomLifecycle.removeJoinedPlayer(socket);
    socket.leave(room);
    if (newGames[room]) { newGames[room].playerDisconnected(socket); }

    const departure = roomLifecycle.removeSeat(socket);
    if (!departure) { roomLifecycle.releaseIfAbandoned(room); } // the last spectator of a bot-only game
    if (departure && departure.roomInfo) {
        if (departure.hostChanged) {
            gameInfra.to(room).emit('message', roomSettingsMessage(departure.roomInfo));
        }
        if (departure.rematchReset) {
            gameInfra.in(room).emit('rematch_status', {votes: 0, required: departure.remaining.length, voters: []});
        }
    }
    socket.to(room).emit('list_of_players', updatePlayerListInRoom(room));
    roomLifecycle.updateLobby(room);
    broadcastRooms();
}

// Chat arrives as a JSON string from the browser; anything malformed is dropped instead of crashing the server.
function parseChatMessage(raw) {
    if (typeof raw !== 'string') { return null; }
    try {
const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.message !== 'string') { return null; }
        const escaped = parsed.message.replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
        return {type: parsed.type, message: escaped};
    }
    catch (error) {
        return null;
    }
}

function relayGameChat(socket, raw) {
    const message = parseChatMessage(raw);
    if (!message || message.type !== 'userMessage') { return; }
    const player = siblingSocket(gameInfra, socket);
    if (!player) { return; }
    message.color = player.color;
    message.username = player.username;
    message.room = socket.room;

    gameChat.push(message);
    saveChat('gameChat.json', gameChat);

    socket.to(socket.room).emit('message', JSON.stringify(message));
    message.type = 'myMessage';
    socket.send(JSON.stringify(message));
}

function relayLobbyChat(socket, raw) {
    const message = parseChatMessage(raw);
    if (!message || message.type !== 'userMessage') { return; }
    message.username = socket.username;
    message.timeStamp = Date.now();

    lobbyChat.push(message);
    if (lobbyChat.length > 80) { lobbyChat.shift(); }
    message.index = lobbyChat.length - 1;

    saveChat('lobbyChat.json', lobbyChat);

    socket.broadcast.emit('message', JSON.stringify(message));
    message.type = 'myMessage';
    socket.send(JSON.stringify(message));
}

function removeLobbyMessage(socket, index) {
    if (!socket.isGod || !Number.isInteger(index) || index < 0 || index >= lobbyChat.length) { return; }
    lobbyChat.splice(index, 1);
    saveChat('lobbyChat.json', lobbyChat);
    lobbyCom.emit('render_messages', lobbyChat);
}

function broadcastUsersOnline() {
    const usersOnline = [];
    let guests = 0;
    lobbyCom.sockets.forEach((lobbySocket) => {
        if (lobbySocket.isGuest) {
            guests += 1;
        }
        else if (lobbySocket.username && !usersOnline.some((online) => online.username === lobbySocket.username)) {
            usersOnline.push({username: lobbySocket.username, activated: !lobbySocket.isUnverified, points: lobbySocket.points});
        }
    });
    lobbyCom.emit('users_online', usersOnline, guests);
}

function broadcastRooms() {
    gameInfra.emit('rooms_list', roomLifecycle.getRooms(), roomLifecycle.getJoinedPlayers());
}

// Starting a table's game puts a fresh empty table of the same size in the lobby.
function openNewTable(numOfPlayers) {
    roomLifecycle.openNewTable(numOfPlayers);
    broadcastRooms();
}

function startGame(roomInfo, players) {
    newGames[roomInfo.name] = new GameBoard.GameBoard(players, io, roomInfo.name, roomInfo.mapId, lobbyHooks, {allowBots: roomInfo.allowBots});
    return newGames[roomInfo.name];
}

function saveChat(file, messages) {
    fs.writeFile(file, JSON.stringify(messages), (error) => { });
}

function roomSettingsMessage(roomInfo) {
    return {type: 'room_settings', mapId: roomInfo.mapId, allowBots: roomInfo.allowBots, host: roomInfo.host, status: roomInfo.status};
}

function updatePlayerListInRoom(room) {
    const seated = roomLifecycle.seatedIn(room);
    const matchRanked = newGames[room] ? newGames[room].isRankedMatch() : rating.isRankedMatch(seated);
    const players = seated.map((player) => ({
        username: player.username,
        points: player.points,
        color: player.color,
        ip: player.ip,
        isBot: Boolean(player.isBot),
        isGuest: Boolean(player.isGuest),
        isUnverified: Boolean(player.isUnverified),
        matchRanked: matchRanked
    }));
    if (newGames[room]) {
        players.push(...newGames[room].getRoomPlayers().filter((participant) => participant.isBot));
    }
    return players;
}
