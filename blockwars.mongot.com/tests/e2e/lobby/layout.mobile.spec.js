'use strict';

const {test, expect} = require('../../fixtures/game.fixture');

test.describe('Phone lobby', () => {
    test('rooms, chat and users precede information and alerts without horizontal scrolling', async ({lobby, page}) => {
        await lobby.goto();
        // These legacy layout sections have no named region roles.
        const sections = [page.locator('#allrooms'), page.locator('#lobby_chat'),
            lobby.users, page.locator('#news_box'), lobby.alerts];
        let bottom = 0;
        for (const section of sections) {
            await expect(section).toBeVisible();
            const box = await section.boundingBox();
            expect(box.y).toBeGreaterThanOrEqual(bottom);
            bottom = box.y + box.height;
        }
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    });
});
