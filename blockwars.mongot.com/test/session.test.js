"use strict";
const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { makeSession, makePlayer, seat, startGame, typesOf, lastOfType, useFakeTimers, fakeBot, Status } = require('./helpers/session-fixtures');

let resetTimers;
beforeEach(() => { resetTimers = useFakeTimers(); });
afterEach(() => resetTimers());

describe('seating', () => {
    test('allows five seated players and no more', () => {
        const { session } = makeSession();
        const players = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => makePlayer(session, id));

        players.slice(0, 4).forEach(p => seat(session, p));
        assert.equal(session.hasFreeSeat(), true);
        seat(session, players[4]);
        assert.equal(session.hasFreeSeat(), false);

        assert.equal(session.takeSeat(players[5], { state: {} }), false);
        assert.equal(players[5].status, null);
    });

    test('seating replies to the player, tells the room and refreshes the lobby', () => {
        const { session, changes } = makeSession();
        const a = makePlayer(session, 'a', 1600);
        const b = makePlayer(session, 'b');

        assert.equal(session.takeSeat(a, { type: 'take-seat', state: { arena: {} } }), true);

        assert.equal(a.status, Status.client.seated);
        assert.deepEqual(lastOfType(a, 'take-seat').id, 'a');
        assert.equal(lastOfType(a, 'take-seat').points, 1600);
        const broadcast = lastOfType(b, 'session-broadcast');
        assert.deepEqual(broadcast.peers.clients.map(c => c.id), ['a']);
        assert.equal(changes.count, 1);
    });

    test('refuses a second seat for the same player', () => {
        const { session } = makeSession();
        const a = makePlayer(session, 'a');
        seat(session, a);

        assert.equal(session.takeSeat(a, { state: {} }), false);
        assert.equal(lastOfType(a, 'status-error').message, 'You already have a seat');
    });

    test('seating while a countdown runs restarts it', () => {
        const { session } = makeSession();
        const [a, b, c] = ['a', 'b', 'c'].map(id => makePlayer(session, id));
        seat(session, a);
        seat(session, b);
        session.ready(a, { type: 'player-ready' });
        mock.timers.tick(8000);

        seat(session, c);
        mock.timers.tick(8000); // would have expired without the restart

        assert.notEqual(session.timer, null);
        assert.equal(b.status, Status.client.seated);
    });
});

describe('starting a game', () => {
    test('starts once every seated player is ready', () => {
        const { session, changes } = makeSession();
        const [a, b] = ['a', 'b'].map(id => makePlayer(session, id));
        seat(session, a);
        seat(session, b);

        session.ready(a, { type: 'player-ready' });
        assert.equal(session.status, Status.session.waiting);
        assert.ok(typesOf(b).includes('start-countdown'));

        const before = changes.count;
        session.ready(b, { type: 'player-ready' });

        assert.equal(session.status, Status.session.running);
        assert.equal(session.timer, null);
        assert.deepEqual(session.playingClients, [a, b]);
        const start = lastOfType(a, 'game-start');
        assert.match(start.blocks, /^[ILJOTSZ]{100}$/);
        assert.deepEqual(lastOfType(b, 'game-start').blocks, start.blocks);
        assert.ok(changes.count > before);
    });

    test('a lone seated player starts immediately', () => {
        const { session } = makeSession();
        const a = makePlayer(session, 'a');
        startGame(session, a);

        assert.equal(session.status, Status.session.running);
    });

    test('spectators do not hold up the start', () => {
        const { session } = makeSession();
        const [a, spectator] = ['a', 'spectator'].map(id => makePlayer(session, id));
        startGame(session, a);

        assert.equal(session.status, Status.session.running);
        assert.equal(spectator.status, null);
    });

    test('ignores ready from unseated players and during a running game', () => {
        const { session } = makeSession();
        const [a, b] = ['a', 'b'].map(id => makePlayer(session, id));

        assert.equal(session.ready(a, { type: 'player-ready' }), false);

        startGame(session, a);
        seat(session, b);
        assert.equal(session.ready(b, { type: 'player-ready' }), false);
    });

    test('unready players are unseated when the countdown expires', () => {
        const { session, changes } = makeSession();
        const [a, b] = ['a', 'b'].map(id => makePlayer(session, id));
        seat(session, a);
        seat(session, b);
        session.ready(a, { type: 'player-ready' });
        const before = changes.count;

        mock.timers.tick(11000);

        assert.equal(lastOfType(b, 'seat-released').status, Status.client.seated);
        assert.equal(b.status, null);
        assert.equal(b.state, null);
        assert.equal(lastOfType(a, 'seat-released').status, Status.client.ready);
        assert.equal(a.status, Status.client.seated);
        assert.equal(session.timer, null);
        assert.ok(changes.count > before);
    });

    test('the game speeds up every four minutes while running', () => {
        const { session } = makeSession();
        const a = makePlayer(session, 'a');
        startGame(session, a);

        mock.timers.tick(240000);

        assert.equal(typesOf(a).filter(t => t === 'speed-up-blocks').length, 1);
        session.dispose();
    });
});

