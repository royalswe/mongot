'use strict';

const {test, expect} = require('../../fixtures/game.fixture');
const {uniqueRoom} = require('../../utils/browser-state');

test.describe('Playing a match', () => {
    test('guests must register for ranked rooms but can play unranked @smoke', async ({game}) => {
        await game.goto(uniqueRoom('guest-ranked'), 'yes');
        await expect(game.messages).toContainText('Register new account');
        await expect(game.seat).toBeHidden();

        await game.start(uniqueRoom('guest-open'));
        await expect(game.seat).toBeHidden();
        await expect(game.ready).toBeHidden();
        await expect(game.board).toBeVisible();
    });

    for (const ranking of ['yes', 'no']) {
        test(`${ranking === 'yes' ? 'ranked' : 'unranked'} match updates the lobby and awards only ranked points`, async ({
            lobby, openPlayer
        }) => {
            const room = uniqueRoom('match');
            await lobby.goto();
            const alice = await openPlayer('alice@test.local', room, ranking);
            const bob = await openPlayer('bob@test.local', room, ranking);
            const row = lobby.room(room);

            for (const player of [alice, bob]) { await player.game.takeSeat(); }
            await expect(row).toContainText('waiting for players');
            await alice.game.ready.click();
            await bob.game.ready.click();
            await alice.game.expectStarted();
            await bob.game.expectStarted();
            await expect(row).toContainText('game in progress');

            await bob.context.close();
            await expect(alice.game.log).toContainText('Alice won the game!');
            if (ranking === 'yes') {
                await expect(alice.game.messages).toContainText('Bob lost 25 points');
                await expect(alice.game.messages).toContainText('Alice won 25 points');
            } else {
                await expect(alice.game.messages).not.toContainText('points');
            }
            await expect(row).toContainText('waiting for players');
            await alice.context.close();
            await expect(row).toHaveCount(0);
        });
    }

    test('a player can add a bot through chat and start playing', async ({openPlayer}) => {
        const {game} = await openPlayer('alice@test.local', uniqueRoom('bot'));
        await game.takeSeat();
        await game.sendChat('Add bot');
        await expect(game.target('#Bot-0')).toBeVisible();
        await game.ready.click();
        await game.expectStarted();
    });
});
