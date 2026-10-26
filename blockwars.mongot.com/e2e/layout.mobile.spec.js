'use strict';

const {test, expect} = require('@playwright/test');
const {quietFirstVisit, startLoneGame, connectSocket, uniqueRoom} = require('./helpers');

const isPortrait = page => page.viewportSize().height > page.viewportSize().width;
const emptyState = {arena: {matrix: []}, block: {matrix: [], pos: {x: 0, y: 0}}};

async function shot(page, testInfo, name) {
    await testInfo.attach(name, {body: await page.screenshot(), contentType: 'image/png'});
}

async function expectOnScreen(page, locator) {
    const {width, height} = page.viewportSize();
    for (const element of await locator.all()) {
        const box = await element.boundingBox();
        expect(box, 'element is not rendered').not.toBeNull();
        expect(box.x).toBeGreaterThanOrEqual(-0.5);
        expect(box.y).toBeGreaterThanOrEqual(-0.5);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
        expect(box.y + box.height).toBeLessThanOrEqual(height + 0.5);
    }
}

async function expectTapTarget(locator) {
    for (const element of await locator.all()) {
        const box = await element.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(43.5);
        expect(box.height).toBeGreaterThanOrEqual(43.5);
    }
}

// Gives the specs the falling block, and through it the local Special queue.
async function watchBlock(page) {
    await page.evaluate(() => {
        const move = Block.prototype.move;
        Block.prototype.move = function (direction) { window.__block = this; return move.call(this, direction); };
    });
    await page.locator('[id="37"]').tap();
}

test.beforeEach(async ({context}) => { await quietFirstVisit(context); });

test('the page itself never scrolls', async ({page}, testInfo) => {
    await startLoneGame(page, uniqueRoom('noscroll'));

    const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - window.innerWidth,
        y: document.documentElement.scrollHeight - window.innerHeight
    }));
    expect(overflow.x).toBeLessThanOrEqual(1);
    expect(overflow.y).toBeLessThanOrEqual(1);
    await shot(page, testInfo, 'playing');
});

test('your Arena, next piece, Special queue and controls fit on screen', async ({page}) => {
    await startLoneGame(page, uniqueRoom('fit'));

    for (const selector of ['.arena.local canvas.tetris', 'canvas.next-block', '.special-tube', '.keyboard .keyboard-col', '#chat_toggle']) {
        await expectOnScreen(page, page.locator(selector));
    }
});

test('buttons and keys are big enough to tap', async ({page}) => {
    await page.goto(`/game?room=${uniqueRoom('tap-size')}&rank=no`);
    await expect(page.locator('#take_seat')).toBeVisible();
    await expectTapTarget(page.locator('#take_seat'));
    await page.locator('#take_seat').tap();
    await expect(page.locator('#player_ready')).toBeVisible();
    await expectTapTarget(page.locator('#player_ready'));

    await expectTapTarget(page.locator('.keyboard .keyboard-col'));
    await expectTapTarget(page.locator('#chat_toggle'));
    await page.locator('#chat_toggle').tap();
    await expectTapTarget(page.locator('#chat_close'));
});

test('opponents sit above your Arena in portrait and beside it in landscape', async ({page}) => {
    await startLoneGame(page, uniqueRoom('opponents'));

    const local = await page.locator('.arena.local').boundingBox();
    const opponents = await page.locator('.arena:not(.local)').all();
    expect(opponents).toHaveLength(4);
    for (const opponent of opponents) {
        const box = await opponent.boundingBox();
        if (isPortrait(page)) {
            expect(box.y + box.height).toBeLessThanOrEqual(local.y + 0.5);
        } else {
            expect(box.x).toBeGreaterThanOrEqual(local.x + local.width - 0.5);
        }
    }
});

test('the Special that will be sent next comes first in the queue and is outlined', async ({page}, testInfo) => {
    await startLoneGame(page, uniqueRoom('queue'));
    await watchBlock(page);
    await page.evaluate(() => window.__block.tetris.special.updateSpecials({specials: [8, 9, 10]}));

    const icons = await page.locator('.arena.local .specials img').all();
    expect(icons).toHaveLength(3);
    const boxes = await Promise.all(icons.map(icon => icon.boundingBox()));
    const horizontal = await page.locator('.arena.local .specials').evaluate(element =>
        getComputedStyle(element).flexDirection === 'row-reverse');
    const axis = horizontal ? 'x' : 'y';
    // The server sends the first Special collected: it is the last one added, so the last in the DOM.
    const order = boxes.map((box, index) => ({index, position: box[axis]}));
    const nextToSend = order.find(item => item.index === 2);
    if (horizontal) {
        expect(nextToSend.position).toBe(Math.min(...order.map(item => item.position)));
    } else {
        expect(nextToSend.position).toBe(Math.max(...order.map(item => item.position)));
    }
    await expect(icons[2]).toHaveCSS('outline-style', 'solid');
    await expect(icons[0]).toHaveCSS('outline-style', 'none');
    await shot(page, testInfo, 'queue');
});

