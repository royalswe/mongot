"use strict";
const Client = function(conn, id) {
    this.socket = conn;
    this.id = id;
    this.isBot = false;
    this.points = null;
    this.session = null;
    this.state = null;
    this.status = null;
    this.lost = false;
    this.specials = [];
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