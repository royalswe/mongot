import type { GameState } from '$models/gameState';

let state = $state<GameState[]>();

export function useSnakes() {
	return {
		get state() {
			return state;
		},
		set state(value) {
			state = value;
		}
	};
}
