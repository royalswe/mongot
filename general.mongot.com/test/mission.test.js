'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {Mission} = require('../game/Mission');
const countryHandler = require('../game/countryHandler');

const seats = (count) => ['red', 'blue', 'orange', 'green'].slice(0, count).map((color) => ({color: color}));
const regions = Object.fromEntries(countryHandler.continents('original').map((region) => [region.continent, region.countries]));

// A board where player 0 holds `ids` (with `units` each) and player 1 holds the rest of the original map.
function boardWith(ids, units = 1) {
    const all = countryHandler.getMap('original').countries.map((country) => country.id);
    const territory = (id) => ({id: id, units: units});
    return {
        0: {countries: ids.map(territory)},
        1: {countries: all.filter((id) => ids.indexOf(id) === -1).map(territory)}
    };
}

function withRandom(values, run) {
    const original = Math.random;
    Math.random = () => (values.length ? values.shift() : 0);
    try { return run(); }
    finally { Math.random = original; }
}

test('in a two-player game each player must take out the other', () => {
    const missions = new Mission(seats(2), 'original');
    assert.deepEqual(missions.setMission(0), {mission: 'conquer_player', player: 1, message: 'Take out blue player'});
    assert.deepEqual(missions.setMission(1), {mission: 'conquer_player', player: 0, message: 'Take out red player'});
});

test('with nobody left to target, the fallback is owning 21 territories', () => {
    const missions = new Mission(seats(1), 'original');
    assert.deepEqual(missions.setMission(0), {mission: 'own_21_countries', player: 0, message: 'Own 21 countries'});
});

test('bigger games draw different missions, never the same special mission twice', () => {
    const drawn = withRandom([0.3, 0.6, 0.9, 0.6], () => {
        const missions = new Mission(seats(4), 'original');
        return [0, 1, 2, 3].map((id) => missions.setMission(id).message);
    });
    assert.deepEqual(drawn, [
        'Own three continents',
        'Own Europe and one more continent',
        'Own 17 countries with at least 4 armies in each',
        'Own 21 countries'
    ]);
});

test('conquest-only maps always hand out conquest missions', () => {
    const missions = new Mission(seats(3), 'quick');
    assert.equal(missions.setMission(0).mission, 'conquer_player');
});

test('a conquest mission is complete once the target holds no territory', () => {
    const missions = new Mission(seats(2), 'original');
    const mission = {mission: 'conquer_player', player: 1};
    assert.equal(missions.CheckMission(mission, {0: {countries: [{id: 0}]}, 1: {countries: [{id: 1}]}}, []), false);
    assert.equal(missions.CheckMission(mission, {0: {countries: [{id: 0}]}, 1: {countries: []}}, []), true);
});

test('owning 21 territories counts land conquered this turn', () => {
    const missions = new Mission(seats(2), 'original');
    const mission = {mission: 'own_21_countries', player: 0};
    const twenty = Array.from({length: 20}, (unused, id) => id);
    assert.equal(missions.CheckMission(mission, boardWith(twenty), []), false);
    assert.equal(missions.CheckMission(mission, boardWith(twenty), [{id: 20, units: 1}]), true);
});

test('three whole continents complete the continents mission', () => {
    const missions = new Mission(seats(2), 'original');
    const mission = {mission: 'any_three_continents', player: 0};
    const two = regions['east-europe'].concat(regions.asia);
    assert.equal(missions.CheckMission(mission, boardWith(two), []), false);
    assert.equal(missions.CheckMission(mission, boardWith(two.concat(regions.africa)), []), true);
    const almost = two.concat(regions.africa.slice(1));
    assert.equal(missions.CheckMission(mission, boardWith(almost), [{id: regions.africa[0], units: 1}]), true, 'including land conquered this turn');
});

test('Europe plus any other continent completes the Europe mission', () => {
    const missions = new Mission(seats(2), 'original');
    const mission = {mission: 'europe_plus_one', player: 0};
    assert.equal(missions.CheckMission(mission, boardWith(regions.europe), []), false);
    assert.equal(missions.CheckMission(mission, boardWith(regions.asia.concat(regions.africa)), []), false, 'Europe is required');
    assert.equal(missions.CheckMission(mission, boardWith(regions.europe.concat(regions.africa)), []), true);
});

test('seventeen territories with four armies each complete the fortress mission', () => {
    const missions = new Mission(seats(2), 'original');
    const mission = {mission: 'own_17_with_4_each', player: 0};
    const seventeen = Array.from({length: 17}, (unused, id) => id);
    assert.equal(missions.CheckMission(mission, boardWith(seventeen, 4), []), true);
    assert.equal(missions.CheckMission(mission, boardWith(seventeen, 3), []), false, 'three armies is not enough');
    assert.equal(missions.CheckMission(mission, boardWith(seventeen.slice(1), 4), [{id: 0, units: 4}]), true, 'land conquered this turn counts');
});
