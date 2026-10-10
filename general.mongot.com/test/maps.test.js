'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const countryHandler = require('../game/countryHandler');

test('all maps have complete, connected territory and region data', () => {
    const maps = countryHandler.list();
    assert.deepEqual(maps.map((map) => map.id), ['original', 'archipelago', 'frontier', 'world', 'quick']);

    maps.forEach(({ id }) => {
        const map = countryHandler.getMap(id);
        const count = map.positions ? map.positions.length : 33;
        assert.equal(map.countries.length, count, id);
        assert.equal(map.positions ? map.positions.length : 33, count, id + ' marker positions');
        assert.equal(map.continents.reduce((total, region) => total + region.countries.length, 0), count, id);

        if (id === 'original') { return; }
        map.countries.forEach((territory) => territory.neighbour.forEach((neighbor) => {
            assert(map.countries[neighbor].neighbour.includes(territory.id), `${id}: ${territory.id}-${neighbor}`);
        }));

        const reached = new Set([0]);
        const pending = [0];
        while (pending.length) {
            map.countries[pending.pop()].neighbour.forEach((neighbor) => {
                if (!reached.has(neighbor)) {
                    reached.add(neighbor);
                    pending.push(neighbor);
                }
            });
        }
        assert.equal(reached.size, count, id);
    });
});

test('world has 42 territories and quick-test has four territories and low gold', () => {
    const world = countryHandler.getMap('world');
    const quick = countryHandler.getMap('quick');
    assert.equal(world.countries.length, 42);
    assert.equal(world.continents.length, 6);
    assert.equal(world.continents[0].continent, 'Europe');
    assert.equal(quick.countries.length, 4);
    assert.equal(quick.startingGold, 15);
    assert.equal(quick.conquestOnly, true);
    assert(quick.countries.every((territory) => territory.gold === 5));
});

test('quick test map is only offered outside production', (t) => {
    const previous = process.env.NODE_ENV;
    t.after(() => { process.env.NODE_ENV = previous; });
    process.env.NODE_ENV = 'production';
    assert.deepEqual(countryHandler.list().map((map) => map.id), ['original', 'archipelago', 'frontier', 'world']);
    process.env.NODE_ENV = 'development';
    assert(countryHandler.list().some((map) => map.id === 'quick'));
});

test('world routes are readable and the artwork matches the territory positions', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const { pointSegmentDistance, segmentsCross } = require('../game/maps').geometry;
    const map = countryHandler.getMap('world');
    const wrap = new Set(map.wrapLinks.map(([a, b]) => Math.min(a, b) + '-' + Math.max(a, b)));
    const routes = [];
    map.countries.forEach((country) => country.neighbour.forEach((other) => {
        if (other > country.id && !wrap.has(country.id + '-' + other)) { routes.push([country.id, other]); }
    }));

    map.positions.forEach((position, id) => map.positions.forEach((other, otherId) => {
        if (otherId > id) { assert(Math.hypot(position.x - other.x, position.y - other.y) >= 80, `territories ${id} and ${otherId} too close`); }
    }));
    routes.forEach(([a, b]) => map.positions.forEach((position, id) => {
        if (id === a || id === b) { return; }
        assert(pointSegmentDistance(position, map.positions[a], map.positions[b]) >= 40, `route ${a}-${b} passes territory ${id}`);
    }));
    routes.forEach(([a, b], index) => routes.slice(index + 1).forEach(([c, d]) => {
        if ([a, b].includes(c) || [a, b].includes(d)) { return; }
        assert(!segmentsCross(map.positions[a], map.positions[b], map.positions[c], map.positions[d]), `routes ${a}-${b} and ${c}-${d} cross`);
    }));

    const svg = fs.readFileSync(path.join(__dirname, '../public/img/game/maps/world.svg'), 'utf8');
    map.countries.forEach((country) => {
        const {x, y} = map.positions[country.id];
        assert(svg.includes(`cx="${x}" cy="${y}"`), `${country.name} land is not drawn at its marker; run npm run map:world`);
        country.name.split(/ (.*)/).filter(Boolean).forEach((line) => assert(svg.includes(`>${line}<`), `${country.name} label missing`));
    });
});

test('a continent is owned only when every one of its territories is held', () => {
    const continent = [4, 2, 9];
    assert.equal(countryHandler.ownsContinent(continent, [9, 1, 2, 4]), true);
    assert.equal(countryHandler.ownsContinent(continent, [2, 4]), false);
    assert.deepEqual(continent, [4, 2, 9], 'the map data is not reordered');
});

test('the original map retains its historic connections and map copies are isolated', () => {
    const original = countryHandler.getMap('original');
    assert.deepEqual(original.countries[20].neighbour, [17,18,19,21,22,15,16]);
    assert.deepEqual(original.countries[19].neighbour, [18,21]);

    original.countries[0].units = 99;
    assert.equal(countryHandler.getMap('original').countries[0].units, 1);
});

test('archipelago routes are readable: clear of other territories, never crossing, one sea passage per island pair', () => {
    const { pointSegmentDistance, segmentsCross } = require('../game/maps').geometry;
    const map = countryHandler.getMap('archipelago');
    const routes = [];
    map.countries.forEach((country) => country.neighbour.forEach((other) => {
        if (other > country.id) { routes.push([country.id, other]); }
    }));

    routes.forEach(([a, b]) => map.positions.forEach((position, id) => {
        if (id === a || id === b) { return; }
        assert(pointSegmentDistance(position, map.positions[a], map.positions[b]) >= 34, `route ${a}-${b} passes territory ${id}`);
    }));
    routes.forEach(([a, b], index) => routes.slice(index + 1).forEach(([c, d]) => {
        if ([a, b].includes(c) || [a, b].includes(d)) { return; }
        assert(!segmentsCross(map.positions[a], map.positions[b], map.positions[c], map.positions[d]), `routes ${a}-${b} and ${c}-${d} cross`);
    }));

    const islandOf = (id) => map.continents.findIndex((region) => region.countries.includes(id));
    map.seaLinks.forEach(([a, b]) => assert.notEqual(islandOf(a), islandOf(b)));
    assert.equal(new Set(map.seaLinks.map(([a, b]) => [islandOf(a), islandOf(b)].sort().join('-'))).size, map.seaLinks.length);
    map.countries.forEach((country) => assert(country.neighbour.length >= 2, `territory ${country.id} is nearly isolated`));
});