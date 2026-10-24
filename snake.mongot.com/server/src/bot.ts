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
  // True when every searched path ran out of moves before the budget did.
  deadEnd: boolean;
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

    if (!nextBeam.length) {
      return { depth, mobility: deepestMobility, deadEnd: true };
    }
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
    deadEnd: false,
  };
}

interface TerritoryEvaluation {
  botTerritory: number;
  oppTerritory: number;
  contested: number;
  botReachable: number;
  cutoffBonus: number;
}

function evaluateTerritoryAndIntercept(
  botNext: Cell,
  opponents: BotParticipant[],
  occupied: Set<string>,
  width: number,
  height: number,
  budget: { remaining: number },
  maxBfsCells: number,
): TerritoryEvaluation {
  let cutoffBonus = 0;

  for (const opponent of opponents) {
    const state = opponent.gameState;
    const dir = state.directionQueue[0] ?? state.vel;
    let proj = state.pos;
    for (let step = 1; step <= 6; step++) {
      proj = { x: proj.x + dir.x, y: proj.y + dir.y };
      if (!isInsideBoard(proj, width, height) || occupied.has(key(proj))) break;
      const dist = Math.abs(botNext.x - proj.x) + Math.abs(botNext.y - proj.y);
      if (1 + dist < step) {
        cutoffBonus += (7 - step) * 15;
      }
    }
  }

  const oppArrivalTime = new Map<string, number>();
  for (const opponent of opponents) {
    const state = opponent.gameState;
    const dir = state.directionQueue[0] ?? state.vel;
    let proj = state.pos;
    for (let step = 1; step <= 3; step++) {
      proj = { x: proj.x + dir.x, y: proj.y + dir.y };
      if (!isInsideBoard(proj, width, height) || occupied.has(key(proj))) break;
      const k = key(proj);
      if (!oppArrivalTime.has(k)) {
        oppArrivalTime.set(k, step);
      }
    }
  }
  let cellsInspected = 0;
  const cellDist = new Map<string, { dist: number; owner: number }>();

  type QueueNode = { x: number; y: number; dist: number; owner: number };
  const queue: QueueNode[] = [];

  const botKey = key(botNext);
  cellDist.set(botKey, { dist: 0, owner: 0 });
  queue.push({ x: botNext.x, y: botNext.y, dist: 0, owner: 0 });

  let oppIdx = 1;
  for (const opponent of opponents) {
    const state = opponent.gameState;
    const dir = state.directionQueue[0] ?? state.vel;
    const oppNext = { x: state.pos.x + dir.x, y: state.pos.y + dir.y };
    if (isInsideBoard(oppNext, width, height) && !occupied.has(key(oppNext))) {
      const k = key(oppNext);
      if (!cellDist.has(k)) {
        cellDist.set(k, { dist: 0, owner: oppIdx });
        queue.push({ x: oppNext.x, y: oppNext.y, dist: 0, owner: oppIdx });
      } else if (cellDist.get(k)!.owner === 0) {
        cellDist.set(k, { dist: 0, owner: -1 });
      }
    }
    oppIdx++;
  }

  let head = 0;
  while (head < queue.length && budget.remaining > 0 && cellsInspected < maxBfsCells) {
    const current = queue[head++];

    // If this cell was contested or claimed by another owner, it is a collision boundary
    if (cellDist.get(key(current))!.owner !== current.owner) {
      continue;
    }

    cellsInspected++;
    budget.remaining--;

    const nextDist = current.dist + 1;
    for (const dir of DIRECTION_ORDER) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      const nPos = { x: nx, y: ny };
      if (!isInsideBoard(nPos, width, height)) continue;
      const nKey = key(nPos);
      if (occupied.has(nKey)) continue;

      if (current.owner === 0 && oppArrivalTime.has(nKey)) {
        const oppStep = oppArrivalTime.get(nKey)!;
        if (1 + nextDist > oppStep) {
          continue;
        }
      }

      const existing = cellDist.get(nKey);
      if (!existing) {
        cellDist.set(nKey, { dist: nextDist, owner: current.owner });
        queue.push({ x: nx, y: ny, dist: nextDist, owner: current.owner });
      } else if (existing.dist === nextDist) {
        if (existing.owner !== current.owner && existing.owner !== -1) {
          existing.owner = -1;
        }
      }
    }
  }

  let botTerritory = 0;
  let oppTerritory = 0;
  let contested = 0;
  let botReachable = 0;

  for (const entry of cellDist.values()) {
    if (entry.owner === 0) {
      botTerritory++;
      botReachable++;
    } else if (entry.owner === -1) {
      contested++;
      botReachable++;
    } else {
      oppTerritory++;
    }
  }

  return {
    botTerritory,
    oppTerritory,
    contested,
    botReachable,
    cutoffBonus,
  };
}