describe('state updates', () => {
    test('are applied and shown to the others only', () => {
        const { session } = makeSession();
        const [a, b] = ['a', 'b'].map(id => makePlayer(session, id));
        startGame(session, a, b);
        a.state = { arena: { matrix: [] }, block: { pos: { x: 0, y: 0 } } };

        const update = { type: 'state-update', fragment: 'block', state: ['pos', { x: 4, y: 1 }] };
        assert.equal(session.updateState(a, update), true);

        assert.deepEqual(a.state.block.pos, { x: 4, y: 1 });
        assert.equal(lastOfType(b, 'state-update').clientId, 'a');
        assert.equal(lastOfType(a, 'state-update'), undefined);
    });

    test('malformed updates are ignored', () => {
        const { session } = makeSession();
        const [a, b] = ['a', 'b'].map(id => makePlayer(session, id));

        assert.equal(session.updateState(a, { fragment: 'block', state: ['pos', 1] }), false); // unseated
        assert.equal(session.updateState(a, { fragment: 'block' }), false);
        assert.equal(lastOfType(b, 'state-update'), undefined);
    });
});

describe('specials', () => {
    let session, a, b;
    beforeEach(() => {
        ({ session } = makeSession());
        [a, b] = ['a', 'b'].map(id => makePlayer(session, id));
        startGame(session, a, b);
    });

    test('collected specials are queued for the collector', () => {
        session.addSpecials(a, { type: 'add-special', specials: [8, 9] });

        assert.deepEqual(a.specials, [8, 9]);
        assert.deepEqual(lastOfType(a, 'add-special').specials, [8, 9]);
        assert.equal(lastOfType(b, 'add-special'), undefined);
    });

    test('are ignored when no game is running', () => {
        session.status = Status.session.waiting;
        session.addSpecials(a, { type: 'add-special', specials: [8] });
        session.useSpecial(a, { specials: [8, 'b'] });

        assert.deepEqual(a.specials, []);
    });

    test('collecting a mine loses the game', () => {
        session.addSpecials(a, { type: 'add-special', specials: [19] });

        assert.equal(lastOfType(b, 'state-winner').winner, 'b');
        const log = lastOfType(b, 'log-special');
        assert.equal(log.special, 19);
        assert.equal(log.receiver, 'a');
        assert.deepEqual(a.specials, []);
    });

    test('using the first queued special sends it to the opponent and logs it to the room', () => {
        a.specials = [10, 11];

        session.useSpecial(a, { type: 'use-special', specials: [10, 'b'] });

        assert.deepEqual(a.specials, [11]);
        assert.ok(typesOf(a).includes('remove-special'));
        const received = lastOfType(b, 'use-special');
        assert.equal(received.special, 10);
        assert.equal(received.clientId, 'a');
        assert.equal(lastOfType(a, 'log-special').receiver, 'b');
        assert.equal(lastOfType(b, 'log-special').special, 10);
    });

    test('swapping arenas also tells the sender who they swapped with', () => {
        a.specials = [16];

        session.useSpecial(a, { type: 'use-special', specials: [16, 'b'] });

        assert.equal(lastOfType(b, 'use-special').clientId, 'a');
        assert.equal(lastOfType(a, 'use-special').clientId, 'b');
    });

    test('fails when the player does not own the special', () => {
        a.specials = [10];

        session.useSpecial(a, { type: 'use-special', specials: [12, 'b'] });

        assert.ok(typesOf(a).includes('use-special-failed'));
        assert.deepEqual(a.specials, [10]);
        assert.equal(lastOfType(b, 'use-special'), undefined);
    });

    test('fails against missing or lost opponents', () => {
        a.specials = [10];
        session.useSpecial(a, { type: 'use-special', specials: [10, 'nobody'] });
        b.lost = true;
        session.useSpecial(a, { type: 'use-special', specials: [10, 'b'] });

        assert.equal(typesOf(a).filter(t => t === 'use-special-failed').length, 2);
        assert.deepEqual(a.specials, [10]);
    });
});

