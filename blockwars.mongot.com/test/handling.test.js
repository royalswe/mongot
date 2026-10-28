"use strict";
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const Handling = require('../public/js/modules/handling');

const { AutoShift } = Handling;

// A 10 column row with the piece starting in column 4.
function shifter(overrides = {}, width = 10) {
    const settings = Object.assign({}, Handling.DEFAULTS, overrides);
    const piece = { x: 4, moves: [] };
    const shift = new AutoShift(direction => {
        const next = piece.x + direction;
        if (next < 0 || next >= width) { return false; }
        piece.x = next;
        piece.moves.push(direction);
        return true;
    }, () => settings);
    return { shift, piece, settings };
}

function frames(shift, count, ms = 16) {
    for (let i = 0; i < count; i++) { shift.update(ms); }
}

describe('settings', () => {
    test('defaults are used when nothing is stored', () => {
        assert.deepEqual(Handling.load({ getItem: () => null }), Handling.DEFAULTS);
    });

    test('values are clamped and rounded, unknown values fall back to defaults', () => {
        assert.deepEqual(Handling.normalize({ das: 9999, arr: -5, dcd: '12.4', sdf: 'x', ghost: 'yes', osRepeat: 1 }),
            { das: 500, arr: 0, dcd: 12, sdf: 16, ghost: false, osRepeat: false });
    });

    test('legacy DAS and ARR in tens of milliseconds are migrated', () => {
        const storage = { getItem: key => ({ DAS: '12', ARR: '3' })[key] || null };
        assert.deepEqual(Handling.load(storage), Object.assign({}, Handling.DEFAULTS, { das: 120, arr: 30 }));
    });

    test('legacy DAS 0 (which turned DAS off) keeps the operating system key repeat', () => {
        const storage = { getItem: key => ({ DAS: '0', ARR: '10' })[key] || null };
        assert.deepEqual(Handling.load(storage), Object.assign({}, Handling.DEFAULTS, { osRepeat: true }));
    });

    test('a store saves normalized changes and reloads them', () => {
        const data = {};
        const storage = { getItem: key => data[key] || null, setItem: (key, value) => { data[key] = value; } };
        Handling.createStore(storage).set({ das: 100, ghost: true });
        assert.deepEqual(Handling.createStore(storage).get(), Object.assign({}, Handling.DEFAULTS, { das: 100, ghost: true }));
    });

    test('a corrupt stored value falls back to defaults', () => {
        assert.deepEqual(Handling.load({ getItem: () => '{nope' }), Handling.DEFAULTS);
    });
});

