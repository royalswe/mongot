'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createTable } = require('./helpers/table');
const botProfiles = require('../game/botProfiles');
const strategy = require('../game/botStrategy');

test('bots play against each other on quick map until game over', (t) => {
    const table = createTable({
        mapId: 'quick',
        seats: [
            { bot: { key: 'raider', username: 'Raider', aggression: 0.75, points_general: 950 } },
            { bot: { key: 'warden', username: 'Warden', aggression: 0.5, points_general: 1050 } }
        ],
        seed: 42
    });
    t.after(table.close);

    // Advance clock until match finishes or reaches timeout
    const step = 500;
    const maxSteps = 1000; // 500 seconds of virtual time
    let steps = 0;
    while (!table.board.isOver() && steps < maxSteps) {
        table.clock.advance(step);
        steps += 1;
    }

    assert.equal(table.board.isOver(), true, 'the match completed to game over');
    assert.equal(table.phase(), 'Game over');

    // Exactly one player won and one lost
    const p0Lost = table.player(0).lost;
    const p1Lost = table.player(1).lost;
    assert.ok(p0Lost !== p1Lost, 'one player won and one lost');

    // No server errors occurred during the game
    const errorEvents = table.broadcasts.filter((entry) => entry.event === 'error');
    assert.deepEqual(errorEvents, [], 'no errors occurred');

    // Game over message was broadcast
    const gameOverMessages = table.messages('game_over');
    assert.ok(gameOverMessages.length > 0, 'game over announcement was broadcast');
});

test('three distinct bot profiles play a 3-player match to completion', (t) => {
    const table = createTable({
        mapId: 'quick',
        seats: [
            { bot: botProfiles[0] }, // Scout
            { bot: botProfiles[1] }, // Raider
            { bot: botProfiles[2] }  // Warden
        ],
        seed: 1337
    });
    t.after(table.close);

    const step = 500;
    const maxSteps = 1500;
    let steps = 0;
    while (!table.board.isOver() && steps < maxSteps) {
        table.clock.advance(step);
        steps += 1;
    }

    assert.equal(table.board.isOver(), true, '3-player match finished');
    assert.equal(table.phase(), 'Game over');

    // A winner was decided, either by elimination or completing a secret mission
    const winners = [0, 1, 2].filter((id) => table.player(id).lost === false);
    assert.ok(winners.length >= 1, 'at least one victor was declared');
    const gameOverMessages = table.messages('game_over');
    assert.ok(gameOverMessages.length > 0, 'game over was announced');
});

test('bots attack multiple times in a single turn when opportunities exist', () => {
    // Player 0 has two strong staging territories (0 and 1) bordering weak enemy territories (2 and 3)
    const board = {
        0: {
            countries: [
                { id: 0, units: 8, neighbour: [1, 2] },
                { id: 1, units: 8, neighbour: [0, 3] }
            ]
        },
        1: {
            countries: [
                { id: 2, units: 1, neighbour: [0] },
                { id: 3, units: 1, neighbour: [1] }
            ]
        }
    };

    // First attack from territory 0
    const attack1 = strategy.chooseAttack(board, 0, 0.5);
    assert.ok(attack1 !== null);
    assert.equal(attack1.defender, 1);

    // Simulate resolution of attack1: territory 0 attacks territory 2 and conquers it
    // Territory 0 is reduced to 1 unit, territory 2 is in disabled countries.
    board[0].countries[0].units = 1;
    board[1].countries = board[1].countries.filter((c) => c.id !== attack1.to);

    // Bot can immediately find the next attack from territory 1 to territory 3
    const attack2 = strategy.chooseAttack(board, 0, 0.5);
    assert.ok(attack2 !== null, 'bot finds second attack');
    assert.equal(attack2.from, 1);
    assert.equal(attack2.to, 3);
});

test('bots do not make suicidal attacks against heavily fortified defenders', () => {
    const board = {
        0: { countries: [{ id: 0, units: 3, neighbour: [1] }] },
        1: { countries: [{ id: 1, units: 10, neighbour: [0] }] }
    };
    // 2 attacking units vs 10 defenders is hopeless
    assert.equal(strategy.chooseAttack(board, 0, 0.5), null);
    assert.equal(strategy.chooseAttack(board, 0, 0.75), null);
});