describe('losing and winning', () => {
    test('the last player standing wins and the room resets', () => {
        const { session, changes } = makeSession();
        const [a, b, c] = ['a', 'b', 'c'].map(id => makePlayer(session, id));
        startGame(session, a, b, c);
        a.specials = [8];

        session.playerLost(a, { type: 'state-lost' });
        assert.equal(session.status, Status.session.running, 'two players still alive');
        assert.equal(lastOfType(b, 'state-lost').clientId, 'a');

        const before = changes.count;
        mock.timers.tick(65000);
        session.playerLost(b, { type: 'state-lost' });

        const winner = lastOfType(c, 'state-winner');
        assert.equal(winner.winner, 'c');
        assert.equal(winner.gameTime, '1m:5s');
        assert.equal(session.status, Status.session.waiting);
        assert.deepEqual([a.lost, b.lost, c.lost], [false, false, false]);
        assert.equal(c.status, Status.client.seated);
        assert.deepEqual(a.specials, []);
        assert.ok(changes.count > before);
    });

    test('nobody wins when the only player loses', () => {
        const { session } = makeSession();
        const a = makePlayer(session, 'a');
        startGame(session, a);

        session.playerLost(a, { type: 'state-lost' });

        assert.equal(lastOfType(a, 'state-winner').winner, 'no-winner');
        assert.equal(session.status, Status.session.waiting);
    });

    test('only seated, ready players can lose', () => {
        const { session } = makeSession();
        const [a, spectator] = ['a', 'spectator'].map(id => makePlayer(session, id));
        startGame(session, a);

        session.playerLost(spectator, { type: 'state-lost' });

        assert.equal(spectator.lost, false);
        assert.equal(session.status, Status.session.running);
    });

    test('registered players have their longest game recorded', () => {
        const { session, store } = makeSession();
        const [a, b] = [makePlayer(session, 'a', 1600), makePlayer(session, 'b', 1600)];
        startGame(session, a, b);

        mock.timers.tick(5000);
        session.playerLost(a, { type: 'state-lost' });

        assert.deepEqual(store.calls.gameLength, [['a', 5000], ['b', 5000]]);
    });

    test('guests do not get a game length recorded', () => {
        const { session, store } = makeSession();
        const [a, b] = ['a', 'b'].map(id => makePlayer(session, id));
        startGame(session, a, b);

        session.playerLost(a, { type: 'state-lost' });

        assert.deepEqual(store.calls.gameLength, []);
    });
});

