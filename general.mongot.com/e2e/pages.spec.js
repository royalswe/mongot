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
