'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('real lobby init dispatches server push without a recipient socket and suppresses duplicate init/tabs', () => {
    const servers = [];
    class SocketServer extends EventEmitter {
        constructor() { super(); this.clients = new Set(); servers.push(this); }
    }
    const arrivals = [];
    const module = { exports: {} };
    const dependencies = {
        ws: { Server: SocketServer },
        './session': class {
            constructor({ name, ranking }) {
                this.id = name;
                this.ranking = ranking;
                this.status = require('../game/status').session.waiting;
                this.clients = new Set();
            }
        },
        './client': class {},
        fs: {},
        './chat-files': { game: 'game-chat-fixture', lobby: 'lobby-chat-fixture' },
        'game-chat-fixture': [], 'lobby-chat-fixture': [],
        './lobby': require('../game/lobby'),
        './status': require('../game/status'),
        './ai/bot.js': {},
        '../config.json': { DOMAIN: 'https://blockwars.test' }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../game/server.js'), 'utf8'), {
        exports: module.exports,
        require(name) {
            assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
            return dependencies[name];
        },
        process: { env: {} }, console, setInterval() {}
    });
    module.exports.initialize(new EventEmitter(), {
        notifications: { notifyArrival: async username => { arrivals.push(username); } }
    });
    const init = JSON.stringify({ type: 'init_lobby', user: { username: 'Alice', points_bw: 1600 } });
    function connect() {
        const socket = new EventEmitter();
        socket.readyState = 1;
        socket.send = (message, ack) => { if (ack) { ack(); } };
        servers[0].emit('connection', socket);
        socket.emit('message', init);
        return socket;
    }
    const first = connect();
    assert.deepEqual(arrivals, ['Alice']);
    first.emit('message', init);
    connect();
    assert.deepEqual(arrivals, ['Alice']);
});
