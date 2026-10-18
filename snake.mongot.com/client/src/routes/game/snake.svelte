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
		const availableKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'];
		if (availableKeys.indexOf(e.code) != -1 && states.playerStatus === PLAYER_STATUS.ready) {
			markGameInput();
			send(EVENT.movement, { key: e.code });
		}
	};
</script>

<div class="h-full" bind:offsetWidth={w} bind:offsetHeight={h}>
	{#if states.gameStatus === GAME_STATUS.countDown}
		<CountDown />
	{/if}
	<Board parentWidth={w} parentHeight={h} />
</div>

<svelte:window onkeydown={onKeyDown} />
