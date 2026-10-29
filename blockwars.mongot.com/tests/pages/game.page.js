'use strict';

const {expect} = require('@playwright/test');

class GamePage {
    constructor(page) {
        this.page = page;
        this.seat = page.getByRole('button', {name: 'Take a seat', exact: true});
        this.ready = page.getByRole('button', {name: 'Click when ready!', exact: true});
        this.settings = page.getByRole('button', {name: 'Settings', exact: true});
        this.controls = page.getByRole('dialog', {name: 'Controls', exact: true});
        this.guide = page.getByRole('dialog', {name: 'How to play'});
        this.chatInput = page.getByRole('textbox', {name: 'Chat message'});
        this.messages = page.getByRole('log');
        this.queue = page.getByRole('button', {name: 'Use your next Special on yourself'});
        // Canvas boards, the event list and panel containers have no accessible roles.
        this.log = page.locator('#game_log');
        this.board = page.locator('.arena.local canvas.tetris');
        this.boards = page.locator('.arena canvas.tetris');
        this.opponents = page.locator('.arena:not(.local) canvas.tetris');
        this.nextPiece = page.locator('canvas.next-block');
        this.queueIcons = this.queue.locator('img');
        this.keyboard = page.locator('section.keyboard');
        this.chat = page.locator('#chat');
        this.unread = page.locator('#chat_unread');
    }

    async goto(room, ranking = 'no') {
        await this.page.goto(`/game?${new URLSearchParams({room, rank: ranking})}`);
    }

    async takeSeat() {
        await this.seat.click();
        await expect(this.ready).toBeVisible();
    }

    async start(room) {
        await this.goto(room);
        await this.takeSeat();
        await this.ready.click();
        await this.expectStarted();
    }

    async expectStarted() {
        await expect(this.log).toContainText('The game has started!');
    }

    async openSettings(name) {
        await this.settings.click();
        await this.page.getByRole('button', {name, exact: true}).click();
    }

    async sendChat(message) {
        await this.chatInput.fill(message);
        await this.chatInput.press('Enter');
        await expect(this.chatInput).toHaveValue('');
        await expect(this.messages).toContainText(message);
    }

    target(name) {
        return this.page.getByRole('button', {name: `Send your next Special to ${name}`});
    }

    // Canvas gameplay has no DOM state. Capture the real Block without replacing its behavior.
    async captureBlock(key = 'ArrowLeft') {
        const captured = await this.page.evaluate(() => {
            if (window.__block) { return true; }
            const move = Block.prototype.move;
            Block.prototype.move = function (direction) {
                window.__block = this;
                Block.prototype.move = move;
                return move.call(this, direction);
            };
            return false;
        });
        if (captured) { return; }
        await this.page.keyboard.press(key);
        await this.page.waitForFunction(() => window.__block);
    }

    async position() {
        return this.page.evaluate(() => ({...window.__block.pos}));
    }

    async rotation() {
        return this.page.evaluate(() => window.__block.matrix);
    }

    async useRotatablePiece() {
        await this.captureBlock();
        await this.page.evaluate(() => {
            window.__block.matrix = [[0, 1, 0], [1, 1, 1], [0, 0, 0]];
        });
    }

    async settledCells() {
        return this.page.evaluate(() => window.__block.arena.matrix.flat().filter(Boolean).length);
    }

    async collectSpecial(id) {
        await this.captureBlock();
        await this.page.evaluate(special => window.__block.arena.events.emit('special', 'add-special', [special]), id);
        await expect(this.queueIcons).not.toHaveCount(0);
    }

    async clearRows(count) {
        await this.captureBlock();
        await this.page.evaluate(rows => {
            const arena = window.__block.arena;
            for (let i = 1; i <= rows; i++) { arena.matrix[arena.matrix.length - i].fill(1); }
            arena.sweepRow(() => {});
        }, count);
    }

    async stackUntilLost() {
        await this.captureBlock();
        for (let drop = 0; drop < 40; drop++) {
            if (await this.page.locator('.arena.local .gameover').count()) { break; }
            await this.page.keyboard.press('Space');
        }
        await expect(this.page.locator('.arena.local .gameover')).toBeVisible();
    }
}

module.exports = {GamePage};
