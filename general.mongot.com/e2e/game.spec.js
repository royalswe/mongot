'use strict';

const {test, expect} = require('@playwright/test');

test('troop selector stays within the board through resizing', async ({page}) => {
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, null, 'red', 'Playing as a guest');
    await expect(page.locator('.popup')).toBeHidden();
    await expect(page.locator('.svg-content')).toHaveAttribute('data-map-id', /.+/);
    await page.evaluate(() => {
        document.querySelector('.territory-marker').id = '0';
        showUnitBar(500, 0);
    });
    const contained = () => page.evaluate(() => {
        const board = document.querySelector('#game_board').getBoundingClientRect();
        return Array.from(document.querySelectorAll('#unit_bar, #unit_bar > *')).every(element => {
            if (getComputedStyle(element).display === 'none') { return true; }
            const bounds = element.getBoundingClientRect();
            return bounds.left >= board.left && bounds.right <= board.right + 1 && bounds.top >= board.top && bounds.bottom <= board.bottom + 1;
        });
    });
    for (const viewport of [{width: 1280, height: 800}, {width: 320, height: 568}, {width: 844, height: 390}, {width: 1000, height: 800}]) {
        await page.setViewportSize(viewport);
        await expect.poll(contained).toBe(true);
        if (viewport.width <= 1000) {
            await expect(page.locator('#unit_input')).toBeVisible();
            await expect(page.locator('.add')).toBeHidden();
            await expect(page.locator('#cancel_units')).toBeHidden();
            await expect(page.locator('.mobile-unit-label')).toBeVisible();
            await page.locator('#unit_input').fill('499');
            await expect(page.locator('#unit_output')).toHaveValue('499');
            await page.locator('#unit_input').fill('1');
            await expect.poll(() => page.evaluate(() => {
                const map = document.querySelector('.svg-container').getBoundingClientRect();
                const form = document.querySelector('#unit_bar').getBoundingClientRect();
                return map.bottom <= form.top + 1;
            })).toBe(true);
        } else {
            await expect(page.locator('#unit_input')).toBeHidden();
            await expect(page.locator('.add')).toBeVisible();
            await expect(page.locator('#cancel_units')).toHaveText('X');
        }
    }
    await page.locator('.slide-toggle').click();
    await expect.poll(contained).toBe(true);
    await page.locator('.add').click();
    await expect(page.locator('#unit_output')).toHaveValue('2');
    await expect(page.locator('#unit_input')).toHaveValue('2');
    await page.locator('#unit_output').fill('499');
    await expect(page.locator('#unit_output')).toHaveValue('499');
    await page.locator('#cancel_units').click();
    await expect(page.locator('#unit_bar')).toHaveCount(0);
});

test('header layout follows board width when chat toggles', async ({page}) => {
    await page.setViewportSize({width: 1000, height: 800});
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, null, 'red', 'Playing as a guest');
    await expect(page.locator('.popup')).toBeHidden();
    const controlsDirection = () => page.locator('#header_buttons').evaluate(element => getComputedStyle(element).flexDirection);
    await expect.poll(controlsDirection).toBe('row');
    await page.locator('.slide-toggle').click();
    await expect.poll(controlsDirection).toBe('column');
    await expect(page.locator('.slide-toggle')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('.slide-toggle').press('Enter');
    await expect.poll(controlsDirection).toBe('row');
    await expect(page.locator('.slide-toggle')).toHaveAttribute('aria-expanded', 'true');
});

