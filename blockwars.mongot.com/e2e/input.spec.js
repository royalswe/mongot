'use strict';

const {test, expect} = require('@playwright/test');
const {quietFirstVisit, startLoneGame, uniqueRoom} = require('./helpers');

// Counts moves and exposes the falling block, since moves are not sent to the server.
async function watchBlock(page) {
    await page.evaluate(() => {
        window.__moves = 0;
        const move = Block.prototype.move;
        Block.prototype.move = function (direction) {
            window.__moves++;
            window.__block = this;
            return move.call(this, direction);
        };
    });
}
const moves = page => page.evaluate(() => window.__moves);

test.beforeEach(async ({context}) => { await quietFirstVisit(context); });

test('each key press or click on an on-screen key moves the block once', async ({page}) => {
    await startLoneGame(page, uniqueRoom('input'));
    await watchBlock(page);

    await page.keyboard.press('ArrowLeft');
    expect(await moves(page)).toBe(1);

    await page.locator('[id="39"]').click();
    expect(await moves(page)).toBe(2);
});

test('an on-screen key released away from where it was pressed is still released', async ({page, context}) => {
    await context.addInitScript(() => { localStorage.setItem('handling', JSON.stringify({das: 30, arr: 100})); });
    await startLoneGame(page, uniqueRoom('slide'));
    await watchBlock(page);

    const key = page.locator('[id="37"]');
    await key.hover();
    await page.mouse.down();
    await expect.poll(() => page.evaluate(() => window.__block && window.__block.shift.direction)).toBe(-1);

    await page.mouse.move(5, 5);
    await page.mouse.up();

    expect(await page.evaluate(() => window.__block.shift.direction)).toBe(0);
});
