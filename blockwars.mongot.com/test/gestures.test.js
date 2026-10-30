"use strict";
const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const GestureRecognizer = require('../public/js/modules/gestures');

const CELL = 30;

function recognizer(overrides = {}) {
    const calls = [];
    const actions = {
        move: d => calls.push(['move', d]),
        rotate: d => calls.push(['rotate', d]),
        softDrop: on => calls.push(['softDrop', on]),
        hardDrop: () => calls.push(['hardDrop'])
    };
    const options = { cellWidth: () => CELL, centerX: () => 100, sensitivity: () => 1, ...overrides };
    return { gesture: new GestureRecognizer(options, actions), calls };
}

// Moves the finger in even steps from (x0, y0) to (x1, y1) over duration ms, starting at time t0.
function drag(gesture, [x0, y0], [x1, y1], duration, t0 = 0, steps = 10) {
    gesture.down(x0, y0, t0);
    for (let i = 1; i <= steps; i++) {
        gesture.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, t0 + duration * i / steps);
    }
}

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

describe('tap', () => {
    test('on the right half rotates clockwise', () => {
        const { gesture, calls } = recognizer();
        gesture.down(150, 200, 0);
        gesture.up(150, 200, 80);
        assert.deepEqual(calls, [['rotate', 1]]);
    });

    test('on the left half rotates counter-clockwise', () => {
        const { gesture, calls } = recognizer();
        gesture.down(60, 200, 0);
        gesture.up(60, 200, 80);
        assert.deepEqual(calls, [['rotate', -1]]);
    });

    test('survives a little wobble', () => {
        const { gesture, calls } = recognizer();
        gesture.down(150, 200, 0);
        gesture.move(154, 203, 30);
        gesture.up(154, 203, 90);
        assert.deepEqual(calls, [['rotate', 1]]);
    });

    test('a press that is too slow is not a tap', () => {
        const { gesture, calls } = recognizer({ holdMs: 1000 });
        gesture.down(150, 200, 0);
        gesture.up(150, 200, 400);
        assert.deepEqual(calls, []);
    });

    test('a small drag that did not reach a column is neither a move nor a tap', () => {
        const { gesture, calls } = recognizer();
        drag(gesture, [150, 200], [165, 200], 100);
        gesture.up(165, 200, 120);
        assert.deepEqual(calls, []);
    });
});

describe('horizontal drag', () => {
    test('moves one column per cell width of travel', () => {
        const { gesture, calls } = recognizer();
        drag(gesture, [100, 200], [190, 200], 300);
        gesture.up(190, 200, 320);
        assert.deepEqual(calls, [['move', 1], ['move', 1], ['move', 1]]);
    });

    test('moves left too', () => {
        const { gesture, calls } = recognizer();
        drag(gesture, [200, 200], [140, 200], 300);
        gesture.up(140, 200, 320);
        assert.deepEqual(calls, [['move', -1], ['move', -1]]);
    });

    test('keeps tracking the finger when it reverses', () => {
        const { gesture, calls } = recognizer();
        gesture.down(100, 200, 0);
        gesture.move(135, 200, 50);
        gesture.move(100, 200, 100);
        gesture.up(100, 200, 120);
        assert.deepEqual(calls, [['move', 1], ['move', -1]]);
    });

    test('higher sensitivity needs less travel', () => {
        const { gesture, calls } = recognizer({ sensitivity: () => 2 });
        drag(gesture, [100, 200], [190, 200], 300);
        gesture.up(190, 200, 320);
        assert.equal(calls.filter(([name]) => name === 'move').length, 6);
    });

    test('lower sensitivity needs more travel', () => {
        const { gesture, calls } = recognizer({ sensitivity: () => 0.5 });
        drag(gesture, [100, 200], [190, 200], 300);
        gesture.up(190, 200, 320);
        assert.equal(calls.filter(([name]) => name === 'move').length, 1);
    });
});

describe('soft drop', () => {
    test('holding a finger down soft-drops until it lifts, and does not rotate', () => {
        const { gesture, calls } = recognizer();
        gesture.down(150, 200, 0);
        mock.timers.tick(300);
        assert.deepEqual(calls, [['softDrop', true]]);

        gesture.up(150, 200, 500);
        assert.deepEqual(calls, [['softDrop', true], ['softDrop', false]]);
    });

    test('dragging down a cell soft-drops, and dragging back up stops it', () => {
        const { gesture, calls } = recognizer();
        gesture.down(150, 200, 0);
        gesture.move(150, 240, 400);
        gesture.move(150, 205, 600);
        gesture.up(150, 205, 650);
        assert.deepEqual(calls, [['softDrop', true], ['softDrop', false]]);
    });

    test('a finger that moves before the hold time never starts a hold', () => {
        const { gesture, calls } = recognizer();
        gesture.down(150, 200, 0);
        gesture.move(180, 200, 100);
        mock.timers.tick(500);
        assert.deepEqual(calls, [['move', 1]]);
    });

    test('cancelling releases a soft drop', () => {
        const { gesture, calls } = recognizer();
        gesture.down(150, 200, 0);
        mock.timers.tick(300);
        gesture.cancel();
        assert.deepEqual(calls, [['softDrop', true], ['softDrop', false]]);
    });
});

describe('flick', () => {
    test('a fast downward flick hard-drops', () => {
        const { gesture, calls } = recognizer();
        drag(gesture, [150, 100], [152, 220], 90);
        gesture.up(152, 220, 100);
        assert.deepEqual(calls.filter(([name]) => name === 'hardDrop'), [['hardDrop']]);
        assert.deepEqual(calls.at(-2), ['softDrop', false], 'the soft drop ends before the hard drop');
        assert.equal(calls.filter(([name]) => name === 'rotate').length, 0);
    });

    test('a slow drag down of the same distance does not hard-drop', () => {
        const { gesture, calls } = recognizer();
        drag(gesture, [150, 100], [150, 220], 900);
        gesture.up(150, 220, 910);
        assert.equal(calls.filter(([name]) => name === 'hardDrop').length, 0);
    });

    test('a fast flick that is mostly sideways does not hard-drop', () => {
        const { gesture, calls } = recognizer();
        drag(gesture, [100, 100], [260, 190], 90);
        gesture.up(260, 190, 100);
        assert.equal(calls.filter(([name]) => name === 'hardDrop').length, 0);
    });

    test('a short fast flick does not hard-drop', () => {
        const { gesture, calls } = recognizer();
        drag(gesture, [150, 100], [150, 130], 20);
        gesture.up(150, 130, 25);
        assert.equal(calls.filter(([name]) => name === 'hardDrop').length, 0);
    });

    test('a finger that slows down before lifting does not hard-drop', () => {
        const { gesture, calls } = recognizer();
        drag(gesture, [150, 100], [150, 220], 90);
        gesture.up(150, 220, 600);
        assert.equal(calls.filter(([name]) => name === 'hardDrop').length, 0);
    });
});

describe('one finger at a time', () => {
    test('a second finger is ignored until the first lifts', () => {
        const { gesture, calls } = recognizer();
        gesture.down(150, 200, 0);
        gesture.down(60, 200, 10);
        gesture.up(60, 200, 50);
        assert.deepEqual(calls, [['rotate', -1]]);
        assert.equal(gesture.active, false);
    });
});
