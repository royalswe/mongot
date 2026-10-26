"use strict";
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const Lobby = require('../game/lobby');

function fakeSocket(readyState = 1) {
    return {
        readyState,
        messages: [],
        send(data, ack) { this.messages.push(JSON.parse(data)); if (ack) { ack(); } }
    };
}

describe('Lobby', () => {
    test('send reaches only the given client, whoever joined last', () => {
        const lobby = new Lobby();
        const a = fakeSocket();
        const b = fakeSocket();
        lobby.join(a);
        lobby.join(b);

        lobby.send(a, { type: 'render_messages' });

        assert.equal(a.messages.length, 1);
        assert.equal(b.messages.length, 0);
    });

    test('send is not misrouted after another client leaves', () => {
        const lobby = new Lobby();
        const a = fakeSocket();
        const b = fakeSocket();
        lobby.join(a);
        lobby.join(b);
        lobby.leave(b);

        lobby.send(a, { type: 'render_messages' });

        assert.equal(a.messages.length, 1);
    });

    test('send skips closed sockets', () => {
        const lobby = new Lobby();
        const closed = fakeSocket(3);
        lobby.join(closed);

        lobby.send(closed, { type: 'x' });

        assert.equal(closed.messages.length, 0);
    });

    test('broadcast reaches everyone except the sender', () => {
        const lobby = new Lobby();
        const [a, b, c] = [fakeSocket(), fakeSocket(), fakeSocket()];
        [a, b, c].forEach(s => lobby.join(s));

        lobby.broadcast(b, { type: 'user_notification' });

        assert.deepEqual([a, b, c].map(s => s.messages.length), [1, 0, 1]);
    });

    test('roomEmit reaches everyone', () => {
        const lobby = new Lobby();
        const [a, b] = [fakeSocket(), fakeSocket()];
        [a, b].forEach(s => lobby.join(s));

        lobby.roomEmit({ type: 'render_rooms' });

        assert.deepEqual([a, b].map(s => s.messages.length), [1, 1]);
    });
});