for (const viewport of [{width: 320, height: 568}, {width: 390, height: 844}, {width: 844, height: 390}, {width: 1280, height: 800}]) {
    test('game header contains its stats and controls at ' + viewport.width + 'px', async ({page}) => {
        await page.setViewportSize(viewport);
        const roomName = await firstRoomName(page);
        await seatAs(page, roomName, null, 'red', 'Playing as a guest');
        await expect(page.locator('.popup')).toBeHidden();
        await expect(page.locator('.svg-content')).toHaveAttribute('data-map-id', /.+/);
        await expect(page.locator('#game_header')).toBeVisible();
        await page.evaluate(() => {
            document.querySelector('.phase-message').textContent = 'Place your armies';
            document.querySelector('.phase-info').textContent = 'Choose a territory to reinforce before attacking your opponents.';
            document.querySelector('.user-gold').textContent = 'Gold: 123456';
            document.querySelector('.user-goldIncome').textContent = 'Income: 1234';
            document.querySelector('#match_rank').textContent = 'Unranked match';
            document.querySelector('#countdown').textContent = '01:30';
        });
        const contained = () => page.evaluate(() => {
            const header = document.querySelector('#game_header').getBoundingClientRect();
            const map = document.querySelector('.svg-container').getBoundingClientRect();
            const svg = document.querySelector('.svg-content');
            const bounds = svg.getBoundingClientRect();
            const ratio = svg.viewBox.baseVal.width / svg.viewBox.baseVal.height;
            const elements = document.querySelectorAll('#phase_img, #header_buttons button, #game_info, #stats, #stats p, #countdown');
            return Array.from(elements).every(element => {
                const rect = element.getBoundingClientRect();
                return rect.left >= header.left && rect.right <= header.right && rect.top >= header.top && rect.bottom <= header.bottom;
            }) && map.top >= header.bottom && map.bottom <= window.innerHeight + 1
                && bounds.width > 0 && bounds.height > 0 && bounds.bottom <= map.bottom + 1
                && bounds.left >= map.left && bounds.right <= map.right + 1
                && Math.abs(bounds.width / bounds.height - ratio) < 0.01;
        });
        await expect.poll(contained).toBe(true);
        await page.locator('#show_gold').click();
        await expect(page.locator('.show-gold')).toBeVisible();
        await expect.poll(contained).toBe(true);
    });
}
const {sessionCookie} = require('./accounts');

async function firstRoomName(page, size = 2) {
    await page.goto('/lobby');
    // Earlier tests can leave a finished game's room behind, so only pick an empty table.
    const openRoom = page.locator('#allrooms tbody tr').filter({hasText: '0/' + size}).filter({hasText: 'open'}).first();
    await expect(openRoom).toBeVisible();
    return openRoom.locator('td').first().innerText();
}

function lobbyRow(page, roomName) {
    return page.locator('#allrooms tbody tr').filter({has: page.getByRole('cell', {name: roomName, exact: true})});
}

// test('dev multiplayer cockpit opens distinct guest instances', async ({page}) => {
//     await page.goto('/dev/multiplayer');
//     await expect(page.getByRole('heading', {name: 'Multiplayer test'})).toBeVisible();
//     await expect.poll(() => page.locator('.player-window iframe').count()).toBeGreaterThanOrEqual(2);

//     const guestIds = await page.locator('.player-window iframe').evaluateAll((frames) =>
//         frames.map((frame) => new URL(frame.src).searchParams.get('devGuestId')));
//     expect(new Set(guestIds).size).toBe(guestIds.length);

//     const guestNames = [];
//     for (let index = 0; index < guestIds.length; index += 1) {
//         const messages = page.frameLocator('.player-window iframe').nth(index).locator('#messages');
//         await expect(messages).toContainText('Welcome Guest-');
//         const welcome = (await messages.innerText()).match(/Welcome (Guest-[a-f0-9]+)/);
//         guestNames.push(welcome[1]);
//     }
//     expect(new Set(guestNames).size).toBe(guestNames.length);

//     await page.locator('#clear_players').click();
//     await expect(page.locator('.player-window')).toHaveCount(0);
// });

test('lobby lists each room map', async ({page}) => {
    await page.goto('/lobby');
    await expect(page.getByRole('heading', {name: 'General Lobby'})).toBeVisible();
    await expect(page.locator('#allrooms thead')).toContainText('Map');
    await expect(page.locator('#allrooms tbody tr')).toHaveCount(6);
    await expect(page.locator('#allrooms tbody tr').first().locator('td').nth(2)).toHaveText('Original Map');
});

// Logs the context in with the same signed cookie the main site issues, then takes a seat.
async function seatAs(page, roomName, email, color, expectedNotice) {
    if (email) { await page.context().addCookies([sessionCookie(email)]); }
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await expect(page.locator('.popup .rank-notice')).toContainText(expectedNotice);
    await page.locator('label#' + color).click();
}

