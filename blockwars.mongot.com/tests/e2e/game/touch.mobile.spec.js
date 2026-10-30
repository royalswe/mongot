'use strict';

const {test, expect} = require('../../fixtures/game.fixture');
const {uniqueRoom} = require('../../utils/browser-state');
const {touchInput} = require('../../utils/touch');
const {expectTapTarget} = require('../../utils/layout');

test.use({movementButtons: false});

test.describe('Touch gameplay', () => {
    test('native taps, dragging and flicking control the piece without buttons @smoke', async ({game, page}) => {
        await game.start(uniqueRoom('gestures'));
        await expect(game.keyboard).toBeHidden();
        await game.useRotatablePiece();
        const before = await game.rotation();
        const field = await game.board.boundingBox();
        const x = field.x + field.width / 2;
        const y = field.y + field.height / 2;
        await page.touchscreen.tap(field.x + field.width * 0.75, y);
        expect(await game.rotation()).not.toEqual(before);
        await page.touchscreen.tap(field.x + field.width * 0.25, y);
        expect(await game.rotation()).toEqual(before);

        const touch = await touchInput(page);
        try {
            const start = await game.position();
            await touch.drag([x, y], [x + field.width * 0.22, y], 200);
            expect((await game.position()).x).toBe(start.x + 2);
            const cells = await game.settledCells();
            await touch.drag([x, field.y + field.height * 0.2], [x, field.y + field.height * 0.7]);
            await expect.poll(() => game.settledCells()).toBeGreaterThan(cells);
        } finally {
            await touch.close();
        }
    });

    test('holding a finger soft-drops and lifting releases it', async ({game, page}) => {
        await game.start(uniqueRoom('hold'));
        await game.captureBlock();
        const field = await game.board.boundingBox();
        const touch = await touchInput(page);
        try {
            await touch.down(field.x + field.width / 2, field.y + field.height / 2);
            await expect.poll(() => page.evaluate(() => window.__block.softDropping)).toBe(true);
            await touch.up();
            await expect.poll(() => page.evaluate(() => window.__block.softDropping)).toBe(false);
        } finally {
            await touch.close();
        }
    });

    test('on-screen buttons can be enabled, tapped once and remembered after reload', async ({game, page}) => {
        await game.start(uniqueRoom('touch-buttons'));
        await game.openSettings('Controls');
        await game.controls.getByRole('checkbox', {name: 'On-screen buttons'}).check();
        await game.controls.getByRole('button', {name: 'Done', exact: true}).click();
        await expect(game.keyboard).toBeVisible();
        await page.reload();
        await game.takeSeat();
        await game.ready.click();
        await game.expectStarted();
        await game.captureBlock();
        const before = await game.position();
        const left = page.getByRole('button', {name: 'Move left', exact: true});
        await expectTapTarget(left);
        await left.tap();
        expect((await game.position()).x).toBe(before.x - 1);
        await game.openSettings('Controls');
        await expect(game.controls.getByRole('checkbox', {name: 'On-screen buttons'})).toBeChecked();
    });
});

test.describe('Touch Specials', () => {
    test('tapping an opponent sends a Special; tapping the queue uses it on yourself', async ({game, rivalGame}) => {
        const rival = await rivalGame(uniqueRoom('touch-specials'));
        await game.collectSpecial(10);
        await expectTapTarget(game.target('Rival'));
        await game.target('Rival').tap();
        expect(await rival.next('use-special')).toMatchObject({special: 10, receiver: 'Rival'});
        await expect(game.queueIcons).toHaveCount(0);

        await game.collectSpecial(9);
        await expectTapTarget(game.queue);
        await game.queue.tap();
        await expect(game.queueIcons).toHaveCount(0);
        await expect(game.log).toContainText('Remove row');
    });

    test('tapping your own board rotates rather than consuming a queued Special', async ({game, page, rivalGame}) => {
        await rivalGame(uniqueRoom('touch-board'));
        await game.collectSpecial(10);
        await game.useRotatablePiece();
        const before = await game.rotation();
        const box = await game.board.boundingBox();
        await page.touchscreen.tap(box.x + box.width * 0.75, box.y + box.height / 2);
        expect(await game.rotation()).not.toEqual(before);
        await expect(game.queueIcons).toHaveCount(1);
    });
});
