type Velocity = {
  [key: string]: { x: number; y: number; };
};

type Color = {
  [key: string]: number;
};

export const VELOCITY: Velocity = {
  ArrowRight: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }
} as const;


export const COLOR: Color = {
  red: 0,
  blue: 1,
  green: 2,
  yellow: 3,
} as const;

export const FRAME_RATE = 30;
export const MOVEMENT_RATE = 3;
export const COUNT_DOWN = 5400;