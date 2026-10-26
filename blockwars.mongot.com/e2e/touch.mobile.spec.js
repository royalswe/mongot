'use strict';

const {test, expect} = require('@playwright/test');
const {quietFirstVisit, startLoneGame, uniqueRoom} = require('./helpers');

// Counts what the gestures ask the block to do.
async function recordBlockActions(page) {
    await page.evaluate(() => {
        window.__calls = [];
        for (const name of ['move', 'rotate', 'softDrop', 'hardDrop']) {
            const original = Block.prototype[name];
            Block.prototype[name] = function (argument) {
                window.__block = this;
                window.__calls.push([name, argument]);
                return original.call(this, argument);
            };
        }
    });
}
const calls = page => page.evaluate(() => window.__calls);
const callsNamed = async (page, name) => (await calls(page)).filter(([called]) => called === name);

async function playfield(page) {
    const box = await page.locator('.arena.local canvas.tetris').boundingBox();
    return {...box, cell: box.width / 10, centerX: box.x + box.width / 2, centerY: box.y + box.height / 2};
}

// Real touch input through the browser, so pointer events, capture and timing are all in play.
async function finger(page) {
    const client = await page.context().newCDPSession(page);
    const send = (type, x, y, timestamp) => client.send('Input.dispatchTouchEvent', {type, timestamp, touchPoints: type === 'touchEnd' ? [] : [{x, y}]});
    return {
        down: (x, y) => send('touchStart', x, y),
        move: (x, y) => send('touchMove', x, y),
        up: () => send('touchEnd'),
        // Moves in even steps over `duration` ms, or one 60 fps frame apart when it is 0. The events carry
        // explicit timestamps, so the measured speed does not depend on how fast the page happens to paint.
        async drag([x0, y0], [x1, y1], duration, steps = 12) {
            const stepMs = duration ? duration / steps : 16;
            const start = Date.now();
            const at = i => (start + i * stepMs) / 1000;
            await send('touchStart', x0, y0, at(0));
            for (let i = 1; i <= steps; i++) {
                await send('touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, at(i));
                if (duration) { await page.waitForTimeout(stepMs); }
            }
            await send('touchEnd', undefined, undefined, at(steps));
        }
    };
}

async function stackUntilDead(page) {
    for (let drop = 0; drop < 40; drop++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(60);
    }
}

test.describe('gestures', () => {
    test.beforeEach(async ({context}) => { await quietFirstVisit(context, {movementButtons: false}); });

    test('a touch screen hides the on-screen keys, since gestures and taps replace them', async ({page}) => {
        await startLoneGame(page, uniqueRoom('keys-hidden'));

        await expect(page.locator('section.keyboard')).toBeHidden();
        for (const id of [90, 38, 32, 37, 40, 39, 49, 50, 51, 52, 53]) { await expect(page.locator(`[id="${id}"]`)).toBeHidden(); }
    });

    test('a tap rotates: right half clockwise, left half counter-clockwise', async ({page}) => {
        await startLoneGame(page, uniqueRoom('tap'));
        await recordBlockActions(page);
        const field = await playfield(page);

        await page.touchscreen.tap(field.x + field.width * 0.75, field.centerY);
        await page.touchscreen.tap(field.x + field.width * 0.25, field.centerY);

        expect(await callsNamed(page, 'rotate')).toEqual([['rotate', 1], ['rotate', -1]]);
    });

    test('dragging sideways moves one column per cell of travel', async ({page}) => {
        await startLoneGame(page, uniqueRoom('drag'));
        await recordBlockActions(page);
        const field = await playfield(page);
        const touch = await finger(page);

        await touch.drag([field.centerX, field.centerY], [field.centerX + field.cell * 3.3, field.centerY], 200);

        expect(await callsNamed(page, 'move')).toEqual([['move', 1], ['move', 1], ['move', 1]]);
        expect(await callsNamed(page, 'rotate')).toEqual([]);
    });

    test('the sensitivity setting scales how far a drag moves the block', async ({page, context}) => {
        await context.addInitScript(() => localStorage.setItem('touch-sensitivity', '2'));
        await startLoneGame(page, uniqueRoom('sensitivity'));
        await recordBlockActions(page);
        const field = await playfield(page);
        const touch = await finger(page);

        await touch.drag([field.centerX, field.centerY], [field.centerX - field.cell * 3.2, field.centerY], 200);

        expect(await callsNamed(page, 'move')).toEqual(new Array(6).fill(['move', -1]));
    });

    test('holding a finger soft-drops until it lifts', async ({page}) => {
        await startLoneGame(page, uniqueRoom('hold'));
        await recordBlockActions(page);
        const field = await playfield(page);
        const touch = await finger(page);

        await touch.down(field.centerX, field.centerY);
        await page.waitForTimeout(500);
        expect(await callsNamed(page, 'softDrop')).toEqual([['softDrop', true]]);
        await touch.up();

        expect(await callsNamed(page, 'softDrop')).toEqual([['softDrop', true], ['softDrop', false]]);
        expect(await callsNamed(page, 'rotate')).toEqual([]);
    });

    test('a quick flick down hard-drops', async ({page}) => {
        await startLoneGame(page, uniqueRoom('flick'));
        await recordBlockActions(page);
        const field = await playfield(page);
        const touch = await finger(page);

        await touch.drag([field.centerX, field.y + field.height * 0.2], [field.centerX, field.y + field.height * 0.7], 0);

        expect(await callsNamed(page, 'hardDrop')).toHaveLength(1);
    });

    test('a slow drag down only soft-drops', async ({page}) => {
        await startLoneGame(page, uniqueRoom('slow-drag'));
        await recordBlockActions(page);
        const field = await playfield(page);
        const touch = await finger(page);

        await touch.drag([field.centerX, field.y + field.height * 0.2], [field.centerX, field.y + field.height * 0.5], 900);

        expect(await callsNamed(page, 'hardDrop')).toEqual([]);
        expect((await callsNamed(page, 'softDrop')).map(([, on]) => on)).toEqual([true, false]);
    });

    test('a finger on an opponent or the page does not steer the block', async ({page}) => {
        await startLoneGame(page, uniqueRoom('elsewhere'));
        await recordBlockActions(page);
        const opponent = await page.locator('.arena:not(.local) canvas.tetris').first().boundingBox();

        await page.touchscreen.tap(opponent.x + opponent.width / 2, opponent.y + opponent.height / 2);

        expect(await calls(page)).toEqual([]);
    });
});

test.describe('first-use hint', () => {
    test('explains the gestures once', async ({page, context}) => {
        await quietFirstVisit(context, {movementButtons: false, hint: true});
        const room = uniqueRoom('hint');
        await startLoneGame(page, room);
        await expect(page.locator('#toasts .toast', {hasText: 'tap to rotate'})).toBeVisible();

        await page.reload();
        await startLoneGame(page, room);
        await page.waitForTimeout(500);
        await expect(page.locator('#toasts .toast', {hasText: 'tap to rotate'})).toHaveCount(0);
    });
});

test.describe('touch settings', () => {
    test.beforeEach(async ({context}) => { await quietFirstVisit(context, {movementButtons: false}); });

    test('the movement buttons can be turned on and stay on', async ({page}) => {
        const room = uniqueRoom('buttons-setting');
        await page.goto(`/game?room=${room}&rank=no`);
        await page.locator('#take_seat').click(); // Spectators have no controls at all
        await expect(page.locator('#player_ready')).toBeVisible();
        await page.evaluate(() => document.querySelector('.icon-keyboard').click());
        const toggle = page.locator('#touch_buttons');
        await expect(toggle).not.toBeChecked();

        await toggle.check();
        await page.locator('.close-controler-modal button').click();
        await expect(page.locator('[id="37"]')).toBeVisible();

        await page.reload();
        await page.locator('#take_seat').click();
        await expect(page.locator('[id="37"]')).toBeVisible();
        await page.evaluate(() => document.querySelector('.icon-keyboard').click());
        await expect(page.locator('#touch_buttons')).toBeChecked();
    });
});

test.describe('vibration', () => {
    const stubVibrate = context => context.addInitScript(() => {
        window.__vibes = [];
        navigator.vibrate = (pattern) => { window.__vibes.push(pattern); return true; };
    });
    const vibes = page => page.evaluate(() => window.__vibes);

    test.beforeEach(async ({context}) => {
        await quietFirstVisit(context);
        await stubVibrate(context);
    });

    test('cleared rows, a Special and game over each vibrate', async ({page}) => {
        await startLoneGame(page, uniqueRoom('haptics'));
        await recordBlockActions(page);
        await page.keyboard.press('ArrowLeft'); // gives the specs the block
        expect(await vibes(page)).toEqual([]);

        await page.evaluate(() => window.__block.tetris.drawSweepRow([21], () => {}));
        await page.evaluate(() => window.__block.tetris.drawSweepRow([21, 20], () => {}));
        await page.evaluate(() => window.__block.tetris.special.performSpecial({special: 15, clientId: 'rival'}));
        expect(await vibes(page)).toEqual([20, [20, 30, 20], 40]);

        await stackUntilDead(page);
        await expect.poll(() => vibes(page)).toContainEqual([100, 50, 100]);
    });

    test('can be turned off', async ({page, context}) => {
        await context.addInitScript(() => localStorage.setItem('touch-haptics', 'off'));
        await startLoneGame(page, uniqueRoom('haptics-off'));
        await stackUntilDead(page);
        await expect(page.locator('#game_log')).toContainText('won the game!');

        expect(await vibes(page)).toEqual([]);
    });
});

test.describe('screen wake lock', () => {
    const stubWakeLock = context => context.addInitScript(() => {
        window.__wake = [];
        Object.defineProperty(navigator, 'wakeLock', {
            configurable: true,
            value: {
                request: async (type) => {
                    window.__wake.push('request ' + type);
                    return {addEventListener() {}, release: async () => { window.__wake.push('release'); }};
                }
            }
        });
    });
    const wake = page => page.evaluate(() => window.__wake);

    test.beforeEach(async ({context}) => {
        await quietFirstVisit(context);
        await stubWakeLock(context);
    });

    test('is held while a Game runs and let go when it ends', async ({page}) => {
        await page.goto(`/game?room=${uniqueRoom('wake')}&rank=no`);
        expect(await wake(page)).toEqual([]);

        await page.locator('#take_seat').click();
        await page.locator('#player_ready').click();
        await expect(page.locator('#game_log')).toContainText('The game has started!');
        await expect.poll(() => wake(page)).toEqual(['request screen']);

        await stackUntilDead(page);
        await expect(page.locator('#game_log')).toContainText('won the game!');
        await expect.poll(() => wake(page)).toEqual(['request screen', 'release']);
    });

    test('is not requested when turned off', async ({page, context}) => {
        await context.addInitScript(() => localStorage.setItem('touch-wakelock', 'off'));
        await startLoneGame(page, uniqueRoom('wake-off'));
        await page.waitForTimeout(300);

        expect(await wake(page)).toEqual([]);
    });
});
