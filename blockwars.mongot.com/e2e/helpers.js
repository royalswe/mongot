'use strict';

let roomCounter = 0;
const uniqueRoom = label => `E2E-${label}-${Date.now()}-${roomCounter++}`;

// Shared by the specs: a first-time visitor gets a rules popup over the page, so mark it as read.
// Touch screens hide the movement buttons by default, so specs that press them ask for them.
async function quietFirstVisit(context, {movementButtons = true, hint = false, theme = null} = {}) {
    await context.addInitScript(({movementButtons, hint, theme}) => {
        localStorage.setItem('rule-read', 'true');
        localStorage.setItem('toggle-sound', 'off');
        if (theme) { localStorage.setItem('theme', theme); }
        if (movementButtons) { localStorage.setItem('touch-buttons', 'on'); }
        if (!hint) { localStorage.setItem('touch-hint-seen', 'yes'); }
    }, {movementButtons, hint, theme});
}

// A guest alone in an unranked room, seated and ready, so the game starts at once.
async function startLoneGame(page, room) {
    const {expect} = require('@playwright/test');
    await page.goto(`/game?room=${room}&rank=no`);
    await expect(page.locator('#take_seat')).toBeVisible();
    await page.locator('#take_seat').click();
    await expect(page.locator('#player_ready')).toBeVisible();
    await page.locator('#player_ready').click();
    await expect(page.locator('#game_log')).toContainText('The game has started!');
}

// Talks to the game socket directly, without a browser.
async function connectSocket(baseURL) {
    const {expect} = require('@playwright/test');
    const WebSocket = require('ws');
    const socket = new WebSocket(baseURL.replace('http', 'ws') + '/game', {headers: {origin: baseURL}});
    const messages = [];
    socket.on('message', data => messages.push(JSON.parse(data)));
    await new Promise((resolve, reject) => { socket.on('open', resolve); socket.on('error', reject); });
    return {
        send: message => socket.send(JSON.stringify(message)),
        next: type => expect.poll(() => messages.find(m => m.type === type), {message: `no ${type} message`}).toBeTruthy()
            .then(() => messages.find(m => m.type === type)),
        close: () => socket.close()
    };
}

// You (a guest) and a rival seated and ready in an unranked room, the game started.
// Returns the rival's socket, so a spec can see what you send them.
async function gameWithRival(page, baseURL, room) {
    const {expect} = require('@playwright/test');
    await page.goto(`/game?room=${room}&rank=no`);
    await expect(page.locator('#take_seat')).toBeVisible();
    await page.locator('#take_seat').click();
    await expect(page.locator('#player_ready')).toBeVisible();

    const rival = await connectSocket(baseURL);
    rival.send({type: 'enter-room', user: {username: 'Rival', points_bw: null}, name: room, ranking: 'no'});
    await rival.next('enter-room');
    rival.send({type: 'take-seat', state: {arena: {matrix: []}, block: {matrix: [], pos: {x: 0, y: 0}}}});
    await rival.next('take-seat');

    await page.locator('#player_ready').click();
    rival.send({type: 'player-ready'});
    await expect(page.locator('#game_log')).toContainText('The game has started!');
    return rival;
}

// Lets the page get hold of the local player's Block (as window.__block) by moving it once.
async function grabBlock(page) {
    await page.evaluate(() => {
        if (window.__block) { return; }
        const move = Block.prototype.move;
        Block.prototype.move = function (direction) { window.__block = this; return move.call(this, direction); };
    });
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => window.__block);
}

// Collects a Special for you through the server, as if you had cleared a row with it.
async function collectSpecial(page, special) {
    await grabBlock(page);
    await page.evaluate((id) => window.__block.arena.events.emit('special', 'add-special', [id]), special);
}

module.exports = {uniqueRoom: uniqueRoom, quietFirstVisit: quietFirstVisit, startLoneGame: startLoneGame,
    connectSocket: connectSocket, gameWithRival: gameWithRival, grabBlock: grabBlock, collectSpecial: collectSpecial};
