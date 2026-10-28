"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const gulp = require('gulp');

test('JavaScript build stream completes with Gulp 5 and legacy transforms', async t => {
    const exported = {};
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'blockwars-streams-'));
    t.after(() => fs.rmSync(output, { recursive: true }));
    const dependencies = {
        gulp: {
            ...gulp,
            dest: destination => {
                const relative = path.relative('../../mongot_prod/blockwars.mongot.com', destination);
                assert.ok(!relative.startsWith('..'));
                return gulp.dest(path.join(output, relative));
            }
        }
    };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../gulpfile.js'), 'utf8'), {
        require: name => dependencies[name] || require(name),
        exports: exported
    });
    await exported.js();
    for (const filename of ['blockwars.min.js', 'lobby.min.js', 'settings.js', 'service-worker.js']) {
        assert.ok(fs.statSync(path.join(output, 'public/js', filename)).size > 0, filename);
    }
});
