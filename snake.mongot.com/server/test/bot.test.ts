import { describe, expect, it } from "@jest/globals";
import Client from "../src/client";
import { BOT_PLANNING_CELL_BUDGET, chooseBotDirection } from "../src/bot";
import Session from "../src/session";

function makeBot(width = 20, height = 20) {
  const session = new Session({ room: "bots", width, height });
  const bot = new Client("bot-red", true);
  session.join(bot);
  bot.color = "red";
  bot.setGamestate();
  bot.gameState.pos = { x: 5, y: 5 };
  bot.gameState.vel = { x: 1, y: 0 };
  return { session, bot };
}

describe("bot survival planner", () => {
  it("avoids a wall, its own body, and another player when only one legal move remains", () => {
    const { session, bot } = makeBot();
    bot.gameState.pos = { x: 1, y: 1 };
    bot.gameState.vel = { x: -1, y: 0 };
    bot.gameState.snake = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ];

    const opponent = new Client("opponent");
    session.join(opponent);
    opponent.color = "blue";
    opponent.setGamestate();
    opponent.gameState.pos = { x: 1, y: 2 };

    expect(chooseBotDirection(bot, [bot, opponent], 20, 20)).toEqual({
      x: 0,
      y: -1,
    });
  });

  it("looks ahead through a maze instead of greedily choosing the largest open region", () => {
    const { session, bot } = makeBot(8, 8);
    bot.gameState.pos = { x: 3, y: 3 };
    bot.gameState.vel = { x: -1, y: 0 };
    const maze = [
      "....##..",
      "..#.....",
      "#....#..",
      "....#..#",
      "......##",
      ".#....#.",
      ".#......",
      "..#.....",
    ];
    bot.gameState.snake = maze.flatMap((row, y) =>
      [...row].flatMap((cell, x) => (cell === "#" ? [{ x, y }] : [])),
    );

    expect(chooseBotDirection(bot, [...session.clients], 8, 8)).toEqual({
      x: 0,
      y: -1,
    });
  });

  it("prefers continuing straight when safe areas are equal", () => {
    const { bot } = makeBot();

    expect(chooseBotDirection(bot, [bot], 20, 20)).toEqual({ x: 1, y: 0 });
  });

  it("moves toward an opponent's projected path when survival prospects are comparable", () => {
    const { session, bot } = makeBot(100, 100);
    bot.status = "ready";
    const opponent = new Client("opponent");
    session.join(opponent);
    opponent.color = "blue";
    opponent.setGamestate();
    opponent.gameState.pos = { x: 5, y: 2 };
    opponent.gameState.vel = { x: 1, y: 0 };
    opponent.status = "ready";

    expect(chooseBotDirection(bot, [bot, opponent], 100, 100)).toEqual({
      x: 0,
      y: -1,
    });
  });

  it("chooses a known-open turn when occupied-cell inspection reaches the budget", () => {
    const { bot } = makeBot();
    bot.gameState.snake = [
      { x: 6, y: 5 },
      ...Array.from({ length: BOT_PLANNING_CELL_BUDGET }, () => ({
        x: 18,
        y: 18,
      })),
    ];

    expect(chooseBotDirection(bot, [bot], 20, 20)).toEqual({ x: 0, y: 1 });
  });
});
