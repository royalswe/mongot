import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const defaults = {
	url: 'wss://127.0.0.1:5300/api/room',
	rooms: 10,
	spectators: 100,
	rampSeconds: 300,
	soakSeconds: 1800,
	output: ''
};

function parseArgs() {
	const options = { ...defaults };
	const names = {
		'--url': 'url',
		'--rooms': 'rooms',
		'--spectators': 'spectators',
		'--ramp-seconds': 'rampSeconds',
		'--soak-seconds': 'soakSeconds',
		'--output': 'output'
	};

	const args = process.argv.slice(2).filter((argument) => argument !== '--');
	for (let index = 0; index < args.length; index++) {
		const name = names[args[index]];
		if (!name || args[index + 1] === undefined) {
			throw new Error(`Unknown or incomplete load-test option: ${args[index]}`);
		}
		const value = args[++index];
		options[name] = name === 'url' || name === 'output' ? value : Number(value);
	}

	return options;
}

function percentile(values, percentileValue) {
	if (!values.length) return null;
	const ordered = [...values].sort((left, right) => left - right);
	return ordered[Math.min(ordered.length - 1, Math.ceil(percentileValue * ordered.length) - 1)];
}

function summarize(values) {
	return values.length
		? {
				samples: values.length,
				min: Math.min(...values),
				median: percentile(values, 0.5),
				p95: percentile(values, 0.95),
				p99: percentile(values, 0.99),
				max: Math.max(...values)
			}
		: { samples: 0 };
}

