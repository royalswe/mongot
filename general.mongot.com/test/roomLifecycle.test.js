'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {createRoomLifecycle} = require('../game/roomLifecycle');

const COLORS = ['red', 'blue', 'green'];
const MAPS = ['original', 'quick'];

function makeRoom(status = 'open', startingPlayers = 3) {
    return {name: 'room-1', players: 0, startingPlayers: startingPlayers, status: status, mapId: 'original', host: null, allowBots: false};
}

function makeSocket(username, room, color) {
    return {username: username, room: room, color: color};
}

function makeClock() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();
    return {
        setTimeout(callback, delay) {
            const id = nextId++;
            timers.set(id, {at: now + delay, callback: callback});
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        advance(ms) {
            const end = now + ms;
            for (;;) {
                const due = [...timers].filter(([, timer]) => timer.at <= end)
                    .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
                if (!due) { break; }
                timers.delete(due[0]);
                now = due[1].at;
                due[1].callback();
            }
            now = end;
        }
    };
}

function makeLifecycle({status = 'open', startingPlayers = 3, game, visitors = new Set()} = {}) {
    const room = makeRoom(status, startingPlayers);
    const clock = makeClock();
    const destroyed = [];
    const removed = [];
    const lifecycle = createRoomLifecycle({
        rooms: [room],
        cleanupDelay: 10,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        getGame: () => game,
        destroyGame: (name) => destroyed.push(name),
        onRoomRemoved: (name) => removed.push(name),
        hasVisitors: (name) => visitors.has(name)
    });
    return {room: room, clock: clock, lifecycle: lifecycle, destroyed: destroyed, removed: removed};
}

function join(fixture, username, color) {
    const socket = typeof username === 'string' ? makeSocket(username) : username;
    return fixture.lifecycle.joinGame(
        socket, fixture.room.name, color, {mapId: 'quick', allowBots: true}, COLORS, MAPS
    ) ? socket : null;
}

test('transferring the host updates the seat count and lobby status', () => {
    const fixture = makeLifecycle({startingPlayers: 3});
    const first = join(fixture, 'First', 'red');
    const second = join(fixture, 'Second', 'blue');
    assert.equal(fixture.room.host, 'First');

    const departure = fixture.lifecycle.removeSeat(first);
    fixture.lifecycle.removeJoinedPlayer(first);
    fixture.lifecycle.updateLobby(fixture.room.name);

    assert.equal(departure.hostChanged, true);
    assert.equal(fixture.room.host, 'Second');
    assert.equal(fixture.room.players, 1);
    assert.equal(fixture.room.status, 'waiting for players');
});

test('returning sockets evict stale seats before reclaiming their color', () => {
    const fixture = makeLifecycle();
    const oldSocket = makeSocket('Returning');
    const newSocket = makeSocket('Returning');
    join(fixture, oldSocket, 'red');

    const room = fixture.lifecycle.prepareRoomJoin(fixture.room.name, newSocket);
    assert.equal(room, fixture.room);
    assert.equal(oldSocket.replaced, true);
    assert.equal(fixture.lifecycle.returnRoom(fixture.room.name, newSocket, 'red'), true);
    assert.deepEqual(fixture.lifecycle.seatedIn(fixture.room.name), [newSocket]);
    assert.deepEqual(fixture.lifecycle.getJoinedPlayers(), [{username: 'Returning', room: 'room-1', color: 'red'}]);
});

test('a departure resets votes already cast in a rematch', () => {
    const game = {isOver: () => true, getPlayerCount: () => 3};
    const fixture = makeLifecycle({game});
    const first = join(fixture, 'First', 'red');
    const second = join(fixture, 'Second', 'blue');
    const third = join(fixture, 'Third', 'green');
    fixture.lifecycle.matchFinished(fixture.room.name, 3);
    assert.equal(fixture.lifecycle.voteRematch(first, fixture.room.name, game).votes, 1);
    assert.equal(fixture.lifecycle.voteRematch(second, fixture.room.name, game).votes, 2);

    const departure = fixture.lifecycle.removeSeat(third);
    fixture.lifecycle.removeJoinedPlayer(third);
    const voteAfterReset = fixture.lifecycle.voteRematch(second, fixture.room.name, game);

    assert.equal(departure.rematchReset, true);
    assert.deepEqual(voteAfterReset, {votes: 1, required: 2, voters: ['Second']});
});

