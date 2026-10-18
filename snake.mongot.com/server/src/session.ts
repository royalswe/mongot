import type { Cell, GameState } from "./models/gameState";
import type { UrlParams } from "./models/urlParams";
import type Client from "./client";
import { PLAYER_STATUS, GAME_STATUS } from "./constants/status";
import { COUNT_DOWN, FRAME_RATE, MOVEMENT_RATE } from "./constants/constants";
import { isEveryPlayerReady } from "./helpers/utils";
import { chooseBotDirection, type BotParticipant } from "./bot";

const MAX_BUFFERED_TURNS = 2;

export interface SessionRuntime {
  now: () => number;
  setTimeout: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
}

const systemRuntime: SessionRuntime = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
};

export default class Session {
  room!: string;
  width!: number;
  height!: number;
  playingClients!: Client[];
  matchParticipants: Client[] = [];
  matchWinner: Client | null = null;
  matchDraw = false;
  clients: Set<Client>;
  status: string;
  timer: ReturnType<typeof setTimeout> | null;
  private readonly runtime: SessionRuntime;
  private movementTicks = 0;
  private countdownReject: ((reason: Error) => void) | null = null;
  botOnlyRun = false;
  stopGameLoop: (() => void) | null = null;

  constructor(params: UrlParams, runtime: SessionRuntime = systemRuntime) {
    Object.assign(this, params);
    this.clients = new Set();
    this.status = "waiting";
    this.timer = null;
    this.runtime = runtime;
  }
  // A
  // B
  // C
  countDown(duration = COUNT_DOWN): Promise<string> {
    this.cancelCountdown();
    return new Promise((resolve, reject) => {
      this.countdownReject = reject;
      this.timer = this.runtime.setTimeout(() => {
        this.timer = null;
        this.countdownReject = null;
        if (!isEveryPlayerReady(this.clients)) {
          reject(
            new Error("At least one seated player must be ready to start"),
          );
          return;
        }

        this.status = GAME_STATUS.running;
        resolve(this.status);
      }, duration);
    });
  }

  cancelCountdown() {
    if (!this.timer) return;
    this.runtime.clearTimeout(this.timer);
    this.timer = null;
    const reject = this.countdownReject;
    this.countdownReject = null;
    reject?.(new Error("Countdown cancelled"));
  }

  gameInterval(callback: () => void, interval: number) {
    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let nextTime = this.runtime.now() + interval;

    const main = () => {
      if (stopped) return;
      callback();
      if (stopped) return;

      nextTime += interval;
      const now = this.runtime.now();
      if (nextTime <= now) {
        const missedIntervals = Math.floor((now - nextTime) / interval) + 1;
        nextTime += missedIntervals * interval;
      }
      timeoutId = this.runtime.setTimeout(main, nextTime - now);
    };

    timeoutId = this.runtime.setTimeout(main, interval);

    return () => {
      stopped = true;
      this.runtime.clearTimeout(timeoutId);
    };
  }

  tick(): { moved: boolean; outcome?: string } {
    this.movementTicks++;
    if (this.movementTicks < FRAME_RATE / MOVEMENT_RATE) {
      return { moved: false };
    }

    this.movementTicks = 0;
    return { moved: true, outcome: this.snakeGrow() };
  }

  queueDirection(client: Client, direction: { x: number; y: number }): boolean {
    const state = client.gameState;
    const previousDirection = state
      ? (state.directionQueue[state.directionQueue.length - 1] ?? state.vel)
      : direction;
    if (
      client.status !== PLAYER_STATUS.ready ||
      !state ||
      state.directionQueue.length >= MAX_BUFFERED_TURNS ||
      !(
        (Math.abs(direction.x) === 1 && direction.y === 0) ||
        (Math.abs(direction.y) === 1 && direction.x === 0)
      ) ||
      (state.snake.length >= 2 &&
        direction.x === -previousDirection.x &&
        direction.y === -previousDirection.y)
    ) {
      return false;
    }

    state.directionQueue.push(direction);
    return true;
  }

