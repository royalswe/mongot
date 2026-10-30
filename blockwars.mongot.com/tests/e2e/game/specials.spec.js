'use strict';

const {test, expect} = require('../../fixtures/game.fixture');
const {uniqueRoom} = require('../../utils/browser-state');

test.describe('Sending Specials', () => {
    for (const activation of ['click', 'keyboard']) {
        test(`target an opponent by ${activation} and consume the queued Special`, async ({game, page, rivalGame}) => {
            const rival = await rivalGame(uniqueRoom('target'));
            await game.collectSpecial(10);
            const target = game.target('Rival');
            if (activation === 'keyboard') {
                await target.focus();
                await page.keyboard.press('Enter');
            } else {
                await target.click();
            }
            expect(await rival.next('use-special')).toMatchObject({special: 10, receiver: 'Rival'});
            await expect(game.queueIcons).toHaveCount(0);
            await expect(game.log).toContainText('> Rival');
        });
    }

    test('use a helpful Special on yourself by queue or number key', async ({game, page, rivalGame}) => {
        await rivalGame(uniqueRoom('self-special'));
        await game.collectSpecial(9);
        await game.queue.click();
        await expect(game.queueIcons).toHaveCount(0);
        await expect(game.log).toContainText('Remove row');
        await game.collectSpecial(11);
        await page.keyboard.press('3');
        await expect(game.queueIcons).toHaveCount(0);
        await expect(game.log).toContainText('Milkshake');
    });

    test('row-clear bounce reaches opponents and can be disabled', async ({game, page, rivalGame}) => {
        const rival = await rivalGame(uniqueRoom('bounce'));
        await game.clearRows(2);
        await expect(game.board).toHaveClass(/tetris-bounce/);
        expect(await rival.next('arena-bounce')).toMatchObject({rows: 2});
        const opponent = game.target('Rival').locator('canvas');
        rival.send({type: 'arena-bounce', rows: 4});
        await expect(opponent).toHaveClass(/tetris-bounce-big/);
        await game.openSettings('Controls');
        await game.controls.getByRole('checkbox', {name: 'Arena bounce'}).uncheck();
        await game.controls.getByRole('button', {name: 'Done', exact: true}).click();
        const nextRival = await rivalGame(uniqueRoom('bounce-disabled'));
        await game.openSettings('Controls');
        await expect(game.controls.getByRole('checkbox', {name: 'Arena bounce'})).not.toBeChecked();
        await game.controls.getByRole('button', {name: 'Done', exact: true}).click();
        nextRival.send({type: 'arena-bounce', rows: 4});
        await game.clearRows(2);
        await nextRival.next('arena-bounce');
        await expect(game.board).not.toHaveClass(/tetris-bounce/);
        await expect(opponent).not.toHaveClass(/tetris-bounce/);
    });
});
