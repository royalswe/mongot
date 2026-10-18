import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HighscoreStore } from '../src/highscores';
import { INITIAL_RATING } from '../src/rating';

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
				{ username: 'Alice', won: true, place: 1 },
				{ username: 'Bob', won: false, place: 2 }
			], { rated: false }),
			store.recordMatch([
				{ username: 'alice', won: false, place: 2 },
				{ username: 'Carol', won: true, place: 1 }
			], { rated: false }),
			store.recordMatch([
				{ username: 'Bob', won: true, place: 1 },
				{ username: 'Carol', won: true, place: 1 }
			], { rated: false }),
			store.recordMatch([
				{ username: 'Alice', won: false, place: 1 }
			], { rated: false })
		]);

		expect(await store.getTop()).toEqual([
			{ username: 'Carol', wins: 2, losses: 0, rating: INITIAL_RATING },
			{ username: 'Bob', wins: 1, losses: 1, rating: INITIAL_RATING },
			{ username: 'Alice', wins: 1, losses: 2, rating: INITIAL_RATING }
		]);
		expect(await new HighscoreStore(filePath).getTop(2)).toHaveLength(2);
	});

	it('sorts by rating before wins and persists the rated match changes', async () => {
		directory = await mkdtemp(join(tmpdir(), 'snake-highscores-'));
		const filePath = join(directory, 'scores.json');
		await writeFile(filePath, JSON.stringify({
			veteran: { username: 'Veteran', wins: 50, losses: 0 }
		}));
		const store = new HighscoreStore(filePath);

		await store.recordMatch([
			{ username: 'Alice', won: true, place: 1 },
			{ username: 'Bob', won: false, place: 2 }
		], { rated: true });

		const scores = await store.getTop();
		expect(scores.map(({ username }) => username)).toEqual(['Alice', 'Veteran', 'Bob']);
		expect(scores).toEqual([
			{ username: 'Alice', wins: 1, losses: 0, rating: 1616 },
			{ username: 'Veteran', wins: 50, losses: 0, rating: INITIAL_RATING },
			{ username: 'Bob', wins: 0, losses: 1, rating: 1584 }
		]);
	});

	it('updates rating without counting draw results as wins or losses', async () => {
		directory = await mkdtemp(join(tmpdir(), 'snake-highscores-'));
		const filePath = join(directory, 'scores.json');
		const store = new HighscoreStore(filePath);

		await writeFile(filePath, JSON.stringify({
			alice: { username: 'Alice', wins: 3, losses: 1, rating: 1700 },
			bob: { username: 'Bob', wins: 1, losses: 2, rating: 1500 }
		}));
		await store.recordMatch([
			{ username: 'Alice', won: false, place: 1 },
			{ username: 'Bob', won: false, place: 1 }
		], { rated: true, recordStats: false });

		expect(await store.getTop()).toEqual([
			{ username: 'Alice', wins: 3, losses: 1, rating: 1692 },
			{ username: 'Bob', wins: 1, losses: 2, rating: 1508 }
		]);
	});

	it('defaults legacy scores to the initial rating and can look up users', async () => {
		directory = await mkdtemp(join(tmpdir(), 'snake-highscores-'));
		const filePath = join(directory, 'scores.json');
		await writeFile(filePath, JSON.stringify({
			alice: { username: 'Alice', wins: 4, losses: 2 }
		}));
		const store = new HighscoreStore(filePath);

		expect(await store.getRatings(['ALICE', 'Bob'])).toEqual({
			alice: INITIAL_RATING,
			bob: INITIAL_RATING
		});
		expect((await store.getTop())[0]).toEqual({
			username: 'Alice',
			wins: 4,
			losses: 2,
			rating: INITIAL_RATING
		});
	});
});
