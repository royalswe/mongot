'use strict';

const {test, expect} = require('@playwright/test');
const {sessionCookie} = require('./accounts');
const {uniqueRoom} = require('./helpers');

// Opens the game page as a logged in account, or as a guest when no email is given.
async function openGame(browser, email, room, ranking) {
    const context = await browser.newContext();
    // First-time visitors get a rules popup that covers the page.
    await context.addInitScript(() => {
        localStorage.setItem('rule-read', 'true');
        localStorage.setItem('toggle-sound', 'off');
    });
    if (email) { await context.addCookies([sessionCookie(email)]); }
    const page = await context.newPage();
    await page.goto(`/game?room=${room}&rank=${ranking}`);
    return {context, page};
}

test('guests cannot take a seat in a ranked room', async ({browser}) => {
    const {context, page} = await openGame(browser, null, uniqueRoom('guest-ranked'), 'yes');

    await expect(page.locator('#messages')).toContainText('Register new account');
    await expect(page.locator('#take_seat')).toBeHidden();
    await context.close();
});

test('guests can take a seat in an unranked room', async ({browser}) => {
    const {context, page} = await openGame(browser, null, uniqueRoom('guest-open'), 'no');

    await expect(page.locator('#take_seat')).toBeVisible();
    await page.locator('#take_seat').click();
    await expect(page.locator('#player_ready')).toBeVisible();
    await expect(page.locator('#take_seat')).toBeHidden();
    await context.close();
});

test('ready players start the game and a seated player leaving hands the win to the other', async ({browser}) => {
    const room = uniqueRoom('ranked');
    const observer = await browser.newContext();
    const lobby = await observer.newPage();
    await lobby.goto('/lobby', {waitUntil: 'domcontentloaded'});

    const alice = await openGame(browser, 'alice@test.local', room, 'yes');
    const bob = await openGame(browser, 'bob@test.local', room, 'yes');
    const roomRow = lobby.locator('#allrooms tbody tr', {hasText: room});
    await expect(roomRow).toBeVisible();

    for (const player of [alice, bob]) {
        await expect(player.page.locator('#take_seat')).toBeVisible();
        await player.page.locator('#take_seat').click();
        await expect(player.page.locator('#player_ready')).toBeVisible();
    }
    await expect(roomRow).toContainText('waiting for players');

    await alice.page.locator('#player_ready').click();
    await expect(bob.page.locator('#count_down')).toBeAttached();
    await bob.page.locator('#player_ready').click();

    await expect(alice.page.locator('#game_log')).toContainText('The game has started!');
    await expect(bob.page.locator('#game_log')).toContainText('The game has started!');
    await expect(roomRow).toContainText('game in progress');

    await bob.context.close();

    await expect(alice.page.locator('#game_log')).toContainText('Alice won the game!');
    await expect(alice.page.locator('#messages')).toContainText('Bob lost 25 points');
    await expect(alice.page.locator('#messages')).toContainText('Alice won 25 points');
    await expect(roomRow).toContainText('waiting for players');

    await alice.context.close();
    await expect(roomRow).toHaveCount(0);
    await observer.close();
});

test('a bot can be added by chat and joins the game when the human is ready', async ({browser}) => {
    const {context, page} = await openGame(browser, 'alice@test.local', uniqueRoom('bot'), 'no');
    await expect(page.locator('#take_seat')).toBeVisible();
    await page.locator('#take_seat').click();
    await expect(page.locator('#player_ready')).toBeVisible();

    await page.locator('#message').fill('Add bot');
    await page.locator('#message').press('Enter');
    await expect(page.locator('.client-name[data-player="#Bot-0"]')).toBeAttached();

    await page.locator('#player_ready').click();
    await expect(page.locator('#game_log')).toContainText('The game has started!');
    await context.close();
});

test('an unranked game gives no points', async ({browser}) => {
    const room = uniqueRoom('unranked');
    const alice = await openGame(browser, 'alice@test.local', room, 'no');
    const bob = await openGame(browser, 'bob@test.local', room, 'no');

    for (const player of [alice, bob]) {
        await expect(player.page.locator('#take_seat')).toBeVisible();
        await player.page.locator('#take_seat').click();
        await expect(player.page.locator('#player_ready')).toBeVisible();
    }
    await alice.page.locator('#player_ready').click();
    await bob.page.locator('#player_ready').click();
    await expect(alice.page.locator('#game_log')).toContainText('The game has started!');

    await bob.context.close();

    await expect(alice.page.locator('#game_log')).toContainText('Alice won the game!');
    await expect(alice.page.locator('#messages')).not.toContainText('points');
    await alice.context.close();
});
