"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function routes(options = {}) {
    const handlers = new Map();
    const user = { saveCount: 0, save(callback) {
        this.saveCount++;
        if (options.save) { return options.save(callback); }
        callback(options.saveError || null);
    } };
    const fileCalls = [];
    const lookups = [];
    const router = { get: (route, ...callbacks) => handlers.set(route, callbacks) };
    const query = () => ({
        or() { return this; }, sort() { return this; },
        exec: callback => callback(options.queryError || null, [])
    });
    const models = {
        User: {
            findOne(query, callback) {
                assert.deepEqual({ ...query }, { username: 'Alice' });
                callback(options.lookupError || null, options.found === false ? null : user);
            },
            find: query
        },
        Ips: { findOne(query, callback) {
            lookups.push(query.ip);
            callback(options.lookupError || null, options.banned ? { ip: query.ip } : null);
        } },
        BwLog: { find: query }
    };
    const dependencies = {
        express: { Router: () => router }, '../../models': models,
        '../game/chat-files': { game: 'gameChat.json' },
        fs: {
            readFile(filename, callback) {
                fileCalls.push(['read', filename]);
                callback(options.readError || null,
                    options.readError ? undefined : Buffer.from(options.chat || '[]'));
            },
            writeFile(filename, value, callback) {
                fileCalls.push(['write', filename, value]);
                callback(options.writeError || null);
            }
        }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/main.js'), 'utf8'), {
        require(name) {
            assert.ok(Object.hasOwn(dependencies, name), name);
            return dependencies[name];
        },
        module: { exports: {} }
    });
    return { handlers, user, lookups, fileCalls };
}

function response() {
    const rendered = [];
    const errors = [];
    return {
        rendered, errors,
        res: { render: (template, locals) => rendered.push({ template, locals }) },
        next: error => errors.push(error)
    };
}

function request(forwarded, remoteAddress) {
    return {
        headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
        socket: { remoteAddress },
        user: { username: 'Alice' },
        get connection() { throw new Error('Deprecated connection API accessed'); }
    };
}

const addresses = [
    { name: 'forwarded address', forwarded: '198.51.100.1', socket: '127.0.0.1', expected: '198.51.100.1' },
    { name: 'forwarded chain unchanged', forwarded: '198.51.100.1, 203.0.113.2', socket: '127.0.0.1', expected: '198.51.100.1, 203.0.113.2' },
    { name: 'IPv4 socket fallback', socket: '192.0.2.1', expected: '192.0.2.1' },
    { name: 'IPv6 socket fallback', socket: '::1', expected: '::1' },
    { name: 'empty header fallback', forwarded: '', socket: '::ffff:192.0.2.1', expected: '::ffff:192.0.2.1' }
];

test('public page handlers remain available to guests without login middleware', () => {
    const { handlers } = routes();
    for (const [route, template] of [
        ['/', 'index.pug'], ['/rules', 'rules.pug'], ['/highscore', 'highscore.pug']
    ]) {
        const { rendered, errors, res, next } = response();
        assert.equal(handlers.get(route).length, 1);
        handlers.get(route)[0]({}, res, next);
        assert.equal(rendered.length, 1);
        assert.equal(rendered[0].template, template);
        assert.deepEqual(errors, []);
    }
    assert.equal(handlers.get('/lobby').length, 1);
    assert.equal(handlers.get('/game').length, 2);
    const { rendered, res } = response();
    handlers.get('/game')[1]({}, res);
    assert.equal(rendered[0].template, 'game.pug');
});

for (const { name, forwarded, socket, expected } of addresses) {
    test(`lobby persists ${name} without accessing connection`, () => {
        const { handlers, user } = routes();
        const { res, next, rendered, errors } = response();
        handlers.get('/lobby')[0](request(forwarded, socket), res, next);
        assert.equal(user.ip, expected);
        assert.equal(user.saveCount, 1);
        assert.ok(Number.isFinite(user.last_visit_bw.getTime()));
        assert.equal(rendered[0].template, 'lobby.pug');
        assert.equal(rendered[0].locals.bodyClass, 'lobby-body');
        assert.deepEqual(errors, []);
    });
    for (const banned of [false, true]) {
        test(`game ban check uses ${name} (${banned ? 'banned' : 'allowed'})`, () => {
            const { handlers, lookups } = routes({ banned });
            const calls = [];
            const req = request(forwarded, socket);
            req.flash = (...args) => calls.push(args);
            handlers.get('/game')[0](req, {
                redirect: target => calls.push(['redirect', target])
            }, () => calls.push(['next']));
            assert.deepEqual(lookups, [expected]);
            assert.deepEqual(calls, banned
                ? [['info', 'You are banned!'], ['redirect', '/']] : [['next']]);
        });
    }
}

