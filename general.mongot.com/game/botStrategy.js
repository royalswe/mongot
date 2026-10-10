'use strict';
// Pure bot decisions for a board of players ({id: {countries: [{id, units, neighbour}]}}); GameBoard handles timing.

function ownerOf(players, countryId) {
    const owner = Object.keys(players).find((id) => players[id].countries && players[id].countries.some((country) => country.id === countryId));
    return owner === undefined ? -1 : Number(owner);
}

function enemyBorders(players, id, country) {
    return country.neighbour.filter((countryId) => ownerOf(players, countryId) !== id).length;
}

function enemyNeighbors(players, id, country) {
    const enemies = [];
    country.neighbour.forEach((neighborId) => {
        const owner = ownerOf(players, neighborId);
        if (owner !== -1 && owner !== id) {
            const defender = players[owner];
            if (defender && defender.countries) {
                const target = defender.countries.find((c) => c.id === neighborId);
                if (target) {
                    enemies.push({ owner, country: target });
                }
            }
        }
    });
    return enemies;
}

// Precomputed exact Risk battle win probabilities for (attackers, defenders)
const winProbCache = new Map();
function winProbability(attackers, defenders) {
    if (attackers <= 0) { return 0; }
    if (defenders <= 0) { return 1; }
    const key = (attackers << 16) | defenders;
    if (winProbCache.has(key)) { return winProbCache.get(key); }

    let prob;
    if (attackers >= 3 && defenders >= 2) {
        // 3 dice vs 2 dice
        prob = (2890 / 7776) * winProbability(attackers, defenders - 2) +
               (2611 / 7776) * winProbability(attackers - 1, defenders - 1) +
               (2275 / 7776) * winProbability(attackers - 2, defenders);
    } else if (attackers >= 3 && defenders === 1) {
        // 3 dice vs 1 die
        prob = (855 / 1296) * winProbability(attackers, defenders - 1) +
               (441 / 1296) * winProbability(attackers - 1, defenders);
    } else if (attackers === 2 && defenders >= 2) {
        // 2 dice vs 2 dice
        prob = (295 / 1296) * winProbability(attackers, defenders - 2) +
               (420 / 1296) * winProbability(attackers - 1, defenders - 1) +
               (581 / 1296) * winProbability(attackers - 2, defenders);
    } else if (attackers === 2 && defenders === 1) {
        // 2 dice vs 1 die
        prob = (125 / 216) * winProbability(attackers, defenders - 1) +
               (91 / 216) * winProbability(attackers - 1, defenders);
    } else if (attackers === 1 && defenders >= 2) {
        // 1 die vs 2 dice
        prob = (55 / 216) * winProbability(attackers, defenders - 2) +
               (161 / 216) * winProbability(attackers - 1, defenders);
    } else {
        // 1 die vs 1 die
        prob = (15 / 36) * winProbability(attackers, defenders - 1) +
               (21 / 36) * winProbability(attackers - 1, defenders);
    }

    winProbCache.set(key, prob);
    return prob;
}

// Reinforce where enemies press hardest, garrison is thinnest, or to defend/complete continents.
function deploymentTarget(players, id, continents = []) {
    const player = players[id];
    if (!player || !player.countries || !player.countries.length) { return null; }

    const ownedIds = new Set(player.countries.map((c) => c.id));
    const heldContinents = (continents || []).filter((reg) => reg.countries.every((cId) => ownedIds.has(cId)));
    const almostHeldContinents = (continents || []).filter((reg) => {
        const ownedCount = reg.countries.filter((cId) => ownedIds.has(cId)).length;
        return ownedCount >= reg.countries.length - 2 && ownedCount < reg.countries.length;
    });

    const mission = player.mission;
    const targetPlayer = mission && mission.mission === 'conquer_player' ? mission.player : -1;

    const priority = (country) => {
        const enemies = enemyNeighbors(players, id, country);
        const borders = enemies.length;

        // Never reinforce internal safe territories if frontline borders exist
        if (borders === 0) {
            return -1000 - country.units;
        }

        const maxEnemyUnits = enemies.reduce((max, e) => Math.max(max, e.country.units), 0);

        // Core score: border pressure vs own garrison
        let score = borders * 10 - country.units;

        // Threat defense: if enemy force threatens to conquer this country, give heavy defensive priority
        if (country.units < maxEnemyUnits) {
            score += (maxEnemyUnits - country.units) * 6;
        }

        // Chokepoint defense: if holding a continent, heavily defend its exterior borders
        for (const cont of heldContinents) {
            if (cont.countries.includes(country.id)) {
                score += 15 + (cont.gold || 5) * 2;
            }
        }

        // Offensive staging: prioritize border adjacent to missing continent territory
        for (const cont of almostHeldContinents) {
            const bordersMissing = enemies.some((e) => cont.countries.includes(e.country.id));
            if (bordersMissing) {
                score += 12 + (cont.gold || 5);
            }
        }

        // Mission priority: border facing mission target player
        if (targetPlayer !== -1 && enemies.some((e) => e.owner === targetPlayer)) {
            score += 10;
        }

        // Fortress mission: need countries with >= 4 units
        if (mission && mission.mission === 'own_17_with_4_each' && country.units < 4) {
            score += (4 - country.units) * 5;
        }

        return score;
    };

    return player.countries.slice().sort((left, right) => priority(right) - priority(left))[0];
}

