'use strict';

const originalCountries = [
    { id: 0, gold: 2, units: 1, neighbour: [1,2,3] },
    { id: 1, gold: 2, units: 1, neighbour: [0,2,4,17] },
    { id: 2, gold: 2, units: 1, neighbour: [0,1,17] },
    { id: 3, gold: 2, units: 1, neighbour: [0,6,7,10,11] },
    { id: 4, gold: 2, units: 1, neighbour: [5,1,6] },
    { id: 5, gold: 1, units: 1, neighbour: [4] },
    { id: 6, gold: 2, units: 1, neighbour: [4,3,7,8] },
    { id: 7, gold: 5, units: 1, neighbour: [3,11,6,30] },
    { id: 8, gold: 2, units: 1, neighbour: [9,6,32] },
    { id: 9, gold: 1, units: 1, neighbour: [8] },
    { id: 10, gold: 2, units: 1, neighbour: [3,11,15,16] },
    { id: 11, gold: 2, units: 1, neighbour: [3,7,12,14,15,10] },
    { id: 12, gold: 2, units: 1, neighbour: [13,14,11] },
    { id: 13, gold: 2, units: 1, neighbour: [12,14,24,29] },
    { id: 14, gold: 2, units: 1, neighbour: [13,12,11,15] },
    { id: 15, gold: 5, units: 1, neighbour: [14,11,10,16,20] },
    { id: 16, gold: 2, units: 1, neighbour: [15,10,17,20] },
    { id: 17, gold: 2, units: 1, neighbour: [16,20,18,2,1] },
    { id: 18, gold: 2, units: 1, neighbour: [17,20,21,19] },
    { id: 19, gold: 2, units: 1, neighbour: [18,21] },
    { id: 20, gold: 5, units: 1, neighbour: [17,18,19,21,22,15,16] },
    { id: 21, gold: 2, units: 1, neighbour: [20,19,18,22,23] },
    { id: 22, gold: 2, units: 1, neighbour: [20,21,23,24,25] },
    { id: 23, gold: 2, units: 1, neighbour: [22,21,25] },
    { id: 24, gold: 5, units: 1, neighbour: [25,22,13,26] },
    { id: 25, gold: 2, units: 1, neighbour: [23,22,24,26] },
    { id: 26, gold: 2, units: 1, neighbour: [25,27,24] },
    { id: 27, gold: 2, units: 1, neighbour: [26,28] },
    { id: 28, gold: 2, units: 1, neighbour: [27,29] },
    { id: 29, gold: 2, units: 1, neighbour: [28,13,30,31] },
    { id: 30, gold: 5, units: 1, neighbour: [29,7,31] },
    { id: 31, gold: 2, units: 1, neighbour: [30,29,32] },
    { id: 32, gold: 1, units: 1, neighbour: [31,8] }
];

const originalContinents = [
    { continent: 'europe', gold: 10, countries: [0,1,2,3,4,5,6,7,8,9] },
    { continent: 'east-europe', gold: 10, countries: [10,11,12,13,14,15,16] },
    { continent: 'asia', gold: 8, countries: [17,18,19,20,21,22,23] },
    { continent: 'middle-east', gold: 4, countries: [24,25,26,27] },
    { continent: 'africa', gold: 6, countries: [28,29,30,31,32] }
];

const originalGroups = originalContinents.map((region) => region.countries);
const maps = {
    original: {
        id: 'original',
        name: 'Original Map',
        description: 'The original 33-territory map and its classic connections.',
        theme: 'original',
        countries: originalCountries,
        continents: originalContinents,
        positions: null
    },
    archipelago: createArchipelago(),
    frontier: createFrontier(),
    world: createWorld(),
    quick: createQuickTest()
};

