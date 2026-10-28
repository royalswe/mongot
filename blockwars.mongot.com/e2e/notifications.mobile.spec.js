'use strict';
const { test, expect } = require('@playwright/test');

test('notification bell and limits are available on small screens', async ({ page }) => {
    await page.goto('/lobby', { waitUntil: 'domcontentloaded' });
    const bell = page.locator('label[for=toggle_notification]');
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page.locator('#notification-help')).toBeHidden();
    await page.locator('#notification-help-toggle').click();
    await expect(page.locator('#notification-help')).toBeVisible();
    await expect(page.locator('#notification-help')).toContainText('iPhone');
    await page.getByRole('button', { name: 'Close explanation' }).click();
    await expect(page.locator('#notification-help')).toBeHidden();
    await expect(bell).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const manifestUrl = await page.locator('link[rel=manifest]').getAttribute('href');
    const response = await page.request.get(manifestUrl);
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ start_url: '/lobby', display: 'standalone' });
});

test('mobile shows information and alerts below chat and the user list', async ({ page }) => {
    await page.goto('/lobby', { waitUntil: 'domcontentloaded' });
    const sections = ['#allrooms', '#lobby_chat', '#users_online', '#news_box', '#lobby_notifications'];
    let bottom = 0;
    for (const selector of sections) {
        await expect(page.locator(selector)).toBeVisible();
        const bounds = await page.locator(selector).boundingBox();
        expect(bounds.y).toBeGreaterThanOrEqual(bottom);
        bottom = bounds.y + bounds.height;
    }
});
