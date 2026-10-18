import { describe, expect, it } from '@jest/globals';
import Client from '../src/client';
import { PLAYER_STATUS } from '../src/constants/status';
import { isEveryPlayerReady, makeId } from '../src/helpers/utils';

function makeClient(id: string, color?: string, status = PLAYER_STATUS.spectating) {
	const client = new Client(id);
	if (color) client.color = color;
	client.status = status;
	return client;
}

describe('readiness', () => {
	it('does not start an empty room', () => {
		expect(isEveryPlayerReady(new Set())).toBe(false);
	});

	it('does not start a spectator-only room', () => {
		expect(isEveryPlayerReady(new Set([makeClient('spectator')]))).toBe(false);
	});

	it('ignores spectators and requires every seated player to be ready', () => {
		const ready = makeClient('ready', 'red', PLAYER_STATUS.ready);
		const waiting = makeClient('waiting', 'blue', PLAYER_STATUS.joined);
		const spectator = makeClient('spectator');

		expect(isEveryPlayerReady(new Set([ready, spectator]))).toBe(true);
		expect(isEveryPlayerReady(new Set([ready, waiting, spectator]))).toBe(false);
	});
});

describe('makeId', () => {
	it('uses an injectable random source while preserving the production id format', () => {
		const id = makeId(() => 0);

		expect(id).toHaveLength(6);
		expect(id).toMatch(/^[a-z0-9]+$/);
	});
});