function createWorld() {
    const names = [
        'Alaska', 'Northwest Territory', 'Greenland', 'Alberta', 'Ontario', 'Quebec', 'Western United States', 'Eastern United States', 'Central America',
        'Venezuela', 'Peru', 'Brazil', 'Argentina',
        'Iceland', 'Scandinavia', 'Ukraine', 'Great Britain', 'Northern Europe', 'Western Europe', 'Southern Europe',
        'North Africa', 'Egypt', 'East Africa', 'Congo', 'South Africa', 'Madagascar',
        'Ural', 'Siberia', 'Yakutsk', 'Kamchatka', 'Irkutsk', 'Mongolia', 'Japan', 'Afghanistan', 'Middle East', 'India', 'Siam', 'China',
        'Indonesia', 'New Guinea', 'Western Australia', 'Eastern Australia'
    ];
    // Hand-tuned so markers, labels and routes never overlap each other or the board icons.
    const coordinatePairs = [
        [70,118],[180,118],[355,92],[150,218],[250,218],[350,205],[160,318],[275,318],[215,418],
        [265,505],[220,612],[345,598],[265,718],
        [470,112],[590,100],[700,190],[470,220],[585,212],[470,322],[595,318],
        [495,462],[625,440],[680,548],[560,580],[590,700],[730,692],
        [800,138],[895,98],[990,78],[1092,108],[985,185],[965,305],[1085,315],[815,288],[725,440],[850,478],[965,478],[905,385],
        [960,590],[1075,598],[965,728],[1075,738]
    ];
    const positions = coordinatePairs.map(([x, y]) => ({x, y}));
    const countries = names.map((name, id) => ({id, name, gold: 2, units: 1, neighbour: []}));
    const id = Object.fromEntries(names.map((name, index) => [name, index]));
    const links = [
        'Alaska|Northwest Territory','Alaska|Alberta','Alaska|Kamchatka',
        'Northwest Territory|Alberta','Northwest Territory|Ontario','Northwest Territory|Greenland',
        'Greenland|Ontario','Greenland|Quebec','Greenland|Iceland',
        'Alberta|Ontario','Alberta|Western United States',
        'Ontario|Quebec','Ontario|Western United States','Ontario|Eastern United States',
        'Quebec|Eastern United States','Western United States|Eastern United States','Western United States|Central America',
        'Eastern United States|Central America','Central America|Venezuela',
        'Venezuela|Peru','Venezuela|Brazil','Peru|Brazil','Peru|Argentina','Brazil|Argentina','Brazil|North Africa',
        'Iceland|Scandinavia','Iceland|Great Britain',
        'Scandinavia|Ukraine','Scandinavia|Great Britain','Scandinavia|Northern Europe',
        'Ukraine|Northern Europe','Ukraine|Southern Europe','Ukraine|Middle East','Ukraine|Ural','Ukraine|Afghanistan',
        'Great Britain|Northern Europe','Great Britain|Western Europe',
        'Northern Europe|Western Europe','Northern Europe|Southern Europe',
        'Western Europe|Southern Europe','Western Europe|North Africa','Southern Europe|North Africa','Southern Europe|Egypt','Southern Europe|Middle East',
        'North Africa|Egypt','North Africa|East Africa','North Africa|Congo',
        'Egypt|East Africa','Egypt|Middle East',
        'East Africa|Congo','East Africa|South Africa','East Africa|Madagascar','East Africa|Middle East',
        'Congo|South Africa','South Africa|Madagascar',
        'Ural|Siberia','Ural|China','Ural|Afghanistan',
        'Siberia|Yakutsk','Siberia|Irkutsk','Siberia|Mongolia','Siberia|China',
        'Yakutsk|Kamchatka','Yakutsk|Irkutsk',
        'Kamchatka|Irkutsk','Kamchatka|Mongolia','Kamchatka|Japan',
        'Irkutsk|Mongolia','Mongolia|Japan','Mongolia|China',
        'Afghanistan|Middle East','Afghanistan|India','Afghanistan|China',
        'Middle East|India',
        'India|China','India|Siam','Siam|China','Siam|Indonesia',
        'Indonesia|New Guinea','Indonesia|Western Australia','New Guinea|Western Australia','New Guinea|Eastern Australia','Western Australia|Eastern Australia'
    ];
    links.forEach((link) => {
        const [left, right] = link.split('|');
        connect(countries, id[left], id[right]);
    });
    const pairIds = (link) => link.split('|').map((name) => id[name]);
    const seaLinks = [
        'Greenland|Northwest Territory','Greenland|Ontario','Greenland|Quebec','Greenland|Iceland',
        'Iceland|Scandinavia','Iceland|Great Britain','Great Britain|Scandinavia','Great Britain|Northern Europe','Great Britain|Western Europe',
        'Brazil|North Africa','Western Europe|North Africa','Southern Europe|North Africa','Southern Europe|Egypt',
        'East Africa|Madagascar','South Africa|Madagascar',
        'Kamchatka|Japan','Mongolia|Japan','Siam|Indonesia',
        'Indonesia|New Guinea','Indonesia|Western Australia','New Guinea|Western Australia','New Guinea|Eastern Australia'
    ].map(pairIds);
    // Alaska and Kamchatka meet across the board edge, like the Bering Strait.
    const wrapLinks = ['Alaska|Kamchatka'].map(pairIds);

    const regions = [
        {continent: 'Europe', gold: 5, countries: [13,14,15,16,17,18,19]},
        {continent: 'North America', gold: 5, countries: [0,1,2,3,4,5,6,7,8]},
        {continent: 'South America', gold: 2, countries: [9,10,11,12]},
        {continent: 'Africa', gold: 3, countries: [20,21,22,23,24,25]},
        {continent: 'Asia', gold: 7, countries: [26,27,28,29,30,31,32,33,34,35,36,37]},
        {continent: 'Australia', gold: 2, countries: [38,39,40,41]}
    ];

    return {
        id: 'world',
        name: 'World (42 territories)',
        description: 'The classic six-continent, 42-territory world map.',
        theme: 'world',
        countries: countries,
        continents: regions,
        positions: positions,
        seaLinks: seaLinks,
        wrapLinks: wrapLinks
    };
}

