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

test('bots split attacks from a single large army to conquer multiple surrounding countries', () => {
    // Territory 0 has 10 units and borders two weak enemy territories: 2 (1 unit) and 3 (1 unit)
    const multiBorderBoard = {
        0: {
            countries: [
                { id: 0, units: 10, neighbour: [2, 3] }
            ]
        },
        1: {
            countries: [
                { id: 2, units: 1, neighbour: [0] },
                { id: 3, units: 1, neighbour: [0] }
            ]
        }
    };

    // First attack from territory 0: should NOT send all 9 available units!
    // It budgets units (e.g. 4) so that units remain to conquer the other surrounding country.
    const attack1 = strategy.chooseAttack(multiBorderBoard, 0, 0.5);
    assert.ok(attack1 !== null, 'finds first attack');
    assert.equal(attack1.from, 0);
    assert.ok(attack1.to === 2 || attack1.to === 3);
    assert.ok(attack1.units < 9, 'does not attack with everything; reserves units for surrounding country');
    assert.ok(attack1.units >= 3, 'sends enough units for high-confidence win');

    // Simulate resolution of attack1:
    // Units sent are deducted from territory 0, target is conquered and removed from player 1
    const targetConquered = attack1.to;
    const remainingEnemy = targetConquered === 2 ? 3 : 2;
    multiBorderBoard[0].countries[0].units = 10 - attack1.units;
    multiBorderBoard[1].countries = multiBorderBoard[1].countries.filter((c) => c.id !== targetConquered);

    // Territory 0 still has surplus units (>= 3) and can immediately attack the second surrounding country!
    assert.ok(multiBorderBoard[0].countries[0].units >= 3, 'territory 0 still has attacking army');
    const attack2 = strategy.chooseAttack(multiBorderBoard, 0, 0.5);
    assert.ok(attack2 !== null, 'finds second attack on remaining surrounding country');
    assert.equal(attack2.from, 0);
    assert.equal(attack2.to, remainingEnemy);
    assert.equal(attack2.units, multiBorderBoard[0].countries[0].units - 1, 'commits remaining surplus for final conquest');
});

test('bots distribute deployments broadly across multiple frontlines instead of over-stacking one army', () => {
    // Player 0 has territory 0 (already saturated with 6 units) and territory 1 (only 1 unit)
    // Both border enemy territories
    const broadBoard = {
        0: {
            countries: [
                { id: 0, units: 6, neighbour: [2] },
                { id: 1, units: 1, neighbour: [3] }
            ]
        },
        1: {
            countries: [
                { id: 2, units: 1, neighbour: [0] },
                { id: 3, units: 1, neighbour: [1] }
            ]
        }
    };

    // Territory 0 already has plenty of units (6) to conquer its 1-unit enemy neighbor.
    // Territory 1 only has 1 unit and cannot attack yet.
    // The bot should deploy to territory 1 to bring it to attack readiness!
    const target = strategy.deploymentTarget(broadBoard, 0);
    assert.equal(target.id, 1, 'deploys to territory 1 rather than over-stacking on territory 0');
});

test('bots prioritize conquering countries with higher gold income', () => {
    // Territory 0 borders territory 2 (gold: 2) and territory 3 (gold: 5)
    // Both enemies have 1 unit. Territory 3 is worth more income.
    const incomeBoard = {
        0: {
            countries: [
                { id: 0, units: 8, neighbour: [2, 3] }
            ]
        },
        1: {
            countries: [
                { id: 2, gold: 2, units: 1, neighbour: [0] },
                { id: 3, gold: 5, units: 1, neighbour: [0] }
            ]
        }
    };

    const attack = strategy.chooseAttack(incomeBoard, 0, 0.5);
    assert.ok(attack !== null);
    assert.equal(attack.to, 3, 'prioritizes conquering the 5-gold country over the 2-gold country for greater income');
});

