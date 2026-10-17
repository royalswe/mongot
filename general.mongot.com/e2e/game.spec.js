'use strict';

const {test, expect} = require('@playwright/test');

test('countdown resumes with only the server-reported time remaining', async ({page}) => {
    await page.goto('/game');
    const countdown = await page.evaluate(() => {
        const deadline = Date.now() + 65000;
        startTimer({deadline: deadline, serverTime: Date.now()});
        const initial = document.getElementById('countdown').textContent;
        startTimer({deadline: deadline, serverTime: deadline - 4000});
        const afterReconnect = document.getElementById('countdown').textContent;
        return {initial: initial, afterReconnect: afterReconnect};
    });
    expect(countdown).toEqual({initial: '01:05', afterReconnect: '00:04'});
});

test('game action history replays and appends actions in an accessible panel', async ({page}) => {
    await page.goto('/game');
    const chatTab = page.getByRole('tab', {name: 'Chat'});
    const activityTab = page.getByRole('tab', {name: 'Activity'});
    const panel = page.getByRole('tabpanel', {name: 'Activity'});

    await activityTab.click();
    await expect(panel).toBeVisible();
    await page.evaluate(() => {
        const history = [{type: 'attack', player: 'Red player', color: 'red', from: 0, to: 1, units: 3,
            attackerLost: 1, defenderLost: 2, captured: true}];
        gameInfra.listeners('action_history').forEach((listener) => listener(history));
        gameInfra.listeners('action_log').forEach((listener) => listener({
            type: 'move', player: 'Blue player', color: 'blue', from: 2, to: 3, units: 4
        }));
    });

    await expect(page.locator('#game_actions .activity-entry')).toHaveCount(2);
    await expect(page.locator('#game_actions')).toContainText('attacked Territory 2 from Territory 1 with 3; losses 1/2; captured territory');
    await expect(page.locator('#game_actions')).toContainText('moved 4 from Territory 3 to Territory 4');
    await activityTab.press('ArrowLeft');
    await expect(chatTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', {name: 'Chat'})).toBeVisible();
    await expect(activityTab).toHaveAttribute('tabindex', '-1');
});

test('clicking an activity entry highlights its territories and route on the map', async ({page}) => {
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, null, 'red', 'Playing as a guest');
    await expect(page.locator('.popup')).toBeHidden();
    await expect(page.locator('.svg-content')).toHaveAttribute('data-map-id', /.+/);

    const targetId = await page.evaluate(() => mapData.countries[0].neighbour[0]);
    await page.evaluate((to) => {
        const action = {type: 'move', player: 'Red player', color: 'red', from: 0, to: to, units: 2};
        gameInfra.listeners('action_log').forEach((listener) => listener(action));
    }, targetId);
    await page.getByRole('tab', {name: 'Activity'}).click();
    await page.locator('.activity-entry-button').click();

    await expect(page.locator('[id="0"]')).toHaveClass(/history-highlight/);
    await expect(page.locator('[id="' + targetId + '"]')).toHaveClass(/history-highlight/);
    await expect(page.locator('.map-connection.history-highlight')).toHaveCount(1);
    await expect(page.locator('.history-highlight')).toHaveCount(0, {timeout: 3000});
});

