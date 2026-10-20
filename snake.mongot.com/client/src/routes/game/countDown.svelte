<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	let countdown = $state(5);
	let timer: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		timer = setInterval(() => {
			countdown -= 1;
			if (countdown === 0) {
				clearInterval(timer);
				timer = undefined;
			}
		}, 1000);
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
	});
</script>

<div class="countdown" role="status" aria-live="assertive" aria-label={`Starting in ${countdown}`}>
	<p>Get ready</p>
	<strong>{countdown}</strong>
</div>

<style>
	.countdown {
		position: absolute;
		z-index: 1;
		top: 50%;
		left: 50%;
		display: grid;
		width: clamp(7.5rem, 20vw, 10rem);
		aspect-ratio: 1;
		place-content: center;
		border: 4px solid var(--ink);
		background: var(--lime);
		box-shadow: 8px 8px 0 var(--mint);
		color: var(--ink);
		text-align: center;
		transform: translate(-50%, -50%);
		pointer-events: none;
	}

	p {
		margin: 0;
		font-size: 0.65rem;
		font-weight: 1000;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	strong {
		font-size: clamp(3.2rem, 8vw, 5rem);
		font-weight: 1000;
		line-height: 1;
	}
</style>
