'use strict';

const {test, expect} = require('../../fixtures/game.fixture');
const {uniqueRoom} = require('../../utils/browser-state');

test.describe('Phone platform integration', () => {
    test.beforeEach(async ({context}) => {
        await context.addInitScript(() => {
            window.__platform = {vibrations: [], wake: []};
            navigator.vibrate = pattern => { window.__platform.vibrations.push(pattern); return true; };
            Object.defineProperty(navigator, 'wakeLock', {
                configurable: true,
                value: {
                    request: async type => {
                        window.__platform.wake.push(type);
                        return {
                            addEventListener() {},
                            release: async () => { window.__platform.wake.push('released'); }
                        };
                    }
                }
            });
        });
    });

    for (const enabled of [true, false]) {
        test(`wake lock and haptics ${enabled ? 'follow the game lifecycle' : 'respect opt-out'}`, async ({game, page}) => {
            await game.goto(uniqueRoom('platform'));
            if (!enabled) {
                await game.openSettings('Controls');
                await game.controls.getByRole('checkbox', {name: 'Vibration', exact: true}).uncheck();
                await game.controls.getByRole('checkbox', {name: 'Keep screen on', exact: true}).uncheck();
                await game.controls.getByRole('button', {name: 'Done', exact: true}).click();
            }
            await game.takeSeat();
            await game.ready.click();
            await game.expectStarted();
            await expect.poll(() => page.evaluate(() => window.__platform.wake)).toEqual(enabled ? ['screen'] : []);
            await game.stackUntilLost();
            await expect(game.log).toContainText('won the game!');
            await expect.poll(() => page.evaluate(() => window.__platform.wake))
                .toEqual(enabled ? ['screen', 'released'] : []);
            const vibrations = await page.evaluate(() => window.__platform.vibrations);
            if (enabled) {
                expect(vibrations).toContainEqual([100, 50, 100]);
            } else {
                expect(vibrations).toEqual([]);
            }
        });
    }
});
