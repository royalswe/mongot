'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { compareValues, sortRows, initSortableTables } = require('../public/js/table-sort');

function row(value) {
    return { cells: [{ textContent: value }] };
}

test('table values sort naturally across numbers, durations, and dates', () => {
    assert.ok(compareValues('2', '10') < 0);
    assert.ok(compareValues('2:05', '12:00') < 0);
    assert.ok(compareValues('2026-10-02 09:00', '2026-10-10 09:00') < 0);
});

test('table rows sort ascending and descending without mutating the input', () => {
    const rows = [row('Player 10'), row('Player 2'), row('Player 1')];

    assert.deepEqual(sortRows(rows, 0).map(item => item.cells[0].textContent), [
        'Player 1', 'Player 2', 'Player 10'
    ]);
    assert.deepEqual(sortRows(rows, 0, 'descending').map(item => item.cells[0].textContent), [
        'Player 10', 'Player 2', 'Player 1'
    ]);
    assert.deepEqual(rows.map(item => item.cells[0].textContent), ['Player 10', 'Player 2', 'Player 1']);
});

test('table controls toggle sort direction and update aria state', () => {
    const handlers = [];
    const headers = Array.from({ length: 2 }, () => {
        const attributes = {};
        const button = { addEventListener: (event, handler) => handlers.push(handler) };
        return {
            setAttribute: (name, value) => { attributes[name] = value; },
            getAttribute: name => attributes[name],
            querySelector: () => button
        };
    });
    const body = {
        rows: [row('10'), row('2')],
        append(...rows) { this.rows = rows; }
    };
    const table = { tHead: { rows: [{ cells: headers }] }, tBodies: [body] };

    initSortableTables({ querySelectorAll: () => [table] });
    assert.equal(headers[0].getAttribute('aria-sort'), 'none');

    handlers[0]();
    assert.equal(headers[0].getAttribute('aria-sort'), 'ascending');
    assert.equal(headers[1].getAttribute('aria-sort'), 'none');
    assert.deepEqual(body.rows.map(item => item.cells[0].textContent), ['2', '10']);

    handlers[0]();
    assert.equal(headers[0].getAttribute('aria-sort'), 'descending');
    assert.deepEqual(body.rows.map(item => item.cells[0].textContent), ['10', '2']);
});

test('deferred script initializes when the document is already parsed', () => {
    const attributes = {};
    const header = {
        setAttribute: (name, value) => { attributes[name] = value; },
        getAttribute: name => attributes[name],
        querySelector: () => ({ addEventListener() {} })
    };
    const table = {
        tHead: { rows: [{ cells: [header] }] },
        tBodies: [{ rows: [], append() {} }]
    };
    const document = { readyState: 'interactive', querySelectorAll: () => [table] };
    const source = fs.readFileSync(require.resolve('../public/js/table-sort'), 'utf8');

    vm.runInNewContext(source, { document, Intl, module: { exports: {} } });

    assert.equal(header.getAttribute('aria-sort'), 'none');
});

test('script waits for DOMContentLoaded while the document is loading', () => {
    const attributes = {};
    let readyHandler;
    const header = {
        setAttribute: (name, value) => { attributes[name] = value; },
        getAttribute: name => attributes[name],
        querySelector: () => ({ addEventListener() {} })
    };
    const table = {
        tHead: { rows: [{ cells: [header] }] },
        tBodies: [{ rows: [], append() {} }]
    };
    const document = {
        readyState: 'loading',
        querySelectorAll: () => [table],
        addEventListener: (event, handler) => {
            assert.equal(event, 'DOMContentLoaded');
            readyHandler = handler;
        }
    };
    const source = fs.readFileSync(require.resolve('../public/js/table-sort'), 'utf8');

    vm.runInNewContext(source, { document, Intl, module: { exports: {} } });
    assert.equal(header.getAttribute('aria-sort'), undefined);

    readyHandler();
    assert.equal(header.getAttribute('aria-sort'), 'none');
});