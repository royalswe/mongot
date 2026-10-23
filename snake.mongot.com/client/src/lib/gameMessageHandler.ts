import { EVENT } from '$server/constants/events';
import { BOARD } from './constants';
import { useSnakes } from '#lib/stores/snakes.svelte';
import { useState, type Client } from '#lib/stores/state.svelte';
import { useChat } from '#lib/stores/chat.svelte';
import { GAME_STATUS } from '$server/constants/status';

const states = useState();
const snakes = useSnakes();
const chat = useChat();
let pendingInputAt: number | undefined;

export function markGameInput(): boolean {
	pendingInputAt ??= performance.now();
	return true;
}

export function resetGameInputTracking() {
	pendingInputAt = undefined;
}

export function gameMessageHandler(msg: any) {
	switch (msg.type) {
		case EVENT.gameState: {
			performance.clearMarks('snake-game-state-received');
			performance.mark('snake-game-state-received');
			snakes.state = msg.data;
			if (pendingInputAt !== undefined) {
				const inputAt = pendingInputAt;
				pendingInputAt = undefined;
				requestAnimationFrame(() => {
					performance.clearMeasures('snake-input-to-render');
					performance.measure('snake-input-to-render', {
						start: inputAt,
						end: performance.now()
					});
				});
			}
			break;
		}
		case EVENT.open:
			states.you = msg.msg;
			chat.add({ message: 'Welcome to the snake game!' });
			break;
		case EVENT.joinGame:
			states.playerStatus = msg.playerStatus;
			break;
		case EVENT.gameStatus:
			if (msg.gameStatus !== GAME_STATUS.waiting) {
				states.lastOutcome = undefined;
			}
			states.gameStatus = msg.gameStatus;
			break;
		case EVENT.joinRoom:
			BOARD.height = msg.height;
			BOARD.width = msg.width;
			break;
		case EVENT.roomStatus:
			states.clients = msg.clients;
			break;
		case EVENT.ratingsUpdated:
			states.clients = [...states.clients];
			for (const { username, change } of msg.changes ?? []) {
				chat.add({
					message: `${username} ${change >= 0 ? 'won' : 'lost'} ${Math.abs(change)} points`
				});
			}
			break;
		case EVENT.chat:
			chat.add({ sender: msg.clientId, message: msg.msg, datetime: msg.datetime });
			break;
		case EVENT.playerReady:
			states.playerStatus = msg.playerStatus;
			break;
		case EVENT.gameOver: {
			resetGameInputTracking();
			const matchingPlayer = msg.clients.find((p: Client) => p.clientId === states.you);
			if (matchingPlayer) {
				states.playerStatus = matchingPlayer.clientStatus;
			}
			states.gameStatus = GAME_STATUS.waiting;
			states.lastOutcome = msg.winner;
			chat.add({ message: msg.winner });
			states.clients = msg.clients;
			break;
		}
		case EVENT.error:
			resetGameInputTracking();
			states.error = msg.msg;
			break;
		default:
			console.log('unknown emit from server', msg);
			break;
	}
}