for (const width of [1280, 375]) {
    test('chat toggle stays on the panel edge throughout transitions at ' + width + 'px', async ({page}) => {
        await page.setViewportSize({width, height: 800});
        const roomName = await firstRoomName(page);
        await seatAs(page, roomName, null, 'red', 'Playing as a guest');
        await expect(page.locator('.popup')).toBeHidden();
        await expect(page.locator('.slide-toggle')).toBeVisible();

        const results = await page.evaluate(async () => {
            const panel = document.getElementById('chatroom');
            const toggle = panel.querySelector('.slide-toggle');
            const samples = [];
            for (const hidden of [false, true, false]) {
                if (panel.classList.contains('hidden') !== hidden) { toggle.click(); }
                const started = performance.now();
                do {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    const panelBox = panel.getBoundingClientRect();
                    const toggleBox = toggle.getBoundingClientRect();
                    samples.push({
                        aligned: Math.abs(toggleBox.left - panelBox.right) < 1,
                        clickable: document.elementFromPoint(toggleBox.left + toggleBox.width / 2,
                            toggleBox.top + toggleBox.height / 2) === toggle,
                        width: toggleBox.width
                    });
                } while (performance.now() - started < 400);
            }
            return samples;
        });

        expect(results.length).toBeGreaterThan(3);
        expect(results.every(sample => sample.aligned && sample.clickable && sample.width === 20)).toBe(true);
    });
}

test('a guest sees that open tables can be joined and that games are unranked', async ({page}) => {
    await page.goto('/lobby');
    await expect(page.locator('.flash-message.info')).toContainText('playing as a guest');
    await expect(page.locator('.flash-message.info a')).toHaveCount(2);
    const openRow = page.locator('#allrooms tbody tr').filter({hasText: 'open'}).first();
    await expect(openRow.locator('.join-room')).toHaveText('join game');
});

test('a verified player sees ranked notices and their rating', async ({page}) => {
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, 'verified@test.local', 'red', 'Ranked play');
    await expect(page.locator('#player_list .player-username')).toHaveText('Verified');
    await expect(page.locator('#player_list .player-points')).toContainText('1600');
    await expect(page.locator('#match_rank')).toHaveText('Ranked match');
});

test('an unverified player can take a seat but is told their games are unranked', async ({page}) => {
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, 'unverified@test.local', 'red', 'Email not verified');
    await expect(page.locator('#player_list .player-username')).toHaveText('Unverified');
    await expect(page.locator('#player_list .player-points')).toHaveText('Unranked');
    await expect(page.locator('#match_rank')).toHaveText('Unranked match');
});

test('a verified player is told the match is unranked once an unverified player sits down', async ({page, browser}) => {
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, 'verified@test.local', 'red', 'Ranked play');
    await expect(page.locator('#match_rank')).toHaveText('Ranked match');

    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    try {
        await seatAs(secondPage, roomName, 'unverified@test.local', 'blue', 'Email not verified');
        await expect(page.locator('#match_rank')).toHaveText('Unranked match');
    }
    finally {
        await secondContext.close();
    }
});

test('a started match stays unranked after the guest who made it unranked leaves', async ({page, browser}) => {
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, 'verified@test.local', 'red', 'Ranked play');

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    try {
        await seatAs(guestPage, roomName, null, 'blue', 'Playing as a guest');
        await expect(page.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});
        await expect(page.locator('#match_rank')).toHaveText('Unranked match');

        await guestContext.close();
        await expect(page.locator('#messages')).toContainText('lost connection');
        await expect(page.locator('#player_list .player-name')).toHaveCount(1);
        await expect(page.locator('#match_rank')).toHaveText('Unranked match');
        await expect(page.locator('#match_rank')).toHaveClass(/unranked/);
    }
    finally {
        await guestContext.close().catch(() => {});
    }
});

test('a table becomes ranked again when a guest leaves before the match has started', async ({page, browser}) => {
    const roomName = await firstRoomName(page, 3);
    await seatAs(page, roomName, 'verified@test.local', 'red', 'Ranked play');

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    try {
        await seatAs(guestPage, roomName, null, 'blue', 'Playing as a guest');
        await expect(page.locator('#match_rank')).toHaveText('Unranked match');

        await guestContext.close();
        await expect(page.locator('#player_list .player-name')).toHaveCount(1);
        await expect(page.locator('#match_rank')).toHaveText('Ranked match');
    }
    finally {
        await guestContext.close().catch(() => {});
    }
});

