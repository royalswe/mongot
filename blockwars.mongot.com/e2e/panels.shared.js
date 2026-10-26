'use strict';

const {expect} = require('@playwright/test');
const {quietFirstVisit, startLoneGame} = require('./helpers');

function definePanelTests(test) {
    test.beforeEach(async ({context}) => {
        await quietFirstVisit(context, {movementButtons: false});
        await context.addInitScript(() => {
            if (localStorage.getItem('touch-buttons') === null) { localStorage.setItem('touch-buttons', 'on'); }
        });
    });

    test('Ready is centered in the local arena and Settings stays in the left corner', async ({page}, testInfo) => {
        await page.goto(`/game?room=E2E-ready-center-${testInfo.project.name}-${Date.now()}&rank=no`);
        await page.locator('#take_seat').click();
        const ready = page.locator('#player_ready');
        await expect(ready).toBeVisible();
        const sizes = testInfo.project.name === 'desktop'
            ? [[1280, 800], [1920, 1080], [2560, 1440], [1024, 768]]
            : [[360, 800], [393, 851], [768, 600], [851, 393]];
        for (const [width, height] of sizes) {
            await page.setViewportSize({width, height});
            await page.evaluate(() => SCREEN.resizeContent());
            const arena = await page.locator('.arena.local').boundingBox();
            const button = await ready.boundingBox();
            expect(button.x + button.width / 2).toBeCloseTo(arena.x + arena.width / 2, 0);
            expect(button.y + button.height / 2).toBeCloseTo(arena.y + arena.height / 2, 0);
            const settings = await page.locator('.settings-wrapper').boundingBox();
            expect(settings.x).toBeLessThanOrEqual(8);
            expect(settings.y).toBeLessThanOrEqual(4);
        }
        await ready.click();
        await expect(ready).toBeHidden();
        await expect(page.locator('#game_log')).toContainText('The game has started!');
    });

    test('Take a seat is centered on screen and still seats the player', async ({page}, testInfo) => {
        await page.goto(`/game?room=E2E-seat-center-${testInfo.project.name}-${Date.now()}&rank=no`);
        const seat = page.getByRole('button', {name: 'Take a seat', exact: true});
        await expect(seat).toBeVisible();
        const sizes = testInfo.project.name === 'desktop'
            ? [[1280, 800], [1024, 768]]
            : [[360, 800], [393, 851], [768, 600], [851, 393]];
        for (const [width, height] of sizes) {
            await page.setViewportSize({width, height});
            const box = await seat.boundingBox();
            expect(box.x + box.width / 2, `${width}x${height}: horizontal center`).toBeCloseTo(width / 2, 0);
            expect(box.y + box.height / 2, `${width}x${height}: vertical center`).toBeCloseTo(height / 2, 0);
        }
        await seat.click();
        await expect(seat).toBeHidden();
        await expect(page.locator('.arena.local')).toBeVisible();
        await expect(page.locator('#player_ready')).toBeVisible();
    });

    test('chat stays separate from the game log and keeps drafts when collapsed', async ({page}, testInfo) => {
        const phone = testInfo.project.name !== 'desktop';
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await startLoneGame(page, `E2E-panels-${testInfo.project.name}-${Date.now()}`);
        if (phone) {
            await page.locator('#chat_toggle').click();
        }
        await page.locator('#message').fill('Unsent draft');
        await expect(page.getByRole('tab')).toHaveCount(0);
        await expect(page.locator('#game_log')).toContainText('The game has started!');
        await expect(page.locator('.game-description #game_log')).toHaveCount(1);
        await page.locator(phone ? '#chat_close' : '#panels_toggle').click();
        await expect(page.locator('#chat')).toBeHidden();
        await page.evaluate(() => {
            const entry = document.createElement('li');
            entry.textContent = 'New game event';
            writeToLog(entry);
            Chat.prototype.serverMessage({msg: 'Message while chat is hidden'});
        });
        await expect(page.locator('#game_log')).toContainText('New game event');
        if (phone) {
            await expect(page.locator('#chat_unread')).toHaveText('1');
            await expect(page.locator('#chat_toggle')).toBeFocused();
        }
        await page.keyboard.press('Control+c');
        await expect(page.locator('#message')).toBeFocused();
        await expect(page.locator('#chat')).toBeVisible();
        await expect(page.locator('#messages')).toContainText('Message while chat is hidden');
        await expect(page.locator('#message')).toHaveValue('Unsent draft');
        await expect(page.locator('#chat_unread')).toBeHidden();
        expect(errors).toEqual([]);
    });

    test('keyboard toggle shares the existing setting and remembers it on reload', async ({page}, testInfo) => {
        test.skip(testInfo.project.name === 'desktop', 'Desktop uses one shared panel toggle');
        await startLoneGame(page, `E2E-keys-panel-${testInfo.project.name}-${Date.now()}`);
        await expect(page.locator('#keyboard_toggle')).toHaveAttribute('aria-expanded', 'true');
        await page.locator('#keyboard_toggle').click();
        await expect(page.locator('section.keyboard')).toBeHidden();
        await expect(page.locator('#touch_buttons')).not.toBeChecked();
        await expect(page.locator('#keyboard_toggle')).toHaveAttribute('aria-expanded', 'false');
        await page.reload();
        await expect(page.locator('#keyboard_toggle')).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#touch_buttons')).not.toBeChecked();
        await page.locator('#keyboard_toggle').click();
        await expect(page.locator('#touch_buttons')).toBeChecked();
        await expect(page.locator('#keyboard_toggle')).toHaveAttribute('aria-expanded', 'true');
    });

    test('hiding panels gives the game boards more space', async ({page}, testInfo) => {
        test.skip(testInfo.project.name === 'desktop', 'Keep the original desktop board geometry');
        await startLoneGame(page, `E2E-panel-space-${testInfo.project.name}-${Date.now()}`);
        const phone = testInfo.project.name !== 'desktop';
        const landscape = phone && page.viewportSize().width > page.viewportSize().height;
        const board = page.locator(landscape ? '.arena:not(.local) canvas.tetris' : '.arena.local canvas.tetris').first();
        const before = await board.boundingBox();
        await page.locator('#keyboard_toggle').click();
        await expect.poll(async () => (await board.boundingBox()).height).toBeGreaterThan(before.height + 20);
        if (!landscape) {
            const after = await board.boundingBox();
            expect(after.y + after.height).toBeLessThanOrEqual(page.viewportSize().height);
        }
        await page.locator('#keyboard_toggle').click();
        await expect(page.locator('section.keyboard')).toBeVisible();
    });

    test('the phone header and boards fit at narrow and wide viewport sizes', async ({page}, testInfo) => {
        test.skip(testInfo.project.name === 'desktop', 'Keep the original desktop sizing');
        await startLoneGame(page, `E2E-panel-fit-${testInfo.project.name}-${Date.now()}`);
        const sizes = testInfo.project.name === 'desktop'
            ? [[769, 521], [1280, 800], [1920, 1080]]
            : [[320, 700], [393, 851], [851, 393]];
        for (const [width, height] of sizes) {
            await page.setViewportSize({width, height});
            await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
            for (const selector of ['#chat_toggle', '#keyboard_toggle', '.arena.local canvas.tetris']) {
                const box = await page.locator(selector).boundingBox();
                expect(box.x, selector).toBeGreaterThanOrEqual(0);
                expect(box.y, selector).toBeGreaterThanOrEqual(0);
                expect(box.x + box.width, selector).toBeLessThanOrEqual(width + 1);
                expect(box.y + box.height, selector).toBeLessThanOrEqual(height + 1);
            }
        }
    });

    test('desktop panel toggle preserves the board arrangement and grows boards when space permits', async ({page}, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'Desktop-only shared toggle');
        await startLoneGame(page, `E2E-desktop-panels-${Date.now()}`);
        await expect(page.locator('#chat_toggle')).toBeHidden();
        await expect(page.locator('#keyboard_toggle')).toBeHidden();
        await expect(page.locator('.chat-header')).toBeHidden();
        const toggle = page.locator('#bottom #panels_toggle');
        await expect(toggle).toHaveAccessibleName('Hide chat and keyboard');
        expect(await toggle.textContent()).toBe('');
        await expect(page.locator('#chat')).toBeVisible();
        await expect(page.locator('#keyboard')).toBeVisible();
        for (const [width, height] of [[1280, 800], [1920, 1080], [1024, 768], [800, 1000], [769, 521]]) {
            await page.setViewportSize({width, height});
            await page.evaluate(() => SCREEN.resizeContent());
            const boards = page.locator('.arena canvas.tetris');
            const before = await Promise.all((await boards.all()).map(board => board.boundingBox()));
            const originalWidth = await page.evaluate(() => document.documentElement.getBoundingClientRect().width);
            await toggle.click();
            await expect(page.locator('#chat')).toBeHidden();
            await expect(page.locator('#keyboard')).toBeHidden();
            await expect(toggle).toBeVisible();
            await expect(toggle).toHaveAccessibleName('Show chat and keyboard');
            for (let i = 0; i < before.length; i++) {
                if (originalWidth < width - 1 && width > height) {
                    await expect.poll(async () => (await boards.nth(i).boundingBox()).height).toBeGreaterThan(before[i].height + 10);
                } else {
                    await expect.poll(async () => (await boards.nth(i).boundingBox()).height).toBeCloseTo(before[i].height, 0);
                }
                const enlarged = await boards.nth(i).boundingBox();
                expect(enlarged.y + enlarged.height, `${width}x${height}`).toBeLessThanOrEqual(height);
            }
            const after = await Promise.all((await boards.all()).map(board => board.boundingBox()));
            const scale = after[2].width / before[2].width;
            for (let i = 0; i < after.length; i++) {
                expect(after[i].x - after[0].x, `${width}x${height}: horizontal arrangement`)
                    .toBeCloseTo((before[i].x - before[0].x) * scale, 0);
                expect(after[i].y - after[0].y, `${width}x${height}: vertical arrangement`)
                    .toBeCloseTo((before[i].y - before[0].y) * scale, 0);
            }
            await toggle.click();
            await expect(page.locator('#chat')).toBeVisible();
            await expect(page.locator('#keyboard')).toBeVisible();
            for (let i = 0; i < before.length; i++) {
                await expect.poll(async () => (await boards.nth(i).boundingBox()).height).toBeCloseTo(before[i].height, 0);
            }
        }
    });

    test('opponent boards never overlap at tablet and narrow viewport sizes', async ({page}, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'One viewport sweep covers all layouts');
        await startLoneGame(page, `E2E-tablet-fit-${Date.now()}`);
        for (const [width, height] of [[360, 799], [360, 800], [360, 801], [320, 900], [600, 960], [768, 1024], [768, 600], [740, 540], [1024, 768]]) {
            await page.setViewportSize({width, height});
            await page.evaluate(() => SCREEN.resizeContent());
            const boxes = await page.locator('.arena:not(.local) canvas.tetris').evaluateAll(canvases =>
                canvases.map(canvas => {
                    const {x, y, width, height} = canvas.getBoundingClientRect();
                    return {x, y, width, height};
                }));
            if (width <= 768 && width > height) {
                expect(new Set(boxes.map(box => Math.round(box.y))).size, `${width}x${height}: two opponent rows`).toBe(2);
            } else {
                expect(new Set(boxes.map(box => Math.round(box.y))).size, `${width}x${height}: one opponent row`).toBe(1);
            }
            for (const board of await page.locator('.arena canvas.tetris').all()) {
                const box = await board.boundingBox();
                expect(box.x, `${width}x${height}: board fits horizontally`).toBeGreaterThanOrEqual(0);
                expect(box.x + box.width, `${width}x${height}: board fits horizontally`).toBeLessThanOrEqual(width + 1);
                expect(box.y + box.height, `${width}x${height}: board fits vertically`).toBeLessThanOrEqual(height + 1);
                expect(box.width / box.height, `${width}x${height}: board aspect ratio`).toBeCloseTo(240 / 464, 2);
            }
            for (let i = 0; i < boxes.length; i++) {
                const a = boxes[i];
                expect(a.x, `${width}x${height}`).toBeGreaterThanOrEqual(0);
                expect(a.x + a.width, `${width}x${height}`).toBeLessThanOrEqual(width + 1);
                for (const b of boxes.slice(i + 1)) {
                    const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
                    const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
                    expect(Math.min(overlapX, overlapY), `${width}x${height}: overlapping opponents`).toBeLessThanOrEqual(0);
                }
            }
        }
    });

    test('the local frame contains the board, next piece and specials only when space permits', async ({page}, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'One viewport sweep covers responsive framing');
        await startLoneGame(page, `E2E-frame-fit-${Date.now()}`);
        for (const [width, height, framed] of [
            [393, 851, true], [600, 960, true], [768, 1024, true], [768, 600, true],
            [740, 540, true], [320, 700, false], [375, 600, false], [851, 393, false], [393, 700, false]
        ]) {
            await page.setViewportSize({width, height});
            const arena = page.locator('.arena.local');
            const background = await arena.evaluate(element => getComputedStyle(element).backgroundImage);
            expect(background !== 'none', `${width}x${height}: frame visibility`).toBe(framed);
            const frame = await arena.boundingBox();
            if (framed) {
                for (const selector of ['canvas.tetris', 'canvas.next-block', '.special-tube']) {
                    const box = await arena.locator(selector).boundingBox();
                    expect(box.x, `${width}x${height}: ${selector}`).toBeGreaterThanOrEqual(frame.x);
                    expect(box.y, `${width}x${height}: ${selector}`).toBeGreaterThanOrEqual(frame.y);
                    expect(box.x + box.width, `${width}x${height}: ${selector}`).toBeLessThanOrEqual(frame.x + frame.width + 1);
                    expect(box.y + box.height, `${width}x${height}: ${selector}`).toBeLessThanOrEqual(frame.y + frame.height + 1);
                }
            }
            const board = await arena.locator('canvas.tetris').boundingBox();
            expect(board.width / board.height).toBeCloseTo(240 / 464, 2);
            expect(frame.x).toBeGreaterThanOrEqual(0);
            expect(frame.x + frame.width).toBeLessThanOrEqual(width + 1);
            expect(frame.y + frame.height).toBeLessThanOrEqual(height + 1);
        }
        await page.locator('#keyboard_toggle').click();
        await expect(page.locator('.arena.local')).not.toHaveCSS('background-image', 'none');
        await page.evaluate(() => THEME.set('flat'));
        await expect(page.locator('.arena.local')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await page.evaluate(() => {
            const overlay = document.createElement('span');
            overlay.className = 'gameover loser';
            document.querySelector('.arena.local').appendChild(overlay);
            LAYOUT.setGameRunning(true);
        });
        await expect(page.locator('body')).toHaveClass(/tile-mode/);
        await expect(page.locator('.arena.local')).toHaveCSS('background-image', 'none');
        await expect(page.locator('.arena.local')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    });
}

module.exports = {definePanelTests};
