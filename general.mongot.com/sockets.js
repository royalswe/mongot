'use strict';

let GameBoard = require('./game/GameBoard');
let models = require('../models');
let io = require('socket.io');
let fs = require('fs');
let lobbyChat = require('./lobbyChat.json');
let gameChat = require('./gameChat.json');
let lobbyRooms = [];
let joinedPlayers = [];
let playerSockets = [];
let newGames = [];
let colors = ['red', 'blue', 'orange', 'green', 'purple', 'black'];

for(let i = 0; i<2; i += 1){
    lobbyRooms.push({name: nameGenerator(), players: 0, startingPlayers: 2 ,status: 'open'});
    lobbyRooms.push({name: nameGenerator(), players: 0, startingPlayers: 3 ,status: 'open'});
    lobbyRooms.push({name: nameGenerator(), players: 0, startingPlayers: 4 ,status: 'open'});
}

exports.returnRoom = (room, socket, color) => { // If player returns after disconnection
    if (hasPlayerJoined(room, socket.username, color) ) { // Cant join room twice
        socket.color = color;
        socket.room = room;
        joinedPlayers.push({username: socket.username, room: room, color: color});
        playerSockets.splice(socket.id, 0, socket);
        let playerList = updatePlayerListInRoom(room);
        this.gameInfra.to(room).emit("list_of_players", playerList);

        updateLobby(room);
        this.gameInfra.emit("rooms_list", lobbyRooms, joinedPlayers); // update rooms in lobby
    }
}

exports.updatePlayerList = (room, usernames) => { // Update playerlist in room and lobbyrooms
    let self = this;
    let userCounter = 0;
    for(let i=0; i < usernames.length; i+=1){
        models.User.findOne({ username: usernames[i] }, function(err, user) {
            updatePlayerScore(user.points_general, user.username)
        });
    }
    function updatePlayerScore(points, username){
        for(let i=0; i < playerSockets.length; i+=1){
            if(playerSockets[i].username === username && playerSockets[i].room === room){
                playerSockets[i].points = points;
                break;
            }
        }
        userCounter +=1;
        if(userCounter === usernames.length){
            let playerList = updatePlayerListInRoom(room);
            self.gameInfra.in(room).emit('list_of_players', playerList);
        }
    }

    for(let i=0; i < lobbyRooms.length; i+=1){
        if(lobbyRooms[i].name === room){
            lobbyRooms.splice(i, 1);
            break;
        }
    }

    this.gameInfra.emit("rooms_list", lobbyRooms, joinedPlayers);
    delete newGames[room];
}

