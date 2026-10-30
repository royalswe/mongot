'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker(windows = []) {
    const listeners = {};
    const shown = [];
    const opened = [];
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/service-worker.js'), 'utf8'), {
        URL,
        self: {
            location: { origin: 'https://blockwars.test' },
            addEventListener: (type, handler) => { listeners[type] = handler; },
            registration: { showNotification: async (title, options) => { shown.push({ title, options }); } },
            clients: {
                matchAll: async () => windows,
                openWindow: async url => { opened.push(url); }
            }
        }
    });
    return { listeners, shown, opened };
}

test('push displays a notification and keeps the worker alive with no site window open', async () => {
    const { listeners, shown } = worker();
    let completed;
    listeners.push({
        data: { json: () => ({ title: 'Bob arrived in the Lobby' }) },
        waitUntil: promise => { completed = promise; }
    });
    assert.ok(completed instanceof Promise || typeof completed.then === 'function');
    await completed;
    assert.equal(shown[0].title, 'Bob arrived in the Lobby');
    assert.equal(shown[0].options.tag, 'blockwars-lobby');
});

for (const existing of [false, true]) {
    test(`notification click ${existing ? 'focuses the existing Lobby' : 'opens the Lobby without a pre-existing window'}`, async () => {
        let focused = false;
        const client = { url: 'https://blockwars.test/lobby', focus: async () => { focused = true; } };
        const { listeners, opened } = worker(existing ? [client] : []);
        let completed;
        let closed = false;
        listeners.notificationclick({
            notification: { close: () => { closed = true; } },
            waitUntil: promise => { completed = promise; }
        });
        await completed;
        assert.equal(closed, true);
        assert.equal(focused, existing);
        assert.deepEqual(opened, existing ? [] : ['https://blockwars.test/lobby']);
    });
}
