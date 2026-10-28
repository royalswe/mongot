'use strict';
const { test, expect } = require('@playwright/test');

test('bell explains limits and reports missing server configuration honestly', async ({ page }) => {
    // Permission is simulated here; external push delivery is not available in headless CI.
    await page.addInitScript(() => {
        Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
    });
    await page.goto('/lobby', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#notification-help')).toBeHidden();
    await page.locator('label[for=toggle_notification]').click();
    await expect(page.locator('#notification-help')).toBeHidden();
    await page.locator('#notification-help-toggle').click();
    await expect(page.locator('#notification-help')).toBeVisible();
    await expect(page.locator('#notification-help')).toContainText('Home Screen');
    await expect(page.locator('#notification-help')).toContainText('Quitting the browser');
    await expect(page.locator('#notification-status')).toContainText('not configured');
    await expect(page.locator('#toggle_notification')).not.toBeChecked();
    await expect(page.locator('#notification-state')).toHaveText('Off');
    await page.getByRole('button', { name: 'Close explanation' }).click();
    await expect(page.locator('#notification-help')).toBeHidden();
    await expect(page.locator('#notification-help-toggle')).toBeFocused();
    await expect(page.locator('#notification-status')).toContainText('not configured');
    await page.locator('#notification-help-toggle').press('Enter');
    await expect(page.locator('#notification-help')).toBeVisible();
    await expect(page.locator('#toggle_notification')).not.toBeChecked();
});

test('desktop user list aligns with the alerts card with a small gap', async ({ page }) => {
    await page.goto('/lobby', { waitUntil: 'domcontentloaded' });
    const alerts = await page.locator('#lobby_notifications').boundingBox();
    const users = await page.locator('#users_online').boundingBox();
    expect(Math.abs(users.width - alerts.width)).toBeLessThan(1);
    expect(Math.abs(users.x - alerts.x)).toBeLessThan(1);
    expect(users.y - alerts.y - alerts.height).toBeCloseTo(12, 0);
});

test('help can be opened and closed with the keyboard without changing notifications', async ({ page }) => {
    await page.goto('/lobby', { waitUntil: 'domcontentloaded' });
    const disclosure = page.locator('#notification-help-toggle');
    await disclosure.focus();
    await disclosure.press('Enter');
    await expect(page.locator('#notification-help')).toBeVisible();
    await page.getByRole('button', { name: 'Close explanation' }).click();
    await expect(disclosure).toBeFocused();
    await expect(page.locator('#notification-help')).toBeHidden();
    await expect(page.locator('#toggle_notification')).not.toBeChecked();
    await expect(page.locator('#notification-state')).toHaveText('Off');
});
test('service worker is served at the site root and becomes ready for the Lobby', async ({ page }) => {
    await page.goto('/lobby', { waitUntil: 'domcontentloaded' });
    const scope = await page.evaluate(async () => {
        await navigator.serviceWorker.register('/service-worker.js');
        const registration = await navigator.serviceWorker.ready;
        return registration.scope;
    });
    expect(new URL(scope).pathname).toBe('/');
});
