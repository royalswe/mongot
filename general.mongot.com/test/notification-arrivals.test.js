'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSockets(arrivals) {
    const servers = [];
    class Namespace extends EventEmitter {
        constructor() {
            super();
            this.sockets = new Map();
        }
        use() { return this; }
    }
    class Server {
        constructor() {
            this.namespaces = new Map();
            servers.push(this);
        }
        of(name) {
            if (!this.namespaces.has(name)) { this.namespaces.set(name, new Namespace()); }
            return this.namespaces.get(name);
        }
    }

    const roomLifecycle = {};
    const dependencies = {
        './game/GameBoard': { GameBoard: function () {} },
        './game/BotPlayer': function () {},
        './game/countryHandler': {},
        './game/identity': {},
        './game/rating': {},
        './game/roomLifecycle': { createRoomLifecycle: () => roomLifecycle },
        '../models': {},
        mongoose: { connection: { readyState: 0 } },
        'socket.io': { Server },
        fs: {},
        './lobbyChat.json': [],
        './gameChat.json': [],
        './game/botProfiles': []
    };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../sockets.js'), 'utf8'), {
        exports: module.exports,
        require(name) {
            assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
            return dependencies[name];
        },
        process: { env: {} },
        console,
        setInterval() {},
        setTimeout,
        clearTimeout,
        Date
    });
    module.exports.initialize(new EventEmitter(), {
        notifications: { notifyArrival: async username => arrivals.push(username) }
    });
    return servers[0].of('/lobby_com');
}

test('a lobby connection announces an arrival to push without a recipient socket', async () => {
    const arrivals = [];
    const lobby = loadSockets(arrivals);

    function connect(id, username, isGuest = false) {
        const socket = new EventEmitter();
        socket.username = username;
        socket.isGuest = isGuest;
        socket.broadcast = { emit() {} };
        lobby.sockets.set(id, socket);
        lobby.emit('connection', socket);
        socket.emit('player_joined');
        return socket;
    }

    connect('one', 'Alice');
    assert.deepEqual(arrivals, ['Alice']);

    // A second tab for the same account is not a new arrival.
    connect('two', 'Alice');
    assert.deepEqual(arrivals, ['Alice']);

    connect('three', 'Bob');
    assert.deepEqual(arrivals, ['Alice', 'Bob']);
});