function createQuickTest() {
    const countries = [
        {id: 0, name: 'Northwest', gold: 5, units: 1, neighbour: [1, 2]},
        {id: 1, name: 'Northeast', gold: 5, units: 1, neighbour: [0, 3]},
        {id: 2, name: 'Southwest', gold: 5, units: 1, neighbour: [0, 3]},
        {id: 3, name: 'Southeast', gold: 5, units: 1, neighbour: [1, 2]}
    ];
    return {
        id: 'quick',
        name: 'Quick Test (4 territories)',
        description: 'Four territories, low starting gold, and conquest-only victory.',
        theme: 'quick',
        startingGold: 15,
        conquestOnly: true,
        countries: countries,
        continents: [
            {continent: 'North', gold: 1, countries: [0, 1]},
            {continent: 'South', gold: 1, countries: [2, 3]}
        ],
        positions: [
            {x: 390, y: 300}, {x: 650, y: 300}, {x: 390, y: 560}, {x: 650, y: 560}
        ]
    };
}

function createArchipelago() {
    // Rows of territories per island; neighbours are the touching cells of a hex lattice.
    const islands = [
        { name: 'Crown Isles', gold: 8, center: { x: 215, y: 215 }, rows: [3, 4, 3] },
        { name: 'Saffron Keys', gold: 9, center: { x: 600, y: 170 }, rows: [2, 3, 2] },
        { name: 'Rain Basin', gold: 8, center: { x: 960, y: 230 }, rows: [2, 3, 2] },
        { name: 'Ember Coast', gold: 6, center: { x: 985, y: 640 }, rows: [2, 2] },
        { name: 'Ivory Reach', gold: 7, center: { x: 560, y: 650 }, rows: [2, 3] }
    ];
    const spacing = 92;
    const positions = [];
    const countries = originalCountries.map((country) => ({ id: country.id, gold: 2, units: 1, neighbour: [] }));
    const continents = originalGroups.map((ids, groupIndex) => ({
        continent: islands[groupIndex].name,
        gold: islands[groupIndex].gold,
        countries: ids.slice()
    }));

    originalGroups.forEach((ids, groupIndex) => {
        const island = islands[groupIndex];
        const slots = [];
        island.rows.forEach((count, row) => {
            for (let column = 0; column < count; column += 1) {
                slots.push({
                    x: Math.round(island.center.x + (column - (count - 1) / 2) * spacing),
                    y: Math.round(island.center.y + (row - (island.rows.length - 1) / 2) * spacing * 0.866)
                });
            }
        });
        ids.forEach((id, index) => { positions[id] = slots[index]; });
        ids.forEach((id) => ids.forEach((other) => {
            if (other > id && distance(positions[id], positions[other]) <= spacing * 1.1) {
                connect(countries, id, other);
            }
        }));
    });

    const seaLinks = [];
    const usedEnds = new Set();
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [1, 4]].forEach(([from, to]) => {
        const candidates = [];
        originalGroups[from].forEach((a) => originalGroups[to].forEach((b) => {
            candidates.push({ a: a, b: b, length: distance(positions[a], positions[b]) });
        }));
        candidates.sort((left, right) => left.length - right.length);
        const isClear = (candidate) => routeIsClear(candidate.a, candidate.b, positions, countries);
        const pick = candidates.find((candidate) => isClear(candidate) && !usedEnds.has(candidate.a) && !usedEnds.has(candidate.b)) ||
            candidates.find(isClear);
        connect(countries, pick.a, pick.b);
        seaLinks.push([pick.a, pick.b]);
        usedEnds.add(pick.a);
        usedEnds.add(pick.b);
    });

    return {
        id: 'archipelago',
        name: 'Archipelago',
        description: 'Five island regions linked by narrow sea passages.',
        theme: 'archipelago',
        countries: countries,
        continents: continents,
        positions: positions,
        seaLinks: seaLinks
    };
}

