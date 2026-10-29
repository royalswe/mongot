'use strict';

const {expect} = require('@playwright/test');

async function expectOnScreen(locator) {
    await expect(locator).not.toHaveCount(0);
    for (const element of await locator.all()) {
        await expect(element).toBeInViewport({ratio: 1});
    }
}

async function expectTapTarget(locator) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box.width, 'tap target width').toBeGreaterThanOrEqual(43.5);
    expect(box.height, 'tap target height').toBeGreaterThanOrEqual(43.5);
}

module.exports = {expectOnScreen, expectTapTarget};
