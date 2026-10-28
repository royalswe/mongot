"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const express = require('express');

function applicationParsers() {
    const parsers = [];
    const app = { set() {}, use() {}, get() {} };
    const applicationExpress = Object.assign(() => app, {
        static: () => () => {},
        json(options) {
            const parser = express.json(options);
            parsers.push(parser);
            return parser;
        },
        urlencoded(options) {
            assert.equal(options.extended, true);
            const parser = express.urlencoded({ extended: options.extended });
            parsers.push(parser);
            return parser;
        }
    });
    const dependencies = {
        http: { createServer: () => ({ listen() { return this; } }) },
        express: applicationExpress,
        'client-sessions': () => () => {},
        mongoose: { connect: () => Promise.resolve() },
        'express-flash': () => () => {},
        '../middleware': { cookieAuth() {} },
        '../config.json': { PROD_DB: 'unused' },
        './routes/main': () => {},
        './config.json': { DOMAIN: 'http://localhost' },
        './serviceworker': () => ({ router() {} }),
        './game/server.js': { initialize() {} }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), {
        require(name) {
            assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
            return dependencies[name];
        },
        process: { env: { PORT: '0', COOKIE_SECRET: 'test-only' } },
        __dirname: path.resolve(__dirname, '..'),
        console
    });
    assert.equal(parsers.length, 2);
    return parsers;
}

test('application uses Express parsers with compatible payload handling', async t => {
    const app = express();
    app.use(...applicationParsers());
    app.post('/echo', (req, res) => res.json(req.body));
    app.use((error, req, res, next) => res.status(error.status || 500).json({ type: error.type }));
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    const url = `http://127.0.0.1:${server.address().port}/echo`;
    const cases = [
        {
            name: 'JSON objects', type: 'application/json',
            body: '{"name":"Alice","settings":{"sound":false},"players":[1,2]}',
            status: 200, expected: { name: 'Alice', settings: { sound: false }, players: [1, 2] }
        },
        {
            name: 'extended URL-encoded forms', type: 'application/x-www-form-urlencoded',
            body: 'name=Alice+Smith&settings[sound]=off&players[]=1&players[]=2',
            status: 200, expected: { name: 'Alice Smith', settings: { sound: 'off' }, players: ['1', '2'] }
        },
        { name: 'empty JSON', type: 'application/json', body: '', status: 200, expected: {} },
        {
            name: 'malformed JSON', type: 'application/json', body: '{"name":',
            status: 400, expected: { type: 'entity.parse.failed' }
        },
        {
            name: 'strict JSON rejects primitives', type: 'application/json', body: '42',
            status: 400, expected: { type: 'entity.parse.failed' }
        },
        {
            name: 'default 100KB limit', type: 'application/json', body: JSON.stringify({ value: 'x'.repeat(102401) }),
            status: 413, expected: { type: 'entity.too.large' }
        }
    ];
    for (const { name, type, body, status, expected } of cases) {
        await t.test(name, async () => {
            const response = await fetch(url, { method: 'POST', headers: { 'content-type': type }, body });
            assert.equal(response.status, status);
            assert.deepEqual(await response.json(), expected);
        });
    }
});
