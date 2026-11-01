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

describe('bot specials decision and usage', () => {
    function createOpponent(id, rowsCount, maxHeight, specialsOnBoard, mineCount, bottomMine) {
        const matrix = Array.from({ length: 22 }, () => Array(10).fill(0));
        const startY = 22 - (maxHeight || rowsCount || 0);
        for (let y = startY; y < 22; y++) {
            matrix[y].fill(1);
            matrix[y][0] = 0; // leave a hole
        }
        if (bottomMine) {
            matrix[21][5] = 19;
        }
        if (mineCount) {
            for (let i = 0; i < mineCount; i++) {
                matrix[21 - i][1] = 19;
            }
        }
        if (specialsOnBoard) {
            for (let i = 0; i < specialsOnBoard; i++) {
                matrix[21 - i][2] = 8;
            }
        }
        return {
            id,
            lost: false,
            specials: [],
            state: { arena: { matrix } },
            send: () => {}
        };
    }

    test('Add row (8) targets the highest opponent', () => {
        const { bot } = sessionWithBot();
        const oppLow = createOpponent('oppLow', 3, 3);
        const oppHigh = createOpponent('oppHigh', 10, 10);
        bot.opponents = [oppLow, oppHigh];

        const decision = bot.decideSpecial(8);
        assert.equal(decision.use, true);
        assert.equal(decision.target.id, 'oppHigh');
    });

    test('Remove row (9) targets self when bottom row has a mine', () => {
        const { bot } = sessionWithBot();
        const opp = createOpponent('opp', 5, 5);
        bot.opponents = [opp];
        bot.grid.cells[21][3] = 19; // mine on bottom row

        const decision = bot.decideSpecial(9);
        assert.equal(decision.use, true);
        assert.equal(decision.target, bot);
    });

    test('Remove row (9) targets opponent if opponent has bottom specials and bot is safe', () => {
        const { bot } = sessionWithBot();
        const opp = createOpponent('opp', 3, 3);
        opp.state.arena.matrix[21][4] = 10; // special on bottom row
        bot.opponents = [opp];

        const decision = bot.decideSpecial(9);
        assert.equal(decision.use, true);
        assert.equal(decision.target.id, 'opp');
    });

    test('Earthquake (10) and Shotgun (13) target opponent with highest row count', () => {
        const { bot } = sessionWithBot();
        const oppA = createOpponent('oppA', 2, 2);
        const oppB = createOpponent('oppB', 8, 8);
        bot.opponents = [oppA, oppB];

        const dEarthquake = bot.decideSpecial(10);
        assert.equal(dEarthquake.use, true);
        assert.equal(dEarthquake.target.id, 'oppB');

        const dShotgun = bot.decideSpecial(13);
        assert.equal(dShotgun.use, true);
        assert.equal(dShotgun.target.id, 'oppB');
    });

    test('Clear specials (12) disarms mines on bot board', () => {
        const { bot } = sessionWithBot();
        const opp = createOpponent('opp', 8, 8, 3);
        bot.opponents = [opp];
        bot.grid.cells[18][2] = 19; // bot has a mine

        const decision = bot.decideSpecial(12);
        assert.equal(decision.use, true);
        assert.equal(decision.target, bot);
    });

    test('Clear specials (12) targets opponent with specials on board when bot is clean', () => {
        const { bot } = sessionWithBot();
        const oppA = createOpponent('oppA', 5, 5, 0);
        const oppB = createOpponent('oppB', 5, 5, 3); // 3 specials on board
        bot.opponents = [oppA, oppB];

        const decision = bot.decideSpecial(12);
        assert.equal(decision.use, true);
        assert.equal(decision.target.id, 'oppB');
    });

    test('Gravity (14) and Clear arena (15) always target self and help when needed', () => {
        const { bot } = sessionWithBot();
        const opp = createOpponent('opp', 10, 10);
        bot.opponents = [opp];

        // Give bot holes
        bot.grid.cells[20][0] = 1; // block above
        bot.grid.cells[21][0] = 0; // hole below

        const dGravity = bot.decideSpecial(14);
        assert.equal(dGravity.use, true);
        assert.equal(dGravity.target, bot);

        // Clear arena is used on self when board has mines or high clutter
        bot.grid.cells[21][5] = 19;
        const dClear = bot.decideSpecial(15);
        assert.equal(dClear.use, true);
        assert.equal(dClear.target, bot);
    });

    test('Switch arena (16) swaps only when bot is in danger and opponent is much cleaner', () => {
        const { bot } = sessionWithBot();
        const cleanOpp = createOpponent('cleanOpp', 1, 1);
        bot.opponents = [cleanOpp];

        // When bot is clean, holding Switch arena
        const dHold = bot.decideSpecial(16);
        assert.equal(dHold.use, false);

        // When bot has mine and high clutter, swap with clean opponent
        bot.grid.cells[21][2] = 19;
        for (let y = 10; y < 22; y++) bot.grid.cells[y].fill(1);
        const dSwap = bot.decideSpecial(16);
        assert.equal(dSwap.use, true);
        assert.equal(dSwap.target.id, 'cleanOpp');
    });

    test('Monster (17) targets opponent with low board, holds if opponents are already high', () => {
        const { bot } = sessionWithBot();
        const oppLow = createOpponent('oppLow', 4, 4);
        const oppHigh = createOpponent('oppHigh', 15, 15);
        bot.opponents = [oppLow, oppHigh];

        const dMonster = bot.decideSpecial(17);
        assert.equal(dMonster.use, true);
        assert.equal(dMonster.target.id, 'oppLow');

        // If only oppHigh remains, hold Monster so as not to clear their top rows
        bot.opponents = [oppHigh];
        assert.equal(bot.decideSpecial(17).use, false);
    });

    test('Mini bomb (18) targets opponent with specials on board, holds if no specials exist', () => {
        const { bot } = sessionWithBot();
        const oppEmpty = createOpponent('oppEmpty', 5, 5, 0);
        bot.opponents = [oppEmpty];

        assert.equal(bot.decideSpecial(18).use, false);

        const oppWithSpecials = createOpponent('oppSpecials', 5, 5, 2);
        bot.opponents = [oppEmpty, oppWithSpecials];

        const dMine = bot.decideSpecial(18);
        assert.equal(dMine.use, true);
        assert.equal(dMine.target.id, 'oppSpecials');
    });

    test('handles empty opponents gracefully without error', () => {
        const { bot } = sessionWithBot();
        bot.opponents = [];
        bot.specials = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

        for (const s of [8, 10, 11, 13, 16, 17, 18]) {
            assert.doesNotThrow(() => {
                const res = bot.decideSpecial(s);
                assert.equal(res.use, false);
            });
        }
    });
});

