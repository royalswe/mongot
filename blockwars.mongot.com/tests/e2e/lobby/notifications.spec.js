'use strict';

const {test, expect} = require('../../fixtures/game.fixture');

test.describe('Push browser integration', () => {
    test('the service worker becomes ready at root scope and the install manifest is valid', async ({lobby, page}) => {
        await lobby.goto();
        const scope = await page.evaluate(async () => {
            await navigator.serviceWorker.register('/service-worker.js');
            return (await navigator.serviceWorker.ready).scope;
        });
        expect(new URL(scope).pathname).toBe('/');
        // The manifest link is metadata, with no accessible selector.
        const manifest = await page.locator('link[rel=manifest]').getAttribute('href');
        const response = await page.request.get(manifest);
        expect(response.ok()).toBe(true);
        expect(await response.json()).toMatchObject({start_url: '/lobby', display: 'standalone'});
    });

    test('desktop alerts and users share a sidebar without overlapping', async ({lobby}) => {
        await lobby.goto();
        const alerts = await lobby.alerts.boundingBox();
        const users = await lobby.users.boundingBox();
        expect(users.width).toBeCloseTo(alerts.width, 0);
        expect(users.x).toBeCloseTo(alerts.x, 0);
        expect(users.y).toBeGreaterThanOrEqual(alerts.y + alerts.height);
    });
});
