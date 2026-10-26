'use strict';

const {expect} = require('@playwright/test');
const {quietFirstVisit, startLoneGame, connectSocket, grabBlock, uniqueRoom} = require('./helpers');

const activeInside = (page, selector) => page.evaluate(sel => {
    const container = document.querySelector(sel);
    return container === document.activeElement || container.contains(document.activeElement);
}, selector);

// Runs in the browser: contrast ratio of an element's text against the first solid background behind it.
function contrastOf(selector) {
    const parse = (css) => {
        const [r, g, b, a = 1] = css.match(/[\d.]+/g).map(Number);
        return {r, g, b, a};
    };
    const luminance = ({r, g, b}) => {
        const channel = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const element = document.querySelector(selector);
    const foreground = parse(getComputedStyle(element).color);
    let node = element;
    let background = null;
    while (node && !background) {
        const color = parse(getComputedStyle(node).backgroundColor);
        if (color.a >= 0.85) { background = color; }
        node = node.parentElement;
    }
    background = background || parse(getComputedStyle(document.documentElement).backgroundColor);
    const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
}

function defineAccessibilityTests(test) {
    test.beforeEach(async ({context}) => { await quietFirstVisit(context); });

    test('the settings menu opens on click, not on hover, and Escape closes it', async ({page}) => {
        await page.goto(`/game?room=${uniqueRoom('menu')}&rank=no`);
        const toggle = page.locator('#settings_toggle');
        const menu = page.locator('#settings_menu');

        await toggle.hover();
        await expect(menu).toBeHidden();
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');

        await toggle.click();
        await expect(menu).toBeVisible();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');

        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await expect(toggle).toBeFocused();

        await toggle.click();
        await page.mouse.click(page.viewportSize().width / 2, 5);
        await expect(menu).toBeHidden();
    });

    for (const [name, dialog] of [['Controls', '#controler_settings'], ['How to play', '#rules_modal']]) {
        test(`the ${name} dialog takes focus, keeps Tab inside and gives focus back`, async ({page}) => {
            await page.goto(`/game?room=${uniqueRoom('dialog')}&rank=no`);
            await page.locator('#settings_toggle').click();
            await page.getByRole('button', {name}).click();

            await expect(page.locator(dialog)).toBeVisible();
            expect(await activeInside(page, dialog)).toBe(true);
            for (let press = 0; press < 14; press++) {
                await page.keyboard.press('Tab');
                expect(await activeInside(page, dialog), `Tab ${press + 1}`).toBe(true);
            }

            await page.keyboard.press('Escape');
            await expect(page.locator(dialog)).toBeHidden();
            await expect(page.locator('#settings_toggle')).toBeFocused();
        });
    }

    test('every button, field and toggle has a name', async ({page}) => {
        await page.goto(`/game?room=${uniqueRoom('names')}&rank=no`);

        const unnamed = await page.evaluate(() => [...document.querySelectorAll('button, [role=button], input:not([type=hidden])')]
            .filter((control) => {
                const labelled = [...(control.labels || [])].map(label => label.textContent.trim()).join('');
                const name = control.getAttribute('aria-label') || labelled || control.textContent.trim()
                    || (control.type === 'submit' && control.value) || control.title;
                return !name;
            })
            .map(control => control.outerHTML.slice(0, 80)));
        expect(unnamed).toEqual([]);
    });

    test('seat and ready are real buttons', async ({page}) => {
        await page.goto(`/game?room=${uniqueRoom('buttons')}&rank=no`);

        await page.getByRole('button', {name: 'Take a seat'}).click();
        await expect(page.getByRole('button', {name: 'Click when ready!'})).toBeVisible();
    });

    test('the keyboard focus can be seen', async ({page}) => {
        await page.goto(`/game?room=${uniqueRoom('focus')}&rank=no`);
        await page.keyboard.press('Tab');
        await page.locator('#take_seat').focus();

        const outline = await page.locator('#take_seat').evaluate(element => {
            const style = getComputedStyle(element);
            return [style.outlineStyle, style.outlineWidth];
        });
        expect(outline).toEqual(['solid', '3px']);
    });

    // Bright arcade buttons that the classic and retro themes deliberately keep below 4.5:1.
    const brightButtons = {classic: ['#take_seat', '#player_ready'], flat: [], retro: ['#take_seat', '#player_ready', '#send']};
    const readable = (theme, selectors) => selectors.filter(selector => !brightButtons[theme].includes(selector));

    for (const theme of ['classic', 'flat', 'retro']) {
        test(`text is readable on the ${theme} theme`, async ({page, baseURL}) => {
            await page.addInitScript(name => localStorage.setItem('theme', name), theme);
            const room = uniqueRoom('contrast');
            await page.goto(`/game?room=${room}&rank=no`);
            const visitor = await connectSocket(baseURL); // its arrival puts a server message in the chat
            visitor.send({type: 'enter-room', user: 'guest', name: room, ranking: 'no'});
            await visitor.next('enter-room');
            await page.locator('#settings_toggle').click();
            await expect(page.locator('#messages .server-message').first()).toBeAttached();

            const selectors = ['#take_seat', '#messages .server-message', '#message', '#send', '.keyboard .keyboard-col',
                '.settings-btn', '.open-seat'];
            for (const selector of readable(theme, selectors)) {
                const ratio = await page.evaluate(`(${contrastOf.toString()})(${JSON.stringify(selector)})`);
                expect(ratio, selector).toBeGreaterThanOrEqual(4.5);
            }

            await page.locator('#take_seat').click();
            await expect(page.locator('#player_ready')).toBeVisible();
            for (const selector of readable(theme, ['#player_ready'])) {
                expect(await page.evaluate(`(${contrastOf.toString()})(${JSON.stringify(selector)})`), selector).toBeGreaterThanOrEqual(4.5);
            }
            visitor.close();
        });
    }

    test('the classic theme is the default and draws bevelled blocks on the grey field', async ({page}) => {
        await page.route('**/js/modules/theme.js', route => route.fulfill({contentType: 'text/javascript', body: ''}));
        await page.goto(`/game?room=${uniqueRoom('first-paint')}&rank=no`);
        await expect(page.locator('html'), 'set before any script runs').toHaveClass(/theme-classic/);
        await page.unroute('**/js/modules/theme.js');

        await startLoneGame(page, uniqueRoom('classic'));
        await expect(page.locator('html')).toHaveClass(/theme-classic/);
        await expect(page.locator('html')).not.toHaveClass(/theme-retro|theme-flat/);

        const pixels = await paintAndRead(page, {face: [0.5, 21.5], highlight: [0.07, 21.5], shade: [0.93, 21.5], empty: [5.5, 10.5]});

        expect(pixels.face).toEqual([0, 153, 204]);
        expect(pixels.highlight).toEqual([13, 194, 255]); // lit edge
        expect(pixels.shade).toEqual([0, 84, 112]); // shaded edge
        expect(pixels.empty).toEqual([51, 51, 51]);
    });

    test('the retro theme draws glossy blocks on the dark purple field', async ({page}) => {
        await page.addInitScript(() => localStorage.setItem('theme', 'retro'));
        await startLoneGame(page, uniqueRoom('retro'));
        await expect(page.locator('html')).toHaveClass(/theme-retro/);
        await expect(page.locator('html')).not.toHaveClass(/theme-classic|theme-flat/);

        const pixels = await paintAndRead(page, {face: [0.5, 21.5], highlight: [0.15, 21.25], shade: [0.9, 21.9], empty: [5.5, 10.5]});

        expect(pixels.face).toEqual([13, 194, 255]);
        expect(pixels.highlight).toEqual([255, 255, 255]);
        expect(pixels.shade).toEqual([0, 153, 204]);
        expect(pixels.empty).toEqual([13, 11, 38]);
    });

    test('the flat theme draws plain squares on the dark field', async ({page}) => {
        await page.addInitScript(() => localStorage.setItem('theme', 'flat'));
        await startLoneGame(page, uniqueRoom('flat'));
        await expect(page.locator('html')).toHaveClass(/theme-flat/);
        await expect(page.locator('html')).not.toHaveClass(/theme-retro|theme-classic/);

        const pixels = await paintAndRead(page, {face: [0.5, 21.5], corner: [0.2, 21.25], empty: [5.5, 10.5]});

        expect(pixels.face).toEqual([45, 212, 255]);
        expect(pixels.corner).toEqual(pixels.face); // no highlight or bevel
        expect(pixels.empty).toEqual([18, 22, 28]);
    });

    test('the theme can be switched from the settings menu through all three, redraws at once and is remembered', async ({page}) => {
        await startLoneGame(page, uniqueRoom('switch'));
        await paintAndRead(page, {});

        const switchTo = async (name) => {
            if ((await page.locator('#settings_toggle').getAttribute('aria-expanded')) !== 'true') {
                await page.locator('#settings_toggle').click();
            }
            await page.getByRole('button', {name: `Switch to the ${name} theme`}).click();
            await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${name}`));
            expect(await page.evaluate(() => THEME.name())).toBe(name);
        };

        await switchTo('flat');
        expect(await readPixel(page, [0.2, 21.25])).toEqual(await readPixel(page, [0.5, 21.5]));
        expect(await readPixel(page, [5.5, 10.5])).toEqual([18, 22, 28]);

        await switchTo('retro');
        expect(await readPixel(page, [0.5, 21.5])).toEqual([13, 194, 255]);
        expect(await readPixel(page, [5.5, 10.5])).toEqual([13, 11, 38]);

        await page.reload();
        await expect(page.locator('html')).toHaveClass(/theme-retro/);
        await switchTo('classic');
        await expect(page.locator('html')).not.toHaveClass(/theme-retro|theme-flat/);
        expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('classic');
    });
}

// Puts a block in the lower left of the local arena and draws it; returns the pixel at each point (cell units).
async function paintAndRead(page, points) {
    await grabBlock(page);
    await page.evaluate(() => {
        const {tetris} = window.__block;
        tetris.arena.matrix[21][0] = 2;
        tetris.draw();
    });
    const result = {};
    for (const [name, point] of Object.entries(points)) { result[name] = await readPixel(page, point); }
    return result;
}

function readPixel(page, [x, y]) {
    return page.evaluate(([cellX, cellY]) => {
        const {tetris} = window.__block;
        const scale = tetris.canvas.width / 240;
        const data = tetris.ctx.getImageData(Math.round(cellX * 24 * scale), Math.round((cellY * 22 - 19) * scale), 1, 1).data;
        return [...data.slice(0, 3)];
    }, [x, y]);
}

module.exports = {defineAccessibilityTests};
