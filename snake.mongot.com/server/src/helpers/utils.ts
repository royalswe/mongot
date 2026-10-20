import type Session from '../session';
import type Client from '../client';
import { COLOR } from '../constants/constants';
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
	return Array.from(sessions.values()).map((session) => {
		const clients = Array.from(session.clients);
		const seatedPlayers = clients.filter((client) => Boolean(client.color));

		return {
			name: session.room,
			status: session.status,
			seatedCount: seatedPlayers.length,
			botCount: seatedPlayers.filter((client) => client.isBot).length,
			spectatorCount: clients.filter((client) => !client.isBot && !client.color).length,
			seatCapacity: Object.keys(COLOR).length,
		};
	});
}
