"use strict";
const Status = require('./status');

const MAX_SEATED = 5;
const COUNTDOWN_MS = 11000;

function randomBlocks(count = 100) {
    const possible = "ILJOTSZ";
    let blocks = "";
    for (let i = 0; i < count; i++) {
        blocks += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return blocks;
}

/**
 * @param room {name, ranking}
 * @param deps.store persistence adapter (defaults to the MongoDB one)
 * @param deps.onChange called when something the lobby room list shows has changed
 */
const Session = function (room, deps = {}) {
    this.id = room.name;
    this.ranking = room.ranking;
    this.store = deps.store || require('./store');
    this.onChange = deps.onChange || (() => {});
    this.clients = new Set();
    this.playingClients = [];
    this.status = Status.session.waiting;
    this.timer = null;
    this.GameStartTime = null;
    this.blockSpeedIntervall = null;
};

Session.prototype.join = function (client) {
    for (let player of this.clients) {
        if (player.id === client.id) {
            return false; // client exist allready
        }
    }

    if(client.session){
        console.log('client exist allready (session.js, join)');
    }
    this.clients.add(client);
    client.session = this;
};

Session.prototype.leave = function (client) {
    if(client.session !== this){
        console.log('client dont exist in session (session.js, leave)');
    }

    this.clients.delete(client);
};

Session.prototype.hasFreeSeat = function () {
    let seated = 0;
    for (const client of this.clients) {
        if (client.status !== null) { seated++; }
    }
    return seated < MAX_SEATED;
};

Session.prototype.getClient = function (id) {
    for (const client of this.clients) {
        if (client.id === id) { return client; }
    }
};

/**
 * Take a seat. Returns false if the client is already seated or no seat is free.
 */
Session.prototype.takeSeat = function (client, data) {
    if (client.status !== null) {
        client.send({ type: "status-error", message: "You already have a seat" });
        return false;
    }
    if (!this.hasFreeSeat()) { return false; }

    client.state = data.state;
    client.status = Status.client.seated;

    client.send({ ...data, id: client.id, points: client.points });
    this.broadcastSession();

    if (this.timer !== null) { this.countDown(); } // reset countdown for all if it is running
    this.onChange();
    return true;
};

/**
 * Mark a seated client ready. Starts the game when every seated client is ready.
 */
Session.prototype.ready = function (client, data) {
    if (this.status === Status.session.running || client.status !== Status.client.seated) {
        return false;
    }

    client.status = Status.client.ready;
    client.roomEmit(data);

    const startingPlayers = [];
    let seated = 0;
    for (const player of this.clients) {
        if (player.status === Status.client.ready) { startingPlayers.push(player); }
        if (player.status !== null) { seated++; }
    }

    if (startingPlayers.length === seated) {
        this.start(client, data, startingPlayers);
    } else if (this.timer === null) {
        this.countDown();
    }
    return true;
};

Session.prototype.start = function (starter, data, startingPlayers) {
    clearTimeout(this.timer);
    this.timer = null;

    this.status = Status.session.running;
    starter.roomEmit({ ...data, type: "game-start", blocks: randomBlocks() });

    this.playingClients = startingPlayers;
    this.GameStartTime = Date.now();
    this.speedUpBlocks();
    this.onChange();
};

Session.prototype.updateState = function (client, data) {
    const allowedProperties = {
        block: ['pos', 'matrix'],
        arena: ['matrix']
    };
    if (!Object.prototype.hasOwnProperty.call(allowedProperties, data.fragment) ||
        !Array.isArray(data.state) || data.state.length !== 2 ||
        !allowedProperties[data.fragment].includes(data.state[0])) {
        return false;
    }

    try {
        const [prop, value] = data.state;
        client.state[data.fragment][prop] = value;
    } catch (err) {
        console.log(err.message);
        return false;
    }
    client.broadcast(data);
    return true;
};

/**
 * A client collected specials. Collecting a mine loses the game.
 */
Session.prototype.addSpecials = function (client, data) {
    if (this.status !== Status.session.running) { return; }

    if (data.specials.indexOf(19) !== -1) {
        this.playerLost(client, { type: "state-lost" });
        return client.roomEmit({ type: "log-special", special: 19, receiver: client.id });
    }

    client.specials.push(...data.specials);
    client.send({ type: data.type, id: client.id, specials: data.specials });
};

/**
 * data.specials is [special, receiverId]. The sender must own the special and the receiver still be playing.
 */
Session.prototype.useSpecial = function (client, data) {
    if (this.status !== Status.session.running) { return; }

    const [special, receiverId] = data.specials;
    const opponent = this.getClient(receiverId);
    const failed = () => client.send({ type: "use-special-failed" });

    if (opponent == null || opponent.lost || opponent.status !== Status.client.ready) { return failed(); }
    if (client.specials[0] !== special) { return failed(); }
    client.specials.shift();

    client.send({ type: "remove-special" });

    const used = { ...data, special, receiver: receiverId, clientId: client.id };
    opponent.send(used);
    if (special === 16) { // swop arena
        client.send({ ...used, clientId: receiverId });
    }

    client.roomEmit({ ...used, type: "log-special" });
};

Session.prototype.playerLost = function (client, data) {
    if (client.status !== Status.client.ready) { return; }
    client.lost = true;

    if (client.points) {
        this.store.recordGameLength(client.id, Date.now() - this.GameStartTime);
    }

    client.roomEmit(data);
    this.isGameOver();
    this.onChange();
};

/**
 * A client disconnected. A seated player leaving a running game counts as a loss.
 * Returns whether the session is now empty.
 */
Session.prototype.playerLeft = function (client) {
    client.broadcast({ type: "server-message", msg: client.id + " left the room" });
    this.leave(client);

    if (![...this.clients].some(c => !c.isBot)) { // only bots left
        for (const bot of [...this.clients]) {
            bot.stop = true;
            delete bot.socket;
            this.leave(bot);
        }
    }

    this.broadcastSession();

    const empty = this.clients.size === 0;
    if (!empty && this.status === Status.session.running && client.state !== null) {
        this.playerLost(client, { type: "state-lost" });
    }
    return empty;
};

Session.prototype.dispose = function () {
    clearTimeout(this.timer);
    clearTimeout(this.blockSpeedIntervall);
    this.timer = null;
    this.blockSpeedIntervall = null;
};

Session.prototype.speedUpBlocks = function(){
    // clearInterval(this.blockSpeedInterall);
    // this.blockSpeedInterall = null;

    // this.blockSpeedInterall = setInterval(() => {
    //     console.log('mjo');
    //     if(this.status === Status.session.running){
    //         this.clients.forEach(client => {
    //             client.send({type: "speed-up-blocks"});
    //         });
    //     }
    //     else{
    //         clearInterval(this.blockSpeedInterall);
    //         this.blockSpeedInterall = null;
    //     }
    // }, 500);

    // let expected, timeout;
    // const interval = 1000;//240000;
    // console.log('kör');

    clearTimeout(this.blockSpeedIntervall);
    var interval = 240000; // ms
    var expected = Date.now() + interval;
    
    let step = () => {
        var dt = Date.now() - expected; // the drift (positive for overshooting)
        if (dt > interval) {
            console.log("blockSpeedIntervall dt: " + dt);
        }
        if(this.status === Status.session.running){
            this.clients.forEach(client => {
                client.send({type: "speed-up-blocks"});
            });
        }
        else{
            return clearTimeout(this.blockSpeedIntervall);
        }
    
        expected += interval;
        this.blockSpeedIntervall = setTimeout(step, Math.max(0, interval - dt)); // take into account drift
    };
    this.blockSpeedIntervall = setTimeout(step, interval);//setTimeout(step, interval);
};

Session.prototype.countDown = function (duration = COUNTDOWN_MS){
    const countdown = (callback) => {
        this.timer = setTimeout(() => {
            if(this.status === Status.session.running){ console.log('Didnt run countdown because game is allready running (session, countdown)');  }
            for (let client of this.clients) {
                if (client.status === Status.client.seated) {
                    client.state = null;
                    client.status = null;
                    client.send({type: "seat-released", status: Status.client.seated});
                }
                else if (client.status === Status.client.ready) {
                    client.status = Status.client.seated;
                    client.send({type: "seat-released", status: Status.client.ready});
                }
            }
            this.broadcastSession();
            this.onChange();
            return callback();
        }, duration);
    };

    this.clients.forEach(client => {
        client.send({type: 'start-countdown'});
    });

    clearTimeout(this.timer);
    countdown(() => {
        this.timer = null;
    });

};

Session.prototype.broadcastSession = function (){
    const clients = [...this.clients];
    const players = clients.filter(c => c.state !== null);
    for (let i = 0; i < clients.length; i++) {
        clients[i].send({
            type: 'session-broadcast',
            peers: {
                you: clients[i].id,
                gamestatus: this.status,
                clients: players.map(client => {
                    return {
                        id: client.id,
                        status: client.status,
                        state: client.state,
                        lost: client.lost,
                        points: client.points
                    };
                }),
            },
        });
    }

};

Session.prototype.isGameOver = function(){
    const data = {};
    //const allPlayers = this.playingClients;
    const remainingPlayers = this.playingClients.filter(c => c.lost === false);
    
    if (remainingPlayers.length <= 1 && this.status === Status.session.running) {
        this.status = Status.session.waiting;

        try{
            data.winner = (remainingPlayers.length === 0) ? "no-winner" : remainingPlayers[0].id;
        }
        catch(err){
            console.log('game winner: ', err.message);
            data.winner = "no-winner";
        }
        data.type = "state-winner";

        if(remainingPlayers.length === 1 && this.ranking === "yes"){ // score handling
            this.collectPoints(remainingPlayers[0], this.playingClients);
        }

        // Show the game time
        const GameEnd = new Date().getTime();
        const timeDiff = GameEnd - this.GameStartTime; //in ms
        const seconds = parseInt((timeDiff/1000)%60);
        const minutes = parseInt((timeDiff/(1000*60))%60);
        data.gameTime = minutes+"m:"+seconds+"s"; // mm:ss
        
        if(remainingPlayers[0] && remainingPlayers[0].points){            
            this.store.recordGameLength(remainingPlayers[0].id, timeDiff);
        }

        this.clients.forEach(client => {
            client.specials = []; // empty specials
            client.lost = false;
            if(client.status === Status.client.ready){
                client.status = Status.client.seated;
            }

            client.send(data);
        });
        this.onChange();
    }
};

Session.prototype.collectPoints = function(winner){
    let sumPointsLost = 0;
    const nameAndIncPoints = {type: 'update-scores', players: []};
    const winnerPoints = winner.points;

    // game time
    const GameEnd = new Date().getTime();
    const timeDiff = GameEnd - this.GameStartTime; //in ms
    const seconds = parseInt((timeDiff/1000)%60);
    const minutes = parseInt((timeDiff/(1000*60))%60);
    const gameTime = minutes+"m:"+seconds+"s"; // mm:ss

    const gameLog = [];

    for (let i = 0; i < this.playingClients.length; i += 1) {
        // object with players game info
        gameLog.push({
            name: this.playingClients[i].id,
            points: this.playingClients[i].points,
        });

        if (this.playingClients[i].id === winner.id) {
            continue; // The winner
        }
        const loser = this.playingClients[i].points;
        const decreaseValue = loser - winnerPoints;

        let pointsLost = 25 + (decreaseValue / loser) * 50;
        pointsLost = Math.round(pointsLost);

        if (pointsLost < 4) {
            pointsLost = 4;
        }
        else if (pointsLost > 50) {
            pointsLost = 50;
        }

        sumPointsLost += pointsLost;
        this.playingClients[i].points -= pointsLost; // update players score

        nameAndIncPoints.players.push({name: this.playingClients[i].id, pointsLost: pointsLost, newPoints: this.playingClients[i].points});

        // increment loosers points to db
        this.store.recordLoss(this.playingClients[i].id, pointsLost);
    }

    winner.points += sumPointsLost; // update players score
    nameAndIncPoints.players.push({name: winner.id, pointsWon: sumPointsLost, newPoints: winner.points});
    for (const client of this.clients) {
        client.send(nameAndIncPoints);
    }

    // increment winners points to db
    this.store.recordWin(winner.id, sumPointsLost);

    this.store.logGame({ game_time: gameTime, winner: winner.id, players: JSON.stringify(gameLog) });
};

module.exports = Session;