'use strict';

const {test, expect} = require('../../fixtures/game.fixture');
const {uniqueRoom} = require('../../utils/browser-state');
const {expectOnScreen, expectTapTarget} = require('../../utils/layout');

test.describe('Phone layout and panels', () => {
    test('boards and controls fit without scrolling across representative phone sizes', async ({game, page}) => {
        await game.goto(uniqueRoom('layout'));
        await expectTapTarget(game.seat);
        await game.takeSeat();
        await expectTapTarget(game.ready);
        await game.ready.click();
        await game.expectStarted();
        const portrait = page.viewportSize().height > page.viewportSize().width;
        const sizes = portrait ? [[320, 700], [393, 851], [430, 900]] : [[640, 360], [851, 393], [915, 412]];
        for (const [width, height] of sizes) {
            await page.setViewportSize({width, height});
            await expect.poll(() => page.evaluate(() => ({
                x: document.documentElement.scrollWidth - innerWidth,
                y: document.documentElement.scrollHeight - innerHeight
            }))).toEqual({x: 0, y: 0});
            for (const locator of [game.boards, game.nextPiece, game.queue, game.keyboard.getByRole('button')]) {
                await expectOnScreen(locator);
            }
            const local = await game.board.boundingBox();
            const opponents = await game.opponents.all();
            for (const opponent of opponents) {
                const box = await opponent.boundingBox();
                expect(local.height / box.height, `${width}x${height}: local board is larger`).toBeGreaterThanOrEqual(1.4);
            }
            const boxes = await Promise.all(opponents.map(opponent => opponent.boundingBox()));
            for (let i = 0; i < boxes.length; i++) {
                for (const b of boxes.slice(i + 1)) {
                    const a = boxes[i];
                    const overlap = Math.min(
                        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
                        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
                    );
                    expect(overlap, `${width}x${height}: opponents do not overlap`).toBeLessThanOrEqual(0);
                }
            }
        }
    });

    test('chat drawer preserves drafts and counts real arrivals while closed', async ({game, page, sockets}) => {
        const room = uniqueRoom('drawer');
        await game.start(room);
        await expect(game.chat).toBeHidden();
        await page.getByRole('button', {name: 'Show chat', exact: true}).tap();
        await game.chatInput.fill('Unsent draft');
        await page.getByRole('button', {name: 'Close chat', exact: true}).tap();
        const visitor = await sockets();
        visitor.send({type: 'enter-room', user: 'guest', name: room, ranking: 'no'});
        await visitor.next('enter-room');
        await expect(game.unread).toHaveText('1');
        await page.getByRole('button', {name: 'Show chat', exact: true}).tap();
        await expect(game.messages).toContainText('joined the room');
        await expect(game.chatInput).toHaveValue('Unsent draft');
        await expect(game.unread).toBeHidden();
    });

    test('hiding the keyboard frees board space and persists after reload', async ({game, page}) => {
        await game.start(uniqueRoom('panels'));
        const portrait = page.viewportSize().height > page.viewportSize().width;
        const board = portrait ? game.board : game.opponents.first();
        const before = await board.boundingBox();
        await page.getByRole('button', {name: 'Hide keyboard', exact: true}).tap();
        await expect(game.keyboard).toBeHidden();
        await expect.poll(async () => (await board.boundingBox()).height).toBeGreaterThan(before.height + 20);
        await page.reload();
        await expect(page.getByRole('button', {name: 'Show keyboard', exact: true})).toBeVisible();
        await game.takeSeat();
        await expect(game.keyboard).toBeHidden();
        await page.getByRole('button', {name: 'Show keyboard', exact: true}).tap();
        await expect(game.keyboard).toBeVisible();
    });

    test('spectators can enlarge a board and return to the tile view', async ({game, page, sockets}) => {
        const room = uniqueRoom('spectator');
        const rival = await sockets();
        await rival.join(room);
        await game.goto(room);
        await expect(game.boards).toHaveCount(5);
        await expect(game.keyboard).toBeHidden();
        const board = game.boards.first();
        const before = await board.boundingBox();
        await board.tap();
        await expect.poll(async () => (await board.boundingBox()).width).toBeGreaterThan(before.width * 1.8);
        await board.tap({position: {x: 10, y: 10}});
        await expect.poll(async () => (await board.boundingBox()).width).toBeCloseTo(before.width, 0);
    });

    test('an eliminated player sees tiles until the remaining players finish', async ({game, page, sockets}) => {
        const room = uniqueRoom('elimination');
        await game.goto(room);
        await game.takeSeat();
        const rivals = [];
        for (const name of ['Rival1', 'Rival2', 'Rival3']) {
            const rival = await sockets();
            await rival.join(room, name);
            rivals.push(rival);
        }
        await game.ready.click();
        rivals.forEach(rival => rival.send({type: 'player-ready'}));
        await game.expectStarted();
        await game.stackUntilLost();
        await expect(page.locator('body')).toHaveClass(/tile-mode/);
        await expect(game.keyboard).toBeHidden();
        rivals[0].send({type: 'state-lost'});
        rivals[1].send({type: 'state-lost'});
        await expect(game.log).toContainText('won the game!');
        await expect(page.locator('body')).not.toHaveClass(/tile-mode/);
    });
});
