'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const rankIcon = require('../public/js/ranks');

test('rank crowns follow the rating thresholds', () => {
    assert.equal(rankIcon(0), 'crown0.png');
    assert.equal(rankIcon(899), 'crown0.png');
    assert.equal(rankIcon(900), 'crown1.png');
    assert.equal(rankIcon(1299), 'crown1.png');
    assert.equal(rankIcon(1300), 'crown2.png');
    assert.equal(rankIcon(1500), 'crown3.png');
    assert.equal(rankIcon(2899), 'crown9.png');
    assert.equal(rankIcon(2900), 'crown10.png');
    assert.equal(rankIcon(5000), 'crown10.png');
});
