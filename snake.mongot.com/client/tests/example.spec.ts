import { expect, test } from '@playwright/test';

test('renders the Snake home page', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: /Snake/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /Quick game/i })).toBeVisible();
	await expect(page.getByRole('link', { name: /Go to lobby/i })).toBeVisible();
	await expect(page.locator('main > div').first()).toHaveCSS('margin-left', '80px');
	await expect(page.getByRole('button', { name: /Quick game/i })).toHaveCSS('padding', '16px 28px');
	await expect(page.getByRole('button', { name: /Quick game/i })).toHaveClass(/rounded-full/);
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
	await expect(page.locator('.bg-c-blue-600')).toHaveCSS('background-color', 'rgb(22, 88, 120)');
	await expect(page.locator('.lobby-chat-container .mt-6 li').first()).toBeVisible();
	const chatInput = page.getByPlaceholder('Type your message here');
	await expect(chatInput).toHaveCSS('border-radius', '8px');
	await expect(page.locator('.chat-submit')).toHaveCSS('padding', '8px 16px');
	await page.getByRole('button', { name: 'Create New Room' }).first().click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	const backdropColor = await dialog
		.locator('.fixed.inset-0')
		.first()
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	const backdropAlphaMatch =
		backdropColor.match(/\/\s*([\d.]+)(%)?\s*\)$/) ??
		backdropColor.match(/^rgba\([^)]*,\s*([\d.]+)(%)?\)$/);
	const backdropAlpha = backdropAlphaMatch
		? Number(backdropAlphaMatch[1]) / (backdropAlphaMatch[2] ? 100 : 1)
		: Number.NaN;
	expect(backdropAlpha).toBe(0.75);

	const width = dialog.getByLabel('Board Width');
	const receivesPointer = await width.evaluate((element) => {
		const { x, y, width, height } = element.getBoundingClientRect();
		return document.elementFromPoint(x + width / 2, y + height / 2) === element;
	});
	expect(receivesPointer).toBe(true);
	await expect(dialog.getByRole('button', { name: 'Create' })).toHaveCSS('padding', '10px 16px');
	await width.focus();
	const focusRing = await width.evaluate((element) => getComputedStyle(element).boxShadow);
	expect(focusRing).not.toBe('none');
	await width.fill('50');
	await expect(width).toHaveValue('50');
});