function compactnessScore(
  position: Cell,
  occupied: Set<string>,
  width: number,
  height: number,
): number {
  let neighbors = 0;
  for (const dir of DIRECTION_ORDER) {
    const adj = { x: position.x + dir.x, y: position.y + dir.y };
    if (!isInsideBoard(adj, width, height) || occupied.has(key(adj))) {
      neighbors++;
    }
  }
  return neighbors;
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

  const opponents = players.filter(
    (player) => player.id !== bot.id && player.status === PLAYER_STATUS.ready,
  );

  const primaryOpponentPositions = new Set<string>();
  const contestedOpponentPositions = new Set<string>();

  for (const opponent of opponents) {
    const oppState = opponent.gameState;
    const primaryDir = oppState.directionQueue[0] ?? oppState.vel;
    const primaryNext = {
      x: oppState.pos.x + primaryDir.x,
      y: oppState.pos.y + primaryDir.y,
    };
    if (isInsideBoard(primaryNext, width, height) && !occupied.has(key(primaryNext))) {
      primaryOpponentPositions.add(key(primaryNext));
      contestedOpponentPositions.add(key(primaryNext));
    }

    const oppMoves = oppState.directionQueue.length
      ? [oppState.directionQueue[0]]
      : nextDirections(oppState.vel);
    for (const dir of oppMoves) {
      const next = {
        x: oppState.pos.x + dir.x,
        y: oppState.pos.y + dir.y,
      };
      if (isInsideBoard(next, width, height) && !occupied.has(key(next))) {
        contestedOpponentPositions.add(key(next));
      }
    }
  }

  // Prioritize completely safe moves that avoid all contested head-on cells
  const safeOptions = options.filter((direction) => {
    const next = { x: state.pos.x + direction.x, y: state.pos.y + direction.y };
    return !contestedOpponentPositions.has(key(next));
  });

  const nonPrimaryOptions = options.filter((direction) => {
    const next = { x: state.pos.x + direction.x, y: state.pos.y + direction.y };
    return !primaryOpponentPositions.has(key(next));
  });

  const decisionOptions = safeOptions.length
    ? safeOptions
    : nonPrimaryOptions.length
      ? nonPrimaryOptions
      : options;

  if (decisionOptions.length === 1) {
    return decisionOptions[0];
  }

  const decisionBudgetPerOption = Math.floor(
    budget.remaining / decisionOptions.length,
  );

  let bestDirection = decisionOptions[0];
  let bestScore = -Infinity;

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

    // Territory and cutoff evaluation bounded by board size or 1000 cells
    const territoryLimit = Math.min(Math.min(1000, width * height), branchBudget.remaining);
    const territoryBudget = { remaining: territoryLimit };
    const territory = evaluateTerritoryAndIntercept(
      position,
      opponents,
      occupied,
      width,
      height,
      territoryBudget,
      territoryLimit,
    );
    branchBudget.remaining -= (territoryLimit - territoryBudget.remaining);

    // Deep search with remaining branch budget
    const result = searchFrom(initial, occupied, width, height, branchBudget);
    const pressure = attackPressure(
      position,
      opponents,
      occupied,
      width,
      height,
    );
    const compactness = compactnessScore(position, occupied, width, height);
    const isStraight = direction.x === state.vel.x && direction.y === state.vel.y;

    let score = 0;

    // Survival depth is fundamental: prioritize depth
    score += result.depth * 1000;
    // Survival depth: strong priority up to tactical horizon
    const tacticalHorizon = 8;
    score += Math.min(result.depth, tacticalHorizon) * 1000;
    if (result.depth > tacticalHorizon) {
      score += (result.depth - tacticalHorizon) * (result.deadEnd ? 500 : 50);
    }

    // Territory advantage: controlling space is key in Tron
    score += territory.botTerritory * 10;
    if (opponents.length > 0) {
      score -= territory.oppTerritory * 7;
      score += territory.contested * 3;
    }

    // Trapped in tiny chamber penalty
    if (territory.botReachable < 15) {
      score -= (15 - territory.botReachable) * 100;
    }

    // Cutoff bonus: rewards trapping opponent against boundary
    score += territory.cutoffBonus;

    // Attack pressure: rewards moving toward active opponent's path when survival is comparable
    score += pressure * 15;

    // Compactness: hug existing walls/trails to preserve open interior
    if (compactness === 1 || compactness === 2) {
      score += 8;
    } else if (compactness >= 3) {
      score -= 50;
    }

    // Mobility
    score += result.mobility * 2;

    // Collision hazard penalties
    if (primaryOpponentPositions.has(key(position))) {
      score -= 10000;
    } else if (contestedOpponentPositions.has(key(position))) {
      score -= 2000;
    }

    // Cutoff threat detection: is an opponent about to wall off the bot's path along this direction?
    let cutoffThreat = 0;
    for (const opponent of opponents) {
      const oppState = opponent.gameState;
      const oppDir = oppState.directionQueue[0] ?? oppState.vel;
      let oppProj = oppState.pos;

      for (let oppStep = 1; oppStep <= 6; oppStep++) {
        oppProj = { x: oppProj.x + oppDir.x, y: oppProj.y + oppDir.y };
        if (!isInsideBoard(oppProj, width, height) || occupied.has(key(oppProj))) break;

        let botProj = state.pos;
        for (let botStep = 1; botStep <= 6; botStep++) {
          botProj = { x: botProj.x + direction.x, y: botProj.y + direction.y };
          if (!isInsideBoard(botProj, width, height) || occupied.has(key(botProj))) break;

          // Opponent arrives strictly before the bot, crossing and walling off the bot's path
          if (oppProj.x === botProj.x && oppProj.y === botProj.y && oppStep < botStep) {
            cutoffThreat = Math.max(cutoffThreat, (7 - botStep) * 200);
          }
        }
      }
    }
    score -= cutoffThreat;

    // Straight preference when otherwise tied
    if (isStraight) {
      score += 0.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDirection = direction;
    }
  }

  return bestDirection;
}
