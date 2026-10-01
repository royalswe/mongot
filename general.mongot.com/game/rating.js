'use strict';

const K_FACTOR = 32;

exports.isRankedMatch = function(participants) {
    return participants.every((participant) => !participant.isGuest && !participant.isUnverified);
};

exports.unrankedNotice = function(participant) {
    if (participant.isGuest) { return 'Your result is not ranked. Log in to earn rank.'; }
    if (participant.isUnverified) { return 'Your result is not ranked. Verify your email to earn rank.'; }
    return 'No rating change: a guest or unverified player took part in this match.';
};

exports.calculate = function(participants) {
    if (participants.length < 2) {
        return participants.map((participant) => Object.assign({}, participant, {change: 0}));
    }

    const rawChanges = participants.map((participant, index) => {
        let performance = 0;
        for (let opponentIndex = 0; opponentIndex < participants.length; opponentIndex += 1) {
            if (opponentIndex === index) { continue; }
            const opponent = participants[opponentIndex];
            const expected = 1 / (1 + Math.pow(10, (opponent.rating - participant.rating) / 400));
            const outcome = participant.place < opponent.place ? 1 : participant.place === opponent.place ? 0.5 : 0;
            performance += outcome - expected;
        }
        return K_FACTOR * performance / (participants.length - 1);
    });

    const changes = rawChanges.map((change) => Math.floor(change));
    const remainingPoints = Math.round(rawChanges.reduce((total, change) => total + change, 0)) -
        changes.reduce((total, change) => total + change, 0);
    const allocationOrder = rawChanges.map((change, index) => ({index: index, remainder: change - changes[index]}))
        .sort((left, right) => right.remainder - left.remainder);

    for (let index = 0; index < remainingPoints; index += 1) {
        changes[allocationOrder[index].index] += 1;
    }

    return participants.map((participant, index) => Object.assign({}, participant, {
        change: changes[index],
        rating: participant.rating + changes[index]
    }));
};