describe('ranked scoring', () => {
    function rankedGame(winnerPoints, loserPoints) {
        const ctx = makeSession({ name: 'Ranked', ranking: 'yes' });
        const winner = makePlayer(ctx.session, 'winner', winnerPoints);
        const loser = makePlayer(ctx.session, 'loser', loserPoints);
        startGame(ctx.session, winner, loser);
        ctx.session.playerLost(loser, { type: 'state-lost' });
        return { ...ctx, winner, loser };
    }

    test('equal ratings move 25 points', () => {
        const { store, winner, loser } = rankedGame(1600, 1600);

        assert.deepEqual(store.calls.loss, [['loser', 25]]);
        assert.deepEqual(store.calls.win, [['winner', 25]]);
        assert.equal(winner.points, 1625);
        assert.equal(loser.points, 1575);
        assert.equal(store.calls.log[0].winner, 'winner');
        assert.deepEqual(JSON.parse(store.calls.log[0].players), [
            { name: 'winner', points: 1600 },
            { name: 'loser', points: 1600 }
        ]);
    });

    test('losing to a much stronger player costs at least 4 points', () => {
        const { store } = rankedGame(1600, 100);
        assert.deepEqual(store.calls.loss, [['loser', 4]]);
    });

    test('losing to a much weaker player costs at most 50 points', () => {
        const { store } = rankedGame(100, 1600);
        assert.deepEqual(store.calls.loss, [['loser', 50]]);
    });

    test('everyone is told the new scores', () => {
        const { winner, loser } = rankedGame(1600, 1600);

        const scores = lastOfTypeScores(winner);
        assert.deepEqual(scores, lastOfTypeScores(loser));
        assert.deepEqual(scores.players, [
            { name: 'loser', pointsLost: 25, newPoints: 1575 },
            { name: 'winner', pointsWon: 25, newPoints: 1625 }
        ]);
    });

    test('unranked games do not touch scores', () => {
        const { session, store } = makeSession();
        const [a, b] = [makePlayer(session, 'a', 1600), makePlayer(session, 'b', 1600)];
        startGame(session, a, b);
        session.playerLost(b, { type: 'state-lost' });

        assert.deepEqual(store.calls.win, []);
        assert.deepEqual(store.calls.loss, []);
        assert.deepEqual(store.calls.log, []);
        assert.equal(a.points, 1600);
    });

    function lastOfTypeScores(client) {
        return client.socket.messages.filter(m => m.type === 'update-scores').pop();
    }
});

describe('leaving', () => {
    test('tells the others and removes the player', () => {
        const { session } = makeSession();
        const [a, b] = ['a', 'b'].map(id => makePlayer(session, id));

        const empty = session.playerLeft(a);

        assert.equal(empty, false);
        assert.ok(!session.clients.has(a));
        assert.equal(lastOfType(b, 'server-message').msg, 'a left the room');
        assert.deepEqual(lastOfType(b, 'session-broadcast').peers.clients, []);
    });

    test('reports an empty session when the last player leaves', () => {
        const { session } = makeSession();
        const a = makePlayer(session, 'a');

        assert.equal(session.playerLeft(a), true);
    });

    test('a seated player leaving a running game loses it, so the opponent wins', () => {
        const { session } = makeSession();
        const [a, b] = ['a', 'b'].map(id => makePlayer(session, id));
        startGame(session, a, b);

        session.playerLeft(a);

        assert.equal(lastOfType(b, 'state-lost').clientId, 'a');
        assert.equal(lastOfType(b, 'state-winner').winner, 'b');
        assert.equal(session.status, Status.session.waiting);
    });

    test('a spectator leaving does not affect a running game', () => {
        const { session } = makeSession();
        const [a, b, spectator] = ['a', 'b', 'spectator'].map(id => makePlayer(session, id));
        startGame(session, a, b);

        session.playerLeft(spectator);

        assert.equal(session.status, Status.session.running);
        assert.equal(a.lost, false);
    });

    test('a seated player leaving while waiting is not a loss', () => {
        const { session } = makeSession();
        const [a, b] = ['a', 'b'].map(id => makePlayer(session, id));
        seat(session, a);

        session.playerLeft(a);

        assert.equal(lastOfType(b, 'state-lost'), undefined);
        assert.equal(session.status, Status.session.waiting);
    });

    test('bots are removed when the last human leaves', () => {
        const { session } = makeSession();
        const human = makePlayer(session, 'human');
        const bot = fakeBot(session, '#Bot-0');

        const empty = session.playerLeft(human);

        assert.equal(empty, true);
        assert.equal(bot.stop, true);
        assert.equal(session.clients.size, 0);
    });

    test('bots stay while a human remains', () => {
        const { session } = makeSession();
        const [a, b] = ['a', 'b'].map(id => makePlayer(session, id));
        const bot = fakeBot(session, '#Bot-0');

        session.playerLeft(a);

        assert.ok(session.clients.has(bot));
        assert.ok(session.clients.has(b));
    });

    test('dispose stops the countdown and speed-up timers', () => {
        const { session } = makeSession();
        const a = makePlayer(session, 'a');
        startGame(session, a);
        session.countDown();

        session.dispose();

        assert.equal(session.timer, null);
        assert.equal(session.blockSpeedIntervall, null);
    });
});
