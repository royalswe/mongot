import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const serverDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const token = randomUUID();
const smokeDefaults = [
	'--rooms', '1',
	'--spectators', '0',
	'--ramp-seconds', '0',
	'--soak-seconds', '10'
];
const forwardedArgs = process.argv.slice(2).filter((argument) => argument !== '--');
const loadTestArgs = forwardedArgs.length ? forwardedArgs : smokeDefaults;

let server;
let serverExited = false;
let serverSpawnError;
let loadTest;
let stopping = false;

async function getAvailablePort() {
	const probe = createServer();
	await new Promise((resolveListen, reject) => {
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', resolveListen);
	});
	const { port } = probe.address();
	await new Promise((resolveClose, reject) => {
		probe.close((error) => error ? reject(error) : resolveClose());
	});
	return port;
}

function stopProcess(child, signal = 'SIGTERM') {
	if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
	try {
		if (process.platform === 'win32') child.kill(signal);
		else process.kill(-child.pid, signal);
	} catch (error) {
		if (error.code !== 'ESRCH') throw error;
	}
}

async function stopServer(signal = 'SIGTERM') {
	if (!server || serverExited || stopping) return;
	stopping = true;
	stopProcess(server, signal);
	await Promise.race([
		new Promise((resolveExit) => server.once('exit', resolveExit)),
		sleep(5_000)
	]);
	if (!serverExited) stopProcess(server, 'SIGKILL');
}

process.on('SIGINT', () => {
	stopProcess(loadTest, 'SIGINT');
	void stopServer('SIGINT');
});
process.on('SIGTERM', () => {
	stopProcess(loadTest, 'SIGTERM');
	void stopServer('SIGTERM');
});

try {
	const port = await getAvailablePort();
	const metricsURL = `https://127.0.0.1:${port}/__load_test/metrics`;
	const certificateSetup = spawnSync(
		process.execPath,
		['scripts/ensure-dev-certificate.mjs'],
		{ cwd: serverDirectory, stdio: 'inherit' }
	);
	if (certificateSetup.error) throw certificateSetup.error;
	if (certificateSetup.status !== 0) {
		throw new Error('Could not prepare the local development certificate.');
	}

	server = spawn(process.execPath, [
		'node_modules/ts-node-dev/lib/bin.js',
		'--respawn',
		'--ignore-watch',
		'src/snakeChat.json',
		'src/app.ts'
	], {
		cwd: serverDirectory,
		detached: process.platform !== 'win32',
		stdio: 'inherit',
		env: {
			...process.env,
			ALIEN_UWS: '1',
			COOKIE_SECRET: 'local-load-test-secret',
			NODE_ENV: 'development',
			PORT: String(port),
			SNAKE_LOAD_TEST_TOKEN: token
		}
	});
	server.once('exit', () => {
		serverExited = true;
	});
	server.once('error', (error) => {
		serverSpawnError = error;
		serverExited = true;
	});

	let ready = false;
	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline && !serverExited) {
		try {
			const response = await fetch(metricsURL, {
				headers: { authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(2_000)
			});
			if (response.ok) {
				ready = true;
				break;
			}
		} catch {
			await sleep(500);
		}
	}

	if (!ready) {
		if (serverSpawnError) throw serverSpawnError;
		throw new Error(
			serverExited
				? 'The isolated server exited before becoming ready. Check whether port 5300 is already in use.'
				: 'Timed out waiting for the isolated server to become ready.'
		);
	}

	console.log('Isolated server ready. Starting the load test.');
	loadTest = spawn(process.execPath, [
		'scripts/load-test.mjs',
		'--url',
		`wss://127.0.0.1:${port}/api/room`,
		...loadTestArgs
	], {
		cwd: serverDirectory,
		stdio: 'inherit',
		env: {
			...process.env,
			NODE_USE_SYSTEM_CA: '1',
			SNAKE_LOAD_TEST_TOKEN: token
		}
	});

	const loadTestExitCode = await new Promise((resolveExit, reject) => {
		loadTest.once('error', reject);
		loadTest.once('exit', (code, signal) => {
			if (signal) {
				resolveExit(1);
				return;
			}
			resolveExit(code ?? 1);
		});
	});
	process.exitCode = loadTestExitCode;
} catch (error) {
	console.error(error);
	process.exitCode = 1;
} finally {
	stopProcess(loadTest);
	await stopServer();
}
