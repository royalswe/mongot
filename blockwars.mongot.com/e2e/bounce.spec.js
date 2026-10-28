'use strict';

const {test, expect} = require('@playwright/test');
const {quietFirstVisit, gameWithRival, grabBlock, uniqueRoom} = require('./helpers');

test.beforeEach(async ({context}) => { await quietFirstVisit(context); });

const rivalCanvas = page => page.locator('.arena:not(.local):has(.client-name[data-player="Rival"]) canvas.tetris');

// Fills the bottom rows of your Arena and sweeps them, as if a block had just completed them.
async function clearRows(page, count) {
    await grabBlock(page);
    await page.evaluate((count) => {
        const arena = window.__block.arena;
        for (let i = 1; i <= count; i++) { arena.matrix[arena.matrix.length - i].fill(1); }
        arena.sweepRow(() => {});
    }, count);
}

test('clearing two rows bounces your Arena and tells the others', async ({page, baseURL}) => {
    const rival = await gameWithRival(page, baseURL, uniqueRoom('bounce-local'));

    await clearRows(page, 2);

    await expect(page.locator('.arena.local canvas.tetris')).toHaveClass(/tetris-bounce(?!-big)/);
    expect(await rival.next('arena-bounce')).toMatchObject({rows: 2});
    rival.close();
});

test('an opponent clearing four rows gives their Arena the big bounce', async ({page, baseURL}) => {
    const rival = await gameWithRival(page, baseURL, uniqueRoom('bounce-peer'));

    rival.send({type: 'arena-bounce', rows: 4});

    await expect(rivalCanvas(page)).toHaveClass(/tetris-bounce-big/);
    rival.close();
});

test('turning Arena bounce off in the settings stops the bounce', async ({page, baseURL}) => {
    const rival = await gameWithRival(page, baseURL, uniqueRoom('bounce-off'));
    await grabBlock(page);
    await page.locator('#settings_toggle').click();
    await page.getByRole('button', {name: 'Controls', exact: true}).click();
    await page.locator('#arena_bounce').uncheck();
    await page.getByRole('button', {name: 'Done'}).click();

    rival.send({type: 'arena-bounce', rows: 4});
    await clearRows(page, 2);
    await page.waitForTimeout(800);

    await expect(rivalCanvas(page)).not.toHaveClass(/tetris-bounce/);
    await expect(page.locator('.arena.local canvas.tetris')).not.toHaveClass(/tetris-bounce/);
    expect(await page.evaluate(() => localStorage.getItem('arena-bounce'))).toBe('off');
    rival.close();
});
