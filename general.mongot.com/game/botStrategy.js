'use strict';
// Pure bot decisions for a board of players ({id: {countries: [{id, units, neighbour}]}}); GameBoard handles timing.

function ownerOf(players, countryId) {
    const owner = Object.keys(players).find((id) => players[id].countries.some((country) => country.id === countryId));
    return owner === undefined ? -1 : Number(owner);
}

function enemyBorders(players, id, country) {
    return country.neighbour.filter((countryId) => ownerOf(players, countryId) !== id).length;
}

// Reinforce where enemies press hardest and the garrison is thinnest.
function deploymentTarget(players, id) {
    const priority = (country) => enemyBorders(players, id, country) * 10 - country.units;
    return players[id].countries.slice().sort((left, right) => priority(right) - priority(left))[0];
}

// Attack with all but one unit from a territory with at least three; aggression lets a bot accept worse odds.
function chooseAttack(players, id, aggression) {
    const attacks = [];
    players[id].countries.forEach((source) => {
        if (source.units < 3) { return; }
        source.neighbour.forEach((countryId) => {
            const defender = ownerOf(players, countryId);
            if (defender < 0 || defender === id) { return; }
            const target = players[defender].countries.find((country) => country.id === countryId);
            const units = source.units - 1;
            attacks.push({from: source.id, to: target.id, defender: defender, units: units, score: units - target.units + aggression * 5});
        });
    });
    attacks.sort((left, right) => right.score - left.score);
    if (!attacks.length || attacks[0].score < 0) { return null; }
    const best = attacks[0];
    return {from: best.from, to: best.to, defender: best.defender, units: best.units};
}

// Shift one unit from a strong territory to the own neighbour facing the most enemies.
function chooseMove(players, id) {
    const moves = [];
    players[id].countries.forEach((source) => {
        if (source.units < 3) { return; }
        source.neighbour.forEach((countryId) => {
            if (ownerOf(players, countryId) !== id) { return; }
            const target = players[id].countries.find((country) => country.id === countryId);
            moves.push({from: source.id, to: target.id, pressure: enemyBorders(players, id, target), strength: source.units});
        });
    });
    moves.sort((left, right) => right.pressure - left.pressure || right.strength - left.strength);
    return moves.length ? {from: moves[0].from, to: moves[0].to} : null;
}

module.exports = {deploymentTarget: deploymentTarget, chooseAttack: chooseAttack, chooseMove: chooseMove};
