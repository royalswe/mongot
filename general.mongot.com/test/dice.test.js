'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const dice = require('../game/dice');

const scripted = (rolls) => () => {
    assert(rolls.length > 0, 'the battle rolled more dice than scripted');
    return rolls.shift();
};

test('each round rolls up to three attack dice against up to two defence dice', () => {
    const result = dice.fight(5, 4, scripted([6, 6, 6, 1, 1, 6, 6, 6, 1, 1]));
    assert.deepEqual(result.attackerRolls, [[6, 6, 6], [6, 6, 6]]);
    assert.deepEqual(result.defenderRolls, [[1, 1], [1, 1]]);
    assert.deepEqual({attackers: result.attackers, defenders: result.defenders}, {attackers: 5, defenders: 0});
});

test('highest dice are compared pairwise and ties go to the defender', () => {
    // Round 1: 6 beats 5 and 5 beats 3. Round 2: 4 ties 4, so the attacker loses one. Round 3: 5 beats 1.
    const result = dice.fight(3, 3, scripted([6, 3, 5, 5, 3, 4, 4, 4, 4, 5, 2, 1]));
    assert.deepEqual(result.attackerRolls, [[6, 3, 5], [4, 4, 4], [5, 2]]);
    assert.deepEqual(result.defenderRolls, [[5, 3], [4], [1]]);
    assert.deepEqual({attackers: result.attackers, defenders: result.defenders}, {attackers: 2, defenders: 0});
});

test('the fight continues until one side has no units left', () => {
    const result = dice.fight(1, 2, scripted([6, 6, 1]));
    assert.deepEqual({attackers: result.attackers, defenders: result.defenders}, {attackers: 0, defenders: 2});
});

test('a long losing streak is broken by a guaranteed six', () => {
    // Six straight defender wins push the streak below -5, so the next attack die is a fixed 6 and not rolled.
    const rolls = [];
    for (let round = 0; round < 3; round += 1) { rolls.push(1, 1, 1, 6, 6); }
    rolls.push(1, 1); // defence dice for the rigged round
    const result = dice.fight(9, 2, scripted(rolls));
    assert.deepEqual(result.attackerRolls[3], [6, 6, 6]);
    assert.deepEqual(result.defenderRolls[3], [1, 1]);
    assert.deepEqual({attackers: result.attackers, defenders: result.defenders}, {attackers: 3, defenders: 0});
});