function sleep(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const options = parseArgs();
const target = new URL(options.url);
const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
if (!isLoopback || !['ws:', 'wss:'].includes(target.protocol) || target.pathname !== '/api/room') {
	throw new Error('Load tests are restricted to a local /api/room WebSocket endpoint.');
}
if (!process.env.SNAKE_LOAD_TEST_TOKEN) {
	throw new Error('Set SNAKE_LOAD_TEST_TOKEN in both the isolated server and load-test process.');
}
if (!Number.isInteger(options.rooms) || options.rooms < 1 || options.rooms > 10) {
	throw new Error('The load test supports between 1 and 10 rooms.');
}
if (!Number.isInteger(options.spectators) || options.spectators < 0 || options.spectators > 100) {
	throw new Error('The load test supports between 0 and 100 spectators.');
}
if (!Number.isFinite(options.rampSeconds) || options.rampSeconds < 0 ||
	!Number.isFinite(options.soakSeconds) || options.soakSeconds <= 0) {
	throw new Error('Ramp duration must be non-negative and soak duration must be positive.');
}

const metricsURL = new URL('/__load_test/metrics', target);
metricsURL.protocol = target.protocol === 'wss:' ? 'https:' : 'http:';
const token = process.env.SNAKE_LOAD_TEST_TOKEN;
const seatColors = ['red', 'blue', 'green', 'yellow'];
const initialDirection = {
	red: 'ArrowRight',
	blue: 'ArrowLeft',
	green: 'ArrowUp',
	yellow: 'ArrowDown'
};
const oppositeDirection = {
	ArrowUp: 'ArrowDown',
	ArrowDown: 'ArrowUp',
	ArrowLeft: 'ArrowRight',
	ArrowRight: 'ArrowLeft'
};
const directions = Object.keys(oppositeDirection);
const rooms = Array.from({ length: options.rooms }, (_, index) => ({
	name: `load-${randomUUID()}-${index}`,
	players: [],
	clients: [],
	restarting: false
}));
const expectedClients = options.rooms * seatColors.length + options.spectators;
const loadGeneratorDelay = monitorEventLoopDelay({ resolution: 20 });
const gameTickIntervals = [];
const inputToStateLatencies = [];
const fanoutLatencies = [];
const fanoutDeliveryCounts = [];
const serverSamples = [];
const failures = [];
const clients = [];
const chatRequests = new Map();
const timers = [];
let isStopping = false;

loadGeneratorDelay.enable();

function send(client, message) {
	if (client.socket.readyState === WebSocket.OPEN) {
		client.socket.send(JSON.stringify(message));
	}
}

function matches(message, waiter) {
	return message.type === waiter.type &&
		Object.entries(waiter.expected || {}).every(([key, value]) => message[key] === value);
}

function waitForMessage(client, type, expected = {}, timeout = 10_000) {
	const messageIndex = client.messages.findIndex((message) => matches(message, { type, expected }));
	if (messageIndex >= 0) return Promise.resolve(client.messages.splice(messageIndex, 1)[0]);

	return new Promise((resolve, reject) => {
		const waiter = {
			type,
			expected,
			resolve: (message) => {
				clearTimeout(timer);
				resolve(message);
			},
			reject: (error) => {
				clearTimeout(timer);
				reject(error);
			}
		};
		const timer = setTimeout(() => {
			client.waiters = client.waiters.filter((item) => item !== waiter);
			reject(new Error(`Timed out waiting for ${type} from ${client.id}`));
		}, timeout);
		client.waiters.push(waiter);
	});
}

function onMessage(client, message) {
	const room = client.room;
	const now = performance.now();

	if (message.type === 'error') {
		failures.push({ client: client.id, error: String(message.msg || 'Unknown server error') });
	}
	if (message.type === 'game-status') {
		if (message.gameStatus === 'running') {
			client.status = 'ready';
			room.restarting = false;
		} else if (message.gameStatus === 'waiting') {
			client.status = client.color ? 'joined' : 'spectating';
		}
	}
	if (message.type === 'game-state' && client.color) {
		if (client.lastStateAt !== undefined) {
			gameTickIntervals.push(now - client.lastStateAt);
		}
		client.lastStateAt = now;
		if (client.pendingInputAt !== undefined) {
			inputToStateLatencies.push(now - client.pendingInputAt);
			client.pendingInputAt = undefined;
		}
		const state = message.data?.find((item) => item.color === client.color);
		if (state) client.direction = directionFromVelocity(state.vel);
	}
	if (message.type === 'gameOver' && client.color && !room.restarting) {
		room.restarting = true;
		for (const player of room.players) {
			player.status = 'joined';
			player.lastStateAt = undefined;
			player.pendingInputAt = undefined;
			player.direction = initialDirection[player.color];
			send(player, { type: 'player-ready' });
		}
	}
	if (message.type === 'chat' && typeof message.message === 'string') {
		const request = chatRequests.get(message.message);
		if (request) {
			request.received.add(client.id);
			fanoutLatencies.push(now - request.sentAt);
			if (request.received.size === request.expected) {
				fanoutDeliveryCounts.push(request.received.size);
				chatRequests.delete(message.message);
			}
		}
	}

	const waiterIndex = client.waiters.findIndex((waiter) => matches(message, waiter));
	if (waiterIndex >= 0) client.waiters.splice(waiterIndex, 1)[0].resolve(message);
	else if (message.type === 'join-room' || message.type === 'join-game') {
		client.messages.push(message);
	}
}

function directionFromVelocity(velocity) {
	if (velocity.x === 1) return 'ArrowRight';
	if (velocity.x === -1) return 'ArrowLeft';
	if (velocity.y === 1) return 'ArrowDown';
	return 'ArrowUp';
}

async function connectClient(room, index, color) {
	const id = `${room.name}-${index}`;
	const client = {
		id,
		room,
		color,
		status: color ? 'joined' : 'spectating',
		direction: color ? initialDirection[color] : undefined,
		socket: new WebSocket(target),
		messages: [],
		waiters: [],
		lastStateAt: undefined,
		pendingInputAt: undefined
	};
	client.socket.binaryType = 'arraybuffer';
	client.socket.addEventListener('message', ({ data }) => {
		try {
			const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
			onMessage(client, JSON.parse(text));
		} catch (error) {
			failures.push({ client: client.id, error: `Invalid server message: ${error.message}` });
		}
	});
	client.socket.addEventListener('error', () => {
		failures.push({ client: client.id, error: 'WebSocket connection error' });
	});
	client.socket.addEventListener('close', (event) => {
		if (!isStopping) failures.push({ client: client.id, error: `WebSocket closed (${event.code})` });
	});
	clients.push(client);
	room.clients.push(client);
	if (color) room.players.push(client);

	await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`Timed out opening ${client.id}`)), 10_000);
		client.socket.addEventListener('open', () => {
			clearTimeout(timer);
			send(client, {
				type: 'join-room',
				params: { room: room.name, width: 20, height: 20 }
			});
			resolve();
		}, { once: true });
		client.socket.addEventListener('error', () => {
			clearTimeout(timer);
			reject(new Error(`Could not connect ${client.id}`));
		}, { once: true });
	});
	await waitForMessage(client, 'join-room');

	if (color) {
		send(client, { type: 'join-game', color });
		await waitForMessage(client, 'join-game', { playerStatus: 'joined' });
	}
	return client;
}

async function readServerMetrics() {
	const response = await fetch(metricsURL, {
		headers: { authorization: `Bearer ${token}` }
	});
	if (!response.ok) throw new Error(`Server metrics returned HTTP ${response.status}`);
	serverSamples.push(await response.json());
}

function nextDirection(current) {
	const choices = directions.filter(
		(direction) => direction !== current && direction !== oppositeDirection[current]
	);
	return choices[Math.floor(Math.random() * choices.length)];
}

