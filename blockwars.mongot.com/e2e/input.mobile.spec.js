'use strict';

const {test, expect} = require('@playwright/test');
const {quietFirstVisit, startLoneGame, uniqueRoom} = require('./helpers');

test.beforeEach(async ({context}) => { await quietFirstVisit(context); });

test('a tap on an on-screen key moves the block exactly once', async ({page}) => {
    await startLoneGame(page, uniqueRoom('tap'));
    await page.evaluate(() => {
        window.__moves = 0;
        const move = Block.prototype.move;
        Block.prototype.move = function (direction) { window.__moves++; return move.call(this, direction); };
    });

    await page.locator('[id="37"]').tap();

    await page.waitForTimeout(300); // a duplicated compatibility mouse event would arrive by now
    expect(await page.evaluate(() => window.__moves)).toBe(1);
});

test('canvases match the screen density of the phone', async ({page}) => {
    await startLoneGame(page, uniqueRoom('phone-dpr'));

    const ratio = await page.evaluate(() => window.devicePixelRatio);
    expect(ratio).toBeGreaterThan(2);
    await expect.poll(() => page.evaluate(() => {
        const canvas = document.querySelector('.arena.local canvas.tetris');
        return canvas.width - Math.round(canvas.clientWidth * window.devicePixelRatio);
    })).toBe(0);
});
