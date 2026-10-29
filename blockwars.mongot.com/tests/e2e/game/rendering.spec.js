'use strict';

const {test, expect} = require('../../fixtures/game.fixture');
const {uniqueRoom} = require('../../utils/browser-state');
const {expectOnScreen} = require('../../utils/layout');

test.describe('Desktop appearance', () => {
    test('switching themes redraws the canvas immediately and persists after reload', async ({game, page}) => {
        await game.start(uniqueRoom('theme'));
        await game.captureBlock();
        await expect(page.locator('html')).toHaveClass(/theme-classic/);
        // Read an empty cell, away from grid lines and the falling piece.
        const fieldPixel = () => game.board.evaluate(canvas => {
            const context = canvas.getContext('2d');
            return [...context.getImageData(Math.round(canvas.width * 0.55), Math.round(canvas.height * 0.5), 1, 1).data];
        });
        let previous = await fieldPixel();
        for (const theme of ['flat', 'retro', 'classic']) {
            await game.openSettings(`Switch to the ${theme} theme`);
            await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${theme}`));
            await expect.poll(fieldPixel).not.toEqual(previous);
            previous = await fieldPixel();
            await page.reload();
            await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${theme}`));
            await game.takeSeat();
            await game.ready.click();
            await game.expectStarted();
        }
    });

    test('desktop panels preserve chat drafts and return boards to their original size', async ({game, page}) => {
        await game.start(uniqueRoom('desktop-panels'));
        for (const [width, height] of [[1280, 800], [1920, 1080]]) {
            await page.setViewportSize({width, height});
            await expectOnScreen(game.boards);
            const before = await game.board.boundingBox();
            await game.chatInput.fill('Unsent draft');
            await page.getByRole('button', {name: 'Hide chat and keyboard'}).click();
            await expect(game.chat).toBeHidden();
            await expect(game.keyboard).toBeHidden();
            await expectOnScreen(game.boards);
            await page.getByRole('button', {name: 'Show chat and keyboard'}).click();
            await expect(game.chatInput).toHaveValue('Unsent draft');
            await expect.poll(async () => (await game.board.boundingBox()).height).toBeCloseTo(before.height, 0);
        }
    });
});

test.describe('High-density desktop', () => {
    test.use({deviceScaleFactor: 2});
    test('canvas backing pixels scale with the display', async ({game}) => {
        await game.start(uniqueRoom('desktop-density'));
        await expect.poll(() => game.board.evaluate(canvas => canvas.width - Math.round(canvas.clientWidth * 2))).toBe(0);
    });
});

test.describe('Reduced motion', () => {
    test.use({reducedMotion: 'reduce'});
    test('the seat button stops pulsing', async ({game}) => {
        await game.goto(uniqueRoom('reduced-motion'));
        await expect(game.seat).toBeVisible();
        const duration = await game.seat.evaluate(element => parseFloat(getComputedStyle(element).animationDuration));
        expect(duration).toBeLessThan(0.001);
    });
});
