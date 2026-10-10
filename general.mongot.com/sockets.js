'use strict';

let GameBoard = require('./game/GameBoard');
let BotPlayer = require('./game/BotPlayer');
let countryHandler = require('./game/countryHandler');
let identity = require('./game/identity');
let rating = require('./game/rating');
let models = require('../models');
let mongoose = require('mongoose');
const { Server } = require('socket.io');
let io;
let fs = require('fs');
let lobbyChat = require('./lobbyChat.json');
let gameChat = require('./gameChat.json');
let lobbyRooms = [];
let joinedPlayers = [];
let playerSockets = [];
let newGames = [];
let rematchVotes = {};
let colors = ['red', 'blue', 'orange', 'green', 'purple', 'black'];
let botProfiles = require('./game/botProfiles');
let gameInfra;
let chatCom;
let lobbyCom;

for(let i = 0; i<2; i += 1){
    [2, 3, 4].forEach((numOfPlayers) => lobbyRooms.push(newRoom(numOfPlayers)));
}

exports.returnRoom = (room, socket, color) => { // If player returns after disconnection
    evictStaleSeat(room, socket);
    if (canTakeSeat(room, socket.username, color)) {
        socket.color = color;
        socket.room = room;
        joinedPlayers.push({username: socket.username, room: room, color: color});
        playerSockets.push(socket);
        gameInfra.to(room).emit("list_of_players", updatePlayerListInRoom(room));

        updateLobby(room);
        broadcastRooms();
    }
}

exports.updatePlayerList = (room, usernames) => { // Update playerlist in room and lobbyrooms
    // Ratings are reloaded after the game's own database writes have had time to land; tests have no database.
    if (process.env.NODE_ENV !== 'test') { setTimeout(() => refreshRatings(room, usernames), 400); }

    let roomInfo = findRoom(room);
    if (roomInfo) {
        roomInfo.status = 'rematch';
        roomInfo.players = newGames[room] ? newGames[room].getPlayerCount() : seatedIn(room).length;
    }
    delete rematchVotes[room];
    broadcastRooms();
    if (newGames[room]) {
        gameInfra.in(room).emit('list_of_players', newGames[room].getRoomPlayers());
    }
}

const lobbyHooks = {returnRoom: exports.returnRoom, updatePlayerList: exports.updatePlayerList};

