import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

type ProtocolMessage = {
	type: string;
	[key: string]: unknown;
};

type SocketWaiter = {
	type: string;
	expected?: Record<string, unknown>;
	resolve: (message: ProtocolMessage) => void;
	reject: (error: Error) => void;
};

type SocketClient = {
	socket: WebSocket;
	messages: ProtocolMessage[];
	waiters: SocketWaiter[];
};

declare global {
	interface Window {
		__gameSocketClients?: Record<string, SocketClient>;
		__snakeSentMessages?: Array<{ type: string; key?: string; sentAt: number }>;
		__snakeInputCheckStartedAt?: number;
	}
}

async function installSocketHarness(page: Page) {
	await page.evaluate(() => {
		window.__gameSocketClients = {};
	});
}

async function connectClient(page: Page, id: string, room: string) {
	await page.evaluate(
		({ id, room }) => {
			const client: SocketClient = {
				socket: new WebSocket(`wss://${window.location.hostname}:5300/api/room`),
				messages: [],
				waiters: []
			};
			window.__gameSocketClients![id] = client;
			client.socket.binaryType = 'arraybuffer';
			client.socket.addEventListener('open', () => {
				client.socket.send(
					JSON.stringify({
						type: 'join-room',
						params: { room, width: 20, height: 20 }
					})
				);
			});
			client.socket.addEventListener('message', ({ data }) => {
				const message = JSON.parse(
					data instanceof ArrayBuffer ? new TextDecoder().decode(data) : String(data)
				) as ProtocolMessage;
				const index = client.waiters.findIndex(
					(waiter) =>
						waiter.type === message.type &&
						Object.entries(waiter.expected || {}).every(([key, value]) => message[key] === value)
				);
				if (index >= 0) client.waiters.splice(index, 1)[0].resolve(message);
				else client.messages.push(message);
			});
		},
		{ id, room }
	);
}

async function waitForMessage(
	page: Page,
	id: string,
	type: string,
	expected?: Record<string, unknown>,
	timeout = 10_000
) {
	return page.evaluate(
		({ id, type, expected, timeout }) => {
			const client = window.__gameSocketClients![id];
			const existingIndex = client.messages.findIndex(
				(message) =>
					message.type === type &&
					Object.entries(expected || {}).every(([key, value]) => message[key] === value)
			);
			if (existingIndex >= 0) return client.messages.splice(existingIndex, 1)[0];

			return new Promise<ProtocolMessage>((resolve, reject) => {
				const timer = window.setTimeout(() => {
					const index = client.waiters.indexOf(waiter);
					if (index >= 0) client.waiters.splice(index, 1);
					reject(new Error(`Timed out waiting for ${type} from ${id}`));
				}, timeout);
				const waiter: SocketWaiter = {
					type,
					expected,
					resolve: (message) => {
						window.clearTimeout(timer);
						resolve(message);
					},
					reject
				};
				client.waiters.push(waiter);
			});
		},
		{ id, type, expected, timeout }
	);
}

async function sendMessage(page: Page, id: string, message: ProtocolMessage) {
	await page.evaluate(
		({ id, message }) => {
			window.__gameSocketClients![id].socket.send(JSON.stringify(message));
		},
		{ id, message }
	);
}

async function closeClient(page: Page, id: string) {
	await page.evaluate(
		({ id }) => {
			window.__gameSocketClients?.[id]?.socket.close();
		},
		{ id }
	);
}

