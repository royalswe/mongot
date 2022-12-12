"use strict";

const Lobby = function () {
    this.client = null;
    this.clients = new Set();
};

Lobby.prototype.join = function (client) {
    //TODO: check if client allready exist
    this.clients.add(client);
    this.client = client;
};

Lobby.prototype.leave = function (client) {
    //TODO: check if client exist
    this.clients.delete(client);
    this.client = null;
};

/**
 * Send to all clients in lobby
 */
Lobby.prototype.roomEmit = function(data) {
    const msg = JSON.stringify(data);

    this.clients.forEach(client => {
        client.send(msg, function ack(err) {
            if (client.readyState !== 1){ return; }
            if (err) { console.log(msg, err); }
        });
    });
};

/**
 * Send to all clients in lobby except local user
 */
Lobby.prototype.broadcast = function(data) {
    const msg = JSON.stringify(data);

    this.clients.forEach(client => {
        if (this.client === client) { return; }
        client.send(msg, function ack(err) {
            if (client.readyState !== 1){ return; }
            if (err) { console.log(msg, err); }
        });
    });
};

/**
 * Send to local client only
 */
Lobby.prototype.send = function(data) {
    if (this.client === null){ return console.log('lobby.js line 53', new Date()); }
    if (this.client && this.client.readyState !== 1){ return console.log('lobby.js line 54', new Date()); }

    const msg = JSON.stringify(data);

    try {
        this.client.send(msg, function ack(err) {
            if (err) { console.log(msg, err); }
        });
    } catch (error) {
        console.log(error);
    }
};

module.exports = Lobby;