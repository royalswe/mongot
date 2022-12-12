"use strict";
const WebSocket = require('ws');
const Session = require('./session');
const Client = require('./client');
const fs = require('fs');
let gameChat = require('../gameChat.json');
const lobbyChat = require('../blockwarChat.json');
const sessions = new Map();
const Lobby = new(require('./lobby'))();
const Status = require('./status');
const Bot = require('./ai/bot.js');
let config = require('../../config.json');

let BOT_COUNT = 0;

function createId() {
    let len = 6;
    let chars = 'abcdefghjkmnopqrstxz0123456789';
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

    const session = new Session({name, ranking});
    sessions.set(name, session);
    return session;
}

function getClient(session, clientId) {
    for (let client of session.clients) {
        if (client.id === clientId) {
            return client;
        }
    }
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

function canClientJoin(client) {
    const session = client.session;

    let countPlayers = 0;
    for (let client of session.clients) {
        if (client.status !== null) {
            countPlayers++;
        }
    }
    if (countPlayers > 4) {
        return false;
    }
    
    return true;
}

function updateRooms() {
    let openRankedGames = 0;
    let openUnRankedGames = 0;
    for (let session of sessions) { // loop trough rooms to see if more rooms needed
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
    for (let session of sessions) {
        const clients = [];
        const activeClients = [];
        for (let client of session[1].clients) {
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

exports.initialize = (server) => {

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
                const rooms = updateRooms();
                Lobby.roomEmit(rooms);
                const randomNr = Math.floor(1000 + Math.random() * 9000);
                socket.username = (data.user === 'guest') ? 'guest' + randomNr : data.user.username;
                socket.points = (data.user === 'guest') ? null : data.user.points_bw;
                Lobby.broadcast({
                    type: 'user_notification',
                    msg: socket.username + ' arrived to the lobby'
                });

                Lobby.send({
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
                fs.writeFile('blockwarChat.json', JSON.stringify(lobbyChat), () => { });

                Lobby.roomEmit({
                    type: data.type,
                    message: message
                });
            } else if (data.type === 'remove_message') {
                if (!data.god) {
                    return;
                } // only for gods
                lobbyChat.splice(data.index, 1);
                fs.writeFile('blockwarChat.json', JSON.stringify(lobbyChat), () => { });
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

        let client = createClient(socket);

        socket.isAlive = true;
        socket.on('pong', () => { socket.isAlive = true; });

        socket.on('message', msg => {
            const data = JSON.parse(msg);

            if (data.type === "join-session") {
                if (data.user.username) {
                    client.id = data.user.username;
                    client.points = data.user.points_bw;
                }

                const session = getSession(data) || createSession(data);
                if (session.join(client) === false) {
                    return;
                } // TODO: prevent from multiple joining in the future

                session.broadcastSession();

                const rooms = updateRooms();
                Lobby.roomEmit(rooms);

                data.clientId = client.id;
                data.isGuest = isGuest(client);
                data.status = session.status;
                data.joinable = canClientJoin(client);

                client.send(data);
                return client.broadcast({
                    type: "server-message",
                    msg: client.id + " joined the room"
                });

            } else if (!client.session) {
                return; // No session exist
            }

            if (data.type === "state-update") {
                try {
                    const [prop, value] = data.state;
                    client.state[data.fragment][prop] = value;
                    client.broadcast(data);
                } catch (err) {
                    console.log(err.message);
                }
            } else if (data.type === "add-special") {
                if (client.session.status !== Status.session.running) {
                    return; // got special when game finished
                }
                
                if (data.specials.indexOf(19) != -1) { // it is a mine
                    data.type = "state-lost";
                    client.clientLost(data);
                    data.type = "log-special";
                    data.special = 19;
                    data.receiver = client.id;
                    return client.roomEmit(data);
                }

                client.specials.push.apply(client.specials, data.specials);
                client.send({
                    type: data.type,
                    id: client.id,
                    specials: data.specials
                });
            } else if (data.type === "use-special") {
                if (client.session.status !== Status.session.running) {
                    return; // used special when game finished
                }

                data.special = data.specials[0];
                data.receiver = data.specials[1];
                data.clientId = client.id;

                const opponent = getClient(client.session, data.receiver);
                
                if (opponent == null || opponent.lost || opponent.status !== Status.client.ready) { // Opponent dont exist or lost
                    return client.send({ type: "use-special-failed" }); 
                } 
        
                if (!client.compareSpecials(data.special)) { // player dont have the special
                    return client.send({ type: "use-special-failed" }); 
                }

                client.send({ type: "remove-special" });

                opponent.send(data);
                if (data.special === 16) { // if swop arena then swop player id
                    data.clientId = data.receiver;
                    client.send(data);
                }

                data.type = "log-special";
                client.roomEmit(data);
            } else if (data.type === "join-game") {
                if (client.status === Status.client.joined) {
                    console.log("user tries to join game when already joined (server.js)");
                    return client.send({
                        type: "status-error",
                        message: "You already joined"
                    }); // debbuging
                }

                if (canClientJoin(client)) {
                    client.state = data.state;
                    client.status = Status.client.joined;
                    
                    data.id = client.id;
                    data.points = client.points;

                    client.send(data);
                    client.session.broadcastSession();

                    if (client.session.timer !== null) { // reset countdown for all if it is running
                        client.session.countDown();
                        setTimeout(function () {
                            const rooms = updateRooms();
                            Lobby.roomEmit(rooms);
                        }, 11000);
                    }

                    const rooms = updateRooms();
                    Lobby.roomEmit(rooms);
                }
                
            } else if (data.type === "player-ready") {
                const session = client.session;
                if (session.status === Status.session.running || client.status !== Status.client.joined) {
                    return;
                } // if game is allready started or player clicked ready when not joined

                client.status = Status.client.ready;
                client.roomEmit(data);

                let playersReady = 0;
                let playersJoined = 0;
                const startingPlayers = [];

                for (let client of session.clients) {
                    if (client.status === Status.client.ready) {
                        playersReady++;
                        startingPlayers.push(client);
                    }
                    if (client.status !== null) {
                        playersJoined++;
                    }
                }
                if (playersReady === playersJoined) {
                    clearTimeout(session.timer);
                    session.timer = null;

                    const blocks = session.tetris.start();
                    data.blocks = blocks;
                    data.type = "game-start";
                    session.status = Status.session.running;
                    client.roomEmit(data);

                    session.playingClients = startingPlayers; // store all started players
                    session.GameStartTime = new Date().getTime(); // store the playing time
                    session.speedUpBlocks(); //start block speed timer
                    // Update rooms in lobby
                    const rooms = updateRooms();
                    Lobby.roomEmit(rooms);
                } else if (session.timer === null) {
                    session.countDown();
                    setTimeout(function () { // Remove active players from lobby room if not pressed ready
                        const rooms = updateRooms();
                        Lobby.roomEmit(rooms);
                    }, 11000);
                }

            } else if (data.type === "state-lost") {
                client.clientLost(data);
                //if () { }
                    // if game is over then update rooms in lobby
                    const rooms = updateRooms();
                    Lobby.roomEmit(rooms);
                
            } else if (data.type === 'state-chat') {
                const _message = data.message.replace(/</g, "&lt;").replace(/>/g, "&gt;");

                if(_message.toUpperCase() === "ADD BOT"){
                    if (canClientJoin(client)) { // create bot
                        const _bots = [...client.session.clients].filter(c => c.socket.constructor.name === 'MockClient');
                        if(_bots.length >= 4) return; // max 4 bots so player can join
                        const BotName = "#Bot-" + _bots.length;
                        const bot = new Bot(client.session, BotName);
                        client.session.join(bot);
                        client.session.broadcastSession();
                    }
                    BOT_COUNT++;
                }
                else if(_message.toUpperCase() === "LOSE BOTS"){
                    const _players = client.session.playingClients.filter(c => c.lost === false);
                    for (const client of _players) {
                        if (client.socket.constructor.name === 'WebSocket') {
                            return client.send({
                                clientId: "",
                                type: 'state-chat',
                                message: "Sorry! It won't work when humans still playing"
                            }); // human
                        }
                    }
                    
                    for (let bot of _players) {
                        bot.onlyBots = true;
                    }
                }
                else if (_message === "#bye bots"){
                    for (let bot of client.session.clients) {
                        bot.stop = true;
                        bot.lost = true;
                        delete bot.socket;
                        client.session.leave(bot);
                    }
                    return client.session.broadcastSession();
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
                    gameChat.push({message: _message, username: client.id, room: client.session.id});
                    fs.writeFile('gameChat.json', JSON.stringify(gameChat), (err) => { if(err) console.log(err); });
                }

                client.roomEmit(data);
            }

        });

        socket.on('close', () => {
            try {
                const session = client.session;

                if (session) {
                    client.broadcast({
                        type: "server-message",
                        msg: client.id + " left the room"
                    });
                    session.leave(client);

                    // if bots exist without humas then delete them
                    let iterations = session.clients.size;
                    for (const client of session.clients) {
                        if (client.socket.constructor.name === 'WebSocket') {
                            break; // human
                        }
                        if (--iterations <= 0) // only bots in the room
                        {
                            for (let bot of session.clients) {
                                bot.stop = true;
                                delete bot.socket;
                                session.leave(bot);
                            }
                        }
                    }

                    session.broadcastSession();

                    const rooms = updateRooms().rooms;
                    const nrOfOpenRooms = rooms.filter(c => c.status === Status.session.waiting && c.ranking === session.ranking);

                    if (session.clients.size === 0 && (nrOfOpenRooms.length > 2 || session.status !== Status.session.waiting)) {
                        sessions.delete(session.id); // Delete room
                    } else if (session.status === Status.session.running && client.state !== null) {
                        client.clientLost({
                            type: 'state-lost'
                        });
                    }

                    client = null; // probably dont needed because of gb
                    Lobby.leave();

                    Lobby.roomEmit({
                        type: 'render_rooms',
                        rooms: updateRooms().rooms
                    });
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
        if(request?.headers?.origin !== config.DOMAIN){
            return console.log(request?.headers?.origin); // connection coming from another domain
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