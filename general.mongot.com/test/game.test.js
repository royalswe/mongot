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
    assert.equal(table.broadcasts.filter((entry) => entry.event === 'action_log').pop().args[0].type, 'deploy');
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

test('rejoining does not reset the active phase deadline', (t) => {
    const {table, attacker} = startTurn(t);
    const deadline = table.info().phaseDeadline;
    assert.equal(deadline, table.clock.now() + 122000);

    table.clock.advance(45000);
    const returning = fakeSocket(attacker);
    table.board.returningPlayer(returning);

    assert.equal(table.info().phaseDeadline, deadline);
    table.clock.advance(77000);
    assert.equal(table.phase(), 'Battle');
    assert.equal(table.info().phaseDeadline, table.clock.now() + 122000);
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
    assert.equal(table.info().disabledCountries[0].defeatedColor, table.player(defender).color);
    assert.equal(table.broadcasts.filter((entry) => entry.event === 'render_disabled_countries').pop().args[0][0].defeatedColor, table.player(defender).color);
    assert.deepEqual(table.broadcasts.filter((entry) => entry.event === 'dice_log').pop().args, [[[6, 6, 6]], [[1]]]);
    assert.equal(table.messages('attack').pop().message, 'Attacker lost 0 troops<br>Defender lost 1 troops');
    assert.equal(table.broadcasts.filter((entry) => entry.event === 'action_log').pop().args[0].captured, true);
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
    assert.deepEqual(table.broadcasts.filter((entry) => entry.event === 'move_animation').pop().args, [from, to, 3]);
    assert.deepEqual(table.broadcasts.filter((entry) => entry.event === 'action_log').pop().args[0], {
        type: 'move', player: table.player(attacker).username, color: table.player(attacker).color,
        from: from, to: to, units: 3, timestamp: table.clock.now()
    });
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
    assert.equal(table.player(1).username, 'Sentinel');
    assert.equal(table.sockets[1].can('surrender'), false);
    assert(table.broadcasts.some((entry) => entry.event === 'bot_takeover' && entry.args[0].reason === 'surrender'));
    assert.match(table.messages('serverMessage').pop().message, /Player1 surrendered/);
});

test('takeover bot names get a suffix when already used in the room', (t) => {
    const {table} = startTurn(t);
    table.player(0).username = 'Sentinel';
    table.sockets[1].act('surrender');

    assert.equal(table.player(1).username, 'Sentinel-2');
});

test('a surrendered player leaving does not interrupt the bot that replaced them', (t) => {
    const {table} = startTurn(t);
    table.sockets[1].act('surrender');
    const messageCount = table.messages('serverMessage').length;

    table.board.playerDisconnected(table.sockets[1]);

    assert.equal(table.player(1).lost, false);
    assert.equal(table.messages('serverMessage').length, messageCount, 'no reconnect countdown is announced');
});