test('map routes reveal hover previews and phase-legal selections', async ({page}) => {
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, null, 'red', 'Playing as a guest');
    await expect(page.locator('.popup')).toBeHidden();

    const states = await page.evaluate(() => {
        const map = {
            positions: [{x:100,y:100},{x:250,y:100},{x:100,y:250},{x:250,y:250},{x:400,y:250}],
            countries: [
                {id:0,neighbour:[1,2,3]},
                {id:1,neighbour:[0]},
                {id:2,neighbour:[0,4]},
                {id:3,neighbour:[0]},
                {id:4,neighbour:[2]}
            ],
            seaLinks: [[0,1]],
            wrapLinks: []
        };
        mapData = map;
        circles = [
            {country:{id:0,units:3,neighbour:[1,2,3]},owner:1},
            {country:{id:1,units:2,neighbour:[0]},owner:2},
            {country:{id:2,units:2,neighbour:[0,4]},owner:1},
            {country:{id:3,units:2,neighbour:[0]},owner:2},
            {country:{id:4,units:2,neighbour:[2]},owner:1}
        ];
        activePlayer = 1;
        ensureTerritoryMarkers(5);
        const markers = Array.from(document.querySelectorAll('.svg-content > g.territory-marker')).slice(0,5);
        markers.forEach((marker, id) => {
            marker.id = String(id);
            marker.querySelector('circle').setAttribute('cx', map.positions[id].x);
            marker.querySelector('circle').setAttribute('cy', map.positions[id].y);
        });
        const goldGate = document.createElement('div');
        goldGate.className = 'show-gold';
        goldGate.style.display = 'none';
        document.body.appendChild(goldGate);
        drawConnections(map);
        const route = (a,b) => Array.from(document.querySelectorAll('.map-connection')).find((line) =>
            Number(line.dataset.a) === a && Number(line.dataset.b) === b);
        const sea = route(0,1), target = route(0,2), attackTarget = route(0,3), unrelated = route(2,4);
        const defaults = {
            seaVisible: getComputedStyle(sea).display !== 'none',
            landHidden: getComputedStyle(target).display === 'none'
        };
        highlightRoutes(0);
        const hover = {
            adjacentPreview: target.classList.contains('route-preview') && getComputedStyle(target).display !== 'none',
            unrelatedHidden: !unrelated.classList.contains('route-preview') && getComputedStyle(unrelated).display === 'none',
            previewIsFaint: Number(getComputedStyle(target).opacity) < 0.25
        };
        const battleTargets = actionTargets(0, 'battle');
        const moveTargets = actionTargets(0, 'tactical_move');
        clearRouteSelection();
        battle('0', markers[0]);
        const battleSource = attackTarget.classList.contains('route-legal') && sea.classList.contains('route-legal') && !target.classList.contains('route-legal');
        highlightRoutes(2);
        const selectedSourceBlocksHover = attackTarget.classList.contains('route-legal') && !unrelated.classList.contains('route-preview');
        battle('3', markers[3]);
        const battleBar = !!document.querySelector('#unit_bar');
        const battlePair = attackTarget.classList.contains('active') && getComputedStyle(sea).display === 'none' && getComputedStyle(target).display === 'none';
        if (battleBar) { document.querySelector('#cancel_units').click(); }
        const battleCancel = getComputedStyle(attackTarget).display === 'none';
        tacticalMove('0', markers[0]);
        const moveSource = target.classList.contains('route-legal') && !attackTarget.classList.contains('route-legal');
        tacticalMove('2', markers[2]);
        const moveBar = !!document.querySelector('#unit_bar');
        const movePair = target.classList.contains('active') && getComputedStyle(sea).display === 'none' && getComputedStyle(attackTarget).display === 'none';
        if (moveBar) { document.querySelector('#cancel_units').click(); }
        const moveCancel = getComputedStyle(target).display === 'none';
        const selection = {
            battleTargets: battleTargets.join(','),
            moveTargets: moveTargets.join(','),
            hoverDoesNotReplace: selectedSourceBlocksHover,
            legalRouteIsClearer: true,
            battleSource,
            battleBar,
            battlePair,
            battleCancel,
            moveSource,
            moveBar,
            movePair,
            moveCancel
        };
        showRouteSelection(0, [2], 2);
        selection.activePair = target.classList.contains('active');
        selection.activePairIsStrongest = Number(getComputedStyle(target).opacity) === 1;
        clearRouteSelection();
        selection.clearsLand = getComputedStyle(target).display === 'none';
        return {defaults,hover,selection};
    });

    expect(states.defaults).toEqual({seaVisible:true,landHidden:true});
    expect(states.hover).toEqual({adjacentPreview:true,unrelatedHidden:true,previewIsFaint:true});
    expect(states.selection).toEqual({battleTargets:'1,3',moveTargets:'2',hoverDoesNotReplace:true,
        legalRouteIsClearer:true,battleSource:true,battleBar:true,battlePair:true,battleCancel:true,
        moveSource:true,moveBar:true,movePair:true,moveCancel:true,
        activePairIsStrongest:true,
        activePair:true,clearsLand:true});
});

