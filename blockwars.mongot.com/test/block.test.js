"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/js/block.js'), 'utf8');

function controls(host) {
    const listeners = {};
    const emitted = [];
    const matrix = Array.from({ length: 22 }, () => Array(10).fill(0));
    const context = vm.createContext({
        location: { host },
        document: { addEventListener: (name, callback) => { listeners[name] = callback; } },
        TOUCH: { attach() {} },
        KEY_BINDS: {},
        isNumeric: value => /^\d+$/.test(value)
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/modules/utils.js'), 'utf8'), context);
    vm.runInContext(source, context);
    const block = {
        tetris: { stopped: false },
        arena: {
            matrix,
            events: { emit: (...args) => emitted.push(args) },
            clear: () => matrix.forEach(row => row.fill(0))
        }
    };
    vm.runInContext('Block.prototype.blockControll', context).call(block);
    return {
        matrix, emitted,
        press: keyCode => listeners.keydown({ keyCode, target: { id: '' } })
    };
}

test('development Special shortcuts remain repeatable with case-scoped bindings', () => {
    const { matrix, emitted, press } = controls('localhost:5090');
    for (const key of [89, 72, 89, 72]) { press(key); }
    assert.deepEqual(JSON.parse(JSON.stringify(emitted)), [
        ['special', 'add-special', [16]],
        ['special', 'add-special', [11, 11, 11]],
        ['special', 'add-special', [16]],
        ['special', 'add-special', [11, 11, 11]]
    ]);
    assert.deepEqual(matrix[20], [0, 0, 2, 2, 2, 2, 2, 2, 2, 2]);
    assert.deepEqual(matrix[21], [0, 0, 1, 1, 1, 1, 1, 1, 1, 1]);
});

test('development shortcuts remain inactive on other hosts', () => {
    const { emitted, press } = controls('blockwars.mongot.com');
    press(89);
    press(72);
    assert.deepEqual(emitted, []);
});
