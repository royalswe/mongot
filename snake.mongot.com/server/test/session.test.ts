import { afterEach, describe, expect, it, jest } from "@jest/globals";
import Client from "../src/client";
import { PLAYER_STATUS, GAME_STATUS } from "../src/constants/status";
import Session, { type SessionRuntime } from "../src/session";

const runtime: SessionRuntime = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
};

function createSession() {
  return new Session({ room: "test", width: 20, height: 20 }, runtime);
}

function addPlayer(
  session: Session,
  id: string,
  color: string,
  pos: { x: number; y: number },
  vel: { x: number; y: number },
  isBot = false,
) {
  const client = new Client(id, isBot);
  session.join(client);
  client.color = color;
  client.setGamestate();
  client.gameState.pos = pos;
  client.gameState.vel = vel;
  client.status = PLAYER_STATUS.ready;
  session.playingClients = [...(session.playingClients || []), client];
  return client;
}

afterEach(() => {
  jest.useRealTimers();
});

describe.each([
  { colors: ["red", "blue"] },
  { colors: ["red", "blue", "green"] },
  { colors: ["red", "blue", "green", "yellow"] },
])("Match outcomes with $colors", ({ colors }) => {
  it.each(
    colors.flatMap((winner) => [
      { winner, reversed: false },
      { winner, reversed: true },
    ]),
  )("declares $winner the winner (reversed order: $reversed)", ({ winner, reversed }) => {
    const session = createSession();
    const players = colors.map((color, index) =>
      addPlayer(
        session,
        color,
        color,
        { x: color === winner ? 10 : 19, y: 2 + index * 3 },
        { x: 1, y: 0 },
      ),
    );
    if (reversed) session.playingClients.reverse();
    const spectator = new Client("spectator");
    session.join(spectator);
    const winningPlayer = players.find((player) => player.color === winner)!;

    expect(session.snakeGrow()).toBe(`The winner is ${winner}`);
    expect(session.matchWinner).toBe(winningPlayer);
    expect(session.matchDraw).toBe(false);
    expect(session.matchPlacements.has(winningPlayer)).toBe(false);
    for (const player of players.filter((player) => player !== winningPlayer)) {
      expect(session.matchPlacements.get(player)).toBe(2);
    }
    expect(session.matchPlacements.has(spectator)).toBe(false);
    expect(players.every((player) => player.status === PLAYER_STATUS.joined)).toBe(true);
  });

  it("waits for the last survivor and preserves elimination placements across turns", () => {
    const session = createSession();
    const players = colors.map((color, index) =>
      addPlayer(
        session,
        color,
        color,
        { x: 19 - index, y: 2 + index * 3 },
        { x: 1, y: 0 },
      ),
    );

    for (let eliminatedIndex = 0; eliminatedIndex < players.length - 1; eliminatedIndex++) {
      const outcome = session.snakeGrow();
      expect(session.matchPlacements.get(players[eliminatedIndex])).toBe(
        players.length - eliminatedIndex,
      );
      if (eliminatedIndex < players.length - 2) {
        expect(outcome).toBeUndefined();
        expect(session.matchWinner).toBeNull();
        expect(players.filter((player) => player.status === PLAYER_STATUS.ready)).toHaveLength(
          players.length - eliminatedIndex - 1,
        );
      } else {
        expect(outcome).toBe(`The winner is ${colors.at(-1)}`);
        expect(session.matchWinner).toBe(players.at(-1));
      }
      expect(session.matchDraw).toBe(false);
    }
    expect([...session.matchPlacements.values()]).toEqual(
      colors.slice(1).map((_, index) => colors.length - index),
    );
  });

  it("declares a draw when every remaining head enters the same cell", () => {
    const session = createSession();
    const approaches = [
      { pos: { x: 9, y: 10 }, vel: { x: 1, y: 0 } },
      { pos: { x: 11, y: 10 }, vel: { x: -1, y: 0 } },
      { pos: { x: 10, y: 9 }, vel: { x: 0, y: 1 } },
      { pos: { x: 10, y: 11 }, vel: { x: 0, y: -1 } },
    ];
    const players = colors.map((color, index) =>
      addPlayer(session, color, color, approaches[index].pos, approaches[index].vel),
    );

    expect(session.snakeGrow()).toBe(`It's a draw between ${colors.join(" and ")}`);
    expect(session.matchWinner).toBeNull();
    expect(session.matchDraw).toBe(true);
    expect([...session.matchPlacements.values()]).toEqual(colors.map(() => 1));
    for (const player of players) {
      expect(player.status).toBe(PLAYER_STATUS.joined);
      expect(player.gameState.pos).toEqual({ x: 10, y: 10 });
    }
  });

  it("declares a draw when all players hit separate walls on the same turn", () => {
    const session = createSession();
    const players = colors.map((color, index) =>
      addPlayer(session, color, color, { x: 19, y: 2 + index * 3 }, { x: 1, y: 0 }),
    );

    expect(session.snakeGrow()).toBe(`It's a draw between ${colors.join(" and ")}`);
    expect(session.matchWinner).toBeNull();
    expect(session.matchDraw).toBe(true);
    for (const player of players) {
      expect(session.matchPlacements.get(player)).toBe(1);
    }
  });
});