test('two real WebSocket players share movement and reach a terminal outcome', async ({ page }) => {
	test.setTimeout(30_000);
	await page.goto('/lobby');
	await installSocketHarness(page);

	const room = `e2e-${randomUUID()}`;
	try {
		await Promise.all([connectClient(page, 'red', room), connectClient(page, 'blue', room)]);
		await Promise.all([
			waitForMessage(page, 'red', 'join-room'),
			waitForMessage(page, 'blue', 'join-room')
		]);

		await sendMessage(page, 'red', { type: 'join-game', color: 'red' });
		await sendMessage(page, 'blue', { type: 'join-game', color: 'blue' });
		await Promise.all([
			waitForMessage(page, 'red', 'join-game', { playerStatus: 'joined' }),
			waitForMessage(page, 'blue', 'join-game', { playerStatus: 'joined' })
		]);

		await sendMessage(page, 'red', { type: 'player-ready' });
		await sendMessage(page, 'blue', { type: 'player-ready' });
		await Promise.all([
			waitForMessage(page, 'red', 'game-status', { gameStatus: 'count-down' }),
			waitForMessage(page, 'blue', 'game-status', { gameStatus: 'count-down' })
		]);
		await Promise.all([
			waitForMessage(page, 'red', 'game-status', { gameStatus: 'running' }, 15_000),
			waitForMessage(page, 'blue', 'game-status', { gameStatus: 'running' }, 15_000)
		]);

		const [redFirstState, blueFirstState] = await Promise.all([
			waitForMessage(page, 'red', 'game-state'),
			waitForMessage(page, 'blue', 'game-state')
		]);
		expect(redFirstState.data).toEqual(blueFirstState.data);
		expect(
			(redFirstState.data as Array<{ color: string }>).map(({ color }) => color).sort()
		).toEqual(['blue', 'red']);

		await sendMessage(page, 'red', { type: 'movement', key: 'ArrowUp' });
		await sendMessage(page, 'red', { type: 'movement', key: 'ArrowLeft' });
		await sendMessage(page, 'blue', { type: 'movement', key: 'ArrowUp' });
		const [redTurnState, blueTurnState] = await Promise.all([
			waitForMessage(page, 'red', 'game-state'),
			waitForMessage(page, 'blue', 'game-state')
		]);
		expect(redTurnState.data).toEqual(blueTurnState.data);
		expect(
			(redTurnState.data as Array<{ color: string; pos: { x: number; y: number } }>).find(
				({ color }) => color === 'red'
			)?.pos
		).toEqual({ x: 4, y: 2 });

		const [redSecondTurnState, blueSecondTurnState] = await Promise.all([
			waitForMessage(page, 'red', 'game-state'),
			waitForMessage(page, 'blue', 'game-state')
		]);
		expect(redSecondTurnState.data).toEqual(blueSecondTurnState.data);
		expect(
			(redSecondTurnState.data as Array<{ color: string; pos: { x: number; y: number } }>).find(
				({ color }) => color === 'red'
			)?.pos
		).toEqual({ x: 3, y: 2 });

		const [redGameOver, blueGameOver] = await Promise.all([
			waitForMessage(page, 'red', 'gameOver', undefined, 12_000),
			waitForMessage(page, 'blue', 'gameOver', undefined, 12_000)
		]);
		expect(redGameOver.winner).toContain('winner');
		expect(blueGameOver).toEqual(redGameOver);
		const finalStates = await page.evaluate(
			({ id }) =>
				window.__gameSocketClients![id].messages.filter((message) => message.type === 'game-state'),
			{ id: 'red' }
		);
		expect(finalStates.length).toBeGreaterThan(0);
		const terminalPlayers = finalStates.at(-1)?.data as Array<{
			pos: { x: number; y: number };
			snake: Array<{ x: number; y: number }>;
		}>;
		expect(terminalPlayers).toHaveLength(2);
		for (const player of terminalPlayers) {
			expect(player.snake.at(-1)).toEqual(player.pos);
		}
	} finally {
		await Promise.all([closeClient(page, 'red'), closeClient(page, 'blue')]);
	}
});

test('renders two snakes sharing a collision cell as separate colored halves', async ({ page }) => {
	await page.goto('/lobby');
	const pixels = await page.evaluate(async () => {
		const { drawSnakeCell } = await import('/src/routes/game/snakeCanvas.ts');
		const canvas = document.createElement('canvas');
		canvas.width = 20;
		canvas.height = 20;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas context is unavailable');
		drawSnakeCell(context, 0, 0, 20, ['red', 'blue']);
		return {
			left: Array.from(context.getImageData(5, 10, 1, 1).data),
			right: Array.from(context.getImageData(15, 10, 1, 1).data)
		};
	});
	expect(pixels.left).toEqual([0, 0, 255, 255]);
	expect(pixels.right).toEqual([255, 0, 0, 255]);
});

