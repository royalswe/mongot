'use strict';

const {test, expect} = require('@playwright/test');
const {defineAccessibilityTests} = require('./a11y.shared');

defineAccessibilityTests(test);

test.describe('reduced motion', () => {
    test.use({reducedMotion: 'reduce'});

    test('the seat button stops pulsing', async ({page}) => {
        await page.goto('/game?room=E2E-reduced-motion&rank=no');
        await expect(page.locator('#take_seat')).toBeVisible();

        const seconds = await page.locator('#take_seat').evaluate(element => parseFloat(getComputedStyle(element).animationDuration));
        expect(seconds).toBeLessThan(0.001);
    });
});
