"use strict";
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const applySpecial = require('../game/special-rules');
const Grid = require('../game/ai/grid');

const HEIGHT = 22;
const WIDTH = 10;

function arena(fill = 0) {
    return Array.from({ length: HEIGHT }, () => new Array(WIDTH).fill(fill));
}

const flat = matrix => matrix.flat();
const sorted = row => [...row].sort((a, b) => a - b);

describe('applySpecial', () => {
    test('changes the matrix in place and keeps its size', () => {
        const matrix = arena(1);
        const same = matrix;

        for (const special of [8, 9, 10, 11, 12, 13, 14, 15, 17, 18]) {
            applySpecial(matrix, special);
            assert.equal(matrix, same);
            assert.equal(matrix.length, HEIGHT, `special ${special} height`);
            assert.ok(matrix.every(row => row.length === WIDTH), `special ${special} width`);
        }
    });

    test('an unknown special reports false and leaves the matrix alone', () => {
        const matrix = arena(1);
        assert.equal(applySpecial(matrix, 99), false);
        assert.deepEqual(matrix, arena(1));
    });

    test('8 add row: drops the top row and adds a bottom row with one hole', () => {
        const matrix = arena();
        matrix[0][0] = 5;

        applySpecial(matrix, 8, { random: () => 0.5 });

        assert.equal(matrix[0][0], 0);
        assert.deepEqual(matrix[HEIGHT - 1], [4, 4, 4, 4, 4, 0, 4, 4, 4, 4]);
    });

    test('9 remove row: clears the bottom row and empties the top', () => {
        const matrix = arena(1);

        applySpecial(matrix, 9);

        assert.deepEqual(matrix[0], new Array(WIDTH).fill(0));
        assert.deepEqual(matrix[HEIGHT - 1], new Array(WIDTH).fill(1));
        assert.equal(flat(matrix).filter(c => c === 1).length, (HEIGHT - 1) * WIDTH);
    });

    test('10 earthquake: shuffles inside each row except the top one', () => {
        const matrix = arena();
        matrix.forEach((row, y) => row.forEach((_, x) => { row[x] = (x + y) % 7 + 1; }));
        const before = matrix.map(sorted);

        applySpecial(matrix, 10);

        assert.deepEqual(matrix.map(sorted), before);
    });

    test('11 milkshake: keeps every block and the arena height', () => {
        const matrix = arena();
        for (let y = 14; y < HEIGHT; y++) {
            matrix[y][y % WIDTH] = 3;
            matrix[y][(y + 3) % WIDTH] = 9;
        }
        const before = sorted(flat(matrix));

        applySpecial(matrix, 11);

        assert.deepEqual(sorted(flat(matrix)), before);
        assert.equal(matrix.length, HEIGHT);
    });

    test('12 remove specials: turns specials into regular blocks', () => {
        const matrix = arena();
        matrix[5][2] = 9;
        matrix[6][3] = 18;
        matrix[7][4] = 4;

        applySpecial(matrix, 12, { random: () => 0 });

        assert.deepEqual([matrix[5][2], matrix[6][3], matrix[7][4]], [1, 1, 4]);
    });

    test('13 shotgun: punches holes in every row except the top one', () => {
        const matrix = arena(1);

        applySpecial(matrix, 13, { random: () => 0 });

        assert.equal(matrix[0][0], 1);
        for (let y = 1; y < HEIGHT; y++) {
            assert.equal(matrix[y][0], 0);
            assert.equal(matrix[y].slice(1).every(c => c === 1), true);
        }
    });

    test('14 gravity: floating blocks fall and full rows are swept', () => {
        const matrix = arena();
        matrix[10][3] = 6;
        matrix[HEIGHT - 1].fill(2);
        matrix[HEIGHT - 1][3] = 0;

        applySpecial(matrix, 14);

        // the block falls into the hole, completing the bottom row, which is then swept
        assert.deepEqual(matrix, arena());
    });

    test('14 gravity: blocks pile up at the bottom', () => {
        const matrix = arena();
        matrix[10][3] = 6;
        matrix[12][4] = 7;

        applySpecial(matrix, 14);

        assert.equal(matrix[HEIGHT - 1][3], 6);
        assert.equal(matrix[HEIGHT - 1][4], 7);
        assert.equal(flat(matrix).filter(c => c !== 0).length, 2);
    });

    test('15 clear arena: empties everything', () => {
        const matrix = arena(3);
        applySpecial(matrix, 15);
        assert.deepEqual(matrix, arena());
    });

    test('16 switch arena: copies the opponent matrix', () => {
        const matrix = arena(1);
        const opponent = arena(2);
        opponent[4][4] = 7;

        applySpecial(matrix, 16, { switchMatrix: opponent });

        assert.deepEqual(matrix, opponent);
        assert.notEqual(matrix[4], opponent[4], 'rows are copied, not shared');
    });

    test('17 monster: builds the monster below an empty top', () => {
        const matrix = arena(5);

        applySpecial(matrix, 17);

        for (let y = 0; y < 8; y++) { assert.deepEqual(matrix[y], new Array(WIDTH).fill(0)); }
        assert.deepEqual(matrix[8], [2, 2, 2, 2, 0, 0, 2, 2, 2, 2]);
        assert.deepEqual(matrix[15], [2, 2, 0, 1, 2, 2, 1, 0, 2, 2]);
        assert.deepEqual(matrix[16], [2, 2, 0, 1, 2, 2, 1, 0, 2, 2]);
        assert.deepEqual(matrix[21], [2, 2, 2, 2, 0, 0, 2, 2, 2, 2]);
    });

    test('18 mine: turns every special into a mine', () => {
        const matrix = arena();
        matrix[5][2] = 9;
        matrix[6][3] = 12;
        matrix[7][4] = 4;

        applySpecial(matrix, 18);

        assert.deepEqual([matrix[5][2], matrix[6][3], matrix[7][4]], [19, 19, 4]);
    });
});

describe('Grid.performSpecial', () => {
    test('applies the shared rules to the bot grid', () => {
        const grid = new Grid(HEIGHT, WIDTH);
        const cells = grid.cells;
        grid.cells[HEIGHT - 1].fill(1);

        grid.performSpecial({ special: 15 });

        assert.equal(grid.cells, cells);
        assert.deepEqual(grid.cells, arena());
    });

    test('passes the opponent matrix to switch arena', () => {
        const grid = new Grid(HEIGHT, WIDTH);

        grid.performSpecial({ special: 16, switchMatrix: arena(2) });

        assert.deepEqual(grid.cells, arena(2));
    });
});
