'use strict';
const crypto = require('crypto');
const sessions = require('client-sessions');
const mongoose = require('mongoose');
const models = require('../../models');
const isReservedName = require('../../reserved-names');

const fallbackGuestKey = crypto.randomBytes(32);

function readCookie(header, name) {
    for (const part of String(header || '').split(';')) {
        const separator = part.indexOf('=');
        if (separator !== -1 && part.slice(0, separator).trim() === name) {
            try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch (error) { return null; }
        }
    }
    return null;
}

// The login cookie is encrypted and signed with the secret shared with the main site, so its content can be trusted.
function sessionUser(cookieHeader) {
    const secret = process.env.COOKIE_SECRET;
    const token = readCookie(cookieHeader, 'session');
    if (!secret || !token) { return null; }
    let decoded;
    try { decoded = sessions.util.decode({cookieName: 'session', secret: secret}, token); } catch (error) { return null; }
    if (!decoded || decoded.createdAt + decoded.duration < Date.now()) { return null; }
    return (decoded.content && decoded.content.user) || null;
}

let cachedTestAccounts;
function testAccounts() {
    cachedTestAccounts = cachedTestAccounts || JSON.parse(process.env.TEST_ACCOUNTS || '{}');
    return cachedTestAccounts;
}

async function findAccount(session) {
    if (process.env.NODE_ENV === 'test') { return testAccounts()[session.email] || null; }
    if (mongoose.connection.readyState !== 1) { return null; }
    const query = session.email ? {email: String(session.email).toLowerCase()} : {username: String(session.username)};
    return models.User.findOne(query, {username: 1, active: 1, god: 1, points_general: 1, ip: 1}).lean().exec();
}

// The name is a keyed hash of a browser-held id, so nobody can pick an id that lands on someone else's guest name.
function guestIdentity(guestId, socketId) {
    const id = typeof guestId === 'string' && /^[a-z0-9-]{16,64}$/i.test(guestId) ? guestId.toLowerCase() : 'connection-' + socketId;
    const tag = crypto.createHmac('sha256', process.env.COOKIE_SECRET || fallbackGuestKey).update(id).digest('hex').slice(0, 8);
    return {isGuest: true, username: 'Guest-' + tag, isUnverified: false, isGod: false, points: null, ip: null};
}

// Who a connection is comes only from the login cookie and the database, never from anything the browser sends as data.
async function resolve(cookieHeader, guestId, socketId) {
    const session = sessionUser(cookieHeader);
    if (session) {
        let account = null;
        try { account = await findAccount(session); } catch (error) { console.log('Identity lookup failed:', error.message); }
        if (account && !isReservedName(account.username)) {
            return {
                isGuest: false,
                username: account.username,
                isUnverified: !account.active,
                isGod: Boolean(account.god),
                points: account.points_general,
                ip: account.ip
            };
        }
    }
    return guestIdentity(guestId, socketId);
}

// Stands in for the database-backed middleware when tests run without MongoDB.
function testCookieAuth(req, res, next) {
    const account = req.session && req.session.user && testAccounts()[req.session.user.email];
    if (account) {
        req.user = account;
        res.locals.user = account;
    }
    next();
}

module.exports = {resolve: resolve, guestIdentity: guestIdentity, testCookieAuth: testCookieAuth};
