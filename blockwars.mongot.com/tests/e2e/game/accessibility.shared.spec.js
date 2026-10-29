'use strict';

const {test, expect} = require('../../fixtures/game.fixture');
const {uniqueRoom} = require('../../utils/browser-state');

test.describe('Keyboard-accessible settings', () => {
    test.beforeEach(async ({game}) => { await game.goto(uniqueRoom('accessibility')); });

    test('settings opens explicitly and Escape returns focus', async ({game, page}) => {
        await expect(game.settings).toHaveAttribute('aria-expanded', 'false');
        await game.settings.click();
        await expect(game.settings).toHaveAttribute('aria-expanded', 'true');
        await page.keyboard.press('Escape');
        await expect(game.settings).toHaveAttribute('aria-expanded', 'false');
        await expect(game.settings).toBeFocused();
    });

    for (const name of ['Controls', 'How to play']) {
        test(`${name} traps keyboard focus and returns it on Escape`, async ({game, page}) => {
            await game.openSettings(name);
            const dialog = page.getByRole('dialog', {name, exact: true});
            await expect(dialog).toBeVisible();
            const focusIsInside = () => dialog.evaluate(element => element.contains(document.activeElement));
            await expect.poll(focusIsInside).toBe(true);
            // Reverse Tab from the initial control exercises the wrap boundary immediately.
            await page.keyboard.press('Shift+Tab');
            await expect.poll(focusIsInside).toBe(true);
            for (let press = 0; press < 14; press++) {
                await page.keyboard.press('Tab');
                await expect.poll(focusIsInside).toBe(true);
            }
            await page.keyboard.press('Escape');
            await expect(dialog).toBeHidden();
            await expect(game.settings).toBeFocused();
        });
    }

});

test.describe('First visit', () => {
    test.use({rulesRead: false});

    test('the guide is usable through all steps and stays dismissed on reload', async ({game, page}) => {
        await game.goto(uniqueRoom('first-visit'));
        await expect(game.guide).toBeVisible();
        const progress = game.guide.getByRole('status');
        for (const [index, title] of ['Get started', 'Collect and use Specials', 'Special reference'].entries()) {
            await expect(progress).toHaveText(`Step ${index + 1} of 3 - ${title}`);
            const next = game.guide.getByRole('button', {name: index === 2 ? 'I understand' : 'Next', exact: true});
            await expect(next).toBeInViewport({ratio: 1});
            await expect(game.guide.getByRole('button', {name: 'Close How to play'})).toBeInViewport({ratio: 1});
            await next.click();
        }
        await expect(game.guide).toBeHidden();
        await page.reload();
        await expect(game.guide).toBeHidden();
        await game.openSettings('How to play');
        await expect(progress).toHaveText('Step 1 of 3 - Get started');
    });
});