// Attack with calculated odds, strategic bonuses for continents, missions, and player elimination.
function chooseAttack(players, id, aggression, continents = []) {
    const player = players[id];
    if (!player || !player.countries) { return null; }

    const ownedIds = new Set(player.countries.map((c) => c.id));
    const mission = player.mission;
    const targetPlayer = mission && mission.mission === 'conquer_player' ? mission.player : -1;

    const attacks = [];
    player.countries.forEach((source) => {
        if (source.units < 3) { return; }
        const attackingUnits = source.units - 1;

        source.neighbour.forEach((countryId) => {
            const defender = ownerOf(players, countryId);
            if (defender < 0 || defender === id) { return; }
            const defenderPlayer = players[defender];
            if (!defenderPlayer || !defenderPlayer.countries) { return; }
            const target = defenderPlayer.countries.find((country) => country.id === countryId);
            if (!target) { return; }

            const defendingUnits = target.units;
            const winRate = winProbability(attackingUnits, defendingUnits);

            // Avoid suicidal attacks (win rate < 25%) unless extreme aggression
            if (winRate < 0.25 && aggression < 1.2) {
                return;
            }

            // Base score combining win rate, troop differential, and aggression
            let score = (winRate - 0.45) * 15 + (attackingUnits - defendingUnits) + (aggression - 0.5) * 6;

            // Aggressive bots override to take worse odds
            if (aggression >= 1.5) {
                score = Math.max(score, attackingUnits - defendingUnits + aggression * 5);
            }

            // Strategic bonuses:
            // 1. Eliminating a player
            if (defenderPlayer.countries.length === 1) {
                score += 15;
            } else if (defenderPlayer.countries.length === 2) {
                score += 6;
            }

            // 2. Continents: completing our continent or breaking an opponent's continent
            if (continents && continents.length) {
                const defenderOwnedIds = new Set(defenderPlayer.countries.map((c) => c.id));
                for (const cont of continents) {
                    if (cont.countries.includes(target.id)) {
                        const ourCount = cont.countries.filter((cId) => ownedIds.has(cId)).length;
                        if (ourCount === cont.countries.length - 1) {
                            score += 10 + (cont.gold || 4) * 1.5;
                        }
                        const defenderCount = cont.countries.filter((cId) => defenderOwnedIds.has(cId)).length;
                        if (defenderCount === cont.countries.length) {
                            score += 8 + (cont.gold || 4) * 1.2;
                        }
                    }
                }
            }

            // 3. Mission target bonus
            if (targetPlayer === defender) {
                score += 12;
            }

            // 4. Low-hanging fruit: 1-unit target
            if (defendingUnits === 1) {
                score += 3;
            }

            // 5. Territory gold value
            if (target.gold && target.gold > 2) {
                score += target.gold - 2;
            }

            attacks.push({
                from: source.id,
                to: target.id,
                defender: defender,
                units: attackingUnits,
                score: score
            });
        });
    });

    attacks.sort((left, right) => right.score - left.score);
    if (!attacks.length || attacks[0].score < 0) { return null; }
    const best = attacks[0];
    return {from: best.from, to: best.to, defender: best.defender, units: best.units};
}

// Shift troops from safe interior or fortified areas toward threatened frontline borders.
function chooseMove(players, id) {
    const player = players[id];
    if (!player || !player.countries) { return null; }

    const moves = [];
    player.countries.forEach((source) => {
        if (source.units < 3) { return; }
        const sourceEnemyCount = enemyBorders(players, id, source);

        source.neighbour.forEach((countryId) => {
            if (ownerOf(players, countryId) !== id) { return; }
            const target = player.countries.find((country) => country.id === countryId);
            if (!target) { return; }

            const targetEnemyCount = enemyBorders(players, id, target);

            let moveScore = (targetEnemyCount - sourceEnemyCount) * 10;
            if (sourceEnemyCount === 0 && targetEnemyCount > 0) {
                moveScore += 30; // Strongly prioritize shifting interior idle units to frontline
            }

            const sourceEnemies = enemyNeighbors(players, id, source);
            const sourceMaxThreat = sourceEnemies.reduce((m, e) => Math.max(m, e.country.units), 0);
            const keepUnits = sourceEnemyCount > 0 ? Math.max(2, Math.min(sourceMaxThreat, source.units - 1)) : 1;
            const unitsToMove = Math.max(1, source.units - keepUnits);

            moves.push({
                from: source.id,
                to: target.id,
                pressure: targetEnemyCount,
                strength: source.units,
                unitsToMove: unitsToMove,
                score: moveScore
            });
        });
    });

    moves.sort((left, right) => right.score - left.score || right.pressure - left.pressure || right.strength - left.strength);
    if (!moves.length) { return null; }

    const best = moves[0];
    const result = {from: best.from, to: best.to};
    Object.defineProperty(result, 'units', {
        value: best.unitsToMove,
        enumerable: false,
        writable: true
    });
    return result;
}

module.exports = {
    deploymentTarget: deploymentTarget,
    chooseAttack: chooseAttack,
    chooseMove: chooseMove,
    winProbability: winProbability,
    ownerOf: ownerOf,
    enemyBorders: enemyBorders
};