test('first seated player can choose an alternate map and allow bots', async ({page}) => {
    const roomName = await firstRoomName(page);
    await page.context().addCookies([sessionCookie('verified@test.local')]);
    await page.goto('/game?room=' + encodeURIComponent(roomName));

    await expect(page.locator('#map_choice')).toBeVisible();
    const chipsInsidePopup = await page.evaluate(() => {
        const popup = document.querySelector('.popup').getBoundingClientRect();
        return Array.from(document.querySelectorAll('.popup .player-check')).every((chip) => {
            const box = chip.getBoundingClientRect();
            return box.left >= popup.left && box.right <= popup.right && box.top >= popup.top && box.bottom <= popup.bottom;
        });
    });
    expect(chipsInsidePopup).toBe(true);
    await page.locator('#map_choice').selectOption('archipelago');
    await page.locator('#allow_bots').check();
    await page.locator('label#red').click();

    await expect(page.locator('#start_bots')).toBeVisible();
    const botButtonIsClickable = await page.evaluate(() => {
        const button = document.querySelector('#start_bots');
        const box = button.getBoundingClientRect();
        const container = document.querySelector('.svg-container').getBoundingClientRect();
        const inside = box.left >= container.left && box.right <= container.right && box.top >= container.top;
        return inside && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === button;
    });
    expect(botButtonIsClickable).toBe(true);
    await expect(page.locator('.map-connection')).not.toHaveCount(0);
    await expect(page.locator('.svg-content')).toHaveClass(/map-archipelago/);
    const backgroundImage = await page.locator('.svg-content').evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(backgroundImage).toContain('archipelago.svg');

    await expect(page.locator('.map-connection.map-sea')).not.toHaveCount(0);
    await page.locator('.svg-content > g').first().hover();
    await expect(page.locator('.map-connection.active')).not.toHaveCount(0);
    await expect(page.locator('.map-reach-ring')).not.toHaveCount(0);
    await page.mouse.move(0, 0);
    await expect(page.locator('.map-reach-ring')).toHaveCount(0);
});

test('the world map renders all 42 classic territories', async ({page}) => {
    const roomName = await firstRoomName(page, 4);
    await page.context().addCookies([sessionCookie('verified@test.local')]);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await expect(page.locator('#map_choice')).toBeVisible();
    await page.locator('#map_choice').selectOption('world');
    await page.locator('label#red').click();

    await expect(page.locator('.territory-marker')).toHaveCount(42);
    const backgroundImage = await page.locator('.svg-content').evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(backgroundImage).toContain('world.svg');
    await expect(page.locator('.territory-marker title').first()).toHaveText('Alaska');

    await page.evaluate(() => {
        window.__clickedTerritories = [];
        window.playerEnabled = true;
        window.phase = 'Battle';
        window.battle = (id) => window.__clickedTerritories.push(id);
    });
    await page.locator('.territory-marker[id="34"]').click();
    await expect.poll(() => page.evaluate(() => window.__clickedTerritories)).toEqual(['34']);
});

test('quick-test starts with four territories, low gold, and a conquest mission', async ({page}) => {
    const roomName = await firstRoomName(page, 4);
    await page.context().addCookies([sessionCookie('verified@test.local')]);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await expect(page.locator('#map_choice')).toBeVisible();
    await page.locator('#map_choice').selectOption('quick');
    await page.locator('#allow_bots').check();
    await page.locator('label#red').click();
    await page.locator('#start_bots').click();

    await expect(page.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});
    await expect(page.locator('.territory-marker:visible')).toHaveCount(4);
    await expect(page.locator('.user-gold')).toContainText('15');
    await expect.poll(() => page.evaluate(() => window.mission && window.mission.mission)).toBe('conquer_player');
    const backgroundImage = await page.locator('.svg-content').evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(backgroundImage).toContain('quick.svg');
});

test('a player can spend all starting gold buying armies through repeated territory clicks', async ({page}) => {
    const roomName = await firstRoomName(page, 4);
    await page.context().addCookies([sessionCookie('verified@test.local')]);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await expect(page.locator('#map_choice')).toBeVisible();
    await page.locator('#map_choice').selectOption('quick');
    await page.locator('#allow_bots').check();
    await page.locator('label#red').click();
    await page.locator('#start_bots').click();

    await expect(page.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});
    await expect(page.locator('.user-gold')).toContainText('15');
    const territory = await page.evaluate(() => {
        const owned = circles.find((circle) => circle.owner === activePlayer);
        return {id: owned.country.id, units: owned.country.units};
    });
    const marker = page.locator('.svg-content > g.territory-marker[id="' + territory.id + '"]');

    for (let purchase = 1; purchase <= 4; purchase += 1) {
        await marker.click();
        await expect(page.locator('.user-gold')).toHaveText('Gold: ' + (15 - purchase * 3));
    }

    await marker.click();
    await expect(page.locator('.phase-message')).toContainText('Deploy');
    await expect(page.locator('#phase_img')).toHaveAttribute('src', '/img/game/icons/deploy.svg');
    await expect(marker.locator('text')).toHaveText(String(territory.units + 5));
});

