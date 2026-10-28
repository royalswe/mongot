'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function browser({ subscribed = false, active = false, permission = 'granted', failSave = false, configured = true } = {}) {
    const calls = [];
    const elements = {
        toggle_notification: { checked: false, disabled: false },
        'notification-details': { open: false },
        'notification-help-toggle': { focused: false, focus() { this.focused = true; } },
        'notification-state': { textContent: 'Off' },
        'notification-status': { textContent: '' }
    };
    const subscription = {
        endpoint: 'https://fcm.googleapis.com/test',
        keys: { p256dh: 'key', auth: 'auth' },
        unsubscribe: async () => { calls.push('unsubscribe'); return true; }
    };
    let current = subscribed ? subscription : null;
    const registration = {
        pushManager: {
            getSubscription: async () => current,
            subscribe: async () => { calls.push('subscribe'); current = subscription; return subscription; }
        },
        showNotification: async () => { calls.push('notification'); }
    };
    const storage = new Map();
    const context = {
        user: 'guest',
        window: { isSecureContext: true, PushManager: function () {} },
        Notification: { permission, requestPermission: async () => permission },
        navigator: { serviceWorker: {
            register: async () => { calls.push('register'); return registration; },
            ready: Promise.resolve(registration),
            getRegistration: async () => registration
        } },
        document: { getElementById: id => elements[id] },
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        Howl: function () { this.play = () => calls.push('sound'); },
        fetch: async (url, options = {}) => {
            calls.push([url, options.method || 'GET']);
            const failed = failSave && options.method === 'PUT';
            return { ok: !failed, json: async () => failed
                ? { error: 'Could not save notification settings.' }
                : { enabled: configured, publicKey: 'AQID', active } };
        },
        atob: value => Buffer.from(value, 'base64').toString('binary'),
        Uint8Array, Date, console, setTimeout
    };
    context.window.Notification = context.Notification;
    context.window.atob = context.atob;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/modules/notifications.js'), 'utf8'), context);
    return { context, calls, elements, storage };
}

test('the lobby bell saves a real push subscription without opening the explanation', async () => {
    const { context, calls, elements } = browser();
    elements.toggle_notification.checked = true;
    await context.NOTIFICATION.toggleNotificationPermissions(elements.toggle_notification);
    assert.ok(calls.includes('subscribe'), 'the bell must subscribe to push, not only enable page notifications');
    assert.ok(calls.some(call => Array.isArray(call) && call[0] === '/notifications/subscription' && call[1] === 'PUT'));
    assert.equal(elements['notification-details'].open, false);
    assert.equal(elements['notification-state'].textContent, 'On');
    assert.match(elements['notification-status'].textContent, /enabled/i);
    assert.ok(!calls.some(call => Array.isArray(call) && call[0] === '/send-pw'));
});

test('disabling a saved subscription deactivates it on the server', async () => {
    const { context, calls, elements } = browser({ subscribed: true, active: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(elements.toggle_notification.checked, true);
    elements.toggle_notification.checked = false;
    await context.NOTIFICATION.toggleNotificationPermissions(elements.toggle_notification);
    assert.ok(calls.some(call => Array.isArray(call) && call[1] === 'DELETE'));
    assert.equal(elements.toggle_notification.checked, false);
    assert.match(elements['notification-status'].textContent, /disabled/i);
});

for (const [name, options, message] of [
    ['denied permission', { permission: 'denied' }, /blocked/],
    ['dismissed permission', { permission: 'default' }, /not allowed/],
    ['unconfigured server', { configured: false }, /not configured/],
    ['failed database save', { failSave: true }, /Could not save/]
]) {
    test(`${name} is visible and does not leave the bell enabled`, async () => {
        const { context, elements } = browser(options);
        elements.toggle_notification.checked = true;
        await context.NOTIFICATION.toggleNotificationPermissions(elements.toggle_notification);
        assert.equal(elements.toggle_notification.checked, false);
        assert.equal(elements.toggle_notification.disabled, false);
        assert.equal(elements['notification-details'].open, false);
        assert.equal(elements['notification-state'].textContent, 'Off');
        assert.match(elements['notification-status'].textContent, message);
    });
}

test('unsupported browsers do not throw on arrivals and explain the limitation on click', async () => {
    const { context, elements } = browser();
    delete context.window.Notification;
    delete context.Notification;
    context.NOTIFICATION.userNotification({ msg: 'An arrival' });
    elements.toggle_notification.checked = true;
    await context.NOTIFICATION.toggleNotificationPermissions(elements.toggle_notification);
    assert.equal(elements.toggle_notification.checked, false);
    assert.match(elements['notification-status'].textContent, /supported browser/);
});

test('an active subscription restores on reload without resubscribing or double-displaying alerts', async () => {
    const { context, calls, elements } = browser({ subscribed: true, active: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(elements.toggle_notification.checked, true);
    assert.equal(elements['notification-state'].textContent, 'On');
    assert.match(elements['notification-status'].textContent, /enabled/i);
    context.NOTIFICATION.userNotification({ msg: 'An arrival' });
    context.NOTIFICATION.userNotification({ msg: 'Another arrival' });
    assert.equal(calls.filter(call => call === 'sound').length, 1);
    assert.ok(!calls.includes('notification'));
    assert.ok(!calls.includes('subscribe'));
});

test('closing the explanation preserves the setting and restores keyboard focus', async () => {
    const { context, elements, calls } = browser({ subscribed: true, active: true });
    await new Promise(resolve => setImmediate(resolve));
    elements['notification-details'].open = true;
    const requests = calls.length;
    context.NOTIFICATION.closeHelp();
    assert.equal(elements['notification-details'].open, false);
    assert.equal(elements['notification-help-toggle'].focused, true);
    assert.equal(elements.toggle_notification.checked, true);
    assert.equal(elements['notification-state'].textContent, 'On');
    assert.equal(calls.length, requests);
});

test('changing notifications also leaves an already open explanation open', async () => {
    const { context, elements } = browser();
    elements['notification-details'].open = true;
    elements.toggle_notification.checked = true;
    await context.NOTIFICATION.toggleNotificationPermissions(elements.toggle_notification);
    assert.equal(elements['notification-details'].open, true);
    assert.equal(elements.toggle_notification.checked, true);
});
