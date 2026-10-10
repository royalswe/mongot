'use strict';

const {test, expect} = require('@playwright/test');
const {sessionCookie} = require('./accounts');

async function openTable(page, size = 2) {
    await page.goto('/lobby');
    const row = page.locator('#allrooms tbody tr').filter({hasText: '0/' + size}).filter({hasText: 'open'}).first();
    await expect(row).toBeVisible();
    return row.locator('td').first().innerText();
}

async function seat(page, roomName, color) {
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await expect(page.locator('.popup')).toBeVisible();
    await page.locator('label#' + color).click();
}

async function seatedUsername(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('#player_list .player-username'), (node) => node.textContent)[0]);
}

test('claims made by the browser do not change who the server thinks you are', async ({page}) => {
    const roomName = await openTable(page);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await page.waitForFunction(() => window.gameInfra && gameInfra.connected);
    await page.evaluate(() => {
        const claim = {username: 'Verified', active: true, points_general: 9999, god: true, isGuest: false};
        gameInfra.emit('player_ready', claim);
        gameInfra.emit('join_room', roomName);
    });
    await expect(page.locator('.popup .rank-notice.unranked')).toContainText('Playing as a guest');
    await page.locator('label#red').click();

    await expect(page.locator('#player_list .player-username')).toContainText('Guest-');
    await expect(page.locator('#player_list .player-username')).not.toHaveText('Verified');
    await expect(page.locator('#player_list .player-points')).toHaveText('Unranked');
    await expect(page.locator('#messages')).toContainText('playing as a guest');
});

test('a forged, reserved-name, or unknown login cookie is treated as a guest', async ({page}) => {
    const roomName = await openTable(page);
    const badCookies = [
        sessionCookie('verified@test.local', 'some-other-secret'),
        sessionCookie('scout@test.local'),
        Object.assign(sessionCookie('verified@test.local'), {value: 'not-a-real-session'})
    ];
    for (const cookie of badCookies) {
        await page.context().clearCookies();
        await page.context().addCookies([cookie]);
        await page.goto('/game?room=' + encodeURIComponent(roomName));
        await expect(page.locator('.popup .rank-notice.unranked')).toContainText('Playing as a guest');
    }
});

test('only a real admin can kick a player, and claiming admin from the browser does nothing', async ({page, browser}) => {
    const roomName = await openTable(page);
    const contexts = [];
    try {
        const first = await browser.newContext();
        const second = await browser.newContext();
        contexts.push(first, second);
        const firstPage = await first.newPage();
        const secondPage = await second.newPage();
        await seat(firstPage, roomName, 'red');
        await seat(secondPage, roomName, 'blue');
        await expect(firstPage.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});
        const target = await seatedUsername(firstPage);

        const spectatorContext = await browser.newContext();
        contexts.push(spectatorContext);
        const spectator = await spectatorContext.newPage();
        await spectator.goto('/game?room=' + encodeURIComponent(roomName));
        await spectator.waitForFunction(() => window.gameInfra && gameInfra.connected);
        await spectator.evaluate((player) => {
            gameInfra.emit('god_mode', {type: 'kick_player', room: roomName, player: player, user: {god: true, username: 'Verified'}});
        }, target);
        await secondPage.waitForTimeout(800);
        await expect(secondPage.locator('#messages')).not.toContainText('kicked');
        expect(await firstPage.evaluate(() => gameInfra.connected)).toBe(true);

        const godContext = await browser.newContext();
        contexts.push(godContext);
        await godContext.addCookies([sessionCookie('god@test.local')]);
        const god = await godContext.newPage();
        await god.goto('/game?room=' + encodeURIComponent(roomName));
        await god.waitForFunction(() => window.gameInfra && gameInfra.connected);
        await god.evaluate((player) => {
            gameInfra.emit('god_mode', {type: 'kick_player', room: roomName, player: player});
        }, target);
        await expect(secondPage.locator('#messages')).toContainText('Godly kicked ' + target);
    }
    finally {
        await Promise.all(contexts.map((context) => context.close()));
    }
});

test('a player cannot report an opponent as disconnected, but a real drop is noticed by the server', async ({page, browser}) => {
    const roomName = await openTable(page);
    const first = await browser.newContext();
    const second = await browser.newContext();
    try {
        const firstPage = await first.newPage();
        const secondPage = await second.newPage();
        await seat(firstPage, roomName, 'red');
        await seat(secondPage, roomName, 'blue');
        await expect(firstPage.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});

        await secondPage.evaluate(() => { gameInfra.emit('player_left', 0); gameInfra.emit('player_left', 1); });
        await firstPage.waitForTimeout(800);
        await expect(firstPage.locator('#messages')).not.toContainText('lost connection');
        await expect(secondPage.locator('#messages')).not.toContainText('lost connection');

        const leaver = await seatedUsername(firstPage);
        await first.close();
        await expect(secondPage.locator('#messages')).toContainText(leaver + ' lost connection and has 30 seconds');
    }
    finally {
        await second.close();
        await first.close().catch(() => {});
    }
});

test('lobby chat shows the logged-in name and ignores a claimed one', async ({page}) => {
    await page.context().addCookies([sessionCookie('verified@test.local')]);
    await page.goto('/lobby');
    await page.waitForFunction(() => window.lobbyChat && lobbyChat.connected);
    await page.evaluate(() => {
        lobbyChat.send(JSON.stringify({type: 'userMessage', message: 'hello from the lobby'}), {username: 'roYal', god: true});
    });
    await expect(page.locator('#messages')).toContainText('Verified:');
    await expect(page.locator('#messages')).not.toContainText('roYal:');
});

test('malformed chat messages are ignored instead of stopping the server', async ({page}) => {
    await page.goto('/lobby');
    await page.waitForFunction(() => window.lobbyChat && lobbyChat.connected);
    await page.evaluate(() => {
        lobbyChat.send('{not json');
        lobbyChat.send(42);
    });
    const text = 'still running ' + Date.now();
    await page.locator('#message').fill(text);
    await page.locator('#send').click();
    await expect(page.locator('#messages')).toContainText(text);
});

test('a seat colour must be one of the game colours', async ({page}) => {
    const roomName = await openTable(page);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await expect(page.locator('.popup')).toBeVisible();
    // The colour ends up in other players' HTML, so anything else must be refused.
    await page.evaluate((room) => gameInfra.emit('join_game', room, 'red"><img src=x onerror="window.injected=1">', {}), roomName);
    await page.locator('label#blue').click();
    await expect(page.locator('#player_list .player-name')).toHaveCount(1);
    await expect(page.locator('#player_list .player-name')).toHaveClass(/player-color-blue/);
    expect(await page.evaluate(() => window.injected)).toBeUndefined();
});
