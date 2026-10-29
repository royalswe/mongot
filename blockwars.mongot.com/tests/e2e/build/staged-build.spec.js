'use strict';

const {test, expect} = require('../../fixtures/game.fixture');
const fs = require('node:fs');
const path = require('node:path');
const {uniqueRoom} = require('../../utils/browser-state');

const stage = path.resolve(__dirname, '../../..', 'build');
test.skip(!fs.existsSync(stage), 'Run npm run test:build to create the staged assets first');

test.describe('Staged production assets', () => {
    test.beforeEach(async ({page, baseURL}) => {
        await page.route(`${baseURL}/**`, async route => {
            const url = new URL(route.request().url());
            if (/^\/(?:js|css|img|fonts|sounds|resources)\//.test(url.pathname)) {
                const filename = url.pathname === '/js/special-rules.js'
                    ? path.join(stage, 'game/special-rules.js')
                    : path.join(stage, 'public', url.pathname.slice(1));
                await route.fulfill({path: filename});
            } else {
                await route.continue();
            }
        });
    });

    test('staged game scripts and compiled settings work together', async ({page, game}) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await game.goto(uniqueRoom('staged'));
        await game.openSettings('Controls');
        await game.controls.locator('#moveLeft').click();
        await page.keyboard.press('a');
        await expect(game.controls.locator('#moveLeft')).toHaveText('A');
        await game.controls.getByRole('button', {name: 'Close Controls'}).click();
        await game.takeSeat();
        await game.ready.click();
        await game.expectStarted();
        await game.captureBlock('ArrowRight');
        const before = await game.position();
        await page.keyboard.press('a');
        expect((await game.position()).x).toBe(before.x - 1);
        expect(errors).toEqual([]);
    });

    test('staged lobby connects and lists Rooms', async ({page, lobby}) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await lobby.goto();
        await expect(lobby.rooms.getByRole('button', {name: 'Join Room'})).toHaveCount(4);
        expect(errors).toEqual([]);
    });

    for (const format of ['woff2', 'woff']) {
        test(`staged navigation icons load with ${format}`, async ({page}) => {
            const fonts = [];
            page.on('response', response => {
                if (response.url().includes('/fonts/fontawesome-webfont.')) {
                    fonts.push({pathname: new URL(response.url()).pathname, status: response.status()});
                }
            });
            if (format === 'woff') {
                await page.route('**/fonts/fontawesome-webfont.woff2*', route => route.abort());
            }
            await page.goto('/lobby');
            const loaded = await page.evaluate(async () => {
                const faces = await document.fonts.load('14px FontAwesome', '\uf015');
                const icon = document.querySelector('#header .fa-home');
                const style = getComputedStyle(icon, '::before');
                return {
                    loaded: faces.length > 0 && faces.every(face => face.status === 'loaded'),
                    content: style.content,
                    family: style.fontFamily
                };
            });
            expect(loaded.loaded).toBe(true);
            expect(loaded.content).toBe('"\uf015"');
            expect(loaded.family).toContain('FontAwesome');
            expect(fonts).toContainEqual({
                pathname: `/fonts/fontawesome-webfont.${format}`, status: 200
            });
        });
    }

    test('optimized images preserve dimensions and PNG/GIF first-frame stored pixels', async ({page}) => {
        await page.goto('/lobby', {waitUntil: 'domcontentloaded'});
        const source = path.resolve(__dirname, '../../..', 'public/img');
        const files = fs.readdirSync(source, {recursive: true})
            .filter(filename => /\.(png|gif|jpe?g)$/i.test(filename));
        for (const filename of files) {
            const sourceBytes = fs.readFileSync(path.join(source, filename));
            const stagedBytes = fs.readFileSync(path.join(stage, 'public/img', filename));
            const result = await page.evaluate(async ({before, after, lossless}) => {
                async function decode(base64) {
                    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
                    const image = await createImageBitmap(new Blob([bytes]), {colorSpaceConversion: 'none'});
                    const canvas = document.createElement('canvas');
                    canvas.width = image.width;
                    canvas.height = image.height;
                    const context = canvas.getContext('2d');
                    context.drawImage(image, 0, 0);
                    image.close();
                    return {width: canvas.width, height: canvas.height,
                        pixels: context.getImageData(0, 0, canvas.width, canvas.height).data};
                }
                const original = await decode(before);
                const optimized = await decode(after);
                return {
                    sameDimensions: original.width === optimized.width && original.height === optimized.height,
                    samePixels: !lossless || (original.pixels.length === optimized.pixels.length
                        && original.pixels.every((value, index) => value === optimized.pixels[index]))
                };
            }, {before: sourceBytes.toString('base64'), after: stagedBytes.toString('base64'),
                lossless: /\.(png|gif)$/i.test(filename)});
            expect(result, filename).toEqual({sameDimensions: true, samePixels: true});
        }
        expect(files.length).toBeGreaterThan(0);
    });
});
