"use strict";
const { mock } = require('node:test');
const Session = require('../../game/session');
const Client = require('../../game/client');
const Status = require('../../game/status');

// Records every JSON message the server sends to a player.
function fakeSocket() {
    return {
        readyState: 1,
        messages: [],
        send(data) { this.messages.push(JSON.parse(data)); }
    };
}

function fakeStore() {
    const calls = { gameLength: [], loss: [], win: [], log: [] };
    return {
        calls,
        recordGameLength: (id, ms) => calls.gameLength.push([id, ms]),
        recordLoss: (id, points) => calls.loss.push([id, points]),
        recordWin: (id, points) => calls.win.push([id, points]),
        logGame: (entry) => calls.log.push(entry)
    };
}

function makeSession(room = { name: 'Room', ranking: 'no' }) {
    const store = fakeStore();
    const changes = { count: 0 };
    const session = new Session(room, { store, onChange: () => { changes.count++; } });
    return { session, store, changes };
}

function makePlayer(session, id, points = null) {
    const client = new Client(fakeSocket(), id);
    client.points = points;
    session.join(client);
    return client;
}

function seat(session, client) {
    session.takeSeat(client, { type: 'take-seat', state: { arena: { matrix: [] }, block: { pos: {}, matrix: [] } } });
}

function typesOf(client) {
    return client.socket.messages.map(m => m.type);
}

function lastOfType(client, type) {
    return client.socket.messages.filter(m => m.type === type).pop();
}

// Seats and readies the given players so the game is running.
function startGame(session, ...players) {
    players.forEach(p => seat(session, p));
    players.forEach(p => session.ready(p, { type: 'player-ready' }));
}

// Fake timers keep the 11s countdown and 4 minute speed-up from making tests wait or hang.
function useFakeTimers() {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
    return () => mock.timers.reset();
}

function fakeBot(session, id) {
    const bot = { id, isBot: true, state: null, status: null, lost: false, session, send() {} };
    session.clients.add(bot);
    return bot;
}

module.exports = { makeSession, makePlayer, seat, startGame, typesOf, lastOfType, useFakeTimers, fakeBot, Status };
