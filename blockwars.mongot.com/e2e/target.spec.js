'use strict';

const {test, expect} = require('@playwright/test');
const {quietFirstVisit, gameWithRival, collectSpecial, uniqueRoom} = require('./helpers');

test.beforeEach(async ({context}) => { await quietFirstVisit(context); });

const rivalArena = page => page.locator('.arena:not(.local):has(.client-name[data-player="Rival"])');
const queueIcons = page => page.locator('.arena.local .specials img');

test('clicking an opponent sends them your next Special', async ({page, baseURL}) => {
    const rival = await gameWithRival(page, baseURL, uniqueRoom('click'));
    await collectSpecial(page, 10);
    await expect(queueIcons(page)).toHaveCount(1);

    await rivalArena(page).click();

    const received = await rival.next('use-special');
    expect(received).toMatchObject({special: 10, clientId: expect.any(String), receiver: 'Rival'});
    await expect(queueIcons(page)).toHaveCount(0);
    await expect(page.locator('#game_log')).toContainText('> Rival');
    rival.close();
});

test('clicking your own queue uses the Special on yourself', async ({page, baseURL}) => {
    const rival = await gameWithRival(page, baseURL, uniqueRoom('self'));
    await collectSpecial(page, 9);
    await expect(queueIcons(page)).toHaveCount(1);

    await page.locator('.arena.local .special-tube').click();

    await expect(queueIcons(page)).toHaveCount(0);
    await expect(page.locator('#game_log')).toContainText('Remove row');
    expect(await page.evaluate(() => document.querySelector('.arena.local .client-name').getAttribute('data-player')))
        .toBeTruthy();
    rival.close();
});

test('the Special is sent only to the one that was clicked, and the target flashes', async ({page, baseURL}) => {
    const rival = await gameWithRival(page, baseURL, uniqueRoom('flash'));
    await collectSpecial(page, 12);
    await expect(queueIcons(page)).toHaveCount(1);

    await rivalArena(page).click();

    await expect(rivalArena(page)).toHaveClass(/special-target/);
    await expect(rivalArena(page)).not.toHaveClass(/special-target/, {timeout: 2000});
    rival.close();
});

test('clicking with nothing in the queue sends nothing', async ({page, baseURL}) => {
    const sent = [];
    page.on('websocket', ws => ws.on('framesent', frame => sent.push(String(frame.payload))));
    const rival = await gameWithRival(page, baseURL, uniqueRoom('empty'));

    await rivalArena(page).click();
    await page.locator('.arena.local .special-tube').click();
    await page.waitForTimeout(300);

    expect(sent.filter(frame => frame.includes('use-special'))).toEqual([]);
    rival.close();
});

test('an opponent can be targeted with the keyboard', async ({page, baseURL}) => {
    const rival = await gameWithRival(page, baseURL, uniqueRoom('keyboard'));
    await collectSpecial(page, 10);
    await expect(queueIcons(page)).toHaveCount(1);

    const arena = page.getByRole('button', {name: 'Send your next Special to Rival'});
    await arena.focus();
    await page.keyboard.press('Enter');

    expect(await rival.next('use-special')).toMatchObject({special: 10, receiver: 'Rival'});
    await expect(queueIcons(page)).toHaveCount(0);
    rival.close();
});

test('the number keys still work', async ({page, baseURL}) => {
    const rival = await gameWithRival(page, baseURL, uniqueRoom('keys'));
    await collectSpecial(page, 11);
    await expect(queueIcons(page)).toHaveCount(1);

    await page.keyboard.press('3'); // you are always number 3

    await expect(queueIcons(page)).toHaveCount(0);
    await expect(page.locator('#game_log')).toContainText('Milkshake');
    rival.close();
});