async function run() {
	await readServerMetrics();
	const rampStartedAt = performance.now();
	const delayPerClient = expectedClients
		? (options.rampSeconds * 1000) / expectedClients
		: 0;

	for (const room of rooms) {
		for (const color of seatColors) {
			await connectClient(room, room.players.length, color);
			if (delayPerClient) await sleep(delayPerClient);
		}
		for (const player of room.players) send(player, { type: 'player-ready' });
	}

	let spectatorIndex = 0;
	for (let index = 0; index < options.spectators; index++) {
		const room = rooms[spectatorIndex++ % rooms.length];
		await connectClient(room, `spectator-${index}`, undefined);
		if (delayPerClient) await sleep(delayPerClient);
	}
	const actualRampSeconds = (performance.now() - rampStartedAt) / 1000;

	timers.push(setInterval(() => {
		for (const client of clients) {
			if (!client.color || client.status !== 'ready' || client.pendingInputAt !== undefined) continue;
			const direction = nextDirection(client.direction);
			client.pendingInputAt = performance.now();
			client.direction = direction;
			send(client, { type: 'movement', key: direction });
		}
	}, 1000));

	timers.push(setInterval(() => {
		for (const room of rooms) {
			const sender = room.players[0];
			if (!sender || sender.socket.readyState !== WebSocket.OPEN) continue;
			const message = `load-${randomUUID()}`;
			chatRequests.set(message, {
				sentAt: performance.now(),
				expected: room.clients.filter((client) => client.socket.readyState === WebSocket.OPEN).length,
				received: new Set()
			});
			send(sender, { type: 'chat', message });
		}
	}, 10_000));

	timers.push(setInterval(() => {
		readServerMetrics().catch((error) => {
			failures.push({ error: `Could not read server metrics: ${error.message}` });
		});
	}, 10_000));

	console.log(`Ramp complete: ${clients.length}/${expectedClients} clients across ${rooms.length} rooms.`);
	await sleep(options.soakSeconds * 1000);

	for (const timer of timers) clearInterval(timer);
	timers.length = 0;
	const fanoutDrainStartedAt = performance.now();
	while (chatRequests.size && performance.now() - fanoutDrainStartedAt < 2_000) {
		await sleep(50);
	}
	const fanoutDrainWaitMs = performance.now() - fanoutDrainStartedAt;
	await readServerMetrics();

	const incompleteFanoutMessages = chatRequests.size;
	const connectedClients = clients.filter((client) => client.socket.readyState === WebSocket.OPEN).length;
	const configuredCapReached = clients.length === expectedClients &&
		connectedClients === expectedClients &&
		failures.length === 0;
	const report = {
		target: target.origin + target.pathname,
		configuration: {
			rampSeconds: options.rampSeconds,
			actualRampSeconds,
			soakSeconds: options.soakSeconds,
			rooms: rooms.length,
			seatedPlayers: rooms.length * seatColors.length,
			spectators: options.spectators,
			configuredClientCap: expectedClients
		},
		result: !configuredCapReached
			? 'server or load-generator failure observed'
			: incompleteFanoutMessages
				? 'inconclusive: chat fan-out did not settle before the drain timeout'
				: 'configured cap reached without observed saturation',
		connectedClients,
		failures,
		metrics: {
			gameTickIntervalMs: summarize(gameTickIntervals),
			inputToStateLatencyMs: summarize(inputToStateLatencies),
			webSocketFanoutLatencyMs: summarize(fanoutLatencies),
			fanoutRecipients: summarize(fanoutDeliveryCounts),
			fanoutDrainWaitMs,
			incompleteFanoutMessages,
			server: {
				samples: serverSamples.length,
				latest: serverSamples.at(-1),
				maxRssBytes: Math.max(...serverSamples.map((sample) => sample.memory.rss))
			},
			loadGenerator: {
				memory: process.memoryUsage(),
				eventLoopDelayMs: {
					mean: loadGeneratorDelay.mean / 1e6,
					p95: loadGeneratorDelay.percentile(95) / 1e6,
					p99: loadGeneratorDelay.percentile(99) / 1e6,
					max: loadGeneratorDelay.max / 1e6
				}
			},
			inputToRender: 'Not measured by this headless WebSocket load generator.'
		}
	};

	console.log(JSON.stringify(report, null, 2));
	if (options.output) await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
	if (failures.length || !configuredCapReached || incompleteFanoutMessages) process.exitCode = 1;
}

try {
	await run();
} catch (error) {
	console.error(error);
	process.exitCode = 1;
} finally {
	isStopping = true;
	loadGeneratorDelay.disable();
	for (const timer of timers) clearInterval(timer);
	for (const client of clients) client.socket.close();
}