test('bots prioritize completing and breaking continents', () => {
    // Map with a 2-country continent [0, 1] worth 10 gold
    const continents = [{ continent: 'valuable', gold: 10, countries: [0, 1] }];

    // Player 0 owns territory 0 and borders territory 1 (owned by player 1)
    // and also borders territory 2 (neutral/other continent)
    const board = {
        0: {
            countries: [
                { id: 0, units: 6, neighbour: [1, 2] }
            ]
        },
        1: {
            countries: [
                { id: 1, units: 2, neighbour: [0] },
                { id: 2, units: 2, neighbour: [0] }
            ]
        }
    };

    // The attack that completes the continent (territory 1) should be prioritized over territory 2
    const attack = strategy.chooseAttack(board, 0, 0.5, continents);
    assert.equal(attack.to, 1, 'prioritizes conquering territory 1 to complete valuable continent');
});

test('bots prioritize defending continent chokepoints during deployment', () => {
    const continents = [
        { continent: 'base', gold: 10, countries: [0, 1] }
    ];

    // Player 0 owns [0, 1]. Territory 0 has an enemy neighbor, territory 1 is safe/interior.
    const board = {
        0: {
            countries: [
                { id: 0, units: 2, neighbour: [1, 2] },
                { id: 1, units: 2, neighbour: [0] }
            ]
        },
        1: {
            countries: [
                { id: 2, units: 4, neighbour: [0] }
            ]
        }
    };

    const target = strategy.deploymentTarget(board, 0, continents);
    assert.equal(target.id, 0, 'deploys to the exposed border territory of the continent, not the interior');
});

test('tactical move transfers idle interior units to the border', () => {
    const board = {
        0: {
            countries: [
                { id: 0, units: 10, neighbour: [1] },    // Safe interior: 0 enemy borders
                { id: 1, units: 2, neighbour: [0, 2] }   // Frontline: borders enemy territory 2
            ]
        },
        1: {
            countries: [
                { id: 2, units: 5, neighbour: [1] }
            ]
        }
    };

    const move = strategy.chooseMove(board, 0);
    assert.ok(move !== null);
    assert.equal(move.from, 0);
    assert.equal(move.to, 1);
    assert.ok(move.units >= 8, 'transfers all surplus units from safe interior');
});

test('win probability accurately models combat advantages', () => {
    const prob = strategy.winProbability;
    // Overwhelming advantage
    assert.ok(prob(10, 1) > 0.99);
    assert.ok(prob(10, 2) > 0.95);
    // Moderate advantage
    assert.ok(prob(5, 2) > prob(3, 2));
    assert.ok(prob(4, 2) > 0.60);
    // Even/Deficit
    assert.ok(prob(2, 2) < 0.40 && prob(2, 2) > 0.30);
    assert.ok(prob(2, 5) < 0.10);
    assert.ok(prob(1, 5) < 0.05);
    assert.ok(prob(1, 10) < 0.005);
});

test('bot actions are spaced with delays so human players can track gameplay', (t) => {
    // 2-bot match on quick map
    const table = createTable({
        mapId: 'quick',
        seats: [
            { bot: { aggression: 0.5 } },
            { bot: { aggression: 0.5 } }
        ],
        seed: 777
    });
    t.after(table.close);

    // Initial setup phase
    assert.equal(table.phase(), 'Everyone deploy');
    table.clock.advance(150); // initial 120ms completes everyone_deploy
    assert.notEqual(table.phase(), 'Everyone deploy');

    // Bot's regular turn starts in Deploy phase
    assert.equal(table.phase(), 'Deploy');
    const ap = table.active();

    // At 50ms, bot has not skipped immediately to Battle; it pauses so player can see Deploy
    table.clock.advance(50);
    assert.equal(table.phase(), 'Deploy', 'still in deploy phase after 50ms');

    // Advancing through deploy step and end delay moves to Battle
    table.clock.advance(1200);
    assert.equal(table.phase(), 'Battle', 'transitioned to battle phase after paced deploy');

    // At 100ms into Battle, bot is still in Battle phase (not instantly skipping to Tactical move)
    table.clock.advance(100);
    assert.equal(table.phase(), 'Battle', 'paces battle attacks so animations and dice log can be seen');
});
