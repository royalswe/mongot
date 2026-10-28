'use strict';

const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const {quietFirstVisit, startLoneGame, uniqueRoom} = require('./helpers');

test.beforeEach(async ({context}) => { await quietFirstVisit(context); });

const chatFiles = ['gameChat.json', 'blockwarChat.json'].map(filename => path.resolve(__dirname, '..', filename));
let originalChat;
test.beforeAll(() => { originalChat = chatFiles.map(filename => fs.readFileSync(filename)); });
test.afterAll(() => {
    chatFiles.forEach((filename, index) => {
        expect(fs.readFileSync(filename).equals(originalChat[index]), `Chat tests changed ${path.basename(filename)}`).toBe(true);
    });
});

async function openControls(page) {
    await page.locator('#settings_toggle').click();
    await page.getByRole('button', {name: 'Controls', exact: true}).click();
}

test('modern-only keys honor saved bindings and default gameplay controls', async ({page, context}) => {
    await context.addInitScript(() => localStorage.setItem('KEY_BINDS', JSON.stringify({
        moveLeft: 65, moveRight: 39, moveDown: 40, hardDrop: 32, rotRight: 38,
        rotLeft: 90, special1: 49, special2: 50, special3: 51, special4: 52, special5: 53
    })));
    await startLoneGame(page, uniqueRoom('modern-keys'));
    await page.evaluate(() => {
        window.__actions = [];
        for (const method of ['move', 'rotate', 'softDrop', 'hardDrop']) {
            Block.prototype[method] = function (...args) { window.__actions.push([method, ...args]); };
        }
        Special.prototype.useSpecial = function (key) { window.__actions.push(['special', key]); };
        for (const [key, code] of [
            ['a', 'KeyQ'], ['ArrowRight', 'ArrowRight'], ['ArrowUp', 'ArrowUp'],
            ['z', 'KeyZ'], ['ArrowDown', 'ArrowDown'], [' ', 'Space'],
            ['1', 'Digit1'], ['@', 'Digit2'], ['3', 'Digit3'], ['4', 'Digit4'], ['5', 'Digit5']
        ]) {
            for (const type of ['keydown', 'keyup']) {
                document.dispatchEvent(new KeyboardEvent(type, {key, code, bubbles: true}));
            }
        }
    });
    expect(await page.evaluate(() => window.__actions)).toEqual([
        ['move', -1], ['move', 1], ['rotate', 1], ['rotate', -1],
        ['softDrop', true], ['softDrop', false], ['hardDrop'],
        ['special', 49], ['special', 50], ['special', 51], ['special', 52], ['special', 53]
    ]);
});

test('modern keyboard release clears held movement state', async ({page, context}) => {
    await context.addInitScript(() => {
        localStorage.setItem('handling', JSON.stringify({das: 30, arr: 100}));
    });
    await startLoneGame(page, uniqueRoom('held-modern-key'));
    await page.evaluate(() => {
        const move = Block.prototype.move;
        Block.prototype.move = function (direction) {
            window.__heldBlock = this;
            return move.call(this, direction);
        };
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', code: 'ArrowLeft'}));
    });
    expect(await page.evaluate(() => window.__heldBlock.shift.direction)).toBe(-1);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keyup', {key: 'ArrowLeft', code: 'ArrowLeft'})));
    expect(await page.evaluate(() => window.__heldBlock.shift.direction)).toBe(0);
});

test('with keyboard repeat on, each repeated keydown moves the block once', async ({page, context}) => {
    await context.addInitScript(() => {
        localStorage.setItem('handling', JSON.stringify({osRepeat: true, das: 0, arr: 0}));
    });
    await startLoneGame(page, uniqueRoom('os-repeat'));
    await page.evaluate(() => {
        window.__moves = 0;
        const move = Block.prototype.move;
        Block.prototype.move = function (direction) { window.__moves++; return move.call(this, direction); };
        for (let i = 0; i < 3; i++) {
            document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', code: 'ArrowRight', repeat: i > 0}));
        }
    });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__moves)).toBe(3);
});

test('holding a direction auto shifts to the wall and ghost piece shows the landing row', async ({page, context}) => {
    await context.addInitScript(() => {
        localStorage.setItem('handling', JSON.stringify({das: 50, arr: 0, ghost: true}));
    });
    await startLoneGame(page, uniqueRoom('auto-shift'));
    await page.evaluate(() => {
        const draw = Tetris.prototype.drawGhost;
        window.__ghosts = 0;
        Tetris.prototype.drawGhost = function () { window.__ghostBlock = this.block; window.__ghosts++; return draw.call(this); };
    });
    await expect.poll(() => page.evaluate(() => window.__ghosts)).toBeGreaterThan(0);
    await page.keyboard.down('ArrowLeft');
    await expect.poll(() => page.evaluate(() => {
        const block = window.__ghostBlock;
        return block.matrix.some(row => row[-block.pos.x] > 0);
    })).toBe(true);
    await page.keyboard.up('ArrowLeft');
    expect(await page.evaluate(() => window.__ghostBlock.landingY())).toBeGreaterThan(await page.evaluate(() => window.__ghostBlock.pos.y));
});

test('rebinding persists numeric values, removes duplicates and survives reload', async ({page}) => {
    await page.goto(`/game?room=${uniqueRoom('rebind')}&rank=no`);
    await openControls(page);
    await page.locator('#moveLeft').click();
    await page.keyboard.press('a');
    await expect(page.locator('#moveLeft')).toHaveText('A');
    await page.locator('#moveRight').click();
    await page.keyboard.press('a');
    await expect(page.locator('#moveRight')).toHaveText('A');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('KEY_BINDS')))).toMatchObject({moveRight: 65});
    expect(await page.evaluate(() => 'moveLeft' in JSON.parse(localStorage.getItem('KEY_BINDS')))).toBe(false);
    await page.getByRole('button', {name: 'Close Controls'}).click();
    await page.reload();
    await openControls(page);
    await expect(page.locator('#moveRight')).toHaveText('A');
    await page.locator('#moveRight').click();
    await page.locator('#moveRight').dispatchEvent('keyup', {key: 'Unidentified', code: '', keyCode: 0});
    await expect(page.locator('#moveRight')).toHaveText('Unsupported key; try another');
    await page.getByRole('button', {name: 'Close Controls'}).click();
    await expect(page.locator('#moveRight')).toHaveText('A');
});

test('modern Ctrl+C toggles chat focus and Space does not hard drop while typing', async ({page}) => {
    await startLoneGame(page, uniqueRoom('chat-focus'));
    await page.evaluate(() => {
        window.__drops = 0;
        Block.prototype.hardDrop = function () { window.__drops++; };
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'c', code: 'KeyC', ctrlKey: true}));
    });
    await expect(page.locator('#message')).toBeFocused();
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.__drops)).toBe(0);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {key: 'C', code: 'KeyC', ctrlKey: true})));
    await expect(page.locator('#message')).not.toBeFocused();
});

for (const location of ['lobby', 'game']) {
    test(`Enter sends ${location} chat, but composing Enter does not`, async ({page}) => {
        await page.goto(location === 'lobby' ? '/lobby' : `/game?room=${uniqueRoom('chat-enter')}&rank=no`);
        const message = `keyboard-chat-${location}`;
        await page.locator('#message').fill(message);
        await page.locator('#message').dispatchEvent('keydown', {key: 'Enter', code: 'Enter', isComposing: true});
        await expect(page.locator('#message')).toHaveValue(message);
        await page.keyboard.press('Enter');
        await expect(page.locator('#message')).toHaveValue('');
        await expect(page.locator('#messages')).toContainText(message);
    });
}
