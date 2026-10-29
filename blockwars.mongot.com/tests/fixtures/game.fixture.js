'use strict';

const {test: base, expect} = require('@playwright/test');
const {GamePage} = require('../pages/game.page');
const {LobbyPage} = require('../pages/lobby.page');
const {prepareVisitor} = require('../utils/browser-state');
const {connectSocket} = require('../utils/game-socket');
const {sessionCookie} = require('./accounts');

const test = base.extend({
    movementButtons: [true, {option: true}],
    rulesRead: [true, {option: true}],
    context: async ({context, movementButtons, rulesRead, baseURL}, use) => {
        await prepareVisitor(context, {baseURL, movementButtons, rulesRead});
        await use(context);
    },
    game: async ({page}, use) => { await use(new GamePage(page)); },
    lobby: async ({page}, use) => { await use(new LobbyPage(page)); },
    openVisitor: async ({browser, baseURL, movementButtons, rulesRead}, use) => {
        const contexts = new Set();
        try {
            await use(async email => {
                const context = await browser.newContext({baseURL});
                contexts.add(context);
                context.once('close', () => contexts.delete(context));
                await prepareVisitor(context, {baseURL, movementButtons, rulesRead});
                if (email) { await context.addCookies([sessionCookie(email)]); }
                return {context, page: await context.newPage()};
            });
        } finally {
            await Promise.all([...contexts].map(context => context.close()));
        }
    },
    openPlayer: async ({openVisitor}, use) => {
        await use(async (email, room, ranking = 'no') => {
            const {context, page} = await openVisitor(email);
            const game = new GamePage(page);
            await game.goto(room, ranking);
            return {context, game};
        });
    },
    sockets: async ({baseURL}, use) => {
        const sockets = [];
        try {
            await use(async () => {
                const socket = await connectSocket(baseURL);
                sockets.push(socket);
                return socket;
            });
        } finally {
            await Promise.all(sockets.map(socket => socket.close()));
        }
    },
    rivalGame: async ({game, sockets}, use) => {
        await use(async room => {
            await game.goto(room);
            await game.takeSeat();
            const rival = await sockets();
            await rival.join(room);
            await game.ready.click();
            rival.send({type: 'player-ready'});
            await game.expectStarted();
            return rival;
        });
    }
});

module.exports = {test, expect};
