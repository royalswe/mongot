import type { GameState } from './models/gameState';
import type Session from './session';
import { COLOR, VELOCITY } from "./constants/constants";
import { PLAYER_STATUS } from './constants/status';
import { startPosition } from './helpers/utils';

export default class Client {
  id: string;
  readonly isBot: boolean;
  readonly accountUsername: string | null;
  color!: string;
  session!: Session;
  status: string;
  gameState!: GameState;

  constructor(id: string, isBot = false, accountUsername: string | null = null) {
    this.id = id;
    this.isBot = isBot;
    this.accountUsername = accountUsername;
    this.status = PLAYER_STATUS.spectating;
  }

  get displayName() {
    if (!this.isBot) return this.id;
    return `Bot ${this.color.charAt(0).toUpperCase()}${this.color.slice(1)}`;
  }

  setGamestate() {
    const width = this.session.width;
    const height = this.session.height;

    this.gameState = {
      color: this.color,
      pos: startPosition(width, height, this.color),
      vel: VELOCITY[Object.keys(VELOCITY)[COLOR[this.color]]],
      directionQueue: [],
      snake: [],
      grid: { x: width, y: height },
    };
  }

}