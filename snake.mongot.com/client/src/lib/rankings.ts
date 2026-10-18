const RANK_THRESHOLDS = [900, 1300, 1500, 1700, 1900, 2100, 2300, 2500, 2700, 2900];

export function crownTier(rating: number): number {
	return RANK_THRESHOLDS.filter((threshold) => rating >= threshold).length;
}

export function crownImage(rating: number): string {
	return `/images/rankings/crown${crownTier(rating)}.png`;
}

export async function fetchRatings(usernames: string[]): Promise<Record<string, number>> {
	const uniqueUsernames = [
		...new Set(usernames.map((username) => username.trim()).filter(Boolean))
	];
	if (!uniqueUsernames.length) return {};

	const response = await fetch(
		`/api/ratings?usernames=${encodeURIComponent(uniqueUsernames.join(','))}`
	);
	if (!response.ok) throw new Error(`Ratings request failed: ${response.status}`);

	const result: unknown = await response.json();
	if (typeof result !== 'object' || result === null || Array.isArray(result)) {
		throw new Error('Ratings response has an invalid format');
	}

	const ratings: Record<string, number> = {};
	for (const [username, rating] of Object.entries(result)) {
		if (typeof rating !== 'number' || !Number.isSafeInteger(rating)) {
			throw new Error('Ratings response has an invalid format');
		}
		ratings[username.toLowerCase()] = rating;
	}
	return ratings;
}
