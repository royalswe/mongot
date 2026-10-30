'use strict';

const {test, expect} = require('../../fixtures/game.fixture');
const {uniqueRoom} = require('../../utils/browser-state');

test.describe('Canvas density', () => {
    test('the board and next-piece preview stay sharp at the device pixel ratio', async ({game}) => {
        await game.start(uniqueRoom('density'));
        for (const [canvas, aspect] of [[game.board, 464 / 240], [game.nextPiece, 200 / 120]]) {
            await expect.poll(() => canvas.evaluate((element, ratio) => ({
                width: element.width - Math.round(element.clientWidth * devicePixelRatio),
                height: element.height - Math.round(element.clientWidth * devicePixelRatio * ratio)
            }), aspect)).toEqual({width: 0, height: 0});
        }
    });
});
