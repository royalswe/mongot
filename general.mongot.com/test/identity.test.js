'use strict';

process.env.NODE_ENV = 'test';
process.env.COOKIE_SECRET = 'unit-test-secret';
process.env.TEST_ACCOUNTS = JSON.stringify({
    'verified@test.local': {username: 'Verified', active: true, points_general: 1710, ip: '10.0.0.1'},
    'unverified@test.local': {username: 'Unverified', active: false, points_general: 1600},
    'god@test.local': {username: 'Godly', active: true, god: true, points_general: 1600},
    'scout@test.local': {username: 'Scout', active: true, points_general: 1600}
});

const assert = require('node:assert/strict');
const test = require('node:test');
const sessions = require('client-sessions');
const identity = require('../game/identity');
const isReservedName = require('../../reserved-names');
const botProfiles = require('../game/botProfiles');

function cookieFor(email, options = {}) {
    const token = sessions.util.encode(
        {cookieName: 'session', secret: options.secret || 'unit-test-secret'},
        options.content || {user: {username: 'ignored', email: email}},
        3600 * 1000,
        options.createdAt
    );
    return 'theme=dark; session=' + encodeURIComponent(token) + '; other=1';
}

test('no login cookie means guest', async () => {
    const who = await identity.resolve(undefined, undefined, 'abc');
    assert.equal(who.isGuest, true);
    assert.equal(who.points, null);
    assert.match(who.username, /^Guest-[0-9a-f]{8}$/);
});

test('a valid login cookie gives the account details from the server, not the browser', async () => {
    const verified = await identity.resolve(cookieFor('verified@test.local'), 'f'.repeat(32), 'abc');
    assert.deepEqual(
        [verified.isGuest, verified.username, verified.isUnverified, verified.isGod, verified.points],
        [false, 'Verified', false, false, 1710]
    );
    assert.equal((await identity.resolve(cookieFor('unverified@test.local'), undefined, 'abc')).isUnverified, true);
    assert.equal((await identity.resolve(cookieFor('god@test.local'), undefined, 'abc')).isGod, true);
});

test('forged, tampered, expired, unknown, or reserved sessions fall back to guest', async () => {
    const cases = {
        'signed with another secret': cookieFor('verified@test.local', {secret: 'attacker-secret'}),
        'tampered': cookieFor('verified@test.local').replace(/.{3}(?=; other)/, 'AAA'),
        'garbage': 'session=not-a-session',
        'unknown account': cookieFor('nobody@test.local'),
        'reserved bot name': cookieFor('scout@test.local')
    };
    for (const [name, cookie] of Object.entries(cases)) {
        assert.equal((await identity.resolve(cookie, undefined, 'abc')).isGuest, true, name);
    }

    const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
    assert.equal((await identity.resolve(cookieFor('verified@test.local', {createdAt: twoHoursAgo}), undefined, 'abc')).isGuest, true, 'expired');
    assert.equal((await identity.resolve(cookieFor('verified@test.local', {createdAt: Date.now() - 1000}), undefined, 'abc')).isGuest, false, 'still valid');
});

test('guest names are stable per browser id but cannot be chosen by the browser', () => {
    const one = identity.guestIdentity('a'.repeat(32), 'socket-1');
    assert.equal(one.username, identity.guestIdentity('a'.repeat(32), 'socket-2').username);
    assert.notEqual(one.username, identity.guestIdentity('b'.repeat(32), 'socket-1').username);
    assert.notEqual(one.username, 'Guest-' + 'a'.repeat(8));
    assert.notEqual(identity.guestIdentity('not valid!', 'socket-1').username, identity.guestIdentity('not valid!', 'socket-2').username);
});

test('names that the game hands out to guests and bots cannot be registered', () => {
    ['Guest', 'guest-1234abcd', 'GUEST-x', 'Relief-room-1', 'Scout', 'RAIDER', 'warden'].forEach((name) => assert.equal(isReservedName(name), true, name));
    ['roYal', 'Scouter', 'Guesty', 'Reliefs'].forEach((name) => assert.equal(isReservedName(name), false, name));
    botProfiles.forEach((profile) => assert.equal(isReservedName(profile.username), true, profile.username));
});

test('in production the account is loaded from the database by email, or by username when there is no email', async () => {
    const mongoose = require('mongoose');
    const models = require('../../models');
    const originalFindOne = models.User.findOne;
    const originalEnvironment = process.env.NODE_ENV;
    const queries = [];
    let connected = true;
    let failure = null;
    const account = {username: 'FromDatabase', active: true, god: false, points_general: 1888, ip: '10.1.1.1'};

    process.env.NODE_ENV = 'production';
    Object.defineProperty(mongoose.connection, 'readyState', {configurable: true, get: () => (connected ? 1 : 0)});
    models.User.findOne = (query) => {
        queries.push(query);
        return {lean: () => ({exec: async () => { if (failure) { throw failure; } return account; }})};
    };

    try {
        const byEmail = await identity.resolve(cookieFor('Mixed@Case.se'), undefined, 'abc');
        assert.deepEqual([byEmail.isGuest, byEmail.username, byEmail.points], [false, 'FromDatabase', 1888]);
        assert.deepEqual(queries[0], {email: 'mixed@case.se'});

        await identity.resolve(cookieFor(undefined, {content: {user: {username: 'NoEmail'}}}), undefined, 'abc');
        assert.deepEqual(queries[1], {username: 'NoEmail'});

        connected = false;
        assert.equal((await identity.resolve(cookieFor('a@b.se'), undefined, 'abc')).isGuest, true, 'database down');
        connected = true;
        failure = new Error('boom');
        assert.equal((await identity.resolve(cookieFor('a@b.se'), undefined, 'abc')).isGuest, true, 'lookup failure');
    }
    finally {
        process.env.NODE_ENV = originalEnvironment;
        models.User.findOne = originalFindOne;
        delete mongoose.connection.readyState;
    }
});