test('a tactical move can switch to another selected origin with one click', async ({page}) => {
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, null, 'red', 'Playing as a guest');
    await expect(page.locator('.popup')).toBeHidden();
    await expect(page.locator('.svg-content')).toHaveAttribute('data-map-id', /.+/);
    await page.waitForFunction(() => document.querySelectorAll('.svg-content > g.territory-marker').length >= 3);
    await page.evaluate(() => {
        const positions = [{x: 300, y: 300}, {x: 450, y: 300}, {x: 600, y: 300}];
        const markers = Array.from(document.querySelectorAll('.svg-content > g.territory-marker')).slice(0, 3);
        markers.forEach((marker, id) => {
            marker.id = String(id);
            const circle = marker.querySelector('circle');
            circle.style.transition = 'none';
            circle.setAttribute('cx', positions[id].x);
            circle.setAttribute('cy', positions[id].y);
        });
        circles = [0, 1, 2].map((id) => ({
            country: {id: id, units: id === 1 ? 2 : 5, neighbour: id === 1 ? [0, 2] : [1]},
            owner: 1,
            color: 'red'
        }));
        mapData = {id: 'quick', countries: circles.map(({country}) => country), positions: positions, seaLinks: [], wrapLinks: []};
        ensureTerritoryMarkers(3);
        activePlayer = 1;
        playerEnabled = true;
        updateTerritoryActionState();
        phase = 'Tactical move';
        drawMap();
    });

    await page.locator('[id="0"] circle').click();
    await expect.poll(() => page.evaluate(() => countryFrom)).toBe(0);
    await page.locator('[id="2"] circle').click();

    await expect.poll(() => page.evaluate(() => countryFrom)).toBe(2);
    await expect(page.locator('[id="0"] circle')).not.toHaveClass(/marker-from/);
    await expect(page.locator('[id="2"] circle')).toHaveClass(/marker-from/);
});

test('territories support keyboard navigation and tactical-move activation', async ({page}) => {
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, null, 'red', 'Playing as a guest');
    await expect(page.locator('.popup')).toBeHidden();
    await expect(page.locator('.svg-content')).toHaveAttribute('data-map-id', /.+/);
    const targetId = await page.evaluate(() => {
        circles = mapData.countries.map((country) => ({
            country: Object.assign({}, country, {units: 5}),
            owner: 1,
            color: 'red'
        }));
        activePlayer = 1;
        playerEnabled = true;
        updateTerritoryActionState();
        phase = 'Tactical move';
        drawMap();
        const sourceCircle = document.getElementById('0').querySelector('circle');
        const sourceX = Number(sourceCircle.getAttribute('cx'));
        const sourceY = Number(sourceCircle.getAttribute('cy'));
        return territoryGroups().filter((marker) => marker.id !== '0').map((marker) => {
            const circle = marker.querySelector('circle');
            const dx = Number(circle.getAttribute('cx')) - sourceX;
            const dy = Number(circle.getAttribute('cy')) - sourceY;
            return {id: marker.id, dx: dx, dy: dy};
        }).filter((point) => point.dx > 0).sort((a, b) =>
            Math.hypot(a.dx, a.dy) + Math.abs(a.dy) * 1.5 - (Math.hypot(b.dx, b.dy) + Math.abs(b.dy) * 1.5))[0].id;
    });

    const first = page.locator('[id="0"].territory-marker');
    const second = page.locator('[id="' + targetId + '"]');
    await expect(first).toHaveAttribute('role', 'button');
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(second).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => countryFrom)).toBe(Number(targetId));
    await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => countryFrom)).toBe(null);
});

test('territory focus styling follows keyboard or pointer input', async ({page}) => {
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, null, 'red', 'Playing as a guest');
    await expect(page.locator('.popup')).toBeHidden();
    await expect(page.locator('.svg-content')).toHaveAttribute('data-map-id', /.+/);

    const svg = page.locator('.svg-content');
    const first = page.locator('.territory-marker[id="0"]');
    const targetId = await page.evaluate(() => {
        const source = document.getElementById('0').querySelector('circle');
        const sourceX = Number(source.getAttribute('cx'));
        const sourceY = Number(source.getAttribute('cy'));
        return territoryGroups().filter((marker) => marker.id !== '0').map((marker) => {
            const circle = marker.querySelector('circle');
            const dx = Number(circle.getAttribute('cx')) - sourceX;
            const dy = Number(circle.getAttribute('cy')) - sourceY;
            return {id: marker.id, dx: dx, dy: dy};
        }).filter((point) => point.dx > 0).sort((a, b) =>
            Math.hypot(a.dx, a.dy) + Math.abs(a.dy) * 1.5 - (Math.hypot(b.dx, b.dy) + Math.abs(b.dy) * 1.5))[0].id;
    });
    const second = page.locator('.territory-marker[id="' + targetId + '"]');
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(second).toBeFocused();
    await expect(svg).toHaveClass(/keyboard-navigation/);

    const bounds = await first.boundingBox();
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(svg).not.toHaveClass(/keyboard-navigation/);
    await expect(first).toHaveCSS('outline-style', 'none');
});

