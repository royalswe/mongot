import type { UrlParams } from '$models/urlParams';
import { useState } from '#lib/stores/state.svelte';
import { EVENT } from '$server/constants/events';
import { gameMessageHandler, resetGameInputTracking } from './gameMessageHandler';
import { lobbyMessageHandler } from './lobbyMessageHandler';

const states = useState();
const decoder = new TextDecoder('utf-8');
let ws: WebSocket;
/**
 * Create a websocket connection
 * @param {string} socketURL
 * @param params
 * @returns
 */
export const connect = (socketURL: string, params?: UrlParams) => {
	if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
	const connection = new WebSocket(socketURL);
	ws = connection;
	const context = socketURL.split('/').pop();

	if (!connection) {
		// Store an error in our state.  The function will be
		// called with the current state;  this only adds the
		// error.
		states.error = 'Unable to connect';
		return;
	}
	connection.binaryType = 'arraybuffer';

	connection.addEventListener('open', () => {
		if (ws !== connection) return;
		resetGameInputTracking();
		states.error = '';
		if (params) {
			console.log('Connected! lets join ' + params.room);
			send(EVENT.joinRoom, { params });
		}
	});

	connection.addEventListener('message', ({ data }) => {
		if (ws !== connection) return;
		const msg = data instanceof ArrayBuffer ? JSON.parse(decoder.decode(data)) : JSON.parse(data);

		if (context === 'lobby') {
			lobbyMessageHandler(msg);
		} else if (context === 'room') {
			gameMessageHandler(msg);
		}
	});

	connection.addEventListener('close', () => {
		if (ws === connection) {
			resetGameInputTracking();
			states.error = 'Connection lost. Return to the lobby to rejoin.';
		}
	});

	connection.addEventListener('error', (err) => {
		if (ws !== connection) return;
		console.log('websocket error:', err);
		states.error = 'Server encountered an error';
	});
};

export const send = (type: string, message: Record<string, unknown>): void => {
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		console.error('WebSocket is not open.');
		return;
	}
	message = Object.assign({ type }, message);
	ws.send(JSON.stringify(message));
};
