<script lang="ts">
	import { useState } from '#lib/stores/state.svelte';

	const states = useState();
	const clearErrors = () => {
		states.error = undefined;
	};
</script>

<div class="overlay">
	<div class="popup">
		<h2>Ouch...</h2>
		<button class="close" type="button" aria-label="Dismiss error" on:click={clearErrors}
			>&times;</button
		>
		<div class="content text-gray-900">
			{states.error}
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		top: 0;
		bottom: 0;
		left: 0;
		right: 0;
		background: rgba(0, 0, 0, 0.7);
		transition: opacity 500ms;
	}

	.popup {
		margin: 70px auto;
		padding: 20px;
		background: #fff;
		border-radius: 5px;
		width: 30%;
		position: relative;
		transition: all 5s ease-in-out;
	}

	.popup h2 {
		margin-top: 0;
		color: #333;
		font-family: Tahoma, Arial, sans-serif;
	}
	.popup .close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		border: 0;
		border-radius: 9999px;
		background: #f3f4f6;
		transition:
			color 200ms,
			background-color 200ms;
		font-size: 24px;
		line-height: 1;
		font-weight: bold;
		text-decoration: none;
		color: #333;
		cursor: pointer;
	}
	.popup .close:hover {
		background: #e5e7eb;
		color: #06d85f;
	}
	.popup .close:focus-visible {
		outline: 2px solid #0ea5e9;
		outline-offset: 2px;
	}
	.popup .content {
		max-height: 30%;
		overflow: auto;
	}

	@media screen and (max-width: 700px) {
		.popup {
			width: 70%;
		}
	}
</style>