test('chat is a drawer that shows how many messages were missed', async ({page}, testInfo, ) => {
    const room = uniqueRoom('drawer');
    await page.goto(`/game?room=${room}&rank=no`);
    await expect(page.locator('#chat')).toBeHidden();
    await expect(page.locator('#chat_unread')).toBeHidden();

    // Someone entering the Room adds a server message to the chat.
    const visitor = await connectSocket(testInfo.project.use.baseURL || 'http://localhost:5283');
    visitor.send({type: 'enter-room', user: 'guest', name: room, ranking: 'no'});
    await expect(page.locator('#chat_unread')).toHaveText('1');

    await page.locator('#chat_toggle').tap();
    await expect(page.locator('#chat')).toBeVisible();
    await expect(page.locator('#chat_unread')).toBeHidden();
    await expect(page.locator('#messages')).toContainText('joined the room');
    await shot(page, testInfo, 'chat-open');

    await page.locator('#chat_close').tap();
    await expect(page.locator('#chat')).toBeHidden();
    visitor.close();
});

test('game log entries show as short toasts', async ({page}) => {
    await startLoneGame(page, uniqueRoom('toast'));

    await page.evaluate(() => {
        const entry = document.createElement('li');
        entry.textContent = 'Bob > Earthquake > You';
        writeToLog(entry);
    });

    await expect(page.locator('#toasts .toast', {hasText: 'Bob > Earthquake > You'})).toBeVisible();
    await expect(page.locator('#toasts .toast', {hasText: 'Bob > Earthquake > You'})).toHaveCount(0, {timeout: 6000});
});

test('a Spectator sees every Arena as a tile and can enlarge one', async ({page, baseURL}, testInfo) => {
    const room = uniqueRoom('tiles');
    const player = await connectSocket(baseURL);
    player.send({type: 'enter-room', user: {username: 'Tiler', points_bw: null}, name: room, ranking: 'no'});
    await player.next('enter-room');
    player.send({type: 'take-seat', state: emptyState});
    await player.next('take-seat');

    await page.goto(`/game?room=${room}&rank=no`);
    await expect(page.locator('#arena_container .arena.closed')).toHaveCount(1);

    const arenas = page.locator('#arena_container > .arena');
    await expect(arenas).toHaveCount(5);
    const boxes = await Promise.all((await arenas.all()).map(arena => arena.boundingBox()));
    const rows = new Set(boxes.map(box => Math.round(box.y)));
    expect(rows.size).toBe(isPortrait(page) ? 2 : 1);
    await expect(page.locator('section.keyboard')).toBeHidden();
    await shot(page, testInfo, 'tiles');

    await arenas.first().tap();
    const enlarged = await arenas.first().boundingBox();
    expect(enlarged.width).toBeGreaterThan(boxes[0].width * 1.8);
    await arenas.first().tap({position: {x: 10, y: 10}});
    expect((await arenas.first().boundingBox()).width).toBeCloseTo(boxes[0].width, 0);
    player.close();
});

test('a Player whose Arena is dead gets the tiles until the Game ends', async ({page}) => {
    await startLoneGame(page, uniqueRoom('dead'));
    await expect(page.locator('section.keyboard')).toBeVisible();
    const alive = await page.locator('.arena.local canvas.tetris').boundingBox();

    await page.evaluate(() => {
        const dead = document.createElement('span');
        dead.className = 'gameover loser';
        document.querySelector('.arena.local').appendChild(dead);
    });

    await expect(page.locator('section.keyboard')).toBeHidden();
    const tile = await page.locator('.arena.local canvas.tetris').boundingBox();
    const opponent = await page.locator('.arena:not(.local) canvas.tetris').first().boundingBox();
    expect(Math.abs(tile.width - opponent.width)).toBeLessThanOrEqual(1);
    expect(tile.width).not.toBeCloseTo(alive.width, 0);
});

test('a passing game over overlay does not flash the tile layout', async ({page}) => {
    await startLoneGame(page, uniqueRoom('flash'));
    await page.evaluate(() => {
        window.__tileSeen = false;
        new MutationObserver(() => {
            if (document.body.classList.contains('tile-mode')) { window.__tileSeen = true; }
        }).observe(document.body, {attributes: true, attributeFilter: ['class']});

        const overlay = document.createElement('span');
        overlay.className = 'gameover loser';
        document.querySelector('.arena.local').appendChild(overlay);
        setTimeout(() => overlay.remove(), 600);
    });

    await page.waitForTimeout(2000);

    expect(await page.evaluate(() => window.__tileSeen)).toBe(false);
    await expect(page.locator('section.keyboard')).toBeVisible();
});

