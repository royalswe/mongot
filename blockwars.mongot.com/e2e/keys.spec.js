'use strict';

const {test, expect} = require('@playwright/test');
const {quietFirstVisit} = require('./helpers');

for (const theme of ['classic', 'flat', 'retro']) {
    test(`${theme}: the up arrow sits above the down arrow`, async ({page, context}) => {
        await quietFirstVisit(context, {theme});
        await page.goto(`/game?room=E2E-keys-${theme}&rank=no`);

        const up = await page.locator('[id="38"]').boundingBox();
        const down = await page.locator('[id="40"]').boundingBox();

        const upCentre = up.x + up.width / 2;
        expect(upCentre).toBeGreaterThan(down.x);
        expect(upCentre).toBeLessThan(down.x + down.width);
    });
}
