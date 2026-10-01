'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {createTable, incomeOf, fakeSocket} = require('./helpers/table');

function startTurn(t, options) {
    const table = createTable(options);
    t.after(table.close);
    table.finishEveryoneDeploy();
    const attacker = table.active();
    return {table: table, attacker: attacker, defender: 1 - attacker};
}

test('everyone deploys at the same time, then income is paid and the poorest player starts', (t) => {
    const table = createTable();
    t.after(table.close);
    assert.equal(table.phase(), 'Everyone deploy');
    assert.equal(table.player(0).gold, 90);

    const own = table.player(0).countries[0];
    table.sockets[0].act('everyone_deploy', own.id, 0);
    assert.equal(own.units, 2);
    assert.equal(table.player(0).gold, 87);

    const enemy = table.player(1).countries[0];
    table.sockets[0].act('everyone_deploy', enemy.id, 0);
    assert.equal(enemy.units, 1, 'nobody can reinforce a territory they do not hold');
    assert.equal(table.player(0).gold, 87, 'and a refused purchase costs nothing');

    table.finishEveryoneDeploy();
    assert.equal(table.phase(), 'Deploy');
    const incomes = [incomeOf(table, 0), incomeOf(table, 1)];
    const starter = table.active();
    assert.equal(starter, incomes[0] <= incomes[1] ? 0 : 1);
    assert.equal(table.player(starter).gold, incomes[starter] - 9, 'in a two-player game the starter pays three units');
    assert.equal(table.player(1 - starter).gold, incomes[1 - starter]);
    assert(table.sockets[starter].sent.some((message) => message.type === 'enable_player'));
});

test('if nobody finishes deploying, the timer starts the game and still pays income', (t) => {
    const table = createTable();
    t.after(table.close);
    table.clock.advance(122000);
    assert.equal(table.phase(), 'Deploy');
    const waiting = 1 - table.active();
    assert.equal(table.player(waiting).gold, 90 + incomeOf(table, waiting));
});

test('a turn goes deploy, battle, tactical move, then passes to the next player', (t) => {
    const {table, attacker, defender} = startTurn(t);
    assert.equal(table.sockets[defender].can('deploy'), false, 'only the active player can act');

    const country = table.player(attacker).countries[0];
    const units = country.units;
    table.player(attacker).gold = 6;
    table.sockets[attacker].act('deploy', country.id, attacker);
    assert.equal(country.units, units + 1);
    assert.equal(table.player(attacker).gold, 3);
    assert.equal(table.phase(), 'Deploy');

    table.sockets[attacker].act('deploy', country.id, attacker);
    assert.equal(table.phase(), 'Battle', 'running out of gold ends the deploy phase');

    table.pass();
    assert.equal(table.phase(), 'Tactical move');
    assert.equal(table.player(attacker).gold, incomeOf(table, attacker), 'income is paid at the end of the turn');

    table.pass();
    assert.equal(table.phase(), 'Deploy');
    assert.equal(table.active(), defender);
});

test('waiting out the phase timer moves the game on', (t) => {
    const {table} = startTurn(t);
    table.clock.advance(122000);
    assert.equal(table.phase(), 'Battle');
});

test('a won battle takes the territory, which stays inactive until the attacker\'s turn ends', (t) => {
    const {table, attacker, defender} = startTurn(t);
    table.pass();
    const {from, to} = table.border(attacker, defender);
    table.setUnits(from, 4);
    table.setUnits(to, 1);

    table.rollDice([6, 6, 6, 1]);
    table.sockets[attacker].act('battle', from, to, defender, 3);

    assert.equal(table.territory(from).units, 1);
    assert.equal(table.ownerOf(to), -1, 'conquered land belongs to nobody until the turn ends');
    assert.deepEqual(table.info().disabledCountries.map((country) => [country.id, country.units]), [[to, 3]]);
    assert.deepEqual(table.broadcasts.filter((entry) => entry.event === 'dice_log').pop().args, [[[6, 6, 6]], [[1]]]);
    assert.equal(table.messages('attack').pop().message, 'Attacker lost 0 troops<br>Defender lost 1 troops');
    const income = table.sockets[attacker].sent.filter((message) => message.type === 'update_gold_income').pop();
    assert.match(String(income.goldIncome), /^\d+\+\d+$/, 'the conquest shows as bonus income');

    table.pass();
    assert.equal(table.ownerOf(to), attacker);
    assert.equal(table.territory(to).units, 3);
});

test('a lost battle costs the attackers and the defender keeps the land', (t) => {
    const {table, attacker, defender} = startTurn(t);
    table.pass();
    const {from, to} = table.border(attacker, defender);
    table.setUnits(from, 3);
    table.setUnits(to, 2);

    table.rollDice([1, 1, 6, 6]);
    table.sockets[attacker].act('battle', from, to, defender, 2);

    assert.equal(table.territory(from).units, 1);
    assert.equal(table.territory(to).units, 2);
    assert.equal(table.ownerOf(to), defender);
});

test('impossible or forged attacks change nothing', (t) => {
    const {table, attacker, defender} = startTurn(t);
    table.pass();
    const {from, to} = table.border(attacker, defender);
    table.setUnits(from, 5);
    const far = table.player(defender).countries.find((country) => table.territory(from).neighbour.indexOf(country.id) === -1);
    const before = JSON.stringify(table.info().playerList);
    const attack = (...args) => table.sockets[attacker].act('battle', ...args);

    attack(from, to, defender, 5); // every unit, leaving none behind
    attack(from, to, defender, '3');
    attack(from, far.id, defender, 2); // not a neighbour
    attack(from, to, attacker, 2); // names the wrong owner

    assert.equal(JSON.stringify(table.info().playerList), before);
});

