'use strict';

const sessions = require('client-sessions');

// Shared by the Playwright config (server side) and the specs (browser side).
const COOKIE_SECRET = 'playwright-test-secret';

const accounts = {
    'verified@test.local': {username: 'Verified', active: true, points_general: 1600},
    'unverified@test.local': {username: 'Unverified', active: false, points_general: 1600},
    'god@test.local': {username: 'Godly', active: true, god: true, points_general: 1600},
    'scout@test.local': {username: 'Scout', active: true, points_general: 1600}
};

// The same encrypted, signed cookie the main site issues at login.
function sessionCookie(email, secret = COOKIE_SECRET) {
    const value = sessions.util.encode(
        {cookieName: 'session', secret: secret},
        {user: {username: accounts[email].username, email: email}},
        3600 * 1000
    );
    return {name: 'session', value: value, domain: '127.0.0.1', path: '/'};
}

module.exports = {COOKIE_SECRET: COOKIE_SECRET, accounts: accounts, sessionCookie: sessionCookie};
