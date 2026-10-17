'use strict';
// Pure bot decisions for a board of players ({id: {countries: [{id, units, neighbour}]}}); GameBoard handles timing.

function ownerOf(players, countryId) {
    const owner = Object.keys(players).find((id) => players[id].countries && players[id].countries.some((country) => country.id === countryId));
    return owner === undefined ? -1 : Number(owner);
}

function enemyBorders(players, id, country) {
    return country.neighbour.filter((countryId) => {
        const owner = ownerOf(players, countryId);
        return owner !== -1 && owner !== id;
    }).length;
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

// Outcome distribution for a single battle wave of attackers vs defenders:
// returns array dist where dist[0] is probability that attackers conquer the territory,
// and dist[d] (for d >= 1) is probability that attackers are wiped out leaving d defenders.
const waveOutcomeCache = new Map();

function waveOutcomeDistribution(attackers, defenders) {
    if (attackers <= 0) {
        const dist = new Array(defenders + 1).fill(0);
        dist[defenders] = 1;
        return dist;
    }
    if (defenders <= 0) {
        return [1];
    }
    const key = (attackers << 16) | defenders;
    if (waveOutcomeCache.has(key)) {
        return waveOutcomeCache.get(key);
    }

    const dist = new Array(defenders + 1).fill(0);

    const addWeighted = (weight, nextDist) => {
        dist[0] += weight * nextDist[0];
        for (let k = 1; k < nextDist.length; k++) {
            dist[k] += weight * nextDist[k];
        }
    };

    if (attackers >= 3 && defenders >= 2) {
        addWeighted(2890 / 7776, waveOutcomeDistribution(attackers, defenders - 2));
        addWeighted(2611 / 7776, waveOutcomeDistribution(attackers - 1, defenders - 1));
        addWeighted(2275 / 7776, waveOutcomeDistribution(attackers - 2, defenders));
    } else if (attackers >= 3 && defenders === 1) {
        addWeighted(855 / 1296, waveOutcomeDistribution(attackers, defenders - 1));
        addWeighted(441 / 1296, waveOutcomeDistribution(attackers - 1, defenders));
    } else if (attackers === 2 && defenders >= 2) {
        addWeighted(295 / 1296, waveOutcomeDistribution(attackers, defenders - 2));
        addWeighted(420 / 1296, waveOutcomeDistribution(attackers - 1, defenders - 1));
        addWeighted(581 / 1296, waveOutcomeDistribution(attackers - 2, defenders));
    } else if (attackers === 2 && defenders === 1) {
        addWeighted(125 / 216, waveOutcomeDistribution(attackers, defenders - 1));
        addWeighted(91 / 216, waveOutcomeDistribution(attackers - 1, defenders));
    } else if (attackers === 1 && defenders >= 2) {
        addWeighted(55 / 216, waveOutcomeDistribution(attackers, defenders - 2));
        addWeighted(161 / 216, waveOutcomeDistribution(attackers - 1, defenders));
    } else {
        addWeighted(15 / 36, waveOutcomeDistribution(attackers, defenders - 1));
        addWeighted(21 / 36, waveOutcomeDistribution(attackers - 1, defenders));
    }

    waveOutcomeCache.set(key, dist);
    return dist;
}

// Single-wave battle win probability (attackers conquer territory)
function winProbability(attackers, defenders) {
    if (attackers <= 0) { return 0; }
    if (defenders <= 0) { return 1; }
    return waveOutcomeDistribution(attackers, defenders)[0];
}

// Exact win probability of sequential attacking waves [A1, A2, ..., Ak] against D defenders.
// Sequential waves have a strictly lower win probability than a single aggregated attack (sum(Ai)),
// because each wave must suffer the low-dice tail (1-2 units) independently.
function sequentialWinProbability(waves, defenders) {
    if (!waves || waves.length === 0) { return 0; }
    if (defenders <= 0) { return 1; }

    let defenderProbs = new Array(defenders + 1).fill(0);
    defenderProbs[defenders] = 1.0;
    let totalWinProb = 0;

    for (const waveAttackers of waves) {
        if (waveAttackers <= 0) { continue; }
        const nextDefenderProbs = new Array(defenders + 1).fill(0);
        for (let d = 1; d <= defenders; d++) {
            const probD = defenderProbs[d];
            if (probD <= 0) { continue; }
            const outcome = waveOutcomeDistribution(waveAttackers, d);
            totalWinProb += probD * outcome[0];
            for (let remD = 1; remD < outcome.length; remD++) {
                nextDefenderProbs[remD] += probD * outcome[remD];
            }
        }
        defenderProbs = nextDefenderProbs;
    }

    return Math.min(1, Math.max(0, totalWinProb));
}

// Reinforce frontline territories with broad focus across multiple borders.
// Rather than buying many units in a single army, bots distribute deployments across
// attack-ready frontlines to prepare multiple simultaneous attacks, defend threatened borders,
// coordinate multi-country staging against fortified bastions, and capture surrounding territories to maximize gold income.
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
    const startingPlayerCount = Object.keys(players).length;
    const hasSecretMissions = (startingPlayerCount >= 3) || Boolean(mission && mission.mission);
    const livingOpponents = Object.keys(players).filter((pId) => {
        const p = players[pId];
        return Number(pId) !== id && p && !p.lost;
    });

    const priority = (country) => {
        const enemies = enemyNeighbors(players, id, country);
        const borders = enemies.length;

        // Never reinforce internal safe territories if frontline borders exist
        if (borders === 0) {
            return -1000 - country.units;
        }

        const maxEnemyUnits = enemies.reduce((max, e) => Math.max(max, e.country.units), 0);

        // Core score: border presence
        let score = borders * 8;

        // Threat defense: if enemy force threatens to conquer this country, give heavy defensive priority
        if (country.units < maxEnemyUnits) {
            score += (maxEnemyUnits - country.units) * 10;
        }

        // Offensive expansion & income opportunities ("conquer many countries as it give income"):
        // Find weak enemy neighbors (1-2 units) that can be easily conquered
        const easyTargets = enemies.filter((e) => {
            if (e.country.units > 2) { return false; }
            // Avoid staging to eliminate a player if secret missions are in the game and other living opponents exist
            if (hasSecretMissions && livingOpponents.length > 1 && targetPlayer !== e.owner) {
                const defP = players[e.owner];
                if (defP && defP.countries && defP.countries.length === 1) {
                    return false;
                }
            }
            return true;
        });

        if (easyTargets.length > 0) {
            const potentialGold = easyTargets.reduce((sum, e) => sum + (e.country.gold || 2), 0);
            score += potentialGold * 3;

            // Readiness bonus: a country needs at least 3-4 units to launch an attack.
            // If this territory is close to attacking strength, prioritize bringing it to readiness
            // so the bot can conquer those surrounding countries!
            if (country.units < 4) {
                score += (4 - country.units) * 8;
            }
        }

        // Multi-border staging bonus:
        // Territories bordering multiple enemies can launch sequential attacks on surrounding countries
        if (borders >= 2 && country.units < 8) {
            score += (borders - 1) * 5;
        }

        // Broad focus / Diminishing returns:
        // Prevent concentrating too many units into a single army when other borders need attention.
        const neededForDefense = maxEnemyUnits + 1;
        const neededForOffense = Math.max(4, Math.min(10, easyTargets.length * 3 + 1));
        const saturationThreshold = Math.max(neededForDefense, neededForOffense);

        // Progressive penalty once garrison meets or exceeds its saturation threshold
        if (country.units >= saturationThreshold) {
            score -= (country.units - saturationThreshold + 1) * 8;
        }
        score -= country.units * 2;

        // Chokepoint defense: if holding a continent, defend its exterior borders
        for (const cont of heldContinents) {
            if (cont.countries.includes(country.id)) {
                if (country.units < Math.max(5, maxEnemyUnits + 1)) {
                    score += 15 + (cont.gold || 5) * 2;
                } else {
                    score += 5 + (cont.gold || 5);
                }
            }
        }

        // Offensive staging: prioritize border adjacent to missing continent territory
        for (const cont of almostHeldContinents) {
            const bordersMissing = enemies.some((e) => cont.countries.includes(e.country.id));
            if (bordersMissing) {
                if (country.units < 6) {
                    score += 12 + (cont.gold || 5);
                } else {
                    score += 4 + (cont.gold || 5);
                }
            }
        }

        // Mission priority: border facing mission target player
        if (targetPlayer !== -1 && enemies.some((e) => e.owner === targetPlayer)) {
            score += 15;
        }

        // Fortress mission: need countries with >= 4 units
        if (mission && mission.mission === 'own_17_with_4_each' && country.units < 4) {
            score += (4 - country.units) * 6;
        }

        return score;
    };

    return player.countries.slice().sort((left, right) => priority(right) - priority(left))[0];
}