// Reloads the players' stored ratings after a match, then refreshes the room's player list.
function refreshRatings(room, usernames) {
    let loaded = 0;
    usernames.forEach((username) => {
        models.User.findOne({username: username}, function(err, user) {
            const seated = user && playerSockets.find((player) => player.username === user.username && player.room === room);
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
        socket.on('join_game', (room, color, settings) => joinGame(socket, room, color, settings));
        socket.on('countdown_finished', (room) => startCountedDownGame(room));
        socket.on('start_with_bots', (room) => startWithBots(socket, room));
        socket.on('rematch', (room) => voteRematch(socket, room));
        socket.on('god_mode', (data) => godMode(socket, data));
        socket.on('visitor', (room) => showGameToVisitor(socket, room));
        socket.on('get_rooms', () => socket.emit('rooms_list', lobbyRooms, joinedPlayers));
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
    const roomInfo = findRoom(room);
    if (!roomInfo) { return; }
    evictStaleSeat(room, socket);
    if (!canTakeSeat(room, socket.username)) { return; }

    socket.join(room);
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

function joinGame(socket, room, color, settings) {
    const roomInfo = findRoom(room);
    const tableIsOpen = roomInfo && (roomInfo.status === 'open' || roomInfo.status === 'waiting for players');
    if (!tableIsOpen || colors.indexOf(color) === -1 || !canTakeSeat(room, socket.username, color) ||
        seatedIn(room).length >= roomInfo.startingPlayers) {        return;
    }
    if (roomInfo.host === null) {
        roomInfo.host = socket.username;
        roomInfo.mapId = countryHandler.list().some((map) => map.id === (settings && settings.mapId)) ? settings.mapId : 'original';
        roomInfo.allowBots = Boolean(settings && settings.allowBots);
    }
    socket.color = color;
    socket.room = room;
    playerSockets.push(socket);
    joinedPlayers.push({username: socket.username, room: room, color: color});

    const playerList = updatePlayerListInRoom(room);
    gameInfra.to(room).emit('list_of_players', playerList);
    gameInfra.to(room).emit('remove_color_popup', playerList);

    const waitingPlayers = updateLobby(room);
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
    const roomInfo = findRoom(room);
    if (!roomInfo || newGames[room] !== undefined) { return; }
    if (updateLobby(room) !== roomInfo.startingPlayers) {
        gameInfra.to(room).emit('game_countdown', false);
        return;
    }
    openNewTable(roomInfo.startingPlayers);
    startGame(roomInfo, seatedIn(room));
}

async function startWithBots(socket, room) {
    const roomInfo = findRoom(room);
    const humanSockets = seatedIn(room);
    if (!roomInfo || !roomInfo.allowBots || roomInfo.host !== socket.username ||
        roomInfo.status === 'game in progress' || roomInfo.status === 'starting with bots' ||
        humanSockets.length === 0 || humanSockets.length >= roomInfo.startingPlayers ||
        humanSockets.indexOf(socket) === -1 || newGames[room] !== undefined) {
        return;
    }

    roomInfo.status = 'starting with bots';
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
        roomInfo.status = 'game in progress';
        roomInfo.botCount = botSockets.length;
        gameInfra.in(room).emit('clear_game_countdown');
        gameInfra.in(room).emit('remove_color_popup_box');
        const game = startGame(roomInfo, allPlayers);
        roomInfo.players = allPlayers.length;
        gameInfra.in(room).emit('list_of_players', game.getRoomPlayers());
        broadcastRooms();
    }
    catch (error) {
        roomInfo.status = humanSockets.length === roomInfo.startingPlayers ? 'game is starting' : 'waiting for players';
        gameInfra.in(room).emit('message', {type: 'serverMessage', message: 'Could not start the bot match. Please try again.'});
    }
}

function voteRematch(socket, room) {
    const roomInfo = findRoom(room);
    const game = newGames[room];
    const seatedPlayers = seatedIn(room);
    if (!roomInfo || roomInfo.status !== 'rematch' || !game || !game.isOver() || seatedPlayers.indexOf(socket) === -1) {
        return;
    }

    rematchVotes[room] = rematchVotes[room] || {};
    rematchVotes[room][socket.username] = true;
    const votes = Object.keys(rematchVotes[room]).length;
    gameInfra.in(room).emit('rematch_status', {
        votes: votes,
        required: seatedPlayers.length,
        voters: Object.keys(rematchVotes[room])
    });
    if (votes < seatedPlayers.length) { return; }
    const rematchPlayers = game.getRematchPlayers(seatedPlayers);
    if (rematchPlayers.length < 2) { return; }

    // The finished board registered these listeners on each human socket.
    ['next_turn', 'deploy', 'battle', 'tactical_move', 'everyone_deploy', 'surrender'].forEach((eventName) => {
        seatedPlayers.forEach((player) => player.removeAllListeners(eventName));
    });
    delete rematchVotes[room];
    roomInfo.status = 'game in progress';
    gameInfra.in(room).emit('rematch_started');
    roomInfo.botCount = rematchPlayers.filter((player) => player.isBot).length;
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

    socket.emit('start_countdown');
    socket.emit('map_info', board.getMapInfo());
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
    const room = socket.room;
    if (socket.replaced || !socket.rooms.has(room)) { return; } // replaced: a newer socket of the same player took over

    const joinedIndex = joinedPlayers.findIndex((player) => player.username === socket.username && player.room === room);
    if (joinedIndex !== -1) { joinedPlayers.splice(joinedIndex, 1); }
    socket.leave(room);
    if (newGames[room]) { newGames[room].playerDisconnected(socket); }

    const seatIndex = playerSockets.findIndex((player) => player.room === room && player.username === socket.username);
    const roomInfo = findRoom(room);
    if (seatIndex !== -1) {
        playerSockets.splice(seatIndex, 1);
        if (roomInfo) { releaseSeat(roomInfo, socket.username); }
    }
    socket.to(room).emit('list_of_players', updatePlayerListInRoom(room));
    updateLobby(room);
    broadcastRooms();
}

// After a seated player leaves: clean up an abandoned game, hand over hosting, and restart any rematch vote.
function releaseSeat(roomInfo, username) {
    const room = roomInfo.name;
    const remaining = seatedIn(room);
    roomInfo.players -= 1;
    if (remaining.length === 0 && (roomInfo.status === 'game in progress' || roomInfo.status === 'rematch')) {
        scheduleRoomCleanup(room); // keep the table briefly so a reload or dropped player can come back
    }
    else if (roomInfo.host === username && roomInfo.status !== 'game in progress') {
        roomInfo.host = remaining.length ? remaining[0].username : null;
        gameInfra.to(room).emit('message', roomSettingsMessage(roomInfo));
    }
    if (roomInfo.status === 'rematch') {
        delete rematchVotes[room];
        gameInfra.in(room).emit('rematch_status', {votes: 0, required: remaining.length, voters: []});
    }
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

function findRoom(room) {
    return lobbyRooms.find((gameRoom) => gameRoom.name === room);
}

function seatedIn(room) {
    return playerSockets.filter((player) => player.room === room);
}

function broadcastRooms() {
    gameInfra.emit('rooms_list', lobbyRooms, joinedPlayers);
}

function newRoom(numOfPlayers) {
    return {name: nameGenerator(), players: 0, startingPlayers: numOfPlayers, status: 'open', mapId: 'original', host: null, allowBots: false};
}

// Starting a table's game puts a fresh empty table of the same size in the lobby.
function openNewTable(numOfPlayers) {
    lobbyRooms.push(newRoom(numOfPlayers));
    broadcastRooms();
}

function startGame(roomInfo, players) {
    newGames[roomInfo.name] = new GameBoard.GameBoard(players, io, roomInfo.name, roomInfo.mapId, lobbyHooks);
    return newGames[roomInfo.name];
}

function saveChat(file, messages) {
    fs.writeFile(file, JSON.stringify(messages), (error) => { });
}

function roomSettingsMessage(roomInfo) {
    return {type: 'room_settings', mapId: roomInfo.mapId, allowBots: roomInfo.allowBots, host: roomInfo.host, status: roomInfo.status};
}

const ROOM_CLEANUP_DELAY = Number(process.env.ROOM_CLEANUP_DELAY_MS) || 30000;
let cleanupTimers = {};

function scheduleRoomCleanup(room) {
    clearTimeout(cleanupTimers[room]);
    cleanupTimers[room] = setTimeout(() => {
        delete cleanupTimers[room];
        if (seatedIn(room).length > 0) { return; }
        const index = lobbyRooms.findIndex((gameRoom) => gameRoom.name === room);
        if (index !== -1) { lobbyRooms.splice(index, 1); }
        if (newGames[room]) { newGames[room].destroy(); }
        delete newGames[room];
        delete rematchVotes[room];
        broadcastRooms();
    }, ROOM_CLEANUP_DELAY);
}

function updatePlayerListInRoom(room) {
    const seated = seatedIn(room);
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

// Recounts a table and moves it between open, waiting and starting; running games and rematches keep their status.
function updateLobby(room) {
    const humans = seatedIn(room).length;
    const roomInfo = findRoom(room);
    if (!roomInfo) { return humans; }
    const playersInRoom = roomInfo.status === 'rematch' && newGames[room] ?
        newGames[room].getPlayerCount() :
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

// A reconnecting player's old socket can outlive the drop until the ping timeout.
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
    if (!evicted) { return; }
    for (let index = joinedPlayers.length - 1; index >= 0; index -= 1) {
        if (joinedPlayers[index].room === room && joinedPlayers[index].username === socket.username) {
            joinedPlayers.splice(index, 1);
        }
    }
    updateLobby(room);
}

// A seat is free when the room exists and neither this player nor this colour is already seated there.
function canTakeSeat(room, username, color) {
    return Boolean(findRoom(room)) && !seatedIn(room).some((player) => player.username === username || player.color === color);
}

function nameGenerator(){
    let adjectives = ["Doctor","Cool","Drunken","Bloody","Lame","Rough","Happy","Sad","Crazy","Bitter","Silent","Dark","Lingering","Shy","Psycho","Mad","Insane"];
    let animals = ["Wolf","Blackhand","Lama","Thunder","Christ","Sloth","Troll","Grinch","Beast","Admiral","Warrior","General","Dragonfly","Stormrage"];
    let name
    do{
        let randomNumber1 = parseInt(Math.random() * adjectives.length);
        let randomNumber2 = parseInt(Math.random() * animals.length);
        name = adjectives[randomNumber1] + "-" + animals[randomNumber2];
    }
    while (findRoom(name));

    return name;
}