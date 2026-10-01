'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const strategy = require('../game/botStrategy');

// Territories 0-1 belong to player 0 and 2-3 to player 1; 0 borders 1 and 2, 1 borders 0 and 3.
function board() {
    return {
        0: {countries: [{id: 0, units: 5, neighbour: [1, 2]}, {id: 1, units: 1, neighbour: [0, 3]}]},
        1: {countries: [{id: 2, units: 2, neighbour: [0]}, {id: 3, units: 4, neighbour: [1]}]}
    };
}

test('bots reinforce the most threatened, weakest territory', () => {
    assert.equal(strategy.deploymentTarget(board(), 0).id, 1);
});

test('bots attack the best-odds border when the score is not negative', () => {
    assert.deepEqual(strategy.chooseAttack(board(), 0, 0.5), {from: 0, to: 2, defender: 1, units: 4});

    const fortified = board();
    fortified[1].countries[0].units = 9;
    assert.equal(strategy.chooseAttack(fortified, 0, 0.5), null);
    assert.deepEqual(strategy.chooseAttack(fortified, 0, 2), {from: 0, to: 2, defender: 1, units: 4}, 'aggressive bots take worse odds');
});

test('bots move troops toward their own threatened territory', () => {
    assert.deepEqual(strategy.chooseMove(board(), 0), {from: 0, to: 1});
    assert.equal(strategy.chooseMove(board(), 1), null, 'no own neighbour to move to');
});