// Attack with calculated odds, coordinated multi-country assault planning, secret mission risk calculation,
// continents, and income expansion.
// Features:
// 1. Budgeted attacks on multiple surrounding countries to maximize income across the turn.
// 2. Coordinated multi-country assault: when a heavily fortified enemy country holds high income or completes/breaks a continent,
//    the bot plans multi-wave attacks across multiple surrounding friendly territories.
//    Uses sequential wave win probability (which correctly reflects that discrete waves have a lower win chance than
//    a single combined army) and dynamically re-evaluates remaining live defenders after each attack to adapt to good or bad battle luck.
// 3. Secret Mission Elimination Risk: when a match starts with 3 or 4 players (even if players later leave or disconnect),
//    eliminating a player who is NOT our mission target carries severe risk of triggering an opponent's secret mission ("Take out <color>"),
//    handing them an instant victory.
function chooseAttack(players, id, aggression, continents = []) {
    const player = players[id];
    if (!player || !player.countries) { return null; }

    const ownedIds = new Set(player.countries.map((c) => c.id));
    const mission = player.mission;
    const targetPlayer = mission && mission.mission === 'conquer_player' ? mission.player : -1;
    const startingPlayerCount = Object.keys(players).length;
    const hasSecretMissions = (startingPlayerCount >= 3) || Boolean(mission && mission.mission);

    // Minimum units to make an attack viable against D defenders
    const minUnitsToAttack = (defendingUnits) => {
        if (defendingUnits <= 1) { return 2; }
        if (defendingUnits === 2) { return 3; }
        return Math.max(3, defendingUnits + 1);
    };

    // Recommended units for high confidence win (~85-92% win rate)
    const confidentUnits = (defendingUnits) => {
        const threshold = Math.max(0.75, Math.min(0.92, 0.88 - (aggression - 0.5) * 0.15));
        let units = minUnitsToAttack(defendingUnits);
        while (units < 50 && winProbability(units, defendingUnits) < threshold) {
            units += 1;
        }
        return units;
    };

    const attacks = [];
    player.countries.forEach((source) => {
        if (source.units < 3) { return; }
        const availableUnits = source.units - 1;

        // Collect all viable enemy neighbors of this source territory
        const enemyTargets = [];
        source.neighbour.forEach((countryId) => {
            const defender = ownerOf(players, countryId);
            if (defender < 0 || defender === id) { return; }
            const defenderPlayer = players[defender];
            if (!defenderPlayer || !defenderPlayer.countries) { return; }
            const target = defenderPlayer.countries.find((country) => country.id === countryId);
            if (!target) { return; }

            const defendingUnits = target.units;
            const soloWinRate = winProbability(availableUnits, defendingUnits);

            // Check if multiple friendly territories surround this target for a coordinated assault
            const friendlyStaging = player.countries.filter((c) => c.neighbour.includes(countryId) && c.units >= 3);
            const stagingWaves = friendlyStaging.map((c) => c.units - 1);
            const totalCoordinatedUnits = stagingWaves.reduce((sum, u) => sum + u, 0);
            // Sequential wave win probability accounts for discrete wave resets and attrition (lower than a single stack)
            const collectiveWinRate = sequentialWinProbability(stagingWaves, defendingUnits);

            // Strategic evaluation of this target
            let completesContinent = false;
            let breaksContinent = false;
            let continentBonus = 0;
            if (continents && continents.length) {
                for (const cont of continents) {
                    if (cont.countries.includes(target.id)) {
                        const ourCount = cont.countries.filter((cId) => ownedIds.has(cId)).length;
                        if (ourCount === cont.countries.length - 1) {
                            completesContinent = true;
                            continentBonus = Math.max(continentBonus, cont.gold || 4);
                        }
                        const defenderOwnedIds = new Set(defenderPlayer.countries.map((c) => c.id));
                        const defCount = cont.countries.filter((cId) => defenderOwnedIds.has(cId)).length;
                        if (defCount === cont.countries.length) {
                            breaksContinent = true;
                            continentBonus = Math.max(continentBonus, cont.gold || 4);
                        }
                    }
                }
            }
            const isHighIncome = Boolean(target.gold && target.gold >= 3);
            const isMissionTarget = (targetPlayer === defender);

            // Coordinated multi-country assault triggers when a high-value fortified enemy position (large army)
            // is surrounded by multiple friendly territories that collectively have sufficient sequential force
            const isCoordinatedAssault = friendlyStaging.length >= 2 &&
                (completesContinent || breaksContinent || isHighIncome || isMissionTarget) &&
                defendingUnits > availableUnits &&
                totalCoordinatedUnits >= defendingUnits &&
                collectiveWinRate >= (aggression >= 1.2 ? 0.60 : 0.70);

            const isViableSolo = (aggression >= 1.5) || (
                defendingUnits <= availableUnits
                    ? (soloWinRate >= 0.25 || aggression >= 1.2)
                    : (soloWinRate >= 0.40)
            );

            if (isViableSolo || isCoordinatedAssault) {
                enemyTargets.push({
                    countryId: countryId,
                    defender: defender,
                    defenderPlayer: defenderPlayer,
                    target: target,
                    defendingUnits: defendingUnits,
                    soloWinRate: soloWinRate,
                    isCoordinatedAssault: isCoordinatedAssault,
                    collectiveWinRate: collectiveWinRate,
                    totalCoordinatedUnits: totalCoordinatedUnits,
                    completesContinent: completesContinent,
                    breaksContinent: breaksContinent,
                    continentBonus: continentBonus,
                    isHighIncome: isHighIncome,
                    isMissionTarget: isMissionTarget
                });
            }
        });

        if (enemyTargets.length === 0) { return; }

        enemyTargets.forEach((item) => {
            const {
                countryId, defender, defenderPlayer, target, defendingUnits,
                isCoordinatedAssault, collectiveWinRate, totalCoordinatedUnits,
                completesContinent, breaksContinent, continentBonus, isHighIncome, isMissionTarget
            } = item;

            const otherTargets = enemyTargets.filter((t) => t.countryId !== countryId);

            // Determine how many units to send:
            let unitsToSend = availableUnits;
            let canMultiAttack = false;

            if (isCoordinatedAssault) {
                // In a coordinated assault against a fortified enemy position, commit full available force
                unitsToSend = availableUnits;
            } else if (otherTargets.length > 0) {
                const needed = confidentUnits(defendingUnits);
                const minForOther = Math.min(...otherTargets.map((t) => minUnitsToAttack(t.defendingUnits)));

                if (availableUnits - needed >= minForOther) {
                    canMultiAttack = true;
                    unitsToSend = needed;
                    if (defendingUnits === 1 && availableUnits - minForOther >= 4) {
                        unitsToSend = 4;
                    }
                    unitsToSend = Math.min(unitsToSend, availableUnits - minForOther);
                    unitsToSend = Math.max(minUnitsToAttack(defendingUnits), unitsToSend);
                }
            }

            const winRate = winProbability(unitsToSend, defendingUnits);

            // Avoid suicidal solo attacks unless part of a viable coordinated assault or extreme aggression
            if (!isCoordinatedAssault && aggression < 1.5) {
                const minSoloWinRate = (defendingUnits > unitsToSend) ? 0.40 : (aggression >= 1.2 ? 0.20 : 0.25);
                if (winRate < minSoloWinRate) {
                    return;
                }
            }

            let score;
            if (isCoordinatedAssault) {
                // Coordinated assault scoring using exact sequential win probability and payoff
                score = (collectiveWinRate - 0.35) * 20 + (totalCoordinatedUnits - defendingUnits) * 1.5;

                if (completesContinent) {
                    score += 25 + continentBonus * 3;
                }
                if (breaksContinent) {
                    score += 18 + continentBonus * 2;
                }
                if (isHighIncome) {
                    score += (target.gold || 2) * 4;
                }
                if (isMissionTarget) {
                    score += 20;
                }

                // Staging priority: the territory with the most units attacks first to deal the heaviest initial blow
                score += source.units * 0.5;
            } else {
                // Base score combining win rate, troop differential, and aggression
                score = (winRate - 0.45) * 15 + (unitsToSend - defendingUnits) + (aggression - 0.5) * 6;
                if (aggression >= 1.5) {
                    score = Math.max(score, unitsToSend - defendingUnits + aggression * 5);
                }

                // Income from conquering countries ("It is more beneficial to conquer many countries as it give income.")
                const incomeValue = target.gold || 2;
                score += incomeValue * 3;

                // Multi-target expansion bonus
                if (canMultiAttack) {
                    score += 8;
                }

                // Low-hanging fruit
                if (defendingUnits === 1) {
                    score += 6;
                } else if (defendingUnits === 2) {
                    score += 3;
                }

                // Continents
                if (completesContinent) {
                    score += 12 + continentBonus * 2;
                }
                if (breaksContinent) {
                    score += 10 + continentBonus * 1.5;
                }

                // Mission target bonus
                if (isMissionTarget) {
                    score += 12;
                }

                // Territory gold bonus
                if (target.gold && target.gold > 2) {
                    score += (target.gold - 2) * 2;
                }
            }

            // Secret Mission Elimination Risk Calculation:
            // Check living opponents still in the game who could hold a mission targeting defender
            const livingOpponents = Object.keys(players).filter((pId) => {
                const p = players[pId];
                return Number(pId) !== id && Number(pId) !== defender && p && !p.lost;
            });

            if (defenderPlayer.countries.length === 1) {
                if (isMissionTarget) {
                    // Eliminating our designated mission target WINS THE GAME IMMEDIATELY!
                    score += 60;
                } else if (livingOpponents.length === 0) {
                    // All other opponents have already lost; eliminating the final defender wins the match!
                    score += 60;
                } else if (hasSecretMissions && livingOpponents.length > 0 && aggression < 1.5) {
                    // In a game that started with 3 or 4 players (or has secret missions),
                    // eliminating a player who is NOT our target risks triggering an opponent's secret mission ("Take out <color>"),
                    // which would cause that opponent to win instantly!
                    let botWinsFromConquest = false;
                    if (mission && mission.mission === 'own_21_countries' && (player.countries.length + 1) >= 21) {
                        botWinsFromConquest = true;
                    }
                    if (mission && mission.mission === 'any_three_continents' && completesContinent) {
                        const currentHeld = (continents || []).filter((reg) => reg.countries.every((cId) => ownedIds.has(cId) || cId === target.id)).length;
                        if (currentHeld >= 3) { botWinsFromConquest = true; }
                    }

                    if (!botWinsFromConquest) {
                        // Apply heavy risk penalty to avoid handing victory to an opponent
                        score -= 40;
                    } else {
                        score += 50;
                    }
                } else {
                    score += 18;
                }
            } else if (defenderPlayer.countries.length === 2) {
                // Weakening them to 1 country without eliminating them is safe from secret mission triggers
                score += 8;
            }

            attacks.push({
                from: source.id,
                to: target.id,
                defender: defender,
                units: unitsToSend,
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
    sequentialWinProbability: sequentialWinProbability,
    waveOutcomeDistribution: waveOutcomeDistribution,
    ownerOf: ownerOf,
    enemyBorders: enemyBorders
};
