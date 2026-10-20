interface PlayerColor {
	status: string;
	clientId: string;
	displayName?: string;
	isBot?: boolean;
	ratingUsername?: string | null;
}

interface PlayerColors {
	[key: string]: PlayerColor | null;
}

export { BOARD } from './stores/state.svelte';

export const PLAYER_COLORS: PlayerColors = {
	red: null,
	blue: null,
	green: null,
	yellow: null
} as const;
