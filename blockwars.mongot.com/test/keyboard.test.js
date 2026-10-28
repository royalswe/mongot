"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/modules/utils.js'), 'utf8'), context);
const keyCode = context.UTILS.keyCode;

test('modern keyboard events map to existing numeric bindings without reading keyCode', () => {
    const cases = [
        ['ArrowLeft', 'ArrowLeft', 37], ['ArrowRight', 'ArrowRight', 39],
        ['ArrowDown', 'ArrowDown', 40], ['ArrowUp', 'ArrowUp', 38],
        [' ', 'Space', 32], ['Enter', 'Enter', 13], ['Enter', 'NumpadEnter', 13],
        ['z', 'KeyZ', 90], ['Z', 'KeyZ', 90], ['c', 'KeyC', 67],
        ['a', 'KeyQ', 65], ['q', 'KeyA', 81],
        ['1', 'Digit1', 49], ['!', 'Digit1', 49], ['&', 'Digit1', 49],
        ['1', 'Numpad1', 97], ['End', 'Numpad1', 35],
        ['+', 'NumpadAdd', 107], ['/', 'NumpadDivide', 111],
        ['F1', 'F1', 112], ['F12', 'F12', 123], ['F24', 'F24', 135],
        ['Escape', 'Escape', 27], ['Control', 'ControlLeft', 17],
        ['Shift', 'ShiftRight', 16], ['Alt', 'AltLeft', 18],
        ['Backspace', 'Backspace', 8], ['Delete', 'Delete', 46],
        ['Tab', 'Tab', 9], ['Home', 'Home', 36], ['PageUp', 'PageUp', 33]
    ];
    for (const [key, code, expected] of cases) {
        assert.equal(keyCode({
            key, code,
            get keyCode() { throw new Error('Legacy API accessed'); }
        }), expected, `${key}/${code}`);
    }
});

test('punctuation retains browser-specific saved binding values', () => {
    for (const [key, code, values] of [
        [';', 'Semicolon', [59, 186]],
        ['=', 'Equal', [61, 187]],
        ['-', 'Minus', [173, 189]],
        [',', 'Comma', [188]], ['.', 'Period', [190]],
        ['/', 'Slash', [191]], ['`', 'Backquote', [192]],
        ['[', 'BracketLeft', [219]], ['\\', 'Backslash', [220]],
        [']', 'BracketRight', [221]], ["'", 'Quote', [222]]
    ]) {
        for (const value of values) {
            assert.equal(keyCode({ key, code, keyCode: value }), value);
        }
        assert.equal(keyCode({ key, code, keyCode: 0 }), values[values.length - 1]);
    }
});

test('unidentified and legacy synthetic events retain a narrow numeric fallback', () => {
    assert.equal(keyCode({ key: 'Unidentified', code: '', keyCode: 90 }), 90);
    assert.equal(keyCode({ keyCode: 37 }), 37);
    assert.equal(keyCode({ key: 'Unidentified', code: '', keyCode: 0 }), 0);
    assert.equal(keyCode({}), 0);
    assert.equal(keyCode({ key: 'Meta', code: 'MetaLeft', keyCode: 224 }), 224);
    assert.equal(keyCode({ key: 'Meta', code: 'MetaRight', keyCode: 0 }), 92);
});
