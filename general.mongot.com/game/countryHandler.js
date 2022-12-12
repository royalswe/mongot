'use strict';
exports.countries = function() {
    const countries = [
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
    // Shuffle the countries
    countries.sort(() => { return 0.5 - Math.random(); });
    return countries;
};

exports.continents = function() {
    const continents = [
        { continent: 'europe', gold: 10, countries: [0,1,2,3,4,5,6,7,8,9] },
        { continent: 'east-europe', gold: 10, countries: [10,11,12,13,14,15,16] },
        { continent: 'asia', gold: 8, countries: [17,18,19,20,21,22,23] },
        { continent: 'middle-east', gold: 4, countries: [24,25,26,27] },
        { continent: 'africa', gold: 6, countries: [28,29,30,31,32] }
    ];
    return continents;
};

