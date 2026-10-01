'use strict';
// Risk-style dice battle. `roll` returns 1-6 and is injectable so the rules can be tested with scripted dice.

const rollDie = () => Math.floor(Math.random() * 6) + 1;

// Fights rounds until one side is out of units; returns survivors and every round's dice for the dice log.
function fight(attackers, defenders, roll = rollDie) {
    const attackerRolls = [];
    const defenderRolls = [];
    let streak = 0; // positive while the attacker keeps winning, negative while the defender does

    while (attackers > 0 && defenders > 0) {
        // After a long one-sided streak the losing side gets guaranteed sixes for one round.
        const attackDice = [];
        for (let i = 0; i < Math.min(attackers, 3); i += 1) { attackDice.push(streak < -5 ? 6 : roll()); }
        const defendDice = [];
        for (let i = 0; i < Math.min(defenders, 2); i += 1) { defendDice.push(streak > 6 ? 6 : roll()); }
        if (streak > 6 || streak < -5) { streak = 0; }

        attackerRolls.push(attackDice.slice());
        defenderRolls.push(defendDice.slice());

        while (attackDice.length > 0 && defendDice.length > 0) {
            const attackHigh = Math.max(...attackDice);
            const defendHigh = Math.max(...defendDice);
            if (defendHigh >= attackHigh) {
                attackers -= 1;
                streak -= 1;
            }
            else {
                defenders -= 1;
                streak += 1;
            }
            attackDice.splice(attackDice.indexOf(attackHigh), 1);
            defendDice.splice(defendDice.indexOf(defendHigh), 1);
        }
    }
    return {attackers: attackers, defenders: defenders, attackerRolls: attackerRolls, defenderRolls: defenderRolls};
}

module.exports = {fight: fight};
