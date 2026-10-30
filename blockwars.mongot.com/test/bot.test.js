"use strict";
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Bot = require('../game/ai/bot');
const Client = require('../game/client');
const { makeSession, makePlayer, seat, typesOf, lastOfType, useFakeTimers, Status } = require('./helpers/session-fixtures');

let resetTimers;
beforeEach(() => { resetTimers = useFakeTimers(); });
afterEach(() => resetTimers());

// Messages the bot received on its mock socket.
function botMessages(bot) {
    const messages = [];
    bot.socket.on('mock-msg', msg => messages.push(JSON.parse(msg)));
    return messages;
}

function sessionWithBot() {
    const ctx = makeSession();
    const human = makePlayer(ctx.session, 'human');
    const bot = new Bot(ctx.session, '#Bot-0');
    ctx.session.join(bot);
    return { ...ctx, human, bot };
}

describe('Bot as a Client', () => {
    test('is a flagged Client that shares Client messaging', () => {
        const { bot } = sessionWithBot();

        assert.ok(bot instanceof Client);
        assert.equal(bot.isBot, true);
        assert.equal(bot.send, Client.prototype.send);
        assert.equal(bot.broadcast, Client.prototype.broadcast);
    });

    test('send delivers JSON to the bot socket', () => {
        const { bot } = sessionWithBot();
        const received = botMessages(bot);

        bot.send({ type: 'hello' });

        assert.deepEqual(received, [{ type: 'hello' }]);
    });

    test('broadcast reaches the other players but not the bot itself', () => {
        const { bot, human } = sessionWithBot();
        const received = botMessages(bot);

        bot.broadcast({ type: 'state-update', fragment: 'arena', state: ['matrix', []] });

        assert.equal(lastOfType(human, 'state-update').clientId, '#Bot-0');
        assert.deepEqual(received, []);
    });

    test('is seated, so it counts towards the seat limit', () => {
        const { session } = sessionWithBot();
        for (let i = 1; i < 4; i++) { session.join(new Bot(session, '#Bot-' + i)); }
        assert.equal(session.hasFreeSeat(), true, 'four bots leave the fifth seat for a human');

        session.join(new Bot(session, '#Bot-4'));
        assert.equal(session.hasFreeSeat(), false);
    });
});

describe('playing with a bot', () => {
    test('a human readying also readies the bot and starts the game', () => {
        const { session, human, bot } = sessionWithBot();
        const received = botMessages(bot);
        seat(session, human);

        session.ready(human, { type: 'player-ready' });

        assert.equal(session.status, Status.session.running);
        assert.deepEqual(session.playingClients, [human, bot]);
        assert.ok(received.some(m => m.type === 'game-start'));
        assert.ok(typesOf(human).includes('game-start'));
        bot.stop = true;
    });

    test('the human wins when the bot tops out', () => {
        const { session, human, bot } = sessionWithBot();
        seat(session, human);
        session.ready(human, { type: 'player-ready' });

        bot.endGame();

        assert.equal(lastOfType(human, 'state-lost').clientId, '#Bot-0');
        assert.equal(lastOfType(human, 'state-winner').winner, 'human');
        assert.equal(session.status, Status.session.waiting);
    });

    test('the bot is removed when the last human leaves', () => {
        const { session, human, bot } = sessionWithBot();

        const empty = session.playerLeft(human);

        assert.equal(empty, true);
        assert.equal(bot.stop, true);
        assert.equal(session.clients.size, 0);
    });
});
