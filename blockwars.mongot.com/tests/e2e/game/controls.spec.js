'use strict';

const {test, expect} = require('../../fixtures/game.fixture');
const {uniqueRoom} = require('../../utils/browser-state');

test.describe('Gameplay controls', () => {
    test('keyboard and on-screen controls move the real piece and release outside the button', async ({game, page}) => {
        await game.start(uniqueRoom('controls'));
        await game.captureBlock();
        const before = await game.position();
        await page.keyboard.press('ArrowRight');
        expect((await game.position()).x).toBe(before.x + 1);
        await page.getByRole('button', {name: 'Move left', exact: true}).click();
        expect((await game.position()).x).toBe(before.x);

        await page.getByRole('button', {name: 'Move right', exact: true}).hover();
        await page.mouse.down();
        await expect.poll(() => page.evaluate(() => window.__block.shift.direction)).toBe(1);
        await page.mouse.move(5, 5);
        await page.mouse.up();
        await expect.poll(() => page.evaluate(() => window.__block.shift.direction)).toBe(0);

        const cells = await game.settledCells();
        await game.board.click();
        await page.keyboard.press('Space');
        await expect.poll(() => game.settledCells()).toBeGreaterThan(cells);
    });

    test('rebinding a duplicate key survives reload and controls the piece', async ({game, page}) => {
        await game.goto(uniqueRoom('rebind'));
        await game.openSettings('Controls');
        // Legacy key-binding cells are interactive table cells, not named buttons.
        const left = game.controls.locator('#moveLeft');
        const right = game.controls.locator('#moveRight');
        await left.click();
        await page.keyboard.press('a');
        await expect(left).toHaveText('A');
        await right.click();
        await page.keyboard.press('a');
        await expect(right).toHaveText('A');
        await expect(left).not.toHaveText('A');
        await game.controls.getByRole('button', {name: 'Close Controls'}).click();

        await page.reload();
        await game.openSettings('Controls');
        await expect(right).toHaveText('A');
        await game.controls.getByRole('button', {name: 'Done', exact: true}).click();
        await game.takeSeat();
        await game.ready.click();
        await game.expectStarted();
        await game.captureBlock('a');
        const before = await game.position();
        await page.keyboard.press('a');
        expect((await game.position()).x).toBe(before.x + 1);
    });

    test('handling settings save through either close button', async ({game, page}) => {
        await game.goto(uniqueRoom('handling'));
        for (const [index, close] of ['Close Controls', 'Done'].entries()) {
            const das = String(120 + index * 20);
            const ghost = index === 0;
            await game.openSettings('Controls');
            await game.controls.getByRole('spinbutton', {name: 'DAS in milliseconds', exact: true}).fill(das);
            await game.controls.getByRole('checkbox', {name: 'Ghost piece', exact: true}).setChecked(ghost);
            await game.controls.getByRole('button', {name: close, exact: true}).click();
            await expect(game.controls).toBeHidden();
            await expect(game.settings).toBeFocused();
            await page.reload();
            await game.openSettings('Controls');
            await expect(game.controls.getByRole('spinbutton', {name: 'DAS in milliseconds', exact: true})).toHaveValue(das);
            await expect(game.controls.getByRole('checkbox', {name: 'Ghost piece', exact: true})).toBeChecked({checked: ghost});
            await game.controls.getByRole('button', {name: 'Done', exact: true}).click();
        }
    });

    test('chat shortcut focuses the input without dropping a piece while typing', async ({game, page}) => {
        await game.start(uniqueRoom('chat-focus'));
        await game.captureBlock();
        const before = await game.settledCells();
        await page.keyboard.press('Control+c');
        await expect(game.chatInput).toBeFocused();
        await page.keyboard.press('Space');
        expect(await game.settledCells()).toBe(before);
        await game.sendChat(uniqueRoom('game-chat'));
        await page.keyboard.press('Control+c');
        await expect(game.chatInput).not.toBeFocused();
    });
});
