import { describe, expect, it } from "@jest/globals";
import Client from "../src/client";
import Session from "../src/session";
import { chooseBotDirection } from "../src/bot";

function makeMatch(width = 30, height = 30) {
  const session = new Session({ room: "drizzle-test", width, height });
  const bot = new Client("bot-red", true);
  session.join(bot);
  bot.color = "red";
  bot.setGamestate();
  bot.status = "ready";

  const human = new Client("human-blue");
  session.join(human);
  human.color = "blue";
  human.setGamestate();
  human.status = "ready";

  return { session, bot, human };
}

describe("anti-drizzle test", () => {
  it("escapes when human is cutting across to close a box", () => {
    // Scenario: Human has a wall at x=17 from y=10 to 16, now at (17, 16) heading West {-1, 0}
    // Bot is at (15, 14), currently heading South {0, 1}.
    // If bot continues South {0, 1} to (15, 15):
    // Human moves (16, 16) then (15, 16), walling the bot against its own body and human wall!
    // Safe escape is West {-1, 0} into the wide open board (x: 0..14).
    const { session, bot, human } = makeMatch(30, 30);
    human.gameState.pos = { x: 17, y: 16 };
    human.gameState.vel = { x: -1, y: 0 };
    human.gameState.snake = [
      { x: 17, y: 10 },
      { x: 17, y: 11 },
      { x: 17, y: 12 },
      { x: 17, y: 13 },
      { x: 17, y: 14 },
      { x: 17, y: 15 },
      { x: 17, y: 16 },
    ];

    bot.gameState.pos = { x: 15, y: 14 };
    bot.gameState.vel = { x: 0, y: 1 };
    bot.gameState.snake = [
      { x: 15, y: 12 },
      { x: 15, y: 13 },
      { x: 15, y: 14 },
    ];

    const choice = chooseBotDirection(bot, [bot, human], 30, 30);
    console.log("Current choice in drizzle scenario:", choice);
    // Bot should choose West {-1, 0} to escape into open space!
    expect(choice).toEqual({ x: -1, y: 0 });
  });
});