test('rapid army purchases cannot overspend or drop unit updates', async ({page}) => {
    const roomName = await firstRoomName(page, 4);
    await page.context().addCookies([sessionCookie('verified@test.local')]);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await expect(page.locator('#map_choice')).toBeVisible();
    await page.locator('#map_choice').selectOption('original');
    await page.locator('#allow_bots').check();
    await page.locator('label#red').click();
    await page.locator('#start_bots').click();

    await expect(page.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});
    const startingGold = Number((await page.locator('.user-gold').innerText()).replace(/\D/g, ''));
    const purchaseCount = Math.floor(startingGold / 3);
    expect(purchaseCount).toBeGreaterThanOrEqual(10);
    const territory = await page.evaluate(() => {
        const owned = circles.find((circle) => circle.owner === activePlayer);
        return {id: owned.country.id, units: owned.country.units};
    });
    const marker = page.locator('.svg-content > g.territory-marker[id="' + territory.id + '"]');
    await marker.evaluate((group, count) => {
        for (let purchase = 0; purchase < count; purchase += 1) {
            group.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
        }
    }, purchaseCount);

    await expect(page.locator('.user-gold')).toHaveText('Gold: ' + (startingGold % 3), {timeout: 12000});
    await expect(marker.locator('text')).toHaveText(String(territory.units + purchaseCount), {timeout: 12000});
});

test('battle and tactical move forms submit the selected troop counts', async ({page}) => {
    const roomName = await firstRoomName(page);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await page.locator('label#red').click();
    await expect(page.locator('.territory-marker')).toHaveCount(33);
    await page.evaluate(() => {
        const from = mapData.countries[0];
        const to = mapData.countries[1];
        from.units = 4;
        to.units = 2;
        circles = [
            {country: from, color: 'red', owner: 0},
            {country: to, color: 'blue', owner: 1}
        ];
        activePlayer = 0;
        playerEnabled = true;
        window.__gameEvents = [];
        gameInfra.emit = (eventName, ...args) => window.__gameEvents.push([eventName, ...args]);
        phase = 'Battle';
        drawMap();
    });

    await page.locator('.territory-marker[id="0"]').click();
    await page.locator('.territory-marker[id="1"]').click();
    await expect(page.locator('#unit_bar')).toBeVisible();
    await page.locator('.add').click();
    await expect(page.locator('#unit_output')).toHaveValue('2');
    await page.locator('#send_units').click();
    await expect.poll(() => page.evaluate(() => window.__gameEvents[0])).toEqual(['battle', 0, 1, 1, 2]);

    await page.evaluate(() => {
        circles[1].owner = 0;
        phase = 'Tactical move';
        drawMap();
    });
    await page.locator('.territory-marker[id="0"]').click();
    await page.locator('.territory-marker[id="1"]').click();
    await expect(page.locator('#unit_bar')).toBeVisible();
    await page.locator('#unit_output').fill('2');
    await page.locator('#send_units').click();
    await expect.poll(() => page.evaluate(() => window.__gameEvents[1])).toEqual(['tactical_move', 0, 1, 0, 2]);
});