test('a game reports whether any seat is still played by a human', (t) => {
    const {table} = startTurn(t);
    table.board.playerDisconnected(table.sockets[0]);
    assert.equal(table.board.hasHumanPlayers(), true, 'a dropped player inside the grace period still counts');

    table.sockets.slice(1).forEach((socket) => table.board.playerDisconnected(socket));
    table.clock.advance(30000);

    assert.equal(table.board.hasHumanPlayers(), false);
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

test('an active player who reconnects can act in the current turn phase', (t) => {
    const {table, attacker} = startTurn(t);
    const reconnect = () => {
        const socket = fakeSocket(attacker);
        table.board.returningPlayer(socket);
        return socket;
    };

    let socket = reconnect();
    assert(socket.can('deploy'));
    assert(socket.can('next_turn'));
    assert(socket.sent.some((message) => message.type === 'current_player' && message.bool));

    socket.act('next_turn');
    socket = reconnect();
    assert.equal(table.phase(), 'Battle');
    assert(socket.can('battle'));
    assert(socket.can('next_turn'));
    assert(socket.sent.some((message) => message.type === 'current_player' && message.bool));

    socket.act('next_turn');
    socket = reconnect();
    assert.equal(table.phase(), 'Tactical move');
    assert(socket.can('tactical_move'));
    assert(socket.can('next_turn'));
    assert(socket.sent.some((message) => message.type === 'current_player' && message.bool));
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

test('an abandoned match charges a loss to each player a bot replaced, without a rating change', (t) => {
    const {table} = startTurn(t, {seats: [{}, {}, {}]});
    table.sockets[1].act('surrender');
    table.sockets[2].act('surrender');
    const pointsBefore = table.sockets.map((socket) => socket.points);

    assert.deepEqual(table.board.abandon(), ['Player1', 'Player2']);
    assert.deepEqual(table.sockets.map((socket) => socket.points), pointsBefore);
    assert.equal(table.board.isOver(), true);
    assert.deepEqual(table.board.abandon(), [], 'nothing is charged twice');
});

test('a finished match is not charged again when its room closes', (t) => {
    const {table} = startTurn(t, {seats: [{}, {}, {}]});
    table.sockets[1].act('surrender');
    table.player(1).lost = true;
    table.player(2).lost = true;
    table.pass(); table.pass(); table.pass();
    assert.equal(table.board.isOver(), true);

    assert.deepEqual(table.board.abandon(), []);
});

test('without bots, the last opponent giving up wins the match for the other player', (t) => {
    const {table} = startTurn(t, {allowBots: false});
    const quitter = 1 - table.active();
    table.sockets[quitter].act('surrender');

    assert.equal(table.board.isOver(), true);
    assert(!table.broadcasts.some((entry) => entry.event === 'bot_takeover'));
    assert.match(table.messages('game_over')[0].message, new RegExp('Player' + (1 - quitter) + ' won'));
    assert(table.messages('game_over').some((message) => new RegExp('Player' + quitter + ' lost').test(message.message)));
});

test('without bots, a player who gives up drops out and keeps their territories on the map', (t) => {
    const {table} = startTurn(t, {seats: [{}, {}, {}], allowBots: false});
    const quitter = (table.active() + 1) % 3;
    const territories = table.player(quitter).countries.length;
    table.sockets[quitter].act('surrender');

    assert.equal(table.board.isOver(), false);
    assert.equal(table.player(quitter).lost, true);
    assert.equal(table.player(quitter).username, 'Player' + quitter, 'no bot took the seat');
    assert.equal(table.player(quitter).countries.length, territories);
    assert(!table.broadcasts.some((entry) => entry.event === 'bot_takeover'));
    assert.match(table.messages('serverMessage').pop().message, /surrendered and is out of the game/);

    for (let turn = 0; turn < 6; turn += 1) {
        assert.notEqual(table.active(), quitter, 'a retired player never gets a turn');
        table.pass(); table.pass(); table.pass();
    }
});

test('without bots, an active player giving up passes the turn on', (t) => {
    const {table} = startTurn(t, {seats: [{}, {}, {}], allowBots: false});
    const quitter = table.active();
    table.sockets[quitter].act('surrender');

    assert.notEqual(table.active(), quitter);
    assert.equal(table.phase(), 'Deploy');
});

test('without bots, a player who does not return in time sits out instead of getting a bot', (t) => {
    const {table} = startTurn(t, {seats: [{}, {}, {}], allowBots: false});
    const leaver = (table.active() + 1) % 3;
    table.board.playerDisconnected(table.sockets[leaver]);
    assert.match(table.messages('serverMessage').pop().message, /30 seconds to return or leaves the game/);

    table.clock.advance(30000);

    assert.equal(table.player(leaver).lost, true);
    assert.equal(table.player(leaver).username, 'Player' + leaver);
    assert(!table.broadcasts.some((entry) => entry.event === 'bot_takeover'));
    assert.match(table.messages('serverMessage').pop().message, /sits out until they rejoin/);
});

test('without bots, a player who lost connection can reclaim their seat at any time and plays on', (t) => {
    const {table} = startTurn(t, {seats: [{}, {}, {}], allowBots: false});
    const leaver = (table.active() + 1) % 3;
    table.board.playerDisconnected(table.sockets[leaver]);
    table.clock.advance(5 * 60000);

    const returning = fakeSocket(leaver);
    table.board.returningPlayer(returning);
    table.sockets[leaver] = returning;

    assert.equal(table.player(leaver).lost, false);
    assert(returning.sent.some((message) => message.type === 'player_rejoin'));
    assert.match(table.messages('serverMessage').pop().message, /Player\d is back and has retaken their seat/);
    let turns = 0;
    while (table.active() !== leaver && turns++ < 3) { table.pass(); table.pass(); table.pass(); }
    assert.equal(table.active(), leaver, 'the returning player gets turns again');
    assert(returning.can('deploy'));
});

for (const allowBots of [true, false]) {
    test('a player who gave up can never reclaim the seat (' + (allowBots ? 'bots' : 'no bots') + ')', (t) => {
        const {table} = startTurn(t, {seats: [{}, {}, {}], allowBots: allowBots});
        const quitter = (table.active() + 1) % 3;
        table.sockets[quitter].act('surrender');
        const before = table.player(quitter).username;

        const returning = fakeSocket(quitter);
        table.board.returningPlayer(returning);

        assert.equal(table.player(quitter).username, before);
        assert(!returning.sent.some((message) => message.type === 'player_rejoin'));
        assert(!returning.can('surrender'));
    });
}

test('a player returning while their stand-in bot is mid-turn takes over that turn safely', (t) => {
    const {table} = startTurn(t, {seats: [{}, {}, {}]});
    const leaver = (table.active() + 1) % 3;
    table.board.playerDisconnected(table.sockets[leaver]);
    table.clock.advance(30000);
    assert.equal(table.player(leaver).botControlled, true);
    while (table.active() !== leaver) { table.pass(); table.pass(); table.pass(); }
    for (let step = 0; step < 200 && table.phase() !== 'Battle'; step += 1) { table.clock.advance(50); }
    assert.equal(table.phase(), 'Battle');

    const returning = fakeSocket(leaver);
    table.board.returningPlayer(returning);
    table.clock.advance(10000); // well past every queued bot step

    assert.equal(table.active(), leaver);
    assert.equal(table.phase(), 'Battle', 'the bot did not end the returning player\'s phase');
    assert.equal(table.player(leaver).username, 'Player' + leaver);
    assert(returning.can('battle'));
});

test('without bots, a player giving up during the opening deploy lets the others continue', (t) => {
    const table = createTable({seats: [{}, {}, {}], allowBots: false});
    t.after(table.close);
    [0, 1].forEach((id) => {
        while (table.player(id).gold >= 3) {
            table.sockets[id].act('everyone_deploy', table.player(id).countries[0].id, id);
        }
    });
    assert.equal(table.phase(), 'Everyone deploy');

    table.sockets[2].act('surrender');

    assert.equal(table.phase(), 'Deploy');
});

test('without bots, a rematch seats only the players still at the table', (t) => {
    const {table} = startTurn(t, {seats: [{}, {}, {}], allowBots: false});
    const players = table.board.getRematchPlayers([table.sockets[0], table.sockets[2]]);

    assert.deepEqual(players, [table.sockets[0], table.sockets[2]]);
});

test('the others cannot skip past a disconnected player: the turn waits for them', (t) => {
    const {table} = startTurn(t, {seats: [{}, {}, {}]});
    const leaver = (table.active() + 1) % 3;
    table.board.playerDisconnected(table.sockets[leaver]);

    table.pass(); table.pass(); table.pass();
    assert.equal(table.active(), leaver, 'the turn goes to the disconnected player');
    const gold = table.info().playerList[(leaver + 1) % 3].gold;
    for (let spam = 0; spam < 5; spam += 1) {
        assert.throws(() => table.sockets[(leaver + 1) % 3].act('next_turn'), 'only the active seat can end the phase');
    }
    assert.equal(table.info().playerList[(leaver + 1) % 3].gold, gold);
    assert.equal(table.active(), leaver);
});

test('an active player who disconnects keeps the turn until their reconnect window ends', (t) => {
    const {table} = startTurn(t, {seats: [{}, {}, {}]});
    const leaver = table.active();
    table.board.playerDisconnected(table.sockets[leaver]);
    assert.equal(table.active(), leaver);
    assert.equal(table.phase(), 'Deploy');

    const returning = fakeSocket(leaver);
    table.clock.advance(20000);
    table.board.returningPlayer(returning);
    assert.equal(table.active(), leaver);
    assert(returning.can('next_turn'), 'the returning player can carry on with their turn');
});

test('with bots, a stand-in plays the waiting turn once the reconnect window ends', (t) => {
    const {table} = startTurn(t, {seats: [{}, {}, {}]});
    const leaver = (table.active() + 1) % 3;
    table.board.playerDisconnected(table.sockets[leaver]);
    table.pass(); table.pass(); table.pass();
    assert.equal(table.active(), leaver);

    table.clock.advance(30000);
    assert.equal(table.player(leaver).botControlled, true);
    for (let step = 0; step < 400 && table.active() === leaver; step += 1) { table.clock.advance(100); }
    assert.notEqual(table.active(), leaver, 'the stand-in finished the turn');
});

test('without bots, the waiting turn passes on once the reconnect window ends', (t) => {
    const {table} = startTurn(t, {seats: [{}, {}, {}], allowBots: false});
    const leaver = (table.active() + 1) % 3;
    table.board.playerDisconnected(table.sockets[leaver]);
    table.pass(); table.pass(); table.pass();
    assert.equal(table.active(), leaver);

    table.clock.advance(30000);
    assert.equal(table.active(), (leaver + 1) % 3);
    assert.equal(table.phase(), 'Deploy');
});

test('a stand-in bot plays at the rating of the player it replaced', (t) => {
    const {table} = startTurn(t, {seats: [{points: 1234}, {points: 1700}]});
    table.sockets[1].act('surrender');

    const standIn = table.board.getRoomPlayers()[1];
    assert.equal(standIn.isBot, true);
    assert.equal(standIn.points, 1700);
});

function finishWithWinner(table, winner) {
    Object.keys(table.info().playerList).forEach((id) => {
        if (Number(id) !== winner) { table.player(id).lost = true; }
    });
    for (let step = 0; step < 10 && !table.board.isOver(); step += 1) { table.pass(); }
    assert.equal(table.board.isOver(), true);
}

test('opponents are rated against the original rating of a seat a bot took over', (t) => {
    const {table} = startTurn(t, {seats: [{points: 1600}, {points: 1600}]});
    table.sockets[1].act('surrender');
    while (table.active() !== 0) { table.pass(); }
    finishWithWinner(table, 0);

    assert.equal(table.sockets[0].points, 1616, 'an even win against the 1600 seat, not against an 850 bot');
    assert.equal(table.sockets[1].points, 1584);
    assert(table.messages('game_over').some((message) => /stand-in for Player1 \(unrated\)/.test(message.message)));
});

test('a player who left takes a loss even when their stand-in bot wins', (t) => {
    const {table} = startTurn(t, {seats: [{points: 1600}, {points: 1600}, {points: 1600}]});
    table.sockets[1].act('surrender');
    table.sockets[2].act('surrender');
    for (let step = 0; step < 2000 && table.active() !== 0; step += 1) { table.clock.advance(100); }
    assert.equal(table.active(), 0);
    table.player(0).lost = true;
    table.player(2).lost = true;
    table.pass(); // the stand-in for Player1 is now the only seat left
    assert.equal(table.board.isOver(), true);

    assert(table.sockets[1].points < 1600, 'the deserter lost rating');
    assert(table.sockets[2].points < 1600);
    assert(table.sockets[0].points < 1600, 'the player who stayed lost to the winning seat');
    const results = table.messages('game_over').map((message) => message.message).join('\n');
    assert.match(results, /Player1 lost/);
    assert.match(results, /won as a stand-in for Player1/);
});

test('a fast-forwarded bot match plays out without pacing delays', (t) => {
    const table = createTable({
        mapId: 'quick',
        seed: 42,
        seats: [
            {bot: {key: 'raider', username: 'Raider', aggression: 0.75, points_general: 950}},
            {bot: {key: 'warden', username: 'Warden', aggression: 0.5, points_general: 1050}}
        ]
    });
    t.after(table.close);
    table.board.setFastForward(true);

    table.clock.advance(1000); // the opening deploy was queued at normal pace before fast-forward began

    assert.equal(table.board.isOver(), true, 'a match that takes minutes at normal pace finished within a second');
});
