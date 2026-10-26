'use strict';

const {test, expect} = require('@playwright/test');
const {quietFirstVisit, startLoneGame, uniqueRoom} = require('./helpers');

const canvasSizes = page => page.evaluate(() => {
    const size = canvas => ({css: canvas.clientWidth, width: canvas.width, height: canvas.height});
    return {
        local: size(document.querySelector('.arena.local canvas.tetris')),
        next: size(document.querySelector('canvas.next-block'))
    };
});

test.beforeEach(async ({context}) => { await quietFirstVisit(context); });

test.describe('standard density', () => {
    test('canvases are as wide as they are displayed', async ({page}) => {
        await startLoneGame(page, uniqueRoom('dpr1'));

        await expect.poll(async () => (await canvasSizes(page)).local.width).toBe((await canvasSizes(page)).local.css);
        const {local, next} = await canvasSizes(page);
        expect(local.height).toBe(Math.round(local.css * 464 / 240));
        expect(next.width).toBe(next.css);
    });
});

test.describe('double density', () => {
    test.use({deviceScaleFactor: 2});

    test('canvases get twice the pixels so they stay sharp', async ({page}) => {
        await startLoneGame(page, uniqueRoom('dpr2'));

        await expect.poll(async () => (await canvasSizes(page)).local.width).toBe((await canvasSizes(page)).local.css * 2);
        const {local, next} = await canvasSizes(page);
        expect(local.height).toBe(Math.round(local.css * 2 * 464 / 240));
        expect(next.width).toBe(next.css * 2);
    });
});

test('the game page lets people pinch-zoom the page', async ({page}) => {
    await page.goto('/game?room=E2E-zoom&rank=no');

    const viewport = await page.locator('meta[name=viewport]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).not.toContain('user-scalable=no');
});

test('the playfield and on-screen keys keep touches to themselves', async ({page}) => {
    await startLoneGame(page, uniqueRoom('touch-action'));

    const touchActions = await page.evaluate(() => [
        document.querySelector('.arena.local canvas.tetris'),
        document.querySelector('[id="37"]')
    ].map(element => getComputedStyle(element).touchAction));
    expect(touchActions).toEqual(['none', 'none']);
});
