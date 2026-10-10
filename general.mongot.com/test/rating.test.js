'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const rating = require('../game/rating');

test('matches with guests are unranked', () => {
    assert.equal(rating.isRankedMatch([{isGuest: false}, {isGuest: false}]), true);
    assert.equal(rating.isRankedMatch([{isGuest: false}, {isGuest: true}]), false);
});

test('matches with unverified players are unranked', () => {
    assert.equal(rating.isRankedMatch([{}, {isUnverified: false}]), true);
    assert.equal(rating.isRankedMatch([{}, {isUnverified: true}]), false);
    assert.equal(rating.isRankedMatch([{}, {isBot: true}]), true);
});

test('each kind of player is told why a result is unranked', () => {
    assert.match(rating.unrankedNotice({isGuest: true}), /Log in/);
    assert.match(rating.unrankedNotice({isUnverified: true}), /Verify your email/);
    assert.match(rating.unrankedNotice({}), /guest or unverified/);
});

test('ratings reward wins and penalize losses, including bot upsets', () => {
    const evenMatch = rating.calculate([
        {rating: 1600, place: 1},
        {rating: 1600, place: 2},
        {rating: 1600, place: 2}
    ]);
    assert(evenMatch[0].change > 0);
    assert(evenMatch[1].change < 0);
    assert(evenMatch[2].change < 0);

    const botUpset = rating.calculate([
        {rating: 850, place: 1},
        {rating: 1600, place: 2},
        {rating: 1600, place: 2}
    ]);
    assert(botUpset[0].change > 0);
    assert(botUpset[1].change < 0);
    assert(botUpset[2].change < 0);
});

test('integer rating changes remain exactly zero-sum', () => {
    for (let trial = 0; trial < 1000; trial += 1) {
        const participants = Array.from({length: 2 + trial % 5}, (_, index) => ({
            rating: 500 + (trial * 137 + index * 317) % 2500,
            place: 1 + (trial + index * 3) % 4
        }));
        const result = rating.calculate(participants);
        assert.equal(result.reduce((total, participant) => total + participant.change, 0), 0);
    }
});