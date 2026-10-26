'use strict';

const {test, expect} = require('@playwright/test');
const {quietFirstVisit, gameWithRival, collectSpecial, startLoneGame, uniqueRoom} = require('./helpers');

const rivalArena = page => page.locator('.arena:not(.local):has(.client-name[data-player="Rival"])');
const queueIcons = page => page.locator('.arena.local .specials img');

test.describe('with gestures only', () => {
    test.beforeEach(async ({context}) => { await quietFirstVisit(context, {movementButtons: false}); });

    test('tapping an opponent sends your next Special without any key', async ({page, baseURL}) => {
        const rival = await gameWithRival(page, baseURL, uniqueRoom('tap-opponent'));
        await expect(page.locator('section.keyboard')).toBeHidden();
        await collectSpecial(page, 10);
        await expect(queueIcons(page)).toHaveCount(1);

        await rivalArena(page).tap();

        expect(await rival.next('use-special')).toMatchObject({special: 10, receiver: 'Rival'});
        await expect(queueIcons(page)).toHaveCount(0);
        rival.close();
    });

    test('tapping your queue uses the Special on yourself', async ({page, baseURL}) => {
        const rival = await gameWithRival(page, baseURL, uniqueRoom('tap-queue'));
        await collectSpecial(page, 9);
        await expect(queueIcons(page)).toHaveCount(1);

        await page.locator('.arena.local .special-tube').tap();

        await expect(queueIcons(page)).toHaveCount(0);
        await expect(page.locator('#game_log')).toContainText('Remove row');
        rival.close();
    });

    test('tapping your own board rotates the block and never sends a Special', async ({page, baseURL}) => {
        const rival = await gameWithRival(page, baseURL, uniqueRoom('tap-board'));
        await collectSpecial(page, 10);
        await expect(queueIcons(page)).toHaveCount(1);
        const board = await page.locator('.arena.local canvas.tetris').boundingBox();

        await page.touchscreen.tap(board.x + board.width * 0.75, board.y + board.height / 2);
        await page.waitForTimeout(300);

        await expect(queueIcons(page)).toHaveCount(1);
        rival.close();
    });

    test('the queue and the opponents are big enough to tap', async ({page, baseURL}) => {
        const rival = await gameWithRival(page, baseURL, uniqueRoom('target-size'));

        for (const target of [rivalArena(page), page.locator('.arena.local .special-tube')]) {
            const box = await target.boundingBox();
            expect(box.width).toBeGreaterThanOrEqual(43.5);
            expect(box.height).toBeGreaterThanOrEqual(43.5);
        }
        rival.close();
    });

    test('the first Special you collect explains how to send it, once', async ({page, baseURL, context}) => {
        await context.addInitScript(() => localStorage.removeItem('touch-target-hint-seen'));
        const rival = await gameWithRival(page, baseURL, uniqueRoom('target-hint'));
        await collectSpecial(page, 10);

        await expect(page.locator('#toasts .toast', {hasText: 'Tap an opponent'})).toBeVisible();
        await collectSpecial(page, 10);
        await expect(page.locator('#toasts .toast', {hasText: 'Tap an opponent'})).toHaveCount(1);
        rival.close();
    });
});

test('the on-screen buttons setting brings the keys back, Specials included', async ({page, context}) => {
    await quietFirstVisit(context, {movementButtons: false});
    await startLoneGame(page, uniqueRoom('keys-back'));
    await expect(page.locator('section.keyboard')).toBeHidden();

    await page.evaluate(() => document.querySelector('.icon-keyboard').click());
    await page.locator('#touch_buttons').check();
    await page.locator('.close-controler-modal button').click();

    await expect(page.locator('section.keyboard')).toBeVisible();
    await expect(page.locator('[id="49"]')).toBeVisible();
});