describe('auto shift', () => {
    test('a press moves once and nothing more before DAS is charged', () => {
        const { shift, piece } = shifter({ das: 100, arr: 20 });
        shift.press(-1);
        frames(shift, 6); // 96 ms
        assert.deepEqual(piece.moves, [-1]);
    });

    test('once DAS is charged it moves at once, then every ARR', () => {
        const { shift, piece } = shifter({ das: 100, arr: 20 });
        shift.press(1);
        shift.update(100);
        assert.equal(piece.x, 6);
        shift.update(19);
        assert.equal(piece.x, 6);
        shift.update(1);
        assert.equal(piece.x, 7);
    });

    test('ARR faster than a frame moves several columns in one frame', () => {
        const { shift, piece } = shifter({ das: 50, arr: 5 }, 100);
        shift.press(1);
        shift.update(50);
        shift.update(16);
        assert.equal(piece.x, 4 + 1 + 1 + 3);
    });

    test('ARR 0 moves to the wall as soon as DAS is charged', () => {
        const { shift, piece } = shifter({ das: 80, arr: 0 });
        shift.press(1);
        shift.update(79);
        assert.equal(piece.x, 5);
        shift.update(1);
        assert.equal(piece.x, 9);
    });

    test('DAS 0 starts auto shifting on the next frame', () => {
        const { shift, piece } = shifter({ das: 0, arr: 0 });
        shift.press(-1);
        shift.update(16);
        assert.equal(piece.x, 0);
    });

    test('the operating system key repeat (a second press of the held key) is ignored', () => {
        const { shift, piece } = shifter({ das: 100, arr: 20 });
        shift.press(1);
        shift.update(60);
        shift.press(1);
        shift.update(40);
        assert.deepEqual(piece.moves, [1, 1]);
    });

    test('the last pressed direction wins and charges DAS again', () => {
        const { shift, piece } = shifter({ das: 100, arr: 20 });
        shift.press(-1);
        shift.update(150);
        const before = piece.x;
        shift.press(1);
        assert.equal(piece.x, before + 1);
        shift.update(99);
        assert.equal(piece.x, before + 1);
        shift.update(1);
        assert.equal(piece.x, before + 2);
    });

    test('releasing the newer key hands back to the older one without a tap', () => {
        const { shift, piece } = shifter({ das: 100, arr: 20 });
        shift.press(-1);
        shift.press(1);
        shift.release(1);
        assert.equal(shift.direction, -1);
        const before = piece.x;
        shift.update(99);
        assert.equal(piece.x, before);
        shift.update(1);
        assert.equal(piece.x, before - 1);
    });

    test('releasing the older key keeps the newer one going', () => {
        const { shift } = shifter({ das: 100, arr: 20 });
        shift.press(-1);
        shift.press(1);
        shift.update(120);
        shift.release(-1);
        assert.equal(shift.direction, 1);
        assert.equal(shift.charged(), true);
    });

    test('releasing every key stops the shift', () => {
        const { shift, piece } = shifter({ das: 50, arr: 10 });
        shift.press(1);
        shift.release(1);
        frames(shift, 10);
        assert.deepEqual(piece.moves, [1]);
    });

    test('blocked at the wall, it slides as soon as there is room', () => {
        let wall = 6;
        const settings = Object.assign({}, Handling.DEFAULTS, { das: 50, arr: 30 });
        const piece = { x: 4 };
        const shift = new AutoShift(direction => {
            if (piece.x + direction > wall) { return false; }
            piece.x += direction;
            return true;
        }, () => settings);
        shift.press(1);
        frames(shift, 20);
        assert.equal(piece.x, 6);
        wall = 9;
        shift.update(1);
        assert.equal(piece.x, 7);
    });

    test('DCD pauses a charged shift after a new piece or rotation', () => {
        const { shift, piece } = shifter({ das: 50, arr: 20, dcd: 40 }, 100);
        shift.press(1);
        shift.update(50);
        const before = piece.x;
        shift.cut();
        shift.update(59);
        assert.equal(piece.x, before);
        shift.update(1);
        assert.equal(piece.x, before + 1);
    });

    test('DCD with ARR 0 waits before going to the wall again', () => {
        const { shift, piece } = shifter({ das: 50, arr: 0, dcd: 30 });
        shift.press(1);
        shift.update(50);
        piece.x = 4; // a new piece spawns
        shift.cut();
        shift.update(29);
        assert.equal(piece.x, 4);
        shift.update(1);
        assert.equal(piece.x, 9);
    });

    test('a new piece does not inherit time from a long frame of the old one', () => {
        const { shift, piece } = shifter({ das: 50, arr: 20 }, 1000);
        shift.press(1);
        shift.update(50);
        shift.repeat = 500; // e.g. time collected while the rows were cleared
        shift.cut();
        const before = piece.x;
        shift.update(1);
        assert.equal(piece.x, before + 1);
    });

    test('DCD does nothing while DAS is still charging', () => {
        const { shift, piece } = shifter({ das: 100, arr: 20, dcd: 80 });
        shift.press(1);
        shift.update(50);
        shift.cut();
        shift.update(50);
        assert.equal(piece.x, 6);
    });

    test('reset forgets held keys', () => {
        const { shift, piece } = shifter({ das: 10, arr: 10 });
        shift.press(-1);
        shift.reset();
        frames(shift, 5);
        assert.deepEqual(piece.moves, [-1]);
    });

    test('with keyboard repeat, every press moves once and holding does nothing more', () => {
        const { shift, piece } = shifter({ osRepeat: true, das: 0, arr: 0 });
        shift.press(1);
        frames(shift, 30);
        assert.deepEqual(piece.moves, [1]);
        shift.press(1); // the operating system repeats the held key
        shift.press(1);
        assert.deepEqual(piece.moves, [1, 1, 1]);
        shift.press(-1);
        shift.release(-1);
        assert.equal(shift.direction, 1);
        assert.deepEqual(piece.moves, [1, 1, 1, -1]);
    });

    test('turning keyboard repeat off while holding goes back to DAS', () => {
        const { shift, piece, settings } = shifter({ osRepeat: true, das: 50, arr: 0 });
        shift.press(1);
        settings.osRepeat = false;
        shift.update(49);
        assert.equal(piece.x, 5);
        shift.update(1);
        assert.equal(piece.x, 9);
    });
});
