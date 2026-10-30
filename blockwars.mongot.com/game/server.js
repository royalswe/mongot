"use strict";
const WebSocket = require('ws');
const Session = require('./session');
const Client = require('./client');
const fs = require('fs');
const chatFiles = require('./chat-files');
const gameChat = require(chatFiles.game);
const lobbyChat = require(chatFiles.lobby);
const sessions = new Map();
const Lobby = new(require('./lobby'))();
const Status = require('./status');
const Bot = require('./ai/bot.js');
const config = require('../config.json');

const DOMAIN = process.env.DOMAIN || config.DOMAIN;

let BOT_COUNT = 0;

const GAME_MESSAGES = new Set(['enter-room', 'take-seat', 'player-ready', 'state-update', 'state-lost', 'state-chat', 'add-special', 'use-special', 'arena-bounce']);

function createId() {
    const chars = 'abcdefghjkmnopqrstxz0123456789';
    let len = 6;
    let id = '';
    while (len--) {
        id += chars[Math.random() * chars.length | 0];
    }
    return id;
}

function createClient(socket, id = createId()) {
    return new Client(socket, id);
}

function createSession({name, ranking}) {
    if (sessions.has(name)) {
        console.log(name, 'allready exists (server.js, createSession)');
    }
    ranking = ranking === "yes" ? "yes" : "no"; // default is not ranked

    const session = new Session({name, ranking}, {onChange: broadcastRooms});
    sessions.set(name, session);
    return session;
}

function getSession({name}) {
    return sessions.get(name);
}

function isGuest(client) {
    if (client.session.ranking === "yes" && client.points === null) {
        return true; // ranking games are not available for guests
    }
    return false;
}

function broadcastRooms() {
    Lobby.roomEmit(updateRooms());
}

function updateRooms() {
    let openRankedGames = 0;
    let openUnRankedGames = 0;
    for (const session of sessions) { // loop trough rooms to see if more rooms needed
        if (session[1].status === Status.session.waiting) {
            if (session[1].ranking === "yes") {
                openRankedGames++;
            } else {
                openUnRankedGames++;
            }
        }
    }
    if (openRankedGames < 2) {
        createSession({
            name: nameGenerator(),
            ranking: "yes"
        });
    }
    if (openUnRankedGames < 2) {
        createSession({
            name: nameGenerator(),
            ranking: "no"
        });
    }
    const rooms = [];
    for (const session of sessions) {
        const clients = [];
        const activeClients = [];
        for (const client of session[1].clients) {
            clients.push({name: client.id, points: client.points});
            if (client.state !== null) {
                activeClients.push(client.id);
            }
        }

        rooms.push({
            players: clients,
            activePlayers: activeClients,
            status: session[1].status,
            ranking: session[1].ranking,
            name: session[0]
        });
    }
    return {
        type: 'render_rooms',
        rooms
    };
}

function nameGenerator() {
    const adjectives = ["Doctor", "Cool", "Drunken", "Bloody", "Lame", "Rough", "Happy", "Sad", "Crazy", "Bitter", "Silent", "Dark", "Lingering", "Shy", "Psycho", "Mad", "Insane"];
    const animals = ["Wolf", "Blackhand", "Liama", "Thunder", "Christ", "Sloth", "Troll", "Grinch", "Beast", "Admiral", "Warrior", "General", "Dragonfly", "Stormrage"];
    let name;
    do {
        const randomNumber1 = parseInt(Math.random() * adjectives.length);
        const randomNumber2 = parseInt(Math.random() * animals.length);
        name = adjectives[randomNumber1] + "-" + animals[randomNumber2];
    }
    while (sessions.has(name));

    return name;
}

