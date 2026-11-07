const {test, expect} = require('@playwright/test');

test('the landing page leads to the lobby, high score and rules', async ({page}) => {
    await page.goto('/');
    await expect(page.locator('.hero-title')).toHaveText('General');
    await expect(page.locator('.hero-actions a', {hasText: 'Play now'})).toHaveAttribute('href', '/lobby');
    await expect(page.locator('a.feature')).toHaveCount(3);
});

test('the rules page switches between English and Swedish', async ({page}) => {
    await page.goto('/rules');
    await expect(page.locator('#english')).toBeVisible();
    await expect(page.locator('#swedish')).toBeHidden();
    await page.locator('.lang-menu a[href="#swedish"]').click();
    await expect(page.locator('#swedish')).toBeVisible();
    await expect(page.locator('#english')).toBeHidden();
});

test('lobby alerts explain their limits and report missing push setup', async ({page}) => {
    await page.addInitScript(() => {
        Object.defineProperty(Notification, 'permission', {get: () => 'granted'});
    });
    await page.goto('/lobby');

    await expect(page.locator('#lobby_notifications')).toBeVisible();
    await expect(page.locator('#notification-help')).toBeHidden();
    await page.getByText('Arrival notifications', {exact: true}).click();
    await expect(page.locator('#notification-status')).toContainText('not configured');
    await expect(page.locator('#toggle_notification')).not.toBeChecked();
    await expect(page.locator('#notification-state')).toHaveText('Off');

    await page.getByText('How it works & limits', {exact: true}).press('Enter');
    await expect(page.locator('#notification-help')).toBeVisible();
    await expect(page.locator('#notification-help')).toContainText('Home Screen');
    await page.getByRole('button', {name: 'Close explanation'}).click();
    await expect(page.locator('#notification-help')).toBeHidden();
});
