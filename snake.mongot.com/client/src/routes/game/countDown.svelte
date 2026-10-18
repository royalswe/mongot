<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	let countdown = $state(5);
	let timer: any;

	onMount(() => {
		timer = setInterval(() => {
			countdown -= 1;
			if (countdown === 0) {
				clearInterval(timer);
				timer = null;
			}
		}, 1000);
	});

	onDestroy(() => {
		clearInterval(timer);
	});
</script>

<span>{countdown}</span>

<style>
	span {
		font-size: 100px;
		position: absolute;
		color: #85ba51;
		top: 50%;
		left: 50%;
	}
</style>
