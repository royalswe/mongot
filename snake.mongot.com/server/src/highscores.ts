import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { calculateRatingChanges, INITIAL_RATING } from './rating';

export interface Highscore {
  username: string;
  wins: number;
  losses: number;
  rating: number;
}

interface MatchResult {
  username: string;
  won: boolean;
  place: number;
}

interface StoredHighscore extends Omit<Highscore, 'rating'> {
  rating?: number;
}

type HighscoreData = Record<string, Highscore>;
type StoredHighscoreData = Record<string, StoredHighscore>;

function isHighscore(value: unknown): value is StoredHighscore {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'username' in value &&
    typeof value.username === 'string' &&
    'wins' in value &&
    typeof value.wins === 'number' &&
    Number.isInteger(value.wins) &&
    value.wins >= 0 &&
    'losses' in value &&
    typeof value.losses === 'number' &&
    Number.isInteger(value.losses) &&
    value.losses >= 0 &&
    (!('rating' in value) ||
      (typeof value.rating === 'number' &&
        Number.isSafeInteger(value.rating)))
  );
}

function isHighscoreData(value: unknown): value is StoredHighscoreData {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isHighscore)
  );
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

export class HighscoreStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async getTop(limit = 30): Promise<Highscore[]> {
    await this.writeQueue;
    const data = await this.read();
    return Object.values(data)
      .sort(
        (a, b) =>
          b.rating - a.rating ||
          b.wins - a.wins ||
          a.losses - b.losses ||
          a.username.localeCompare(b.username)
      )
      .slice(0, limit);
  }

  async getRatings(usernames: string[]): Promise<Record<string, number>> {
    await this.writeQueue;
    const data = await this.read();
    return Object.fromEntries(
      usernames.map((username) => {
        const key = username.trim().toLowerCase();
        return [key, data[key]?.rating ?? INITIAL_RATING];
      })
    );
  }

  recordMatch(
    results: MatchResult[],
    options: { rated: boolean; recordStats?: boolean },
  ): Promise<{ username: string; change: number }[]> {
    const update = this.writeQueue.then(async () => {
      let changes: { username: string; change: number }[] = [];
      const data = await this.read();
      for (const result of results) {
        const username = result.username.trim();
        if (!username) continue;
        const key = username.toLowerCase();
        const score = Object.prototype.hasOwnProperty.call(data, key)
          ? data[key]
          : { username, wins: 0, losses: 0, rating: INITIAL_RATING };
        if (options.recordStats !== false) {
          score[result.won ? 'wins' : 'losses'] += 1;
        }
        data[key] = score;
      }

      if (options.rated) {
        const ratingChanges = calculateRatingChanges(
          results.map((result) => {
            const score = data[result.username.trim().toLowerCase()];
            return {
              username: result.username,
              rating: score.rating,
              place: result.place,
            };
          })
        );
        for (const change of ratingChanges) {
          data[change.username.trim().toLowerCase()].rating = change.rating;
        }
        changes = ratingChanges.map(({ username, change }) => ({
          username,
          change,
        }));
      }

      await this.write(data);
      return changes;
    });
    this.writeQueue = update.then(
      () => undefined,
      () => undefined
    );
    return update;
  }

  private async read(): Promise<HighscoreData> {
    let contents: string;
    try {
      contents = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (isNotFound(error)) return Object.create(null) as HighscoreData;
      throw error;
    }

    const parsed: unknown = JSON.parse(contents);
    if (!isHighscoreData(parsed)) {
      throw new Error('High score data contains an invalid record');
    }
    const data: HighscoreData = Object.create(null);
    for (const [key, score] of Object.entries(parsed)) {
      data[key] = { ...score, rating: score.rating ?? INITIAL_RATING };
    }
    return data;
  }

  private async write(data: HighscoreData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(data), { flag: 'wx' });
    await rename(temporaryPath, this.filePath);
  }
}

const highscoreStore = new HighscoreStore(resolve(__dirname, '../../highscores.json'));

export default highscoreStore;
