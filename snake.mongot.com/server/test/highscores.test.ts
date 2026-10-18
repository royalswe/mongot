import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HighscoreStore } from '../src/highscores';

let directory: string;

afterEach(async () => {
	if (directory) {
		await rm(directory, { recursive: true, force: true });
		directory = '';
	}
});

describe('HighscoreStore', () => {
	it('persists concurrent results and ranks by wins, then fewer losses', async () => {
		directory = await mkdtemp(join(tmpdir(), 'snake-highscores-'));
		const filePath = join(directory, 'scores.json');
		const store = new HighscoreStore(filePath);

		await Promise.all([
			store.recordMatch([
				{ username: 'Alice', won: true },
				{ username: 'Bob', won: false }
			]),
			store.recordMatch([
				{ username: 'alice', won: false },
				{ username: 'Carol', won: true }
			]),
			store.recordMatch([
				{ username: 'Bob', won: true },
				{ username: 'Carol', won: true }
			]),
			store.recordMatch([
				{ username: 'Alice', won: false }
			])
		]);

		expect(await store.getTop()).toEqual([
			{ username: 'Carol', wins: 2, losses: 0 },
			{ username: 'Bob', wins: 1, losses: 1 },
			{ username: 'Alice', wins: 1, losses: 2 }
		]);
		expect(await new HighscoreStore(filePath).getTop(2)).toHaveLength(2);
	});
});
