import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface Highscore {
  username: string;
  wins: number;
  losses: number;
}

interface MatchResult {
  username: string;
  won: boolean;
}

type HighscoreData = Record<string, Highscore>;

function isHighscore(value: unknown): value is Highscore {
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
    value.losses >= 0
  );
}

function isHighscoreData(value: unknown): value is HighscoreData {
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
          b.wins - a.wins ||
          a.losses - b.losses ||
          a.username.localeCompare(b.username)
      )
      .slice(0, limit);
  }

  recordMatch(results: MatchResult[]): Promise<void> {
    const update = this.writeQueue.then(async () => {
      const data = await this.read();
      for (const result of results) {
        const username = result.username.trim();
        if (!username) continue;
        const key = username.toLowerCase();
        const score = Object.prototype.hasOwnProperty.call(data, key)
          ? data[key]
          : { username, wins: 0, losses: 0 };
        score[result.won ? 'wins' : 'losses'] += 1;
        data[key] = score;
      }
      await this.write(data);
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
    Object.assign(data, parsed);
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