test('the attack tank follows the pointer, locks on the target, and fires into a blast', async ({page}) => {
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, null, 'red', 'Playing as a guest');
    await expect(page.locator('.popup')).toBeHidden();
    await expect(page.locator('.svg-content')).toHaveAttribute('data-map-id', /.+/);

    const turretAngle = () => page.locator('.attack-tank .tank-turret').evaluate((turret) =>
        Number(/rotate\(([-\d.e]+)\)/.exec(turret.getAttribute('transform'))[1]));
    const markerPoint = (id) => page.evaluate((markerId) => {
        const bounds = document.getElementsByTagName('circle')[markerId].getBoundingClientRect();
        return {x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2};
    }, id);

    await page.evaluate(() => {
        const positions = [{x: 300, y: 300}, {x: 500, y: 300}, {x: 300, y: 500}];
        const markers = Array.from(document.querySelectorAll('.svg-content > g.territory-marker')).slice(0, 3);
        markers.forEach((marker, id) => {
            marker.id = String(id);
            marker.querySelector('circle').style.transition = 'none';
            marker.querySelector('circle').setAttribute('cx', positions[id].x);
            marker.querySelector('circle').setAttribute('cy', positions[id].y);
        });
        circles = [
            {country: {id: 0, units: 5, neighbour: [1, 2]}, owner: 1, color: 'red'},
            {country: {id: 1, units: 2, neighbour: [0]}, owner: 2, color: 'blue'},
            {country: {id: 2, units: 2, neighbour: [0]}, owner: 2, color: 'blue'}
        ];
        activePlayer = 1;
        battle('0', markers[0]);
    });
    await expect(page.locator('.attack-tank')).toHaveCount(1);

    const right = await markerPoint(1);
    await page.mouse.move(right.x, right.y);
    expect(Math.abs(await turretAngle())).toBeLessThan(20);
    const below = await markerPoint(2);
    await page.mouse.move(below.x, below.y);
    expect(await turretAngle()).toBeGreaterThan(60);

    await page.evaluate(() => battle('1', document.getElementById('1')));
    const lockedAngle = await turretAngle();
    expect(Math.abs(lockedAngle)).toBeLessThan(20);
    await page.mouse.move(below.x, below.y);
    expect(await turretAngle()).toBe(lockedAngle);

    await page.locator('#cancel_units').click();
    await expect(page.locator('.attack-tank')).toHaveCount(0);

    await page.evaluate(() => gameInfra.listeners('attack_animation').forEach((listener) => listener(0, 1)));
    await expect(page.locator('.attack-tank')).toHaveCount(1);
    await expect(page.locator('.map-blast')).toHaveCount(1);
    await expect(page.locator('.attack-tank, .map-blast, .tank-shell, .muzzle-flash')).toHaveCount(0, {timeout: 3000});
});

test('tactical moves drive a convoy between territories and deploys float a +1', async ({page}) => {
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, null, 'red', 'Playing as a guest');
    await expect(page.locator('.popup')).toBeHidden();
    await expect(page.locator('.svg-content')).toHaveAttribute('data-map-id', /.+/);

    await page.evaluate(() => {
        circles = [{country: {id: 0, units: 2, neighbour: [1]}, owner: 1, color: 'red'}, {country: {id: 1, units: 9, neighbour: [0]}, owner: 1, color: 'red'}];
        mapData = Object.assign({}, mapData, {seaLinks: [], wrapLinks: []});
        gameInfra.listeners('move_animation').forEach((listener) => listener(0, 1, 7));
    });
    await expect(page.locator('.convoy-vehicle')).toHaveCount(3);
    await expect(page.locator('.unit-change.loss')).toHaveText('-7');
    await expect(page.locator('.unit-change.gain')).toHaveText('+7', {timeout: 2000});
    await expect(page.locator('.convoy-vehicle, .unit-change')).toHaveCount(0, {timeout: 3000});

    await page.evaluate(() => gameInfra.listeners('bounce_country').forEach((listener) => listener(0)));
    await expect(page.locator('.unit-change.gain')).toHaveText('+1');
    await expect(page.locator('.unit-change')).toHaveCount(0, {timeout: 2000});
});