test('game room controls switch views, toggle chat, and send a room message', async ({page}) => {
    const roomName = await firstRoomName(page);
    await page.context().addCookies([sessionCookie('verified@test.local')]);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await expect(page.locator('#map_choice')).toBeVisible();
    await page.locator('#map_choice').selectOption('original');
    await page.locator('label#red').click();

    await page.locator('#mission').click();
    await expect(page.locator('.show-mission')).toBeVisible();
    await expect(page.locator('.phase-info')).toContainText('Mission will be generated');

    await page.locator('#show_gold').click();
    await expect(page.locator('.show-gold')).toContainText('europe');
    await expect(page.locator('.show-gold')).toContainText('africa');
    await page.locator('#show_gold').click();
    await expect(page.locator('.show-gold')).toHaveCount(0);

    await page.locator('.slide-toggle').click();
    await expect(page.locator('#chatroom')).toBeHidden();
    await expect.poll(() => page.locator('#game_board').evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(1280);
    await page.locator('.slide-toggle').click();
    await expect(page.locator('#chatroom')).toBeVisible();

    const message = 'room test ' + Date.now();
    await page.locator('#message').fill(message);
    await page.locator('#send').click();
    await expect(page.locator('#messages')).toContainText(message);
    await expect(page.locator('#messages .myMessage')).toContainText('Verified');
});

test('a guest can rejoin the same unranked seat after reconnecting', async ({page, browser}) => {
    const roomName = await firstRoomName(page);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await expect(page.locator('#map_choice')).toBeVisible();
    const guestId = await page.evaluate(() => localStorage.getItem('general_guest_id'));
    await page.locator('label#red').click();
    await expect(page.locator('#player_list .player-username').first()).toContainText('Guest-');
    await expect(page.locator('#player_list .player-points').first()).toHaveText('Unranked');
    const guestName = await page.locator('#player_list .player-username').first().innerText();

    const secondPage = await browser.newPage();
    try {
        await secondPage.goto('/game?room=' + encodeURIComponent(roomName));
        await expect(secondPage.locator('.popup')).toBeVisible();
        await secondPage.locator('label#blue').click();
        await expect(page.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});

        await page.reload();
        await expect.poll(() => page.locator('#player_list .player-username').allTextContents())
            .toContain(guestName);
        await expect.poll(() => page.evaluate(() => localStorage.getItem('general_guest_id'))).toBe(guestId);
        await expect(page.locator('#player_list .player-username')).toHaveCount(2);
        const rejoinedGuest = page.locator('#player_list .player-name').filter({hasText: guestName});
        await expect(rejoinedGuest).toHaveCount(1);
        await expect(rejoinedGuest.locator('.player-points')).toHaveText('Unranked');
    }
    finally {
        await secondPage.close();
    }
});

test('a guest keeps the seat after a dropped connection auto-reconnects', async ({page, browser}) => {
    const roomName = await firstRoomName(page);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await expect(page.locator('#map_choice')).toBeVisible();
    await page.locator('label#red').click();
    const guestName = await page.locator('#player_list .player-username').first().innerText();

    const secondPage = await browser.newPage();
    try {
        await secondPage.goto('/game?room=' + encodeURIComponent(roomName));
        await expect(secondPage.locator('.popup')).toBeVisible();
        await secondPage.locator('label#blue').click();
        await expect(page.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});

        await page.evaluate(() => gameInfra.io.engine.close());
        await page.waitForFunction(() => gameInfra.connected);

        await expect(page.locator('.disconnect-popup')).toHaveCount(0);
        await expect(page.locator('.user-gold')).toContainText(/[1-9]/);
        await expect.poll(() => secondPage.locator('#player_list .player-username').allTextContents())
            .toEqual(expect.arrayContaining([guestName]));
        await expect(secondPage.locator('#player_list .player-username')).toHaveCount(2);
    }
    finally {
        await secondPage.close();
    }
});

test('a lone guest can return to a bot match and the lobby keeps counting the bots', async ({page, browser}) => {
    const roomName = await firstRoomName(page, 3);
    const openThreeSeaterTables = () => page.locator('#allrooms tbody tr').filter({hasText: '0/3'}).filter({hasText: 'open'}).count();
    const openBefore = await openThreeSeaterTables();

    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await expect(page.locator('#map_choice')).toBeVisible();
    await page.locator('#allow_bots').check();
    await page.locator('label#red').click();
    await page.locator('#start_bots').click();
    await expect(page.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});

    const lobby = await browser.newPage();
    try {
        await lobby.goto('/lobby');
        await expect(lobbyRow(lobby, roomName)).toContainText('3/3');
        await expect(lobbyRow(lobby, roomName)).toContainText('game in progress');
        expect(await lobby.locator('#allrooms tbody tr').filter({hasText: '0/3'}).filter({hasText: 'open'}).count()).toBe(openBefore);

        await page.reload();
        await expect(page.locator('.phase-info')).toContainText('Welcome back');
        await expect(page.locator('.user-gold')).toContainText(/[1-9]/);
        await expect(page.locator('g circle[fill^="url(#radial_"]')).not.toHaveCount(0);
        await expect(page.locator('#start_bots')).toBeHidden();
        await expect(lobbyRow(lobby, roomName)).toContainText('3/3');
        await expect(page.locator('#player_list .player-name')).toHaveCount(3);
    }
    finally {
        await lobby.close();
    }
});

