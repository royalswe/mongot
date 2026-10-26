'use strict';

const sessions = require('client-sessions');

// Shared by the Playwright config (server side) and the specs (browser side).
const COOKIE_SECRET = 'playwright-test-secret';

const accounts = {
    'alice@test.local': {username: 'Alice', email: 'alice@test.local', active: true, points_bw: 1600},
    'bob@test.local': {username: 'Bob', email: 'bob@test.local', active: true, points_bw: 1600}
};

// The same encrypted, signed cookie the main site issues at login.
function sessionCookie(email, secret = COOKIE_SECRET) {
    const value = sessions.util.encode(
        {cookieName: 'session', secret: secret},
        {user: {username: accounts[email].username, email: email}},
        3600 * 1000
    );
    return {name: 'session', value: value, domain: 'localhost', path: '/'};
}

module.exports = {COOKIE_SECRET: COOKIE_SECRET, accounts: accounts, sessionCookie: sessionCookie};