function distance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
}

function pointSegmentDistance(point, start, end) {
    const lengthSquared = Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2);
    const along = Math.max(0, Math.min(1, ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / lengthSquared));
    return distance(point, { x: start.x + along * (end.x - start.x), y: start.y + along * (end.y - start.y) });
}

function segmentsCross(first, second, third, fourth) {
    const side = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    return side(first, second, third) * side(first, second, fourth) < 0 &&
        side(third, fourth, first) * side(third, fourth, second) < 0;
}

// A route must keep clear of every other territory and never cross an existing route.
function routeIsClear(a, b, positions, countries) {
    const minimumClearance = 34;
    for (let id = 0; id < positions.length; id += 1) {
        if (id !== a && id !== b && pointSegmentDistance(positions[id], positions[a], positions[b]) < minimumClearance) {
            return false;
        }
    }
    return !countries.some((country) => country.neighbour.some((other) => {
        return other > country.id && country.id !== a && country.id !== b && other !== a && other !== b &&
            segmentsCross(positions[a], positions[b], positions[country.id], positions[other]);
    }));
}

function createFrontier() {
    const groupNames = ['Northline', 'Highlands', 'Crossroads', 'Southline', 'Coast'];
    const groupBonuses = [7, 8, 10, 8, 6];
    const groupCountries = [];
    const positions = [];
    const countries = originalCountries.map((country) => ({ id: country.id, gold: 2, units: 1, neighbour: [] }));
    const continents = [];

    for (let row = 0; row < 5; row += 1) {
        const start = row * 7;
        const end = Math.min(start + 7, countries.length);
        const ids = [];
        for (let id = start; id < end; id += 1) {
            ids.push(id);
            const column = row === 4 ? id - start + 1 : id - start;
            positions[id] = { x: 126 + column * 149, y: 126 + row * 151 };
        }
        groupCountries.push(ids);
        continents.push({ continent: groupNames[row], gold: groupBonuses[row], countries: ids });
    }

    for (let left = 0; left < positions.length; left += 1) {
        for (let right = left + 1; right < positions.length; right += 1) {
            const dx = Math.abs(positions[left].x - positions[right].x) / 149;
            const dy = Math.abs(positions[left].y - positions[right].y) / 151;
            const adjacent = (dx === 1 && dy === 0) || (dx === 0 && dy === 1) ||
                (dx === 1 && dy === 1 && (left + right) % 2 === 0);
            if (adjacent) {
                connect(countries, left, right);
            }
        }
    }

    [3, 10, 18, 24, 29].forEach((id) => { countries[id].gold = 5; });

    return {
        id: 'frontier',
        name: 'The Marches',
        description: 'A broad frontier of connected lanes and exposed crossings.',
        theme: 'frontier',
        countries: countries,
        continents: continents,
        positions: positions
    };
}

function connect(countries, left, right) {
    if (countries[left].neighbour.indexOf(right) === -1) {
        countries[left].neighbour.push(right);
    }
    if (countries[right].neighbour.indexOf(left) === -1) {
        countries[right].neighbour.push(left);
    }
}

function cloneMap(map) {
    return {
        id: map.id,
        name: map.name,
        description: map.description,
        theme: map.theme,
        startingGold: map.startingGold,
        conquestOnly: Boolean(map.conquestOnly),
        countries: map.countries.map((country) => ({
            id: country.id,
            name: country.name,
            gold: country.gold,
            units: country.units,
            neighbour: country.neighbour.slice()
        })),
        continents: map.continents.map((region) => ({
            continent: region.continent,
            gold: region.gold,
            countries: region.countries.slice()
        })),
        positions: map.positions && map.positions.map((position) => ({ x: position.x, y: position.y })),
        seaLinks: map.seaLinks && map.seaLinks.map((link) => link.slice()),
        wrapLinks: map.wrapLinks && map.wrapLinks.map((link) => link.slice())
    };
}

const developmentOnlyMaps = ['quick'];

function isDevelopment() {
    return ['', 'development', 'test'].indexOf(process.env.NODE_ENV || '') !== -1;
}

exports.list = function() {
    return Object.keys(maps).filter((id) => isDevelopment() || developmentOnlyMaps.indexOf(id) === -1).map((id) => {
        const map = maps[id];
        return { id: map.id, name: map.name, description: map.description };
    });
};

exports.get = function(mapId) {
    return cloneMap(maps[mapId] || maps.original);
};

exports.geometry = { pointSegmentDistance: pointSegmentDistance, segmentsCross: segmentsCross };
