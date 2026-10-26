"use strict";

const Lobby = function () {
    this.clients = new Set();
};

Lobby.prototype.join = function (client) {
    //TODO: check if client allready exist
    this.clients.add(client);
};

Lobby.prototype.leave = function (client) {
    //TODO: check if client exist
    this.clients.delete(client);
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
Lobby.prototype.broadcast = function(sender, data) {
    const msg = JSON.stringify(data);

    this.clients.forEach(client => {
        if (sender === client) { return; }
        client.send(msg, function ack(err) {
            if (client.readyState !== 1){ return; }
            if (err) { console.log(msg, err); }
        });
    });
};

/**
 * Send to one client only
 */
Lobby.prototype.send = function(client, data) {
    if (client.readyState !== 1){ return; }

    const msg = JSON.stringify(data);

    try {
        client.send(msg, function ack(err) {
            if (err) { console.log(msg, err); }
        });
    } catch (error) {
        console.log(error);
    }
};

module.exports = Lobby;