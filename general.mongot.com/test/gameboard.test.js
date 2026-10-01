'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const models = require('../../models');
const GameBoard = require('../game/GameBoard').GameBoard;

test('a disconnected player gets a grace period, then a bot keeps the faction active', () => {
    const scheduled = [];
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const originalBotUpdate = models.Bot.updateOne;
    global.setTimeout = (callback, delay) => {
        scheduled.push({callback: callback, delay: delay});
        return scheduled.length;
    };
    global.clearTimeout = function() {};
    models.Bot.updateOne = function(filter, update, options, callback) {
        if (typeof callback === 'function') { callback(null); }
        return {exec: async () => null};
    };

    try {
        const sockets = [0, 1].map((id) => ({
            id: id,
            username: `Human${id}`,
            color: id ? 'blue' : 'red',
            points: 1600,
            request: {headers: {'user-agent': 'test'}},
            handlers: {},
            on(eventName, handler) { this.handlers[eventName] = handler; },
            removeAllListeners(eventName) { delete this.handlers[eventName]; },
            send() {},
            emit() {},
            disconnect() {}
        }));
        const room = {emit() {}, send() {}};
        const board = new GameBoard(sockets, {of() { return {in() { return room; }}; }}, 'unit-test');
        const initialUnits = board.getGameInfo().playerList[0].countries.reduce((total, territory) => total + territory.units, 0);

        assert.equal(sockets[1].handlers.player_left, undefined, 'the browser can no longer report a disconnect');
        board.playerDisconnected({id: 'a-spectator'});
        assert.equal(board.getGameInfo().playerList[0].lost, false);

        board.playerDisconnected(sockets[0]);
        assert.equal(board.getGameInfo().playerList[0].lost, null);

        scheduled.find((timer) => timer.delay === 30000).callback();
        assert.equal(board.getGameInfo().playerList[0].username, 'Relief-unit-test-1');
        assert.equal(board.getGameInfo().playerList[0].lost, false);
        scheduled.filter((timer) => timer.delay === 120).forEach((timer) => timer.callback());
        assert(board.getGameInfo().playerList[0].countries.reduce((total, territory) => total + territory.units, 0) > initialUnits);

        const rematchPlayers = board.getRematchPlayers([sockets[1]]);
        assert.equal(rematchPlayers[0].isBot, true);
        assert.equal(rematchPlayers[1], sockets[1]);
        assert.equal(board.getRoomPlayers().length, 2);
    }
    finally {
        models.Bot.updateOne = originalBotUpdate;
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
    }
});
test('whether a match is ranked is decided by everyone seated at the start, even after they leave', () => {
    const scheduled = [];
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const originalBotUpdate = models.Bot.updateOne;
    global.setTimeout = (callback, delay) => { scheduled.push({callback: callback, delay: delay}); return scheduled.length; };
    global.clearTimeout = function() {};
    models.Bot.updateOne = function(filter, update, options, callback) {
        if (typeof callback === 'function') { callback(null); }
        return {exec: async () => null};
    };

    const seat = (id, flags) => Object.assign({
        id: id, username: 'Player' + id, color: id ? 'blue' : 'red', points: 1600,
        request: {headers: {'user-agent': 'test'}}, handlers: {},
        on(eventName, handler) { this.handlers[eventName] = handler; },
        removeAllListeners(eventName) { delete this.handlers[eventName]; },
        send() {}, emit() {}, disconnect() {}
    }, flags);
    const room = {emit() {}, send() {}};
    const io = {of() { return {in() { return room; }}; }};

    try {
        const verifiedOnly = new GameBoard([seat(0), seat(1)], io, 'ranked-test');
        assert.equal(verifiedOnly.isRankedMatch(), true);
        assert(verifiedOnly.getRoomPlayers().every((player) => player.matchRanked === true));

        const guest = seat(1, {isGuest: true});
        const mixed = new GameBoard([seat(0), guest], io, 'unranked-test');
        assert.equal(mixed.isRankedMatch(), false);

        mixed.playerDisconnected(guest);
        scheduled.filter((timer) => timer.delay === 30000).forEach((timer) => timer.callback());
        assert.equal(mixed.isRankedMatch(), false, 'still unranked after the guest was replaced by a bot');
        assert(mixed.getRoomPlayers().every((player) => player.matchRanked === false));
    }
    finally {
        models.Bot.updateOne = originalBotUpdate;
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
    }
});