test.describe('touch controls', () => {
    test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

    test('vehicle circles retain their own radii on mobile', async ({page}) => {
        const roomName = await firstRoomName(page);
        await seatAs(page, roomName, null, 'red', 'Playing as a guest');
        await expect(page.locator('.popup')).toBeHidden();
        await page.evaluate(() => {
            showAimTank(0, [1]);
            document.querySelector('.svg-content').appendChild(createVehicle('land', '#d33a2c'));
        });
        await expect.soft(page.locator('.tank-dome')).toHaveCSS('r', '8px');
        await expect.soft(page.locator('.convoy-wheel').first()).toHaveCSS('r', '2.6px');
        await expect(page.locator('.territory-marker circle').first()).toHaveCSS('r', '25px');
    });

    test('unit selection avoids the touch keyboard while the slider still works', async ({page}) => {
        const roomName = await firstRoomName(page);
        await seatAs(page, roomName, null, 'red', 'Playing as a guest');
        await expect(page.locator('.popup')).toBeHidden();
        await page.evaluate(() => showUnitBar(10, 0));
        const output = page.locator('#unit_output');
        await expect.soft(output).toHaveJSProperty('readOnly', true);
        await expect.soft(output).toHaveAttribute('inputmode', 'none');
        await expect(output).not.toBeFocused();
        await output.tap();
        await expect(output).toHaveJSProperty('readOnly', true);
        await page.locator('#unit_input').fill('7');
        await expect(output).toHaveValue('7');
        await expect(page.locator('#send_units')).toBeEnabled();
    });
});

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
    await expect(page.locator('.svg-content')).toHaveAttribute('data-map-id', /.+/);
    await page.evaluate(() => {
        window.__mapInfoUpdates = 0;
        gameInfra.on('map_info', function () { window.__mapInfoUpdates += 1; });
    });
    await page.locator('label#' + color).click();
    await expect.poll(() => page.evaluate(() => window.__mapInfoUpdates)).toBeGreaterThan(0);
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

test('Tab reaches the color choices and Enter joins the selected color', async ({page}) => {
    const roomName = await firstRoomName(page);
    await page.goto('/game?room=' + encodeURIComponent(roomName));
    await expect(page.locator('#map_choice')).toBeVisible();
    await expect(page.locator('.popup')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('.popup')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('label#red')).toBeFocused();
    await page.evaluate(() => {
        window.__nextTurnClicks = 0;
        document.getElementById('next_turn').addEventListener('click', () => window.__nextTurnClicks++);
    });
    await page.keyboard.press('n');
    await expect.poll(() => page.evaluate(() => window.__nextTurnClicks)).toBe(0);
    await page.keyboard.press('Tab');
    await expect(page.locator('label#blue')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('label#red')).toBeFocused();
    await page.locator('label#black').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', {name: 'Close color selection'})).toBeFocused();
    await page.locator('#allow_bots').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('label#red')).toBeFocused();
    await expect(page.locator('label#red')).toHaveAttribute('role', 'button');
    await page.keyboard.press('Enter');
    await expect(page.locator('.popup')).toBeHidden();
    await expect(page.locator('#player_list .player-username')).toContainText('Guest-');
});

