'use strict';

const {test, expect} = require('@playwright/test');
const {sessionCookie} = require('./accounts');

test('joining a room dims its button for guests after live updates', async ({page}) => {
    await page.goto('/lobby', {waitUntil: 'domcontentloaded'});
    await expect(page.locator('#allrooms tbody tr').first()).toBeVisible();
    const renderRoom = () => page.evaluate(() => lobby.renderRooms({rooms: [{
        name: 'joined-button-check', ranking: 'no', status: 'waiting', players: [], activePlayers: []
    }]}));
    await renderRoom();
    const button = page.locator('[data-room="joined-button-check"]');
    await expect(button).toHaveCSS('opacity', '1');
    const popupPromise = page.waitForEvent('popup');
    await button.click();
    const popup = await popupPromise;
    await expect(button).toHaveCSS('opacity', '0.5');
    await renderRoom();
    await expect(button).toHaveCSS('opacity', '0.5');
    await popup.close();
    await renderRoom();
    await expect(button).toHaveCSS('opacity', '1');
});

test('lobby lists open ranked and unranked rooms', async ({page}) => {
    await page.goto('/lobby', {waitUntil: 'domcontentloaded'});

    const rows = page.locator('#allrooms tbody tr');
    await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(4);
    await expect(rows.filter({has: page.locator('td:nth-child(4)', {hasText: /^\s*yes\s*$/})}).first()).toBeVisible();
    await expect(rows.filter({has: page.locator('td:nth-child(4)', {hasText: /^\s*no\s*$/})}).first()).toBeVisible();
    await expect(rows.first().getByRole('button', {name: 'Join Room'})).toBeVisible();
});

test('lobby shows who is online', async ({browser}) => {
    const context = await browser.newContext();
    await context.addCookies([sessionCookie('alice@test.local')]);
    const page = await context.newPage();
    await page.goto('/lobby', {waitUntil: 'domcontentloaded'});

    await expect(page.locator('#users_online').getByRole('link', {name: 'Alice'})).toBeVisible();
    await context.close();
});

test('a second visitor is announced and listed in the lobby', async ({browser}) => {
    const first = await browser.newContext();
    const firstPage = await first.newPage();
    await firstPage.goto('/lobby', {waitUntil: 'domcontentloaded'});
    await expect(firstPage.locator('#users_online')).toContainText('Users in lobby (1)');

    const second = await browser.newContext();
    await second.addCookies([sessionCookie('bob@test.local')]);
    const secondPage = await second.newPage();
    await secondPage.goto('/lobby', {waitUntil: 'domcontentloaded'});

    await expect(firstPage.locator('#users_online')).toContainText('Users in lobby (2)');
    await expect(firstPage.locator('#users_online')).toContainText('Bob');
    await second.close();
    await expect(firstPage.locator('#users_online')).toContainText('Users in lobby (1)');
    await first.close();
});
