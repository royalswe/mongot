export interface GameState {
    color: string;
    pos: Cell;
    vel: Cell;
    directionQueue: Cell[];
    snake: Cell[];
    grid: Cell;
}

export interface Cell {
    x: number;
    y: number;
}