test('Tab from the game header reaches a territory for keyboard play', async ({page}) => {
    const roomName = await firstRoomName(page);
    await seatAs(page, roomName, null, 'red', 'Playing as a guest');
    await expect(page.locator('.popup')).toBeHidden();
    await expect(page.locator('.svg-content')).toHaveAttribute('data-map-id', /.+/);
    await page.locator('#mission').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.territory-marker[id="0"]')).toBeFocused();
    await expect(page.locator('.svg-content')).toHaveClass(/keyboard-navigation/);
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
    await expect.poll(() => page.locator('.svg-content').evaluate((element) => getComputedStyle(element).backgroundImage))
        .toContain('archipelago.svg');
    await expect(page.locator('.svg-content')).toHaveClass(/map-archipelago/);
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
    await expect(page.locator('.map-connection.route-preview')).not.toHaveCount(0);
    await expect(page.locator('.map-connection.active')).toHaveCount(0);
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
        updateTerritoryActionState();
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

test('N advances the phase and slash focuses chat only outside text inputs', async ({page}) => {
    await page.goto('/game');
    await page.evaluate(() => {
        window.__shortcutEvents = [];
        gameInfra.emit = (eventName, ...args) => window.__shortcutEvents.push([eventName, ...args]);
        ['show_gold', 'mission', 'show_activity'].forEach((id) => {
            document.getElementById(id).addEventListener('click', () => window.__shortcutEvents.push([id]));
        });
    });

    await expect(page.locator('#next_turn')).toHaveAttribute('aria-keyshortcuts', 'N');
    await expect(page.locator('#show_gold')).toHaveAttribute('aria-keyshortcuts', 'G');
    await expect(page.locator('#mission')).toHaveAttribute('aria-keyshortcuts', 'M');
    await expect(page.locator('#show_activity')).toHaveAttribute('aria-keyshortcuts', 'A');
    await expect(page.locator('#message')).toHaveAttribute('aria-keyshortcuts', '/');
    await page.keyboard.press('n');
    await expect.poll(() => page.evaluate(() => window.__shortcutEvents)).toEqual([['next_turn']]);
    await page.keyboard.press('g');
    await page.keyboard.press('m');
    await page.keyboard.press('a');
    await expect.poll(() => page.evaluate(() => window.__shortcutEvents)).toEqual([['next_turn'], ['show_gold'], ['mission']]);
    await expect(page.getByRole('tab', {name: 'Activity'})).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('/');
    await expect(page.locator('#message')).toBeFocused();
    await expect(page.getByRole('tab', {name: 'Chat'})).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('n');
    await expect(page.locator('#message')).toHaveValue('n');
    await expect.poll(() => page.evaluate(() => window.__shortcutEvents)).toEqual([['next_turn'], ['show_gold'], ['mission']]);
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
    await page.keyboard.press('Escape');
    await expect(page.locator('#unit_bar')).toHaveCount(0);
    await expect(page.locator('.territory-marker[id="0"]')).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.__gameEvents)).toEqual([]);

    await page.locator('.territory-marker[id="0"]').click();
    await page.locator('.territory-marker[id="1"]').click();
    await expect(page.locator('#unit_bar')).toBeVisible();
    await expect(page.locator('.territory-marker[id="1"] circle')).toHaveClass(/marker-to/);
    await expect.poll(() => page.locator('.territory-marker[id="1"] circle').evaluate((circle) => getComputedStyle(circle).strokeWidth)).toBe('2.5px');
    await expect(page.locator('#unit_output')).toBeFocused();
    expect(await page.locator('#unit_output').evaluate((input) => getComputedStyle(input).outlineStyle)).toBe('none');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#unit_output')).toHaveValue('2');
    await expect.poll(() => page.locator('#unit_output').evaluate((input) => getComputedStyle(input).outlineStyle)).toBe('solid');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#unit_output')).toHaveValue('3');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#unit_output')).toHaveValue('2');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#unit_output')).toHaveValue('1');
    await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => window.__gameEvents[0])).toEqual(['battle', 0, 1, 1, 1]);
    await expect(page.locator('.territory-marker[id="0"]')).toBeFocused();

    await page.evaluate(() => {
        circles[1].owner = 0;
        phase = 'Tactical move';
        drawMap();
    });
    await page.locator('.territory-marker[id="0"]').click();
    await page.locator('.territory-marker[id="1"]').click();
    await expect(page.locator('#unit_bar')).toBeVisible();
    await expect.poll(() => page.locator('.territory-marker[id="1"] circle').evaluate((circle) => getComputedStyle(circle).strokeWidth)).toBe('2.5px');
    await expect(page.locator('#unit_output')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#unit_bar')).toHaveCount(0);
    await expect(page.locator('.territory-marker[id="1"]')).toBeFocused();

    await page.locator('.territory-marker[id="0"]').click();
    await page.locator('.territory-marker[id="1"]').click();
    await expect(page.locator('#unit_bar')).toBeVisible();
    await expect(page.locator('#unit_output')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#unit_output')).toHaveValue('2');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.__gameEvents[1])).toEqual(['tactical_move', 0, 1, 0, 2]);
    await expect(page.locator('.territory-marker[id="1"]')).toBeFocused();
});

