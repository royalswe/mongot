"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const pug = require('pug');

function render(name, locals = {}) {
    return pug.renderFile(path.join(__dirname, '../views', name + '.pug'), {
        user: null, messages: {}, ...locals
    });
}

test('inherited templates keep their page titles with lexical declarations', () => {
    const pages = [
        ['404', '404'],
        ['index', 'Blockwars'],
        ['lobby', 'Blockwars Lobby'],
        ['rules', 'How to play'],
        ['gamelog', 'Game log', { logs: [] }],
        ['gamechat', 'Game chat', { messages: [] }],
        ['highscore', 'High score', { highscores: [] }]
    ];
    for (const [name, title, locals] of pages) {
        assert.ok(render(name, locals).includes(`<title>${title}</title>`), name);
    }
});

test('highscore renders every crown boundary without leaking between rows', () => {
    const cases = [
        [899, 0], [900, 1], [1299, 1], [1300, 2], [1499, 2],
        [1500, 3], [1699, 3], [1700, 4], [1899, 4], [1900, 5],
        [2099, 5], [2100, 6], [2299, 6], [2300, 7], [2499, 7],
        [2500, 8], [2699, 8], [2700, 9], [2899, 9], [2900, 10],
        [0, 0]
    ];
    const highscores = cases.map(([points], i) => ({
        username: `Player${i}`, points_bw: points,
        games_won_bw: 2, games_lost_bw: 1, game_length_bw: 125000
    }));
    const html = render('highscore', { highscores });
    const crowns = [...html.matchAll(/src="\/img\/rankings\/crown(\d+)\.png"/g)].map(match => Number(match[1]));
    assert.deepEqual(crowns, cases.map(([, crown]) => crown));
    for (let i = 0; i < cases.length; i++) {
        assert.ok(html.includes(`<td>${i + 1}</td>`));
        assert.ok(html.includes(`Player${i}</a>`));
    }
    assert.equal((html.match(/<td>2:5<\/td>/g) || []).length, cases.length);
});

test('game log keeps row numbering and data with a block-scoped loop', () => {
    const logs = ['Alice', 'Bob'].map(winner => ({
        winner, game_time: 125000, players: '"Alice" "Bob"',
        createdAt: new Date('2026-10-27T18:00:00Z')
    }));
    const html = render('gamelog', { logs });
    assert.ok(html.includes('<td>1</td>'));
    assert.ok(html.includes('<td>2</td>'));
    assert.ok(html.includes('<td>Alice</td>'));
    assert.ok(html.includes('<td>Bob</td>'));
    assert.equal((html.match(/2026-10-27 18:00/g) || []).length, 2);
});

test('rules language switching preserves default and explicit language selection', () => {
    const html = render('rules');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    for (const initialHash of ['', '#english', '#swedish']) {
        const pages = {
            '#english': { style: {}, active: false },
            '#swedish': { style: {}, active: false }
        };
        const links = Object.fromEntries(Object.entries(pages).map(([hash, page]) => [hash, {
            parentNode: { classList: { add: () => { page.active = true; } } }
        }]));
        let changeLanguage;
        const document = {
            location: { hash: initialHash },
            getElementsByClassName: () => Object.values(pages),
            querySelector(selector) {
                if (selector === '.nav-parent.active') {
                    const active = Object.values(pages).find(page => page.active);
                    return { classList: { remove: () => { active.active = false; } } };
                }
                const link = selector.match(/^a\[href="(.+)"\]$/);
                return link ? links[link[1]] : pages[selector];
            }
        };
        vm.runInNewContext(scripts[0][1], {
            document, window: { addEventListener: (event, callback) => {
                assert.equal(event, 'hashchange');
                changeLanguage = callback;
            } }
        });
        const selected = initialHash || '#english';
        assert.equal(pages[selected].style.display, '');
        assert.equal(pages[selected].active, true);
        for (const hash of ['#swedish', '#english', '#swedish']) {
            document.location.hash = hash;
            changeLanguage();
            for (const [id, page] of Object.entries(pages)) {
                assert.equal(page.style.display, id === hash ? '' : 'none');
                assert.equal(page.active, id === hash);
            }
        }
    }
});
