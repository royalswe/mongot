import { describe, expect, test } from '@jest/globals';
import Client from '../src/client';
import Session from '../src/session';
import { PLAYER_STATUS } from '../src/constants/status';
import { getLobbyRooms, isEveryPlayerReady, makeId, startPosition } from '../src/helpers/utils';

describe('game helpers', () => {
	test('generates a six-character client id', () => {
		expect(makeId()).toMatch(/^[a-z0-9]{6}$/);
	});

	test('chooses a starting cell for each player color', () => {
		expect(startPosition(20, 10, 'red')).toEqual({ x: 3, y: 3 });
		expect(startPosition(20, 10, 'blue')).toEqual({ x: 17, y: 7 });
		expect(startPosition(20, 10, 'green')).toEqual({ x: 3, y: 7 });
		expect(startPosition(20, 10, 'yellow')).toEqual({ x: 17, y: 3 });
	});

	test('reports when no client is waiting to join the game', () => {
		const client = new Client('player-1');
		client.status = PLAYER_STATUS.ready;

		expect(isEveryPlayerReady(new Set([client]))).toBe(true);
	});

	test('reports when a client has not joined the game yet', () => {
		const client = new Client('player-1');
		client.status = PLAYER_STATUS.joined;

		expect(isEveryPlayerReady(new Set([client]))).toBe(false);
	});

	test('reports seated players, bots, and spectators separately in the lobby', () => {
		const session = new Session({ room: 'lobby-room', width: 20, height: 20 });
		const player = new Client('player');
		player.color = 'red';
		const bot = new Client('bot-blue', true);
		bot.color = 'blue';
		const spectator = new Client('spectator');
		session.join(player);
		session.join(bot);
		session.join(spectator);

		expect(getLobbyRooms(new Map([[session.room, session]]))).toEqual([
			{
				name: 'lobby-room',
				status: 'waiting',
				seatedCount: 2,
				botCount: 1,
				spectatorCount: 1,
				seatCapacity: 4,
			},
		]);
	});
});
