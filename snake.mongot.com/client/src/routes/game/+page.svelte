<script lang="ts">
	import type { UrlParams } from '$models/urlParams';
	import Snake from './snake.svelte';
	import ErrorModule from '#lib/errorModule.svelte';
	import { connect, send } from '#lib/ws';
	import { useState } from '#lib/stores/state.svelte';
	import { onMount, tick } from 'svelte';
	import { BOARD } from '#lib/constants';
	import { EVENT } from '$server/constants/events';
	import { GAME_STATUS, PLAYER_STATUS } from '$server/constants/status';

	import Chat from '../chat.svelte';
	import ClientList from './clientList.svelte';

	const states = useState();
	let roomName = $state('');
	let selectedPanel = $state<'players' | 'chat'>('players');
	let isCompact = $state(false);

	const gameStatusLabel = $derived(
		states.gameStatus === GAME_STATUS.running
			? 'In progress'
			: states.gameStatus === GAME_STATUS.countDown
				? 'Starting'
				: 'Waiting for players'
	);

	const playerStatusLabel = $derived(
		states.playerStatus === PLAYER_STATUS.spectating
			? 'Spectating'
			: states.playerStatus === PLAYER_STATUS.joined
				? 'Choose when ready'
				: states.gameStatus === GAME_STATUS.running
					? 'Playing'
					: 'Ready'
	);

	onMount(() => {
		const compactQuery = window.matchMedia('(max-width: 900px)');
		const updateCompact = () => {
			isCompact = compactQuery.matches;
		};
		updateCompact();
		compactQuery.addEventListener('change', updateCompact);

		const url = new URLSearchParams(window.location.search);
		roomName = url.get('room') ?? '';
		const board = url.get('board');
		const params: UrlParams = { room: roomName || null };
		if (board) {
			params.width = Number(board.split(':')[0]);
			params.height = Number(board.split(':')[1]);

			BOARD.width = params.width;
			BOARD.height = params.height;
		}

		connect(
			'wss://' +
				location.hostname +
				(location.hostname === 'localhost' ? ':5300' : '') +
				'/api/room',
			params
		);

		return () => compactQuery.removeEventListener('change', updateCompact);
	});

	function prepareForNextRound() {
		send(EVENT.playerReady, {});
	}

	async function findSeat(event: MouseEvent) {
		event.preventDefault();
		selectedPanel = 'players';
		await tick();
		document.getElementById('seat-list')?.scrollIntoView({ block: 'nearest' });
		document.querySelector<HTMLButtonElement>('#seat-list .take-seat')?.focus();
	}
</script>

<svelte:head>
	<title>{roomName ? `${roomName} · Snake` : 'Snake game'}</title>
	<meta name="description" content="Play multiplayer Snake in a shared arena." />
	<style src="./room.postcss"></style>
</svelte:head>

<div class="game-shell">
	<header class="game-topbar">
		<a class="game-brand" href="/lobby" aria-label="Return to the Snake lobby">
			<span class="brand-icon" aria-hidden="true"><i class="fa fa-bolt"></i></span>
			<span class="game-brand-copy">
				<strong>{roomName || 'Snake arena'}</strong>
				<small>BLIP.SE SNAKE</small>
			</span>
		</a>
		<div class="game-state-strip" aria-label="Match and player status" aria-live="polite">
			<span class="state-chip" class:live={states.gameStatus === GAME_STATUS.running}>
				<i
					class={`fa ${
						states.gameStatus === GAME_STATUS.running
							? 'fa-play'
							: states.gameStatus === GAME_STATUS.countDown
								? 'fa-hourglass-o'
								: 'fa-clock-o'
					}`}
					aria-hidden="true"
				></i>
				{gameStatusLabel}
			</span>
			<span class="state-chip player-chip">
				<i
					class={`fa ${
						states.playerStatus === PLAYER_STATUS.spectating
							? 'fa-eye'
							: states.playerStatus === PLAYER_STATUS.joined
								? 'fa-hand-pointer-o'
								: 'fa-gamepad'
					}`}
					aria-hidden="true"
				></i>
				{playerStatusLabel}
			</span>
		</div>
		<a class="back-to-lobby" href="/lobby">
			<i class="fa fa-arrow-left" aria-hidden="true"></i>
			<span>Lobby</span>
		</a>
	</header>

	<div class="game-workspace">
		<main class="play-area" aria-label="Snake game board">
			{#if states.lastOutcome}
				<section class="result-card" aria-live="polite" aria-label="Match result">
					<div class="result-icon"><i class="fa fa-flag-checkered" aria-hidden="true"></i></div>
					<div class="result-copy">
						<p class="section-kicker">Round complete</p>
						<h1>{states.lastOutcome}</h1>
						<p>
							{states.playerStatus === PLAYER_STATUS.joined
								? 'Your seat is ready when you are.'
								: states.playerStatus === PLAYER_STATUS.spectating
									? 'Take an open seat below to join the next round, or stay and watch.'
									: 'The arena is open for another round.'}
						</p>
					</div>
					{#if states.playerStatus === PLAYER_STATUS.joined}
						<button class="result-action" type="button" onclick={prepareForNextRound}>
							Ready up <i class="fa fa-arrow-right" aria-hidden="true"></i>
						</button>
					{:else if states.playerStatus === PLAYER_STATUS.spectating}
						<a class="result-action" href="#seat-list" onclick={findSeat}>
							Find a seat <i class="fa fa-arrow-right" aria-hidden="true"></i>
						</a>
					{/if}
				</section>
			{/if}

			<div class="board-heading">
				<div>
					<h1 class="arena-title">Arena</h1>
				</div>
			</div>
			<div class="board-frame">
				<Snake />
			</div>
		</main>

		<aside class="game-sidebar" aria-label="Players and room chat">
			<div class="sidebar-tabs" role="group" aria-label="Room panels">
				<button
					type="button"
					class:active={selectedPanel === 'players'}
					aria-pressed={selectedPanel === 'players'}
					onclick={() => (selectedPanel = 'players')}
				>
					<i class="fa fa-users" aria-hidden="true"></i> Players
				</button>
				<button
					type="button"
					class:active={selectedPanel === 'chat'}
					aria-pressed={selectedPanel === 'chat'}
					onclick={() => (selectedPanel = 'chat')}
				>
					<i class="fa fa-comments" aria-hidden="true"></i> Chat
				</button>
			</div>
			{#if !isCompact || selectedPanel === 'players'}
				<section id="seat-list" class="sidebar-panel player-panel" aria-label="Players and seats">
					<ClientList />
				</section>
			{/if}
			{#if !isCompact || selectedPanel === 'chat'}
				<section class="sidebar-panel game-chat-panel" aria-label="Room chat">
					<div class="panel-heading">
						<div>
							<p class="section-kicker">Room channel</p>
							<h2><i class="fa fa-comments" aria-hidden="true"></i> Chat</h2>
						</div>
						<span class="chat-live"><span class="status-dot"></span> Live</span>
					</div>
					<Chat>
						<span slot="sender" class="chat-sender" let:sender>{sender}:</span>
					</Chat>
				</section>
			{/if}
		</aside>
	</div>

	{#if states.error}
		<ErrorModule />
	{/if}
</div>
