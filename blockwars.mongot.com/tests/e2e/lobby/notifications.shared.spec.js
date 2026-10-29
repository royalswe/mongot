'use strict';

const {test, expect} = require('../../fixtures/game.fixture');

test.describe('Lobby arrival alerts', () => {
    test('help works independently of opting in, and missing push setup reports an error', async ({lobby, page}) => {
        await page.addInitScript(() => {
            Object.defineProperty(Notification, 'permission', {get: () => 'granted'});
        });
        await lobby.goto();
        await expect(lobby.help).toBeHidden();
        await page.getByText('Arrival notifications', {exact: true}).click();
        await expect(lobby.notificationStatus).toContainText('not configured');
        await expect(lobby.notification).not.toBeChecked();
        await expect(lobby.notificationState).toHaveText('Off');
        await expect(lobby.help).toBeHidden();

        await lobby.helpToggle.press('Enter');
        await expect(lobby.help).toBeVisible();
        await expect(lobby.help).toContainText('Home Screen');
        await expect(lobby.help).toContainText('Quitting the browser');
        await lobby.help.getByRole('button', {name: 'Close explanation'}).click();
        await expect(lobby.help).toBeHidden();
        await expect(lobby.helpToggle).toBeFocused();
        await expect(lobby.notification).not.toBeChecked();
        await expect(lobby.notificationStatus).toContainText('not configured');
    });
});
