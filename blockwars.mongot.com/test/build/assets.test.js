"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pug = require('pug');

const root = path.resolve(__dirname, '../..');
const stage = path.join(root, 'build');

function files(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? files(filename) : [filename];
    });
}

function assetPath(url, from = path.join(stage, 'public')) {
    const clean = url.split(/[?#]/)[0];
    if (/^(?:https?:|data:|\/\/)/.test(clean)) { return null; }
    if (clean.startsWith('/js/special-rules.js')) {
        return path.join(stage, 'game/special-rules.js');
    }
    return clean.startsWith('/')
        ? path.join(stage, 'public', clean.slice(1))
        : path.resolve(from, clean);
}

test('staged templates resolve every rendered script, stylesheet and image', () => {
    for (const template of fs.readdirSync(path.join(stage, 'views')).filter(name => name.endsWith('.pug'))) {
        assert.equal(fs.readFileSync(path.join(stage, 'views', template), 'utf8'),
            fs.readFileSync(path.join(root, 'views', template), 'utf8'), template);
        const html = pug.renderFile(path.join(stage, 'views', template), {
            user: null, messages: [], logs: [],
            highscores: Array.from({ length: 11 }, (_, i) => ({
                username: 'Player', points_bw: i * 300,
                games_won_bw: 1, games_lost_bw: 0, game_length_bw: 1000
            }))
        });
        for (const match of html.matchAll(/<(?:script|link|img|input)\b[^>]*?\b(?:src|href)="([^"]+)"/g)) {
            const filename = assetPath(match[1]);
            if (filename) { assert.ok(fs.statSync(filename).isFile(), `${template}: ${match[1]}`); }
        }
    }
});

test('staged stylesheets resolve every local asset', () => {
    const missing = new Set();
    const stylesheets = files(path.join(stage, 'public')).filter(filename => filename.endsWith('.css'));
    for (const stylesheet of stylesheets) {
        const css = fs.readFileSync(stylesheet, 'utf8');
        for (const match of css.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g)) {
            const filename = assetPath(match[1], path.dirname(stylesheet));
            if (filename) {
                if (!fs.existsSync(filename)) {
                    const relative = path.relative(stage, filename);
                    assert.equal(fs.existsSync(path.join(root, relative)), false, `Build omitted ${relative}`);
                    missing.add(relative);
                } else {
                    assert.ok(fs.statSync(filename).isFile());
                }
            }
        }
    }
    assert.deepEqual([...missing].sort(), []);
});

test('staging includes all first-party scripts, game code, fonts, sounds and resources', () => {
    assert.deepEqual(fs.readFileSync(path.join(stage, 'public/manifest.webmanifest')),
        fs.readFileSync(path.join(root, 'public/manifest.webmanifest')));
    for (const directory of ['public/js', 'public/fonts', 'public/sounds', 'public/resources', 'game']) {
        for (const filename of files(path.join(root, directory))) {
            const relative = path.relative(root, filename);
            if (relative.startsWith('public/js/dist/')) { continue; }
            assert.ok(fs.statSync(path.join(stage, relative)).isFile(), relative);
            if (['public/fonts', 'public/sounds', 'public/resources'].includes(directory)) {
                assert.deepEqual(fs.readFileSync(path.join(stage, relative)), fs.readFileSync(filename), relative);
            }
        }
    }
    for (const filename of files(path.join(stage, 'public/js')).filter(name => name.endsWith('.js'))) {
        assert.doesNotThrow(() => new vm.Script(fs.readFileSync(filename, 'utf8'), { filename }));
    }
    for (const filename of ['blockwars.min.js', 'lobby.min.js', 'settings.js', 'service-worker.js']) {
        assert.ok(fs.statSync(path.join(stage, 'public/js', filename)).size > 0);
    }
});

test('bundle source order agrees with the active templates', async () => {
    const bundles = [];
    const destinations = [];
    const stream = { pipe() { return this; } };
    const dependencies = {
        gulp: {
            src: input => { if (Array.isArray(input)) { bundles.push(input); } return stream; },
            dest: output => { destinations.push(output); return {}; }, parallel: (...tasks) => tasks
        },
        'gulp-concat': () => ({}),
        'gulp-uglify': () => ({}), 'gulp-babel': () => ({}),
        'node:stream/promises': { pipeline: async () => {} }, 'gulp-clean-css': () => ({})
    };
    const exported = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'gulpfile.js'), 'utf8'), {
        require: name => dependencies[name], exports: exported
    }, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
    await exported.jsDev();
    for (const [template, index] of [['game.pug', 0], ['lobby.pug', 3]]) {
        const html = pug.renderFile(path.join(stage, 'views', template), { user: null, messages: {} });
        const scripts = [...html.matchAll(/<script\b[^>]*src="(\/js\/[^"]+)"/g)]
            .map(match => match[1] === '/js/special-rules.js' ? 'game/special-rules.js' : 'public' + match[1])
            .filter(filename => filename !== 'public/js/settings.js');
        assert.deepEqual(Array.from(bundles[index]), scripts, template);
    }
    assert.ok(destinations.every(output => output === 'public/js/dist'));
    destinations.length = 0;
    await Promise.all(exported.default.map(task => task()));
    assert.ok(destinations.every(output => output.startsWith('../../mongot_prod/blockwars.mongot.com/')));
    destinations.length = 0;
    await Promise.all(exported.stage.map(task => task()));
    assert.ok(destinations.every(output => output.startsWith('build/')));
});

test('staging does not copy deployment configuration, shared packages or mutable data', () => {
    assert.deepEqual(fs.readdirSync(stage).sort(), ['game', 'public', 'views']);
    for (const excluded of ['node_modules', 'config.json', '.env', 'blockwarChat.json', 'gameChat.json', 'app.js', 'routes']) {
        assert.equal(fs.existsSync(path.join(stage, excluded)), false, excluded);
    }
    assert.equal(fs.existsSync(path.join(stage, 'public/js/dist')), false);
});
