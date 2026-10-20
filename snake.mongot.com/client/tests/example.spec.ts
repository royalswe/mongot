import { expect, test } from '@playwright/test';

test('renders the Snake home page', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: /One more square/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /Quick game/i })).toBeVisible();
	await expect(page.getByRole('link', { name: /Browse lobby/i })).toBeVisible();
	await expect(page.locator('.snake-art')).toBeVisible();
	await expect(page.getByRole('button', { name: /Quick game/i })).toHaveCSS('min-height', '59.2px');
});

test('shows rating and the matching crown on the high-score table', async ({ page }) => {
	await page.route('**/api/highscores', (route) =>
		route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify([{ username: 'Alice', wins: 5, losses: 2, rating: 1600 }])
		})
	);

	await page.goto('/highscore');
	await expect(page.getByRole('columnheader', { name: 'Rating' })).toBeVisible();
	await expect(page.getByText('1600')).toBeVisible();
	const crown = page.locator('tbody img').first();
	await expect(crown).toHaveAttribute('src', '/images/rankings/crown3.png');
	const crownResponse = await page.request.get('/images/rankings/crown3.png');
	expect(crownResponse.status()).toBe(200);
	const ratingsResponse = await page.request.get('/api/ratings?usernames=Alice');
	expect(ratingsResponse.status()).toBe(200);
	expect(await ratingsResponse.json()).toEqual({ alice: 1600 });
});

test('connects to the lobby WebSocket', async ({ page }) => {
	test.setTimeout(10_000);
	const framePromise = new Promise<string>((resolve, reject) => {
		page.on('websocket', (socket) => {
			if (new URL(socket.url()).pathname === '/api/lobby') {
				socket.on('framereceived', (frame) => resolve(String(frame.payload)));
				socket.on('socketerror', (error) => reject(new Error(error)));
				socket.on('close', () =>
					reject(new Error('Lobby WebSocket closed before receiving data.'))
				);
			}
		});
	});
	await page.goto('/lobby');

	expect(JSON.parse(await framePromise)).toMatchObject({ type: 'update-rooms' });
});

test('allows editing board dimensions in the create-room dialog', async ({ page }) => {
	await page.goto('/lobby');
	await expect(page.locator('.lobby-layout')).toBeVisible();
	await expect(page.locator('.room-browser')).toBeVisible();
	const chatInput = page.getByRole('textbox', { name: 'Chat message' });
	await expect(chatInput).toHaveAttribute('maxlength', '500');
	await expect(page.getByRole('button', { name: 'Send chat message' })).toHaveCSS(
		'min-height',
		'44.8px'
	);
	await page.getByRole('button', { name: 'Create room' }).first().click();
	const dialog = page.locator('dialog.create-dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog).toHaveAttribute('open', '');
	await expect(dialog).toHaveAttribute('aria-modal', 'true');
	const backdropColor = await page
		.locator('.modal-backdrop')
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	const backdropAlphaMatch =
		backdropColor.match(/\/\s*([\d.]+)(%)?\s*\)$/) ??
		backdropColor.match(/^rgba\([^)]*,\s*([\d.]+)(%)?\)$/);
	const backdropAlpha = backdropAlphaMatch
		? Number(backdropAlphaMatch[1]) / (backdropAlphaMatch[2] ? 100 : 1)
		: Number.NaN;
	expect(backdropAlpha).toBe(0.78);

	const width = dialog.getByLabel('Width');
	const height = dialog.getByLabel('Height');
	const create = dialog.getByRole('button', { name: 'Create room', exact: true });
	const receivesPointer = await width.evaluate((element) => {
		const { x, y, width, height } = element.getBoundingClientRect();
		return document.elementFromPoint(x + width / 2, y + height / 2) === element;
	});
	expect(receivesPointer).toBe(true);
	await expect(create).toHaveCSS('min-height', '48px');
	await width.focus();
	await expect(width).toBeFocused();
	await expect(dialog.locator('.input-with-unit').first()).not.toHaveCSS('box-shadow', 'none');
	await width.fill('9');
	await expect(dialog.getByRole('alert')).toHaveText(
		'Board width and height must be whole numbers of at least 10.'
	);
	await expect(create).toBeDisabled();
	await width.fill('10.5');
	await expect(create).toBeDisabled();
	await width.fill('50');
	await expect(width).toHaveValue('50');
	await expect(create).toBeEnabled();
	await height.fill('9');
	await expect(create).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(page.getByRole('button', { name: 'Create room' }).first()).toBeFocused();
});

test('keeps the landing page and lobby within a phone viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	await expect(page.locator('.hero-art')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

	await page.goto('/lobby');
	await expect(page.getByRole('heading', { name: 'Find your arena.' })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
