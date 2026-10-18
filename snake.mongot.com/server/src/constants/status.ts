export const PLAYER_STATUS = {
    spectating: 'spectating',
    joined: 'joined',
    ready: 'ready'
} as const;

export const GAME_STATUS = {
    waiting: 'waiting',
    running: 'running',
    countDown: 'count-down'
} as const;