describe('bot AI multi-row clearing for specials', () => {
    const AI = require('../game/ai/ai');
    const Grid = require('../game/ai/grid');
    const Piece = require('../game/ai/piece');

    test('AI recognizes that clearing 2 rows earns a special and favors multi-row clear', () => {
        const ai = new AI(0.510066, 0.760666, 0.35663, 0.184483);
        const grid = new Grid(22, 10);

        // Fill bottom two rows leaving columns 8 and 9 open for a 2x2 'O' piece
        for (let c = 0; c < 8; c++) {
            grid.cells[21][c] = 1;
            grid.cells[20][c] = 1;
        }

        const pieces = [Piece.fromIndex('O'), Piece.fromIndex('T')];
        const best = ai.best(grid, pieces);

        assert.ok(best != null);
        // Column 8 places the 2x2 'O' piece into columns 8 and 9, clearing both rows at once!
        assert.equal(best.column, 8);
    });

    test('AI strictly avoids completing rows that contain mines', () => {
        const ai = new AI(0.510066, 0.760666, 0.35663, 0.184483);
        const grid = new Grid(22, 10);

        // Fill row 21 except column 0, and place a lethal mine in row 21
        for (let c = 1; c < 10; c++) grid.cells[21][c] = 1;
        grid.cells[21][5] = 19; // lethal mine!

        // Piece 'I' could drop into column 0 and complete the row with the mine
        const pieces = [Piece.fromIndex('I'), Piece.fromIndex('T')];
        const best = ai.best(grid, pieces);

        // Best move should NOT complete row 21 with the mine
        const testGrid = grid.clone();
        testGrid.addPiece(best);
        while (best.moveDown(testGrid));
        testGrid.addPiece(best);
        assert.equal(testGrid.isLine(21), false, 'Must not complete line with mine');
    });
});