exports.initialize = (server, { notifications } = {}) => {

    const wsLobby = new WebSocket.Server({
        noServer: true,
        path:"/lobby"
    });

    wsLobby.on('error', () => console.log('wsLobby errored'));

    wsLobby.on('connection', (socket) => {
        
        Lobby.join(socket);

        socket.isAlive = true;
        socket.on('pong', () => { socket.isAlive = true; });

        socket.on('message', msg => {
            const data = JSON.parse(msg);
            if (data.type === "init_lobby") {
                if (socket.username) { return; }
                broadcastRooms();
                const randomNr = Math.floor(1000 + Math.random() * 9000);
                socket.username = (data.user === 'guest') ? 'guest' + randomNr : data.user.username;
                socket.points = (data.user === 'guest') ? null : data.user.points_bw;
                Lobby.broadcast(socket, {
                    type: 'user_notification',
                    msg: socket.username + ' arrived to the lobby'
                });
                const alreadyPresent = [...Lobby.clients].some(client =>
                    client !== socket && client.username === socket.username);
                if (notifications && !alreadyPresent) {
                    notifications.notifyArrival(socket.username).catch(error =>
                        console.error('Failed to send lobby arrival notifications:', error.message));
                }

                Lobby.send(socket, {
                    type: 'render_messages',
                    messages: lobbyChat
                });

                updateLobbyList();
            } else if (data.type === "userMessage") {
                const timeStamp = new Date().getTime();
                let message = JSON.stringify(data).replace(/</g, "&lt;").replace(/>/g, "&gt;"); // remove scripts
                message = JSON.parse(message);
                message.username = data.user; //(data.user === 'guest') ? 'guest' : data.user.username;
                message.timeStamp = timeStamp;
                message.index = lobbyChat.length;

                lobbyChat.push(message);
                if (lobbyChat.length > 80) {
                    lobbyChat.shift();
                }
                fs.writeFile(chatFiles.lobby, JSON.stringify(lobbyChat), err => {
                    if (err) { console.error('Failed to save lobby chat:', err); }
                });

                Lobby.roomEmit({
                    type: data.type,
                    message: message
                });
            } else if (data.type === 'remove_message') {
                if (!data.god) {
                    return;
                } // only for gods
                lobbyChat.splice(data.index, 1);
                fs.writeFile(chatFiles.lobby, JSON.stringify(lobbyChat), err => {
                    if (err) { console.error('Failed to save lobby chat:', err); }
                });
                Lobby.roomEmit({
                    type: 'render_messages',
                    messages: lobbyChat
                });
            }
        });

        socket.on('close', () => {
            Lobby.leave(socket);
            updateLobbyList();
        });

    });

    const wsGame = new WebSocket.Server({
        noServer: true,
        path: "/game"
    });

    wsGame.on('error', () => console.log('wsGame errored'));
    wsGame.on('connection', (socket) => {

        const client = createClient(socket);

        socket.isAlive = true;
        socket.on('pong', () => { socket.isAlive = true; });

        socket.on('message', msg => {
            const data = JSON.parse(msg);

            if (!GAME_MESSAGES.has(data.type)) { // a tab left open from before a deploy
                return client.send({ type: "server-message", msg: "The game was updated. Please reload the page." });
            }

            if (data.type === "enter-room") {
                if (data.user.username) {
                    client.id = data.user.username;
                    client.points = data.user.points_bw;
                }

                const session = getSession(data) || createSession(data);
                if (session.join(client) === false) {
                    return;
                } // TODO: prevent from multiple joining in the future

                session.broadcastSession();
                broadcastRooms();

                data.clientId = client.id;
                data.isGuest = isGuest(client);
                data.status = session.status;
                data.joinable = session.hasFreeSeat();

                client.send(data);
                return client.broadcast({
                    type: "server-message",
                    msg: client.id + " joined the room"
                });

            } else if (!client.session) {
                return; // No session exist
            }

            const session = client.session;

            if (data.type === "state-update") {
                session.updateState(client, data);
            } else if (data.type === "add-special") {
                session.addSpecials(client, data);
            } else if (data.type === "use-special") {
                session.useSpecial(client, data);
            } else if (data.type === "arena-bounce") {
                session.bounceArena(client, data);
            } else if (data.type === "take-seat") {
                session.takeSeat(client, data);
            } else if (data.type === "player-ready") {
                session.ready(client, data);
            } else if (data.type === "state-lost") {
                session.playerLost(client, data);
            } else if (data.type === 'state-chat') {
                const _message = data.message.replace(/</g, "&lt;").replace(/>/g, "&gt;");

                if(_message.toUpperCase() === "ADD BOT"){
                    if (session.hasFreeSeat()) { // create bot
                        const _bots = [...session.clients].filter(c => c.isBot);
                        if(_bots.length >= 4) return; // max 4 bots so player can join
                        const BotName = "#Bot-" + _bots.length;
                        const bot = new Bot(session, BotName);
                        session.join(bot);
                        session.broadcastSession();
                    }
                    BOT_COUNT++;
                }
                else if(_message.toUpperCase() === "LOSE BOTS"){
                    const _players = session.playingClients.filter(c => c.lost === false);
                    for (const player of _players) {
                        if (!player.isBot) {
                            return client.send({
                                clientId: "",
                                type: 'state-chat',
                                message: "Sorry! It won't work when humans still playing"
                            }); // human
                        }
                    }
                    
                    for (const bot of _players) {
                        bot.onlyBots = true;
                    }
                }
                else if (_message === "#bye bots"){
                    for (const bot of session.clients) {
                        bot.stop = true;
                        bot.lost = true;
                        delete bot.socket;
                        session.leave(bot);
                    }
                    return session.broadcastSession();
                }
                else if(_message === "#sessions"){
                    return console.log(sessions);
                }
                else if(_message === "#BOT_COUNT"){
                    return client.send({
                        clientId: "Bot count",
                        type: 'state-chat',
                        message: BOT_COUNT
                    }); // human
                }
                else { // log chat from game room
                    gameChat.push({message: _message, username: client.id, room: session.id});
                    fs.writeFile(chatFiles.game, JSON.stringify(gameChat), (err) => { if(err) console.log(err); });
                }

                client.roomEmit(data);
            }

        });

        socket.on('close', () => {
            try {
                const session = client.session;

                if (session) {
                    const empty = session.playerLeft(client);

                    const rooms = updateRooms().rooms;
                    const nrOfOpenRooms = rooms.filter(c => c.status === Status.session.waiting && c.ranking === session.ranking);

                    if (empty && (nrOfOpenRooms.length > 2 || session.status !== Status.session.waiting)) {
                        session.dispose();
                        sessions.delete(session.id); // Delete room
                    }

                    broadcastRooms();
                }
            } catch (error) {
                console.log(error);
            }

        });


    });

    /**
     * Multiple connections sharing a single HTTP/S server.
     */
    server.on('upgrade', function upgrade(request, socket, head) {
        const pathname = request.url;
        if(request?.headers?.origin !== DOMAIN){
            return console.log('wrong origin:',request?.headers?.origin); // connection coming from another domain
        }
        if (pathname === '/lobby') {
            wsLobby.handleUpgrade(request, socket, head, function done(ws) {
                wsLobby.emit('connection', ws, request);
            });
        } else if (pathname === '/game') {
            wsGame.handleUpgrade(request, socket, head, function done(ws) {
                wsGame.emit('connection', ws, request);
            });
        } else {
            socket.destroy();
        }
    });

    /**
    * Heartbeat for detecting active clients
    */
    setInterval(function(){
        wsLobby.clients.forEach((ws) => {
            if(ws.readyState !== 1){ return; }
            if (!ws.isAlive) { return ws.terminate(); }
            ws.isAlive = false;
            ws.ping();
        });
        
        wsGame.clients.forEach((ws) => {
            if(ws.readyState !== 1){ return; }
            if (!ws.isAlive) { return ws.terminate(); }
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

};

function updateLobbyList() {
    const usersOnline = [];

    Lobby.clients.forEach(client => {
        const found = usersOnline.some(function (e) {
            return e.username === client.username;
        });
        if (!found && client.username) {
            usersOnline.push({
                username: client.username,
                points: client.points
            });
        }
    });

    Lobby.roomEmit({
        type: 'users_online',
        users: usersOnline
    });
}
