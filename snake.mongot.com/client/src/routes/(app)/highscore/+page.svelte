<script lang="ts">
	import { onMount } from 'svelte';

	interface Highscore {
		username: string;
		wins: number;
		losses: number;
	}

	function isHighscore(value: unknown): value is Highscore {
		return (
			typeof value === 'object' &&
			value !== null &&
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

	let scores = $state<Highscore[]>([]);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			const response = await fetch('/api/highscores');
			if (!response.ok) throw new Error(`High scores request failed: ${response.status}`);
			const result: unknown = await response.json();
			if (!Array.isArray(result) || !result.every(isHighscore)) {
				throw new Error('High scores response has an invalid format');
			}
			scores = result;
		} catch (cause) {
			console.error('Could not load high scores:', cause);
			error = 'High scores are temporarily unavailable. Please try again later.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>High Score | Snake</title>
	<meta name="description" content="The top 30 Snake players, ranked by wins." />
</svelte:head>

<main class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
	<h1 class="mb-2 text-4xl font-extrabold uppercase tracking-wider text-white">High Score</h1>
	<p class="mb-6 text-lg text-slate-200">The top 30 players, ranked by wins.</p>

	<div class="overflow-x-auto rounded-lg border border-c-blue-800 bg-c-blue-900 shadow-lg">
		<table class="w-full border-collapse text-left text-slate-100">
			<thead class="bg-c-blue-800 uppercase tracking-wide text-white">
				<tr>
					<th scope="col" class="w-20 px-4 py-3">No</th>
					<th scope="col" class="px-4 py-3">Player</th>
					<th scope="col" class="px-4 py-3">Wins</th>
					<th scope="col" class="px-4 py-3">Losses</th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					<tr>
						<td colspan="4" class="px-4 py-8 text-center">Loading high scores…</td>
					</tr>
				{:else if error}
					<tr>
						<td colspan="4" class="px-4 py-8 text-center text-red-200">{error}</td>
					</tr>
				{:else if scores.length === 0}
					<tr>
						<td colspan="4" class="px-4 py-8 text-center">No completed ranked games yet.</td>
					</tr>
				{:else}
					{#each scores as score, index (score.username)}
						<tr class="border-t border-c-blue-700 odd:bg-c-blue-900 even:bg-c-blue-800/60">
							<td class="px-4 py-3 font-bold">{index + 1}</td>
							<td class="px-4 py-3">
								<a
									href={`https://mongot.com/user/${encodeURIComponent(score.username)}`}
									class="font-semibold text-white underline-offset-2 hover:text-c-yellow-400 hover:underline"
								>
									{score.username}
								</a>
							</td>
							<td class="px-4 py-3">{score.wins}</td>
							<td class="px-4 py-3">{score.losses}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</main>
