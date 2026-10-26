'use strict';

const {test, expect} = require('@playwright/test');
const {quietFirstVisit, gameWithRival, uniqueRoom} = require('./helpers');

const emptyArenaColours = {retro: 'rgb(23, 20, 63)', classic: 'rgb(38, 38, 38)', flat: 'rgb(27, 35, 46)'};

for (const theme of ['classic', 'flat', 'retro']) {
    test(`${theme}: seats nobody took are filled with dark blocks once the game starts`, async ({page, context, baseURL}) => {
        await quietFirstVisit(context, {theme});
        const rival = await gameWithRival(page, baseURL, uniqueRoom(`empty-${theme}`));

        const empty = page.locator('canvas.tetris.empty-arena');
        await expect(empty).toHaveCount(3);
        for (const arena of await empty.all()) {
            await expect(arena).toHaveCSS('background-color', emptyArenaColours[theme]);
            const image = await arena.evaluate(element => getComputedStyle(element).backgroundImage);
            expect(image).toContain('linear-gradient');
        }
        await expect(page.locator('.arena.local canvas.tetris')).not.toHaveClass(/empty-arena/);
        rival.close();
    });
}