exports.initialize = (server) => {
    io = io.listen(server);

    let usersOnline = [];
    let self = this;

    this.gameInfra = io.of('/game_infra');
    this.gameInfra.on('connection', (socket) => {
        
        socket.on('player_ready', (data) => {
            socket.username = (data === 'guest') ? 'guest' : data.username;
            socket.points = data.points_general;
            socket.activated = data.active;
            socket.ip = data.ip;
            socket.send({
                type: 'serverMessage',
                message: 'Welcome ' + socket.username
            });
        });

        socket.on('dice_log_room', (room) => {
            socket.join(room); 
        });

        socket.on('join_room', (room) => {
            if (lobbyRooms.find(x=> x.name === room)) { // Check if room exist before join
                if (hasPlayerJoined(room, socket.username)) { // Cant join room twice
                    socket.join(room); // player joins choosen room
                    let playerList = updatePlayerListInRoom(room);
                    socket.emit("list_of_players", playerList);
                    /**
                     * Guests can't play only chat and inspect the game, same for logged in users if game is full
                     */
                    let roomStatus = lobbyRooms.find(x=> x.name === room).status;
                    if (socket.activated && (roomStatus === 'open' || roomStatus === 'waiting for players')) {
                        socket.emit("choose_color", playerList, colors);
                    }
                    else if(socket.activated === false){
                        socket.emit("not_activated");
                    }
                    /**
                     * Join the chat in chat_com namespace
                     */
                    let comSocket = self.chatCom.connected['/chat_com#' +socket.client.id];
                    comSocket.join(room);
                    comSocket.room = room;

                    socket.broadcast.to(room).send({
                        type: 'serverMessage',
                        message: socket.username + ' has joined the room.'
                    });
                }
            }
        });

        socket.on("join_game", (room, color) => {
            if (hasPlayerJoined(room, socket.username, color) && socket.activated && lobbyRooms.find(x=> x.name === room).status !== 'game in progress') { // Cant join room twice
                socket.color = color;
                socket.room = room;   
                playerSockets.push(socket);
                joinedPlayers.push({username: socket.username, room: room, color: color});

                let playerList = updatePlayerListInRoom(room);
                self.gameInfra.to(room).emit("list_of_players", playerList);
                self.gameInfra.to(room).emit("remove_color_popup", playerList);

                let numOfStartingPlayers = lobbyRooms.find(x=> x.name === room).startingPlayers;

                let waitingPlayers = updateLobby(room);
                self.gameInfra.emit("rooms_list", lobbyRooms, joinedPlayers); // update rooms in lobby

                if (waitingPlayers === numOfStartingPlayers) {
                    self.gameInfra.to(room).emit("clear_game_countdown"); // // clear game countdown for everyone
                    self.gameInfra.to(room).emit("remove_color_popup_box");
                    self.gameInfra.to(room).emit("game_countdown", true);
                }
            }
        });

        /**
         * Game starts
         */
        socket.on('countdown_finished', (room) => {
            if (newGames[room] === undefined) {
                let numOfStartingPlayers = lobbyRooms.find(x=> x.name === room).startingPlayers;
                let startingPlayers = updateLobby(room);
                if (startingPlayers !== numOfStartingPlayers) {
                    return self.gameInfra.to(room).emit("game_countdown", false);
                }
                /**
                 * Store playerSockets socket from choosen room and start new game
                 */
                createRoom(numOfStartingPlayers); // Create new room with same number of players
                let socketsArr = [];
                for (let i in playerSockets) {
                    if (playerSockets[i].room === room) {
                        socketsArr.push(playerSockets[i]);
                    }
                }
                if (newGames[room] !== undefined) { return; } // Probably not needed. Returns if room already created
                newGames[room] = new GameBoard.GameBoard(socketsArr, io, room);
            }
        });

        socket.on('god_mode', (data) => {
            if(!data.user.god){ return; } // only for gods

            if(data.type === 'kick_player' && newGames[data.room] !== undefined) {
                newGames[data.room].kickoutPlayer(data.player);
                this.gameInfra.in(data.room).send({type: 'serverMessage', message: data.user.username +' kicked '+ data.player +' from the game'});
            }
        });
        /**
         * Update the gameboard for visitors
         */
        socket.on('visitor', (room) => {
            if (newGames[room] !== undefined) {
                let game = newGames[room].getGameInfo();
                
                socket.emit("start_countdown");
                if(game.phase === 'Everyone deploy'){
                    socket.emit("render_no_army_map", game.playerList);
                }
                else {
                    if(game.disabledCountries !== undefined) {
                        socket.emit('render_disabled_countries', game.disabledCountries);
                    }
                    socket.emit("render_map", game.playerList);
                }
                socket.send({type: 'phase', message: game.phase, phaseMsg: "Welcome! You are a guest in this room"});

                if(game.ap !== undefined) {
                    socket.send({
                        type: 'current_player',
                        bool: false,
                        player: game.ap,
                        username: game.playerList[game.ap].username,
                        color: game.playerList[game.ap].color
                    });
                }
                newGames[room].returningPlayer(socket);
            }
        });

        socket.on("get_rooms", () => {
            socket.emit("rooms_list", lobbyRooms, joinedPlayers);
        });
        
        function createRoom(numOfPlayers) {
            lobbyRooms.push({name: nameGenerator(), players: 0, startingPlayers: numOfPlayers ,status: 'open'});
            self.gameInfra.emit("rooms_list", lobbyRooms, joinedPlayers);
        }
        /**
         * Runs when user leaves or drop connection
         */
        socket.onclose = () => {
            if (socket.rooms[socket.room]) { // if user disconnect from a joined room
                                
                for(let i=0; i < joinedPlayers.length; i+=1){ // remove player from joinedPlayers array
                    if(joinedPlayers[i].username === socket.username && joinedPlayers[i].room === socket.room){
                        joinedPlayers.splice(i, 1);
                        break;
                    }
                }
                socket.broadcast.to(socket.room).send({type: 'disconnect_player', id: socket.id});
                socket.leave(socket.room);
                /**
                 * Remove player from showing in lobby and remove the room from lobby if it is the last user leaving.
                 * Allso remove player from game room if user disconnects
                 */
                for (let i = 0; i < playerSockets.length; i+=1) {
                    // Get the correct room and username to remove
                    if (playerSockets[i].room === socket.room && playerSockets[i].username === socket.username) {
                        playerSockets.splice(i, 1);

                        for (let i in lobbyRooms) {
                            if (lobbyRooms[i].name === socket.room) {
                                lobbyRooms[i].players = lobbyRooms[i].players - 1; // update the room player count in lobby
                                if (lobbyRooms[i].players === 0 && lobbyRooms[i].status === 'game in progress') {
                                    lobbyRooms.splice(i, 1);  // remove room from lobby if empty
                                    delete newGames[socket.room];  // remove game object
                                }
                                break; // stop the loop we are done
                            }
                        }
                        break; // stop the loop we are done
                    }
                }
                let playerList = updatePlayerListInRoom(socket.room);
                socket.broadcast.to(socket.room).emit('list_of_players', playerList);
                updateLobby(socket.room);
                self.gameInfra.emit("rooms_list", lobbyRooms, joinedPlayers); // update lobby
            }
        };
    });
    /**
     * The chat
     */
    this.chatCom = io.of('/chat_com');
    this.chatCom.on('connection', (socket) => {

        socket.on('message', (msg) => {
            let message = msg.replace(/(<([^>]+)>)/ig,""); // remove scripts
            message = JSON.parse(message);
            if (message.type === 'userMessage') {
                message.color = self.gameInfra.connected['/game_infra#' +socket.client.id].color;
                message.username = self.gameInfra.connected['/game_infra#' +socket.client.id].username;
                message.room = socket.room;

                gameChat.push(message);
                fs.writeFile('gameChat.json', JSON.stringify(gameChat), (error) => { });

                socket.in(socket.room).broadcast.send(JSON.stringify(message));
                message.type = 'myMessage';
                socket.send(JSON.stringify(message));
            }
        });

        socket.onclose = () => {
            /**
             * Tell the players in room that player has left
             */
            const username = self.gameInfra.connected['/game_infra#' + socket.client.id].username;          
            socket.broadcast.to(socket.room).emit('player_left', username);
        }

    });
    /**
     * The lobby chat
     */
    this.lobbyCom = io.of('/lobby_com');
    this.lobbyCom.on('connection', function(socket){
        socket.on('disconnect', () => {   
            updateLobbyList();      
        })

        socket.on('message', (msg, user) => {
            let timeStamp = new Date().getTime();
            let message = msg.replace(/(<([^>]+)>)/ig,""); // remove scripts
            message = JSON.parse(message);
            if (message.type === 'userMessage') {
                message.username = (user === 'guest') ? 'guest' : user.username;
                message.timeStamp = timeStamp;
                message.index = lobbyChat.length;

                lobbyChat.push(message);
                if(lobbyChat.length > 80){ lobbyChat.shift(); }
                fs.writeFile('lobbyChat.json', JSON.stringify(lobbyChat), (error) => { });

                socket.broadcast.send(JSON.stringify(message));
                message.type = 'myMessage';
                socket.send(JSON.stringify(message));
            }
        });

        socket.on('remove_message', (index, user) =>{
            if(!user.god){ return; } // only for gods
            lobbyChat.splice(index, 1);
            fs.writeFile('lobbyChat.json', JSON.stringify(lobbyChat), (error) => { });
            io.of('/lobby_com').emit('render_messages', lobbyChat);
        });

        socket.on('player_joined', (data) => {       
            if(data.user.username){
                socket.username = data.user.username;
                socket.activated = data.user.active;
                socket.points = data.user.points_general;
                socket.broadcast.emit('user_notification', data.user.username  +' arrived to the lobby');
            }
            socket.emit('render_messages', lobbyChat);
            updateLobbyList();
        });

        function updateLobbyList() {
            usersOnline = [];         
            let username;
            let guests = 0;
            Object.keys(io.of('/lobby_com').sockets).map(function(value) { // Add connected usernames to usersOnline
                username = io.of('/lobby_com').sockets[value].username;
                var found = usersOnline.some(function (e) {
                    return e.username === username;
                });
                if (!found && username) {
                    usersOnline.push({
                        username: username,
                        activated: io.of('/lobby_com').sockets[value].activated,
                        points: io.of('/lobby_com').sockets[value].points }); 
                }
                else{
                    guests++;
                }
            });
            io.of('/lobby_com').emit('users_online', usersOnline, guests);
        }

    });
}