test('a tactical move shifts troops between own neighbours and ends the turn', (t) => {
    const {table, attacker, defender} = startTurn(t);
    table.pass();
    table.pass();
    assert.equal(table.phase(), 'Tactical move');
    const {from, to} = table.border(attacker, attacker);
    table.setUnits(from, 5);
    const arriving = table.territory(to).units;

    table.sockets[attacker].act('tactical_move', from, to, attacker, 3);

    assert.equal(table.territory(from).units, 2);
    assert.equal(table.territory(to).units, arriving + 3);
    assert.equal(table.phase(), 'Deploy');
    assert.equal(table.active(), defender);
});

test('impossible or forged tactical moves change nothing', (t) => {
    const {table, attacker, defender} = startTurn(t);
    table.pass();
    table.pass();
    const own = table.border(attacker, attacker);
    const enemy = table.border(attacker, defender);
    table.setUnits(own.from, 5);
    table.setUnits(enemy.from, 5);
    const before = JSON.stringify(table.info().playerList);
    const move = (...args) => table.sockets[attacker].act('tactical_move', ...args);

    move(own.from, own.to, attacker, 5); // every unit
    move(own.from, own.to, attacker, 1.5);
    move(enemy.from, enemy.to, attacker, 2); // into enemy land

    assert.equal(JSON.stringify(table.info().playerList), before);
    assert.equal(table.phase(), 'Tactical move');
});

test('taking the last enemy territory wins a ranked match', (t) => {
    const {table, attacker, defender} = startTurn(t, {mapId: 'quick'});
    table.pass();
    while (table.player(defender).countries.length > 0) {
        const {from, to} = table.border(attacker, defender);
        table.setUnits(from, 4);
        table.setUnits(to, 1);
        table.rollDice([6, 6, 6, 1]);
        table.sockets[attacker].act('battle', from, to, defender, 3);
    }

    assert.equal(table.board.isOver(), true);
    assert.equal(table.phase(), 'Game over');
    const results = table.messages('game_over').map((message) => message.message).join(' ');
    assert.match(results, new RegExp('Player' + attacker + ' won \\(\\+16 rating\\)'));
    assert.match(results, new RegExp('Player' + defender + ' lost \\(-16 rating\\)'));
    assert.equal(table.sockets[attacker].points, 1616);
    assert.equal(table.sockets[defender].points, 1584);
});

test('a match with a guest ends unranked and nobody\'s rating moves', (t) => {
    const {table, attacker, defender} = startTurn(t, {mapId: 'quick', seats: [{}, {isGuest: true}]});
    table.pass();
    while (table.player(defender).countries.length > 0) {
        const {from, to} = table.border(attacker, defender);
        table.setUnits(from, 4);
        table.setUnits(to, 1);
        table.rollDice([6, 6, 6, 1]);
        table.sockets[attacker].act('battle', from, to, defender, 3);
    }
    assert.equal(table.board.isOver(), true);
    assert.deepEqual(table.sockets.map((socket) => socket.points), [1600, 1600]);
    assert(table.sockets[1].sent.some((message) => message.type === 'game_over' && /not ranked/.test(message.message)));
});

test('turns skip players who have been knocked out', (t) => {
    const table = createTable({seats: [{}, {}, {}]});
    t.after(table.close);
    table.finishEveryoneDeploy();
    assert.equal(table.active(), 0);
    table.player(1).lost = true;
    table.pass();
    table.pass();
    table.pass();
    assert.equal(table.active(), 2);
});

test('surrendering hands the faction to a bot', (t) => {
    const {table} = startTurn(t);
    table.sockets[1].act('surrender');

    assert.equal(table.player(1).surrender, true);
    assert.equal(table.player(1).username, 'Relief-test-room-2');
    assert.equal(table.sockets[1].can('surrender'), false);
    assert(table.broadcasts.some((entry) => entry.event === 'bot_takeover' && entry.args[0].reason === 'surrender'));
    assert.match(table.messages('serverMessage').pop().message, /Player1 surrendered/);
});

test('a player who reconnects within the grace period gets their seat back', (t) => {
    const {table} = startTurn(t);
    table.board.playerDisconnected(table.sockets[1]);
    assert.equal(table.player(1).lost, null);
    assert.match(table.messages('serverMessage').pop().message, /Player1 lost connection/);

    const returning = fakeSocket(1);
    table.board.returningPlayer(returning);
    table.clock.advance(30000);

    assert.equal(table.player(1).lost, false);
    assert.equal(table.player(1).username, 'Player1', 'no bot took over');
    assert(returning.sent.some((message) => message.type === 'player_rejoin'));
    assert(returning.sent.some((message) => message.type === 'phase' && /Welcome back Player1/.test(message.phaseMsg)));
});

test('an admin can kick a player out of the game', (t) => {
    const {table} = startTurn(t);
    table.board.kickoutPlayer('Player1');
    assert.equal(table.sockets[1].disconnected, true);
    assert(table.sockets[1].sent.some((message) => /kicked/.test(message.message)));
});

test('bots play whole turns on their own', (t) => {
    const table = createTable({mapId: 'quick', seats: [{bot: {aggression: 1}}, {bot: {aggression: 1}}]});
    t.after(table.close);
    table.clock.advance(5 * 60 * 1000);

    assert.notEqual(table.phase(), 'Everyone deploy');
    assert(table.broadcasts.some((entry) => entry.event === 'dice_log'), 'the bots attacked');
    assert(!table.broadcasts.some((entry) => entry.event === 'error'), 'without server errors');
    assert.equal(table.board.getMapInfo().id, 'quick');
});
