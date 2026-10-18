import type Session from '../session';
import type Client from '../client';
import { PLAYER_STATUS } from '../constants/status';

export function makeId(random = Math.random) {
	let len = 6;
	let chars = 'abcdefghjkmnopqrstxz0123456789';
	let id = '';
	while (len--) {
		id += chars[(random() * chars.length) | 0];
	}
	return id;
}

export const isEveryPlayerReady = (set: Set<Client>) => {
	const players = [...set].filter((client) => client.status !== PLAYER_STATUS.spectating);
	return players.length > 0 && players.every((client) => client.status === PLAYER_STATUS.ready);
};


export function startPosition(width: number, height: number, key: string) {
	const map = {
		red: { x: 3, y: 3 },
		blue: { x: width - 3, y: height - 3 },
		green: { x: 3, y: height - 3 },
		yellow: { x: width - 3, y: 3 },
	};

	return map[key as keyof typeof map] || console.error(key + ' is not valid key for start position');
}

export function getLobbyRooms(sessions: Map<string, Session>) {
	return Array.from(sessions.values()).map(session => ({
		name: session.room,
		status: session.status,
		clientIds: Array.from(session.clients).map(client => client.displayName)
	}));
}