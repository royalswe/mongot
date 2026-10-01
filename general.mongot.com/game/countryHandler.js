'use strict';
const maps = require('./maps');

function shuffled(countries) {
    for (let index = countries.length - 1; index > 0; index -= 1) {
        const otherIndex = Math.floor(Math.random() * (index + 1));
        [countries[index], countries[otherIndex]] = [countries[otherIndex], countries[index]];
    }
    return countries;
}

exports.list = maps.list;
exports.getMap = maps.get;

exports.countries = function(mapId) {
    return shuffled(maps.get(mapId).countries);
};

exports.continents = function(mapId) {
    return maps.get(mapId).continents;
};

exports.ownsContinent = function(continentIds, ownedIds) {
    return continentIds.every((id) => ownedIds.indexOf(id) !== -1);
};

