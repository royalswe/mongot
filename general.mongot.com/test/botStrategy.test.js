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

test('bots plan coordinated multi-country assault against heavily fortified high-value bastions', () => {
    // Continents: continent "Fortress Isle" comprises countries [0, 1, 2, 3] worth 5 bonus gold.
    // Bot (player 0) already owns [0, 1, 2].
    // Opponent (player 1) holds the last territory 3 with 8 units and 5 gold income.
    // Bot has 6 units in each of the three surrounding territories (0, 1, 2), each bordering territory 3.
    // Individually, 5 available attackers vs 8 defenders has only a 16% win rate (normally skipped as suicidal).
    // Collectively, 3 x 5 = 15 available attackers vs 8 defenders has a >95% win probability!
    const continents = [{ continent: 'Fortress Isle', gold: 5, countries: [0, 1, 2, 3] }];
    const fortressBoard = {
        0: {
            countries: [
                { id: 0, units: 6, neighbour: [3] },
                { id: 1, units: 6, neighbour: [3] },
                { id: 2, units: 6, neighbour: [3] }
            ]
        },
        1: {
            countries: [
                { id: 3, gold: 5, units: 8, neighbour: [0, 1, 2] }
            ]
        }
    };

    // Wave 1: Bot recognizes the coordinated assault and attacks territory 3
    const wave1 = strategy.chooseAttack(fortressBoard, 0, 0.5, continents);
    assert.ok(wave1 !== null, 'plans coordinated assault on heavily fortified target');
    assert.equal(wave1.to, 3, 'targets the fortified bastion');
    assert.ok([0, 1, 2].includes(wave1.from), 'attacks from one of the three surrounding staging territories');
    assert.equal(wave1.units, 5, 'commits full available force in the wave');

    // Simulate Wave 1 battle:
    // Wave 1 softens the defense down to 4 units, origin territory reduced to 1 unit
    const wave1From = wave1.from;
    fortressBoard[0].countries.find((c) => c.id === wave1From).units = 1;
    fortressBoard[1].countries[0].units = 4;

    // Wave 2: Bot continues the assault from another surrounding territory
    const wave2 = strategy.chooseAttack(fortressBoard, 0, 0.5, continents);
    assert.ok(wave2 !== null, 'launches second wave of coordinated assault');
    assert.equal(wave2.to, 3);
    assert.notEqual(wave2.from, wave1From, 'attacks from a different surrounding territory');
    assert.equal(wave2.units, 5);

    // Simulate Wave 2 conquering territory 3
    fortressBoard[1].countries = [];
    assert.equal(strategy.chooseAttack(fortressBoard, 0, 0.5, continents), null, 'bastion conquered, assault complete');
});