test('delayed cleanup preserves a room if a player returns before expiry', () => {
    const game = {destroy() { throw new Error('game should not be destroyed'); }};
    const fixture = makeLifecycle({game});
    const player = makeSocket('Returning');
    join(fixture, player, 'red');
    fixture.room.status = 'game in progress';
    fixture.lifecycle.removeSeat(player);

    fixture.clock.advance(5);
    assert.equal(fixture.lifecycle.returnRoom(fixture.room.name, player, 'red'), true);
    fixture.clock.advance(5);

    assert.equal(fixture.lifecycle.findRoom(fixture.room.name), fixture.room);
    assert.deepEqual(fixture.destroyed, []);
    assert.deepEqual(fixture.removed, []);
});

test('delayed cleanup removes and destroys a room that remains empty', () => {
    const fixture = makeLifecycle();
    const player = makeSocket('Leaving');
    join(fixture, player, 'red');
    fixture.room.status = 'game in progress';
    fixture.lifecycle.removeSeat(player);

    fixture.clock.advance(10);

    assert.equal(fixture.lifecycle.findRoom(fixture.room.name), undefined);
    assert.deepEqual(fixture.destroyed, ['room-1']);
    assert.deepEqual(fixture.removed, ['room-1']);
});
function makeGame({humans = false} = {}) {
    return {
        over: false,
        fast: false,
        humans: humans,
        replaced: 0,
        isOver() { return this.over; },
        hasHumanPlayers() { return this.humans; },
        setFastForward(enabled) { this.fast = enabled; },
        replaceAbsentPlayers() { this.replaced += 1; this.humans = false; }
    };
}

test('the last player leaving a bot-only game lets the bots finish fast, then removes the room', () => {
    const game = makeGame();
    const fixture = makeLifecycle({game});
    const player = join(fixture, 'Surrendered', 'red');
    fixture.room.status = 'game in progress';

    fixture.lifecycle.removeSeat(player);

    assert.equal(game.fast, true);
    assert.equal(fixture.lifecycle.findRoom(fixture.room.name), fixture.room, 'the match keeps running');
    assert.deepEqual(fixture.destroyed, []);

    game.over = true;
    assert.equal(fixture.lifecycle.matchFinished(fixture.room.name, 3), null);
    assert.equal(fixture.lifecycle.findRoom(fixture.room.name), undefined);
    assert.deepEqual(fixture.destroyed, ['room-1']);
});

test('a bot-only game plays at normal speed while someone watches and fast-forwards when the last spectator leaves', () => {
    const visitors = new Set(['room-1']);
    const game = makeGame();
    const fixture = makeLifecycle({game, visitors});
    const player = join(fixture, 'Surrendered', 'red');
    fixture.room.status = 'game in progress';

    fixture.lifecycle.removeSeat(player);
    fixture.clock.advance(10);
    assert.equal(game.fast, false);

    visitors.delete('room-1');
    fixture.lifecycle.releaseIfAbandoned(fixture.room.name);
    assert.equal(game.fast, true);

    visitors.add('room-1');
    fixture.lifecycle.audienceReturned(fixture.room.name);
    assert.equal(game.fast, false, 'a returning spectator gets a watchable pace back');
});

test('when nobody returns within the grace period, absent players are replaced and the bots play it out', () => {
    const game = makeGame({humans: true});
    const fixture = makeLifecycle({game});
    const player = join(fixture, 'Dropped', 'red');
    fixture.room.status = 'game in progress';

    fixture.lifecycle.removeSeat(player);
    assert.equal(game.fast, false);
    fixture.clock.advance(10);

    assert.equal(game.replaced, 1);
    assert.equal(game.fast, true);
    assert.equal(fixture.lifecycle.findRoom(fixture.room.name), fixture.room);
});

test('a finished match with a dropped player keeps its rematch table through the grace period', () => {
    const game = makeGame({humans: true});
    game.over = true;
    const fixture = makeLifecycle({game});
    const player = join(fixture, 'Dropped', 'red');
    fixture.room.status = 'game in progress';
    fixture.lifecycle.removeSeat(player);

    fixture.lifecycle.matchFinished(fixture.room.name, 2);
    assert.equal(fixture.lifecycle.findRoom(fixture.room.name), fixture.room);
    fixture.clock.advance(10);
    assert.equal(fixture.lifecycle.findRoom(fixture.room.name), undefined);
});

test('the grace-period cleanup spares a room that has spectators', () => {
    const visitors = new Set();
    const fixture = makeLifecycle({game: {hasHumanPlayers: () => true}, visitors});
    const player = join(fixture, 'Dropped', 'red');
    fixture.room.status = 'game in progress';

    fixture.lifecycle.removeSeat(player);
    visitors.add('room-1');
    fixture.clock.advance(10);

    assert.equal(fixture.lifecycle.findRoom(fixture.room.name), fixture.room);
    assert.deepEqual(fixture.destroyed, []);
});
