interface PlayerColor {
	status: string;
	clientId: string;
	displayName?: string;
	isBot?: boolean;
}

interface PlayerColors {
	[key: string]: PlayerColor | null;
}

export const BOARD = {
	width: 0,
	height: 0
};

export const PLAYER_COLORS: PlayerColors = {
	red: null,
	blue: null,
	green: null,
	yellow: null
} as const;
