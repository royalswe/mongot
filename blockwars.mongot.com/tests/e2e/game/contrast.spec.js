'use strict';

const {test, expect} = require('../../fixtures/game.fixture');
const {uniqueRoom} = require('../../utils/browser-state');
const {contrastRatio} = require('../../utils/contrast');

test.describe('Theme text contrast', () => {
    for (const theme of ['classic', 'flat', 'retro']) {
        test(`${theme} keeps chat and controls readable`, async ({game, page, context, sockets}) => {
            await context.addInitScript(name => localStorage.setItem('theme', name), theme);
            const room = uniqueRoom('contrast');
            await game.goto(room);
            const visitor = await sockets();
            visitor.send({type: 'enter-room', user: 'guest', name: room, ranking: 'no'});
            await visitor.next('enter-room');
            // Server announcements have no separate accessible role within the chat log.
            const announcement = game.messages.locator('.server-message').first();
            await expect(announcement).toBeAttached();
            await game.settings.click();
            const readable = [game.chatInput, announcement,
                page.getByRole('button', {name: 'Move left', exact: true}),
                page.getByRole('button', {name: 'Controls', exact: true})];
            // Preserve the existing exceptions for deliberately bright classic/retro arcade buttons.
            if (theme !== 'retro') { readable.push(page.getByRole('button', {name: 'Send', exact: true})); }
            if (theme === 'flat') { readable.push(game.seat); }
            for (const locator of readable) {
                expect(await contrastRatio(locator), `${theme}: ${await locator.getAttribute('id')}`).toBeGreaterThanOrEqual(4.5);
            }
            if (theme === 'flat') {
                await game.takeSeat();
                expect(await contrastRatio(game.ready), 'flat: ready button').toBeGreaterThanOrEqual(4.5);
            }
        });
    }
});
