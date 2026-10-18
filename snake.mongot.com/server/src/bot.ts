import type { Cell } from "./models/gameState";
import type Client from "./client";
import { PLAYER_STATUS } from "./constants/status";

export const BOT_PLANNING_CELL_BUDGET = 10_000;
export type BotParticipant = Pick<
  Client,
  "id" | "isBot" | "status" | "gameState"
>;

const BEAM_WIDTH = 48;
const MAX_DIRECTION_OPTIONS = 3;
const DIRECTION_ORDER: Cell[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

type Plan = {
  position: Cell;
  direction: Cell;
  path: Set<string>;
  mobility: number;
};

type SearchResult = {
  depth: number;
  mobility: number;
};

function key({ x, y }: Cell) {
  return `${x},${y}`;
}

function isInsideBoard({ x, y }: Cell, width: number, height: number) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function attackPressure(
  position: Cell,
  opponents: BotParticipant[],
  occupied: Set<string>,
  width: number,
  height: number,
) {
  let pressure = 0;

  for (const opponent of opponents) {
    const state = opponent.gameState;
    const direction = state.directionQueue[0] ?? state.vel;
    let target = state.pos;
    let closestDistance =
      Math.abs(position.x - target.x) + Math.abs(position.y - target.y);

    for (let step = 0; step < 4; step++) {
      const next = { x: target.x + direction.x, y: target.y + direction.y };
      if (!isInsideBoard(next, width, height) || occupied.has(key(next))) {
        break;
      }
      target = next;
      closestDistance = Math.min(
        closestDistance,
        Math.abs(position.x - target.x) + Math.abs(position.y - target.y),
      );
    }

    pressure +=
      closestDistance === 0 ? -20 : Math.max(0, 12 - closestDistance * 2);
  }

  return pressure;
}

function nextDirections(direction: Cell) {
  return [
    direction,
    ...DIRECTION_ORDER.filter(
      (candidate) =>
        (candidate.x !== direction.x || candidate.y !== direction.y) &&
        (candidate.x !== -direction.x || candidate.y !== -direction.y),
    ),
  ];
}

function availableMoves(
  plan: Plan,
  occupied: Set<string>,
  width: number,
  height: number,
  budget: { remaining: number },
) {
  const moves: Cell[] = [];
  for (const direction of nextDirections(plan.direction)) {
    if (budget.remaining === 0) break;
    budget.remaining--;
    const next = {
      x: plan.position.x + direction.x,
      y: plan.position.y + direction.y,
    };
    if (
      isInsideBoard(next, width, height) &&
      !occupied.has(key(next)) &&
      !plan.path.has(key(next))
    ) {
      moves.push(direction);
    }
  }
  return moves;
}

function searchFrom(
  initial: Plan,
  occupied: Set<string>,
  width: number,
  height: number,
  budget: { remaining: number },
): SearchResult {
  let beam = [initial];
  let depth = 1;
  let deepestMobility = initial.mobility;

  while (beam.length && budget.remaining > 0) {
    const nextBeam: Plan[] = [];

    for (const plan of beam) {
      const moves = availableMoves(plan, occupied, width, height, budget);
      if (!moves.length) {
        deepestMobility = Math.max(deepestMobility, plan.mobility);
        continue;
      }

      for (const direction of moves) {
        const position = {
          x: plan.position.x + direction.x,
          y: plan.position.y + direction.y,
        };
        const path = new Set(plan.path);
        path.add(key(position));
        const nextPlan: Plan = {
          position,
          direction,
          path,
          mobility: 0,
        };
        nextPlan.mobility = availableMoves(
          nextPlan,
          occupied,
          width,
          height,
          budget,
        ).length;
        deepestMobility = Math.max(deepestMobility, nextPlan.mobility);
        nextBeam.push(nextPlan);
        if (budget.remaining === 0) break;
      }
      if (budget.remaining === 0) break;
    }

    if (!nextBeam.length) return { depth, mobility: deepestMobility };
    nextBeam.sort((left, right) => right.mobility - left.mobility);
    beam = nextBeam.slice(0, BEAM_WIDTH);
    depth++;
  }

  return {
    depth,
    mobility: beam.reduce(
      (best, plan) => Math.max(best, plan.mobility),
      deepestMobility,
    ),
  };
}

export function chooseBotDirection(
  bot: BotParticipant,
  players: BotParticipant[],
  width: number,
  height: number,
): Cell {
  const state = bot.gameState;
  const occupied = new Set<string>();
  let inspected = 0;
  let completeOccupancyScan = true;

  for (const player of players) {
    if (!player.gameState) continue;
    if (inspected >= BOT_PLANNING_CELL_BUDGET - MAX_DIRECTION_OPTIONS) {
      completeOccupancyScan = false;
      break;
    }
    inspected++;
    occupied.add(key(player.gameState.pos));
    for (const cell of player.gameState.snake) {
      if (inspected >= BOT_PLANNING_CELL_BUDGET - MAX_DIRECTION_OPTIONS) {
        completeOccupancyScan = false;
        break;
      }
      inspected++;
      occupied.add(key(cell));
    }
    if (!completeOccupancyScan) break;
  }

  const budget = { remaining: BOT_PLANNING_CELL_BUDGET - inspected };
  const currentPlan: Plan = {
    position: state.pos,
    direction: state.vel,
    path: new Set([key(state.pos)]),
    mobility: 0,
  };
  const options: Cell[] = [];
  for (const direction of nextDirections(state.vel)) {
    if (budget.remaining === 0) break;
    budget.remaining--;
    const next = { x: state.pos.x + direction.x, y: state.pos.y + direction.y };
    if (isInsideBoard(next, width, height) && !occupied.has(key(next))) {
      options.push(direction);
    }
  }
  if (!options.length) return state.vel;
  if (!completeOccupancyScan) return options[0];

  let bestDirection = options[0];
  let bestResult: SearchResult = { depth: -1, mobility: -1 };
  let bestPressure = -1;
  const opponents = players.filter(
    (player) => player.id !== bot.id && player.status === PLAYER_STATUS.ready,
  );
  const predictedOpponentPositions = new Set(
    opponents.map((opponent) => {
      const direction =
        opponent.gameState.directionQueue[0] ?? opponent.gameState.vel;
      return key({
        x: opponent.gameState.pos.x + direction.x,
        y: opponent.gameState.pos.y + direction.y,
      });
    }),
  );
  const nonCollidingOptions = options.filter((direction) => {
    const next = { x: state.pos.x + direction.x, y: state.pos.y + direction.y };
    return !predictedOpponentPositions.has(key(next));
  });
  const decisionOptions = nonCollidingOptions.length
    ? nonCollidingOptions
    : options;

  const decisionBudgetPerOption = Math.floor(
    budget.remaining / decisionOptions.length,
  );

  for (const direction of decisionOptions) {
    const branchBudget = { remaining: decisionBudgetPerOption };
    const position = {
      x: state.pos.x + direction.x,
      y: state.pos.y + direction.y,
    };
    const path = new Set(currentPlan.path);
    path.add(key(position));
    const initial: Plan = {
      position,
      direction,
      path,
      mobility: 0,
    };
    initial.mobility = availableMoves(
      initial,
      occupied,
      width,
      height,
      branchBudget,
    ).length;
    const result = searchFrom(initial, occupied, width, height, branchBudget);
    const pressure = attackPressure(
      position,
      opponents,
      occupied,
      width,
      height,
    );

    if (
      result.depth > bestResult.depth ||
      (result.depth === bestResult.depth &&
        (pressure > bestPressure ||
          (pressure === bestPressure && result.mobility > bestResult.mobility)))
    ) {
      bestDirection = direction;
      bestResult = result;
      bestPressure = pressure;
    }
  }

  return bestDirection;
}
