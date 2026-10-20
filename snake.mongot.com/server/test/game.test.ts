import { afterEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../src/uws', () => ({
	default: { publish: jest.fn() }
}));
jest.mock('../src/highscores', () => ({
	__esModule: true,
	default: { recordMatch: jest.fn(() => Promise.resolve()) }
}));

import Client from '../src/client';
import Game, { sessions } from '../src/game';
import highscoreStore from '../src/highscores';
import { EVENT } from '../src/constants/events';
import { GAME_STATUS, PLAYER_STATUS } from '../src/constants/status';
import type { WebSocket } from '../src/models/webSocket';
import Session from '../src/session';

function createClient(session: Session, id: string, status: string) {
	const client = new Client(id);
	session.join(client);
	client.color = id;
	client.status = status;
	return client;
}

function createSocket(client: Client) {
	return {
		client,
		emitter: {
			roomEmit: jest.fn(),
			lobby: jest.fn()
		}
	} as unknown as WebSocket;
}

afterEach(() => {
	for (const session of sessions.values()) {
		session.cancelCountdown();
	}
	sessions.clear();
	jest.mocked(highscoreStore.recordMatch).mockClear();
	jest.useRealTimers();
});

describe('Game.close high-score recording', () => {
	it('records the winner and loser of a completed account match', () => {
		const session = new Session({ room: 'test', width: 20, height: 20 });
		const departing = new Client('alice', false, 'alice');
		const winner = new Client('bob', false, 'bob');
		for (const player of [departing, winner]) {
			session.join(player);
			player.status = PLAYER_STATUS.ready;
			player.color = player.id;
			player.setGamestate();
		}
		session.status = GAME_STATUS.running;
		session.playingClients = [departing, winner];
		session.matchParticipants = [...session.playingClients];
		sessions.set(session.room, session);

		Game.close(createSocket(departing));

		expect(highscoreStore.recordMatch).toHaveBeenCalledWith([
			{ username: 'alice', won: false, place: 2 },
			{ username: 'bob', won: true, place: 1 }
		], { rated: true, recordStats: true });
	});
});

describe('Game.updateClientList rating identity', () => {
	it('exposes the account username separately from the display name', () => {
		const session = new Session({ room: 'identity-test', width: 20, height: 20 });
		const client = new Client('display-alias', false, 'account-name');
		client.color = 'red';
		client.status = PLAYER_STATUS.joined;
		session.join(client);
		sessions.set(session.room, session);

		expect(Game.updateClientList(session.room)).toEqual([
			{
				clientId: 'display-alias',
				displayName: 'display-alias',
				clientStatus: PLAYER_STATUS.joined,
				color: 'red',
				isBot: false,
				ratingUsername: 'account-name'
			}
		]);
	});
});

describe('Game.close during countdown', () => {
	it('continues the countdown when all remaining seated players are ready', () => {
		jest.useFakeTimers();
		const session = new Session({ room: 'test', width: 20, height: 20 });
		session.status = GAME_STATUS.countDown;
		const departing = createClient(session, 'departing', PLAYER_STATUS.ready);
		const remaining = createClient(session, 'remaining', PLAYER_STATUS.ready);
		sessions.set(session.room, session);
		void session.countDown().catch(() => undefined);
		const timer = session.timer;
		const ws = createSocket(departing);

		Game.close(ws);

		expect(session.status).toBe(GAME_STATUS.countDown);
		expect(session.timer).toBe(timer);
		expect(remaining.status).toBe(PLAYER_STATUS.ready);
		expect(ws.emitter.roomEmit).toHaveBeenCalledWith(EVENT.roomStatus, {
			clients: [{
				clientId: 'remaining',
				clientStatus: PLAYER_STATUS.ready,
				color: 'remaining',
				displayName: 'remaining',
				isBot: false,
				ratingUsername: null
			}]
		});
		expect(ws.emitter.roomEmit).not.toHaveBeenCalledWith(EVENT.gameStatus, {
			gameStatus: GAME_STATUS.waiting
		});
	});

	it('cancels the countdown and resets remaining ready clients when readiness is lost', () => {
		jest.useFakeTimers();
		const session = new Session({ room: 'test', width: 20, height: 20 });
		session.status = GAME_STATUS.countDown;
		const departing = createClient(session, 'departing', PLAYER_STATUS.ready);
		const remaining = createClient(session, 'remaining', PLAYER_STATUS.ready);
		createClient(session, 'not-ready', PLAYER_STATUS.joined);
		sessions.set(session.room, session);
		void session.countDown().catch(() => undefined);
		const ws = createSocket(departing);

		Game.close(ws);

		expect(session.status).toBe(GAME_STATUS.waiting);
		expect(session.timer).toBeNull();
		expect(remaining.status).toBe(PLAYER_STATUS.joined);
		expect(ws.emitter.roomEmit).toHaveBeenCalledWith(EVENT.gameStatus, {
			gameStatus: GAME_STATUS.waiting
		});
		expect(ws.emitter.roomEmit).toHaveBeenCalledWith(EVENT.roomStatus, {
			clients: [
				{
					clientId: 'remaining',
					clientStatus: PLAYER_STATUS.joined,
					color: 'remaining',
					displayName: 'remaining',
					isBot: false,
					ratingUsername: null
				},
				{
					clientId: 'not-ready',
					clientStatus: PLAYER_STATUS.joined,
					color: 'not-ready',
					displayName: 'not-ready',
					isBot: false,
					ratingUsername: null
				}
			]
		});
	});
});