// Records whether the tile layout ever showed, however briefly.
const watchTileMode = page => page.evaluate(() => {
    window.__tileSeen = false;
    new MutationObserver(() => {
        if (document.body.classList.contains('tile-mode')) { window.__tileSeen = true; }
    }).observe(document.body, {attributes: true, attributeFilter: ['class']});
});

async function stackUntilDead(page) {
    for (let drop = 0; drop < 40; drop++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(60);
    }
}

test('dying when that ends the Game does not flip the layout', async ({page}) => {
    await startLoneGame(page, uniqueRoom('dies-alone'));
    await watchTileMode(page);

    await stackUntilDead(page);

    await expect(page.locator('#game_log')).toContainText('won the game!');
    await page.waitForTimeout(2000);
    expect(await page.evaluate(() => window.__tileSeen)).toBe(false);
});

test('a Player who died while the Game goes on sees tiles until the Game ends', async ({page, baseURL}) => {
    const room = uniqueRoom('dies-early');
    await page.goto(`/game?room=${room}&rank=no`);
    await page.locator('#take_seat').tap();
    await expect(page.locator('#player_ready')).toBeVisible();

    const rivals = [];
    for (const name of ['Rival1', 'Rival2', 'Rival3']) {
        const rival = await connectSocket(baseURL);
        rival.send({type: 'enter-room', user: {username: name, points_bw: null}, name: room, ranking: 'no'});
        await rival.next('enter-room');
        rival.send({type: 'take-seat', state: emptyState});
        await rival.next('take-seat');
        rivals.push(rival);
    }
    await page.locator('#player_ready').tap();
    rivals.forEach(rival => rival.send({type: 'player-ready'}));
    await expect(page.locator('#game_log')).toContainText('The game has started!');

    await stackUntilDead(page);
    await expect(page.locator('.arena.local .gameover.loser')).toHaveCount(1);
    await expect(page.locator('body')).toHaveClass(/tile-mode/);

    rivals[0].send({type: 'state-lost'});
    await expect(page.locator('body')).toHaveClass(/tile-mode/); // two rivals are still playing
    rivals[1].send({type: 'state-lost'});

    await expect(page.locator('#game_log')).toContainText('won the game!');
    await expect(page.locator('body')).not.toHaveClass(/tile-mode/, {timeout: 1000});
    await expect(page.locator('.arena.local .gameover.loser')).toHaveCount(1); // the text is still showing
    rivals.forEach(rival => rival.close());
});

test('the old desktop page sizing does not squeeze the phone layout', async ({page}) => {
    await startLoneGame(page, uniqueRoom('width'));
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(1200); // the old code also ran again a second after each resize

    expect(await page.evaluate(() => document.documentElement.style.width)).toBe('');
    const {width} = page.viewportSize();
    const container = await page.locator('#arena_container').boundingBox();
    expect(container.width).toBeGreaterThanOrEqual(width - 60);
});

test('z and up sit on the arrow row so the controls take two lines', async ({page}) => {
    await startLoneGame(page, uniqueRoom('keys'));

    const key = async id => page.locator(`[id="${id}"]`).boundingBox();
    const [z, up, space, left, down, right] = await Promise.all([90, 38, 32, 37, 40, 39].map(key));
    for (const box of [z, up, space, left, down, right]) {
        expect(Math.abs(box.y - down.y)).toBeLessThanOrEqual(1);
    }
    expect(Math.max(z.x, up.x)).toBeLessThan(Math.min(space.x, left.x, down.x, right.x));

    const specials = await key(49);
    expect(specials.y + specials.height).toBeLessThanOrEqual(down.y);
    const keyboard = await page.locator('section.keyboard').boundingBox();
    expect(keyboard.height).toBeLessThanOrEqual(2 * 44 + 6 + 1);
});

const SIZES = {
    portrait: [[360, 560], [375, 600], [390, 664], [412, 839], [430, 900]],
    landscape: [[640, 360], [740, 360], [844, 390], [915, 412]]
};

test('your Arena stays clearly bigger than the opponents on small and large phones', async ({page}) => {
    await startLoneGame(page, uniqueRoom('sizes'));
    const sizes = isPortrait(page) ? SIZES.portrait : SIZES.landscape;

    for (const [width, height] of sizes) {
        await page.setViewportSize(isPortrait(page) ? {width, height} : {width, height});
        await expect.poll(async () => {
            const local = await page.locator('.arena.local canvas.tetris').boundingBox();
            const opponent = await page.locator('.arena:not(.local) canvas.tetris').first().boundingBox();
            return local.height / opponent.height;
        }, {message: `${width}x${height}`}).toBeGreaterThanOrEqual(1.4);

        await expectOnScreen(page, page.locator('.arena.local canvas.tetris'));
        await expectOnScreen(page, page.locator('.keyboard .keyboard-col'));
        const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
        expect(overflow, `${width}x${height}`).toBeLessThanOrEqual(1);
    }
});
