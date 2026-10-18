<script lang="ts">
	import { useState } from '#lib/stores/state.svelte';
	import { send } from '#lib/ws';
	import { EVENT } from '$server/constants/events';
	import { GAME_STATUS, PLAYER_STATUS } from '$server/constants/status';
	import { PLAYER_COLORS } from '#lib/constants';
	import { crownImage, fetchRatings } from '#lib/rankings';

	const states = useState();
	let ratings = $state<Record<string, number>>({});

	$effect(() => {
		const usernames = states.clients
			.filter((client) => client.isRegistered)
			.map((client) => client.displayName ?? client.clientId);
		let current = true;
		void fetchRatings(usernames)
			.then((nextRatings) => {
				if (current) ratings = nextRatings;
			})
			.catch((error: unknown) => console.error('Could not load player ratings:', error));
		return () => {
			current = false;
		};
	});

	const waiting = $derived(states.gameStatus === GAME_STATUS.waiting);
	const myParticipant = $derived(states.clients.find((client) => client.clientId === states.you));
	const canManageBots = $derived(Boolean(myParticipant?.color && !myParticipant.isBot && waiting));
	const hasSeatedHuman = $derived(states.clients.some((client) => client.color && !client.isBot));
	const botCount = $derived(states.clients.filter((client) => client.isBot && client.color).length);
	const canStartBotMatch = $derived(
		waiting && !hasSeatedHuman && botCount >= 2 && states.playerStatus === PLAYER_STATUS.spectating
	);

	let seats = $derived.by(() => {
		const colorKeys = Object.keys(PLAYER_COLORS);
		const players = { ...PLAYER_COLORS };

		colorKeys.forEach((color) => {
			players[color] = null;
		});

		states.clients.forEach((client) => {
			if (client.color) {
				players[client.color] = {
					clientId: client.clientId,
					displayName: client.displayName,
					status: client.clientStatus,
					isBot: client.isBot,
					isRegistered: client.isRegistered
				};
			}
		});

		return players;
	});
</script>

<div class="client-list p-1">
	<h3 class="font-bold mb-2">Players</h3>
	<ul>
		{#each Object.entries(seats) as [color, player]}
			<li class="my-1" class:ready={player?.status === PLAYER_STATUS.ready}>
				<i class="circle {color}"></i>
				{#if player}
					{@const rating = player.isRegistered
						? ratings[(player.displayName ?? player.clientId).toLowerCase()]
						: undefined}
					{#if rating !== undefined}
						<img
							class="mr-1 inline-block h-5 w-5 object-contain"
							src={crownImage(rating)}
							alt="Crown rank"
							title={`Rating ${rating}`}
						/>
					{/if}
					<span>{player.displayName ?? player.clientId}</span>
					{#if player.isBot}
						<span
							class="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800"
							>BOT</span
						>
					{/if}
					{#if states.you === player.clientId && player.status === PLAYER_STATUS.joined}
						<button
							disabled={!waiting}
							class="ml-2 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 hover:shadow-md active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={() => send(EVENT.playerReady, {})}
							>Click when ready!
						</button>
					{/if}
					{#if player.isBot && canManageBots}
						<button
							class="ml-2 inline-flex items-center justify-center rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
							onclick={() => send(EVENT.removeBot, { color })}
							>Remove bot
						</button>
					{/if}
					{#if states.you === player.clientId && waiting && !player.isBot}
						<button
							class="ml-2 inline-flex items-center justify-center rounded-lg bg-slate-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
							onclick={() => send(EVENT.leaveSeat, {})}
							>Leave seat
						</button>
					{/if}
				{:else if states.playerStatus === PLAYER_STATUS.spectating}
					<button
						class="inline-flex items-center justify-center rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-400 hover:shadow-md active:translate-y-px active:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
						onclick={() => send(EVENT.joinGame, { color })}
						>Take seat
					</button>
				{/if}
				{#if !player && canManageBots}
					<button
						class="ml-2 inline-flex items-center justify-center rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
						onclick={() => send(EVENT.addBot, { color })}
						>Add bot
					</button>
				{/if}
			</li>
		{/each}
	</ul>

	{#if canStartBotMatch}
		<button
			class="mt-4 inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
			onclick={() => send(EVENT.startBotMatch, {})}
			>Start bot match
		</button>
	{/if}

	<h3 class="font-bold mt-4 mb-2">Spectators</h3>
	<ul>
		{#each states.clients.filter((client) => !client.color) as spectator}
			<li class="my-1">
				<span>{spectator.displayName ?? spectator.clientId}</span>
				{#if spectator.clientId === states.you}
					<span class="ml-2">(You)</span>
				{/if}
			</li>
		{/each}
	</ul>
</div>

<style lang="postcss">
	.client-list {
		background-color: beige;
		border: 1px solid gray;
		color: #000;
		padding: 1rem;
		border-radius: 0.5rem;
	}

	.circle {
		border-radius: 100%;
		display: inline-block;
		width: 15px;
		height: 15px;
		vertical-align: middle;
		margin-right: 10px;
	}

	.ready .circle::after {
		content: '✓';
		display: block;
		font-size: 13px;
		font-weight: 900;
		color: #0cec13;
		transform: translate(3px, -2px);
	}

	.red {
		background-color: red;
	}
	.blue {
		background-color: blue;
	}
	.green {
		background-color: green;
	}
	.yellow {
		background-color: yellow;
	}
</style>
