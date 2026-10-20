type GameStatus = 'waiting' | 'running' | 'count-down';
type PlayeStatus = 'spectating' | 'joined' | 'ready' | 'running';

export const BOARD = $state({ width: 0, height: 0 });

export interface Client {
	clientId: string;
	displayName?: string;
	clientStatus: string;
	color: string;
	isBot: boolean;
	ratingUsername: string | null;
}

let gameStatus = $state<GameStatus>('waiting');
let playerStatus = $state<PlayeStatus>('spectating');
let clients = $state<Client[]>([]);
let you = $state('');
let error = $state<string | undefined>('');
let lastOutcome = $state<string | undefined>(undefined);

export function useState() {
	return {
		get gameStatus() {
			return gameStatus;
		},
		set gameStatus(value) {
			gameStatus = value;
		},
		get playerStatus() {
			return playerStatus;
		},
		set playerStatus(value) {
			playerStatus = value;
		},
		get clients() {
			return clients;
		},
		set clients(value) {
			clients = value;
		},
		get you() {
			return you;
		},
		set you(value) {
			you = value;
		},
		get error() {
			return error;
		},
		set error(value) {
			error = value;
		},
		get lastOutcome() {
			return lastOutcome;
		},
		set lastOutcome(value) {
			lastOutcome = value;
		}
	};
}