for (const failure of ['lookupError', 'saveError']) {
    test(`lobby forwards ${failure} without rendering`, () => {
        const error = new Error(failure);
        const { handlers, user } = routes({ [failure]: error });
        const { rendered, errors, res, next } = response();
        handlers.get('/lobby')[0](request(undefined, '::1'), res, next);
        assert.deepEqual(errors, [error]);
        assert.deepEqual(rendered, []);
        assert.equal(user.saveCount, failure === 'lookupError' ? 0 : 1);
    });
}

test('lobby renders only after saving completes', () => {
    let complete;
    const { handlers } = routes({ save: callback => { complete = callback; } });
    const { rendered, errors, res, next } = response();
    handlers.get('/lobby')[0](request(undefined, '::1'), res, next);
    assert.deepEqual(rendered, []);
    complete(null);
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0].template, 'lobby.pug');
    assert.deepEqual(errors, []);
});

test('guest and missing-user lobby requests render without saving', () => {
    for (const guest of [true, false]) {
        const { handlers, user } = routes({ found: false });
        const { rendered, errors, res, next } = response();
        const req = request(undefined, '::1');
        if (guest) { req.user = null; }
        handlers.get('/lobby')[0](req, res, next);
        assert.equal(rendered.length, 1);
        assert.deepEqual(errors, []);
        assert.equal(user.saveCount, 0);
    }
});

test('ban lookup failure is forwarded instead of allowing or redirecting', () => {
    const error = new Error('Database unavailable');
    const { handlers } = routes({ lookupError: error, banned: true });
    const { res, errors, next } = response();
    handlers.get('/game')[0](request(undefined, '::1'), res, next);
    assert.deepEqual(errors, [error]);
});

for (const [route, template, key] of [
    ['/highscore', 'highscore.pug', 'highscores'], ['/gamelog', 'gamelog.pug', 'logs']
]) {
    test(`${route} renders query results or forwards query failures`, () => {
        for (const queryError of [null, new Error('Query failed')]) {
            const { handlers } = routes({ queryError });
            const { res, next, rendered, errors } = response();
            handlers.get(route).at(-1)({}, res, next);
            assert.deepEqual(errors, queryError ? [queryError] : []);
            assert.equal(rendered.length, queryError ? 0 : 1);
            if (!queryError) {
                assert.equal(rendered[0].template, template);
                assert.deepEqual(rendered[0].locals[key], []);
            }
        }
    });
}

for (const route of ['/gamechat', '/erasechat']) {
    test(`${route} forwards file read and parse failures without rendering`, () => {
        const readError = new Error('Read failed');
        for (const options of [{ readError }, { chat: '{invalid' }]) {
            const { handlers } = routes(options);
            const { res, next, rendered, errors } = response();
            handlers.get(route).at(-1)({}, res, next);
            assert.deepEqual(rendered, []);
            assert.equal(errors.length, 1);
            if (options.readError) { assert.equal(errors[0], readError); }
            else { assert.equal(errors[0].name, 'SyntaxError'); }
        }
    });
    test(`${route} renders parsed chat on success`, () => {
        const { handlers, fileCalls } = routes({ chat: '[{"message":"hello"}]' });
        const { res, next, rendered, errors } = response();
        handlers.get(route).at(-1)({}, res, next);
        assert.deepEqual(errors, []);
        assert.equal(rendered.length, 1);
        assert.equal(rendered[0].template, 'gamechat.pug');
        assert.equal(JSON.stringify(rendered[0].locals.messages), '[{"message":"hello"}]');
        assert.deepEqual(fileCalls, route === '/erasechat'
            ? [['write', 'gameChat.json', '[]'], ['read', 'gameChat.json']]
            : [['read', 'gameChat.json']]);
    });
}

test('erasechat stops on a failed write without reading or rendering', () => {
    const error = new Error('Write failed');
    const { handlers, fileCalls } = routes({ writeError: error });
    const { res, next, rendered, errors } = response();
    handlers.get('/erasechat').at(-1)({}, res, next);
    assert.deepEqual(errors, [error]);
    assert.deepEqual(rendered, []);
    assert.deepEqual(fileCalls, [['write', 'gameChat.json', '[]']]);
});

test('admin-only routes still redirect guests and non-admins', () => {
    const { handlers } = routes();
    for (const route of ['/gamelog', '/gamechat', '/erasechat']) {
        for (const user of [null, { username: 'Alice' }]) {
            const redirects = [];
            handlers.get(route)[0]({ user }, { redirect: target => redirects.push(target) },
                () => assert.fail('Non-admin reached route handler'));
            assert.deepEqual(redirects, ['/']);
        }
        let allowed = false;
        handlers.get(route)[0]({ user: { god: true } }, {}, () => { allowed = true; });
        assert.equal(allowed, true);
    }
});