test('an abandoned bot match is removed after the grace period and the lobby keeps an open table', async ({page, browser}) => {
    const roomName = await firstRoomName(page, 3);
    const lobby = await browser.newPage();
    try {
        await page.goto('/game?room=' + encodeURIComponent(roomName));
        await expect(page.locator('#map_choice')).toBeVisible();
        await page.locator('#allow_bots').check();
        await page.locator('label#red').click();
        await page.locator('#start_bots').click();
        await expect(page.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});

        await lobby.goto('/lobby');
        await expect(lobbyRow(lobby, roomName)).toContainText('game in progress');
        await page.goto('about:blank');
        await expect(lobbyRow(lobby, roomName)).toHaveCount(0, {timeout: 10000});
        expect(await lobby.locator('#allrooms tbody tr').filter({hasText: '0/3'}).filter({hasText: 'open'}).count()).toBeGreaterThan(0);
    }
    finally {
        await lobby.close();
    }
});

test('legacy game board remains available on a mobile viewport', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    const roomName = await firstRoomName(page);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await expect(page.locator('#game_board')).toBeVisible();
    await expect(page.locator('#game_header')).toBeVisible();
    await expect(page.locator('.svg-content')).toBeVisible();
    const legacyStylesheetLoaded = await page.evaluate(() => Array.from(document.styleSheets)
        .some((stylesheet) => stylesheet.href && stylesheet.href.includes('/css/game.board.css')));
    expect(legacyStylesheetLoaded).toBe(true);
});

test('the rematch button is on screen when a match ends', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    const roomName = await firstRoomName(page);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await page.locator('#allow_bots').check();
    await page.locator('label#red').click();
    await page.locator('#start_bots').click();
    await expect(page.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});

    // A full match takes minutes, so deliver the server's end-of-match message directly.
    await page.evaluate(() => gameInfra.listeners('message').forEach((listener) => listener({type: 'game_over', message: 'Match complete.'})));
    const rematch = page.locator('#rematch-button');
    await expect(rematch).toBeVisible();
    await expect(rematch).toBeInViewport();
    await expect(page.locator('#rematch-panel')).toContainText('Match complete');
});

test('voting for a rematch closes the panel and starts the next match at the same table', async ({page}) => {
    test.setTimeout(120000);
    page.on('dialog', (dialog) => dialog.accept());
    const roomName = await firstRoomName(page);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await page.locator('#map_choice').selectOption('quick');
    await page.locator('#allow_bots').check();
    await page.locator('label#red').click();
    await page.locator('#start_bots').click();
    await expect(page.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});

    // Surrendering lets two bots finish the small map quickly instead of waiting for human turns.
    await page.locator('.surrender-flag').click();
    const rematch = page.locator('#rematch-button');
    await expect(rematch).toBeVisible({timeout: 90000});
    await rematch.click();

    await expect(page.locator('#rematch-panel')).toHaveCount(0);
    await expect(page.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});
});

test('lobby chat shows a sent message with its author', async ({page}) => {
    const text = 'hello from test ' + Date.now();
    await page.goto('/lobby');
    await page.locator('#message').fill(text);
    await page.locator('#send').click();
    const message = page.locator('#messages .new-message').filter({hasText: text});
    await expect(message).toHaveCount(1);
    await expect(message.locator('.name')).toContainText('Guest-');
});

test('redrawing the map clears a selected territory highlight', async ({page}) => {
    const roomName = await firstRoomName(page);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await page.locator('#allow_bots').check();
    await page.locator('label#red').click();
    await page.locator('#start_bots').click();
    await expect(page.locator('.phase-message')).toContainText('Everyone deploy', {timeout: 12000});

    const id = await page.evaluate(() => circles[0].country.id);
    const marker = page.locator('.svg-content > g.territory-marker').nth(id).locator('circle');
    await page.evaluate((territory) => markSelected(document.querySelectorAll('.svg-content > g.territory-marker')[territory], 'from'), id);
    await expect(marker).toHaveClass(/marker-from/);
    await page.evaluate(() => drawMap());
    await expect(marker).not.toHaveClass(/marker-from/);
});