import { describe, expect, it } from '@jest/globals';
import { calculateRatingChanges, INITIAL_RATING, isRankedMatch } from '../src/rating';

describe('isRankedMatch', () => {
	it('requires at least two distinct registered human participants', () => {
		expect(isRankedMatch([
			{ accountUsername: 'Alice', isBot: false },
			{ accountUsername: 'Bob', isBot: false }
		])).toBe(true);
		expect(isRankedMatch([{ accountUsername: 'Alice', isBot: false }])).toBe(false);
		expect(isRankedMatch([
			{ accountUsername: 'Alice', isBot: false },
			{ accountUsername: null, isBot: false }
		])).toBe(false);
		expect(isRankedMatch([
			{ accountUsername: 'Alice', isBot: false },
			{ accountUsername: null, isBot: true }
		])).toBe(false);
		expect(isRankedMatch([
			{ accountUsername: 'Alice', isBot: false },
			{ accountUsername: 'alice', isBot: false }
		])).toBe(false);
	});
});

describe('calculateRatingChanges', () => {
	it('applies pairwise placement Elo changes with a zero-sum total', () => {
		const results = calculateRatingChanges([
			{ username: 'Alice', rating: INITIAL_RATING, place: 1 },
			{ username: 'Bob', rating: INITIAL_RATING, place: 2 },
			{ username: 'Carol', rating: INITIAL_RATING, place: 3 }
		]);

		expect(results.map(({ rating, change }) => ({ rating, change }))).toEqual([
			{ rating: 1616, change: 16 },
			{ rating: 1600, change: 0 },
			{ rating: 1584, change: -16 }
		]);
		expect(results.reduce((total, result) => total + result.change, 0)).toBe(0);
	});

	it('awards half-credit for tied placements', () => {
		const results = calculateRatingChanges([
			{ username: 'Alice', rating: INITIAL_RATING, place: 1 },
			{ username: 'Bob', rating: INITIAL_RATING, place: 1 }
		]);

		expect(results.map((result) => result.rating)).toEqual([
			INITIAL_RATING,
			INITIAL_RATING
		]);
	});
});