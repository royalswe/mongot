const models = require('../../models');
const Status = require('./status');

"use strict";
const Client = function(conn, id) {
    this.socket = conn;
    this.id = id;
    this.points = null;
    this.session = null;
    this.state = null;
    this.status = null;
    this.lost = false;
    this.specials = [];
};

Client.prototype.compareSpecials = function(special) {
    if (this.specials[0] === special) {
        this.specials.splice(0, 1); // remove first item
        return true;
    }
    console.log(this.id, this.status, this.session.status + ': stored special is ' + this.specials + '. sending special is ' + special);
    return false;
};

Client.prototype.clientLost = function(data) {
    if (this.status !== Status.client.ready) {
        return;
    }
    this.lost = true;

    if(this.points){
        const GameEnd = new Date().getTime();
        const timeDiff = GameEnd - this.session.GameStartTime; //in ms    

        models.User.findOne({ username: this.id }, function(err, user) {
            if(user && user.game_length_bw < timeDiff){
                user.game_length_bw = timeDiff;
                user.save();
            }
        });
    }

    this.roomEmit(data);
    this.session.isGameOver(data);
};

/**
 * Send to all clients in the same session except local user
 */
Client.prototype.broadcast = function(data) {
    if (!this.session) {
        console.log('cant broadcast without session (client.js, broadcast)');
    }
    data.clientId = this.id;

    this.session.clients.forEach(client => {
        if (this === client) { return; }
        client.send(data, function ack(err) {
            if (client.readyState !== 1){ return; }
            if (err) { console.log(data, err); }
        });
    });
};

/**
 * Send to all clients in room
 */
Client.prototype.roomEmit = function(data) {
    if (!this.session) {
        console.log('cant broadcast without session (client.js, roomEmit)');
    }

    data.clientId = this.id;
    this.session.clients.forEach(client => {
        client.send(data, function ack(err) {
            if (client.readyState !== 1){ return ; }
            if (err) { console.log(data, err); }
        });
    });
};

/**
 * Send to local client only
 */
Client.prototype.send = function(event) {
    const data = JSON.stringify(event);
    const client = this.socket;
    client.send(data, function ack(err) {
        if (client.readyState !== 1){ return; }
        if (err) { console.log(data, err); }
    });
};

module.exports = Client;