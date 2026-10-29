'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {test, expect} = require('../../fixtures/game.fixture');
const {LobbyPage} = require('../../pages/lobby.page');
const {GamePage} = require('../../pages/game.page');
const {uniqueRoom} = require('../../utils/browser-state');

test.describe('Lobby', () => {
    test('a guest can find and join an unranked room @smoke', async ({lobby}) => {
        await lobby.goto();
        const unranked = lobby.rooms.getByRole('row').filter({
            has: lobby.page.getByRole('cell', {name: 'no', exact: true})
        }).first();
        const ranked = lobby.rooms.getByRole('row').filter({
            has: lobby.page.getByRole('cell', {name: 'yes', exact: true})
        }).first();
        await expect(ranked).toBeVisible();
        const popup = await lobby.join(unranked);
        try {
            const game = new GamePage(popup);
            await expect(game.seat).toBeVisible();
            await game.takeSeat();
        } finally {
            await popup.close();
        }
    });

    test('visitors appear and disappear live, and chat reaches another visitor', async ({lobby, openVisitor}) => {
        await lobby.goto();
        const bob = await openVisitor('bob@test.local');
        const second = new LobbyPage(bob.page);
        await second.goto();
        await expect(lobby.users.getByRole('link', {name: 'Bob'})).toBeVisible();
        const message = uniqueRoom('lobby-chat');
        const files = ['gameChat.json', 'blockwarChat.json'].map(name => path.resolve(__dirname, '../../..', name));
        const before = files.map(file => fs.readFileSync(file));

        await second.chatInput.fill(message);
        await second.chatInput.dispatchEvent('keydown', {key: 'Enter', code: 'Enter', isComposing: true});
        await expect(second.chatInput).toHaveValue(message);
        await second.chatInput.press('Enter');
        await expect(second.chatInput).toHaveValue('');
        await expect(lobby.messages).toContainText(message);
        files.forEach((file, index) => expect(fs.readFileSync(file).equals(before[index]), file).toBe(true));

        await bob.context.close();
        await expect(lobby.users.getByRole('link', {name: 'Bob'})).toHaveCount(0);
    });
});
