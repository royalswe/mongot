"use strict";
const Tetris = require('./tetris');
const models = require('../../models');
const Status = require('./status');

const Session = function (room) {
    this.id = room.name;
    this.ranking = room.ranking;
    this.clients = new Set();
    this.playingClients = [];
    this.status = Status.session.waiting;
    this.tetris = new Tetris();
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

Session.prototype.countDown = function (duration = 11000){
    const countdown = (callback) => {
        this.timer = setTimeout(() => {
            if(this.status === Status.session.running){ console.log('Didnt run countdown because game is allready running (session, countdown)');  }
            for (let client of this.clients) {
                if (client.status === Status.client.joined) {
                    client.state = null;
                    client.status = null;
                    client.send({type: "unjoin-arena", status: Status.client.joined});
                }
                else if (client.status === Status.client.ready) {
                    client.status = Status.client.joined;
                    client.send({type: "unjoin-arena", status: Status.client.ready});
                }
            }
            this.broadcastSession();
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

Session.prototype.isGameOver = function(data){
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
            models.User.findOne({ username: remainingPlayers[0].id }, function(err, user) {
                if(user && user.game_length_bw < timeDiff){
                    user.game_length_bw = timeDiff;
                    user.save();
                }
            });
        }

        this.clients.forEach(client => {
            client.specials = []; // empty specials
            client.lost = false;
            if(client.status === Status.client.ready){
                client.status = Status.client.joined;
            }

            client.send(data);
        });
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
        models.User.updateOne({username: this.playingClients[i].id}, { $inc: { points_bw: -pointsLost, games_lost_bw: 1 }}, function (err) {if(err) console.log(err);});
    }

    winner.points += sumPointsLost; // update players score
    nameAndIncPoints.players.push({name: winner.id, pointsWon: sumPointsLost, newPoints: winner.points});
    for (const client of this.clients) {
        client.send(nameAndIncPoints);
    }

    // increment winners points to db
    models.User.updateOne({username: winner.id}, { $inc: { points_bw: sumPointsLost, games_won_bw: 1 }}, function (err) {if(err) console.log(err);});

    models.BwLog.create({ game_time: gameTime, winner: winner.id, players: JSON.stringify(gameLog) }, function (err) {
        if (err) return console.log(err);
    });
};

module.exports = Session;