  snakeGrow() {
    const matchPlayers = this.playingClients.filter(
      (client) => client.gameState,
    );
    const activePlayers = this.playingClients.filter(
      (client) => client.status === PLAYER_STATUS.ready && client.gameState,
    );
    const nextPositions = new Map<Client, Cell>();
    const planningPlayers: BotParticipant[] = matchPlayers.map((client) => ({
      id: client.id,
      isBot: client.isBot,
      status: client.status,
      gameState: {
        ...client.gameState,
        pos: { ...client.gameState.pos },
        vel: { ...client.gameState.vel },
        directionQueue: client.gameState.directionQueue.map((direction) => ({
          ...direction,
        })),
        snake: client.gameState.snake.map((segment) => ({ ...segment })),
        grid: { ...client.gameState.grid },
      },
    }));
    const botDirections = new Map<Client, Cell>();

    for (const client of activePlayers.filter((player) => player.isBot)) {
      const planningBot = planningPlayers.find(
        (player) => player.id === client.id,
      );
      if (!planningBot) {
        throw new Error(`Missing bot planning snapshot for ${client.id}`);
      }
      botDirections.set(
        client,
        chooseBotDirection(
          planningBot,
          planningPlayers,
          this.width,
          this.height,
        ),
      );
    }

    for (const client of activePlayers) {
      const state = client.gameState;
      if (client.isBot) {
        state.vel = botDirections.get(client)!;
      }
      if (state.directionQueue.length) {
        state.vel = state.directionQueue.shift() || state.vel;
      }
      nextPositions.set(client, {
        x: state.pos.x + state.vel.x,
        y: state.pos.y + state.vel.y,
      });
    }

    const lostPlayers = new Set<string>();
    for (const client of activePlayers) {
      const next = nextPositions.get(client)!;
      const ownState = client.gameState;
      let collided = this.isOutsideBoard(next);

      if (!collided) {
        collided = ownState.snake.some(
          (segment) => segment.x === next.x && segment.y === next.y,
        );
      }

      for (const opponent of matchPlayers) {
        if (collided) break;
        if (opponent === client) continue;

        const opponentState = opponent.gameState;
        const opponentNext = nextPositions.get(opponent);
        collided =
          (opponentState.pos.x === next.x && opponentState.pos.y === next.y) ||
          opponentState.snake.some(
            (segment) => segment.x === next.x && segment.y === next.y,
          ) ||
          Boolean(
            opponentNext &&
            opponentNext.x === next.x &&
            opponentNext.y === next.y,
          );
      }

      if (collided) lostPlayers.add(client.color);
    }

    for (const client of activePlayers) {
      const next = nextPositions.get(client)!;
      client.gameState.pos = next;
      client.gameState.snake.push({ ...next });
      if (lostPlayers.has(client.color)) client.status = PLAYER_STATUS.joined;
    }

    if (!lostPlayers.size) return;

    const winners = this.playingClients.filter(
      (client) => client.status === PLAYER_STATUS.ready,
    );
    if (winners.length === 0) {
      this.matchDraw = lostPlayers.size > 1;
      this.resetPlayers();
      return lostPlayers.size > 1
        ? `It's a draw between ${[...lostPlayers].join(" and ")}`
        : "Game over";
    }
    if (winners.length === 1) {
      this.matchWinner = winners[0];
      this.resetPlayers();
      return "The winner is " + winners[0].color;
    }
  }
  isOutsideBoard({ x, y }: Cell) {
    return x >= this.width || y >= this.height || x < 0 || y < 0;
  }

  isCollide({ y, x }: Cell, stateB: GameState) {
    if (stateB.snake.some((o) => o.x === x && o.y === y)) {
      return true; // snake hits snake
    }

    return this.isOutsideBoard({ x, y });
  }

  join(client: Client) {
    for (const c of this.clients) {
      if (c.id === client.id) {
        return false; // client exist already
      }
    }
    this.clients.add(client);
    client.session = this; // easy to access session from client
  }
  leave(client: Client) {
    if (client.session !== this) {
      throw new Error("client do not exist in session");
    }
    if (client.status === PLAYER_STATUS.ready) {
      client.status = PLAYER_STATUS.joined;
    }
    if (this.playingClients) {
      this.playingClients = this.playingClients.filter(
        (player) => player !== client,
      );
    }
    this.clients.delete(client);
  }

  resetPlayers() {
    this.playingClients.forEach((client) => {
      if (client.isBot) {
        client.status = PLAYER_STATUS.ready;
      } else if (client.status === PLAYER_STATUS.ready) {
        client.status = PLAYER_STATUS.joined;
      }
    });
  }
}