test('seat errors and malformed messages stay isolated; a disconnected seat is reusable', async ({
	page
}) => {
	test.setTimeout(20_000);
	await page.goto('/lobby');
	await installSocketHarness(page);

	const room = `e2e-${randomUUID()}`;
	try {
		await Promise.all([connectClient(page, 'first', room), connectClient(page, 'second', room)]);
		await Promise.all([
			waitForMessage(page, 'first', 'join-room'),
			waitForMessage(page, 'second', 'join-room')
		]);

		await sendMessage(page, 'first', { type: 'join-game', color: 'red' });
		await waitForMessage(page, 'first', 'join-game', { playerStatus: 'joined' });
		await sendMessage(page, 'second', { type: 'join-game', color: 'red' });
		const seatError = await waitForMessage(page, 'second', 'error');
		expect(seatError.msg).toContain('occupied');

		await page.evaluate(() => {
			window.__gameSocketClients!.first.socket.send('{malformed');
		});
		const protocolError = await waitForMessage(page, 'first', 'error');
		expect(protocolError.msg).toBeTruthy();

		await sendMessage(page, 'first', { type: 'unknown-event' });
		await sendMessage(page, 'second', { type: 'chat', message: 'still connected' });
		await Promise.all([
			waitForMessage(page, 'first', 'chat', { message: 'still connected' }),
			waitForMessage(page, 'second', 'chat', { message: 'still connected' })
		]);
		await closeClient(page, 'first');
		await waitForMessage(page, 'second', 'room-status');

		await connectClient(page, 'rejoined', room);
		await waitForMessage(page, 'rejoined', 'join-room');
		await sendMessage(page, 'rejoined', { type: 'join-game', color: 'red' });
		await waitForMessage(page, 'rejoined', 'join-game', { playerStatus: 'joined' });
	} finally {
		await Promise.all([
			closeClient(page, 'first'),
			closeClient(page, 'second'),
			closeClient(page, 'rejoined')
		]);
	}
});

test('measures keyboard input through the rendered game-state update', async ({
	page
}, testInfo) => {
	test.setTimeout(20_000);
	const room = `ui-${randomUUID()}`;
	await page.addInitScript(() => {
		const send = WebSocket.prototype.send;
		WebSocket.prototype.send = function (data) {
			if (typeof data === 'string') {
				try {
					const message = JSON.parse(data);
					window.__snakeSentMessages ??= [];
					window.__snakeSentMessages.push({
						type: message.type,
						key: message.key,
						sentAt: performance.now()
					});
				} catch {
					// Leave malformed frames to the server protocol tests.
				}
			}
			send.call(this, data);
		};
	});
	await page.goto(`/game?room=${room}&board=20:20`);

	await expect(page.getByText(`Room name: ${room}`)).toBeVisible();
	await page.getByRole('button', { name: 'Take seat' }).first().click();
	await page.getByText('Click when ready!', { exact: false }).click();
	await expect(page.getByText(/GameState: running/)).toBeVisible({ timeout: 12_000 });

	await page.evaluate(() => {
		window.__snakeSentMessages = [];
		window.__snakeInputCheckStartedAt = performance.now();
	});
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowLeft');
	await expect
		.poll(() =>
			page.evaluate(
				() => window.__snakeSentMessages?.filter((message) => message.type === 'movement').length
			)
		)
		.toBe(2);
	const inputMessages = await page.evaluate(() => ({
		startedAt: window.__snakeInputCheckStartedAt!,
		messages:
			window.__snakeSentMessages
				?.filter((message) => message.type === 'movement')
				.map(({ key, sentAt }) => ({ key, sentAt })) ?? []
	}));
	expect(inputMessages.messages.map(({ key }) => key)).toEqual(['ArrowUp', 'ArrowLeft']);
	expect(inputMessages.messages[0].sentAt - inputMessages.startedAt).toBeLessThan(100);
	expect(inputMessages.messages[1].sentAt - inputMessages.messages[0].sentAt).toBeLessThan(100);

	await expect
		.poll(() => page.evaluate(() => performance.getEntriesByName('snake-input-to-render').length), {
			timeout: 5_000
		})
		.toBeGreaterThan(0);

	const duration = await page.evaluate(
		() => performance.getEntriesByName('snake-input-to-render').at(-1)?.duration
	);
	expect(duration).toBeGreaterThan(0);
	expect(duration).toBeLessThan(1000);
	await testInfo.attach('input-to-render.json', {
		body: JSON.stringify({ durationMs: duration }, null, 2),
		contentType: 'application/json'
	});
});

