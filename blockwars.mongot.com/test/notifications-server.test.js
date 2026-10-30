'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const crypto = require('node:crypto');
const webpush = require('web-push');
const createNotifications = require('../serviceworker');

const origin = 'https://blockwars.test';
const subscription = {
    endpoint: 'https://fcm.googleapis.com/test',
    keys: {
        p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url'),
        auth: Buffer.alloc(16, 2).toString('base64url')
    }
};

function fixture(options = {}) {
    const docs = [];
    const delivered = [];
    const errors = [];
    let timestamp = 100000;
    const model = {
        async findOne(query) { return docs.find(doc => doc.subscription === query.subscription); },
        async findOneAndUpdate(query, update) {
            if (options.databaseError) { throw new Error('Database unavailable'); }
            const doc = await this.findOne(query);
            if (doc) { Object.assign(doc, update); } else { docs.push({ ...update }); }
        },
        async updateMany(query, update) {
            for (const doc of docs.filter(doc => doc.subscription === query.subscription)) {
                Object.assign(doc, update.$set);
            }
        },
        async find() { return docs.filter(doc => doc.active); }
    };
    const notifications = createNotifications({
        origin, model,
        env: options.disabled ? {} : {
            VAPID_SUBJECT: 'mailto:test@example.com', VAPID_PUBLIC_KEY: 'test-public', VAPID_PRIVATE_KEY: 'test-private'
        },
        webpush: {
            setVapidDetails() {},
            async sendNotification(target, payload, settings) {
                if (options.deliveryError) { throw options.deliveryError; }
                delivered.push({ target, payload: JSON.parse(payload), settings });
            }
        },
        now: () => timestamp,
        logger: { error: (...args) => errors.push(args), warn: (...args) => errors.push(args) }
    });
    return { ...notifications, docs, delivered, errors, advance: () => { timestamp += 60000; } };
}

async function serve(t, notifications) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { username: 'Alice' }; next(); });
    app.use(notifications.router);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}`;
    return (method, route = '/notifications/subscription', body = { subscription }, requestOrigin = origin) =>
        fetch(url + route, {
            method,
            headers: { origin: requestOrigin, 'content-type': 'application/json' },
            body: method === 'GET' ? undefined : JSON.stringify(body)
        });
}

test('saved subscriptions receive server arrivals without any recipient page or socket', async t => {
    const notifications = fixture();
    const request = await serve(t, notifications);
    for (let i = 0; i < 2; i++) {
        const response = await request('PUT', undefined, { subscription, username: 'spoofed' });
        assert.equal(response.status, 200);
    }
    assert.equal(notifications.docs.length, 1);
    assert.equal(notifications.docs[0].username, 'Alice', 'identity must come from the session');
    let response = await request('POST', '/notifications/subscription/status');
    assert.equal((await response.json()).active, true);

    await notifications.notifyArrival('Alice');
    assert.equal(notifications.delivered.length, 0, 'do not notify an account about its own arrival');
    await notifications.notifyArrival('Bob');
    assert.equal(notifications.delivered.length, 1);
    assert.match(notifications.delivered[0].payload.title, /Bob/);
    assert.equal(notifications.delivered[0].settings.TTL, 60);
    await notifications.notifyArrival('Carol');
    assert.equal(notifications.delivered.length, 1, 'throttle bursts of arrivals');
    notifications.advance();
    await notifications.notifyArrival('Carol');
    assert.equal(notifications.delivered.length, 2);

    response = await request('DELETE');
    assert.equal(response.status, 200);
    response = await request('POST', '/notifications/subscription/status');
    assert.equal((await response.json()).active, false);
    notifications.advance();
    await notifications.notifyArrival('Dave');
    assert.equal(notifications.delivered.length, 2, 'opt-out must stop off-site delivery');
});

test('requests reject cross-site changes, malformed keys and unsafe endpoints', async t => {
    const notifications = fixture();
    const request = await serve(t, notifications);
    assert.equal((await request('PUT', undefined, { subscription }, 'https://other.test')).status, 403);
    for (const invalid of [
        null, {}, { ...subscription, keys: { auth: 'short', p256dh: 'short' } },
        { ...subscription, endpoint: 'http://127.0.0.1/internal' },
        { ...subscription, endpoint: 'https://fcm.googleapis.com.evil.test/push' },
        { ...subscription, endpoint: 'https://fcm.googleapis.com:444/push' }
    ]) {
        assert.equal((await request('PUT', undefined, { subscription: invalid })).status, 400);
    }
    assert.equal(notifications.docs.length, 0);
});

test('disabled configuration is explicit and never exposes a private key', async t => {
    const notifications = fixture({ disabled: true });
    const request = await serve(t, notifications);
    const response = await request('GET', '/notifications/config');
    assert.deepEqual(await response.json(), { enabled: false, publicKey: null });
    assert.equal((await request('PUT')).status, 503);
    await notifications.notifyArrival('Bob');
    assert.equal(notifications.delivered.length, 0);
});

test('database failures do not report a successful subscription', async t => {
    const notifications = fixture({ databaseError: true });
    const request = await serve(t, notifications);
    const response = await request('PUT');
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /Could not save/);
    assert.equal(notifications.errors.length, 1);
});

for (const code of [404, 410, 503]) {
    test(`push response ${code} ${code === 503 ? 'logs failure' : 'deactivates an expired subscription'}`, async t => {
        const notifications = fixture({ deliveryError: { statusCode: code } });
        const request = await serve(t, notifications);
        await request('PUT');
        await notifications.notifyArrival('Bob');
        assert.equal(notifications.docs[0].active, code === 503);
        assert.equal(notifications.errors.length, code === 503 ? 1 : 0);
    });
}

test('malformed legacy subscriptions are deactivated, not retried forever', async () => {
    const notifications = fixture();
    notifications.docs.push({ subscription: 'not JSON', active: true });
    await notifications.notifyArrival('Bob');
    assert.equal(notifications.docs[0].active, false);
    assert.ok(notifications.errors.length > 0);
});

test('partial VAPID configuration fails explicitly', () => {
    assert.throws(() => createNotifications({
        model: {}, webpush: {}, env: { VAPID_SUBJECT: 'mailto:test@example.com' }
    }), /Set all/);
});

test('real web-push library can encrypt and sign the saved browser subscription', async () => {
    const vapid = webpush.generateVAPIDKeys();
    const ecdh = crypto.createECDH('prime256v1');
    const target = {
        endpoint: subscription.endpoint,
        keys: {
            p256dh: ecdh.generateKeys().toString('base64url'),
            auth: crypto.randomBytes(16).toString('base64url')
        }
    };
    let request;
    const notifications = createNotifications({
        origin,
        env: {
            VAPID_SUBJECT: 'mailto:test@example.com',
            VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey
        },
        model: { find: async () => [{ subscription: JSON.stringify(target), username: 'Alice', active: true }] },
        webpush: {
            setVapidDetails: (...args) => webpush.setVapidDetails(...args),
            sendNotification: async (...args) => { request = webpush.generateRequestDetails(...args); }
        }
    });
    await notifications.notifyArrival('Bob');
    assert.equal(request.endpoint, target.endpoint);
    assert.equal(request.headers.TTL, 60);
    assert.ok(request.headers.Authorization.startsWith('vapid '));
    assert.ok(request.body.length > 0);
});
