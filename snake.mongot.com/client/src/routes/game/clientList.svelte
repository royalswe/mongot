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
			.map((client) => client.ratingUsername)
			.filter((username): username is string => Boolean(username));
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
					ratingUsername: client.ratingUsername
				};
			}
		});

		return players;
	});
</script>

<div class="client-list">
	<div class="seats-heading">
		<h2><i class="fa fa-users" aria-hidden="true"></i> Players</h2>
		<span class="seat-count">{states.clients.filter((client) => client.color).length} / 4</span>
	</div>
	<ul>
		{#each Object.entries(seats) as [color, player]}
			<li class="seat" class:own-seat={player?.clientId === states.you}>
				<span class="seat-color {color}" aria-label={`${color} snake`}></span>
				<div class="seat-copy">
					{#if player}
						{@const rating = player.ratingUsername
							? ratings[player.ratingUsername.toLowerCase()]
							: undefined}
						{#if rating !== undefined}
							<img
								class="mr-1 inline-block h-5 w-5 object-contain"
								src={crownImage(rating)}
								alt="Crown rank"
								title={`Rating ${rating}`}
							/>
						{/if}
						<strong class="player-name">{player.displayName ?? player.clientId}</strong>
						{#if states.you === player.clientId}<span class="you-label">You</span>{/if}
						{#if player.isBot}
							<span class="bot-label"><i class="fa fa-android" aria-hidden="true"></i> Bot</span>
						{/if}
						<span class="seat-status" class:is-ready={player.status === PLAYER_STATUS.ready}>
							{player.status === PLAYER_STATUS.ready
								? waiting
									? 'Ready'
									: 'Playing'
								: 'Not ready'}
						</span>
					{:else}
						<strong class="player-name open-seat">Open seat</strong>
						<span class="seat-status">{color}</span>
					{/if}
				</div>
				<div class="seat-actions">
					{#if player}
						{#if states.you === player.clientId && player.status === PLAYER_STATUS.joined}
							<button
								type="button"
								disabled={!waiting}
								class="seat-button primary"
								onclick={() => send(EVENT.playerReady, {})}
								><i class="fa fa-check" aria-hidden="true"></i> Ready up
							</button>
						{/if}
						{#if player.isBot && canManageBots}
							<button
								type="button"
								class="seat-button icon-button remove-bot"
								aria-label="Remove bot"
								title="Remove bot"
								onclick={() => send(EVENT.removeBot, { color })}
								><i class="fa fa-times" aria-hidden="true"></i>
							</button>
						{/if}
						{#if states.you === player.clientId && waiting && !player.isBot}
							<button
								type="button"
								class="seat-button icon-button"
								aria-label="Leave seat"
								title="Leave seat"
								onclick={() => send(EVENT.leaveSeat, {})}
								><i class="fa fa-sign-out" aria-hidden="true"></i>
							</button>
						{/if}
					{:else if states.playerStatus === PLAYER_STATUS.spectating}
						<button
							type="button"
							class="seat-button take-seat"
							disabled={!waiting || !myParticipant}
							onclick={() => send(EVENT.joinGame, { color })}
							>Take seat
						</button>
					{/if}
					{#if !player && canManageBots}
						<button type="button" class="seat-button" onclick={() => send(EVENT.addBot, { color })}
							><i class="fa fa-android" aria-hidden="true"></i> Add bot
						</button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>

	{#if canStartBotMatch}
		<button
			type="button"
			class="seat-button primary start-bots"
			onclick={() => send(EVENT.startBotMatch, {})}
			>Start bot match
		</button>
	{/if}

	<div class="spectator-heading">
		<h3><i class="fa fa-eye" aria-hidden="true"></i> Spectators</h3>
		<span>{states.clients.filter((client) => !client.color).length}</span>
	</div>
	<ul class="spectators">
		{#each states.clients.filter((client) => !client.color) as spectator}
			<li>
				<span>{spectator.displayName ?? spectator.clientId}</span>
				{#if spectator.clientId === states.you}
					<span class="you-label">You</span>
				{/if}
			</li>
		{:else}
			<li class="empty-spectators">No spectators</li>
		{/each}
	</ul>
</div>

<style lang="postcss">
	.client-list {
		color: var(--game-paper);
	}
	.seats-heading,
	.spectator-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	h2,
	h3 {
		margin: 0;
		font-weight: 900;
	}
	h2 {
		font-size: 1rem;
	}
	h2 i,
	h3 i {
		margin-right: 0.35rem;
		color: var(--game-mint);
	}
	.seat-count {
		color: var(--game-muted);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}
	ul {
		margin: 0.75rem 0 0;
		padding: 0;
		list-style: none;
	}
	.seat {
		display: flex;
		min-height: 4.3rem;
		align-items: center;
		gap: 0.65rem;
		padding: 0.65rem 0;
		border-bottom: 1px solid var(--game-line);
	}
	.seat-color {
		width: 0.8rem;
		height: 1.8rem;
		flex: 0 0 auto;
		border: 1px solid #ffffff40;
		border-radius: 2px;
	}
	.red {
		background: red;
	}
	.blue {
		background: blue;
	}
	.green {
		background: green;
	}
	.yellow {
		background: yellow;
	}
	.seat-copy {
		min-width: 0;
		flex: 1;
		overflow-wrap: anywhere;
	}
	.player-name {
		font-size: 0.8rem;
	}
	.open-seat {
		color: var(--game-muted);
		font-weight: 500;
	}
	.seat-status {
		display: block;
		margin-top: 0.15rem;
		color: var(--game-muted);
		font-size: 0.65rem;
		text-transform: capitalize;
	}
	.is-ready {
		color: var(--game-mint);
	}
	.you-label,
	.bot-label {
		margin-left: 0.25rem;
		color: var(--game-amber);
		font-size: 0.6rem;
	}
	.own-seat .seat-color {
		outline: 1px solid var(--game-paper);
		outline-offset: 3px;
	}
	.seat-actions {
		display: flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.35rem;
	}
	.seat-button {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--game-line);
		border-radius: 3px;
		background: var(--game-ink);
		color: var(--game-paper);
		font-size: 0.7rem;
		font-weight: 800;
		cursor: pointer;
	}
	.seat-button:hover:not(:disabled) {
		border-color: var(--game-lime);
		color: var(--game-lime);
	}
	.seat-button:focus-visible {
		outline: 2px solid var(--game-lime);
		outline-offset: 3px;
	}
	.seat-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.primary {
		border-color: var(--game-lime);
		background: var(--game-lime);
		color: var(--game-ink);
	}
	.primary:hover:not(:disabled) {
		background: #c0ff8d;
		color: var(--game-ink);
	}
	.icon-button {
		width: 2.75rem;
		padding: 0;
	}
	.remove-bot {
		color: var(--game-coral);
	}
	.start-bots {
		width: 100%;
		margin-top: 0.75rem;
	}
	.spectator-heading {
		margin-top: 1.1rem;
		color: var(--game-muted);
		font-size: 0.7rem;
	}
	.spectators {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.75rem;
	}
	.spectators li {
		max-width: 100%;
		overflow-wrap: anywhere;
	}
	.empty-spectators {
		color: var(--game-muted);
		font-size: 0.7rem;
	}
</style>