test('bots calculate secret mission elimination risk in 3-player games', () => {
    // 3 active players: Bot (0), Victim (1), Rival (2)
    // Victim has only 1 territory (1) with 1 unit.
    // Bot has territory 0 with 5 units bordering territory 1.
    // Rival has territory 2 with 5 units.
    const threePlayerBoard = {
        0: {
            mission: { mission: 'any_three_continents' },
            countries: [{ id: 0, units: 5, neighbour: [1, 2] }]
        },
        1: {
            mission: { mission: 'conquer_player', player: 0 },
            countries: [{ id: 1, units: 1, neighbour: [0] }]
        },
        2: {
            mission: { mission: 'conquer_player', player: 1 }, // Rival needs to eliminate Victim!
            countries: [{ id: 2, units: 5, neighbour: [0] }]
        }
    };

    // Case 1: Bot does NOT have Victim as mission target.
    // Eliminating Victim carries the risk of handing victory to Rival 2 who has "Take out Victim"!
    // The bot should calculate this risk and avoid eliminating Victim.
    const attack1 = strategy.chooseAttack(threePlayerBoard, 0, 0.5);
    assert.ok(attack1 === null || attack1.to !== 1, 'does not eliminate Victim when it risks triggering Rival secret mission');

    // Case 2: Bot's mission IS to eliminate Victim!
    // Now eliminating Victim wins the game for the Bot!
    threePlayerBoard[0].mission = { mission: 'conquer_player', player: 1 };
    const attack2 = strategy.chooseAttack(threePlayerBoard, 0, 0.5);
    assert.ok(attack2 !== null);
    assert.equal(attack2.to, 1, 'eliminates Victim because Victim IS the bot designated mission target');

    // Case 3: Rival 2 left the game and was taken over by a bot (still alive and in room, lost: false).
    // Because the game started with 3 players, secret missions are active and Rival 2 can still win.
    // Bot avoids eliminating Victim.
    threePlayerBoard[0].mission = { mission: 'any_three_continents' };
    threePlayerBoard[2].isBot = true; // Bot takeover
    const attack3 = strategy.chooseAttack(threePlayerBoard, 0, 0.5);
    assert.ok(attack3 === null || attack3.to !== 1, 'considers secret mission risk even when player was replaced by bot');

    // Case 4: Rival 2 is eliminated (lost: true).
    // No living rival remains who could win from Victim death; Bot eliminates final opponent.
    threePlayerBoard[2].lost = true;
    threePlayerBoard[2].countries = [];
    const attack4 = strategy.chooseAttack(threePlayerBoard, 0, 0.5);
    assert.ok(attack4 !== null);
    assert.equal(attack4.to, 1, 'eliminates final opponent when all other opponents have already lost');
});

test('sequential waves have strictly lower win probability than a single aggregated attack', () => {
    // 5 + 5 + 5 discrete waves vs 8 defenders suffers multiple low-dice tail resets
    const waveOdds = strategy.sequentialWinProbability([5, 5, 5], 8);
    const singleStackOdds = strategy.winProbability(15, 8);
    assert.ok(waveOdds < singleStackOdds, 'sequential waves have strictly lower win probability than single stack');
    assert.ok(waveOdds > 0.85, '3 waves of 5 still have favorable odds vs 8 defenders');

    // 4 + 4 + 4 vs 8
    assert.ok(strategy.sequentialWinProbability([4, 4, 4], 8) < strategy.winProbability(12, 8));
    // 5 + 5 vs 8
    assert.ok(strategy.sequentialWinProbability([5, 5], 8) < strategy.winProbability(10, 8));
});

test('bots re-evaluate after each attack and abort assault if battle suffered bad luck', () => {
    const continents = [{ continent: 'Fortress Isle', gold: 5, countries: [0, 1, 2, 3] }];
    // Suppose Wave 1 from territory 0 already attacked and died (now at 1 unit).
    // Only territories 1 (6 units -> 5 attackers) and 2 (6 units -> 5 attackers) remain.
    const board = {
        0: {
            countries: [
                { id: 0, units: 1, neighbour: [3] },
                { id: 1, units: 6, neighbour: [3] },
                { id: 2, units: 6, neighbour: [3] }
            ]
        },
        1: {
            countries: [
                { id: 3, gold: 5, units: 8, neighbour: [0, 1, 2] }
            ]
        }
    };

    // Scenario Bad Luck: Wave 1 rolled poorly and was wiped out with defender still at 8 units.
    // Remaining waves [5, 5] vs 8 has odds of 68.8% (< 70% threshold).
    board[1].countries[0].units = 8;
    const badLuckAttack = strategy.chooseAttack(board, 0, 0.5, continents);
    assert.ok(badLuckAttack === null || badLuckAttack.to !== 3, 'aborts assault when bad luck leaves remaining waves at poor odds');

    // Scenario Good Luck: Wave 1 rolled well and reduced defender down to 3 units!
    // Remaining waves [5, 5] vs 3 has overwhelming odds (>98%).
    board[1].countries[0].units = 3;
    const goodLuckAttack = strategy.chooseAttack(board, 0, 0.5, continents);
    assert.ok(goodLuckAttack !== null && goodLuckAttack.to === 3, 'continues assault when good luck leaves defender weakened');
});



