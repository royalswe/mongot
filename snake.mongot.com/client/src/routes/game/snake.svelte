<script lang="ts">
	import Board from './board.svelte';
	import { send } from '#lib/ws';
	import { useState } from '#lib/stores/state.svelte';
	import CountDown from './countDown.svelte';
	import { markGameInput } from '#lib/gameMessageHandler';
	import { EVENT } from '$server/constants/events';
	import { GAME_STATUS, PLAYER_STATUS } from '$server/constants/status';

	const states = useState();
	let w, h;

	const onKeyDown = (e: KeyboardEvent): void => {
		const target = e.target;
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable ||
				target.closest('input, textarea, select, [contenteditable="true"]'))
		) {
			return;
		}
		if (
			!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key) ||
			states.playerStatus !== PLAYER_STATUS.ready
		) {
			return;
		}
		e.preventDefault();
		markGameInput();
		send(EVENT.movement, { key: e.key });
	};

	function move(key: string) {
		if (states.playerStatus !== PLAYER_STATUS.ready) return;
		markGameInput();
		send(EVENT.movement, { key });
	}
</script>

<div class="snake-layout">
	<div class="snake-playfield" bind:offsetWidth={w} bind:offsetHeight={h}>
		{#if states.gameStatus === GAME_STATUS.countDown}
			<CountDown />
		{/if}
		<Board parentWidth={w} parentHeight={h} />
	</div>
	<div class="touch-controls" role="group" aria-label="Touch movement controls">
		<button
			type="button"
			aria-label="Move up"
			disabled={states.playerStatus !== PLAYER_STATUS.ready}
			onclick={() => move('ArrowUp')}
		>
			<i class="fa fa-chevron-up" aria-hidden="true"></i>
		</button>
		<button
			type="button"
			aria-label="Move left"
			disabled={states.playerStatus !== PLAYER_STATUS.ready}
			onclick={() => move('ArrowLeft')}
		>
			<i class="fa fa-chevron-left" aria-hidden="true"></i>
		</button>
		<span class="touch-center" aria-hidden="true">
			<i class="fa fa-arrows" aria-hidden="true"></i>
		</span>
		<button
			type="button"
			aria-label="Move right"
			disabled={states.playerStatus !== PLAYER_STATUS.ready}
			onclick={() => move('ArrowRight')}
		>
			<i class="fa fa-chevron-right" aria-hidden="true"></i>
		</button>
		<button
			type="button"
			aria-label="Move down"
			disabled={states.playerStatus !== PLAYER_STATUS.ready}
			onclick={() => move('ArrowDown')}
		>
			<i class="fa fa-chevron-down" aria-hidden="true"></i>
		</button>
	</div>
</div>

<svelte:window onkeydown={onKeyDown} />

<style>
	.snake-layout {
		display: flex;
		width: 100%;
		height: 100%;
		min-height: 0;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
	}

	.snake-playfield {
		position: relative;
		display: grid;
		width: 100%;
		min-width: 0;
		min-height: 0;
		flex: 1 1 auto;
		place-items: center;
	}

	:global(canvas) {
		max-width: 100%;
		max-height: 100%;
		border: 3px solid #0a1512;
		box-shadow: 5px 5px 0 #050b09;
	}

	.touch-controls {
		display: none;
		width: min(100%, 15rem);
		grid-template-columns: repeat(3, 1fr);
		grid-template-rows: repeat(3, 3.4rem);
		gap: 0.35rem;
		padding: 0.4rem;
		border: 2px solid var(--line);
		background: var(--ink);
		touch-action: manipulation;
	}

	.touch-controls button {
		display: grid;
		min-width: 3rem;
		min-height: 3rem;
		place-items: center;
		border: 2px solid var(--ink);
		background: var(--lime);
		box-shadow: 2px 2px 0 var(--mint);
		color: var(--ink);
		font-size: 1.2rem;
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
	}

	.touch-controls button:not(:disabled):active {
		transform: translate(2px, 2px);
		box-shadow: none;
	}

	.touch-controls button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.touch-controls .touch-center {
		display: grid;
		grid-column: 2;
		grid-row: 2;
		place-items: center;
		border-color: var(--line);
		background: var(--ink-soft);
		box-shadow: none;
		color: var(--mint);
		cursor: default;
	}

	.touch-controls button:first-child {
		grid-column: 2;
	}

	.touch-controls button:nth-child(2) {
		grid-column: 1;
		grid-row: 2;
	}

	.touch-controls button:nth-child(4) {
		grid-column: 3;
		grid-row: 2;
	}

	.touch-controls button:nth-child(5) {
		grid-column: 2;
		grid-row: 3;
	}

	@media (max-width: 900px), (pointer: coarse) {
		.snake-playfield {
			flex: 1 1 auto;
		}

		.touch-controls {
			display: grid;
		}
	}

	@media (max-width: 900px) {
		.snake-layout {
			gap: 0.4rem;
		}

		.touch-controls {
			width: min(100%, 13rem);
			grid-template-rows: repeat(3, 2.75rem);
			padding: 0.3rem;
		}

		.touch-controls button {
			min-width: 2.7rem;
			min-height: 2.75rem;
		}
	}
</style>
