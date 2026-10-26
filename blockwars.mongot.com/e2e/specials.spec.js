'use strict';

const {test, expect} = require('@playwright/test');
const Grid = require('../game/ai/grid');

function arenaWithBlocks() {
    const matrix = Array.from({length: 22}, () => new Array(10).fill(0));
    matrix[21].fill(3);
    matrix[21][4] = 0;
    matrix[18][2] = 9; // a special
    matrix[15][7] = 12;
    matrix[10][3] = 5; // floating block
    return matrix;
}

test('the browser, the bot and the shared rules apply specials identically', async ({page}) => {
    await page.goto('/game?room=E2E-specials&rank=no');

    // Random-free specials: remove row, gravity, clear arena, monster, mine.
    for (const special of [9, 14, 15, 17, 18]) {
        const grid = new Grid(22, 10);
        grid.cells = arenaWithBlocks();
        grid.performSpecial({special});

        const inBrowser = await page.evaluate(([matrix, id]) => {
            applySpecial(matrix, id);
            return matrix;
        }, [arenaWithBlocks(), special]);

        expect(inBrowser, `special ${special}`).toEqual(grid.cells);
    }
});