describe("Solo match outcomes", () => {
  it("does not declare a surviving solo player the winner and ends their collision as game over", () => {
    const session = createSession();
    const player = addPlayer(session, "solo", "red", { x: 18, y: 5 }, { x: 1, y: 0 });

    expect(session.snakeGrow()).toBeUndefined();
    expect(session.matchWinner).toBeNull();
    expect(player.status).toBe(PLAYER_STATUS.ready);

    expect(session.snakeGrow()).toBe("Game over");
    expect(session.matchWinner).toBeNull();
    expect(session.matchDraw).toBe(false);
    expect(session.matchPlacements.get(player)).toBe(1);
    expect(player.status).toBe(PLAYER_STATUS.joined);
  });
});

describe("Session simulation", () => {
  it("does not run catch-up ticks back-to-back after a delayed timer", () => {
    jest.useFakeTimers();
    let now = 0;
    const timers: Array<{
      callback: () => void;
      handle: ReturnType<typeof setTimeout>;
      delay: number;
    }> = [];
    const controlledRuntime: SessionRuntime = {
      now: () => now,
      setTimeout: (callback, delay) => {
        const handle = setTimeout(() => {}, 1_000_000);
        timers.push({ callback, handle, delay });
        return handle;
      },
      clearTimeout: (handle) => {
        clearTimeout(handle);
        const index = timers.findIndex((timer) => timer.handle === handle);
        if (index !== -1) timers.splice(index, 1);
      },
    };
    const session = new Session(
      { room: "test", width: 20, height: 20 },
      controlledRuntime,
    );
    const callbackTimes: number[] = [];
    const stop = session.gameInterval(() => callbackTimes.push(now), 100);

    now = 350;
    const delayedTick = timers.shift()!;
    clearTimeout(delayedTick.handle);
    delayedTick.callback();

    expect(callbackTimes).toEqual([350]);
    expect(timers[0].delay).toBeGreaterThan(0);
    stop();
  });

  it("advances simulation ticks at 30 Hz and moves every tenth tick", () => {
    const session = createSession();
    const player = addPlayer(
      session,
      "one",
      "red",
      { x: 3, y: 3 },
      { x: 1, y: 0 },
    );

    for (let tick = 0; tick < 9; tick++) {
      expect(session.tick().moved).toBe(false);
    }
    expect(player.gameState.pos).toEqual({ x: 3, y: 3 });
    expect(session.tick()).toEqual({ moved: true, outcome: undefined });
    expect(player.gameState.pos).toEqual({ x: 4, y: 3 });
    expect(player.gameState.snake).toEqual([{ x: 4, y: 3 }]);
  });

  it("buffers two quick turns in order and rejects reversals and excess turns", () => {
    const session = createSession();
    const player = addPlayer(
      session,
      "one",
      "red",
      { x: 5, y: 5 },
      { x: 1, y: 0 },
    );
    player.gameState.snake.push({ x: 4, y: 5 }, { x: 5, y: 5 });

    expect(session.queueDirection(player, { x: 0, y: -1 })).toBe(true);
    expect(session.queueDirection(player, { x: 0, y: 1 })).toBe(false);
    expect(session.queueDirection(player, { x: -1, y: 0 })).toBe(true);
    expect(session.queueDirection(player, { x: 0, y: -1 })).toBe(false);
    expect(session.queueDirection(player, { x: 0, y: 0 })).toBe(false);

    for (let tick = 0; tick < 10; tick++) session.tick();
    expect(player.gameState.pos).toEqual({ x: 5, y: 4 });
    for (let tick = 0; tick < 10; tick++) session.tick();
    expect(player.gameState.pos).toEqual({ x: 4, y: 4 });
  });

  it("eliminates a snake that reaches a board edge and declares the remaining player the winner", () => {
    const session = createSession();
    const red = addPlayer(
      session,
      "red",
      "red",
      { x: 19, y: 4 },
      { x: 1, y: 0 },
    );
    const blue = addPlayer(
      session,
      "blue",
      "blue",
      { x: 10, y: 15 },
      { x: 1, y: 0 },
    );

    expect(session.snakeGrow()).toBe("The winner is blue");
    expect(red.status).toBe(PLAYER_STATUS.joined);
    expect(blue.status).toBe(PLAYER_STATUS.joined);
    expect(session.matchPlacements.get(red)).toBe(2);
  });

  it("resolves simultaneous head-on collisions as a draw", () => {
    const session = createSession();
    const red = addPlayer(session, "red", "red", { x: 5, y: 5 }, { x: 1, y: 0 });
    const blue = addPlayer(session, "blue", "blue", { x: 7, y: 5 }, { x: -1, y: 0 });

    expect(session.snakeGrow()).toBe("It's a draw between red and blue");
    expect(session.matchPlacements.get(red)).toBe(session.matchPlacements.get(blue));
  });

  it("bots turn away from a simultaneous head-on collision when an escape is available", () => {
    const session = createSession();
    const red = addPlayer(
      session,
      "bot-red",
      "red",
      { x: 5, y: 5 },
      { x: 1, y: 0 },
      true,
    );
    const blue = addPlayer(
      session,
      "bot-blue",
      "blue",
      { x: 7, y: 5 },
      { x: -1, y: 0 },
      true,
    );

    expect(session.snakeGrow()).toBeUndefined();
    expect(red.gameState.pos).not.toEqual({ x: 6, y: 5 });
    expect(blue.gameState.pos).not.toEqual({ x: 6, y: 5 });
    expect(red.status).toBe(PLAYER_STATUS.ready);
    expect(blue.status).toBe(PLAYER_STATUS.ready);
  });

  it("eliminates a snake that collides with its own body", () => {
    const session = createSession();
    const red = addPlayer(
      session,
      "red",
      "red",
      { x: 4, y: 4 },
      { x: 1, y: 0 },
    );
    red.gameState.snake.push({ x: 5, y: 4 });

    expect(session.snakeGrow()).toBe("Game over");
    expect(red.status).toBe(PLAYER_STATUS.joined);
  });

  it("eliminates a bot that moves into the body of a player already eliminated this match", () => {
    const session = createSession();
    const bot = addPlayer(
      session,
      "bot-red",
      "red",
      { x: 5, y: 5 },
      { x: 1, y: 0 },
      true,
    );
    bot.gameState.snake = [
      { x: 4, y: 5 },
      { x: 3, y: 5 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
      { x: 6, y: 4 },
      { x: 7, y: 4 },
      { x: 8, y: 4 },
      { x: 8, y: 5 },
      { x: 8, y: 6 },
      { x: 7, y: 6 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
    ];
    const eliminated = addPlayer(
      session,
      "eliminated-blue",
      "blue",
      { x: 10, y: 10 },
      { x: 0, y: 1 },
    );
    eliminated.status = PLAYER_STATUS.joined;
    eliminated.gameState.snake.push({ x: 6, y: 5 });
    session.playingClients = [bot, eliminated];

    expect(session.snakeGrow()).toBe("Game over");
    expect(bot.gameState.pos).toEqual({ x: 6, y: 5 });
    expect(bot.status).toBe(PLAYER_STATUS.ready);
  });

  it("eliminates a snake that runs into an opponent head", () => {
    const session = createSession();
    addPlayer(session, "red", "red", { x: 3, y: 3 }, { x: 1, y: 0 });
    const blue = addPlayer(
      session,
      "blue",
      "blue",
      { x: 4, y: 3 },
      { x: 0, y: -1 },
    );

    expect(session.snakeGrow()).toBe("The winner is blue");
    expect(blue.status).toBe(PLAYER_STATUS.joined);
  });

  it("forfeits and removes a disconnected active player", () => {
    const session = createSession();
    const player = addPlayer(
      session,
      "one",
      "red",
      { x: 3, y: 3 },
      { x: 1, y: 0 },
    );

    session.leave(player);

    expect(session.clients.has(player)).toBe(false);
    expect(session.playingClients).not.toContain(player);
    expect(player.status).toBe(PLAYER_STATUS.joined);
  });

  it("cancels a countdown when readiness no longer holds", async () => {
    jest.useFakeTimers();
    const session = createSession();
    const player = addPlayer(
      session,
      "one",
      "red",
      { x: 3, y: 3 },
      { x: 1, y: 0 },
    );
    session.status = GAME_STATUS.countDown;

    const countdown = session.countDown(1000);
    session.leave(player);
    session.cancelCountdown();

    await expect(countdown).rejects.toThrow("Countdown cancelled");
    expect(session.status).toBe(GAME_STATUS.countDown);
  });
});