function updatePlayerListInRoom(room) {
    let players = [];
    for (let i in playerSockets) {
        if (playerSockets[i].room === room) {
            players.push({
                username: playerSockets[i].username,
                points: playerSockets[i].points,
                color: playerSockets[i].color,
                ip: playerSockets[i].ip
            });
        }
    }
    return players;
}

function updateLobby(room) {
    let playersInRoom = playerSockets.filter((x) => {
        return x.room === room
    }).length
    for (let i in lobbyRooms) {
        if (lobbyRooms[i].name === room) {
            lobbyRooms[i].players = playersInRoom;
            if(lobbyRooms[i].status === 'game in progress'){
                break;
            }
            else if(lobbyRooms[i].status === 'game is starting' && playersInRoom === lobbyRooms[i].startingPlayers){
                lobbyRooms[i].status = 'game in progress';
            }
            else if (playersInRoom === lobbyRooms[i].startingPlayers) {
                lobbyRooms[i].status = 'game is starting';
            }
            else if (playersInRoom > 0) {
                lobbyRooms[i].status = 'waiting for players';
            }
            else if (playersInRoom === 0) {
                lobbyRooms[i].status = 'open';
            }
            break;
        }
    }
    return playersInRoom;
}

function hasPlayerJoined(room, username, color) {
    if(lobbyRooms.find(x=> x.name === room)){
        for (let i in playerSockets) {
            if (playerSockets[i].room === room && playerSockets[i].username === username) {
                return false;  // Player already joined
            }
            else if (playerSockets[i].room === room && playerSockets[i].color === color) {
                return false;  // color already choosen
            }
        }
        return true;
    }
    return false; // room don't exist
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
    while (lobbyRooms.find(x=> x.name === name));

    return name;
}