"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'game/chat-files.js'), 'utf8');

test('default chat paths remain in the application directory, independent of working directory', () => {
    const module = { exports: {} };
    vm.runInNewContext(source, {
        require, module, __dirname: path.join(root, 'game'), process: { env: {} }
    });
    assert.equal(module.exports.game, path.join(root, 'gameChat.json'));
    assert.equal(module.exports.lobby, path.join(root, 'blockwarChat.json'));
});

test('both chat paths use the configured isolated directory', () => {
    const module = { exports: {} };
    const directory = path.join(root, 'test-fixture-not-created');
    vm.runInNewContext(source, {
        require, module, __dirname: path.join(root, 'game'),
        process: { env: { CHAT_DATA_DIR: directory } }
    });
    assert.equal(module.exports.game, path.join(directory, 'gameChat.json'));
    assert.equal(module.exports.lobby, path.join(directory, 'blockwarChat.json'));
});

for (const failStartup of [false, true]) {
    test(`test launcher isolates chat and cleans up on ${failStartup ? 'startup failure' : 'normal exit'}`, () => {
        const files = ['gameChat.json', 'blockwarChat.json'];
        const before = files.map(filename => fs.readFileSync(path.join(root, filename)));
        const child = spawnSync(process.execPath, ['-e', `
            const fs = require('node:fs');
            const path = require('node:path');
            const vm = require('node:vm');
            const root = ${JSON.stringify(root)};
            vm.runInThisContext('(function(require) {' +
                fs.readFileSync(path.join(root, 'tests/fixtures/start-server.js'), 'utf8') + '\\n})')(name => {
                if (name === './stub-models') { return {}; }
                if (name !== '../../app') { return require(name); }
                const directory = process.env.CHAT_DATA_DIR;
                console.log(directory);
                const paths = require(path.join(root, 'game/chat-files.js'));
                for (const filename of [paths.game, paths.lobby]) {
                    if (path.dirname(filename) !== directory) { throw new Error('Chat path escaped fixture'); }
                    if (fs.readFileSync(filename, 'utf8') !== '[]') { throw new Error('Chat fixture is not fresh'); }
                    fs.writeFileSync(filename, '[{"message":"isolated test"}]');
                }
                ${failStartup ? "throw new Error('Simulated startup failure');" : 'return {};'}
            });
        `], { encoding: 'utf8', env: { ...process.env, CHAT_DATA_DIR: root } });
        assert.equal(child.status, failStartup ? 1 : 0, child.stderr);
        const directory = child.stdout.trim();
        assert.ok(path.basename(directory).startsWith('blockwars-e2e-chat-'), child.stderr);
        assert.equal(fs.existsSync(directory), false, 'Temporary chat directory was not removed');
        files.forEach((filename, index) => {
            assert.deepEqual(fs.readFileSync(path.join(root, filename)), before[index], filename);
        });
    });
}