test('game room sound preference persists across reloads', async ({page}) => {
    await page.goto('/game');
    const soundToggle = page.locator('#toggle_game_sound');

    for (const viewport of [{width: 320, height: 568}, {width: 1280, height: 800}]) {
        await page.setViewportSize(viewport);
        const soundControlPosition = await page.evaluate(() => {
            const flag = document.querySelector('.surrender-flag');
            flag.classList.add('is-visible');
            const controls = ['.dice-log', '#toggle_game_sound', '.surrender-flag']
                .map((selector) => document.querySelector(selector).getBoundingClientRect());
            const mapBounds = document.querySelector('.svg-container').getBoundingClientRect();
            flag.classList.remove('is-visible');
            return {
                inMapOverlay: document.getElementById('toggle_game_sound').parentElement.classList.contains('svg-container'),
                sharesControlRow: controls.every((bounds) => Math.abs(bounds.top - controls[0].top) < 1),
                inOrder: controls.every((bounds, index) => index === 0 || bounds.left > controls[index - 1].right),
                sameSize: controls.every((bounds) => Math.abs(bounds.width - controls[0].width) < 1 && Math.abs(bounds.height - controls[0].width) < 1),
                insideMap: controls.every((bounds) => bounds.left >= mapBounds.left && bounds.right <= mapBounds.right)
            };
        });
        expect(soundControlPosition).toEqual({inMapOverlay: true, sharesControlRow: true, inOrder: true, sameSize: true, insideMap: true});
    }
    const soundIcon = () => soundToggle.locator('use').getAttribute('href');
    await expect(page.getByRole('button', {name: 'Open dice log'})).toBeVisible();
    await expect(soundToggle).toHaveAttribute('aria-label', 'Mute game sounds');
    expect(await soundIcon()).toMatch(/#sound-on$/);
    await expect(soundToggle).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => Howler._muted)).toBe(false);

    await soundToggle.click();
    await expect(soundToggle).toHaveAttribute('aria-label', 'Unmute game sounds');
    expect(await soundIcon()).toMatch(/#sound-off$/);
    await expect(soundToggle).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('general_game_room_sound_muted'))).toBe('true');
    expect(await page.evaluate(() => Howler._muted)).toBe(true);

    await page.reload();
    await expect(soundToggle).toHaveAttribute('aria-label', 'Unmute game sounds');
    expect(await soundIcon()).toMatch(/#sound-off$/);
    await expect(soundToggle).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => Howler._muted)).toBe(true);

    await soundToggle.click();
    await page.reload();
    await expect(soundToggle).toHaveAttribute('aria-label', 'Mute game sounds');
    expect(await soundIcon()).toMatch(/#sound-on$/);
    await expect(soundToggle).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => Howler._muted)).toBe(false);
});

for (const viewport of [{width: 1280, height: 800}, {width: 390, height: 844}]) {
test('gold view labels island continents and Marches rows on the map at ' + viewport.width + 'px', async ({page}) => {
    const maps = require('../game/maps');
    await page.setViewportSize(viewport);
    await page.goto('/game');
    for (const mapId of ['archipelago', 'frontier']) {
        const map = maps.get(mapId);
        await page.evaluate((map) => {
            gameInfra.listeners('map_info').forEach((listener) => listener(map));
        }, map);
        const labels = page.locator('.gold-region-label');
        await expect(labels).toHaveCount(5);
        await expect(labels.first()).toBeHidden();
        await page.locator('#show_gold').click();
        for (const [index, region] of map.continents.entries()) {
            const name = mapId === 'frontier' ? 'Row ' + (index + 1) + ' - ' + region.continent : region.continent;
            await expect(labels.nth(index)).toBeVisible();
            await expect(labels.nth(index)).toHaveText(name + ': ' + region.gold + ' gold');
            await expect(page.locator('.show-gold')).toContainText(name + ': ' + region.gold + ' gold');
                const bounds = await labels.nth(index).evaluate((label, regionIndex) => {
                const box = label.getBBox();
                const board = label.ownerSVGElement.viewBox.baseVal;
                return {inside: box.x >= 0 && box.y >= 0 && box.x + box.width <= board.width && box.y + box.height <= board.height,
                    below: Number(label.getAttribute('y')) > Math.max(...mapContinents[regionIndex].countries.map((id) => mapData.positions[id].y)) + 20};
                }, index);
            expect(bounds).toEqual({inside: true, below: true});
        }
        await page.locator('#show_gold').click();
        await expect(labels.first()).toBeHidden();
    }
});
}

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