test('keeps the snake on grid steps between authoritative game-state snapshots', async ({
	page
}) => {
	test.setTimeout(20_000);
	const room = `interpolation-${randomUUID()}`;
	await page.goto(`/game?room=${room}&board=20:20`);

	await expect(page.getByText(`Room name: ${room}`)).toBeVisible();
	await expect(page.getByText('(You)')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Take seat' }).first()).toBeVisible();
	await page.getByRole('button', { name: 'Take seat' }).first().click();
	await page.getByText('Click when ready!', { exact: false }).click();
	await expect(page.getByText(/GameState: running/)).toBeVisible({ timeout: 12_000 });
	await expect
		.poll(
			() => page.evaluate(() => performance.getEntriesByName('snake-game-state-received').length),
			{ timeout: 5_000 }
		)
		.toBeGreaterThan(0);

	const sampleCanvas = () =>
		page.evaluate(() => {
			const canvas = document.querySelector('canvas');
			const context = canvas?.getContext('2d');
			if (!canvas || !context) throw new Error('Game canvas is not available');
			const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
			let hash = 2166136261;
			for (const pixel of pixels) hash = Math.imul(hash ^ pixel, 16777619);
			return {
				stateReceivedAt: performance.getEntriesByName('snake-game-state-received').at(-1)
					?.startTime,
				pixelHash: hash
			};
		});

	let stableSnapshotSamples = 0;
	let movementStepObserved = false;
	let before = await sampleCanvas();
	for (
		let attempt = 0;
		attempt < 24 && (!movementStepObserved || stableSnapshotSamples < 3);
		attempt++
	) {
		await page.waitForTimeout(25);
		const after = await sampleCanvas();
		if (before.stateReceivedAt === after.stateReceivedAt) {
			stableSnapshotSamples++;
			expect(
				after.pixelHash,
				'Canvas should not move the snake between unchanged authoritative snapshots'
			).toBe(before.pixelHash);
		} else {
			movementStepObserved = true;
			expect(
				after.pixelHash,
				'Canvas should change only when an authoritative grid step arrives'
			).not.toBe(before.pixelHash);
		}
		before = after;
	}

	expect(stableSnapshotSamples).toBeGreaterThanOrEqual(3);
	expect(movementStepObserved).toBe(true);
});

test('an active player disconnect forfeits their seat and awards the remaining player', async ({
	page
}) => {
	test.setTimeout(20_000);
	await page.goto('/lobby');
	await installSocketHarness(page);

	const room = `forfeit-${randomUUID()}`;
	try {
		await Promise.all([
			connectClient(page, 'forfeiting-player', room),
			connectClient(page, 'remaining-player', room)
		]);
		await Promise.all([
			waitForMessage(page, 'forfeiting-player', 'join-room'),
			waitForMessage(page, 'remaining-player', 'join-room')
		]);
		await sendMessage(page, 'forfeiting-player', { type: 'join-game', color: 'red' });
		await sendMessage(page, 'remaining-player', { type: 'join-game', color: 'blue' });
		await Promise.all([
			waitForMessage(page, 'forfeiting-player', 'join-game', { playerStatus: 'joined' }),
			waitForMessage(page, 'remaining-player', 'join-game', { playerStatus: 'joined' })
		]);
		await sendMessage(page, 'forfeiting-player', { type: 'player-ready' });
		await sendMessage(page, 'remaining-player', { type: 'player-ready' });
		await Promise.all([
			waitForMessage(page, 'forfeiting-player', 'game-status', { gameStatus: 'running' }, 15_000),
			waitForMessage(page, 'remaining-player', 'game-status', { gameStatus: 'running' }, 15_000)
		]);
		await waitForMessage(page, 'remaining-player', 'game-state');

		await closeClient(page, 'forfeiting-player');
		const gameOver = await waitForMessage(page, 'remaining-player', 'gameOver');
		expect(gameOver.winner).toBe('The winner is blue');
	} finally {
		await Promise.all([
			closeClient(page, 'forfeiting-player'),
			closeClient(page, 'remaining-player')
		]);
	}
});

test('a seated human can manage a bot and start a mixed match with it auto-ready', async ({
	page
}) => {
	test.setTimeout(20_000);
	await page.goto('/lobby');
	await installSocketHarness(page);

	const room = `mixed-bots-${randomUUID()}`;
	try {
		await connectClient(page, 'manager', room);
		await waitForMessage(page, 'manager', 'join-room');
		await waitForMessage(page, 'manager', 'room-status');

		await connectClient(page, 'spectator', room);
		await waitForMessage(page, 'spectator', 'join-room');
		await waitForMessage(page, 'spectator', 'room-status');
		await waitForMessage(page, 'manager', 'room-status');
		await sendMessage(page, 'spectator', { type: 'add-bot', color: 'blue' });
		expect((await waitForMessage(page, 'spectator', 'error')).msg).toContain('seated human');

		await sendMessage(page, 'manager', { type: 'join-game', color: 'red' });
		await waitForMessage(page, 'manager', 'join-game', { playerStatus: 'joined' });
		await waitForMessage(page, 'manager', 'room-status');
		await sendMessage(page, 'manager', { type: 'add-bot', color: 'blue' });
		const addedBot = await waitForMessage(page, 'manager', 'room-status');
		expect(addedBot.clients).toContainEqual(
			expect.objectContaining({ displayName: 'Bot Blue', color: 'blue', isBot: true })
		);

		await sendMessage(page, 'manager', { type: 'remove-bot', color: 'blue' });
		const removedBot = await waitForMessage(page, 'manager', 'room-status');
		expect(removedBot.clients).not.toContainEqual(
			expect.objectContaining({ color: 'blue', isBot: true })
		);
		await sendMessage(page, 'manager', { type: 'add-bot', color: 'blue' });
		await waitForMessage(page, 'manager', 'room-status');

		await sendMessage(page, 'manager', { type: 'player-ready' });
		await waitForMessage(page, 'manager', 'game-status', { gameStatus: 'count-down' });
		await waitForMessage(page, 'manager', 'game-status', { gameStatus: 'running' }, 15_000);
		const gameState = await waitForMessage(page, 'manager', 'game-state');
		expect(gameState.data).toContainEqual(expect.objectContaining({ color: 'blue' }));
	} finally {
		await Promise.all([closeClient(page, 'manager'), closeClient(page, 'spectator')]);
	}
});

test('a bot-only match keeps its countdown and simulation after its starter and watchers leave', async ({
	page
}) => {
	test.setTimeout(20_000);
	await page.goto('/lobby');
	await installSocketHarness(page);

	const room = `bot-only-${randomUUID()}`;
	try {
		await connectClient(page, 'starter', room);
		await waitForMessage(page, 'starter', 'join-room');
		await waitForMessage(page, 'starter', 'room-status');
		await sendMessage(page, 'starter', { type: 'start-bot-match' });
		expect((await waitForMessage(page, 'starter', 'error')).msg).toContain('at least two bots');
		await connectClient(page, 'watcher', room);
		await waitForMessage(page, 'watcher', 'join-room');
		await waitForMessage(page, 'watcher', 'room-status');

		await sendMessage(page, 'starter', { type: 'join-game', color: 'red' });
		await waitForMessage(page, 'starter', 'join-game', { playerStatus: 'joined' });
		await waitForMessage(page, 'starter', 'room-status');
		for (const color of ['blue', 'green']) {
			await sendMessage(page, 'starter', { type: 'add-bot', color });
			await waitForMessage(page, 'starter', 'room-status');
		}
		await sendMessage(page, 'starter', { type: 'start-bot-match' });
		expect((await waitForMessage(page, 'starter', 'error')).msg).toContain('leave their seats');
		await sendMessage(page, 'starter', { type: 'leave-seat' });
		await waitForMessage(page, 'starter', 'join-game', { playerStatus: 'spectating' });
		await waitForMessage(page, 'starter', 'room-status');
		await sendMessage(page, 'starter', { type: 'start-bot-match' });
		await Promise.all([
			waitForMessage(page, 'starter', 'game-status', { gameStatus: 'count-down' }),
			waitForMessage(page, 'watcher', 'game-status', { gameStatus: 'count-down' })
		]);

		await closeClient(page, 'starter');
		await waitForMessage(page, 'watcher', 'room-status');
		await waitForMessage(page, 'watcher', 'game-status', { gameStatus: 'running' }, 15_000);
		const firstState = await waitForMessage(page, 'watcher', 'game-state');
		expect((firstState.data as Array<{ color: string }>).map(({ color }) => color).sort()).toEqual([
			'blue',
			'green'
		]);

		await closeClient(page, 'watcher');
		await connectClient(page, 'returning-watcher', room);
		await waitForMessage(page, 'returning-watcher', 'join-room');
		await waitForMessage(page, 'returning-watcher', 'room-status');
		await waitForMessage(page, 'returning-watcher', 'game-state', undefined, 3_000);
	} finally {
		await Promise.all([
			closeClient(page, 'starter'),
			closeClient(page, 'watcher'),
			closeClient(page, 'returning-watcher')
		]);
	}
});
